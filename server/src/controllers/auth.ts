import { Request, Response } from 'express';
import jwt, { SignOptions } from 'jsonwebtoken';
import crypto from 'crypto';
import mongoose, { Types } from 'mongoose';
import { UserModel } from '../models/User';
import { VenueModel } from '../models/Venue';
import { PasswordResetRequestModel } from '../models/PasswordResetRequest';
import { ApplicationModel } from '../models/Application';
import { AbsenceModel } from '../models/Absence';
import { EventModel } from '../models/Event';
import { PresenceAlertModel } from '../models/PresenceAlert';
import { ComedianReportModel } from '../models/ComedianReport';
import { NotificationModel } from '../models/Notification';
import { config } from '../config/env';
import { AuthRequest } from '../middleware/auth';
import sgMail from '@sendgrid/mail';
import { emitUserRegistered, emitPasswordReset } from '../services/eventEmitter';
import { getAuthCookieOptions, AUTH_COOKIE_MAX_AGE } from '../utils/cookieOptions';

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
    console.log('📝 [REGISTER] Données reçues:', JSON.stringify(req.body, null, 2));
    const { email, phone, password, firstName, lastName, role, city, birthDate, profile: profileData, consent } = req.body;

    console.log('📝 [REGISTER] Rôle:', role);
    console.log('📝 [REGISTER] Profile data:', profileData);

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
    
    console.log('📝 [REGISTER] Données utilisateur à créer:', JSON.stringify({ ...userData, password: '***' }, null, 2));
    
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

    // Émettre un évènement SSE pour notifier tous les clients
    emitUserRegistered(user._id.toString());

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
    const userId = (req as any).user?.id;

    // Vérifier l'accès super administrateur
    if (userRole !== 'SUPER_ADMIN') {
      return res.status(403).json({
        message: 'Seuls les super administrateurs peuvent accéder à cette ressource'
      });
    }

    // Récupérer tous les utilisateurs non administrateurs
    const users = await UserModel.find({
      role: { $in: ['COMEDIAN', 'ORGANIZER'] }
    })
      .select('firstName lastName email phone role city createdAt stats profile organizerProfile isActive deactivatedAt deactivationReason')
      .populate('profile')
      .populate('organizerProfile')
      .sort({ createdAt: -1 });

    // Formater les données utilisateur pour la réponse
    const formattedUsers = users.map(user => {
      const baseData = {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.role === 'ORGANIZER'
          ? (user.organizerProfile?.phone || null)
          : (user.phone || null),
        role: user.role,
        city: user.role === 'ORGANIZER'
          ? (user.organizerProfile?.location?.city || user.city || null)
          : (user.city || null),
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        stats: user.stats || {},
        isActive: (user as any).isActive !== false, // Par defaut true si non defini
        deactivatedAt: (user as any).deactivatedAt || null,
        deactivationReason: (user as any).deactivationReason || null,
      };

      // Ajouter des données spécifiques au rôle
      if (user.role === 'COMEDIAN' && user.profile) {
        return {
          ...baseData,
          bio: (user.profile as any).bio || '',
          experience: (user.profile as any).experience || 0,
          numberOfScenes: (user.profile as any).numberOfScenes || '0-50',
        };
      }

      if (user.role === 'ORGANIZER' && user.organizerProfile) {
        return {
          ...baseData,
          companyName: (user.organizerProfile as any).companyName || null,
          description: (user.organizerProfile as any).description || null,
          website: (user.organizerProfile as any).website || null,
        };
      }

      return baseData;
    });

    res.status(200).json({
      success: true,
      count: formattedUsers.length,
      users: formattedUsers
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des utilisateurs:', error);
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
            <h2 style="color: #ff416c; margin-bottom: 20px;">🔐 Réinitialisation de mot de passe</h2>
            <p>Bonjour ${user.firstName},</p>
            <p>Vous avez demandé à réinitialiser votre mot de passe.</p>
            <p>Cliquez sur le bouton ci-dessous pour créer un nouveau mot de passe :</p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetUrl}" style="display: inline-block; padding: 15px 30px; background: linear-gradient(to right, #ff416c, #ff4b2b); color: white; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
                Réinitialiser mon mot de passe
              </a>
            </div>
            
            <p style="color: #666; font-size: 0.9em; margin-top: 20px;">
              <strong>⚠️ Important :</strong> Ce lien expire dans 1 heure. Si vous n'avez pas demandé cette réinitialisation, ignorez cet email.
            </p>
            
            <p style="color: #999; font-size: 0.85em; margin-top: 30px; border-top: 1px solid #eee; padding-top: 20px;">
              Si le bouton ne fonctionne pas, copiez et collez ce lien dans votre navigateur :<br/>
              <span style="word-break: break-all; color: #ff416c;">${resetUrl}</span>
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

    const { userId, newPassword } = req.body;

    if (!userId || !newPassword) {
      return res.status(400).json({ message: 'userId et newPassword requis' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ message: 'Le mot de passe doit contenir au moins 8 caractères' });
    }

    // Trouver l'utilisateur
    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }

    // Mettre à jour le mot de passe
    user.password = newPassword;
    await user.save();

    // Émettre un évènement SSE pour notifier tous les clients
    emitPasswordReset(userId);

    // Marquer toutes les demandes en attente comme complétées
    await PasswordResetRequestModel.updateMany(
      { userId: user._id, status: 'pending' },
      {
        status: 'completed',
        completedAt: new Date(),
        completedBy: req.user.id
      }
    );

    // Envoyer un email à l'utilisateur avec son nouveau mot de passe
    try {
      sgMail.setApiKey(config.email.smtpPass);
      await sgMail.send({
        from: {
          email: config.email.smtpUser || '',
          name: 'Connect Comedy Club'
        },
        to: user.email,
        subject: '🔐 Votre mot de passe a été réinitialisé',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
            <div style="background-color: #fff; border-radius: 10px; padding: 30px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
              <h2 style="color: #ff416c; margin-bottom: 20px;">🔐 Mot de passe réinitialisé</h2>
              <p>Bonjour ${user.firstName},</p>
              <p>Votre demande de réinitialisation de mot de passe a été traitée par un administrateur.</p>
              
              <div style="background-color: #fff3cd; border: 2px solid #ffc107; border-radius: 8px; padding: 20px; margin: 20px 0;">
                <p style="margin: 0; font-weight: bold; color: #856404;">⚠️ Important : Conservez ce mot de passe en sécurité</p>
                <p style="margin: 10px 0 0 0; font-size: 1.2em; color: #000; font-family: monospace; word-break: break-all;">
                  <strong>Votre nouveau mot de passe :</strong><br/>
                  ${newPassword}
                </p>
              </div>
              
              <p style="margin-top: 25px;">Vous pouvez maintenant vous connecter avec ce nouveau mot de passe :</p>
              <a href="${config.frontend.url}/login" style="display: inline-block; padding: 12px 24px; background: #ff416c; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; font-weight: bold;">
                Se connecter
              </a>
              
              <p style="margin-top: 30px; color: #666; font-size: 0.9em;">
                <strong>Conseil de sécurité :</strong> Nous vous recommandons de changer ce mot de passe après votre première connexion pour un mot de passe que vous seul connaissez.
              </p>
              
              <p style="margin-top: 30px; color: #666; font-size: 0.9em;">
                Cordialement,<br/>
                L'équipe Connect Comedy Club
              </p>
            </div>
          </div>
        `,
        text: `Bonjour ${user.firstName},\n\nVotre demande de réinitialisation de mot de passe a été traitée par un administrateur.\n\nVotre nouveau mot de passe : ${newPassword}\n\nVous pouvez maintenant vous connecter avec ce nouveau mot de passe.\n\nConseil de sécurité : Nous vous recommandons de changer ce mot de passe après votre première connexion.\n\nCordialement,\nL'équipe Connect Comedy Club`
      });
      console.log(`✅ Email envoyé à ${user.email} avec le nouveau mot de passe`);
    } catch (emailError) {
      console.error('❌ Erreur lors de l\'envoi de l\'email à l\'utilisateur:', emailError);
      // Ne pas faire échouer la réinitialisation si l'email échoue
    }

    res.status(200).json({
      message: `Mot de passe réinitialisé avec succès pour ${user.firstName} ${user.lastName}. Un email a été envoyé à l'utilisateur.`
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

    const id = new Types.ObjectId(userId);

    if (user.role === 'COMEDIAN') {
      await ApplicationModel.deleteMany({ comedian: id });
      await AbsenceModel.deleteMany({ comedian: id });
      await PresenceAlertModel.deleteMany({ comedian: id });
      await ComedianReportModel.deleteMany({ comedian: id });
      await UserModel.updateMany(
        { favoriteComedians: id },
        { $pull: { favoriteComedians: id } }
      );
    } else if (user.role === 'ORGANIZER') {
      const organizerEvents = await EventModel.find({ organizer: id }).select('_id');
      const eventIds = organizerEvents.map((e) => e._id);
      await ApplicationModel.deleteMany({ event: { $in: eventIds } });
      await AbsenceModel.deleteMany({ event: { $in: eventIds } });
      await AbsenceModel.deleteMany({ organizer: id });
      await EventModel.deleteMany({ organizer: id });
    }

    await PasswordResetRequestModel.deleteMany({ user: id });
    await NotificationModel.deleteMany({ user: id });
    await UserModel.findByIdAndDelete(userId);

    console.log(`✅ Compte supprimé: ${user.firstName} ${user.lastName} (${user.email})`);

    res.status(204).send();
  } catch (error) {
    console.error('Erreur lors de la suppression du compte:', error);
    res.status(500).json({ message: 'Erreur lors de la suppression du compte' });
  }
};

export const upgradeToOrganizer = async (req: AuthRequest, res: Response) => {
  try {
    if (req.user?.role !== 'LIEU') {
      return res.status(403).json({ message: 'Seuls les lieux peuvent être convertis en organisateur' });
    }

    const { companyName, description, website, venueTypes,
            eventFrequency, averageBudget, postalCode } = req.body;

    if (!postalCode) {
      return res.status(400).json({ message: 'Le code postal est requis' });
    }

    const user = await UserModel.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'Utilisateur introuvable' });

    // organizerProfile AVANT role pour éviter l'écrasement par le pre-save middleware
    user.organizerProfile = {
      companyName: companyName || '',
      description: description || '',
      website: website || '',
      venueTypes: Array.isArray(venueTypes) ? venueTypes : [],
      eventFrequency: eventFrequency || 'monthly',
      averageBudget: averageBudget && typeof averageBudget === 'object'
        ? { min: Number(averageBudget.min) || 0, max: Number(averageBudget.max) || 0 }
        : undefined,
      location: {
        city: user.city || '',
        postalCode: String(postalCode).trim(),
        address: user.address || '',
      },
      phone: user.phone || '',
    };
    (user as any).canSwitchToLieu = true;
    user.role = 'ORGANIZER';
    await user.save();

    if (!config.jwt.secret) {
      return res.status(500).json({ message: 'Erreur de configuration du serveur' });
    }

    const tokenOptions: SignOptions = { expiresIn: '24h' };
    const token = jwt.sign(
      { id: user._id, email: user.email, role: user.role },
      config.jwt.secret,
      tokenOptions
    );
    res.cookie('auth_token', token, {
      ...getAuthCookieOptions(),
      maxAge: AUTH_COOKIE_MAX_AGE,
    });

    return res.status(200).json({
      message: 'Compte converti en organisateur',
      token,
      user: {
        id: user._id,
        email: user.email,
        phone: user.phone,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        canSwitchToLieu: (user as any).canSwitchToLieu,
        city: user.city,
        organizerProfile: user.organizerProfile,
      },
    });
  } catch (error) {
    console.error('Erreur lors de la conversion en organisateur:', error);
    res.status(500).json({ message: 'Erreur lors de la conversion en organisateur' });
  }
};

export const switchToLieu = async (req: AuthRequest, res: Response) => {
  try {
    if (req.user?.role !== 'ORGANIZER') {
      return res.status(403).json({ message: 'Seuls les organisateurs peuvent utiliser ce switch' });
    }

    const user = await UserModel.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'Utilisateur introuvable' });
    }

    if (!(user as any).canSwitchToLieu) {
      return res.status(403).json({ message: 'Compte organisateur standard : switch vers Lieu non autorisé' });
    }

    user.role = 'LIEU';
    await user.save();

    if (!config.jwt.secret) {
      return res.status(500).json({ message: 'Erreur de configuration du serveur' });
    }

    const tokenOptions: SignOptions = { expiresIn: '24h' };
    const token = jwt.sign(
      { id: user._id, email: user.email, role: user.role },
      config.jwt.secret,
      tokenOptions
    );

    res.cookie('auth_token', token, {
      ...getAuthCookieOptions(),
      maxAge: AUTH_COOKIE_MAX_AGE,
    });

    return res.status(200).json({
      message: 'Retour au compte Lieu effectué',
      token,
      user: {
        id: user._id,
        email: user.email,
        phone: user.phone,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        city: user.city,
        canSwitchToLieu: (user as any).canSwitchToLieu,
      },
    });
  } catch (error) {
    console.error('Erreur lors du switch Organisateur -> Lieu:', error);
    res.status(500).json({ message: 'Erreur lors du switch vers le compte Lieu' });
  }
};

export const switchToOrganizer = async (req: AuthRequest, res: Response) => {
  try {
    if (req.user?.role !== 'LIEU') {
      return res.status(403).json({ message: 'Seuls les comptes Lieu peuvent utiliser ce switch' });
    }

    const user = await UserModel.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'Utilisateur introuvable' });
    }

    if (!(user as any).canSwitchToLieu || !user.organizerProfile) {
      return res.status(403).json({ message: 'Veuillez d’abord compléter "Devenir Organisateur"' });
    }

    user.role = 'ORGANIZER';
    await user.save();

    if (!config.jwt.secret) {
      return res.status(500).json({ message: 'Erreur de configuration du serveur' });
    }

    const tokenOptions: SignOptions = { expiresIn: '24h' };
    const token = jwt.sign(
      { id: user._id, email: user.email, role: user.role },
      config.jwt.secret,
      tokenOptions
    );

    res.cookie('auth_token', token, {
      ...getAuthCookieOptions(),
      maxAge: AUTH_COOKIE_MAX_AGE,
    });

    return res.status(200).json({
      message: 'Passage au compte Organisateur effectué',
      token,
      user: {
        id: user._id,
        email: user.email,
        phone: user.phone,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        city: user.city,
        canSwitchToLieu: (user as any).canSwitchToLieu,
        organizerProfile: user.organizerProfile,
      },
    });
  } catch (error) {
    console.error('Erreur lors du switch Lieu -> Organisateur:', error);
    res.status(500).json({ message: 'Erreur lors du switch vers le compte Organisateur' });
  }
};
