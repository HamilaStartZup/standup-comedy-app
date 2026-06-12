/**
 * Notification des spectateurs dans un rayon (km) lors de la création d'événements.
 * + email récapitulatif quotidien (max 1/jour).
 */
import { UserModel } from '../models/User';
import { EventModel } from '../models/Event';
import { getCityCoordinates, distanceKm } from '../utils/cityMapping';
import { createNotification } from '../controllers/notification';
import type { Types } from 'mongoose';

const ALLOWED_RADIUS_KM = [5, 10, 20, 50] as const;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export async function getEventCoordinates(event: {
  location?: { city?: string; postalCode?: string; latitude?: number; longitude?: number };
}): Promise<{ lat: number; lon: number } | null> {
  const loc = event.location;
  if (loc?.latitude != null && loc?.longitude != null) {
    return { lat: loc.latitude, lon: loc.longitude };
  }
  if (loc?.city) {
    return getCityCoordinates(loc.city, loc.postalCode);
  }
  return null;
}

export async function getSpectatorCoordinates(user: {
  city?: string;
  latitude?: number;
  longitude?: number;
}): Promise<{ lat: number; lon: number } | null> {
  if (user.latitude != null && user.longitude != null) {
    return { lat: user.latitude, lon: user.longitude };
  }
  if (user.city) {
    return getCityCoordinates(user.city);
  }
  return null;
}

async function notifyMatchingSpectators(
  coords: { lat: number; lon: number },
  title: string,
  message: string,
  relatedEventId: string
): Promise<number> {
  const spectators = await UserModel.find({ role: 'SPECTATOR' })
    .select('_id city latitude longitude spectatorPreferences')
    .lean();

  let notified = 0;
  for (const s of spectators) {
    const prefs = (s as any).spectatorPreferences;
    const radiusKm = ALLOWED_RADIUS_KM.includes(prefs?.radiusKm) ? prefs.radiusKm : 20;
    const specCoords = await getSpectatorCoordinates(s as any);
    if (!specCoords) continue;
    if (distanceKm(coords.lat, coords.lon, specCoords.lat, specCoords.lon) > radiusKm) continue;

    await createNotification(
      (s as any)._id.toString(),
      'new_event',
      title,
      message,
      relatedEventId
    );
    notified++;

    if ((s as any).latitude == null || (s as any).longitude == null) {
      await UserModel.updateOne(
        { _id: (s as any)._id },
        { $set: { latitude: specCoords.lat, longitude: specCoords.lon } }
      );
    }
  }
  return notified;
}

export async function notifySpectatorsInRadius(
  eventId: string,
  event: {
    _id: Types.ObjectId;
    title: string;
    date: Date;
    location?: { city?: string; postalCode?: string; latitude?: number; longitude?: number };
  }
): Promise<void> {
  try {
    const coords = await getEventCoordinates(event);
    if (!coords) {
      console.log('[SpectatorNotif] Événement sans coordonnées, notification par rayon ignorée');
      return;
    }

    const eventTitle = event.title || 'Nouvel événement';
    const eventDate = event.date
      ? new Date(event.date).toLocaleDateString('fr-FR', {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })
      : '';
    const title = 'Nouvel événement près de chez vous';
    const message = `${eventTitle}${eventDate ? ` - ${eventDate}` : ''}. Découvrez-le sur l'accueil !`;

    const notified = await notifyMatchingSpectators(coords, title, message, eventId);
    if (notified > 0) {
      console.log(`✅ [SpectatorNotif] ${notified} spectateur(s) notifié(s) dans le rayon pour l'événement ${eventId}`);
    }
  } catch (err) {
    console.error('❌ [SpectatorNotif] Erreur:', err);
  }
}

export async function notifySpectatorsOfEventSeries(
  events: Array<{
    _id: Types.ObjectId;
    title: string;
    date: Date;
    location?: { city?: string; postalCode?: string; latitude?: number; longitude?: number };
  }>
): Promise<void> {
  if (events.length === 0) return;
  try {
    const first = events[0];
    const coords = await getEventCoordinates(first);
    if (!coords) {
      console.log('[SpectatorNotif] Série sans coordonnées, notification par rayon ignorée');
      return;
    }

    const n = events.length;
    const firstDate = first.date
      ? new Date(first.date).toLocaleDateString('fr-FR', {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })
      : '';
    const eventTitle = first.title || 'Nouvel événement';
    const title = 'Nouvelle série d\'événements près de chez vous';
    const message = `Série de ${n} date${n > 1 ? 's' : ''} — ${eventTitle}, à partir du ${firstDate}. Découvrez-la sur l'accueil !`;

    const notified = await notifyMatchingSpectators(coords, title, message, first._id.toString());
    if (notified > 0) {
      console.log(`✅ [SpectatorNotif] ${notified} spectateur(s) notifié(s) pour la série (${n} dates, event ${first._id})`);
    }
  } catch (err) {
    console.error('❌ [SpectatorNotif] Erreur série:', err);
  }
}

/**
 * Envoie l'email récapitulatif quotidien aux spectateurs (max 1/jour par spectateur).
 * À appeler via cron une fois par jour.
 */
export async function runDailySpectatorRecap(): Promise<{ sent: number; skipped: number }> {
  const { sendDailySpectatorRecapEmail } = await import('./emailService');
  const since = new Date(Date.now() - ONE_DAY_MS);
  const spectators = await UserModel.find({
    role: 'SPECTATOR',
    'spectatorPreferences.dailyRecapEmail': true,
  })
    .select('_id email firstName lastName city latitude longitude spectatorPreferences')
    .lean();

  let sent = 0;
  let skipped = 0;
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  for (const s of spectators) {
    const prefs = (s as any).spectatorPreferences;
    const lastAt = prefs?.lastDailyRecapAt ? new Date(prefs.lastDailyRecapAt) : null;
    if (lastAt && lastAt >= todayStart) {
      skipped++;
      continue;
    }

    const radiusKm = ALLOWED_RADIUS_KM.includes(prefs?.radiusKm) ? prefs.radiusKm : 20;
    const specCoords = await getSpectatorCoordinates(s as any);
    if (!specCoords) {
      skipped++;
      continue;
    }

    const events = await EventModel.find({
      status: { $in: ['published', 'PUBLISHED'] },
      date: { $gte: new Date() },
      createdAt: { $gte: since },
    })
      .select('title date location createdAt')
      .lean();

    const inRadius: any[] = [];
    for (const ev of events) {
      const coords = await getEventCoordinates(ev as any);
      if (coords && distanceKm(coords.lat, coords.lon, specCoords.lat, specCoords.lon) <= radiusKm) {
        inRadius.push(ev);
      }
    }

    if (inRadius.length === 0) {
      skipped++;
      continue;
    }

    try {
      await sendDailySpectatorRecapEmail(s as any, inRadius);
      await UserModel.updateOne(
        { _id: (s as any)._id },
        { $set: { 'spectatorPreferences.lastDailyRecapAt': new Date() } }
      );
      sent++;
    } catch (err) {
      console.error(`[SpectatorRecap] Erreur envoi à ${(s as any).email}:`, err);
    }
  }

  if (sent > 0 || skipped > 0) {
    console.log(`✅ [SpectatorRecap] Envoyés: ${sent}, ignorés: ${skipped}`);
  }
  return { sent, skipped };
}
