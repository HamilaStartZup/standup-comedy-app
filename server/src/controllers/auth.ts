import { Request, Response } from 'express';
import jwt, { SignOptions } from 'jsonwebtoken';
import crypto from 'crypto';
import mongoose, { Types } from 'mongoose';
import { UserModel } from '../models/User';
import { PasswordResetRequestModel } from '../models/PasswordResetRequest';
import { config } from '../config/env';
import { AuthRequest } from '../middleware/auth';
import { deleteUserAndData } from './users';
import sgMail from '@sendgrid/mail';
import { emitUserRegistered, emitPasswordReset } from '../services/eventEmitter';
import { getAuthCookieOptions, AUTH_COOKIE_MAX_AGE } from '../utils/cookieOptions';
import { getSuperAdminIds } from '../utils/superAdminCache';
import { parsePaginationWithDefaults, buildPaginationResult } from '../utils/pagination';

/**
 * POST /api/auth/logout
 * Clears the HttpOnly auth_token cookie (works for email/password and OAuth sessions)
 */
export const logoutClassic = async (_req: Request, res: Response) => {
  res.clearCookie('auth_token', getAuthCookieOptions());
  res.status(204).send();
};

export const register = async (req: Request, res: Response) => {
  try {
    const { email, phone, password, firstName, lastName, role, city, birthDate, profile: profileData, consent } = req.body;

    if (role === 'SUPER_ADMIN') {
      return res.status(403).json({ message: 'Ce rôle ne peut pas être obtenu par inscription' });
    }

    // Téléphone obligatoire pour humoristes, organisateurs et lieux
    if ((role === 'COMEDIAN' || role === 'ORGANIZER' || role === 'LIEU') && (!phone || typeof phone !== 'string' || !phone.trim())) {
      return res.status(400).json({ message: 'Le numéro de téléphone est requis' });
    }

    // La vérification SMS n'est plus requise à l'inscription.

    // Vérifier si l'utilisateur existe déjà
    const existingUser = await UserModel.findOne({ email });
    if (existingUser) {
      return res.status(409).json({
        message: 'Email déjà utilisé'
      });
    }

    // Créer le profil utilisateur en fonction du rôle
    let profile;
    if (role === 'COMEDIAN') {
      const experienceValue = profileData?.experience !== undefined 
        ? (typeof profileData.experience === 'string' ? parseInt(profileData.experience, 10) : profileData.experience)
        : 0;
      
      profile = {
        bio: profileData?.bio || '',
        experience: experienceValue,
        speciality: '',
        socialLinks: {},
        performances: [],
        numberOfScenes: '0-50' as const, // Doit être une string avec enum ['0-50', '50-200', '200+']
        comedyStyle: [],
        performanceLanguages: [],
      };
      console.log('📝 [REGISTER] Profil créé pour COMEDIAN:', profile);
    } else {
      profile = undefined;
    }

    const organizerProfile = role === 'ORGANIZER' ? {
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
    } : undefined;

    const lieuProfile = role === 'LIEU' ? {
      companyName: '',
      description: '',
      website: '',
      socialLinks: {},
      contactName: firstName && lastName ? `${firstName} ${lastName}` : '',
      contactEmail: email || '',
      phone: phone || '',
      legalStatus: '',
      siret: '',
      invoicingAvailable: false,
    } : undefined;

    // Créer un nouvel utilisateur
    const userData: any = {
      email,
      phone: phone || '',
      password,
      firstName,
      lastName,
      role,
      city: city || '',
      ...(birthDate && { birthDate: new Date(birthDate) }),
      // Enregistrement du consentement RGPD
      consent: {
        termsAccepted: consent?.termsAccepted || false,
        termsAcceptedAt: consent?.termsAccepted ? new Date() : undefined,
        termsVersion: '1.0',
        privacyAccepted: consent?.privacyAccepted || false,
        privacyAcceptedAt: consent?.privacyAccepted ? new Date() : undefined,
        privacyVersion: '1.0',
        isAdult: consent?.isAdult || false,
      },
    };

    if (profile) {
      userData.profile = profile;
    }
    if (organizerProfile) {
      userData.organizerProfile = organizerProfile;
    }
    if (lieuProfile) {
      userData.lieuProfile = lieuProfile;
    }

    const user = new UserModel(userData);

    try {
      await user.save();
      console.log('✅ [REGISTER] Utilisateur sauvegardé avec succès:', user._id);
    } catch (saveError: any) {
      console.error('❌ [REGISTER] Erreur lors de la sauvegarde:', saveError);
      if (saveError.errors) {
        console.error('❌ [REGISTER] Détails des erreurs de validation:', saveError.errors);
      }
      throw saveError;
    }

    // Émettre un évènement SSE ciblé aux Super Admins uniquement
    getSuperAdminIds().then(adminIds => {
      if (adminIds.length > 0) emitUserRegistered(user._id.toString(), adminIds);
    }).catch(err => console.error('Erreur émission SSE USER_REGISTERED aux superAdmins:', err));

    // Générer le token JWT
    if (!config.jwt.secret) {
      return res.status(500).json({
        message: 'Erreur de configuration du serveur'
      });
    }

    const tokenOptions: SignOptions = { expiresIn: '24h' };
    const token = jwt.sign(
      { id: user._id, email: user.email, role: user.role },
      config.jwt.secret as string,
      tokenOptions
    );

    // Formater la réponse en fonction du rôle
    const userResponse: any = {
      id: user._id,
      email: user.email,
      phone: user.phone,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      city: user.city,
    };

    if (role === 'COMEDIAN' && user.profile) {
      userResponse.profile = user.profile;
    } else if (role === 'ORGANIZER' && user.organizerProfile) {
      userResponse.organizerProfile = user.organizerProfile;
    } else if (role === 'LIEU' && user.lieuProfile) {
      userResponse.lieuProfile = user.lieuProfile;
    }

    res.cookie('auth_token', token, {
      ...getAuthCookieOptions(),
      maxAge: AUTH_COOKIE_MAX_AGE,
    });

    res.status(201).json({
      message: 'Utilisateur enregistré avec succès',
      token,
      user: userResponse
    });
  } catch (error) {
    console.error('❌ [REGISTER] Erreur lors de l\'enregistrement:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
    const errorStack = error instanceof Error ? error.stack : undefined;

    // Logs détaillés pour le debugging
    console.error('❌ [REGISTER] Détails de l\'erreur:', {
      errorMessage,
      errorStack,
      errorName: error instanceof Error ? error.name : 'Unknown',
      body: JSON.stringify(req.body, null, 2)
    });

    // Si c'est une erreur de validation Mongoose, donner plus de détails
    if (error && typeof error === 'object' && 'errors' in error) {
      const mongooseError = error as any;
      console.error('❌ [REGISTER] Erreurs de validation Mongoose:', mongooseError.errors);
      return res.status(400).json({
        message: 'Erreur de validation des données',
        errors: Object.keys(mongooseError.errors || {}).map(key => ({
          field: key,
          message: mongooseError.errors[key]?.message || 'Erreur de validation'
        }))
      });
    }

    res.status(500).json({
      message: 'Erreur lors de l\'enregistrement de l\'utilisateur',
      error: process.env.NODE_ENV === 'production' ? 'Erreur serveur' : errorMessage // Cacher les détails en production
    });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    // Trouver l'utilisateur par email
    const user = await UserModel.findOne({ email })
      .select('+password')
      .populate('profile')
      .populate('organizerProfile');

    // Si l'utilisateur n'existe pas ou le mot de passe est invalide,
    // renvoyer le même message pour ne pas révéler si l'email existe
    if (!user) {
      return res.status(401).json({
        message: 'Email ou mot de passe incorrect'
      });
    }

    // Vérifier le mot de passe
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({
        message: 'Email ou mot de passe incorrect'
      });
    }

    // Vérifier si le compte est désactivé
    if ((user as any).isActive === false) {
      const deactivatedAt = (user as any).deactivatedAt;
      const deactivationReason = (user as any).deactivationReason;

      // Vérifier si c'est une demande de suppression RGPD (grace period actif)
      if (deactivationReason?.includes('RGPD') && deactivatedAt) {
        const daysSinceDeactivation = Math.floor((Date.now() - deactivatedAt.getTime()) / (1000 * 60 * 60 * 24));
        const daysRemaining = 30 - daysSinceDeactivation;

        if (daysRemaining > 0) {
          // Le compte peut encore être réactivé
          return res.status(403).json({
            code: 'ACCOUNT_PENDING_DELETION',
            message: 'Votre compte est en cours de suppression',
            canReactivate: true,
            deactivatedAt: deactivatedAt.toISOString(),
            daysRemaining,
            deletionDate: new Date(deactivatedAt.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString()
          });
        }
      }

      // Compte désactivé par un admin ou grace period expiré
      return res.status(403).json({
        code: 'ACCOUNT_DEACTIVATED',
        message: 'Votre compte a été désactivé. Veuillez contacter le support.'
      });
    }

    // Générer le token JWT
    if (!config.jwt.secret) {
      return res.status(500).json({
        message: 'Erreur de configuration du serveur'
      });
    }

    const tokenOptions: SignOptions = { expiresIn: '24h' };
    const token = jwt.sign(
      { id: user._id, email: user.email, role: user.role },
      config.jwt.secret as string,
      tokenOptions
    );

    // Formater la réponse en fonction du rôle
    const userResponse: any = {
      id: user._id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
    };

    if (user.role === 'COMEDIAN' && user.profile) {
      userResponse.profile = user.profile;
    } else if (user.role === 'ORGANIZER' && user.organizerProfile) {
      userResponse.organizerProfile = user.organizerProfile;
    } else if (user.role === 'LIEU' && user.lieuProfile) {
      userResponse.lieuProfile = user.lieuProfile;
    }

    res.cookie('auth_token', token, {
      ...getAuthCookieOptions(),
      maxAge: AUTH_COOKIE_MAX_AGE,
    });

    res.status(200).json({
      message: 'Connexion réussie',
      token,
      user: userResponse
    });
  } catch (error) {
    console.error('Erreur lors de la connexion:', error);
    res.status(500).json({ message: 'Erreur lors de la connexion' });
  }
};

/**
 * Réactive un compte en cours de suppression (grace period RGPD)
 * L'utilisateur doit fournir son email et mot de passe pour confirmer
 */
export const reactivateAccount = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    const user = await UserModel.findOne({ email }).select('+password');

    if (!user) {
      return res.status(401).json({
        message: 'Email ou mot de passe incorrect'
      });
    }

    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({
        message: 'Email ou mot de passe incorrect'
      });
    }

    // Vérifier que le compte est bien en attente de suppression RGPD
    if ((user as any).isActive !== false) {
      return res.status(422).json({
        message: 'Ce compte est déjà actif'
      });
    }

    const deactivationReason = (user as any).deactivationReason;
    if (!deactivationReason?.includes('RGPD')) {
      return res.status(403).json({
        message: 'Ce compte a été désactivé par un administrateur. Veuillez contacter le support.'
      });
    }

    // Vérifier que le grace period n'est pas expiré
    const deactivatedAt = (user as any).deactivatedAt;
    if (deactivatedAt) {
      const daysSinceDeactivation = Math.floor((Date.now() - deactivatedAt.getTime()) / (1000 * 60 * 60 * 24));
      if (daysSinceDeactivation >= 30) {
        return res.status(403).json({
          message: 'Le délai de réactivation de 30 jours est expiré. Votre compte a été supprimé.'
        });
      }
    }

    // Réactiver le compte
    (user as any).isActive = true;
    (user as any).deactivatedAt = undefined;
    (user as any).deactivatedBy = undefined;
    (user as any).deactivationReason = undefined;

    await user.save();

    console.log(`✅ [reactivateAccount] Compte ${user.email} réactivé avec succès`);

    // Retourner un message de succès (l'utilisateur devra se reconnecter)
    res.status(200).json({
      message: 'Votre compte a été réactivé avec succès. Vous pouvez maintenant vous connecter.',
      reactivated: true
    });
  } catch (error) {
    console.error('Erreur lors de la réactivation:', error);
    res.status(500).json({ message: 'Erreur lors de la réactivation du compte' });
  }
};

export const getProfile = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({
        message: 'Utilisateur non authentifié'
      });
    }

    // Récupérer l'utilisateur avec tous les profils
    const user = await UserModel.findById(userId)
      .select('-password')
      .populate('profile')
      .populate('organizerProfile');

    if (!user) {
      return res.status(404).json({
        message: 'Utilisateur non trouvé'
      });
    }

    // Construire la réponse en fonction du rôle
    const userResponse: any = {
      id: user._id,
      email: user.email,
      phone: user.phone,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      city: user.city,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };

    if (user.role === 'COMEDIAN' && user.profile) {
      userResponse.profile = user.profile;
      userResponse.stats = user.stats || {
        applicationsCount: 0,
        acceptedCount: 0,
        rejectedCount: 0,
        performanceCount: 0,
      };
    } else if (user.role === 'ORGANIZER' && user.organizerProfile) {
      userResponse.organizerProfile = user.organizerProfile;
      userResponse.stats = user.stats || {
        eventsCreated: 0,
        totalApplications: 0,
        totalApplicants: 0,
        acceptedApplications: 0,
      };
    } else if (user.role === 'LIEU' && user.lieuProfile) {
      userResponse.lieuProfile = user.lieuProfile;
    } else if (user.role === 'SUPER_ADMIN') {
      userResponse.stats = user.stats;
    }

    res.status(200).json(userResponse);
  } catch (error) {
    console.error('Erreur lors de la récupération du profil:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération du profil' });
  }
};

export const getAllUsers = async (req: Request, res: Response) => {
  try {
    const userRole = (req as any).user?.role;
    if (userRole !== 'SUPER_ADMIN') {
      return res.status(403).json({ message: 'Seuls les super administrateurs peuvent accéder à cette ressource' });
    }

    const { role, search } = req.query as Record<string, string | undefined>;
    const { page, limit, skip } = parsePaginationWithDefaults(req.query as Record<string, unknown>, 10, 100);

    const filter: Record<string, unknown> = { role: { $in: ['COMEDIAN', 'ORGANIZER'] } };
    if (role && ['COMEDIAN', 'ORGANIZER'].includes(role)) {
      filter.role = role;
    }
    if (search && typeof search === 'string' && search.trim()) {
      const escaped = search.trim().slice(0, 80).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(escaped, 'i');
      filter.$or = [{ firstName: re }, { lastName: re }, { email: re }];
    }

    const [users, total] = await Promise.all([
      UserModel.find(filter)
        .select('firstName lastName email phone role city createdAt stats profile organizerProfile isActive deactivatedAt deactivationReason')
        .populate('profile')
        .populate('organizerProfile')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      UserModel.countDocuments(filter),
    ]);

    const formattedUsers = (users as any[]).map(user => {
      const baseData = {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.role === 'ORGANIZER' ? (user.organizerProfile?.phone || null) : (user.phone || null),
        role: user.role,
        city: user.role === 'ORGANIZER'
          ? (user.organizerProfile?.location?.city || user.city || null)
          : (user.city || null),
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        stats: user.stats || {},
        isActive: user.isActive !== false,
        deactivatedAt: user.deactivatedAt || null,
        deactivationReason: user.deactivationReason || null,
      };
      if (user.role === 'COMEDIAN' && user.profile) {
        return { ...baseData, bio: user.profile.bio || '', experience: user.profile.experience || 0, numberOfScenes: user.profile.numberOfScenes || '0-50' };
      }
      if (user.role === 'ORGANIZER' && user.organizerProfile) {
        return { ...baseData, companyName: user.organizerProfile.companyName || null, description: user.organizerProfile.description || null, website: user.organizerProfile.website || null };
      }
      return baseData;
    });

    res.status(200).json({
      success: true,
      users: formattedUsers,
      pagination: buildPaginationResult({ page, limit }, total),
    });
  } catch (error) {
    console.error('Erreur getAllUsers:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération des utilisateurs' });
  }
};

// ============================================================================
// FORGOT PASSWORD - Demander une réinitialisation
// ============================================================================
export const forgotPassword = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: 'Email requis' });
    }

    // Trouver l'utilisateur
    const user = await UserModel.findOne({ email: email.toLowerCase() });
    
    // Pour la sécurité, on ne révèle pas si l'email existe ou non
    if (!user) {
      return res.status(200).json({
        message: 'Si cet email existe, un lien de réinitialisation a été envoyé'
      });
    }

    // Générer un token de réinitialisation
    const resetToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 3600000); // 1 heure

    // Créer ou mettre à jour la demande de réinitialisation
    await PasswordResetRequestModel.findOneAndUpdate(
      { userId: user._id, status: 'pending' },
      {
        userId: user._id,
        email: user.email,
        resetToken,
        expiresAt,
        requestedAt: new Date(),
        status: 'pending'
      },
      { upsert: true, new: true }
    );

    // Envoyer l'email de réinitialisation à l'utilisateur
    const resetUrl = `${config.frontend.url}/reset-password?token=${resetToken}`;
    
    sgMail.setApiKey(config.email.smtpPass);
    await sgMail.send({
      from: {
        email: config.email.smtpUser || '',
        name: 'Connect Comedy Club'
      },
      to: user.email,
      subject: 'Réinitialisation de votre mot de passe',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
          <div style="background-color: #fff; border-radius: 10px; padding: 30px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            <h2 style="color: #7c3aed; margin-bottom: 20px;">🔐 Réinitialisation de mot de passe</h2>
            <p>Bonjour ${user.firstName},</p>
            <p>Vous avez demandé à réinitialiser votre mot de passe.</p>
            <p>Cliquez sur le bouton ci-dessous pour créer un nouveau mot de passe :</p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetUrl}" style="display: inline-block; padding: 15px 30px; background: var(--ccc-accent-gradient); color: white; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
                Réinitialiser mon mot de passe
              </a>
            </div>
            
            <p style="color: #666; font-size: 0.9em; margin-top: 20px;">
              <strong>⚠️ Important :</strong> Ce lien expire dans 1 heure. Si vous n'avez pas demandé cette réinitialisation, ignorez cet email.
            </p>
            
            <p style="color: #999; font-size: 0.85em; margin-top: 30px; border-top: 1px solid #eee; padding-top: 20px;">
              Si le bouton ne fonctionne pas, copiez et collez ce lien dans votre navigateur :<br/>
              <span style="word-break: break-all; color: #7c3aed;">${resetUrl}</span>
            </p>
            
            <p style="margin-top: 30px; color: #666; font-size: 0.9em;">
              Cordialement,<br/>
              L'équipe Connect Comedy Club
            </p>
          </div>
        </div>
      `,
      text: `Bonjour ${user.firstName},\n\nVous avez demandé à réinitialiser votre mot de passe.\n\nCliquez sur ce lien pour créer un nouveau mot de passe : ${resetUrl}\n\nCe lien expire dans 1 heure.\n\nSi vous n'avez pas demandé cette réinitialisation, ignorez cet email.\n\nCordialement,\nL'équipe Connect Comedy Club`
    });

    console.log(`✅ Email de réinitialisation envoyé à ${user.email}`);

    res.status(200).json({
      message: 'Si cet email existe, un lien de réinitialisation a été envoyé à votre adresse email.'
    });
  } catch (error) {
    console.error('Erreur lors de la demande de réinitialisation:', error);
    res.status(500).json({ message: 'Erreur lors de la demande de réinitialisation' });
  }
};

// ============================================================================
// RESET PASSWORD - Réinitialiser avec un token
// ============================================================================
export const resetPassword = async (req: Request, res: Response) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({ message: 'Token et nouveau mot de passe requis' });
    }

    if (password.length < 8) {
      return res.status(400).json({ message: 'Le mot de passe doit contenir au moins 8 caractères' });
    }

    // Trouver la demande de réinitialisation
    const resetRequest = await PasswordResetRequestModel.findOne({
      resetToken: token,
      status: 'pending'
    });

    if (!resetRequest || resetRequest.expiresAt < new Date()) {
      return res.status(400).json({ message: 'Token invalide ou expiré' });
    }

    // Trouver l'utilisateur
    const user = await UserModel.findById(resetRequest.userId);
    if (!user) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }

    // Mettre à jour le mot de passe
    user.password = password;
    await user.save();

    // Marquer la demande comme complétée
    resetRequest.status = 'completed';
    resetRequest.completedAt = new Date();
    await resetRequest.save();

    emitPasswordReset(user._id.toString());

    res.status(200).json({
      message: 'Mot de passe réinitialisé avec succès'
    });
  } catch (error) {
    console.error('Erreur lors de la réinitialisation:', error);
    res.status(500).json({ message: 'Erreur lors de la réinitialisation du mot de passe' });
  }
};

// ============================================================================
// GET PASSWORD RESET REQUESTS - Pour Super Admin
// ============================================================================
export const getPasswordResetRequests = async (req: AuthRequest, res: Response) => {
  try {
    if (req.user?.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ message: 'Accès refusé' });
    }

    const requests = await PasswordResetRequestModel.find({
      status: 'pending'
    })
      .populate('userId', 'firstName lastName email role')
      .populate('requestedBy', 'firstName lastName email')
      .populate('completedBy', 'firstName lastName email')
      .sort({ requestedAt: -1 });

    res.status(200).json({
      success: true,
      count: requests.length,
      requests: requests.map(req => ({
        id: req._id,
        userId: req.userId,
        email: req.email,
        requestedAt: req.requestedAt,
        expiresAt: req.expiresAt,
        requestedBy: req.requestedBy,
        // Renseigné dès qu'un admin a envoyé le lien : le front l'utilise pour
        // afficher « lien envoyé » et proposer « Renvoyer » plutôt que « Envoyer ».
        completedBy: req.completedBy,
        status: req.status
      }))
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des demandes:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération des demandes' });
  }
};

// ============================================================================
// ADMIN RESET PASSWORD - Super Admin réinitialise le mot de passe
// ============================================================================
export const adminResetPassword = async (req: AuthRequest, res: Response) => {
  try {
    if (req.user?.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ message: 'Accès refusé' });
    }

    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ message: 'userId requis' });
    }

    // Trouver l'utilisateur
    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }

    // Générer un lien de réinitialisation à usage unique plutôt que de choisir
    // le mot de passe à la place de l'utilisateur (jamais de mot de passe en clair par email)
    const resetToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 3600000); // 1 heure

    await PasswordResetRequestModel.findOneAndUpdate(
      { userId: user._id, status: 'pending' },
      {
        userId: user._id,
        email: user.email,
        resetToken,
        expiresAt,
        requestedAt: new Date(),
        status: 'pending',
        completedBy: req.user.id,
      },
      { upsert: true }
    );

    const resetUrl = `${config.frontend.url}/reset-password?token=${resetToken}`;

    try {
      sgMail.setApiKey(config.email.smtpPass);
      await sgMail.send({
        from: {
          email: config.email.smtpUser || '',
          name: 'Connect Comedy Club'
        },
        to: user.email,
        subject: '🔐 Réinitialisation de votre mot de passe',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
            <div style="background-color: #fff; border-radius: 10px; padding: 30px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
              <h2 style="color: #7c3aed; margin-bottom: 20px;">🔐 Réinitialisation de mot de passe</h2>
              <p>Bonjour ${user.firstName},</p>
              <p>Votre demande de réinitialisation de mot de passe a été traitée par un administrateur.</p>
              <p>Cliquez sur le bouton ci-dessous pour créer votre nouveau mot de passe :</p>

              <div style="text-align: center; margin: 30px 0;">
                <a href="${resetUrl}" style="display: inline-block; padding: 15px 30px; background: #7c3aed; color: white; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
                  Choisir mon nouveau mot de passe
                </a>
              </div>

              <p style="color: #666; font-size: 0.9em; margin-top: 20px;">
                <strong>⚠️ Important :</strong> Ce lien expire dans 1 heure. Si vous n'êtes pas à l'origine de cette demande, contactez le support.
              </p>

              <p style="color: #999; font-size: 0.85em; margin-top: 30px; border-top: 1px solid #eee; padding-top: 20px;">
                Si le bouton ne fonctionne pas, copiez et collez ce lien dans votre navigateur :<br/>
                <span style="word-break: break-all; color: #7c3aed;">${resetUrl}</span>
              </p>

              <p style="margin-top: 30px; color: #666; font-size: 0.9em;">
                Cordialement,<br/>
                L'équipe Connect Comedy Club
              </p>
            </div>
          </div>
        `,
        text: `Bonjour ${user.firstName},\n\nVotre demande de réinitialisation de mot de passe a été traitée par un administrateur.\n\nCliquez sur ce lien pour créer votre nouveau mot de passe : ${resetUrl}\n\nCe lien expire dans 1 heure.\n\nCordialement,\nL'équipe Connect Comedy Club`
      });
      console.log(`✅ Email de réinitialisation envoyé à ${user.email}`);
    } catch (emailError) {
      console.error('❌ Erreur lors de l\'envoi de l\'email à l\'utilisateur:', emailError);
      // Ne pas faire échouer la réinitialisation si l'email échoue
    }

    res.status(200).json({
      message: `Un lien de réinitialisation a été envoyé à ${user.firstName} ${user.lastName}.`
    });
  } catch (error) {
    console.error('Erreur lors de la réinitialisation admin:', error);
    res.status(500).json({ message: 'Erreur lors de la réinitialisation du mot de passe' });
  }
};

// ============================================================================
// DEACTIVATE USER - Desactiver un compte (Super Admin uniquement)
// ============================================================================
export const deactivateUser = async (req: AuthRequest, res: Response) => {
  try {
    if (req.user?.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ message: 'Acces refuse' });
    }

    const { userId } = req.params;
    const { reason } = req.body;

    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'Utilisateur non trouve' });
    }

    // Empecher la desactivation d'un Super Admin
    if (user.role === 'SUPER_ADMIN') {
      return res.status(403).json({ message: 'Impossible de desactiver un Super Admin' });
    }

    // Verifier si deja desactive
    if ((user as any).isActive === false) {
      return res.status(400).json({ message: 'Ce compte est deja desactive' });
    }

    // Desactiver le compte
    (user as any).isActive = false;
    (user as any).deactivatedAt = new Date();
    (user as any).deactivatedBy = new Types.ObjectId(req.user.id);
    (user as any).deactivationReason = reason || '';
    await user.save();

    console.log(`✅ Compte desactive: ${user.firstName} ${user.lastName} (${user.email})`);

    res.status(200).json({
      message: `Compte de ${user.firstName} ${user.lastName} desactive avec succes`,
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        isActive: (user as any).isActive,
        deactivatedAt: (user as any).deactivatedAt,
        deactivationReason: (user as any).deactivationReason
      }
    });
  } catch (error) {
    console.error('Erreur lors de la desactivation:', error);
    res.status(500).json({ message: 'Erreur lors de la desactivation du compte' });
  }
};

// ============================================================================
// REACTIVATE USER - Reactiver un compte (Super Admin uniquement)
// ============================================================================
export const reactivateUser = async (req: AuthRequest, res: Response) => {
  try {
    if (req.user?.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ message: 'Acces refuse' });
    }

    const { userId } = req.params;

    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'Utilisateur non trouve' });
    }

    // Verifier si deja actif
    if ((user as any).isActive !== false) {
      return res.status(400).json({ message: 'Ce compte est deja actif' });
    }

    // Reactiver le compte
    (user as any).isActive = true;
    (user as any).deactivatedAt = undefined;
    (user as any).deactivatedBy = undefined;
    (user as any).deactivationReason = undefined;
    await user.save();

    console.log(`✅ Compte reactive: ${user.firstName} ${user.lastName} (${user.email})`);

    res.status(200).json({
      message: `Compte de ${user.firstName} ${user.lastName} reactive avec succes`,
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        isActive: (user as any).isActive
      }
    });
  } catch (error) {
    console.error('Erreur lors de la reactivation:', error);
    res.status(500).json({ message: 'Erreur lors de la reactivation du compte' });
  }
};

// ============================================================================
// DELETE USER - Supprimer définitivement un compte (Super Admin uniquement)
// ============================================================================
export const deleteUser = async (req: AuthRequest, res: Response) => {
  try {
    if (req.user?.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ message: 'Accès refusé' });
    }

    const { userId } = req.params;
    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }

    if (user.role === 'SUPER_ADMIN') {
      return res.status(403).json({ message: 'Impossible de supprimer un Super Admin' });
    }

    await deleteUserAndData(userId, user.role);

    console.log(`✅ Compte supprimé: ${user.firstName} ${user.lastName} (${user.email})`);

    res.status(204).send();
  } catch (error) {
    console.error('Erreur lors de la suppression du compte:', error);
    res.status(500).json({ message: 'Erreur lors de la suppression du compte' });
  }
};


