import { Response } from 'express';
import { Buffer } from 'buffer';
import mongoose from 'mongoose';
import { UserModel } from '../models/User';
import { ApplicationModel } from '../models/Application';
import { EventModel } from '../models/Event';
import { NotificationModel } from '../models/Notification';
import { AuthRequest } from '../middleware/auth';
import { emitProfileUpdated } from '../services/eventEmitter';
import { getCityCoordinates } from '../utils/cityMapping';

const buildAvatarDataUrl = (user: any): string | undefined => {
  if (user?.avatar?.data) {
    const contentType = user.avatar.contentType || 'image/png';
    const base64 = user.avatar.data.toString('base64');
    return `data:${contentType};base64,${base64}`;
  }
  return user?.avatarUrl || undefined;
};

/** Données legacy / hors enum qui font échouer la validation Mongoose à chaque save */
const sanitizeOrganizerProfile = (org: any) => {
  if (!org) return;
  const allowedFreq = ['weekly', 'monthly', 'occasional'];
  if (
    org.eventFrequency != null &&
    org.eventFrequency !== '' &&
    !allowedFreq.includes(org.eventFrequency)
  ) {
    console.warn('⚠️ [sanitizeOrganizerProfile] eventFrequency invalide en base, normalisation → monthly:', org.eventFrequency);
    org.eventFrequency = 'monthly';
  }
  if (org.venueTypes != null && !Array.isArray(org.venueTypes)) {
    org.venueTypes = [];
  }
};

const VALID_NUMBER_OF_SCENES = new Set(['0-50', '50-200', '200+']);

/**
 * Profil humoriste (`profile`) parfois présent sur d'autres rôles (ex. Lieu→Orga) avec
 * d'anciennes valeurs (`0`, `"0"`) : l'enum Mongoose exige '0-50' | '50-200' | '200+'.
 */
const sanitizeProfileNumberOfScenes = (user: any) => {
  if (!user?.profile) return;
  const p = user.profile as any;
  if (p.numberOfScenes === undefined || p.numberOfScenes === null) return;

  const raw = p.numberOfScenes;
  if (typeof raw === 'number') {
    const n = raw;
    if (n <= 50) p.numberOfScenes = '0-50';
    else if (n <= 200) p.numberOfScenes = '50-200';
    else p.numberOfScenes = '200+';
    return;
  }

  const s = String(raw).trim();
  if (VALID_NUMBER_OF_SCENES.has(s)) return;

  console.warn('⚠️ [sanitizeProfile] numberOfScenes hors enum → 0-50:', raw);
  p.numberOfScenes = '0-50';
};

/**
 * Récupère le profil de l'utilisateur authentifié
 */
export const getMyProfile = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const user = await UserModel.findById(req.user?.id);
    if (!user) {
      console.log('Utilisateur non trouvé pour /me avec ID:', req.user?.id);
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }
    console.log('Données utilisateur renvoyées par /api/profile/me:', user.stats?.totalEvents);

    // Transform the response to include 'id' instead of just '_id' for consistency with JWT token
    const userObj = user.toObject ? user.toObject() : user;
    const responseData = {
      ...userObj,
      id: user._id,
      avatarUrl: buildAvatarDataUrl(userObj),
    };
    if ('avatar' in responseData) {
      delete (responseData as any).avatar;
    }

    return res.json(responseData);
  } catch (error: any) {
    console.error('Erreur lors de la récupération du profil /me:', error.message);
    return res.status(500).json({ message: 'Erreur lors de la récupération du profil', error: error.message });
  }
};

/**
 * Récupère le profil d'un utilisateur par son ID (pour les organisateurs qui veulent voir le profil d'un humoriste)
 */
export const getUserProfile = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const { userId } = req.params;
    const user = await UserModel.findById(userId).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }

    // Transform the response to include 'id' for consistency
    const userObj = user.toObject ? user.toObject() : user;
    const responseData = {
      ...userObj,
      id: user._id,
      avatarUrl: buildAvatarDataUrl(userObj),
    };
    if ('avatar' in responseData) {
      delete (responseData as any).avatar;
    }

    return res.json(responseData);
  } catch (error: any) {
    console.error('Erreur lors de la récupération du profil:', error.message);
    return res.status(500).json({ message: 'Erreur lors de la récupération du profil', error: error.message });
  }
};

/**
 * Met à jour le profil d'un utilisateur avec gestion des profils secondaires (comedianProfile, organizerProfile)
 */
export const updateUserProfile = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const { userId } = req.params;
    const updateData = req.body;

    // Log sans inclure le contenu complet de avatarUrl (peut être une énorme chaîne base64)
    const safeLogData = { ...updateData };
    if (safeLogData.avatarUrl && typeof safeLogData.avatarUrl === 'string' && safeLogData.avatarUrl.length > 100) {
      safeLogData.avatarUrl = `[base64 image: ${safeLogData.avatarUrl.length} caractères]`;
    }
    console.log('📝 [updateUserProfile] Données reçues:', {
      userId,
      updateDataKeys: Object.keys(updateData),
      hasAvatarUrl: !!updateData.avatarUrl,
      avatarUrlLength: updateData.avatarUrl?.length || 0
    });

    if (String(req.user?.id) !== String(userId)) {
      res.status(403).json({ message: 'Non autorisé à modifier ce profil' });
      return;
    }

    const user = await UserModel.findById(userId);
    if (!user) {
      res.status(404).json({ message: 'Utilisateur non trouvé' });
      return;
    }

    console.log('👤 Utilisateur trouvé, avant mise à jour:', {
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone
    });

    // Update basic user fields
    if (updateData.firstName) user.firstName = updateData.firstName;
    if (updateData.lastName) user.lastName = updateData.lastName;
    if (updateData.email) user.email = updateData.email;
    if (updateData.city) user.city = updateData.city;
    if (updateData.phone) user.phone = updateData.phone;
    if (updateData.address) user.address = updateData.address;
    if (updateData.gender !== undefined && updateData.gender !== '') {
      user.gender = updateData.gender;
    }
    if (updateData.birthDate !== undefined) {
      (user as any).birthDate = updateData.birthDate ? new Date(updateData.birthDate) : undefined;
    }
    if (updateData.avatarUrl !== undefined) {
      if (updateData.avatarUrl === null || updateData.avatarUrl === '') {
        user.avatarUrl = undefined;
        (user as any).avatar = undefined;
      } else if (typeof updateData.avatarUrl === 'string' && updateData.avatarUrl.startsWith('data:image/')) {
        const matches = updateData.avatarUrl.match(/^data:(.+);base64,(.+)$/);
        if (matches) {
          const [, contentType, base64Data] = matches;
          (user as any).avatar = {
            data: Buffer.from(base64Data, 'base64'),
            contentType,
            uploadedAt: new Date(),
          };
          user.avatarUrl = undefined;
        } else {
          user.avatarUrl = updateData.avatarUrl;
          (user as any).avatar = undefined;
        }
      } else {
        user.avatarUrl = updateData.avatarUrl;
        (user as any).avatar = undefined;
      }
    }

    console.log('✏️ Utilisateur après mise à jour des champs:', {
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone
    });

    // Handle comedianProfile updates
    if (user.role === 'COMEDIAN') {
      if (!user.profile) {
        user.profile = {};
      }
      if (updateData.profile) {
        if (updateData.profile.bio !== undefined) user.profile.bio = updateData.profile.bio;
        if (updateData.profile.experience !== undefined) user.profile.experience = updateData.profile.experience;
        if (updateData.profile.speciality !== undefined) user.profile.speciality = updateData.profile.speciality;
        if (updateData.profile.numberOfScenes !== undefined) user.profile.numberOfScenes = updateData.profile.numberOfScenes;
        if (updateData.profile.comedyStyle !== undefined) user.profile.comedyStyle = updateData.profile.comedyStyle;
        if (updateData.profile.performanceLanguages !== undefined) user.profile.performanceLanguages = updateData.profile.performanceLanguages;
        if (updateData.profile.mobilityZone !== undefined) user.profile.mobilityZone = updateData.profile.mobilityZone;
        if (updateData.profile.socialLinks) {
          if (!user.profile.socialLinks) user.profile.socialLinks = {};
          if (updateData.profile.socialLinks.youtube !== undefined) user.profile.socialLinks.youtube = updateData.profile.socialLinks.youtube || undefined;
          if (updateData.profile.socialLinks.instagram !== undefined) user.profile.socialLinks.instagram = updateData.profile.socialLinks.instagram || undefined;
          if (updateData.profile.socialLinks.facebook !== undefined) user.profile.socialLinks.facebook = updateData.profile.socialLinks.facebook || undefined;
          if (updateData.profile.socialLinks.twitter !== undefined) user.profile.socialLinks.twitter = updateData.profile.socialLinks.twitter || undefined;
        }
      }
    }

    // Handle consent update
    if (updateData.consent) {
      const existingConsent = (user as any).consent || {};
      (user as any).consent = {
        ...existingConsent,
        ...(updateData.consent.termsAccepted !== undefined && { termsAccepted: updateData.consent.termsAccepted }),
        ...(updateData.consent.privacyAccepted !== undefined && { privacyAccepted: updateData.consent.privacyAccepted }),
        ...(updateData.consent.isAdult !== undefined && { isAdult: updateData.consent.isAdult }),
      };
    }

    // Handle spectatorPreferences updates
    if (user.role === 'SPECTATOR') {
      if (!(user as any).spectatorPreferences) {
        (user as any).spectatorPreferences = { radiusKm: 20, dailyRecapEmail: true };
      }
      if (updateData.spectatorPreferences) {
        const prefs = updateData.spectatorPreferences;
        if ([5, 10, 20, 50].includes(Number(prefs.radiusKm))) {
          (user as any).spectatorPreferences.radiusKm = Number(prefs.radiusKm);
        }
        if (typeof prefs.dailyRecapEmail === 'boolean') {
          (user as any).spectatorPreferences.dailyRecapEmail = prefs.dailyRecapEmail;
        }
      }
      // Recalculate coordinates when city changes or when they're missing
      if (user.city) {
        const cityChanged = updateData.city && updateData.city.trim() !== '';
        const coordsMissing = (user as any).latitude == null || (user as any).longitude == null;
        if (cityChanged || coordsMissing) {
          const coords = await getCityCoordinates(user.city);
          if (coords) {
            (user as any).latitude = coords.lat;
            (user as any).longitude = coords.lon;
          }
        }
      }
    }

    // Handle organizerProfile updates (mutation sur le sous-document — évite les erreurs Mongoose
    // liées au remplacement par un objet plain + _id imbriqués)
    if (user.role === 'ORGANIZER' && updateData.organizerProfile) {
      const incoming = updateData.organizerProfile;
      if (!user.organizerProfile) {
        const newProfile: Record<string, unknown> = {
          companyName: incoming.companyName ?? '',
          venueTypes: Array.isArray(incoming.venueTypes) ? incoming.venueTypes : [],
          location: {
            city: incoming.location?.city ?? '',
            postalCode: incoming.location?.postalCode ?? '',
            ...(incoming.location?.address !== undefined && { address: incoming.location.address }),
          },
        };
        if (incoming.description !== undefined) newProfile.description = incoming.description;
        if (incoming.website !== undefined) newProfile.website = incoming.website;
        if (incoming.eventFrequency !== undefined) newProfile.eventFrequency = incoming.eventFrequency;
        if (incoming.phone !== undefined) newProfile.phone = incoming.phone;
        if (incoming.averageBudget != null) newProfile.averageBudget = incoming.averageBudget;
        user.set('organizerProfile', newProfile);
      } else {
        const org = user.organizerProfile as any;
        if (incoming.companyName !== undefined) org.companyName = incoming.companyName;
        if (incoming.description !== undefined) org.description = incoming.description;
        if (incoming.website !== undefined) org.website = incoming.website;
        if (incoming.venueTypes !== undefined) org.venueTypes = incoming.venueTypes;
        if (incoming.eventFrequency !== undefined) org.eventFrequency = incoming.eventFrequency;
        if (incoming.phone !== undefined) org.phone = incoming.phone;
        if (incoming.location) {
          if (!org.location) {
            org.location = { city: '', postalCode: '' };
          }
          if (incoming.location.city !== undefined) org.location.city = incoming.location.city;
          if (incoming.location.postalCode !== undefined) org.location.postalCode = incoming.location.postalCode;
          if (incoming.location.address !== undefined) org.location.address = incoming.location.address;
        }
        if (incoming.averageBudget !== undefined && incoming.averageBudget !== null) {
          const cur =
            org.averageBudget && typeof org.averageBudget.toObject === 'function'
              ? org.averageBudget.toObject()
              : org.averageBudget || {};
          org.averageBudget = { ...cur, ...incoming.averageBudget };
        }
        user.markModified('organizerProfile');
      }
    }

    if (user.role === 'ORGANIZER') {
      sanitizeOrganizerProfile(user.organizerProfile as any);
    }

    const g = user.gender as string | undefined;
    if (g !== undefined && g !== '' && !['femme', 'homme'].includes(g)) {
      (user as any).gender = undefined;
    }

    sanitizeProfileNumberOfScenes(user);

    console.log('💾 Tentative de sauvegarde...');
    await user.save();
    console.log('✅ Utilisateur sauvegardé avec succès');

    try {
      emitProfileUpdated(String(userId));
    } catch (sseErr: any) {
      console.error('⚠️ emitProfileUpdated (non bloquant):', sseErr?.message);
    }

    // profile / organizerProfile sont des sous-documents embarqués, pas des refs : pas de populate
    const updatedUser = await UserModel.findById(userId).select('-password');

    if (!updatedUser) {
      return res.status(404).json({ message: 'Utilisateur non trouvé après mise à jour' });
    }

    // Transform the response to include 'id' for consistency
    const userObj = updatedUser.toObject ? updatedUser.toObject() : updatedUser;
    const avatarUrl = buildAvatarDataUrl(userObj);
    if (userObj && typeof userObj === 'object' && 'avatar' in userObj) {
      delete (userObj as any).avatar;
    }
    const responseData = {
      ...userObj,
      id: updatedUser._id,
      avatarUrl,
    };

    return res.json(responseData);
  } catch (error: any) {
    console.error('❌ Erreur validation/sauvegarde:', {
      message: error.message,
      name: error.name,
      errors: error.errors ? Object.keys(error.errors).map(key => ({
        field: key,
        message: error.errors[key].message,
        value: error.errors[key].value
      })) : null
    });

    if (error instanceof mongoose.Error.ValidationError) {
      return res.status(400).json({
        message: 'Validation du profil impossible',
        error: error.message,
        errors: Object.keys(error.errors || {}).map((key) => ({
          field: key,
          message: error.errors[key].message,
        })),
      });
    }
    if (error instanceof mongoose.Error.CastError) {
      return res.status(400).json({
        message: 'Donnée invalide',
        error: error.message,
        path: error.path,
      });
    }
    if (error?.code === 11000) {
      return res.status(409).json({
        message: 'Cette adresse e-mail est déjà utilisée.',
        error: error.message,
      });
    }

    return res.status(500).json({
      message: 'Erreur lors de la mise à jour du profil',
      error: error.message,
      errors: error.errors ? Object.keys(error.errors).map(key => ({
        field: key,
        message: error.errors[key].message
      })) : null
    });
  }
};

/**
 * Désactive le compte de l'utilisateur authentifié (grace period de 30 jours)
 * Conformité RGPD - Droit à l'effacement (Article 17)
 *
 * Le compte sera définitivement supprimé après 30 jours par le cron job.
 * L'utilisateur peut se reconnecter pendant cette période pour réactiver son compte.
 */
export const deleteMyAccount = async (req: AuthRequest, res: Response): Promise<any> => {
  console.log('🚨 [deleteMyAccount] VERSION GRACE PERIOD 30 JOURS - Appel reçu');

  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: 'Non authentifié' });
    }

    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }

    // Vérifier si le compte est déjà désactivé
    if (user.isActive === false) {
      return res.status(400).json({
        message: 'Votre compte est déjà en cours de suppression',
        deactivatedAt: user.deactivatedAt,
        deletionDate: new Date(user.deactivatedAt!.getTime() + 30 * 24 * 60 * 60 * 1000)
      });
    }

    console.log(`⏸️ [deleteMyAccount] Désactivation du compte ${user.email} (grace period 30j)`);

    // Désactiver le compte au lieu de le supprimer immédiatement
    const now = new Date();
    const deletionDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    user.isActive = false;
    user.deactivatedAt = now;
    user.deactivatedBy = user._id as any;
    user.deactivationReason = 'Demande de suppression par l\'utilisateur (RGPD)';

    await user.save();

    console.log(`✅ [deleteMyAccount] Compte ${user.email} désactivé. Suppression prévue le ${deletionDate.toLocaleDateString('fr-FR')}`);

    console.log(`✅ [deleteMyAccount] Compte ${user.email} désactivé. Suppression prévue le ${deletionDate.toLocaleDateString('fr-FR')}`);

    return res.json({
      message: 'Votre demande de suppression a été enregistrée',
      deactivatedAt: user.deactivatedAt.toISOString(),
      deletionDate: deletionDate.toISOString(),
      gracePeriodDays: 30,
      info: 'Vous pouvez annuler cette demande en vous reconnectant dans les 30 prochains jours.'
    });

  } catch (error: any) {
    console.error('❌ [deleteMyAccount] Erreur:', error.message);
    return res.status(500).json({
      message: 'Erreur lors de la suppression du compte',
      error: error.message
    });
  }
};

/**
 * Exporte toutes les données personnelles de l'utilisateur
 * Conformité RGPD - Droit à la portabilité (Article 20)
 *
 * Retourne un fichier JSON contenant :
 * - Données du profil
 * - Candidatures (si comédien)
 * - Événements créés (si organisateur)
 * - Notifications
 * - Préférences
 */
export const exportMyData = async (req: AuthRequest, res: Response): Promise<any> => {
  console.log('📦 [exportMyData] Demande d\'export RGPD reçue');

  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: 'Non authentifié' });
    }

    const user = await UserModel.findById(userId).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }

    console.log(`📦 [exportMyData] Export des données pour ${user.email}`);

    // Construire l'objet d'export
    const exportData: any = {
      _exportInfo: {
        exportDate: new Date().toISOString(),
        exportedBy: 'Connect Comedy Club',
        rgpdArticle: 'Article 20 - Droit à la portabilité des données',
        format: 'JSON',
        version: '1.0'
      },
      profile: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone || null,
        city: user.city || null,
        address: user.address || null,
        gender: user.gender || null,
        role: user.role,
        isActive: user.isActive,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        lastLoginAt: user.lastLoginAt || null,
        avatarUrl: user.avatarUrl || null,
      },
      emailPreferences: {
        globalSubscribed: user.emailSubscriptions?.globalSubscribed ?? true,
        unsubscribedAt: user.emailSubscriptions?.unsubscribedAt || null,
      },
      statistics: user.stats || null,
    };

    // Ajouter le profil spécifique selon le rôle
    if (user.role === 'COMEDIAN' && user.profile) {
      exportData.comedianProfile = {
        bio: user.profile.bio || null,
        experience: user.profile.experience || null,
        speciality: user.profile.speciality || null,
        numberOfScenes: user.profile.numberOfScenes || null,
        comedyStyle: user.profile.comedyStyle || [],
        performanceLanguages: user.profile.performanceLanguages || [],
        mobilityZone: user.profile.mobilityZone || null,
        socialLinks: user.profile.socialLinks || {},
      };

      // Récupérer les candidatures du comédien
      const applications = await ApplicationModel.find({ comedian: userId })
        .populate('event', 'title date city status')
        .select('-__v')
        .lean();

      exportData.applications = applications.map((app: any) => ({
        id: app._id,
        event: app.event ? {
          id: app.event._id,
          title: app.event.title,
          date: app.event.date,
          city: app.event.city,
          status: app.event.status,
        } : null,
        status: app.status,
        message: app.message || null,
        appliedAt: app.createdAt,
        updatedAt: app.updatedAt,
      }));

      // Récupérer les favoris (organisateurs qui ont mis en favoris ce comédien)
      const favoritedBy = await UserModel.find({ favoriteComedians: userId })
        .select('firstName lastName email')
        .lean();

      exportData.favoritedBy = favoritedBy.map((org: any) => ({
        id: org._id,
        name: `${org.firstName} ${org.lastName}`,
        email: org.email,
      }));
    }

    if (user.role === 'ORGANIZER' && user.organizerProfile) {
      exportData.organizerProfile = {
        companyName: user.organizerProfile.companyName || null,
        website: user.organizerProfile.website || null,
        phone: user.organizerProfile.phone || null,
        location: user.organizerProfile.location || null,
        venueTypes: user.organizerProfile.venueTypes || [],
        averageBudget: user.organizerProfile.averageBudget || null,
        description: user.organizerProfile.description || null,
      };

      // Récupérer les événements créés par l'organisateur
      const events = await EventModel.find({ organizer: userId })
        .select('-__v')
        .lean();

      exportData.events = events.map((event: any) => ({
        id: event._id,
        title: event.title,
        description: event.description,
        date: event.date,
        time: event.time,
        city: event.city,
        address: event.address,
        status: event.status,
        maxComedians: event.maxComedians,
        selectedComediansCount: event.selectedComedians?.length || 0,
        createdAt: event.createdAt,
        updatedAt: event.updatedAt,
      }));

      // Récupérer les comédiens favoris de l'organisateur
      if (user.favoriteComedians && user.favoriteComedians.length > 0) {
        const favoriteComedians = await UserModel.find({ _id: { $in: user.favoriteComedians } })
          .select('firstName lastName email city')
          .lean();

        exportData.favoriteComedians = favoriteComedians.map((comedian: any) => ({
          id: comedian._id,
          name: `${comedian.firstName} ${comedian.lastName}`,
          email: comedian.email,
          city: comedian.city || null,
        }));
      }
    }

    // Récupérer les notifications
    const notifications = await NotificationModel.find({ userId: userId })
      .select('-__v')
      .sort({ createdAt: -1 })
      .limit(100) // Limiter aux 100 dernières
      .lean();

    exportData.notifications = notifications.map((notif: any) => ({
      id: notif._id,
      type: notif.type,
      title: notif.title,
      message: notif.message,
      read: notif.read,
      createdAt: notif.createdAt,
    }));

    console.log(`✅ [exportMyData] Export généré pour ${user.email}`);

    // Définir les headers pour le téléchargement
    const filename = `connect-comedy-club-data-${user.email.replace('@', '_at_')}-${new Date().toISOString().split('T')[0]}.json`;

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    return res.json(exportData);

  } catch (error: any) {
    console.error('❌ [exportMyData] Erreur:', error.message);
    return res.status(500).json({
      message: 'Erreur lors de l\'export des données',
      error: error.message
    });
  }
};
