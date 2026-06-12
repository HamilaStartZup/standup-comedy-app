import { Request, Response } from 'express';
import { EventModel } from '../models/Event';
import { UserModel } from '../models/User';
import { AuthRequest } from '../middleware/auth';
import mongoose from 'mongoose';
import { ApplicationModel } from '../models/Application';
import { expirePendingApplicationsForEvent } from './application';
import { sendEventUpdatedNotificationToApplicants, sendEventCancellationToParticipants, sendNewEventNotificationToHumorists, sendEventInvitationToComedian } from '../services/emailService';
import { notifyComediansByMobilityAsync, notifyComediansByMobilityForRecurringGroupAsync } from '../services/mobilityNotificationService';
import { config } from '../config/env';
import { AbsenceModel } from '../models/Absence';
import { emitEventCreated, emitEventUpdated, emitEventDeleted, emitEventCompleted, emitSpectatorRegistered, emitSpectatorUnregistered } from '../services/eventEmitter';
import { Types } from 'mongoose';
import { extractPostalCode, getDepartmentFromPostalCode } from '../utils/cityMapping';
import { getCityCoordinates } from '../utils/cityMapping';
import { notifySpectatorsInRadius, notifySpectatorsOfEventSeries } from '../services/spectatorNotificationService';
import { parsePaginationWithDefaults, buildPaginationResult } from '../utils/pagination';
import { escapeRegex } from '../utils/regex';
import Logger from '../utils/logger';
import {
  assertVenueBookingAvailableForNewEvent,
  getUsedVenueBookingIdsForOrganizer,
} from '../utils/venueBookingEventLink';
import { VenueBookingModel } from '../models/VenueBooking';
import { detectZoneType, FRENCH_REGIONS, normalizeDepartment } from '../utils/geographicMatching';
import { notifyEventCancellation } from '../services/eventCancellation';

/** Retourne la liste des modifications entre l'ancien et le nouvel évènement (pour l'email aux candidats) */
function getEventChanges(oldEvent: any, newEvent: any): string[] {
  const changes: string[] = [];
  const old = (oldEvent && typeof oldEvent.toObject === 'function' ? oldEvent.toObject() : oldEvent) || {};
  const neu = (newEvent && typeof newEvent.toObject === 'function' ? newEvent.toObject() : newEvent) || {};
  const fmtDate = (d: Date | string | undefined) => (d ? new Date(d).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' }) : '');
  const oldLoc = old.location || {};
  const newLoc = neu.location || {};
  const oldReq = old.requirements || {};
  const newReq = neu.requirements || {};

  const oldTitle = String(old.title ?? '').trim();
  const newTitle = String(neu.title ?? '').trim();
  if (oldTitle !== newTitle && newTitle) {
    changes.push(`Titre : « ${oldTitle || '—' } » → « ${newTitle} »`);
  }
  if (fmtDate(old.date) !== fmtDate(neu.date) && neu.date) {
    changes.push(`Date : ${fmtDate(old.date) || '—'} → ${fmtDate(neu.date)}`);
  }
  if (String(old.startTime ?? '') !== String(neu.startTime ?? '')) {
    changes.push(`Heure de début : ${old.startTime || '—'} → ${neu.startTime || '—'}`);
  }
  if (String(old.endTime ?? '') !== String(neu.endTime ?? '')) {
    changes.push(`Heure de fin : ${old.endTime || '—'} → ${neu.endTime || '—'}`);
  }
  const oldAddr = [oldLoc.address, oldLoc.city].filter(Boolean).join(', ') || '—';
  const newAddr = [newLoc.address, newLoc.city].filter(Boolean).join(', ') || '—';
  if (oldAddr !== newAddr) {
    changes.push(`Lieu : ${oldAddr} → ${newAddr}`);
  }
  if (String(oldLoc.venue ?? '') !== String(newLoc.venue ?? '')) {
    changes.push(`Salle / lieu : ${oldLoc.venue || '—'} → ${newLoc.venue || '—'}`);
  }
  if (String(old.description ?? '') !== String(neu.description ?? '') && neu.description != null) {
    changes.push('Description : modifiée');
  }
  if (Number(oldReq?.duration) !== Number(newReq?.duration) && newReq?.duration != null) {
    changes.push(`Durée : ${oldReq?.duration ?? '—'} min → ${newReq.duration} min`);
  }
  if (Number(oldReq?.maxPerformers) !== Number(newReq?.maxPerformers) && newReq?.maxPerformers != null) {
    changes.push(`Nombre max de performeurs : ${oldReq?.maxPerformers ?? '—'} → ${newReq.maxPerformers}`);
  }
  if (Number(oldReq?.minExperience) !== Number(newReq?.minExperience) && newReq?.minExperience != null) {
    changes.push(`Expérience min : ${oldReq?.minExperience ?? '—'} an(s) → ${newReq.minExperience} an(s)`);
  }
  return changes;
}

/** Retourne l'ensemble des userIds à notifier pour un évènement : organisateur + comedians ayant une candidature active */
async function getEventAudience(eventId: string | mongoose.Types.ObjectId, organizerId: string): Promise<string[]> {
  const applications = await ApplicationModel.find(
    { event: eventId, status: { $in: ['PENDING', 'ACCEPTED'] } },
    { comedian: 1 }
  );
  const comedianIds = applications.map((a: any) => a.comedian?.toString()).filter(Boolean) as string[];
  return [organizerId, ...comedianIds].filter((v, i, arr) => arr.indexOf(v) === i);
}

/**
 * Vérifie si l'organisateur a déjà un événement avec le même titre, la même date (jour) et la même heure de début.
 * Les événements annulés sont exclus (on peut recréer après annulation).
 */
async function hasDuplicateEvent(
  organizerId: string,
  title: string,
  dateStr: string,
  startTime: string
): Promise<boolean> {
  const trimmedTitle = String(title ?? '').trim();
  if (!trimmedTitle || !dateStr || !startTime) return false;
  const startDay = new Date(dateStr + 'T00:00:00.000Z');
  const endDay = new Date(startDay.getTime() + 86400000);
  const existing = await EventModel.findOne({
    organizer: organizerId,
    startTime: String(startTime).trim(),
    date: { $gte: startDay, $lt: endDay },
    status: { $in: ['draft', 'published', 'completed'] },
  }).lean();
  if (!existing) return false;
  return (existing.title ?? '').trim() === trimmedTitle;
}

// ============================================================================
// CREATE EVENT
// ============================================================================
/** Réservations de salle déjà utilisées pour un événement (organisateur connecté). */
export const getVenueBookingIdsInUse = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const organizerId = req.user?.id;
    if (!organizerId) {
      res.status(401).json({ message: 'Utilisateur non authentifié' });
      return;
    }
    if (req.user?.role !== 'ORGANIZER') {
      res.status(403).json({ message: 'Réservé aux organisateurs' });
      return;
    }
    const bookingIds = await getUsedVenueBookingIdsForOrganizer(organizerId);
    res.status(200).json({ bookingIds });
  } catch (error) {
    console.error('getVenueBookingIdsInUse error:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération des réservations utilisées' });
  }
};

export const createEvent = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Vérifier que l'utilisateur est authentifié
    const organizerId = req.user?.id;
    if (!organizerId) {
      res.status(401).json({ message: 'Utilisateur non authentifié' });
      return;
    }

    const { title, description, date, dates, location, requirements, startTime, endTime, endDate, budget, maxPerformers, maxSpectators, isRecurring, dateTimes, imageUrl, venueBookingId, venueBookingGroupId } = req.body;

    if (venueBookingId && isRecurring) {
      res.status(400).json({
        message: 'Une réservation de salle ne peut être liée qu\'à un événement unique, pas à une série récurrente.',
      });
      return;
    }

    if (venueBookingId && venueBookingGroupId) {
      res.status(400).json({
        message: 'venueBookingId et venueBookingGroupId ne peuvent pas être fournis simultanément.',
      });
      return;
    }

    // ── Chemin Org B récurrent : générer depuis un lot de réservations confirmées ──
    if (venueBookingGroupId) {
      if (!Types.ObjectId.isValid(venueBookingGroupId)) {
        res.status(400).json({ message: 'Identifiant de lot invalide' });
        return;
      }

      const confirmedBookings = await VenueBookingModel.find({
        bookingGroupId: venueBookingGroupId,
        requester: organizerId,
        status: 'CONFIRMED',
      }).sort({ requestedDate: 1 });

      if (confirmedBookings.length === 0) {
        res.status(404).json({ message: 'Aucune réservation CONFIRMED trouvée pour ce lot' });
        return;
      }

      const lotDates = confirmedBookings.map((b) => {
        const d = new Date(b.requestedDate);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      });

      const venueBookingIdByDate: Record<string, string> = {};
      for (const b of confirmedBookings) {
        const d = new Date(b.requestedDate);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        venueBookingIdByDate[key] = b._id.toString();
      }

      const firstBooking = confirmedBookings[0];
      const lotStartTime = firstBooking.startTime;
      const lotEndTime = firstBooking.endTime;

      return await createRecurringEvents(req, res, organizerId, {
        title,
        description,
        dates: lotDates,
        location,
        requirements,
        startTime: startTime ?? lotStartTime,
        endTime: endTime ?? lotEndTime,
        budget,
        maxPerformers,
        maxSpectators,
        imageUrl,
        venueBookingIdByDate,
      });
    }

    let linkedVenueBookingId: Types.ObjectId | undefined;
    if (venueBookingId) {
      const check = await assertVenueBookingAvailableForNewEvent(organizerId, venueBookingId);
      if (check.ok === false) {
        res.status(409).json({ message: check.message });
        return;
      }
      linkedVenueBookingId = new Types.ObjectId(venueBookingId);
    }

    // Si c'est un événement récurrent avec plusieurs dates
    if (isRecurring && dates && Array.isArray(dates) && dates.length > 0) {
      return await createRecurringEvents(req, res, organizerId, {
        title,
        description,
        dates,
        location,
        requirements,
        startTime,
        endTime,
        budget,
        maxPerformers,
        maxSpectators,
        dateTimes: Array.isArray(dateTimes) ? dateTimes : undefined,
      });
    }

    // Sinon, création d'un événement unique (comportement existant)
    console.log('📅 Date reçue:', date, 'Type:', typeof date);
    console.log('📅 Date parsée:', new Date(date));

    // Vérifier qu'il n'existe pas déjà un événement identique (même titre, date, heure de début)
    const dateStr = typeof date === 'string' ? date.split('T')[0] : new Date(date).toISOString().split('T')[0];
    const isDuplicate = await hasDuplicateEvent(organizerId, title, dateStr, startTime ?? '');
    if (isDuplicate) {
      res.status(409).json({
        message: 'Un événement avec le même titre, la même date et la même heure de début existe déjà. Modifiez le titre, la date ou l\'heure pour créer un nouvel événement.',
      });
      return;
    }

    // Extraire le code postal de l'adresse et calculer le département
    let enhancedLocation = { ...location };
    if (location?.address) {
      const postalCode = extractPostalCode(location.address);
      if (postalCode) {
        enhancedLocation.postalCode = postalCode;
        const department = getDepartmentFromPostalCode(postalCode);
        if (department) {
          enhancedLocation.department = department;
        }
      }
    }

    const event = new EventModel({
      title,
      description,
      date,
      location: enhancedLocation,
      requirements,
      organizer: organizerId,
      status: 'published',
      applications: [],
      startTime,
      endTime,
      endDate: endDate || undefined,
      venue: location.venue,
      budget,
      maxPerformers,
      maxSpectators: maxSpectators != null ? Number(maxSpectators) : undefined,
      imageUrl: imageUrl && typeof imageUrl === 'string' && imageUrl.trim() ? imageUrl.trim() : undefined,
      venueBookingId: linkedVenueBookingId,
    });

    await event.save();

    // Géocoder l'événement pour le rayon spectateurs (async, non bloquant)
    const loc = event.location;
    if (loc && (loc as any).latitude == null && (loc as any).longitude == null && loc.city) {
      getCityCoordinates(loc.city, (loc as any).postalCode).then((coords) => {
        if (coords) {
          EventModel.updateOne(
            { _id: event._id },
            { $set: { 'location.latitude': coords.lat, 'location.longitude': coords.lon } }
          ).catch((e) => console.warn('Geocode event location:', e));
        }
      });
    }

    // Émettre un évènement SSE pour notifier tous les clients
    emitEventCreated(event._id.toString(), [organizerId]);

    // Récupérer les informations de l'organisateur pour l'email et mise à jour stats
    Logger.info('Récupération infos organisateur', { organizerId });
    const organizer = await UserModel.findById(organizerId);
    if (!organizer) {
      Logger.error('Organisateur non trouvé', { organizerId });
      res.status(404).json({ message: 'Organisateur non trouvé' });
      return;
    }
    Logger.debug('Organisateur chargé', { organizerId });

    // Update organizer's totalEvents count et envoi d'emails
    try {
      if (!organizer.stats) {
        organizer.stats = {};
      }
      organizer.stats.totalEvents = (organizer.stats.totalEvents || 0) + 1;
      organizer.markModified('stats');
      await organizer.save();
    } catch (statsError) {
      console.error('⚠️ Erreur lors de la mise à jour des stats de l\'organisateur:', statsError);
      // Ne pas faire échouer la création de l'évènement si les stats échouent
    }

    // Envoyer les notifications par mobilité aux humoristes dont la zone correspond
    try {
      notifyComediansByMobilityAsync(event, {
        firstName: organizer.firstName,
        lastName: organizer.lastName,
        email: organizer.email
      });
    } catch (notifError) {
      console.error('❌ [EVENT_UNIQUE] Erreur lors du lancement de la notification mobilité:', notifError);
      // Ne pas faire échouer la création de l'événement si la notification échoue
    }

    // Notifier les spectateurs dans le rayon (nouvel événement publié)
    const eventStatus = (event as any).status?.toLowerCase?.() || '';
    if (eventStatus === 'published') {
      const eventForNotif = (event.toObject ? event.toObject() : event) as { _id: Types.ObjectId; title: string; date: Date; location?: { city?: string; postalCode?: string; latitude?: number; longitude?: number } };
      notifySpectatorsInRadius(event._id.toString(), eventForNotif).catch((err) => {
        console.error('❌ [EVENT_UNIQUE] Erreur notification spectateurs par rayon (non-bloquant):', err);
      });
    }

    // Convertir l'évènement en objet JSON pour éviter les problèmes de sérialisation
    const eventResponse = event.toObject ? event.toObject() : event;

    console.log('📤 Envoi de la réponse au client...');
    res.status(201).json({
      message: 'Event created successfully',
      event: eventResponse
    });
  } catch (error) {
    console.error('Create event error:', error);
    res.status(500).json({ message: 'Error creating event' });
  }
};

/**
 * Crée plusieurs événements récurrents avec les mêmes informations mais des dates différentes
 * Utilise une transaction MongoDB pour garantir l'atomicité
 */
const createRecurringEvents = async (
  req: AuthRequest,
  res: Response,
  organizerId: string,
  eventData: {
    title: string;
    description: string;
    dates: string[];
    location: any;
    requirements: any;
    startTime?: string;
    endTime?: string;
    budget?: any;
    maxPerformers?: number;
    maxSpectators?: number;
    imageUrl?: string;
    /** Heures par date (optionnel). Si fourni, utilise startTime/endTime par date au lieu des valeurs globales. */
    dateTimes?: Array<{ date: string; startTime: string; endTime: string }>;
    /** Mapping date → venueBookingId pour séries Org B (lot confirmé). */
    venueBookingIdByDate?: Record<string, string>;
  }
): Promise<void> => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    console.log('🔄 [RECURRENCE] Création de', eventData.dates.length, 'événements récurrents');

    // Validation : vérifier qu'il n'y a pas de doublons de dates
    const uniqueDates = [...new Set(eventData.dates)];
    if (uniqueDates.length !== eventData.dates.length) {
      await session.abortTransaction();
      session.endSession();
      res.status(400).json({ message: 'Les dates doivent être uniques' });
      return;
    }

    // Validation : vérifier que toutes les dates sont dans le futur
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (const dateStr of eventData.dates) {
      const eventDate = new Date(dateStr);
      eventDate.setHours(0, 0, 0, 0);
      if (eventDate < today) {
        await session.abortTransaction();
        session.endSession();
        res.status(422).json({ message: `La date ${dateStr} est dans le passé` });
        return;
      }
    }

    // Générer un ID de groupe de récurrence (utiliser le premier événement comme référence)
    const recurrenceGroupId = new Types.ObjectId();
    
    // Convertir organizerId en ObjectId si nécessaire
    const organizerObjectId = Types.ObjectId.isValid(organizerId) 
      ? new Types.ObjectId(organizerId) 
      : organizerId;

    // Créer tous les événements dans la transaction
    const createdEvents = [];
    console.log('🔄 [RECURRENCE] Données reçues:', {
      title: eventData.title,
      dates: eventData.dates,
      location: eventData.location,
      requirements: eventData.requirements,
      startTime: eventData.startTime,
      endTime: eventData.endTime,
      organizerId: organizerId,
      organizerObjectId: organizerObjectId.toString()
    });
    
    // Vérifier que les champs requis sont présents
    if (!eventData.location || !eventData.location.address || !eventData.location.city || !eventData.location.country) {
      await session.abortTransaction();
      session.endSession();
      res.status(400).json({ message: 'Les champs de localisation sont incomplets (address, city, country requis)' });
      return;
    }
    
    if (!eventData.requirements) {
      await session.abortTransaction();
      session.endSession();
      res.status(400).json({ message: 'Les exigences sont requises' });
      return;
    }
    
    if (typeof eventData.requirements.minExperience !== 'number') {
      await session.abortTransaction();
      session.endSession();
      res.status(400).json({ message: 'minExperience doit être un nombre' });
      return;
    }
    
    if (typeof eventData.requirements.duration !== 'number' || eventData.requirements.duration <= 0) {
      await session.abortTransaction();
      session.endSession();
      res.status(400).json({ message: 'duration doit être un nombre positif (en minutes)' });
      return;
    }
    
    if (!eventData.startTime || !eventData.endTime) {
      await session.abortTransaction();
      session.endSession();
      res.status(400).json({ message: 'startTime et endTime sont requis' });
      return;
    }
    
    const dateTimesMap = new Map<string, { startTime: string; endTime: string }>();
    if (eventData.dateTimes && eventData.dateTimes.length > 0) {
      for (const dt of eventData.dateTimes) {
        const key = typeof dt.date === 'string' ? dt.date.split('T')[0] : String(dt.date).split('T')[0];
        dateTimesMap.set(key, { startTime: dt.startTime, endTime: dt.endTime });
      }
    }

    // Vérifier les doublons (même titre + date + heure) pour chaque date avant de créer
    for (const dateStr of eventData.dates) {
      const override = dateTimesMap.get(dateStr);
      const startTime = override?.startTime ?? eventData.startTime;
      if (startTime) {
        const isDup = await hasDuplicateEvent(organizerId, eventData.title, dateStr, startTime);
        if (isDup) {
          await session.abortTransaction();
          session.endSession();
          res.status(409).json({
            message: `Un événement identique (même titre, date et heure) existe déjà pour le ${new Date(dateStr).toLocaleDateString('fr-FR')}. Modifiez le titre, les dates ou les heures pour créer ces événements.`,
          });
          return;
        }
      }
    }

    // Extraire le code postal et le département de l'adresse (une seule fois pour tous les événements)
    let enhancedLocation = { ...eventData.location };
    if (eventData.location?.address) {
      const postalCode = extractPostalCode(eventData.location.address);
      if (postalCode) {
        enhancedLocation.postalCode = postalCode;
        const department = getDepartmentFromPostalCode(postalCode);
        if (department) {
          enhancedLocation.department = department;
          console.log(`📍 [RECURRENCE] Code postal extrait: ${postalCode} → Département: ${department}`);
        }
      }
    }

    for (const dateStr of eventData.dates) {
      try {
        console.log(`🔄 [RECURRENCE] Création de l'événement pour le ${dateStr}...`);
        const override = dateTimesMap.get(dateStr);
        const startTime = override?.startTime ?? eventData.startTime;
        const endTime = override?.endTime ?? eventData.endTime;
        if (!startTime || !endTime) {
          await session.abortTransaction();
          session.endSession();
          res.status(400).json({ message: `Heures manquantes pour la date ${dateStr}` });
          return;
        }

        const linkedBookingId = eventData.venueBookingIdByDate?.[dateStr]
          ? new Types.ObjectId(eventData.venueBookingIdByDate[dateStr])
          : undefined;

        if (linkedBookingId) {
          const check = await assertVenueBookingAvailableForNewEvent(organizerId, linkedBookingId.toString());
          if (check.ok === false) {
            await session.abortTransaction();
            session.endSession();
            res.status(409).json({ message: check.message });
            return;
          }
        }

        const event = new EventModel({
          title: eventData.title,
          description: eventData.description,
          date: new Date(dateStr),
          location: enhancedLocation,
          requirements: eventData.requirements,
          organizer: organizerObjectId,
          status: 'published',
          applications: [],
          startTime,
          endTime,
          venue: enhancedLocation.venue,
          budget: eventData.budget,
          maxPerformers: eventData.maxPerformers,
          maxSpectators: eventData.maxSpectators != null ? Number(eventData.maxSpectators) : undefined,
          recurrenceGroupId: recurrenceGroupId,
          imageUrl: eventData.imageUrl && typeof eventData.imageUrl === 'string' && eventData.imageUrl.trim() ? eventData.imageUrl.trim() : undefined,
          ...(linkedBookingId && { venueBookingId: linkedBookingId }),
        });

        const savedEvent = await event.save({ session });
        createdEvents.push(savedEvent);

        // Émettre un évènement SSE pour chaque événement créé
        emitEventCreated(savedEvent._id.toString(), [organizerId]);
      } catch (eventError: any) {
        console.error(`❌ [RECURRENCE] Erreur lors de la création de l'événement pour ${dateStr}:`, eventError);
        console.error(`❌ [RECURRENCE] Détails de l'erreur:`, {
          message: eventError?.message,
          name: eventError?.name,
          errors: eventError?.errors
        });
        throw eventError; // Re-lancer l'erreur pour que le catch principal la gère
      }
    }

    // Récupérer l'organisateur pour les notifications (sans session pour éviter les problèmes de validation)
    let organizer;
    try {
      organizer = await UserModel.findById(organizerId).select('firstName lastName email').lean();
      if (!organizer) {
        console.error('⚠️ [RECURRENCE] Organisateur non trouvé pour les notifications');
      }
    } catch (organizerError) {
      console.error('⚠️ [RECURRENCE] Erreur lors de la récupération de l\'organisateur:', organizerError);
    }

    // Mettre à jour les statistiques de l'organisateur
    // Utiliser findByIdAndUpdate avec $inc pour éviter les problèmes de validation
    // car on ne modifie que les stats, pas le profil
    try {
      await UserModel.findByIdAndUpdate(
        organizerId,
        { $inc: { 'stats.totalEvents': createdEvents.length } },
        { 
          session,
          runValidators: false // Ne pas valider les autres champs comme numberOfScenes
        }
      );
    } catch (statsError: any) {
      console.error('❌ [RECURRENCE] Erreur lors de la mise à jour des stats:', statsError);
      // Ne pas faire échouer la création des événements si les stats échouent
      // Les événements sont déjà créés, on continue
    }

    // Valider la transaction
    await session.commitTransaction();
    await session.endSession();

    // Notifier les spectateurs dans le rayon (une seule notif de série par spectateur)
    notifySpectatorsOfEventSeries(createdEvents as any[]).catch((err) => {
      console.error('❌ [RECURRENCE] Erreur notification spectateurs par rayon (non-bloquant):', err);
    });

    // Envoyer UN SEUL email par humoriste regroupant toutes les dates (au lieu d'un email par date)
    if (organizer) {
      const eventIds = createdEvents.map(e => e._id);
      const eventsForNotification = await EventModel.find({ _id: { $in: eventIds } }).sort({ date: 1 });

      try {
        notifyComediansByMobilityForRecurringGroupAsync(eventsForNotification, {
          firstName: organizer.firstName || '',
          lastName: organizer.lastName || '',
          email: organizer.email || ''
        });
      } catch (notifError) {
        console.error(`⚠️ [RECURRENCE] Erreur notification mobilité groupée (non-bloquant):`, notifError);
      }
    } else {
      console.error('⚠️ [RECURRENCE] Organisateur non trouvé, notifications non envoyées');
    }

    // Retourner le premier événement et le nombre total créé
    try {
      const eventsResponse = createdEvents.map(e => {
        try {
          return e.toObject ? e.toObject() : e;
        } catch (toObjectError) {
          console.error('⚠️ [RECURRENCE] Erreur toObject (non-bloquant):', toObjectError);
          // Retourner un objet simplifié si toObject échoue
          return {
            _id: e._id,
            title: e.title,
            date: e.date,
            status: e.status
          };
        }
      });

      res.status(201).json({
        message: `${createdEvents.length} événements récurrents créés avec succès`,
        events: eventsResponse,
        recurrenceGroupId: recurrenceGroupId.toString(),
        count: createdEvents.length
      });
      
    } catch (responseError) {
      // Si la réponse échoue mais que les événements sont créés, on doit quand même informer
      console.error('❌ [RECURRENCE] Erreur lors de l\'envoi de la réponse HTTP:', responseError);
      console.error('⚠️ [RECURRENCE] ATTENTION: Les événements sont créés en base mais la réponse a échoué');
      
      // Essayer d'envoyer une réponse simplifiée
      try {
        res.status(201).json({
          message: `${createdEvents.length} événements récurrents créés avec succès`,
          count: createdEvents.length,
          recurrenceGroupId: recurrenceGroupId.toString(),
          note: 'Les événements ont été créés mais certains détails n\'ont pas pu être renvoyés'
        });
      } catch (fallbackError) {
        console.error('❌ [RECURRENCE] Impossible d\'envoyer une réponse de secours:', fallbackError);
        // À ce stade, les événements sont créés mais on ne peut pas répondre
        // Le client verra une erreur mais les événements existent en base
      }
    }

  } catch (error: any) {
    console.error('❌ [RECURRENCE] Erreur lors de la création des événements récurrents:', error);
    console.error('❌ [RECURRENCE] Détails de l\'erreur:', {
      message: error?.message,
      name: error?.name,
      stack: error?.stack,
      errors: error?.errors,
      eventData: {
        title: eventData.title,
        datesCount: eventData.dates?.length,
        location: eventData.location,
        requirements: eventData.requirements
      }
    });
    
    try {
      await session.abortTransaction();
      await session.endSession();
    } catch (sessionError) {
      console.error('❌ [RECURRENCE] Erreur lors de l\'abandon de la transaction:', sessionError);
    }
    
    // Retourner un message d'erreur plus détaillé
    const errorMessage = error?.message || 'Erreur lors de la création des événements récurrents';
    const validationErrors = error?.errors ? Object.values(error.errors).map((e: any) => e.message).join(', ') : null;
    
    res.status(500).json({ 
      message: 'Erreur lors de la création des événements récurrents',
      error: errorMessage,
      validationErrors: validationErrors || undefined
    });
  }
};

// ============================================================================
// GET EVENTS (with filtering by role)
// ============================================================================
export const getEventsList = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Vérifier que l'utilisateur est authentifié
    if (!req.user?.id) {
      res.status(401).json({ message: 'Utilisateur non authentifié' });
      return;
    }

    const organizerId = req.query.organizerId as string;
    const city = req.query.city as string;
    const cityRadius = req.query.cityRadius as string; // rayon autour de la ville recherchée
    const type = req.query.type as string; // recherche par mot-clé (titre / description)
    const venueType = req.query.venueType as string; // filtre par type de lieu
    const myRegistrations = req.query.myRegistrations === 'true';
    const nearMe = req.query.nearMe === 'true';
    const radiusKmParam = req.query.radiusKm as string; // 5, 10, 20, 50
    const dateFrom = req.query.dateFrom as string | undefined;
    const statusFilter = req.query.status as string | undefined;
    const zone = req.query.zone as string | undefined;
    const experienceLevel = req.query.experienceLevel as string | undefined;
    const hasRecurrence = req.query.hasRecurrence === 'true';
    const userRole = req.user?.role;
    const userId = req.user?.id;

    let query: any = {};

    // If an organizerId is provided, filter events by it
    if (organizerId && mongoose.Types.ObjectId.isValid(organizerId)) {
      query.organizer = organizerId;
      if (statusFilter && ['published', 'completed', 'cancelled', 'full', 'draft', 'PUBLISHED', 'COMPLETED', 'CANCELLED', 'FULL', 'DRAFT'].includes(statusFilter)) {
        query.status = statusFilter;
      }
    } else if (organizerId && !mongoose.Types.ObjectId.isValid(organizerId)) {
      res.status(400).json({ message: 'Invalid organizerId format' });
      return;
    } else if (userRole === 'ORGANIZER') {
      query.organizer = userId;
      if (statusFilter && ['published', 'completed', 'cancelled', 'full', 'draft', 'PUBLISHED', 'COMPLETED', 'CANCELLED', 'FULL', 'DRAFT'].includes(statusFilter)) {
        query.status = statusFilter;
      }
    } else if (userRole === 'COMEDIAN' || userRole === 'SPECTATOR') {
      query.status = { $in: ['published', 'PUBLISHED', 'completed', 'COMPLETED', 'cancelled', 'CANCELLED'] };
    } else if (userRole === 'SUPER_ADMIN') {
      query = {};
    } else {
      query.status = 'published';
    }

    // Filtre "mes inscriptions" pour le spectateur
    if (userRole === 'SPECTATOR' && myRegistrations && userId) {
      query.spectatorRegistrations = new mongoose.Types.ObjectId(userId);
    }

    // Filtre par ville (lieu) — si cityRadius est fourni, on filtre par distance après la requête
    const cityRadiusKm = [5, 10, 20, 50].includes(Number(cityRadius)) ? Number(cityRadius) : 0;
    if (city && city.trim() && !cityRadiusKm) {
      query['location.city'] = new RegExp(escapeRegex(city.trim().slice(0, 80)), 'i');
    }

    // Filtre par type (mot-clé dans titre ou description)
    if (type && type.trim()) {
      const safeType = escapeRegex(type.trim().slice(0, 80));
      query.$or = [
        { title: new RegExp(safeType, 'i') },
        { description: new RegExp(safeType, 'i') },
      ];
    }

    // Filtre par type de lieu
    if (venueType && ['theatre', 'salle_polyvalente', 'cafe', 'restaurant', 'autre'].includes(venueType.trim())) {
      query['location.venueType'] = venueType.trim();
    }

    if (dateFrom) {
      const parsed = new Date(dateFrom);
      if (!isNaN(parsed.getTime())) {
        query.date = { ...(query.date ?? {}), $gte: parsed };
      }
    }

    if (hasRecurrence) {
      query.recurrenceGroupId = { $exists: true, $ne: null };
    }

    const VALID_EXPERIENCE_LEVELS = ['0-50', '50-200', '200+'] as const;
    if (experienceLevel && (VALID_EXPERIENCE_LEVELS as readonly string[]).includes(experienceLevel)) {
      // Inclure 'all' et les events sans niveau requis : un event ouvert à tous les niveaux
      // doit apparaître quand un humoriste filtre par son propre niveau.
      query['requirements.requiredExperienceLevel'] = { $in: [experienceLevel, 'all', null] };
    }

    if (zone && zone.trim()) {
      const searchZone = await detectZoneType(zone.trim());
      if (searchZone.type === 'ville') {
        // Match ville/adresse/salle : conserve la flexibilité du search libre antérieur
        // (nom de salle, bout d'adresse) en plus du match strict sur city.
        const cityRegex = new RegExp(escapeRegex(searchZone.value), 'i');
        const zoneOr = [
          { 'location.city': cityRegex },
          { 'location.address': cityRegex },
          { 'location.venue': cityRegex },
        ];
        // Combiner avec un éventuel $or préexistant (filtre `type` sur titre/description)
        // via $and pour ne pas l'écraser.
        if (query.$or) {
          query.$and = ([] as Array<Record<string, unknown>>).concat(
            (query.$and as Array<Record<string, unknown>>) || [],
            [{ $or: query.$or }, { $or: zoneOr }],
          );
          delete query.$or;
        } else {
          query.$or = zoneOr;
        }
      } else if (searchZone.type === 'departement') {
        query['location.department'] = normalizeDepartment(searchZone.value);
      } else if (searchZone.type === 'region' && searchZone.region && FRENCH_REGIONS[searchZone.region]) {
        query['location.department'] = { $in: FRENCH_REGIONS[searchZone.region] };
      }
    }

    const { page, limit, skip } = parsePaginationWithDefaults(req.query as Record<string, unknown>);
    const isGeoFilter = (userRole === 'SPECTATOR' && nearMe) || Boolean(city && city.trim() && cityRadiusKm > 0);

    // P14: filter out events without a valid organizer at DB level.
    // Ne PAS écraser un filtre organizer déjà posé (ORGANIZER role / organizerId param) :
    // sans ça le serveur renvoyait tous les events d'un statut, le client filtrait ensuite et
    // la pagination se retrouvait avec des pages quasi vides.
    if (!query.organizer) {
      query.organizer = { $exists: true, $ne: null };
    }

    if (!isGeoFilter) {
      const total = await EventModel.countDocuments(query);
      const events = await EventModel.find(query)
        .populate('organizer', 'firstName lastName email organizerProfile.companyName')
        .select('title date endDate startTime endTime status city location isRecurrent recurrenceGroupId imageUrl organizer withdrawnComedians requirements budget description maxSpectators applications venue venueBookingId modifiedByOrganizer cancellationReason')
        .sort({ date: -1 })
        .skip(skip)
        .limit(limit)
        .lean() as any[];
      res.json({ events, pagination: buildPaginationResult({ page, limit }, total) });
      return;
    }

    let events = await EventModel.find(query)
      .populate('organizer', 'firstName lastName email organizerProfile.companyName')
      .select('title date endDate startTime endTime status city location isRecurrent recurrenceGroupId imageUrl organizer withdrawnComedians requirements budget description maxSpectators applications venue venueBookingId modifiedByOrganizer cancellationReason')
      .sort({ date: -1 })
      .lean() as any[];

    // Filtre "près de moi" (rayon en km) pour le spectateur
    if (userRole === 'SPECTATOR' && nearMe && userId) {
      const { getEventCoordinates, getSpectatorCoordinates } = await import('../services/spectatorNotificationService');
      const { distanceKm } = await import('../utils/cityMapping');
      const spectator = await UserModel.findById(userId).select('city latitude longitude spectatorPreferences').lean();
      if (spectator) {
        const specCoords = await getSpectatorCoordinates(spectator as any);
        const radiusKm = [5, 10, 20, 50].includes(Number(radiusKmParam)) ? Number(radiusKmParam) : (spectator as any).spectatorPreferences?.radiusKm ?? 20;
        if (specCoords) {
          const coordsArray = await Promise.all(events.map(ev => getEventCoordinates(ev as any)));
          const inRadius: typeof events = events.filter((_ev, i) => {
            const coords = coordsArray[i];
            return coords && distanceKm(coords.lat, coords.lon, specCoords.lat, specCoords.lon) <= radiusKm;
          });
          events = inRadius;
        }
      }
    }

    // Filtre par rayon autour de la ville recherchée
    if (city && city.trim() && cityRadiusKm > 0) {
      const { getEventCoordinates } = await import('../services/spectatorNotificationService');
      const { getCityCoordinates, distanceKm } = await import('../utils/cityMapping');
      const cityCoords = await getCityCoordinates(city.trim());
      if (cityCoords) {
        const coordsArray = await Promise.all(events.map(ev => getEventCoordinates(ev as any)));
        const inRadius: typeof events = events.filter((_ev, i) => {
          const coords = coordsArray[i];
          return coords && distanceKm(cityCoords.lat, cityCoords.lon, coords.lat, coords.lon) <= cityRadiusKm;
        });
        events = inRadius;
      }
    }

    const total = events.length;
    const pageEvents = events.slice(skip, skip + limit);
    res.json({ events: pageEvents, pagination: buildPaginationResult({ page, limit }, total) });
  } catch (error) {
    console.error('Get events error:', error);
    res.status(500).json({ message: 'Error fetching events' });
  }
};

// ============================================================================
// GET EVENT BY ID
// ============================================================================
export const getEventById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { eventId } = req.params;

    // Valider le format de l'ID
    if (!mongoose.Types.ObjectId.isValid(eventId)) {
      res.status(400).json({ message: 'Invalid event ID format' });
      return;
    }

    const event = await EventModel.findById(eventId)
      .select('+withdrawnComedians')
      .populate('organizer', 'firstName lastName email')
      .populate('participants');

    if (!event) {
      res.status(404).json({ message: 'Évènement non trouvé' });
      return;
    }

    res.json(event);
  } catch (error) {
    console.error('Get event error:', error);
    res.status(500).json({ message: 'Error fetching event' });
  }
};

// ============================================================================
// SPECTATOR REGISTRATION (s'inscrire à un événement)
// ============================================================================
export const registerSpectator = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { eventId } = req.params;
    const userId = req.user?.id;
    const userRole = req.user?.role;

    if (!userId || userRole !== 'SPECTATOR') {
      res.status(403).json({ message: 'Seuls les spectateurs peuvent s\'inscrire à un événement' });
      return;
    }
    if (!eventId || !mongoose.Types.ObjectId.isValid(eventId)) {
      res.status(400).json({ message: 'ID d\'événement invalide' });
      return;
    }

    const event = await EventModel.findById(eventId);
    if (!event) {
      res.status(404).json({ message: 'Événement non trouvé' });
      return;
    }
    if (event.status?.toLowerCase() === 'cancelled') {
      res.status(400).json({ message: 'Cet événement est annulé' });
      return;
    }

    const withdrawnSpectators = (event as any).withdrawnSpectators || [];
    if (withdrawnSpectators.some((id: mongoose.Types.ObjectId) => id.toString() === userId)) {
      res.status(403).json({ message: 'Vous vous êtes désinscrit de cet événement ; la réinscription n\'est pas possible.' });
      return;
    }
    const spectatorRegistrations = event.spectatorRegistrations || [];
    if (spectatorRegistrations.some((id) => id.toString() === userId)) {
      res.status(409).json({ message: 'Vous êtes déjà inscrit à cet événement' });
      return;
    }
    const maxSpectators = (event as any).maxSpectators;
    if (maxSpectators != null && typeof maxSpectators === 'number' && spectatorRegistrations.length >= maxSpectators) {
      res.status(409).json({ message: 'Plus de places disponibles pour les spectateurs' });
      return;
    }

    await EventModel.findByIdAndUpdate(eventId, {
      $addToSet: { spectatorRegistrations: new mongoose.Types.ObjectId(userId) },
    });

    if (event.organizer) {
      emitSpectatorRegistered(eventId, userId, event.organizer.toString());
    }

    const updated = await EventModel.findById(eventId).populate('organizer', 'firstName lastName email').populate('spectatorRegistrations', 'firstName lastName');
    res.status(201).json({ message: 'Inscription enregistrée', event: updated });
  } catch (error) {
    console.error('Register spectator error:', error);
    res.status(500).json({ message: 'Erreur lors de l\'inscription' });
  }
};

export const unregisterSpectator = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { eventId } = req.params;
    const userId = req.user?.id;
    const userRole = req.user?.role;

    if (!userId || userRole !== 'SPECTATOR') {
      res.status(403).json({ message: 'Non autorisé' });
      return;
    }
    if (!eventId || !mongoose.Types.ObjectId.isValid(eventId)) {
      res.status(400).json({ message: 'ID d\'événement invalide' });
      return;
    }

    await EventModel.findByIdAndUpdate(eventId, {
      $pull: { spectatorRegistrations: new mongoose.Types.ObjectId(userId) },
      $addToSet: { withdrawnSpectators: new mongoose.Types.ObjectId(userId) },
    });

    const eventForSSE = await EventModel.findById(eventId).select('organizer').lean();
    if (eventForSSE?.organizer) {
      emitSpectatorUnregistered(eventId, userId, eventForSSE.organizer.toString());
    }

    res.status(204).send();
  } catch (error) {
    console.error('Unregister spectator error:', error);
    res.status(500).json({ message: 'Erreur lors de la désinscription' });
  }
};

// ============================================================================
// UPDATE EVENT
// ============================================================================
export const updateEvent = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Support à la fois :id et :eventId pour compatibilité avec différentes routes
    const eventId = req.params.eventId || req.params.id;
    const organizerId = req.user?.id;
    const userRole = req.user?.role;

    // Vérifier que l'utilisateur est authentifié
    if (!organizerId) {
      res.status(401).json({ message: 'Utilisateur non authentifié' });
      return;
    }

    // Valider le format de l'ID
    if (!mongoose.Types.ObjectId.isValid(eventId)) {
      res.status(400).json({ message: 'Invalid event ID format' });
      return;
    }

    console.log('🔍 [DEBUG updateEvent] Début de la mise à jour', {
      eventId,
      organizerId,
      userRole,
    });

    // Pour SUPER_ADMIN, on peut modifier n'importe quel évènement
    // Sinon, on vérifie que l'évènement appartient à l'organisateur connecté
    const event = userRole === 'SUPER_ADMIN'
      ? await EventModel.findById(eventId)
      : await EventModel.findOne({ _id: eventId, organizer: organizerId });

    if (!event) {
      console.error('❌ [DEBUG updateEvent] Évènement non trouvé ou non autorisé', {
        eventId,
        organizerId,
        userRole,
        searchMethod: userRole === 'SUPER_ADMIN' ? 'findById' : 'findOne with organizer filter'
      });
      res.status(404).json({ message: 'Event not found or unauthorized' });
      return;
    }

    console.log('✅ [DEBUG updateEvent] Évènement trouvé et autorisé', {
      eventId: event._id,
      eventOrganizer: event.organizer?.toString?.() || event.organizer,
      requestingOrganizer: organizerId,
    });

    // Sauvegarder l'ancienne ville pour détecter le changement
    const oldCity = event.location?.city;

    // Préparer les données de mise à jour avec extraction du code postal/département si la location est fournie
    let updateData = { ...req.body, modifiedByOrganizer: true };
    
    if (req.body.location?.address) {
      const postalCode = extractPostalCode(req.body.location.address);
      if (postalCode) {
        updateData.location = {
          ...req.body.location,
          postalCode: postalCode,
          department: getDepartmentFromPostalCode(postalCode)
        };
        console.log(`📍 [DEBUG updateEvent] Code postal extrait: ${postalCode} → Département: ${updateData.location.department}`);
      }
    }

    const updatedEvent = await EventModel.findByIdAndUpdate(
      eventId,
      { $set: updateData },
      { new: true }
    );

    if (!updatedEvent) {
      console.error('❌ [DEBUG updateEvent] Échec de la mise à jour - évènement non trouvé après update', { eventId });
      res.status(404).json({ message: 'Event not found after update attempt' });
      return;
    }

    console.log('✅ [DEBUG updateEvent] Évènement mis à jour avec succès', {
      eventId: updatedEvent._id,
      title: updatedEvent.title,
    });

    // Si la ville a changé, notifier les humoristes dont la zone de mobilité correspond
    const newCity = updatedEvent.location?.city;
    if (oldCity !== newCity && newCity) {
      console.log(`📍 [MobilityNotification] Ville de l'événement modifiée: "${oldCity}" → "${newCity}"`);

      const organizer = await UserModel.findById(organizerId).select('firstName lastName email');
      if (organizer) {
        notifyComediansByMobilityAsync(updatedEvent, {
          firstName: organizer.firstName,
          lastName: organizer.lastName,
          email: organizer.email
        });
        console.log('📧 [MobilityNotification] Notification des humoristes par zone de mobilité lancée en arrière-plan');
      }
    }

    // Émettre un évènement SSE pour notifier tous les clients
    const updateAudience = await getEventAudience(updatedEvent._id.toString(), organizerId);
    emitEventUpdated(updatedEvent._id.toString(), updateAudience);

    // Notifier les humoristes ayant postulé si l'évènement est aujourd'hui ou futur (comparaison à minuit pour inclure "aujourd'hui")
    const eventDateAtMidnight = new Date(updatedEvent.date);
    eventDateAtMidnight.setHours(0, 0, 0, 0);
    const todayAtMidnight = new Date();
    todayAtMidnight.setHours(0, 0, 0, 0);
    const isEventTodayOrFuture = updatedEvent && eventDateAtMidnight >= todayAtMidnight;

    if (isEventTodayOrFuture) {
      const organizer = await UserModel.findById(organizerId).select('firstName lastName email');
      if (organizer) {
        if (req.body.status === 'cancelled' || updatedEvent.status === 'cancelled') {
          // Annulation : notifier humoristes (candidature active) et spectateurs inscrits.
          await notifyEventCancellation(updatedEvent, (req.body as any).cancellationReason);
        } else {
          // Mise à jour classique : notifier les candidats du détail des champs modifiés.
          const applications = await ApplicationModel.find({ event: updatedEvent._id, status: { $in: ['PENDING', 'ACCEPTED'] } })
            .populate('comedian', 'email firstName lastName');
          if (applications.length > 0) {
            try {
              const changes = getEventChanges(event, updatedEvent);
              await sendEventUpdatedNotificationToApplicants(applications as any, updatedEvent, {
                firstName: organizer.firstName,
                lastName: organizer.lastName,
                email: organizer.email,
              }, changes);
              // Créer des notifications in-app pour les humoristes concernés
              try {
                const { createNotification } = await import('./notification');
                for (const app of applications) {
                  const comedian = app.comedian;
                  if (comedian && (comedian as any).role === 'COMEDIAN') {
                    const comedianId = (comedian as any)._id?.toString() || comedian.toString();
                    await createNotification(
                      comedianId,
                      'event_updated',
                      'Évènement modifié',
                      `L'évènement "${updatedEvent.title}" auquel vous avez postulé a été modifié.`,
                      updatedEvent._id.toString(),
                      app._id.toString(),
                      organizer._id?.toString() || organizer.toString()
                    );
                  }
                }
              } catch (notificationError) {
                console.error('Erreur lors de la création des notifications in-app pour la mise à jour:', notificationError);
              }
            } catch (err) {
              console.error('❌ Erreur envoi emails maj évènement:', err);
            }
          }
        }
      }
    }

    // Notifier les spectateurs inscrits en cas de modification (évènement non annulé)
    if (updatedEvent && updatedEvent.status !== 'cancelled' && new Date(updatedEvent.date) >= new Date()) {
      const spectatorIds = (updatedEvent.spectatorRegistrations || []) as mongoose.Types.ObjectId[];
      if (spectatorIds.length > 0) {
        try {
          const { createNotification } = await import('./notification');
          for (const sid of spectatorIds) {
            const spectatorId = sid?.toString?.() || (sid as any).toString?.();
            if (spectatorId) {
              await createNotification(
                spectatorId,
                'event_updated',
                'Évènement modifié',
                `L'évènement "${updatedEvent.title}" auquel vous êtes inscrit a été modifié.`,
                updatedEvent._id.toString()
              );
            }
          }
          console.log(`✅ [Mise à jour] Notifications in-app créées pour ${spectatorIds.length} spectateur(s).`);
        } catch (notifErr) {
          console.error('Erreur notifications in-app spectateurs (mise à jour):', notifErr);
        }
      }
    }

    res.json({
      message: 'Event updated successfully',
      event: updatedEvent
    });
  } catch (error) {
    console.error('Update event error:', error);
    res.status(500).json({ message: 'Error updating event' });
  }
};

// ============================================================================
// DELETE EVENT
// ============================================================================
export const deleteEvent = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { eventId } = req.params;
    const organizerId = req.user?.id;

    // Vérifier que l'utilisateur est authentifié
    if (!organizerId) {
      res.status(401).json({ message: 'Utilisateur non authentifié' });
      return;
    }

    // Valider le format de l'ID
    if (!mongoose.Types.ObjectId.isValid(eventId)) {
      res.status(400).json({ message: 'Invalid event ID format' });
      return;
    }

    const event = await EventModel.findById(eventId).populate('organizer', 'firstName lastName email');

    console.log('🔍 DEBUG Suppression évènement:', {
      eventId,
      userId: organizerId,
      eventOrganizer: event?.organizer,
      eventOrganizerId: event?.organizer?._id?.toString(),
      eventOrganizerString: event?.organizer?.toString()
    });

    if (!event) {
      res.status(404).json({ message: 'Évènement non trouvé' });
      return;
    }

    // Vérifier si l'utilisateur est l'organisateur de l'évènement
    const organizerIdFromEvent = (event.organizer as any)._id?.toString() || event.organizer.toString();
    if (organizerIdFromEvent !== organizerId) {
      console.log('❌ Autorisation refusée:', {
        eventOrganizer: event.organizer,
        organizerId: organizerIdFromEvent,
        userId: organizerId,
        match: organizerIdFromEvent === organizerId
      });
      res.status(403).json({ message: 'Non autorisé à supprimer cet évènement' });
      return;
    }

    // Notifier les candidats PENDING et ACCEPTED avant suppression
    let deletedComedianIds: string[] = [];
    try {
      const applications = await ApplicationModel.find({
        event: eventId,
        status: { $in: ['PENDING', 'ACCEPTED'] }
      }).populate('comedian', 'email firstName lastName');
      deletedComedianIds = applications.map((a: any) => a.comedian?._id?.toString() || a.comedian?.toString()).filter(Boolean);

      const participants = applications
        .map((app: any) => app.comedian)
        .filter((c: any) => !!c?.email);

      if (participants.length > 0 && event.organizer && (event.organizer as any).email) {
        await sendEventCancellationToParticipants(
          participants as any,
          { title: event.title, date: event.date, location: (event as any).location } as any,
          {
            firstName: (event.organizer as any).firstName,
            lastName: (event.organizer as any).lastName,
            email: (event.organizer as any).email,
          },
          'Évènement supprimé par l\'organisateur (plus de 10 jours avant).'
        );
      }
    } catch (emailErr) {
      console.error('❌ Erreur lors de l\'envoi des emails d\'annulation avant suppression:', emailErr);
    }

    // Notifier les spectateurs inscrits (événement supprimé)
    const spectatorIds = (event.spectatorRegistrations || []) as mongoose.Types.ObjectId[];
    if (spectatorIds.length > 0) {
      try {
        const { createNotification } = await import('./notification');
        for (const sid of spectatorIds) {
          const spectatorId = sid?.toString?.() || (sid as any).toString?.();
          if (spectatorId) {
            await createNotification(
              spectatorId,
              'event_deleted',
              'Évènement supprimé',
              `L'évènement "${event.title}" auquel vous étiez inscrit a été supprimé par l'organisateur.`,
              eventId
            );
          }
        }
        console.log(`✅ [Suppression] Notifications in-app créées pour ${spectatorIds.length} spectateur(s).`);
      } catch (notifErr) {
        console.error('Erreur notifications in-app spectateurs (suppression):', notifErr);
      }
    }

    // Delete all applications for this event after notifications
    await ApplicationModel.deleteMany({ event: eventId });

    await EventModel.findByIdAndDelete(eventId);

    // Émettre un évènement SSE pour notifier tous les clients
    emitEventDeleted(eventId, [organizerId, ...deletedComedianIds]);

    // Décrémenter le compteur d'évènements créés de l'organisateur
    // Utiliser findByIdAndUpdate avec $inc pour éviter les problèmes de validation
    try {
      await UserModel.findByIdAndUpdate(
        organizerId,
        { $inc: { 'stats.totalEvents': -1 } },
        { runValidators: false } // Ne pas valider les autres champs comme numberOfScenes
      );
      console.log('✅ Stats de l\'organisateur décrémentées (suppression événement)');
    } catch (statsError) {
      console.error('⚠️ Erreur lors de la décrémentation des stats de l\'organisateur:', statsError);
      // Ne pas faire échouer la suppression si les stats échouent
    }

    res.status(204).send();
  } catch (error: any) {
    console.error('❌ Delete event error:', error);
    console.error('❌ Détails de l\'erreur:', {
      message: error?.message,
      name: error?.name,
      stack: error?.stack,
      errors: error?.errors
    });
    res.status(500).json({ 
      message: 'Error deleting event',
      error: error?.message || 'Erreur inconnue'
    });
  }
};

// ============================================================================
// GET ORGANIZER EVENTS
// ============================================================================
export const getOrganizerEvents = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const organizerId = req.user?.id;

    // Vérifier que l'utilisateur est authentifié
    if (!organizerId) {
      res.status(401).json({ message: 'Utilisateur non authentifié' });
      return;
    }

    const events = await EventModel.find({ organizer: organizerId })
      .sort({ date: 1 });

    res.json({ events });
  } catch (error) {
    console.error('Get organizer events error:', error);
    res.status(500).json({ message: 'Error fetching organizer events' });
  }
};

// ============================================================================
// GET EVENT STATS
// ============================================================================
export const getEventStats = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const organizerId = req.user?.id;
    const userRole = req.user?.role;

    // Vérifier que l'utilisateur est authentifié
    if (!organizerId) {
      return res.status(401).json({ message: 'Utilisateur non authentifié' });
    }

    const now = new Date();

    // Si c'est un super admin, récupérer les statistiques globales de toute la plateforme
    if (userRole === 'SUPER_ADMIN') {
      const allEvents = await EventModel.find({}).populate('participants');
      const eventIds = allEvents.map(event => event._id);

      // Récupérer TOUTES les candidatures de la plateforme (SAUF WITHDRAWN)
      const allApplications = await ApplicationModel.find({
        event: { $in: eventIds },
        status: { $ne: 'WITHDRAWN' }
      });

      const totalEvents = allEvents.length;
      const pendingApplications = allApplications.filter(app => app.status === 'PENDING').length;
      const acceptedApplications = allApplications.filter(app => app.status === 'ACCEPTED').length;
      const rejectedApplications = allApplications.filter(app => app.status === 'REJECTED').length;

      // Calculer les évènements à venir non complets
      const upcomingIncompleteEvents = allEvents.filter(event => {
        const eventDate = new Date(event.date);
        const isUpcoming = eventDate >= now;
        const isPublished = event.status === 'draft' || event.status === 'published';
        const participantsCount = event.participants?.length || 0;
        const maxPerformers = event.requirements?.maxPerformers || 0;
        const isIncomplete = participantsCount < maxPerformers;

        return isUpcoming && isPublished && isIncomplete;
      }).length;

      // Calculer les évènements complets (toutes les places prises)
      const fullEvents = allEvents.filter(event => {
        const participantsCount = event.participants?.length || 0;
        const maxPerformers = event.requirements?.maxPerformers || 0;
        const eventDate = new Date(event.date);
        const isUpcoming = eventDate >= now;

        return participantsCount >= maxPerformers && maxPerformers > 0 && isUpcoming;
      }).length;

      const cancelledEvents = allEvents.filter(event => event.status === 'cancelled').length;

      const organizerCount = await UserModel.countDocuments({ role: 'ORGANIZER' });
      const comedianCount = await UserModel.countDocuments({ role: 'COMEDIAN' });

      return res.status(200).json({
        totalEvents,
        upcomingIncompleteEvents,
        fullEvents,
        cancelledEvents,
        pendingApplications,
        acceptedApplications,
        rejectedApplications,
        organizerCount,
        comedianCount
      });
    }

    // Logique existante pour les organisateurs normaux
    let objectOrganizerId: mongoose.Types.ObjectId;
    try {
      objectOrganizerId = new mongoose.Types.ObjectId(organizerId);
    } catch (e) {
      console.error('Erreur création ObjectId:', e);
      return res.status(400).json({ message: 'ID organisateur invalide' });
    }

    // Récupérer tous les évènements de l'organisateur avec participants peuplés
    const allEvents = await EventModel.find({ organizer: objectOrganizerId }).populate('participants');
    const eventIds = allEvents.map(event => event._id);

    // Récupérer toutes les candidatures liées à ces évènements (SAUF WITHDRAWN)
    const allApplications = await ApplicationModel.find({
      event: { $in: eventIds },
      status: { $ne: 'WITHDRAWN' }
    });

    const totalEvents = allEvents.length;
    const pendingApplications = allApplications.filter(app => app.status === 'PENDING').length;
    const acceptedApplications = allApplications.filter(app => app.status === 'ACCEPTED').length;
    const rejectedApplications = allApplications.filter(app => app.status === 'REJECTED').length;

    // Calculer les évènements à venir non complets
    const upcomingIncompleteEvents = allEvents.filter(event => {
      const eventDate = new Date(event.date);
      const isUpcoming = eventDate >= now;
      const isPublished = event.status === 'draft' || event.status === 'published';
      const participantsCount = event.participants?.length || 0;
      const maxPerformers = event.requirements?.maxPerformers || 0;
      const isIncomplete = participantsCount < maxPerformers;

      return isUpcoming && isPublished && isIncomplete;
    }).length;

    // Calculer les évènements complets (toutes les places prises)
    const fullEvents = allEvents.filter(event => {
      const participantsCount = event.participants?.length || 0;
      const maxPerformers = event.requirements?.maxPerformers || 0;
      const eventDate = new Date(event.date);
      const isUpcoming = eventDate >= now;

      return participantsCount >= maxPerformers && maxPerformers > 0 && isUpcoming;
    }).length;

    const cancelledEvents = allEvents.filter(event => event.status === 'cancelled').length;

    return res.status(200).json({
      totalEvents,
      upcomingIncompleteEvents,
      fullEvents,
      cancelledEvents,
      pendingApplications,
      acceptedApplications,
      rejectedApplications
    });
  } catch (err) {
    console.error('Error fetching event stats:', err);
    return res.status(500).json({
      message: 'Erreur lors du chargement des statistiques',
      error: err instanceof Error ? err.message : 'Erreur interne du serveur'
    });
  }
};

// ============================================================================
// NOTIFY HUMORISTS
// ============================================================================
export const notifyHumorists = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const eventId = req.params.id;
    const organizerId = req.user?.id;

    // Vérifier que l'utilisateur est authentifié
    if (!organizerId) {
      res.status(401).json({ message: 'Utilisateur non authentifié' });
      return;
    }

    // Valider le format de l'ID
    if (!mongoose.Types.ObjectId.isValid(eventId)) {
      res.status(400).json({ message: 'Invalid event ID format' });
      return;
    }

    // Récupérer l'évènement
    const event = await EventModel.findById(eventId)
      .populate('organizer', 'firstName lastName email');

    if (!event) {
      res.status(404).json({ message: 'Évènement non trouvé' });
      return;
    }

    // Vérifier que l'utilisateur est bien l'organisateur de l'évènement
    const eventOrganizerId = typeof event.organizer === 'object' && event.organizer !== null
      ? (event.organizer as any)._id?.toString()
      : event.organizer?.toString();

    if (eventOrganizerId !== organizerId) {
      res.status(403).json({ message: 'Vous n\'êtes pas autorisé à envoyer des notifications pour cet évènement' });
      return;
    }

    // Récupérer les informations de l'organisateur
    const organizer = await UserModel.findById(organizerId);
    if (!organizer) {
      res.status(404).json({ message: 'Organisateur non trouvé' });
      return;
    }

    // Préparer les données de l'évènement pour l'email
    const eventData = {
      _id: event._id,
      title: event.title,
      description: event.description,
      date: event.date,
      location: event.location,
      requirements: event.requirements,
      startTime: event.startTime,
      endTime: event.endTime
    };

    const organizerData = {
      _id: organizer._id,
      firstName: organizer.firstName,
      lastName: organizer.lastName,
      email: organizer.email
    };

    // Envoyer les notifications en arrière-plan
    sendNewEventNotificationToHumorists(eventData, organizerData)
      .then(() => {
        console.log(`✅ Notifications envoyées manuellement pour l'évènement "${event.title}" par ${organizer.firstName} ${organizer.lastName}`);
      })
      .catch((error) => {
        console.error('❌ Erreur lors de l\'envoi manuel des notifications:', error);
      });

    res.status(200).json({
      message: 'Envoi des notifications aux humoristes en cours',
      eventId: event._id,
      eventTitle: event.title
    });
  } catch (error) {
    console.error('Error notifying humorists:', error);
    res.status(500).json({ message: 'Erreur lors de l\'envoi des notifications' });
  }
};

// ============================================================================
// INVITE COMEDIAN TO EVENT
// ============================================================================
/**
 * Permet à un organisateur d'inviter un humoriste spécifique à postuler pour un de ses événements
 */
export const inviteComedian = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { eventId, comedianId } = req.params;
    const organizerId = req.user?.id;

    // Vérifier que l'utilisateur est authentifié
    if (!organizerId) {
      res.status(401).json({ message: 'Utilisateur non authentifié' });
      return;
    }

    // Vérifier que l'utilisateur est un organisateur
    if (req.user?.role !== 'ORGANIZER') {
      res.status(403).json({ message: 'Seuls les organisateurs peuvent inviter des humoristes' });
      return;
    }

    // Valider les formats des IDs
    if (!mongoose.Types.ObjectId.isValid(eventId)) {
      res.status(400).json({ message: 'Format d\'ID d\'événement invalide' });
      return;
    }
    if (!mongoose.Types.ObjectId.isValid(comedianId)) {
      res.status(400).json({ message: 'Format d\'ID d\'humoriste invalide' });
      return;
    }

    // Récupérer l'événement
    const event = await EventModel.findById(eventId);
    if (!event) {
      res.status(404).json({ message: 'Événement non trouvé' });
      return;
    }

    // Vérifier que l'utilisateur est bien l'organisateur de l'événement
    const eventOrganizerId = typeof event.organizer === 'object' && event.organizer !== null
      ? (event.organizer as any)._id?.toString()
      : event.organizer?.toString();

    if (eventOrganizerId !== organizerId) {
      res.status(403).json({ message: 'Vous n\'êtes pas autorisé à inviter des humoristes pour cet événement' });
      return;
    }

    // Vérifier que l'événement est publié
    const eventStatus = event.status?.toLowerCase();
    if (eventStatus !== 'published') {
      res.status(400).json({ message: 'L\'événement doit être publié pour inviter des humoristes' });
      return;
    }

    // Vérifier que l'événement est à venir
    const eventDate = new Date(event.date);
    const now = new Date();
    if (eventDate < now) {
      res.status(400).json({ message: 'Impossible d\'inviter des humoristes pour un événement passé' });
      return;
    }

    // Récupérer l'humoriste
    const comedian = await UserModel.findById(comedianId);
    if (!comedian) {
      res.status(404).json({ message: 'Humoriste non trouvé' });
      return;
    }

    // Vérifier que c'est bien un humoriste
    if (comedian.role !== 'COMEDIAN') {
      res.status(400).json({ message: 'L\'utilisateur n\'est pas un humoriste' });
      return;
    }

    // Récupérer les informations de l'organisateur
    const organizer = await UserModel.findById(organizerId);
    if (!organizer) {
      res.status(404).json({ message: 'Organisateur non trouvé' });
      return;
    }

    // Préparer les données pour l'email
    const comedianData = {
      _id: comedian._id.toString(),
      email: comedian.email,
      firstName: comedian.firstName,
      lastName: comedian.lastName,
      emailSubscriptions: comedian.emailSubscriptions
    };

    const eventData = {
      _id: event._id,
      title: event.title,
      description: event.description,
      date: event.date,
      location: event.location,
      requirements: event.requirements,
      startTime: event.startTime,
      endTime: event.endTime
    };

    const organizerData = {
      firstName: organizer.firstName,
      lastName: organizer.lastName,
      email: organizer.email
    };

    // Envoyer l'invitation en arrière-plan
    sendEventInvitationToComedian(comedianData, eventData, organizerData)
      .then(() => {
        console.log(`✅ Invitation envoyée à ${comedian.email} pour l'événement "${event.title}" par ${organizer.firstName} ${organizer.lastName}`);
      })
      .catch((error) => {
        console.error('❌ Erreur lors de l\'envoi de l\'invitation:', error);
      });

    res.status(200).json({
      message: 'Invitation envoyée avec succès',
      eventId: event._id,
      eventTitle: event.title,
      comedianEmail: comedian.email,
      comedianName: `${comedian.firstName} ${comedian.lastName}`
    });
  } catch (error) {
    console.error('Error inviting comedian:', error);
    res.status(500).json({ message: 'Erreur lors de l\'envoi de l\'invitation' });
  }
};

// ============================================================================
// PROCESS COMPLETED EVENTS
// ============================================================================
export const processCompletedEvents = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Vérifier que l'utilisateur est authentifié
    if (!req.user?.id) {
      res.status(401).json({ message: 'Utilisateur non authentifié' });
      return;
    }

    // Vérifier que seul un super admin peut accéder à cette route
    if (req.user?.role !== 'SUPER_ADMIN') {
      res.status(403).json({ message: 'Accès refusé. Seuls les super-admins peuvent traiter les évènements.' });
      return;
    }

    const now = new Date();

    // Trouver tous les évènements passés qui ont des participants acceptés (sans populate pour garder des ObjectIds)
    const pastEvents = await EventModel.find({
      date: { $lt: now },
      status: { $in: ['published', 'completed'] }
    });

    let totalProcessed = 0;
    let participationsAdded = 0;

    for (const event of pastEvents) {
      const participants = Array.isArray(event.participants) ? event.participants : [];
      for (const participantIdRef of participants) {
        if (participantIdRef == null) continue;
        const participantId = participantIdRef instanceof mongoose.Types.ObjectId
          ? participantIdRef
          : (participantIdRef as any)?._id ?? participantIdRef;
        if (!participantId) continue;

        // Ne charger que role, stats et nom pour éviter de déclencher la validation du profil (ex. numberOfScenes invalide)
        const participant = await UserModel.findById(participantId)
          .select('role stats firstName lastName')
          .lean();

        if (!participant || participant.role !== 'COMEDIAN') continue;

        const stats = participant.stats || {};
        const processedEvents = Array.isArray(stats.processedEvents) ? stats.processedEvents : [];
        const eventIdStr = (event._id && (event._id as any).toString) ? (event._id as any).toString() : String(event._id);
        const alreadyProcessed = processedEvents.some((id: any) => (id && id.toString ? id.toString() : String(id)) === eventIdStr);

        if (alreadyProcessed) {
          console.log(`ℹ️ Évènement "${event.title}" déjà traité pour ${participant.firstName} ${participant.lastName}`);
          continue;
        }

        const absence = await AbsenceModel.findOne({
          event: event._id,
          comedian: participantId
        });

        // Mise à jour ciblée des stats uniquement (pas de save() du document → pas de validation profile.numberOfScenes)
        if (!absence) {
          await UserModel.updateOne(
            { _id: participantId },
            { $inc: { 'stats.totalEvents': 1 }, $push: { 'stats.processedEvents': eventIdStr } },
            { runValidators: false }
          );
          participationsAdded++;
          console.log(`✅ Participation ajoutée pour ${participant.firstName} ${participant.lastName} à l'évènement "${event.title}"`);
        } else {
          await UserModel.updateOne(
            { _id: participantId },
            { $push: { 'stats.processedEvents': eventIdStr } },
            { runValidators: false }
          );
          console.log(`⚠️ ${participant.firstName} ${participant.lastName} était absent à l'évènement "${event.title}" - pas de participation ajoutée`);
        }
      }
      totalProcessed++;
    }

    res.json({
      message: 'Traitement des évènements terminés effectué avec succès',
      eventsProcessed: totalProcessed,
      participationsAdded: participationsAdded
    });
  } catch (error: any) {
    console.error('Erreur lors du traitement des évènements terminés:', error);
    const message = error?.message || 'Erreur lors du traitement des évènements terminés';
    const detail = error?.stack || (typeof error === 'object' ? JSON.stringify(error) : String(error));
    res.status(500).json({
      message: 'Erreur lors du traitement des évènements terminés',
      error: message,
      ...(process.env.NODE_ENV !== 'production' && { detail })
    });
  }
};

// ============================================================================
// RESET PARTICIPATIONS
// ============================================================================
export const resetParticipations = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Vérifier que l'utilisateur est authentifié
    if (!req.user?.id) {
      res.status(401).json({ message: 'Utilisateur non authentifié' });
      return;
    }

    // Vérifier que seul un super admin peut accéder à cette route
    if (req.user?.role !== 'SUPER_ADMIN') {
      res.status(403).json({ message: 'Accès refusé. Seuls les super-admins peuvent réinitialiser les participations.' });
      return;
    }

    const humorists = await UserModel.find({ role: 'COMEDIAN' });
    let resetCount = 0;

    for (const humorist of humorists) {
      if (!humorist.stats) humorist.stats = {};
      humorist.stats.totalEvents = 0;
      humorist.stats.processedEvents = [];
      humorist.markModified('stats');
      await humorist.save();
      resetCount++;
    }

    res.json({ message: `Participations réinitialisées pour ${resetCount} humoristes.` });
  } catch (error) {
    console.error('Error resetting participations:', error);
    res.status(500).json({ message: 'Erreur lors de la réinitialisation des participations' });
  }
};

// ============================================================================
// MARK EVENTS AS COMPLETED - CRON JOB
// ============================================================================
/**
 * Marque automatiquement les évènements passés comme "completed" - Cron job
 *
 * Logique:
 * - Trouve tous les évènements qui ne sont pas déjà "completed" ou "cancelled"
 * - Vérifie si la date + endTime est passée
 * - Met à jour le statut à "completed"
 */
export const markEventsAsCompletedCron = async (req: Request, res: Response): Promise<void> => {
  try {
    // --- SÉCURITÉ: Vérifier l'authentification du cron ---
    const cronKey = req.header('X-CRON-KEY');
    if (!cronKey || cronKey !== config.cron.secret) {
      console.error('❌ Tentative d\'accès non autorisée à l\'endpoint cron mark-events-completed');
      res.status(401).json({ message: 'Non autorisé' });
      return;
    }

    console.log('🔔 Démarrage du job cron: marquage des évènements comme completed');
    const now = new Date();

    // Récupérer tous les évènements qui ne sont pas déjà completed ou cancelled
    const events = await EventModel.find({
      status: { $nin: ['completed', 'COMPLETED', 'cancelled', 'CANCELLED'] },
      date: { $lt: now } // Date dans le passé
    });

    console.log(`📊 ${events.length} évènements passés trouvés (non-completed, non-cancelled)`);

    let updatedCount = 0;
    const updatedEvents: string[] = [];

    // Traiter chaque évènement
    for (const event of events) {
      try {
        // Construire la date/heure de fin de l'évènement
        const eventDate = new Date(event.date);
        let eventEndDateTime: Date;

        if (event.endTime) {
          const [endH, endM] = event.endTime.split(':').map(Number);
          const endMinutes = endH * 60 + endM;
          let endDate = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate());
          if (event.startTime) {
            const [startH, startM] = event.startTime.split(':').map(Number);
            const startMinutes = startH * 60 + startM;
            if (endMinutes <= startMinutes) {
              endDate.setDate(endDate.getDate() + 1);
            }
          }
          eventEndDateTime = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate(), endH, endM, 0, 0);
        } else {
          // Sinon, considérer la fin de la journée (23:59:59)
          eventEndDateTime = new Date(
            eventDate.getFullYear(),
            eventDate.getMonth(),
            eventDate.getDate(),
            23,
            59,
            59,
            999
          );
        }

        // Vérifier si l'évènement est vraiment terminé
        if (now > eventEndDateTime) {
          event.status = 'completed';
          await event.save();
          updatedCount++;
          updatedEvents.push(event.title);
          console.log(`✅ Évènement "${event.title}" marqué comme completed`);

          // Émettre un évènement SSE pour notifier tous les clients
          const completedAudience = await getEventAudience(event._id.toString(), event.organizer.toString());
          emitEventCompleted(event._id.toString(), completedAudience);

          // Expirer les candidatures en attente pour cet évènement
          try {
            const expiredCount = await expirePendingApplicationsForEvent(event._id as mongoose.Types.ObjectId);
            if (expiredCount > 0) {
              console.log(`⏰ ${expiredCount} candidature(s) expirée(s) pour "${event.title}"`);
            }
          } catch (expireError) {
            console.error(`❌ Erreur lors de l'expiration des candidatures pour "${event.title}":`, expireError);
            // Ne pas faire échouer le cron si l'expiration échoue
          }
        }

      } catch (eventError) {
        console.error(`❌ Erreur lors du traitement de l'évènement ${event._id}:`, eventError);
      }
    }

    const response = {
      message: 'Évènements passés marqués comme completed',
      updated: updatedCount,
      totalChecked: events.length,
      updatedEvents: updatedEvents,
      timestamp: new Date().toISOString()
    };

    console.log(`📊 Résumé: ${updatedCount} évènements marqués comme completed sur ${events.length} vérifiés`);
    res.json(response);

  } catch (error) {
    console.error('❌ Erreur CRON mark-events-completed:', error);
    res.status(500).json({
      message: 'Erreur lors du marquage des évènements comme completed',
      error: error instanceof Error ? error.message : 'Erreur inconnue'
    });
  }
};

// ============================================================================
// UPLOAD PHOTO ÉVÉNEMENT (organisateur)
// ============================================================================
const ALLOWED_EVENT_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif'];
const MAX_EVENT_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB

export const uploadEventImage = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (req.user?.role !== 'ORGANIZER') {
      res.status(403).json({ message: 'Réservé aux organisateurs' });
      return;
    }
    const file = (req as any).file;
    if (!file) {
      res.status(400).json({ message: 'Aucun fichier reçu. Formats acceptés: JPG, PNG, GIF (max 5MB).' });
      return;
    }
    if (!ALLOWED_EVENT_IMAGE_TYPES.includes(file.mimetype)) {
      res.status(400).json({ message: 'Format non accepté. Utilisez JPG, PNG ou GIF.' });
      return;
    }
    if (file.size > MAX_EVENT_IMAGE_SIZE) {
      res.status(400).json({ message: 'Fichier trop volumineux (max 5MB).' });
      return;
    }
    const baseUrl = config.api.url.replace(/\/$/, '');
    const imageUrl = `${baseUrl}/uploads/events/${file.filename}`;
    res.status(200).json({ imageUrl });
  } catch (error: any) {
    console.error('Upload event image error:', error);
    res.status(500).json({ message: error?.message || 'Erreur lors de l\'upload.' });
  }
};

