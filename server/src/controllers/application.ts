import { Request, Response } from 'express';
import { ApplicationModel } from '../models/Application';
import { EventModel } from '../models/Event';
import { AuthRequest } from '../middleware/auth';
import { EventDocument } from '../models/Event';
import { ApplicationDocument } from '../models/Application';
import { Event, Application } from '../types';
import { Types } from 'mongoose';
import { UserModel } from '../models/User';
import { SpectatorEventRatingModel } from '../models/SpectatorEventRating';
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
import { parsePaginationWithDefaults, buildPaginationResult } from '../utils/pagination';
import { FilterQuery } from 'mongoose';
import Logger from '../utils/logger';
import { detectZoneType, matchesMobilityZone, normalizeDepartment, getRegionByDepartment, FRENCH_REGIONS } from '../utils/geographicMatching';
import { escapeRegex } from '../utils/regex';
import { buildEventEndExpr } from '../utils/eventTiming';
import { ComedianTab, comedianTabMatchStages, isComedianTab } from '../utils/applicationTabs';

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
      const organizerId = event.organizer?.toString() || '';
      emitApplicationCreated(application._id.toString(), eventId, organizerId);
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
      const comedianId = (updatedApplication.comedian as any)?._id?.toString() || updatedApplication.comedian?.toString() || '';
      const organizerId = (updatedApplication.event as any)?.organizer?._id?.toString() || (updatedApplication.event as any)?.organizer?.toString() || '';
      const targets = [comedianId, organizerId].filter(Boolean);
      emitApplicationStatusChanged(applicationId, status, eventId, targets);
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
          emitApplicationStatusChanged(app._id.toString(), 'CANCELLED_BY_PLATFORM', otherEventId?.toString() || '', [comedianId]);

          // Notif persistée : sans ça, le comédien perd une place sans trace s'il n'est pas connecté
          const overlapEvent = app.event as EventDocument | null;
          await createNotification(
            comedianId,
            'application_rejected',
            'Candidature annulée automatiquement',
            `Votre candidature pour "${overlapEvent?.title ?? 'un autre événement'}" a été annulée automatiquement car elle chevauchait un autre événement que vous venez d'accepter.`,
            otherEventId?.toString(),
            app._id.toString()
          );
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
          Logger.info(`[EMAIL] Succès de l'envoi à l'humoriste pour statut ${status}`, { applicationId: updatedApplication._id });
        }).catch(err => {
          Logger.error(`[EMAIL] Erreur lors de l'envoi à l'humoriste`, { applicationId: updatedApplication._id, error: err });
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

type ApplicationScope =
  | { ok: false; status: number; body: Record<string, unknown> }
  | {
      ok: true;
      role: string;
      dbFilter: FilterQuery<ApplicationDocument>;
      resolvedExperienceLevel: '0-50' | '50-200' | '200+' | null;
      comedianTab?: ComedianTab;
      queryTimeScope?: 'upcoming' | 'past';
    };

/**
 * Résout le périmètre d'une requête sur les candidatures : rôle + ownership, filtres
 * optionnels (eventId / status / comedianId / zone / experienceLevel), onglet humoriste
 * et timeScope. Partagé par la LISTE (getAllApplications) et les COMPTEURS
 * (getApplicationTabCounts) → un seul endroit résout les garde-fous d'accès.
 */
async function resolveApplicationScope(req: AuthRequest, userId: string): Promise<ApplicationScope> {
  const { status, eventId, comedianId, tab, zone, experienceLevel, timeScope } = req.query as Record<string, string | string[] | undefined>;
  const currentUser = await UserModel.findById(userId).select('role').lean();

  const dbFilter: FilterQuery<ApplicationDocument> = {};
  let ownedEventIds: Types.ObjectId[] | undefined;
  let comedianTab: ComedianTab | undefined;

  if (currentUser?.role === 'SUPER_ADMIN') {
    // no role filter
  } else if (currentUser?.role === 'COMEDIAN') {
    dbFilter.comedian = new Types.ObjectId(userId);
    if (isComedianTab(tab)) comedianTab = tab;
  } else if (currentUser?.role === 'ORGANIZER') {
    ownedEventIds = (await EventModel.find({ organizer: userId }).distinct('_id')) as Types.ObjectId[];
    dbFilter.event = { $in: ownedEventIds };
  } else {
    return { ok: false, status: 403, body: { error: 'Accès refusé' } };
  }

  // Optional filters — role-aware guards, never replace ownership constraints
  if (eventId && !Array.isArray(eventId) && Types.ObjectId.isValid(eventId)) {
    if (currentUser?.role === 'ORGANIZER') {
      const eventObjectId = new Types.ObjectId(eventId);
      if (!ownedEventIds!.some(id => id.equals(eventObjectId))) {
        return { ok: false, status: 403, body: { error: 'Accès refusé' } };
      }
      dbFilter.event = eventObjectId;
    } else {
      // COMEDIAN or SUPER_ADMIN: safe narrowing on own data / admin access
      dbFilter.event = new Types.ObjectId(eventId);
    }
  }
  if (status) {
    const statusArray = Array.isArray(status) ? status : [status];
    dbFilter.status = { $in: statusArray };
  }
  if (comedianId && !Array.isArray(comedianId) && Types.ObjectId.isValid(comedianId)) {
    if (currentUser?.role === 'COMEDIAN') {
      if (comedianId !== userId) {
        return { ok: false, status: 403, body: { error: 'Accès refusé' } };
      }
      // Filter already set to own userId — no override needed
    } else {
      // ORGANIZER: narrowing within owned events; SUPER_ADMIN: no restriction
      dbFilter.comedian = new Types.ObjectId(comedianId);
    }
  }

  const VALID_EXPERIENCE_LEVELS = ['0-50', '50-200', '200+'] as const;
  type ExperienceLevelValue = typeof VALID_EXPERIENCE_LEVELS[number];
  const isOrganizerOrAdmin = currentUser?.role === 'ORGANIZER' || currentUser?.role === 'SUPER_ADMIN';

  const resolvedExperienceLevel: ExperienceLevelValue | null =
    isOrganizerOrAdmin &&
    experienceLevel &&
    !Array.isArray(experienceLevel) &&
    (VALID_EXPERIENCE_LEVELS as readonly string[]).includes(experienceLevel)
      ? (experienceLevel as ExperienceLevelValue)
      : null;

  if (isOrganizerOrAdmin && zone && !Array.isArray(zone) && zone.trim() && !comedianId) {
    const searchZone = await detectZoneType(zone.trim());

    // Pré-filtre DB : ne charge que les comédiens dont au moins une mobilityZone
    // peut potentiellement matcher (superset du match exact via matchesMobilityZone).
    const candidateDepts = new Set<string>();
    const candidateRegions = new Set<string>();
    if (searchZone.type === 'ville') {
      if (searchZone.department) candidateDepts.add(searchZone.department);
      if (searchZone.region) candidateRegions.add(searchZone.region);
    } else if (searchZone.type === 'departement') {
      candidateDepts.add(normalizeDepartment(searchZone.value));
      const r = getRegionByDepartment(searchZone.value);
      if (r) candidateRegions.add(r);
    } else if (searchZone.type === 'region') {
      candidateRegions.add(searchZone.value);
      (FRENCH_REGIONS[searchZone.value] || []).forEach(d => candidateDepts.add(d));
    }

    const cityRegex = new RegExp(escapeRegex(searchZone.value), 'i');
    const orPrefilter: Array<Record<string, unknown>> = [
      { 'profile.mobilityZone': { $elemMatch: { type: 'ville', value: cityRegex } } },
    ];
    if (candidateDepts.size > 0) {
      orPrefilter.push({ 'profile.mobilityZone': { $elemMatch: { type: 'departement', value: { $in: [...candidateDepts] } } } });
    }
    if (candidateRegions.size > 0) {
      orPrefilter.push({ 'profile.mobilityZone': { $elemMatch: { type: 'region', value: { $in: [...candidateRegions] } } } });
    }

    const candidates = await UserModel.find({ role: 'COMEDIAN', $or: orPrefilter })
      .select('_id profile.mobilityZone')
      .lean();

    const matchingComedianIds = candidates
      .filter((c: any) => {
        const mobilityZones = c.profile?.mobilityZone;
        if (!mobilityZones || mobilityZones.length === 0) return false;
        return mobilityZones.some((mz: any) => matchesMobilityZone(mz, searchZone));
      })
      .map((c: any) => c._id as Types.ObjectId);
    dbFilter.comedian = { $in: matchingComedianIds };
  }

  const queryTimeScope = (!Array.isArray(timeScope) && (timeScope === 'upcoming' || timeScope === 'past')) ? timeScope : undefined;

  return { ok: true, role: currentUser!.role, dbFilter, resolvedExperienceLevel, comedianTab, queryTimeScope };
}

/**
 * Base commune du pipeline : filtre + exclusion des candidatures orphelines
 * (comedian/event supprimé) + calcul optionnel de `_eventEnd` (règle timing partagée).
 * Sans ça le count gonfle et la pagination affiche moins d'items que le compteur.
 */
function buildApplicationBasePipeline(
  dbFilter: FilterQuery<ApplicationDocument>,
  resolvedExperienceLevel: string | null,
  withEventEnd: boolean,
): Record<string, unknown>[] {
  return [
    { $match: dbFilter },
    {
      $lookup: {
        from: 'users',
        localField: 'comedian',
        foreignField: '_id',
        as: 'comedianDoc',
        pipeline: [{ $project: { _id: 1, 'profile.numberOfScenes': 1 } }],
      },
    },
    { $match: { 'comedianDoc.0': { $exists: true } } },
    ...(resolvedExperienceLevel ? [{ $match: { 'comedianDoc.0.profile.numberOfScenes': resolvedExperienceLevel } }] : []),
    {
      $lookup: {
        from: 'events',
        localField: 'event',
        foreignField: '_id',
        as: 'eventDoc',
        pipeline: [{ $project: { _id: 1, date: 1, startTime: 1, endTime: 1, endDate: 1, status: 1 } }],
      },
    },
    { $match: { 'eventDoc.0': { $exists: true } } },
    ...(withEventEnd ? [{
      $addFields: {
        _eventEnd: buildEventEndExpr({
          date: { $arrayElemAt: ['$eventDoc.date', 0] },
          endDate: { $arrayElemAt: ['$eventDoc.endDate', 0] },
          endTime: { $arrayElemAt: ['$eventDoc.endTime', 0] },
          startTime: { $arrayElemAt: ['$eventDoc.startTime', 0] },
        }),
      },
    }] : []),
  ];
}

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

    const scope = await resolveApplicationScope(req, userId);
    if (scope.ok === false) {
      res.status(scope.status).json(scope.body);
      return;
    }
    const { dbFilter, resolvedExperienceLevel, comedianTab, queryTimeScope } = scope;

    const { sort } = req.query as Record<string, string | string[] | undefined>;
    const { page, limit, skip } = parsePaginationWithDefaults(req.query as Record<string, unknown>);

    const STATUS_ORDER = ['PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'WITHDRAWN', 'CANCELLED_BY_PLATFORM'];
    const sortMap: Record<string, Record<string, 1 | -1>> = {
      dateAsc: { _eventDate: 1, createdAt: -1 },
      dateDesc: { _eventDate: -1, createdAt: -1 },
      statusAsc: { _statusRank: 1, createdAt: -1 },
      statusDesc: { _statusRank: -1, createdAt: -1 },
    };
    const dbSort: Record<string, 1 | -1> = (sort && !Array.isArray(sort) && sortMap[sort]) ? sortMap[sort] : { createdAt: -1 };

    // Onglet humoriste : le filtre temporel est encapsulé dans comedianTabMatchStages.
    // timeScope (query) ne concerne plus que la vue organisateur.
    const resolvedTimeScope = queryTimeScope;
    const needEventEnd = Boolean(comedianTab) || Boolean(resolvedTimeScope);

    const orphanFilterPipeline = [
      ...buildApplicationBasePipeline(dbFilter, resolvedExperienceLevel, needEventEnd),
      {
        $addFields: {
          _statusRank: { $let: {
            vars: { idx: { $indexOfArray: [STATUS_ORDER, '$status'] } },
            // Statut hors liste → rejeté en fin de tri (et non en tête via -1).
            in: { $cond: [{ $lt: ['$$idx', 0] }, STATUS_ORDER.length, '$$idx'] },
          } },
          _eventDate: { $convert: { input: { $arrayElemAt: ['$eventDoc.date', 0] }, to: 'date', onError: null, onNull: null } },
        },
      },
      // Onglet humoriste : classifieur unique — MÊMES étapes que les compteurs.
      ...(comedianTab ? comedianTabMatchStages(comedianTab) : []),
      // Vue organisateur : fenêtre temporelle "à venir" / "passé".
      ...(resolvedTimeScope ? [{ $match: { $expr: (resolvedTimeScope === 'past' ? { $lt: ['$_eventEnd', '$$NOW'] } : { $gte: ['$_eventEnd', '$$NOW'] }) } }] : []),
      { $project: { _id: 1, createdAt: 1, status: 1, _statusRank: 1, _eventDate: 1 } },
    ];

    const [validRefs, totalArr] = await Promise.all([
      ApplicationModel.aggregate([
        ...orphanFilterPipeline,
        { $sort: dbSort },
        { $skip: skip },
        { $limit: limit },
      ] as any),
      ApplicationModel.aggregate([
        ...orphanFilterPipeline,
        { $count: 'total' },
      ] as any),
    ]);
    const total: number = totalArr[0]?.total ?? 0;
    const pageIds = validRefs.map((d: any) => d._id);

    const rawApplications = pageIds.length === 0 ? [] : await (async () => {
      const docs = await ApplicationModel.find({ _id: { $in: pageIds } })
        .select('+performanceDetails +message +organizerMessage')
        .populate({
          path: 'event',
          select: 'title date startTime endTime endDate organizer location updatedAt modifiedByOrganizer status requirements participants',
          populate: { path: 'organizer', select: 'firstName lastName email' }
        })
        .populate({ path: 'comedian', select: 'firstName lastName email phone avatarUrl profile avatar' })
        .lean();
      // Préserver l'ordre du tri
      const byId = new Map(docs.map((d: any) => [String(d._id), d]));
      return pageIds.map((id) => byId.get(String(id))).filter(Boolean) as any[];
    })();

    const applications = (rawApplications as any[]).map(app => {
      if (app.comedian) {
        app.comedian = { ...app.comedian, avatarUrl: buildAvatarDataUrl(app.comedian) };
        delete app.comedian.avatar;
      }
      return app;
    });

    if (req.user?.role === 'COMEDIAN' && comedianTab === 'archived') {
      const eventIds = applications.map(app => app.event?._id).filter(Boolean);
      const ratings = await SpectatorEventRatingModel.find({ event: { $in: eventIds } })
        .select('event comedianRatings')
        .lean();
      const ratingByEvent = new Map<string, { sum: number; count: number }>();
      for (const r of ratings) {
        for (const cr of r.comedianRatings || []) {
          if (String(cr.comedian) !== String(userId)) continue;
          const key = String(r.event);
          const agg = ratingByEvent.get(key) ?? { sum: 0, count: 0 };
          agg.sum += cr.rating;
          agg.count += 1;
          ratingByEvent.set(key, agg);
        }
      }
      for (const app of applications) {
        const agg = app.event?._id ? ratingByEvent.get(String(app.event._id)) : undefined;
        app.myRating = agg ? Math.round((agg.sum / agg.count) * 10) / 10 : null;
        app.myRatingCount = agg ? agg.count : null;
      }
    }

    res.json({ applications, pagination: buildPaginationResult({ page, limit }, total) });
  } catch (error) {
    console.error('Erreur lors de la récupération des candidatures:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération des candidatures' });
  }
};

/**
 * Compteurs de TOUS les onglets en UNE requête (un seul round-trip, un seul $lookup
 * partagé via $facet) au lieu de N appels séparés à getAllApplications?limit=1.
 * Réutilise le MÊME périmètre (resolveApplicationScope) et le MÊME classifieur
 * (comedianTabMatchStages) que la liste → compteur et liste ne peuvent pas diverger.
 *
 * Réponse : { counts: { … } } — clés d'onglet humoriste (accepted/pending/rejected/
 * archived/cancelled) ou organisateur (all/PENDING/ACCEPTED/REJECTED/archived).
 */
export const getApplicationTabCounts = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ message: 'Utilisateur non authentifié.' });
      return;
    }

    const scope = await resolveApplicationScope(req, userId);
    if (scope.ok === false) {
      res.status(scope.status).json(scope.body);
      return;
    }
    const { role, dbFilter, resolvedExperienceLevel } = scope;

    const base = buildApplicationBasePipeline(dbFilter, resolvedExperienceLevel, true);
    const upcoming = [{ $match: { $expr: { $gte: ['$_eventEnd', '$$NOW'] } } }];
    const past = [{ $match: { $expr: { $lt: ['$_eventEnd', '$$NOW'] } } }];
    const count = { $count: 'n' };

    // Chaque branche $facet part des MÊMES documents (base partagée) → lookups joués une fois.
    const facet: Record<string, unknown[]> =
      role === 'COMEDIAN'
        ? {
            accepted: [...comedianTabMatchStages('accepted'), count],
            pending: [...comedianTabMatchStages('pending'), count],
            rejected: [...comedianTabMatchStages('rejected'), count],
            archived: [...comedianTabMatchStages('archived'), count],
            cancelled: [...comedianTabMatchStages('cancelled'), count],
          }
        : {
            all: [...upcoming, count],
            PENDING: [{ $match: { status: 'PENDING' } }, ...upcoming, count],
            ACCEPTED: [{ $match: { status: 'ACCEPTED' } }, ...upcoming, count],
            REJECTED: [{ $match: { status: 'REJECTED' } }, ...upcoming, count],
            archived: [...past, count],
          };

    const [agg] = await ApplicationModel.aggregate([...base, { $facet: facet }] as any);
    const counts: Record<string, number> = {};
    for (const key of Object.keys(facet)) {
      counts[key] = agg?.[key]?.[0]?.n ?? 0;
    }

    res.json({ counts });
  } catch (error) {
    console.error('Erreur lors du comptage des candidatures:', error);
    res.status(500).json({ message: 'Erreur lors du comptage des candidatures' });
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
    Logger.error('Erreur dans confirmParticipation', { error });
    res.status(500).json({
      message: 'Something went wrong!',
      ...(process.env.NODE_ENV === 'development' && { error: error instanceof Error ? error.message : String(error) }),
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

      Logger.info(`[STATS UPDATE - WITHDRAWN] userId=${comedian._id}: ${oldStatus} → WITHDRAWN`);

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
          Logger.info(`[ANNULATION TARDIVE] userId=${comedian._id} - ${hoursUntilEvent.toFixed(1)}h avant l'événement`);

          // Incrémenter le compteur d'annulations tardives AVANT la sauvegarde
          comedian.stats.lateCancellations = (comedian.stats.lateCancellations || 0) + 1;
          totalLateCancellations = comedian.stats.lateCancellations;
          Logger.info(`[STATS] lateCancellations incrémenté: ${totalLateCancellations}`, { userId: comedian._id });
        }
      }

      // Sauvegarder TOUTES les stats (y compris lateCancellations si applicable)
      comedian.markModified('stats');
      await comedian.save();
      Logger.info(`[STATS] Stats sauvegardées après retrait`, { userId: comedian._id });

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
          const lateCancelOrgId = (organizer as any)?._id?.toString() || (event.organizer as any)?._id?.toString() || (event.organizer as any)?.toString() || '';
          emitLateCancellation(
            eventId.toString(),
            comedian._id.toString(),
            (application._id as any).toString(),
            lateCancelOrgId
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
          // Parité avec le désistement tardif : notif in-app persistée (émet aussi le SSE badge).
          // Réutilise le type "late_cancellation_organizer" (famille désistement) ; le titre précise que ce n'est PAS tardif.
          await createNotification(
            (organizer._id as any).toString(),
            'late_cancellation_organizer',
            'Désistement d\'un participant',
            `${comedian.firstName} ${comedian.lastName} s'est désisté de votre événement "${event.title}".`,
            (event as any)._id?.toString(),
            (application._id as any).toString(),
            comedian._id.toString()
          );
        }
      }
    }

    // Au lieu de supprimer, changer le statut à WITHDRAWN
    await ApplicationModel.findByIdAndUpdate(applicationId, { status: 'WITHDRAWN' });

    // Émettre un évènement SSE pour notifier tous les clients
    const eventId = (application.event as any)?._id?.toString() || application.event?.toString() || '';
    const organizerId = (application.event as any)?.organizer?._id?.toString() || (application.event as any)?.organizer?.toString() || '';
    emitApplicationWithdrawn(applicationId, eventId, organizerId);

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

    const eventDoc = await EventModel.findById(eventId).select('title');
    const eventTitle = eventDoc?.title ?? 'un événement';

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
          Logger.info(`[STATS] applicationsPending décrementé`, { userId: comedian._id, applicationId: application._id });
        }

        // Cohérence avec toute autre transition de Application.status : SSE + notif persistée
        // (sinon le comédien voit sa candidature disparaître sans explication)
        const comedianIdStr = comedianId.toString();
        emitApplicationStatusChanged(application._id.toString(), 'EXPIRED', eventId.toString(), [comedianIdStr]);
        await createNotification(
          comedianIdStr,
          'application_rejected',
          'Candidature expirée',
          `Votre candidature pour "${eventTitle}" a expiré : l'événement est terminé sans réponse à votre candidature.`,
          eventId.toString(),
          application._id.toString()
        );
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
