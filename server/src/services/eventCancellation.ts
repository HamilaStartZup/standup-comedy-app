import mongoose from 'mongoose';
import { EventDocument } from '../models/Event';
import { ApplicationModel } from '../models/Application';
import { UserModel } from '../models/User';
import { sendEventCancellationToParticipants } from './emailService';
import { createNotification } from '../controllers/notification';
import { emitEventUpdated } from './eventEmitter';

/**
 * Module neutre d'annulation d'événement. N'importe ni `event.ts` ni
 * `venueBooking.ts` → la cascade réservation → événement peut l'appeler sans cycle d'import.
 */

interface PopulatedComedian {
  _id: mongoose.Types.ObjectId;
  email?: string;
  firstName?: string;
  lastName?: string;
  role?: string;
}

/** Audience SSE d'un événement : organisateur + humoristes à candidature active. */
async function getEventAudience(
  eventId: mongoose.Types.ObjectId | string,
  organizerId: string
): Promise<string[]> {
  const applications = await ApplicationModel.find(
    { event: eventId, status: { $in: ['PENDING', 'ACCEPTED'] } },
    { comedian: 1 }
  );
  const comedianIds = applications.map((a) => a.comedian?.toString()).filter(Boolean) as string[];
  return [organizerId, ...comedianIds].filter((v, i, arr) => arr.indexOf(v) === i);
}

/**
 * Notifie les participants de l'annulation d'un événement : humoristes à candidature active
 * (email + notification in-app) et spectateurs inscrits (in-app). Sans effet pour un événement
 * passé. `req`/`res`-free.
 *
 * Les notifications spectateurs ne sont **pas** conditionnées par la présence de candidatures
 * (contrairement à l'ancien code inline de `updateEvent`).
 */
export async function notifyEventCancellation(event: EventDocument, reason?: string): Promise<void> {
  const eventDateAtMidnight = new Date(event.date);
  eventDateAtMidnight.setHours(0, 0, 0, 0);
  const todayAtMidnight = new Date();
  todayAtMidnight.setHours(0, 0, 0, 0);
  if (eventDateAtMidnight < todayAtMidnight) return; // pas de notification pour un événement passé

  const organizer = await UserModel.findById(event.organizer).select('firstName lastName email');
  if (!organizer) return;
  const organizerId = organizer._id.toString();

  // Humoristes à candidature active
  const affectedApplications = await ApplicationModel.find({
    event: event._id,
    status: { $in: ['PENDING', 'ACCEPTED'] },
  }).populate<{ comedian: PopulatedComedian }>('comedian', 'email firstName lastName role');

  const participants = affectedApplications
    .map((app) => app.comedian)
    .filter((c): c is PopulatedComedian => !!c?.email);

  if (participants.length > 0) {
    try {
      await sendEventCancellationToParticipants(
        participants as any,
        event as any,
        { firstName: organizer.firstName, lastName: organizer.lastName, email: organizer.email },
        reason
      );
    } catch (err) {
      console.error('[EventCancellation] Échec email annulation aux participants:', err, { eventId: event._id });
    }
  }

  for (const app of affectedApplications) {
    const comedian = app.comedian;
    if (comedian && comedian.role === 'COMEDIAN') {
      await createNotification(
        comedian._id.toString(),
        'event_cancelled',
        'Évènement annulé',
        `L'évènement "${event.title}" auquel vous avez postulé a été annulé.`,
        event._id.toString(),
        app._id.toString(),
        organizerId
      );
    }
  }

  // Spectateurs inscrits — indépendamment des candidatures
  const spectatorIds = (event.spectatorRegistrations || []) as mongoose.Types.ObjectId[];
  for (const sid of spectatorIds) {
    const spectatorId = sid?.toString?.();
    if (spectatorId) {
      await createNotification(
        spectatorId,
        'event_cancelled',
        'Évènement annulé',
        `L'évènement "${event.title}" auquel vous étiez inscrit a été annulé.`,
        event._id.toString()
      );
    }
  }
}

/**
 * Annule un événement (soft : `status='cancelled'` + `cancellationReason`), déclenche les
 * notifications participants et émet l'événement SSE. **Idempotent** (no-op si déjà annulé).
 * `req`/`res`-free — utilisé par la cascade réservation → événement et l'annulation de série.
 * `skipNotify` permet de différer les notifications (ex. annulation de série avec regroupement).
 */
export async function cancelEventInternal(
  event: EventDocument,
  reason?: string,
  options: { skipNotify?: boolean } = {}
): Promise<void> {
  if (event.status === 'cancelled') return;
  event.status = 'cancelled';
  if (reason !== undefined) event.cancellationReason = reason;
  await event.save();

  if (!options.skipNotify) {
    await notifyEventCancellation(event, reason);
  }

  const audience = await getEventAudience(event._id as mongoose.Types.ObjectId, event.organizer.toString());
  emitEventUpdated(event._id.toString(), audience);
}

/**
 * Notifie en une seule passe l'ensemble des participants distincts d'une série d'événements annulés.
 * Dédoublonne humoristes et spectateurs sur tous les événements pour éviter le spam.
 * 1 notif in-app + 1 email groupé par participant distinct.
 */
export async function notifySeriesCancellation(
  events: EventDocument[],
  reason?: string
): Promise<void> {
  if (events.length === 0) return;

  const eventIds = events.map((e) => e._id);
  const organizer = await UserModel.findById(events[0].organizer).select('firstName lastName email');
  if (!organizer) return;
  const organizerId = organizer._id.toString();

  // Collect distinct comedians with active applications across all events
  const applications = await ApplicationModel.find(
    { event: { $in: eventIds }, status: { $in: ['PENDING', 'ACCEPTED'] } }
  ).populate<{ comedian: PopulatedComedian }>('comedian', 'email firstName lastName role');

  const seenComedianIds = new Set<string>();
  const distinctComedians: PopulatedComedian[] = [];
  for (const app of applications) {
    const c = app.comedian;
    if (!c) continue;
    const id = c._id.toString();
    if (!seenComedianIds.has(id)) {
      seenComedianIds.add(id);
      distinctComedians.push(c);
    }
  }

  const dates = events
    .map((e) => new Date(e.date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }))
    .join(', ');
  const title = events[0].title;
  const n = events.length;

  // Email groupé aux humoristes concernés
  const comedianParticipants = distinctComedians.filter((c) => c.email);
  if (comedianParticipants.length > 0) {
    try {
      await sendEventCancellationToParticipants(
        comedianParticipants as any,
        { ...events[0], title: `${title} (${n} dates : ${dates})` } as any,
        { firstName: organizer.firstName, lastName: organizer.lastName, email: organizer.email },
        reason
      );
    } catch (err) {
      console.error('[EventCancellation] Échec email annulation série:', err);
    }
  }

  // Notifications in-app humoristes
  for (const comedian of distinctComedians) {
    if (comedian.role === 'COMEDIAN') {
      await createNotification(
        comedian._id.toString(),
        'event_cancelled',
        'Série d\'évènements annulée',
        n > 1
          ? `La série "${title}" (${n} dates) à laquelle vous avez postulé a été annulée.`
          : `L'évènement "${title}" auquel vous avez postulé a été annulé.`,
        events[0]._id.toString(),
        undefined,
        organizerId
      );
    }
  }

  // Collect distinct spectators across all events
  const seenSpectatorIds = new Set<string>();
  for (const event of events) {
    for (const sid of (event.spectatorRegistrations || []) as mongoose.Types.ObjectId[]) {
      const spectatorId = sid?.toString?.();
      if (spectatorId && !seenSpectatorIds.has(spectatorId)) {
        seenSpectatorIds.add(spectatorId);
      }
    }
  }

  for (const spectatorId of seenSpectatorIds) {
    await createNotification(
      spectatorId,
      'event_cancelled',
      'Série d\'évènements annulée',
      n > 1
        ? `La série "${title}" (${n} dates) à laquelle vous étiez inscrit a été annulée.`
        : `L'évènement "${title}" auquel vous étiez inscrit a été annulé.`,
      events[0]._id.toString()
    );
  }
}
