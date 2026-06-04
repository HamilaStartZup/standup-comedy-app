import { VenueBookingModel } from '../models/VenueBooking';
import { VenueBlockedDateModel } from '../models/VenueBlockedDate';
import { computeBookingAmount } from './venuePricing';

export function timesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  const toMinutes = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };
  return toMinutes(aStart) < toMinutes(bEnd) && toMinutes(bStart) < toMinutes(aEnd);
}

/**
 * Calcule la deadline de paiement pour une réservation payante.
 * Règle : min(now+72h, eventStart−6h), planché à now+1h.
 */
export function computePaymentDeadlineAt(requestedDate: Date, startTime: string): Date {
  const deadline72h = new Date(Date.now() + 72 * 60 * 60 * 1000);
  const [startHour, startMinute] = startTime.split(':').map(Number);
  if (!isNaN(startHour) && !isNaN(startMinute)) {
    const eventStart = new Date(requestedDate);
    eventStart.setUTCHours(startHour, startMinute, 0, 0);
    const deadlineBeforeEvent = new Date(eventStart.getTime() - 6 * 60 * 60 * 1000);
    const minDeadline = new Date(Date.now() + 60 * 60 * 1000);
    const chosen = deadline72h < deadlineBeforeEvent ? deadline72h : deadlineBeforeEvent;
    return chosen < minDeadline ? minDeadline : chosen;
  }
  return deadline72h;
}

type VenueForStatus = {
  bookingMode?: string;
  pricePerEvent: number;
  pricingType?: string;
  deposit?: number;
  extraFees?: { description: string; amount?: number }[];
};

/**
 * Décide du statut initial d'une réservation selon le mode de la salle et le tarif.
 * Encapsule le bloc isAutomatic de createBooking.
 */
export function decideInitialBookingStatus(
  venue: VenueForStatus,
  requestedDate: Date,
  startTime: string,
  endTime: string
): { status: string; paymentDeadlineAt?: Date } {
  if (venue.bookingMode !== 'automatic') {
    return { status: 'PENDING' };
  }
  const { requiresPayment } = computeBookingAmount(
    { pricePerEvent: venue.pricePerEvent, pricingType: venue.pricingType as any, deposit: venue.deposit, extraFees: venue.extraFees },
    { startTime, endTime }
  );
  if (!requiresPayment) {
    return { status: 'CONFIRMED' };
  }
  return { status: 'ACCEPTED', paymentDeadlineAt: computePaymentDeadlineAt(requestedDate, startTime) };
}

/**
 * Vérifie qu'un créneau n'est pas bloqué et ne chevauche pas de réservation ACCEPTED/CONFIRMED.
 * NOTE : cette vérification n'est pas atomique avec le create() appelant.
 * En haute concurrence, deux requêtes simultanées peuvent passer ce check et créer un conflit.
 * Mitigation possible : transaction MongoDB (nécessite replica set).
 */
export async function checkSlotConflict(
  venueId: string,
  requestedDate: Date,
  startTime: string | undefined,
  endTime: string | undefined,
  pricingType?: string
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const dayStart = new Date(requestedDate);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(requestedDate);
  dayEnd.setHours(23, 59, 59, 999);

  const blockedDates = await VenueBlockedDateModel.find({
    venue: venueId,
    date: { $gte: dayStart, $lte: dayEnd },
  });

  const isBlocked = blockedDates.some((b) => {
    if (!b.startTime || !b.endTime) return true;
    const fixedSlotTypes = ['journee', 'soiree', 'forfait', 'gratuit', 'pourcentage_billetterie'];
    if (fixedSlotTypes.includes(pricingType || '')) return false;
    return timesOverlap(b.startTime, b.endTime, startTime!, endTime!);
  });

  if (isBlocked) {
    return { ok: false, reason: 'La salle est indisponible à cette date ou sur ce créneau' };
  }

  const acceptedBookings = await VenueBookingModel.find({
    venue: venueId,
    status: { $in: ['ACCEPTED', 'CONFIRMED'] },
    requestedDate: { $gte: dayStart, $lte: dayEnd },
  });

  const hasConflict = acceptedBookings.some((b) =>
    timesOverlap(b.startTime, b.endTime, startTime!, endTime!)
  );

  if (hasConflict) {
    return { ok: false, reason: 'La salle est déjà réservée sur ce créneau' };
  }

  return { ok: true };
}
