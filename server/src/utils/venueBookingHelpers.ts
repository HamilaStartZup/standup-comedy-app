import mongoose from 'mongoose';
import { VenueBookingModel } from '../models/VenueBooking';
import { VenueBlockedDateModel } from '../models/VenueBlockedDate';
import { computeBookingAmount } from './venuePricing';
import { emitVenueBookingPaymentUpdated } from '../services/eventEmitter';
import { createNotification } from '../controllers/notification';
import { createInvoiceSnapshot } from '../services/invoiceSnapshot';

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
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date(requestedDate);
  dayEnd.setUTCHours(23, 59, 59, 999);

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

// ─── Vérification de conflit batch (N+1 → 2 requêtes) ───────────────────────

export type SlotCheckInput = {
  date: Date;
  startTime?: string;
  endTime?: string;
  pricingType?: string;
};

/**
 * Variante batch de checkSlotConflict : pré-charge toutes les dates bloquées et réservations
 * du range en 2 requêtes, puis vérifie chaque créneau en mémoire.
 * Ne dégrade pas la signature de checkSlotConflict unitaire.
 */
export async function checkSlotConflictBatch(
  venueId: string,
  slots: SlotCheckInput[]
): Promise<({ ok: true } | { ok: false; reason: string })[]> {
  if (slots.length === 0) return [];

  const timestamps = slots.map((s) => s.date.getTime());
  const rangeStart = new Date(Math.min(...timestamps));
  rangeStart.setUTCHours(0, 0, 0, 0);
  const rangeEnd = new Date(Math.max(...timestamps));
  rangeEnd.setUTCHours(23, 59, 59, 999);

  const [blockedDates, acceptedBookings] = await Promise.all([
    VenueBlockedDateModel.find({ venue: venueId, date: { $gte: rangeStart, $lte: rangeEnd } }),
    VenueBookingModel.find({ venue: venueId, status: { $in: ['ACCEPTED', 'CONFIRMED'] }, requestedDate: { $gte: rangeStart, $lte: rangeEnd } }),
  ]);

  const fixedSlotTypes = ['journee', 'soiree', 'forfait', 'gratuit', 'pourcentage_billetterie'];

  return slots.map(({ date, startTime, endTime, pricingType }) => {
    const dayStartMs = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
    const dayEndMs = dayStartMs + 24 * 60 * 60 * 1000 - 1;

    const inDay = (d: Date | unknown) => {
      const t = (d instanceof Date ? d : new Date(d as string)).getTime();
      return t >= dayStartMs && t <= dayEndMs;
    };

    const isBlocked = blockedDates
      .filter((b) => inDay(b.date))
      .some((b) => {
        if (!b.startTime || !b.endTime) return true;
        if (fixedSlotTypes.includes(pricingType || '')) return false;
        return timesOverlap(b.startTime, b.endTime, startTime!, endTime!);
      });

    if (isBlocked) return { ok: false as const, reason: 'La salle est indisponible à cette date ou sur ce créneau' };

    const hasConflict = acceptedBookings
      .filter((b) => inDay(b.requestedDate))
      .some((b) => timesOverlap(b.startTime, b.endTime, startTime!, endTime!));

    if (hasConflict) return { ok: false as const, reason: 'La salle est déjà réservée sur ce créneau' };

    return { ok: true as const };
  });
}

// ─── Confirmation de paiement groupé ─────────────────────────────────────────

export type PopulatedGroupBooking = {
  _id: mongoose.Types.ObjectId;
  requester: mongoose.Types.ObjectId;
  status: string;
  startTime: string;
  endTime: string;
  venue: {
    _id: mongoose.Types.ObjectId;
    name: string;
    owner: mongoose.Types.ObjectId;
    pricePerEvent: number;
    pricingType?: string;
    deposit?: number;
    extraFees?: { description: string; amount?: number }[];
  };
};

/**
 * Confirme toutes les réservations ACCEPTED d'un lot après paiement Stripe.
 * Émet un SSE par réservation confirmée + 2 notifications groupées (requester + owner).
 * Retourne le nombre de réservations effectivement confirmées.
 * Le `find()` reste dans chaque caller (asymétrie de sécurité webhook vs fallback).
 */
export async function confirmGroupBookingsPaid(
  bookings: PopulatedGroupBooking[],
  paymentIntentId: string
): Promise<number> {
  let confirmedCount = 0;
  let groupNotifCtx: {
    requesterId: string;
    ownerId: string;
    venueId: string;
    venueName: string;
    firstBookingId: string;
  } | null = null;

  for (const booking of bookings) {
    if (booking.status !== 'ACCEPTED') continue;

    const { amount } = computeBookingAmount(
      {
        pricePerEvent: booking.venue.pricePerEvent,
        pricingType: booking.venue.pricingType as 'journee' | 'soiree' | 'heure' | 'forfait' | 'gratuit' | 'pourcentage_billetterie',
        deposit: booking.venue.deposit,
        extraFees: booking.venue.extraFees,
      },
      { startTime: booking.startTime, endTime: booking.endTime }
    );

    const updated = await VenueBookingModel.findOneAndUpdate(
      { _id: booking._id, status: 'ACCEPTED' },
      {
        status: 'CONFIRMED',
        paymentStatus: 'paid',
        paidAmount: amount,
        paidAt: new Date(),
        stripePaymentIntentId: paymentIntentId,
      },
      { new: true }
    );

    if (!updated) continue;
    confirmedCount++;
    await createInvoiceSnapshot(updated._id.toString());
    groupNotifCtx = groupNotifCtx ?? {
      requesterId: updated.requester.toString(),
      ownerId: booking.venue.owner.toString(),
      venueId: booking.venue._id.toString(),
      venueName: booking.venue.name,
      firstBookingId: updated._id.toString(),
    };

    emitVenueBookingPaymentUpdated(
      updated._id.toString(),
      booking.venue._id.toString(),
      updated.status,
      updated.paymentStatus,
      [updated.requester.toString(), booking.venue.owner.toString()]
    );
  }

  if (groupNotifCtx && confirmedCount > 0) {
    const n = confirmedCount;
    const ctx = groupNotifCtx;
    await createNotification(
      ctx.requesterId,
      'venue_booking_confirmed',
      'Réservation confirmée',
      n > 1
        ? `Votre paiement pour la série de ${n} réservations chez "${ctx.venueName}" a été reçu. Réservations confirmées !`
        : `Votre paiement pour "${ctx.venueName}" a été reçu. Réservation confirmée !`,
      undefined, undefined, undefined,
      ctx.venueId,
      ctx.firstBookingId
    );
    await createNotification(
      ctx.ownerId,
      'venue_booking_confirmed',
      'Paiement reçu',
      n > 1
        ? `Le paiement pour la série de ${n} réservations de "${ctx.venueName}" a été reçu. Réservations confirmées !`
        : `Le paiement pour la réservation de "${ctx.venueName}" a été reçu. Réservation confirmée !`,
      undefined, undefined, undefined,
      ctx.venueId,
      ctx.firstBookingId
    );
  }

  return confirmedCount;
}
