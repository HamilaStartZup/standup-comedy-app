import { Request, Response } from 'express';
import { ApplicationModel } from '../models/Application';
import { EventModel } from '../models/Event';
import { AuthRequest } from '../middleware/auth';
import { EventDocument } from '../models/Event';
import { ApplicationDocument } from '../models/Application';
import { Event, Application } from '../types';
import { Types } from 'mongoose';
import { UserModel } from '../models/User';
import {
  sendApplicationNotificationToOrganizer,
  sendApplicationStatusToComedian,
  sendLateCancellationToOrganizer,
  sendLateCancellationToComedian,
  sendWithdrawalNotificationToOrganizer
} from '../services/emailService';
import { createLateCancellationAlert } from '../services/lateCancellationAlertService';
import { notifyComediansOfLateCancellationAsync } from '../services/mobilityNotificationService';
import { IPopulatedApplication, IPopulatedEvent } from '../types';
import { IPopulatedUser } from '../types/user';
import jwt from 'jsonwebtoken';
import { config } from '../config/env';
import { emitApplicationCreated, emitApplicationStatusChanged, emitApplicationWithdrawn, emitLateCancellation } from '../services/eventEmitter';
import { createNotification } from './notification';

// Fonction pour construire avatarUrl à partir de avatar.data
const buildAvatarDataUrl = (user: any): string | undefined => {
  if (user?.avatar?.data) {
    const contentType = user.avatar.contentType || 'image/png';
    const base64 = user.avatar.data.toString('base64');
    return `data:${contentType};base64,${base64}`;
  }
  return user?.avatarUrl || undefined;
};

/** Retourne true si l'événement commence dans moins d'1 h ou est déjà passé (humoriste ne peut plus postuler ni se désinscrire). */
function isEventWithinOneHour(event: { date: Date | string; startTime?: string }): boolean {
  const dateStr = typeof event.date === 'string' ? event.date.split('T')[0] : new Date(event.date).toISOString().split('T')[0];
  const startTime = (event.startTime || '00:00').trim();
  const eventStart = new Date(dateStr + 'T' + startTime + ':00');
  const oneHourFromNow = Date.now() + 60 * 60 * 1000;
  return eventStart.getTime() <= oneHourFromNow;
}

export const createApplication = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { eventId, performanceDetails, message } = req.body;
    const comedianId = req.user?.id;

    if (!comedianId) {
      res.status(401).json({
        message: 'Non autorisé'
      });
      return;
    }

    // Valider l'ID de l'évènement
    if (!Types.ObjectId.isValid(eventId)) {
      res.status(400).json({
        message: 'ID d\'évènement invalide'
      });
      return;
    }

    const eventObjectId = new Types.ObjectId(eventId);
    const comedianObjectId = new Types.ObjectId(comedianId);

    // Vérifier si l'humoriste est restreint (signalement en cours)
    const comedian = await UserModel.findById(comedianId).select('isRestricted isActive');
    if (comedian?.isRestricted) {
      res.status(403).json({
        message: 'Votre compte est restreint en attendant l\'examen d\'un signalement. Vous ne pouvez pas postuler à de nouveaux événements.'
      });
      return;
    }

    // Vérifier si l'évènement existe
    const event = await EventModel.findById(eventObjectId);
    if (!event) {
      res.status(404).json({
        message: 'Évènement non trouvé'
      });
      return;
    }

    // Vérifier le statut de l'évènement
    if (event.status === 'cancelled') {
      res.status(422).json({
        message: 'Impossible de postuler à un évènement annulé'
      });
      return;
    }

    if (event.status === 'completed') {
      res.status(422).json({
        message: 'Impossible de postuler à un évènement terminé'
      });
      return;
    }

    // À partir d'1 h avant le début, l'humoriste ne peut plus postuler
    if (isEventWithinOneHour(event)) {
      res.status(422).json({
        message: 'Impossible de postuler : l\'événement commence dans moins d\'une heure ou a déjà commencé.'
      });
      return;
    }

    // Vérifier si l'application existe déjà
    const existingApplication = await ApplicationModel.findOne({
      event: eventObjectId,
      comedian: comedianObjectId
    });

    if (existingApplication) {
      res.status(409).json({
        message: 'Vous avez déjà postulé pour cet évènement'
      });
      return;
    }

    // Vérifier si l'humoriste s'est retiré de cet évènement
    const hasWithdrawn = event.withdrawnComedians &&
      event.withdrawnComedians.some(id => id.toString() === comedianObjectId.toString());

    if (hasWithdrawn) {
      res.status(409).json({
        message: 'Vous ne pouvez pas postuler à nouveau après vous être retiré de cet évènement'
      });
      return;
    }

    // Vérifier si l'humoriste est déjà accepté à un évènement simultané
    const targetDateStr = event.date ? new Date(event.date).toISOString().split('T')[0] : '';
    const targetStart = (event.startTime ?? '00:00').trim();
    const targetEnd = (event.endTime ?? '23:59').trim();

    if (targetDateStr) {
      const acceptedApplications = await ApplicationModel.find({
        comedian: comedianObjectId,
        event: { $ne: eventObjectId },
        status: 'ACCEPTED'
      }).populate<{ event: EventDocument }>('event');

      const hasConflict = acceptedApplications.some(app => {
        const ev = app.event as EventDocument | null;
        if (!ev || !ev.date) return false;
        const otherDateStr = new Date(ev.date).toISOString().split('T')[0];
        if (otherDateStr !== targetDateStr) return false;
        const otherStart = (ev.startTime ?? '00:00').trim();
        const otherEnd = (ev.endTime ?? '23:59').trim();
        // Overlap si les plages horaires se chevauchent
        return targetStart < otherEnd && otherStart < targetEnd;
      });

      if (hasConflict) {
        res.status(409).json({
          message: 'Vous êtes déjà accepté à un autre événement qui se déroule au même moment.'
        });
        return;
      }
    }

    // Créer l'application
    const application = new ApplicationModel({
      event: eventObjectId,
      comedian: comedianObjectId,
      performanceDetails: performanceDetails || {},
      message: message || '',
      status: 'PENDING'
    });

    await application.save();

    // Émettre un évènement SSE pour notifier tous les clients (non-bloquant)
    try {
      emitApplicationCreated(application._id.toString(), eventId);
    } catch (sseError) {
      console.error('⚠️ Erreur lors de l\'émission SSE (non-bloquant):', sseError);
      // Ne pas throw, continuer le flux
    }

    // ========== OPÉRATIONS CRITIQUES AVEC ROLLBACK ==========
    // L'ordre est important pour maintenir la cohérence des stats

    // 1. Mettre à jour les statistiques du comédien (CRITIQUE - doit réussir)
    // Utilisation de $inc pour éviter les ValidationError sur le document User complet
    try {
      await UserModel.findByIdAndUpdate(
        comedianId,
        { $inc: { 'stats.applicationsSent': 1 } },
        { runValidators: false }
      );
    } catch (statsError) {
      console.error('❌ ERREUR CRITIQUE : Échec de la mise à jour des stats');
      console.error('🔄 ROLLBACK : Suppression de l\'application créée');

      // ROLLBACK : Supprimer l'application créée
      try {
        await ApplicationModel.findByIdAndDelete(application._id);
        console.log('✅ Rollback réussi : application supprimée');
      } catch (rollbackError) {
        console.error('💥 ÉCHEC DU ROLLBACK:', rollbackError);
      }

      throw new Error('Échec de la mise à jour des statistiques');
    }

    // 2. Ajouter l'application à l'évènement (CRITIQUE - doit réussir)
    // Utilisation de $push pour éviter race conditions et ValidationError
    try {
      await EventModel.findByIdAndUpdate(
        eventObjectId,
        { $push: { applications: application._id } },
        { runValidators: false }
      );
    } catch (eventUpdateError) {
      console.error('❌ ERREUR CRITIQUE : Échec de la mise à jour de l\'événement');
      console.error('🔄 ROLLBACK : Suppression de l\'application ET décrémentation des stats');

      // ROLLBACK : Supprimer l'application ET décrémenter les stats
      try {
        await ApplicationModel.findByIdAndDelete(application._id);
        await UserModel.findByIdAndUpdate(
          comedianId,
          { $inc: { 'stats.applicationsSent': -1 } },
          { runValidators: false }
        );
        console.log('✅ Rollback réussi : application supprimée et stats décrémentées');
      } catch (rollbackError) {
        console.error('💥 ÉCHEC DU ROLLBACK:', rollbackError);
        // TODO: Alerter l'équipe technique (Sentry, Slack, etc.)
      }

      throw new Error('Échec de la mise à jour de l\'événement');
    }

    // Envoyer une notification email à l'organisateur
    try {
      const organizer = await UserModel.findById(event.organizer);
      const comedian = await UserModel.findById(comedianId);
      if (organizer && comedian) {
        await sendApplicationNotificationToOrganizer(
          event,
          comedian,
          organizer,
          { performanceDetails, message }
        );
      }
    } catch (emailError) {
      console.error('Erreur lors de l\'envoi de la notification à l\'organisateur:', emailError);
    }

    // Créer une notification in-app pour l'organisateur
    try {
      const organizer = await UserModel.findById(event.organizer);
      const comedian = await UserModel.findById(comedianId);
      if (organizer && comedian && organizer.role === 'ORGANIZER') {
        await createNotification(
          organizer._id.toString(),
          'new_application',
          'Nouvelle candidature',
          `${comedian.firstName} ${comedian.lastName} a postulé pour l'évènement "${event.title}"`,
          event._id.toString(),
          application._id.toString(),
          comedian._id.toString()
        );
      }
    } catch (notificationError) {
      console.error('Erreur lors de la création de la notification in-app:', notificationError);
      // Ne pas faire échouer la création de l'application
    }

    res.status(201).json({
      message: 'Application soumise avec succès',
      application
    });
  } catch (error) {
    console.error('Erreur lors de la création de l\'application:', error);
    res.status(500).json({ message: 'Erreur lors de la soumission de l\'application' });
  }
};

export const getEventApplications = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { eventId } = req.params;
    const organizerId = req.user?.id;

    if (!organizerId) {
      res.status(401).json({
        message: 'Non autorisé'
      });
      return;
    }

    // Valider l'ID de l'évènement
    if (!Types.ObjectId.isValid(eventId)) {
      res.status(400).json({
        message: 'ID d\'évènement invalide'
      });
      return;
    }

    // Vérifier la propriété de l'organisateur
    const event = await EventModel.findOne({
      _id: eventId,
      organizer: organizerId
    });

    if (!event) {
      res.status(403).json({
        message: 'Vous n\'avez pas la permission de consulter ces applications'
      });
      return;
    }

    // Récupérer les applications
    const applications = await ApplicationModel.find({ event: eventId })
      .populate('comedian', 'firstName lastName email phone profile')
      .sort({ createdAt: -1 });

    res.json({ applications });
  } catch (error) {
    console.error('Erreur lors de la récupération des applications de l\'évènement:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération des applications' });
  }
};

export const updateApplicationStatus = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { applicationId } = req.params;
    const { status, organizerMessage } = req.body;

    const application = await ApplicationModel.findById(applicationId).populate<{ event: IPopulatedEvent }>('event');
    if (!application) {
      res.status(404).json({ message: 'Candidature non trouvée' });
      return;
    }

    // Vérifier si l'utilisateur est l'organisateur de l'évènement
    const isOrganizer = (application.event as IPopulatedEvent).organizer._id.toString() === req.user?.id;
    if (!isOrganizer) {
      res.status(403).json({ message: 'Non autorisé à modifier cette candidature' });
      return;
    }

    // Validation de capacité pour les acceptations
    if (status === 'ACCEPTED') {
      const event = application.event as IPopulatedEvent;
      const maxPerformers = event.requirements?.maxPerformers;

      // Vérifier seulement si une limite est définie
      if (maxPerformers && maxPerformers > 0) {
        const currentParticipants = event.participants?.length || 0;

        // Vérifier si le comédien est déjà participant (cas de ré-acceptation)
        const comedianId = application.comedian;
        const isAlreadyParticipant = event.participants?.some(
          p => p.toString() === comedianId.toString()
        );

        // Si pas déjà participant et l'évènement est complet, rejeter
        if (!isAlreadyParticipant && currentParticipants >= maxPerformers) {
          res.status(409).json({
            message: `L'évènement est complet (${currentParticipants}/${maxPerformers} participants)`
          });
          return;
        }
      }
    }

    const updateData: any = { status };
    if (organizerMessage !== undefined) {
      updateData.organizerMessage = organizerMessage;
    }

    // 🚨 IMPORTANT: Récupérer l'ancien statut AVANT la mise à jour pour la logique des stats
    const oldStatus = application.status;

    const updatedApplication = await ApplicationModel.findByIdAndUpdate(
      applicationId,
      updateData,
      { new: true }
    ).populate<{ event: IPopulatedEvent; comedian: IPopulatedUser }>('event').populate('comedian');

    // Émettre un évènement SSE pour notifier tous les clients
    if (updatedApplication) {
      const eventId = (updatedApplication.event as any)?._id?.toString() || updatedApplication.event?.toString() || '';
      emitApplicationStatusChanged(applicationId, status, eventId);
    }

    // Ajout du participant à l'évènement si la candidature est acceptée
    if (status === 'ACCEPTED' && updatedApplication && updatedApplication.event && updatedApplication.comedian) {
      // L'identifiant peut être dans _id ou directement l'objet
      const eventId = (updatedApplication.event as any)._id || updatedApplication.event;
      const comedianId = (updatedApplication.comedian as any)._id || updatedApplication.comedian;
      await EventModel.findByIdAndUpdate(
        eventId,
        { $addToSet: { participants: comedianId } } // $addToSet évite les doublons
      );

      // Reset du boost si l'evenement avait une annulation tardive (remplacant trouve)
      const event = await EventModel.findById(eventId);
      if (event?.hasLateCancellation) {
        console.log(`✅ Remplacant trouve pour "${event.title}" - Reset du boost d'annulation tardive`);
        await EventModel.findByIdAndUpdate(eventId, {
          hasLateCancellation: false,
          lateCancellationAt: null
        });
      }

      // Annulation par la plateforme des autres candidatures au même créneau (même date + même heure)
      // sans impacter les statistiques de l'humoriste
      const acceptedEventIdStr = (event?._id || eventId).toString();
      const acceptedDateStr = event?.date ? new Date(event.date).toISOString().split('T')[0] : '';
      const acceptedStartTime = (event?.startTime ?? '00:00').trim();

      if (acceptedDateStr && acceptedStartTime) {
        const otherApplications = await ApplicationModel.find({
          comedian: comedianId,
          _id: { $ne: applicationId },
          status: { $in: ['PENDING', 'ACCEPTED'] }
        }).populate<{ event: EventDocument }>('event');

        const overlapping = otherApplications.filter(app => {
          const ev = app.event as EventDocument | null;
          if (!ev || !ev.date) return false;
          const otherId = (ev._id || ev).toString();
          if (otherId === acceptedEventIdStr) return false;
          const otherDateStr = new Date(ev.date).toISOString().split('T')[0];
          const otherStartTime = (ev.startTime || '00:00').trim();
          return otherDateStr === acceptedDateStr && otherStartTime === acceptedStartTime;
        });

        for (const app of overlapping) {
          const wasAccepted = app.status === 'ACCEPTED';
          const otherEventId = (app.event as any)._id || app.event;
          await ApplicationModel.findByIdAndUpdate(app._id, { status: 'CANCELLED_BY_PLATFORM' });
          if (wasAccepted) {
            await EventModel.findByIdAndUpdate(
              otherEventId,
              { $pull: { participants: comedianId } }
            );
          }
          emitApplicationStatusChanged(app._id.toString(), 'CANCELLED_BY_PLATFORM', otherEventId?.toString() || '');
        }
        if (overlapping.length > 0) {
          console.log(`🔄 [PLATFORM] ${overlapping.length} candidature(s) au même créneau annulée(s) pour le comédien`);
        }
      }
    }

    // Retrait du participant si le statut passe de ACCEPTED à autre chose
    if (oldStatus === 'ACCEPTED' && status !== 'ACCEPTED' && updatedApplication && updatedApplication.event && updatedApplication.comedian) {
      const eventId = (updatedApplication.event as any)._id || updatedApplication.event;
      const comedianId = (updatedApplication.comedian as any)._id || updatedApplication.comedian;
      await EventModel.findByIdAndUpdate(
        eventId,
        { $pull: { participants: comedianId } }
      );
    }

    // 🎪 AJOUT: Mise à jour des statistiques de l'humoriste
    if (updatedApplication && updatedApplication.comedian) {
      const comedianId = (updatedApplication.comedian as any)._id || updatedApplication.comedian;
      const comedian = await UserModel.findById(comedianId);

      if (comedian) {
        if (!comedian.stats) {
          comedian.stats = {};
        }

        console.log(`📊 [STATS UPDATE] ${comedian.firstName} ${comedian.lastName}: ${oldStatus} → ${status}`);

        // Logique pour applicationsAccepted
        if (status === 'ACCEPTED' && oldStatus !== 'ACCEPTED') {
          comedian.stats.applicationsAccepted = (comedian.stats.applicationsAccepted || 0) + 1;
          // Note: totalEvents sera incrémenté lors de la complétion de l'évènement via processCompletedEvents
        } else if (status !== 'ACCEPTED' && oldStatus === 'ACCEPTED') {
          comedian.stats.applicationsAccepted = Math.max(0, (comedian.stats.applicationsAccepted || 0) - 1);
          // Note: totalEvents est uniquement géré par processCompletedEvents
        }

        // Logique pour applicationsRejected
        if (status === 'REJECTED' && oldStatus !== 'REJECTED') {
          comedian.stats.applicationsRejected = (comedian.stats.applicationsRejected || 0) + 1;
        } else if (status !== 'REJECTED' && oldStatus === 'REJECTED') {
          comedian.stats.applicationsRejected = Math.max(0, (comedian.stats.applicationsRejected || 0) - 1);
        }

        // Logique pour applicationsPending
        if (status === 'PENDING' && oldStatus !== 'PENDING') {
          comedian.stats.applicationsPending = (comedian.stats.applicationsPending || 0) + 1;
        } else if (status !== 'PENDING' && oldStatus === 'PENDING') {
          comedian.stats.applicationsPending = Math.max(0, (comedian.stats.applicationsPending || 0) - 1);
        }

        // Logique pour EXPIRED - décrémente applicationsPending si transition PENDING → EXPIRED
        // Note: Déjà géré par la logique ci-dessus, mais explicité ici pour clarté
        if (status === 'EXPIRED' && oldStatus === 'PENDING') {
          console.log(`⏰ Application expirée pour ${comedian.firstName} ${comedian.lastName}`);
        }

        comedian.markModified('stats');
        await comedian.save();
        console.log(`💾 Stats sauvegardées pour ${comedian.firstName} ${comedian.lastName}`);
      }
    }

    // Envoi du mail à l'humoriste lors de l'acceptation ou du refus
    if (updatedApplication && updatedApplication.comedian && updatedApplication.event && (status === 'ACCEPTED' || status === 'REJECTED')) {
      // Récupère l'id de l'évènement de façon robuste
      const eventId = (typeof updatedApplication.event === 'object' && updatedApplication.event !== null && '_id' in updatedApplication.event)
        ? (updatedApplication.event as any)._id
        : updatedApplication.event;
      const event = await EventModel.findById(eventId).populate('organizer');
      const organizer = event && event.organizer ? event.organizer : null;
      if (event && organizer) {
        sendApplicationStatusToComedian(
          updatedApplication.comedian,
          event,
          organizer,
          status,
          organizerMessage || ''
        ).then(() => {
          console.log(`[EMAIL] Succès de l'envoi à l'humoriste (${(updatedApplication.comedian as any).email}) pour statut ${status}`);
        }).catch(err => {
          console.error(`[EMAIL] Erreur lors de l'envoi à l'humoriste (${(updatedApplication.comedian as any).email}) :`, err);
        });
      }

      // Créer une notification in-app pour l'humoriste
      try {
        const comedianId = (updatedApplication.comedian as any)._id?.toString() || updatedApplication.comedian?.toString();
        const comedian = await UserModel.findById(comedianId);
        if (comedian && comedian.role === 'COMEDIAN') {
          const notificationType = status === 'ACCEPTED' ? 'application_accepted' : 'application_rejected';
          const notificationTitle = status === 'ACCEPTED' 
            ? 'Candidature acceptée 🎉'
            : 'Candidature refusée';
          const notificationMessage = status === 'ACCEPTED'
            ? `Votre candidature pour l'évènement "${event.title}" a été acceptée !`
            : `Votre candidature pour l'évènement "${event.title}" n'a pas été retenue.`;
          
          await createNotification(
            comedianId,
            notificationType,
            notificationTitle,
            notificationMessage,
            eventId.toString(),
            updatedApplication._id.toString(),
            organizer._id?.toString() || organizer.toString()
          );
        }
      } catch (notificationError) {
        console.error('Erreur lors de la création de la notification in-app pour l\'humoriste:', notificationError);
        // Ne pas faire échouer l'opération principale
      }
    }

    res.json(updatedApplication);
  } catch (error) {
    console.error('Erreur lors de la mise à jour du statut de l\'application:', error);
    res.status(500).json({ message: 'Erreur lors de la mise à jour du statut de l\'application' });
  }
};

export const getComedianApplications = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const comedianId = req.user?.id;

    if (!comedianId) {
      res.status(401).json({
        message: 'Non autorisé'
      });
      return;
    }

    // Vérifier que l'utilisateur est un humoriste
    const user = await UserModel.findById(comedianId);
    if (!user || user.role !== 'COMEDIAN') {
      res.status(403).json({
        message: 'Seuls les humoristes peuvent accéder à leurs applications'
      });
      return;
    }

    const applications = await ApplicationModel.find({
      comedian: comedianId,
      status: { $ne: 'WITHDRAWN' }
    })
      .populate({
        path: 'event',
        select: 'title date location status'
      })
      .sort({ createdAt: -1 });

    // Transformer les applications pour ajouter avatarUrl à chaque humoriste
    const transformedApplications = applications.map(app => {
      const appObj: any = app.toObject ? app.toObject() : app;
      if (appObj.comedian) {
        appObj.comedian = {
          ...appObj.comedian,
          avatarUrl: buildAvatarDataUrl(appObj.comedian)
        };
        // Supprimer le champ avatar pour ne pas l'envoyer au client
        if ('avatar' in appObj.comedian) {
          delete appObj.comedian.avatar;
        }
      }
      return appObj;
    });

    res.json({ applications: transformedApplications });
  } catch (error) {
    console.error('Erreur lors de la récupération des applications de l\'humoriste:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération des applications' });
  }
};

/**
 * Vérifie si une candidature existe déjà pour un comédien et un évènement
 */
export const checkApplicationExists = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { eventId, comedianId } = req.params;
    const existingApplication = await ApplicationModel.findOne({
      event: new Types.ObjectId(eventId),
      comedian: new Types.ObjectId(comedianId),
    });
    res.json({ hasApplied: !!existingApplication });
  } catch (error) {
    console.error('Erreur lors de la vérification de la candidature:', error);
    res.status(500).json({ message: 'Erreur lors de la vérification de la candidature' });
  }
};

/**
 * Récupère toutes les candidatures visibles par l'utilisateur
 * Filtre selon le rôle: Super Admin voit tout, Comédien voit les siennes, Organisateur voit celles de ses évènements
 */
export const getAllApplications = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ message: 'Utilisateur non authentifié.' });
      return;
    }

    const { status, eventId } = req.query as { status?: string | string[]; eventId?: string };

    // Construire un filtre DB minimal si eventId est fourni
    const dbFilter: any = {};
    if (eventId && Types.ObjectId.isValid(eventId)) {
      dbFilter.event = new Types.ObjectId(eventId);
    }

    // Récupérer les candidatures (avec filtre éventuel par eventId)
    const applications = await ApplicationModel.find(dbFilter).select('+performanceDetails +message +organizerMessage')
      .populate({
        path: 'event',
        select: 'title date startTime endTime organizer location updatedAt modifiedByOrganizer status requirements participants',
        populate: {
          path: 'organizer',
          select: 'firstName lastName email'
        }
      })
      .populate({
        path: 'comedian',
        select: 'firstName lastName email phone avatarUrl profile avatar'
      });

    // Récupérer les informations de l'utilisateur pour vérifier son rôle
    const currentUser = await UserModel.findById(userId);
    const isSuperAdmin = currentUser && currentUser.role === 'SUPER_ADMIN';

    // Filtrage JS : l'utilisateur est soit le comédien, soit l'organisateur de l'évènement, soit un super admin
    let filteredApplications = applications.filter(app => {
      // Super admin peut voir toutes les candidatures
      if (isSuperAdmin) {
        return true;
      }

      const isComedian = app.comedian && (app.comedian as any)._id.toString() === userId;
      const isOrganizer = app.event && (app.event as any).organizer && (app.event as any).organizer._id.toString() === userId;
      return isComedian || isOrganizer;
    });

    // Filtrage par statut si demandé
    if (status) {
      const statusArray = Array.isArray(status) ? status : [status];
      filteredApplications = filteredApplications.filter(app => statusArray.includes(app.status));
    }

    // Transformer les applications pour ajouter avatarUrl à chaque humoriste
    const transformedApplications = filteredApplications.map(app => {
      const appObj: any = app.toObject ? app.toObject() : app;
      if (appObj.comedian) {
        appObj.comedian = {
          ...appObj.comedian,
          avatarUrl: buildAvatarDataUrl(appObj.comedian)
        };
        // Supprimer le champ avatar pour ne pas l'envoyer au client
        if ('avatar' in appObj.comedian) {
          delete appObj.comedian.avatar;
        }
      }
      return appObj;
    });

    res.json(transformedApplications);
  } catch (error) {
    console.error('Erreur lors de la récupération des candidatures:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération des candidatures' });
  }
};

/**
 * Récupère une candidature spécifique avec vérification d'autorisation
 */
export const getApplicationById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { applicationId } = req.params;
    const application = await ApplicationModel.findById(applicationId)
      .populate<{ event: IPopulatedEvent; comedian: IPopulatedUser }>('event')
      .populate('comedian');

    if (!application) {
      res.status(404).json({ message: 'Candidature non trouvée' });
      return;
    }

    // Vérifier si l'utilisateur est le candidat ou l'organisateur de l'évènement
    const isComedian = (application.comedian as IPopulatedUser)._id.toString() === req.user?.id;
    const isOrganizer = (application.event as IPopulatedEvent).organizer._id.toString() === req.user?.id;

    if (!isComedian && !isOrganizer) {
      res.status(403).json({ message: 'Non autorisé à voir cette candidature' });
      return;
    }

    // Transformer l'application pour ajouter avatarUrl à l'humoriste
    const appObj: any = application.toObject ? application.toObject() : application;
    if (appObj.comedian) {
      appObj.comedian = {
        ...appObj.comedian,
        avatarUrl: buildAvatarDataUrl(appObj.comedian)
      };
      // Supprimer le champ avatar pour ne pas l'envoyer au client
      if ('avatar' in appObj.comedian) {
        delete appObj.comedian.avatar;
      }
    }

    res.json(appObj);
  } catch (error) {
    console.error('Erreur lors de la récupération de la candidature:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération de la candidature' });
  }
};

/**
 * Confirme la participation d'un comédien à un évènement
 */
export const confirmParticipation = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    console.log('🎪 DEBUT confirm participation');
    console.log('🎪 Application ID:', req.params.applicationId);
    console.log('🎪 User ID:', req.user?.id);

    const { applicationId } = req.params;
    const comedianId = req.user?.id;

    if (!comedianId) {
      console.log('❌ Non authentifié');
      res.status(401).json({ message: 'Non authentifié' });
      return;
    }

    // Trouver la candidature
    const application = await ApplicationModel.findById(applicationId);
    console.log('🔍 Application trouvée:', !!application);

    if (!application) {
      res.status(404).json({ message: 'Candidature non trouvée' });
      return;
    }

    // Vérifier propriétaire
    if (application.comedian.toString() !== comedianId) {
      console.log('❌ Pas le bon propriétaire');
      res.status(403).json({ message: 'Non autorisé' });
      return;
    }

    // Mettre à jour l'évènement
    const event = await EventModel.findByIdAndUpdate(
      application.event,
      { modifiedByOrganizer: false },
      { new: true }
    );

    console.log('✅ Event modifié:', !!event);

    res.json({
      success: true,
      message: 'Participation confirmée'
    });
  } catch (error) {
    console.error('❌ ERREUR:', error);
    res.status(500).json({
      message: 'Erreur serveur',
      error: error instanceof Error ? error.message : 'Erreur inconnue'
    });
  }
};

/**
 * Retire une candidature en changeant son statut à WITHDRAWN
 * Conserve la candidature dans la base de données mais la marque comme retirée
 */
export const deleteApplication = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { applicationId } = req.params;
    const application = await ApplicationModel.findById(applicationId).populate<{ event: IPopulatedEvent; comedian: IPopulatedUser }>('event').populate('comedian');

    if (!application) {
      res.status(404).json({ message: 'Candidature non trouvée' });
      return;
    }

    // Vérifier si l'utilisateur est le candidat ou l'organisateur de l'évènement
    const isComedian = (application.comedian as IPopulatedUser)._id.toString() === req.user?.id;
    const isOrganizer = (application.event as IPopulatedEvent).organizer._id.toString() === req.user?.id;

    if (!isComedian && !isOrganizer) {
      res.status(403).json({ message: 'Non autorisé à retirer cette candidature' });
      return;
    }

    // Pour l'humoriste : à partir d'1 h avant le début, plus de désinscription possible
    if (isComedian && application.event && isEventWithinOneHour(application.event as any)) {
      res.status(400).json({
        message: 'Impossible de vous désinscrire : l\'événement commence dans moins d\'une heure ou a déjà commencé.'
      });
      return;
    }

    // Si la candidature était ACCEPTED, retirer le comédien des participants de l'évènement
    // ET ajouter le comédien aux withdrawnComedians pour empêcher une nouvelle candidature
    try {
      if (application.event && application.comedian) {
        const eventId = (application.event as any)._id || application.event;
        const comedianId = (application.comedian as any)._id || application.comedian;

        // Si accepté, retirer des participants
        if (application.status === 'ACCEPTED') {
          await EventModel.findByIdAndUpdate(eventId, { $pull: { participants: comedianId } });
        }

        // Dans tous les cas, ajouter aux withdrawnComedians pour empêcher re-candidature
        await EventModel.findByIdAndUpdate(eventId, {
          $addToSet: { withdrawnComedians: comedianId }
        });
      }
    } catch (e) {
      console.error('Erreur lors du retrait du participant de l\'évènement:', e);
    }

    // 🎪 MISE À JOUR DES STATS: Décrémenter les compteurs selon le statut actuel
    const oldStatus = application.status;
    const comedianId = (application.comedian as any)._id || application.comedian;
    const comedian = await UserModel.findById(comedianId);

    // Variables pour l'annulation tardive (declarees avant la sauvegarde)
    let isLateCancellation = false;
    let hoursUntilEvent = 0;
    let totalLateCancellations = 0;

    if (comedian) {
      if (!comedian.stats) {
        comedian.stats = {};
      }

      console.log(`📊 [STATS UPDATE - WITHDRAWN] ${comedian.firstName} ${comedian.lastName}: ${oldStatus} → WITHDRAWN`);

      // Décrémenter le compteur approprié selon le statut actuel
      if (oldStatus === 'PENDING') {
        comedian.stats.applicationsPending = Math.max(0, (comedian.stats.applicationsPending || 0) - 1);
      } else if (oldStatus === 'ACCEPTED') {
        comedian.stats.applicationsAccepted = Math.max(0, (comedian.stats.applicationsAccepted || 0) - 1);
      } else if (oldStatus === 'REJECTED') {
        comedian.stats.applicationsRejected = Math.max(0, (comedian.stats.applicationsRejected || 0) - 1);
      }

      // 🚨 DÉTECTION ANNULATION TARDIVE (< 72h) - AVANT la sauvegarde!
      if (oldStatus === 'ACCEPTED') {
        const event = (application.event as IPopulatedEvent);
        hoursUntilEvent = (new Date(event.date).getTime() - Date.now()) / (1000 * 60 * 60);

        if (hoursUntilEvent > 0 && hoursUntilEvent < 72) {
          isLateCancellation = true;
          console.log(`🚨 ANNULATION TARDIVE DÉTECTÉE: ${comedian.firstName} ${comedian.lastName} - ${hoursUntilEvent.toFixed(1)}h avant l'événement`);

          // Incrémenter le compteur d'annulations tardives AVANT la sauvegarde
          comedian.stats.lateCancellations = (comedian.stats.lateCancellations || 0) + 1;
          totalLateCancellations = comedian.stats.lateCancellations;
          console.log(`📊 Compteur lateCancellations incrémenté: ${totalLateCancellations}`);
        }
      }

      // Sauvegarder TOUTES les stats (y compris lateCancellations si applicable)
      comedian.markModified('stats');
      await comedian.save();
      console.log(`💾 Stats sauvegardées après retrait pour ${comedian.firstName} ${comedian.lastName}`);

      // 🚨 TRAITEMENT ANNULATION TARDIVE (notifications, emails, etc.)
      if (isLateCancellation && oldStatus === 'ACCEPTED') {
        const event = (application.event as IPopulatedEvent);
        const eventId = (application.event as any)._id || application.event;

        // 1. Marquer l'événement pour boost dans les recommandations
        await EventModel.findByIdAndUpdate(eventId, {
          hasLateCancellation: true,
          lateCancellationAt: new Date()
        });

        // 2. Récupérer les données de l'organisateur
        const organizer = await UserModel.findById(event.organizer._id || event.organizer);

        if (organizer) {
            // 4. Créer notification in-app pour l'organisateur
            await createNotification(
              organizer._id.toString(),
              'late_cancellation_organizer',
              '⚠️ Désistement tardif',
              `${comedian.firstName} ${comedian.lastName} s'est désisté à ${hoursUntilEvent.toFixed(0)}h de l'événement "${event.title}". L'événement est mis en avant.`,
              eventId.toString(),
              (application._id as any).toString(),
              comedian._id.toString()
            );

            // 5. Créer notification in-app pour l'humoriste
            await createNotification(
              comedian._id.toString(),
              'late_cancellation_comedian',
              '⚠️ Désistement tardif enregistré',
              `Votre désistement pour "${event.title}" a été enregistré comme tardif. Total: ${totalLateCancellations} annulation(s) tardive(s).`,
              eventId.toString(),
              (application._id as any).toString()
            );

            // 6. Envoyer email à l'organisateur
            await sendLateCancellationToOrganizer(
              event,
              comedian,
              organizer,
              hoursUntilEvent
            );

            // 7. Envoyer email à l'humoriste
            await sendLateCancellationToComedian(
              event,
              comedian,
              hoursUntilEvent,
              totalLateCancellations
            );
          }

          // 8. Créer une alerte pour les super-admins
          await createLateCancellationAlert(
            application,
            comedian,
            event,
            hoursUntilEvent,
            totalLateCancellations
          );

          // 9. Émettre événement SSE pour temps réel
          emitLateCancellation(
            eventId.toString(),
            comedian._id.toString(),
            (application._id as any).toString()
          );

          // 10. Notifier les humoristes de la place disponible
          const eventDoc = await EventModel.findById(eventId);
          if (eventDoc) {
            const notificationNumber = (eventDoc.lateCancellationNotificationCount || 0) + 1;
            console.log(`📧 Notification #${notificationNumber} aux humoristes pour la place disponible sur "${event.title}"`);

            notifyComediansOfLateCancellationAsync(
              eventDoc,
              organizer || undefined,
              [comedian._id.toString()] // Exclure celui qui s'est désisté
            );

            // Mettre à jour le tracking
            eventDoc.lateCancellationNotifiedAt = new Date();
            eventDoc.lateCancellationNotificationCount = notificationNumber;
            await eventDoc.save();

            console.log(`✅ Notification #${notificationNumber} humoristes programmée pour "${event.title}"`);
          }

          console.log(`✅ Gestion de l'annulation tardive terminée pour ${comedian.firstName} ${comedian.lastName}`);
      } else if (oldStatus === 'ACCEPTED') {
        // Désistement « normal » (participant qui se désinscrit, hors cas tardif) → notifier l'organisateur par email
        const event = application.event as IPopulatedEvent;
        const organizer = await UserModel.findById(event.organizer._id || event.organizer)
          .select('firstName lastName email')
          .lean();
        if (organizer) {
          await sendWithdrawalNotificationToOrganizer(event, comedian, organizer);
        }
      }
    }

    // Au lieu de supprimer, changer le statut à WITHDRAWN
    await ApplicationModel.findByIdAndUpdate(applicationId, { status: 'WITHDRAWN' });

    // Émettre un évènement SSE pour notifier tous les clients
    const eventId = (application.event as any)?._id?.toString() || application.event?.toString() || '';
    emitApplicationWithdrawn(applicationId, eventId);

    res.status(204).send();
  } catch (error) {
    console.error('Erreur lors du retrait de la candidature:', error);
    res.status(500).json({ message: 'Erreur lors du retrait de la candidature' });
  }
};

/**
 * Expire toutes les candidatures en attente pour un évènement terminé
 * Appelé par le cron job lors du marquage de l'évènement comme completed
 * @param eventId - L'ID de l'évènement
 * @returns Le nombre de candidatures expirées
 */
export const expirePendingApplicationsForEvent = async (eventId: Types.ObjectId): Promise<number> => {
  try {
    const pendingApplications = await ApplicationModel.find({
      event: eventId,
      status: 'PENDING'
    }).populate('comedian');

    let expiredCount = 0;

    for (const application of pendingApplications) {
      // Mettre à jour le statut
      application.status = 'EXPIRED';
      await application.save();

      // Mettre à jour les stats du comédien
      if (application.comedian) {
        const comedianId = (application.comedian as any)._id || application.comedian;
        const comedian = await UserModel.findById(comedianId);

        if (comedian && comedian.stats) {
          comedian.stats.applicationsPending = Math.max(0, (comedian.stats.applicationsPending || 0) - 1);
          comedian.markModified('stats');
          await comedian.save();
          console.log(`📊 applicationsPending décrementé pour ${comedian.firstName} ${comedian.lastName}`);
        }
      }

      expiredCount++;
      console.log(`⏰ Candidature ${application._id} expirée`);
    }

    return expiredCount;
  } catch (error) {
    console.error(`❌ Erreur lors de l'expiration des candidatures:`, error);
    return 0;
  }
};

/**
 * Gère la réponse d'un humoriste après mise à jour d'évènement (via lien email avec token JWT)
 */
export const respondToEventUpdate = async (req: Request, res: Response): Promise<void> => {
  try {
    const { token, action } = req.query as { token?: string; action?: 'keep' | 'withdraw' };
    if (!token || !action) {
      res.status(400).send('Requête invalide');
      return;
    }

    try {
      const payload = jwt.verify(token, config.jwt.secret as string) as any;
      const applicationId = payload.applicationId as string;
      if (!applicationId) {
        res.status(400).send('Token invalide');
        return;
      }

      if (action === 'withdraw') {
        await ApplicationModel.findByIdAndDelete(applicationId);
        res.redirect(`${config.frontend.url}/applications?update=withdrawn`);
        return;
      }

      // keep: on ne change rien, simple confirmation
      res.redirect(`${config.frontend.url}/applications?update=kept`);
    } catch (_e) {
      res.status(400).send('Lien expiré ou invalide');
    }
  } catch (error) {
    console.error('Erreur lors du traitement de la réponse à la mise à jour:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};
