import { Types } from 'mongoose';
import type { EventDocument } from '../models/Event';
import { EventModel } from '../models/Event';
import { VenueBookingModel } from '../models/VenueBooking';

export function normalizeHHMM(t: string | undefined): string {
  const parts = (t || '0:0').split(':');
  const h = Number(parts[0]);
  const m = Number(parts[1] ?? 0);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function dateLocalYMD(d: Date | string): string {
  const date = new Date(d);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** Événement non annulé qui consomme déjà cette réservation (lien explicite ou correspondance date/heure/salle). */
export function eventUsesVenueBooking(
  event: Pick<EventDocument, 'venueBookingId' | 'date' | 'startTime' | 'location' | 'venue' | 'status'>,
  bookingId: Types.ObjectId | string,
  booking: {
    requestedDate: Date | string;
    startTime: string;
    venue?: { name?: string } | null;
  }
): boolean {
  const status = (event.status || '').toLowerCase();
  if (status === 'cancelled') return false;

  const bid = bookingId.toString();
  if (event.venueBookingId && event.venueBookingId.toString() === bid) return true;

  const eventDate = dateLocalYMD(event.date);
  const bookingDate = dateLocalYMD(booking.requestedDate);
  if (eventDate !== bookingDate) return false;
  if (normalizeHHMM(event.startTime) !== normalizeHHMM(booking.startTime)) return false;

  const eventVenue = ((event.location as { venue?: string })?.venue || event.venue || '').trim().toLowerCase();
  const bookingVenue = (booking.venue?.name || '').trim().toLowerCase();
  return Boolean(eventVenue && bookingVenue && eventVenue === bookingVenue);
}

/** IDs de réservations déjà liées à un événement actif de l'organisateur. */
export async function getUsedVenueBookingIdsForOrganizer(organizerId: string): Promise<string[]> {
  const organizerOid = new Types.ObjectId(organizerId);
  const [events, bookings] = await Promise.all([
    EventModel.find({
      organizer: organizerOid,
      status: { $ne: 'cancelled' },
    })
      .select('venueBookingId date startTime location venue status')
      .lean(),
    VenueBookingModel.find({
      requester: organizerOid,
      status: 'CONFIRMED',
    })
      .populate<{ venue: { name?: string } | null }>('venue', 'name')
      .lean(),
  ]);

  const used = new Set<string>();
  for (const booking of bookings) {
    const bid = booking._id.toString();
    const matched = events.some((ev) =>
      eventUsesVenueBooking(ev as EventDocument, bid, {
        requestedDate: booking.requestedDate,
        startTime: booking.startTime,
        venue: booking.venue,
      })
    );
    if (matched) used.add(bid);
  }
  return [...used];
}

export async function assertVenueBookingAvailableForNewEvent(
  organizerId: string,
  venueBookingId: string
): Promise<{ ok: true; booking: Awaited<ReturnType<typeof VenueBookingModel.findById>> } | { ok: false; message: string }> {
  if (!Types.ObjectId.isValid(venueBookingId)) {
    return { ok: false, message: 'Identifiant de réservation invalide.' };
  }

  const booking = await VenueBookingModel.findById(venueBookingId).populate<{ venue: { name?: string; isDeleted?: boolean } | null }>(
    'venue',
    'name isDeleted'
  );
  if (!booking) {
    return { ok: false, message: 'Réservation introuvable.' };
  }
  if (booking.requester.toString() !== organizerId) {
    return { ok: false, message: 'Cette réservation ne vous appartient pas.' };
  }
  if (booking.status !== 'CONFIRMED') {
    return { ok: false, message: 'Seules les réservations confirmées peuvent être utilisées pour créer un événement.' };
  }
  if (booking.venue?.isDeleted) {
    return { ok: false, message: 'La salle associée à cette réservation n\'existe plus.' };
  }

  const usedIds = await getUsedVenueBookingIdsForOrganizer(organizerId);
  if (usedIds.includes(venueBookingId)) {
    return {
      ok: false,
      message: 'Un événement existe déjà pour cette réservation de salle. Choisissez une autre réservation.',
    };
  }

  return { ok: true, booking };
}
