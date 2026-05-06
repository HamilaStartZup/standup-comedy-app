import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { config } from '../config/env';
import {
  generatePKCE,
  generateState,
  buildAuthorizationUrl,
  exchangeCodeForTokens,
  refreshAccessToken,
  getUserInfo,
  buildLogoutUrl,
  revokeKeycloakTokens,
  deleteKeycloakUser,
  isKeycloakEnabled,
  verifyIdToken,
} from '../config/keycloak';
import { UserModel } from '../models/User';
import { OAuthStateModel } from '../models/OAuthState';
import { TempAuthCodeModel } from '../models/TempAuthCode';
import { encrypt, decrypt } from '../utils/encryption';
import { getAuthCookieOptions } from '../utils/cookieOptions';

// ══════════════════════════════════════════════════════════
// AMÉLIORATION 5: Liste blanche des redirect URIs autorisées
// ══════════════════════════════════════════════════════════
const ALLOWED_REDIRECT_URI_PATTERNS = [
  /^https:\/\/dev\.connectcomedyclub\.com\/api\/auth\/oauth\/callback$/,
  /^https:\/\/connectcomedyclub\.com\/api\/auth\/oauth\/callback$/,
  /^http:\/\/localhost:\d+\/api\/auth\/oauth\/callback$/,
];

const isValidRedirectUri = (uri: string): boolean => {
  return ALLOWED_REDIRECT_URI_PATTERNS.some(pattern => pattern.test(uri));
};

// ══════════════════════════════════════════════════════════
// AMÉLIORATION 6: Fonctions de masquage pour logs sécurisés
// ══════════════════════════════════════════════════════════

/**
 * Masque partiellement une adresse email pour les logs
 */
const maskEmail = (email: string): string => {
  if (!email || !email.includes('@')) return '***';
  const [local, domain] = email.split('@');
  if (local.length <= 2) return `${local[0]}***@${domain}`;
  return `${local.substring(0, 2)}***@${domain}`;
};

/**
 * Masque un token pour les logs (affiche seulement les 8 premiers caractères)
 */
const maskToken = (token: string): string => {
  if (!token || token.length < 10) return '***';
  return `${token.substring(0, 8)}...`;
};

/**
 * GET /api/auth/oauth/authorize
 * Initiates OAuth 2.1 authorization flow with PKCE
 */
export const authorize = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!isKeycloakEnabled()) {
      res.status(503).json({ error: 'OAuth authentication is not configured' });
      return;
    }

    // Use full API URL including /api for proper Nginx routing
    const redirectUri = `${config.api.url}/auth/oauth/callback`;

    // Validation de sécurité du redirect URI
    if (!isValidRedirectUri(redirectUri)) {
      console.error(`🚫 [OAuth] Invalid redirect URI attempted: ${redirectUri}`);
      res.status(400).json({ error: 'Invalid redirect URI configuration' });
      return;
    }

    // Optional: specify a particular social provider configured in Keycloak
    // via the "provider" query parameter (google, facebook, github, etc.).
    // This is mapped to Keycloak's kc_idp_hint parameter.
    const provider = typeof req.query.provider === 'string'
      ? req.query.provider
      : undefined;

    const userType = typeof req.query.userType === 'string'
      ? req.query.userType
      : undefined;

    const validUserTypes = ['COMEDIAN', 'ORGANIZER', 'SPECTATOR'];
    if (userType && !validUserTypes.includes(userType)) {
      res.status(422).json({ error: 'Invalid userType' });
      return;
    }

    // Generate PKCE challenge
    const { codeVerifier, codeChallenge } = await generatePKCE();
    const state = generateState();
    const nonce = crypto.randomBytes(16).toString('hex'); // Protection replay attacks

    // Store in MongoDB for later verification (TTL: 10 minutes)
    await OAuthStateModel.create({
      state,
      codeVerifier,
      nonce,
      ...(userType && { userType: userType as 'COMEDIAN' | 'ORGANIZER' | 'SPECTATOR' }),
    });

    // Build authorization URL
    const authUrl = await buildAuthorizationUrl(
      redirectUri,
      state,
      codeChallenge,
      'openid profile email',
      provider
    );

    // Ajouter le nonce à l'URL (pour validation dans l'id_token)
    const authUrlWithNonce = new URL(authUrl);
    authUrlWithNonce.searchParams.set('nonce', nonce);

    // Return authorization URL for frontend to redirect
    res.json({
      authorizationUrl: authUrlWithNonce.href,
      state,
    });
  } catch (error: any) {
    console.error('OAuth authorize error:', error);

    // Check if it's a connection error to Keycloak
    if (error.code === 'ECONNREFUSED' || error.cause?.code === 'ECONNREFUSED') {
      res.status(503).json({
        error: 'Keycloak server is not reachable',
        message: 'Please ensure Keycloak is running on ' + config.keycloak.url
      });
      return;
    }

    res.status(500).json({
      error: 'Failed to initiate OAuth flow',
      message: error.message || 'Unknown error'
    });
  }
};

/**
 * GET /api/auth/oauth/callback
 * Handles OAuth callback, exchanges code for tokens
 */
export const callback = async (req: Request, res: Response): Promise<void> => {
  try {
    const { code, state, error, error_description } = req.query;

    // Handle OAuth errors
    if (error) {
      const frontendUrl = `${config.frontend.url}/auth/callback?error=${error}&error_description=${encodeURIComponent(error_description as string || '')}`;
      res.redirect(frontendUrl);
      return;
    }

    if (!code || !state) {
      res.redirect(`${config.frontend.url}/auth/callback?error=invalid_request&error_description=Missing code or state`);
      return;
    }

    // Retrieve and delete pending authorization from MongoDB (atomic operation)
    const pending = await OAuthStateModel.findOneAndDelete({ state: state as string });
    if (!pending) {
      res.redirect(`${config.frontend.url}/auth/callback?error=invalid_state&error_description=State mismatch or expired`);
      return;
    }

    // Build redirect_uri for token exchange - must EXACTLY match the one used in authorize
    const redirectUri = `${config.api.url}/auth/oauth/callback`;

    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(
      code as string,
      redirectUri,
      pending.codeVerifier
    );

    // Validate ID token signature via JWKS (protection against token tampering)
    if (tokens.id_token) {
      try {
        await verifyIdToken(tokens.id_token, pending.nonce);
      } catch (idTokenError: any) {
        console.error('❌ [OAuth] ID token validation failed:', idTokenError.message);
        await revokeKeycloakTokens(tokens.access_token, tokens.refresh_token);
        res.redirect(`${config.frontend.url}/auth/callback?error=invalid_id_token&error_description=${encodeURIComponent('ID token validation failed')}`);
        return;
      }
    }

    // Get user info from Keycloak
    const userInfo = await getUserInfo(tokens.access_token);
    if (!userInfo) {
      // tokens were exchanged but userinfo failed — revoke to close the Keycloak session
      await revokeKeycloakTokens(tokens.access_token, tokens.refresh_token);
      res.redirect(`${config.frontend.url}/auth/callback?error=userinfo_failed&error_description=Failed to get user info`);
      return;
    }

    // Find user: prefer keycloakId (sub) for precision, fallback on email for account linking
    let user = await UserModel.findOne({ keycloakId: userInfo.sub });
    if (!user && userInfo.email) {
      user = await UserModel.findOne({ email: userInfo.email });
    }

    if (!user) {
      if (pending.userType) {
        // Inscription via social auth : NE PAS créer le compte maintenant.
        // Stocker les infos dans un code temporaire ; le compte sera créé
        // seulement quand l'utilisateur aura rempli et soumis le formulaire.
        const nameParts = (userInfo.name || '').split(' ').filter(Boolean);
        const firstName = userInfo.given_name || nameParts[0] || userInfo.email.split('@')[0] || '';
        const lastName = userInfo.family_name || nameParts.slice(1).join(' ') || '';

        // Supprimer immédiatement la session Keycloak pour éviter les comptes orphelins
        // si l'utilisateur quitte le formulaire sans le compléter.
        // Keycloak recréera le compte lors de la prochaine authentification.
        try {
          await revokeKeycloakTokens(tokens.access_token, tokens.refresh_token);
          await deleteKeycloakUser(userInfo.sub);
          console.log(`🧹 [OAuth] Session Keycloak nettoyée pour inscription en attente: ${maskEmail(userInfo.email)}`);
        } catch (cleanupErr) {
          console.warn(`⚠️ [OAuth] Échec nettoyage Keycloak (non bloquant): ${cleanupErr}`);
        }

        const tempCode = crypto.randomBytes(32).toString('hex');
        await TempAuthCodeModel.create({
          code: tempCode,
          pendingRegistration: true,
          email: userInfo.email,
          firstName,
          lastName,
          userType: pending.userType,
          // On ne stocke plus les tokens Keycloak : la session a été révoquée.
        });

        console.log(`⏳ [OAuth] Inscription en attente de formulaire pour ${maskEmail(userInfo.email)} (${pending.userType})`);
        const callbackUrl = `${config.frontend.url}/auth/callback?code=${tempCode}`;
        res.redirect(callbackUrl);
        return;
      } else {
        // Connexion sans compte existant et sans userType → refuser
        // On révoque les tokens mais on NE supprime PAS le compte Keycloak :
        // l'utilisateur peut vouloir s'inscrire juste après, auquel cas le même
        // compte Keycloak sera réutilisé sans avoir à refaire un flux OAuth complet.
        console.log(`⚠️ [OAuth] Tentative de connexion sans compte existant: ${maskEmail(userInfo.email)}`);
        await revokeKeycloakTokens(tokens.access_token, tokens.refresh_token);
        res.redirect(`${config.frontend.url}/auth/callback?error=account_not_found&error_description=${encodeURIComponent('Aucun compte trouvé. Veuillez d\'abord créer un compte.')}`);
        return;
      }
    } else {
      // User exists - associate Keycloak ID if not already set (account linking)
      // This handles the case where a user registered via email and later signs in via OAuth
      if (!user.keycloakId) {
        user.keycloakId = userInfo.sub;
        await user.save();
        console.log(`✅ [OAuth] Compte existant associé à Keycloak: ${maskEmail(user.email)}`);
      } else if (user.keycloakId !== userInfo.sub) {
        // Le sub Keycloak a changé — typiquement parce que l'utilisateur Keycloak a été supprimé
        // et recréé (ex: reset admin). On fait confiance à l'email vérifié par le provider OAuth
        // (Google / Facebook) pour relier le nouveau sub au compte existant.
        console.warn(`⚠️ [OAuth] Keycloak sub mis à jour pour ${maskEmail(user.email)}: ${maskToken(user.keycloakId!)} → ${maskToken(userInfo.sub)}`);
        user.keycloakId = userInfo.sub;
        await user.save();
      }
    }

    // Generate our own JWT for internal use
    const internalToken = jwt.sign(
      {
        id: user._id,
        email: user.email,
        role: user.role,
        keycloakId: userInfo.sub,
      },
      config.jwt.secret as string,
      { expiresIn: '1h' }
    );

    // Store JWT in HttpOnly cookie — never exposed to JS
    res.cookie('auth_token', internalToken, {
      ...getAuthCookieOptions(),
      maxAge: 60 * 60 * 1000, // 1 hour
    });

    // Store Keycloak tokens in a temp code for the frontend to retrieve via POST
    // (access_token and refresh_token are kept server-side exchange only)
    const tempCode = crypto.randomBytes(32).toString('hex');

    await TempAuthCodeModel.create({
      code: tempCode,
      token: internalToken,
      accessToken: encrypt(tokens.access_token),
      refreshToken: tokens.refresh_token ? encrypt(tokens.refresh_token) : undefined,
      idToken: tokens.id_token ? encrypt(tokens.id_token) : undefined,
    });

    // Rediriger avec seulement le code temporaire (pas les tokens dans l'URL)
    const callbackUrl = `${config.frontend.url}/auth/callback?code=${tempCode}`;
    res.redirect(callbackUrl);
  } catch (error: any) {
    console.error('OAuth callback error:', error?.message || error);
    if (error?.name === 'ValidationError') {
      console.error('Mongoose validation errors:', JSON.stringify(error.errors, null, 2));
    }
    res.redirect(`${config.frontend.url}/auth/callback?error=auth_failed&error_description=${encodeURIComponent('Une erreur est survenue lors de l\'authentification. Veuillez réessayer.')}`);
  }
};

/**
 * POST /api/auth/oauth/refresh
 * Refreshes the access token using refresh token
 */
export const refresh = async (req: Request, res: Response): Promise<void> => {
  try {
    const { refresh_token } = req.body;

    if (!refresh_token) {
      res.status(400).json({ error: 'Refresh token is required' });
      return;
    }

    const tokens = await refreshAccessToken(refresh_token);

    // Refresh Token Rotation: revoke the old refresh token after getting a new one
    // This ensures the old token cannot be reused (prevents token theft replay)
    try {
      await revokeKeycloakTokens(refresh_token);
    } catch (revokeError) {
      // Non-blocking — new tokens are valid regardless
      console.warn('⚠️ [OAuth] Failed to revoke old refresh token:', revokeError);
    }

    res.json({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_in: tokens.expires_in,
    });
  } catch (error) {
    console.error('OAuth refresh error:', error);
    res.status(401).json({ error: 'Failed to refresh token' });
  }
};

/**
 * POST /api/auth/oauth/logout
 * Logs out user from Keycloak
 */
export const logout = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id_token } = req.body;
    const postLogoutRedirectUri = `${config.frontend.url}`;

    const logoutUrl = await buildLogoutUrl(id_token, postLogoutRedirectUri);

    // Clear the HttpOnly JWT cookie on logout
    res.clearCookie('auth_token', getAuthCookieOptions());

    res.json({ logoutUrl });
  } catch (error) {
    console.error('OAuth logout error:', error);
    res.status(500).json({ error: 'Failed to build logout URL' });
  }
};

/**
 * POST /api/auth/oauth/exchange
 * Échange un code temporaire contre les tokens (login) ou les infos d'inscription (inscription)
 */
export const exchange = async (req: Request, res: Response): Promise<void> => {
  try {
    const { code } = req.body;

    if (!code) {
      res.status(400).json({ error: 'Code is required' });
      return;
    }

    // Chercher le code sans le supprimer d'abord
    const tempAuth = await TempAuthCodeModel.findOne({ code });

    if (!tempAuth) {
      res.status(400).json({ error: 'Invalid or expired code' });
      return;
    }

    // Inscription en attente : renvoyer les infos sans supprimer (sera supprimé par complete-registration)
    if (tempAuth.pendingRegistration) {
      res.json({
        pendingRegistration: true,
        pendingCode: code,
        email: tempAuth.email,
        firstName: tempAuth.firstName,
        lastName: tempAuth.lastName,
        userType: tempAuth.userType,
      });
      return;
    }

    // Flux de connexion normal : supprimer le code (usage unique) et retourner les tokens
    await TempAuthCodeModel.deleteOne({ code });

    // Set JWT in HttpOnly cookie — consistent with the cookie set during callback redirect
    if (tempAuth.token) {
      res.cookie('auth_token', tempAuth.token, {
        ...getAuthCookieOptions(),
        maxAge: 60 * 60 * 1000,
      });
    }

    res.json({
      access_token: tempAuth.accessToken ? decrypt(tempAuth.accessToken) : undefined,
      refresh_token: tempAuth.refreshToken ? decrypt(tempAuth.refreshToken) : undefined,
      id_token: tempAuth.idToken ? decrypt(tempAuth.idToken) : undefined,
    });
  } catch (error) {
    console.error('OAuth exchange error:', error);
    res.status(500).json({ error: 'Failed to exchange code' });
  }
};

/**
 * POST /api/auth/oauth/complete-registration
 * Finalise l'inscription OAuth après que l'utilisateur a rempli le formulaire.
 * Crée le compte et retourne un JWT.
 */
export const completeRegistration = async (req: Request, res: Response): Promise<void> => {
  try {
    const { pendingCode, phone, city, birthDate, bio, experience, consent, firstName: bodyFirstName, lastName: bodyLastName } = req.body;

    if (!pendingCode) {
      res.status(400).json({ error: 'pendingCode is required' });
      return;
    }

    // Récupérer et supprimer le code d'inscription en attente
    const tempAuth = await TempAuthCodeModel.findOneAndDelete({ code: pendingCode, pendingRegistration: true });

    if (!tempAuth) {
      res.status(400).json({ error: 'Code d\'inscription invalide ou expiré. Veuillez recommencer.' });
      return;
    }

    // Vérifier que l'email n'est pas déjà utilisé (cas de double soumission)
    const existing = await UserModel.findOne({ email: tempAuth.email });
    if (existing) {
      // Compte déjà créé (double soumission ou compte email existant) — générer un JWT
      console.log(`ℹ️ [OAuth] Compte déjà existant pour ${maskEmail(tempAuth.email!)}, liaison Keycloak`);
      if (!existing.keycloakId) {
        existing.keycloakId = tempAuth.keycloakId;
        await existing.save();
      }
      const internalToken = jwt.sign(
        { id: existing._id, email: existing.email, role: existing.role, keycloakId: existing.keycloakId },
        config.jwt.secret as string,
        { expiresIn: '1h' }
      );
      res.cookie('auth_token', internalToken, {
        ...getAuthCookieOptions(),
        maxAge: 60 * 60 * 1000,
      });
      const fullExistingUser = await UserModel.findById(existing._id).select('-password').lean();
      res.json({ user: fullExistingUser });
      return;
    }

    // Construire les données de création selon le rôle
    // Note: pas de keycloakId ici — la session Keycloak a été supprimée lors du callback.
    // Le lien Keycloak sera établi lors de la première connexion OAuth post-inscription.
    const userData: any = {
      email: tempAuth.email,
      firstName: bodyFirstName?.trim() || tempAuth.firstName,
      lastName: bodyLastName?.trim() || tempAuth.lastName,
      role: tempAuth.userType,
      password: crypto.randomBytes(32).toString('hex'),
      consent: {
        termsAccepted: consent?.termsAccepted ?? true,
        privacyAccepted: consent?.privacyAccepted ?? true,
        isAdult: consent?.isAdult ?? true,
      },
    };

    if (phone) userData.phone = phone;
    if (city) userData.city = city;
    if (birthDate) userData.birthDate = new Date(birthDate);

    if (tempAuth.userType === 'COMEDIAN' && (bio || experience !== undefined)) {
      userData.profile = {};
      if (bio) userData.profile.bio = bio;
      if (experience !== undefined) userData.profile.experience = Number(experience);
    }

    if (tempAuth.userType === 'ORGANIZER') {
      userData.organizerProfile = {
        companyName: '',
        description: '',
        website: '',
        venueTypes: [],
        eventFrequency: 'monthly',
        location: {
          venue: '',
          address: '',
          city: city || '',
          country: '',
        },
        phone: phone || '',
      };
    }

    console.log(`🔍 [OAuth] userData avant create:`, JSON.stringify({ ...userData, password: '***' }, null, 2));
    const user = await UserModel.create(userData);
    console.log(`✅ [OAuth] Nouveau compte créé après formulaire: ${maskEmail(user.email)} (${tempAuth.userType})`);
    console.log(`🔍 [OAuth] organizerProfile sauvegardé:`, JSON.stringify(user.organizerProfile, null, 2));

    const internalToken = jwt.sign(
      { id: user._id, email: user.email, role: user.role },
      config.jwt.secret as string,
      { expiresIn: '1h' }
    );

    res.cookie('auth_token', internalToken, {
      ...getAuthCookieOptions(),
      maxAge: 60 * 60 * 1000,
    });

    const fullUser = await UserModel.findById(user._id).select('-password').lean();

    res.json({ user: fullUser });
  } catch (error: any) {
    console.error('OAuth complete-registration error:', error?.message || error);
    if (error?.name === 'ValidationError') {
      console.error('Mongoose validation errors:', JSON.stringify(error.errors, null, 2));
    }
    res.status(500).json({ error: 'Erreur lors de la création du compte', details: error.message });
  }
};

/**
 * GET /api/auth/oauth/status
 * Returns OAuth configuration status
 */
export const status = async (_req: Request, res: Response): Promise<void> => {
  res.json({
    enabled: isKeycloakEnabled(),
    provider: 'keycloak',
  });
};