import { Response, Request } from 'express';
import mongoose from 'mongoose';
import { AuthRequest } from '../middleware/auth';
import { VenueModel, CancellationPolicy } from '../models/Venue';
import { VenueBookingModel, VenueBookingDocument, VenueBookingStatus } from '../models/VenueBooking';
import { VenueBlockedDateModel } from '../models/VenueBlockedDate';
import { InvoiceModel } from '../models/Invoice';
import { updateInvoiceRefund } from '../services/invoiceSnapshot';
import { NotificationModel } from '../models/Notification';
import { stripe } from './stripe';
import { EventModel, EventDocument } from '../models/Event';
import { cancelEventInternal, notifySeriesCancellation } from '../services/eventCancellation';
import { config } from '../config/env';
import {
  emitVenueBookingStatusChanged,
  emitVenueBookingPaymentUpdated,
} from '../services/eventEmitter';
import { createNotification } from './notification';
import { computeBookingAmount } from '../utils/venuePricing';
import { parsePaginationWithDefaults, buildPaginationResult } from '../utils/pagination';
import {
  timesOverlap,
  computePaymentDeadlineAt,
  decideInitialBookingStatus,
  checkSlotConflict,
  checkSlotConflictBatch,
} from '../utils/venueBookingHelpers';
import { parseCalendarDate, calendarWeekday, isCalendarDatePast } from '../utils/calendarDate';

function hasBookingEnded(requestedDate: Date, endTime: string): boolean {
  const [endHour, endMinute] = endTime.split(':').map(Number);
  const bookingEnd = new Date(requestedDate);
  if (!Number.isNaN(endHour) && !Number.isNaN(endMinute)) {
    bookingEnd.setHours(endHour, endMinute, 0, 0);
  } else {
    bookingEnd.setHours(23, 59, 59, 999);
  }
  return bookingEnd.getTime() < Date.now();
}

// ─── Calcul du montant remboursé selon la politique d'annulation ─────────────

interface RefundCalculation {
  refundAmount: number;
  refundPercent: 0 | 50 | 100;
  reason: 'grace_period' | 'full_refund' | 'partial_refund' | 'no_refund';
}

function calculateRefundAmount(
  paidAmount: number,
  policy: CancellationPolicy,
  eventDatetime: Date,
  bookingCreatedAt: Date,
  cancellationTime: Date = new Date()
): RefundCalculation {
  const hoursUntilEvent = (eventDatetime.getTime() - cancellationTime.getTime()) / 36e5;
  const daysUntilEvent = hoursUntilEvent / 24;
  const hoursSinceBooking = (cancellationTime.getTime() - bookingCreatedAt.getTime()) / 36e5;

  // Période de grâce universelle : < 24h après réservation ET >= 7j avant l'événement
  if (hoursSinceBooking <= 24 && daysUntilEvent >= 7) {
    return { refundAmount: paidAmount, refundPercent: 100, reason: 'grace_period' };
  }

  if (policy === 'flexible') {
    if (hoursUntilEvent >= 24) return { refundAmount: paidAmount, refundPercent: 100, reason: 'full_refund' };
    return { refundAmount: 0, refundPercent: 0, reason: 'no_refund' };
  }
  if (policy === 'moderate') {
    if (daysUntilEvent >= 5) return { refundAmount: paidAmount, refundPercent: 100, reason: 'full_refund' };
    return { refundAmount: 0, refundPercent: 0, reason: 'no_refund' };
  }
  if (policy === 'firm') {
    if (daysUntilEvent >= 30) return { refundAmount: paidAmount, refundPercent: 100, reason: 'full_refund' };
    if (daysUntilEvent >= 7) return { refundAmount: Math.round(paidAmount * 0.5 * 100) / 100, refundPercent: 50, reason: 'partial_refund' };
    return { refundAmount: 0, refundPercent: 0, reason: 'no_refund' };
  }
  return { refundAmount: 0, refundPercent: 0, reason: 'no_refund' };
}

// ─── Helper : remboursement Stripe automatique ──────────────────────────────

async function processStripeRefund(
  booking: Pick<VenueBookingDocument, 'paymentStatus' | 'stripePaymentIntentId' | 'stripeRefundId' | 'refundedAmount' | 'refundedAt' | 'paidAmount' | '_id'>,
  refundAmountEuros?: number
): Promise<void> {
  if (booking.paymentStatus !== 'paid') {
    return;
  }
  if (!booking.stripePaymentIntentId || !stripe) {
    // Stripe non configuré ou PaymentIntent manquant — remboursement manuel requis
    booking.paymentStatus = 'refund_pending';
    return;
  }
  try {
    const amountCents = refundAmountEuros !== undefined
      ? Math.round(refundAmountEuros * 100)
      : undefined;
    const refund = await stripe.refunds.create({
      payment_intent: booking.stripePaymentIntentId,
      ...(amountCents !== undefined && { amount: amountCents }),
    });
    booking.paymentStatus = 'refund_pending';
    booking.stripeRefundId = refund.id;
    booking.refundedAmount = refundAmountEuros ?? booking.paidAmount;
    // La confirmation finale du remboursement est effectuée par le webhook Stripe refund.updated
  } catch (err) {
    booking.paymentStatus = 'refund_pending';
    console.error('[Venue] Échec remboursement Stripe automatique:', err, { bookingId: booking._id });
  }
}

// ─── Helper : remboursement d'annulation selon la politique de la salle ──────

/** Champs nécessaires au calcul/déclenchement du remboursement (sans dépendre du populate de `venue`). */
type CancellableBooking = Pick<
  VenueBookingDocument,
  'status' | 'paymentStatus' | 'requestedDate' | 'startTime' | 'paidAmount' | 'createdAt'
  | 'stripePaymentIntentId' | 'stripeRefundId' | 'refundedAmount' | 'refundedAt' | '_id'
>;

/**
 * Applique le remboursement d'annulation à une réservation CONFIRMED & payée selon `policy`.
 * No-op sinon. Ne touche pas au statut (l'appelant pose CANCELLED_*). Réutilisé par
 * l'annulation unitaire et l'annulation de série.
 */
async function applyBookingCancellationRefund(
  booking: CancellableBooking,
  policy: CancellationPolicy
): Promise<void> {
  if (booking.status !== 'CONFIRMED' || booking.paymentStatus !== 'paid') return;
  const eventDatetime = new Date(booking.requestedDate);
  const [startH, startM] = booking.startTime.split(':').map(Number);
  eventDatetime.setUTCHours(startH, startM, 0, 0);
  const { refundAmount, refundPercent, reason } = calculateRefundAmount(
    booking.paidAmount!,
    policy,
    eventDatetime,
    booking.createdAt
  );
  if (refundPercent > 0) {
    await processStripeRefund(booking, refundAmount);
    console.log(`[Venue] Remboursement ${refundPercent}% (${reason}):`, booking._id);
  } else {
    console.log('[Venue] Annulation sans remboursement (' + reason + '):', booking._id);
  }
}

// ─── Cascade ADR 0002 : annulation réservation → événement lié (sens unique) ──

/**
 * Annule l'événement lié à une réservation (s'il existe). Sens unique booking → event.
 * Isolé : un échec n'interrompt jamais l'annulation de la réservation ni une boucle batch.
 * `skipNotify` permet de différer les notifications lors d'une annulation de série.
 * Retourne l'EventDocument annulé si trouvé (pour collecte dans cancelBookingGroup).
 */
async function cascadeCancelLinkedEvent(
  bookingId: unknown,
  reason?: string,
  options: { skipNotify?: boolean } = {}
): Promise<import('../models/Event').EventDocument | null> {
  try {
    const event = await EventModel.findOne({ venueBookingId: bookingId as mongoose.Types.ObjectId });
    if (event) {
      await cancelEventInternal(event, reason, options);
      return event;
    }
  } catch (err) {
    console.error('[Venue] Échec cascade annulation événement lié:', err, { bookingId });
  }
  return null;
}

/**
 * Annule une réservation (par id) avec remboursement selon la politique de sa salle, puis
 * cascade l'annulation de l'événement lié. Réutilisable hors HTTP (annulation de série Org A
 * côté événements, qui reste défensive vis-à-vis d'occurrences Org B). No-op si la réservation
 * est introuvable ou déjà dans un état terminal.
 */
interface CancelledBookingInfo {
  venueId: string;
  ownerId: string;
  venueName: string;
  requesterId: string;
  wasRefunded: boolean;
  cancelledEvent: EventDocument | null;
}

export async function cancelBookingWithRefund(
  bookingId: unknown,
  options: { skipNotify?: boolean } = {}
): Promise<CancelledBookingInfo | null> {
  const booking = await VenueBookingModel.findById(bookingId as mongoose.Types.ObjectId)
    .populate<{ venue: { _id: mongoose.Types.ObjectId; owner: mongoose.Types.ObjectId; name: string; cancellationPolicy?: CancellationPolicy } }>(
      'venue', 'cancellationPolicy owner name'
    );
  if (!booking || !['PENDING', 'ACCEPTED', 'CONFIRMED'].includes(booking.status)) return null;

  // Expirer une session de paiement en cours (empêche de payer une réservation annulée)
  if (booking.stripeSessionId && booking.paymentStatus === 'pending' && stripe) {
    try {
      await stripe.checkout.sessions.expire(booking.stripeSessionId);
    } catch (stripeErr) {
      console.error('[Venue] Erreur expiration session Stripe (annulation série):', stripeErr, { bookingId: booking._id });
    }
  }

  const policy: CancellationPolicy = booking.venue?.cancellationPolicy ?? 'moderate';
  await applyBookingCancellationRefund(booking, policy);
  booking.status = 'CANCELLED_BY_REQUESTER';
  await booking.save();

  const venueId = booking.venue._id.toString();
  const ownerId = booking.venue.owner.toString();
  const venueName = booking.venue.name;
  const requesterId = booking.requester.toString();

  emitVenueBookingStatusChanged(
    booking._id.toString(),
    venueId,
    booking.status,
    booking.paymentStatus,
    [requesterId, ownerId]
  );

  const cancelledEvent = await cascadeCancelLinkedEvent(booking._id, undefined, options);

  return { venueId, ownerId, venueName, requesterId, wasRefunded: booking.paymentStatus === 'refunded', cancelledEvent };
}

// ─── Créer une demande de réservation ────────────────────────────────────────

export const createBooking = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const requesterId = req.user?.id;
    const { venueId } = req.params;

    if (!requesterId) {
      res.status(401).json({ message: 'Non authentifié' });
      return;
    }

    if (!mongoose.Types.ObjectId.isValid(venueId)) {
      res.status(400).json({ message: 'ID de salle invalide' });
      return;
    }

    const venue = await VenueModel.findById(venueId);
    if (!venue || !venue.isActive || venue.isDeleted) {
      res.status(404).json({ message: 'Salle introuvable ou indisponible' });
      return;
    }

    // Le propriétaire ne peut pas réserver sa propre salle
    if (venue.owner.toString() === requesterId) {
      res.status(403).json({ message: 'Vous ne pouvez pas réserver votre propre salle' });
      return;
    }

    const { requestedDate, message } = req.body;
    let { startTime, endTime } = req.body as { startTime?: string; endTime?: string };
    const date = new Date(requestedDate);

    if (isNaN(date.getTime())) {
      res.status(400).json({ message: 'Date de réservation invalide' });
      return;
    }

    if (venue.disabledWeekdays && venue.disabledWeekdays.includes(date.getDay())) {
      res.status(400).json({ message: 'Cette salle n\'est pas disponible ce jour-là.' });
      return;
    }

    const pricingType = venue.pricingType as string | undefined;

    // Normaliser startTime/endTime selon le pricingType
    const needsSlotValidation = !pricingType || pricingType === 'heure' || pricingType === 'demi_journee';

    if (needsSlotValidation) {
      if (pricingType === 'demi_journee') {
        const tr = venue.timeRestrictions;
        const matinStart = tr?.matinStart || '09:00';
        const matinEnd = tr?.matinEnd || '13:00';
        const apremStart = tr?.apremStart || '14:00';
        const apremEnd = tr?.apremEnd || '18:00';
        const validStarts: string[] = [];
        if (tr?.matinEnabled !== false) validStarts.push(matinStart);
        if (tr?.apremEnabled !== false) validStarts.push(apremStart);
        if (validStarts.length === 0) {
          res.status(400).json({ message: 'Aucun créneau demi-journée n\'est disponible pour cette salle.' });
          return;
        }
        if (startTime && !validStarts.includes(startTime)) {
          res.status(400).json({ message: `Pour une demi-journée, l'heure de début doit être ${validStarts.join(' ou ')}` });
          return;
        }
        if (!startTime) startTime = validStarts[0];
        if (!endTime) endTime = startTime === apremStart ? apremEnd : matinEnd;
      } else if (pricingType === 'heure') {
        if (!startTime || !endTime) {
          res.status(400).json({ message: 'Les champs startTime et endTime sont requis pour une tarification à l\'heure' });
          return;
        }
      } else {
        // Fallback (pricingType absent) — créneaux requis
        if (!startTime || !endTime) {
          res.status(400).json({ message: 'Les champs startTime et endTime sont requis' });
          return;
        }
      }
    } else {
      // Pas de créneau nécessaire : normaliser selon les restrictions de la salle
      const tr = venue.timeRestrictions;
      if (pricingType === 'soiree') {
        startTime = startTime ?? (tr?.soireeStart || '18:00');
        endTime = endTime ?? (tr?.soireeEnd || '23:59');
      } else {
        startTime = startTime ?? (tr?.openTime || '00:00');
        endTime = endTime ?? (tr?.closeTime || '23:59');
      }
    }

    // Valider les restrictions horaires de la salle (pour les types à créneaux variables)
    const tr = venue.timeRestrictions;
    if (tr && startTime && endTime) {
      const toMinutes = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
      if (pricingType === 'heure' && tr.openTime && tr.closeTime) {
        if (toMinutes(startTime) < toMinutes(tr.openTime) || toMinutes(endTime) > toMinutes(tr.closeTime)) {
          res.status(400).json({ message: `Les réservations à l'heure sont possibles uniquement entre ${tr.openTime} et ${tr.closeTime}.` });
          return;
        }
      }
    }

    const slotCheck = await checkSlotConflict(venueId, date, startTime, endTime, pricingType);
    if (slotCheck.ok === false) {
      res.status(409).json({ message: slotCheck.reason });
      return;
    }

    const { amount } = computeBookingAmount(
      { pricePerEvent: venue.pricePerEvent, pricingType: pricingType as any, deposit: venue.deposit, extraFees: venue.extraFees },
      { startTime, endTime }
    );

    const { status: initialStatus, paymentDeadlineAt } = decideInitialBookingStatus(
      venue,
      date,
      startTime!,
      endTime!
    );

    const isAutomatic = venue.bookingMode === 'automatic';

    const booking = await VenueBookingModel.create({
      venue: venueId,
      requester: requesterId,
      requestedDate: date,
      startTime,
      endTime,
      message,
      status: initialStatus,
      ...(paymentDeadlineAt && { paymentDeadlineAt }),
      ...(amount > 0 && { paidAmount: undefined }),
    });

    emitVenueBookingStatusChanged(
      booking._id.toString(),
      venueId,
      booking.status,
      booking.paymentStatus,
      [requesterId, venue.owner.toString()]
    );

    // Notifications selon le mode de réservation
    try {
      if (!isAutomatic) {
        // Mode manuel : notifier le propriétaire
        await NotificationModel.create({
          user: venue.owner,
          type: 'venue_booking_request',
          title: 'Nouvelle demande de réservation',
          message: `Une demande de réservation a été faite pour votre salle "${venue.name}".`,
          relatedVenue: venue._id,
          relatedBooking: booking._id,
          read: false,
        });
      } else if (initialStatus === 'CONFIRMED') {
        // Mode automatique, salle gratuite → notifier le requester de la confirmation
        await NotificationModel.create({
          user: requesterId,
          type: 'venue_booking_confirmed',
          title: 'Réservation confirmée',
          message: `Votre réservation pour "${venue.name}" a été confirmée automatiquement (aucun paiement requis).`,
          relatedVenue: venue._id,
          relatedBooking: booking._id,
          read: false,
        });
      } else {
        // Mode automatique, salle payante → notifier le requester du paiement requis
        await NotificationModel.create({
          user: requesterId,
          type: 'venue_booking_payment_required',
          title: 'Réservation acceptée — paiement requis',
          message: `Votre réservation pour "${venue.name}" a été acceptée automatiquement. Vous avez 72h pour effectuer le paiement.`,
          relatedVenue: venue._id,
          relatedBooking: booking._id,
          read: false,
        });
      }
    } catch (notifError) {
      console.error('Erreur création notification createBooking:', notifError, { venueId });
    }

    res.status(201).json({ booking });
  } catch (error) {
    console.error('Erreur createBooking:', error);
    res.status(500).json({ message: 'Erreur interne du serveur' });
  }
};

// ─── Réservation par lot (série récurrente Org B) ────────────────────────────

export const createBookingBatch = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const requesterId = req.user?.id;
    const { venueId } = req.params;

    if (!requesterId) {
      res.status(401).json({ message: 'Non authentifié' });
      return;
    }

    if (!mongoose.Types.ObjectId.isValid(venueId)) {
      res.status(400).json({ message: 'ID de salle invalide' });
      return;
    }

    const venue = await VenueModel.findById(venueId);
    if (!venue || !venue.isActive || venue.isDeleted) {
      res.status(404).json({ message: 'Salle introuvable ou indisponible' });
      return;
    }

    if (venue.owner.toString() === requesterId) {
      res.status(403).json({ message: 'Vous ne pouvez pas réserver votre propre salle' });
      return;
    }

    const { dates, message } = req.body as { dates: string[]; message?: string };
    let { startTime, endTime } = req.body as { startTime?: string; endTime?: string };

    const pricingType = venue.pricingType as string | undefined;

    // Normaliser startTime/endTime selon le pricingType si non fournis
    if (!startTime || !endTime) {
      const tr = venue.timeRestrictions;
      if (pricingType === 'soiree') {
        startTime = startTime ?? (tr?.soireeStart || '18:00');
        endTime = endTime ?? (tr?.soireeEnd || '23:59');
      } else {
        startTime = startTime ?? (tr?.openTime || '00:00');
        endTime = endTime ?? (tr?.closeTime || '23:59');
      }
    }

    const bookingGroupId = new mongoose.Types.ObjectId();
    const isAutomatic = venue.bookingMode === 'automatic';

    // Non-transactionnel par choix (ADR 0001) : chaque réservation est indépendante.
    const created: VenueBookingDocument[] = [];
    const unavailable: { date: string; reason: string }[] = [];

    const toMinutes = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

    // Pré-filtrage (weekday + time) avant le slot check batch (2 requêtes pour N dates)
    type DateEntry = { dateStr: string; date: Date; needsSlotCheck: boolean; earlyReject?: string };
    const entries: DateEntry[] = dates.map((dateStr) => {
      const date = parseCalendarDate(dateStr);
      if (venue.disabledWeekdays && venue.disabledWeekdays.includes(calendarWeekday(dateStr))) {
        return { dateStr, date, needsSlotCheck: false, earlyReject: 'Cette salle n\'est pas disponible ce jour-là.' };
      }
      const tr = venue.timeRestrictions;
      if (tr && startTime && endTime && pricingType === 'heure' && tr.openTime && tr.closeTime) {
        if (toMinutes(startTime) < toMinutes(tr.openTime) || toMinutes(endTime) > toMinutes(tr.closeTime)) {
          return { dateStr, date, needsSlotCheck: false, earlyReject: `Les réservations à l'heure sont possibles uniquement entre ${tr.openTime} et ${tr.closeTime}.` };
        }
      }
      return { dateStr, date, needsSlotCheck: true };
    });

    const slotCheckEntries = entries.filter((e) => e.needsSlotCheck);
    const slotResults = await checkSlotConflictBatch(
      venueId,
      slotCheckEntries.map((e) => ({ date: e.date, startTime: startTime ?? undefined, endTime: endTime ?? undefined, pricingType: pricingType ?? undefined }))
    );
    const slotResultMap = new Map(slotCheckEntries.map((e, i) => [e.dateStr, slotResults[i]]));

    for (const { dateStr, date, needsSlotCheck, earlyReject } of entries) {
      if (!needsSlotCheck) {
        unavailable.push({ date: dateStr, reason: earlyReject! });
        continue;
      }

      const slotCheck = slotResultMap.get(dateStr)!;
      if (slotCheck.ok === false) {
        unavailable.push({ date: dateStr, reason: slotCheck.reason });
        continue;
      }

      const { status: initialStatus, paymentDeadlineAt } = decideInitialBookingStatus(
        venue,
        date,
        startTime!,
        endTime!
      );

      const booking = await VenueBookingModel.create({
        venue: venueId,
        requester: requesterId,
        bookingGroupId,
        requestedDate: date,
        startTime,
        endTime,
        message,
        status: initialStatus,
        ...(paymentDeadlineAt && { paymentDeadlineAt }),
      });

      emitVenueBookingStatusChanged(
        booking._id.toString(),
        venueId,
        booking.status,
        booking.paymentStatus,
        [requesterId, venue.owner.toString()]
      );

      created.push(booking);
    }

    // Une seule notification par destinataire pour l'ensemble de la série
    if (created.length > 0) {
      const n = created.length;
      const firstBooking = created[0];
      const label = n > 1 ? `série de ${n} créneaux` : 'réservation';
      if (!isAutomatic) {
        await createNotification(
          venue.owner.toString(),
          'venue_booking_request',
          'Nouvelle demande de réservation',
          `Une demande de ${label} a été faite pour votre salle "${venue.name}".`,
          undefined, undefined, undefined,
          venue._id.toString(),
          firstBooking._id.toString()
        );
      } else if (firstBooking.status === 'CONFIRMED') {
        await createNotification(
          requesterId,
          'venue_booking_confirmed',
          'Réservation confirmée',
          n > 1
            ? `Vos ${n} réservations pour "${venue.name}" ont été confirmées automatiquement (aucun paiement requis).`
            : `Votre réservation pour "${venue.name}" a été confirmée automatiquement (aucun paiement requis).`,
          undefined, undefined, undefined,
          venue._id.toString(),
          firstBooking._id.toString()
        );
      } else {
        await createNotification(
          requesterId,
          'venue_booking_payment_required',
          'Réservation acceptée — paiement requis',
          n > 1
            ? `Vos ${n} réservations pour "${venue.name}" ont été acceptées automatiquement. Vous avez 72h pour effectuer le paiement.`
            : `Votre réservation pour "${venue.name}" a été acceptée automatiquement. Vous avez 72h pour effectuer le paiement.`,
          undefined, undefined, undefined,
          venue._id.toString(),
          firstBooking._id.toString()
        );
      }
    }

    res.status(201).json({ bookingGroupId, created, unavailable });
  } catch (error) {
    console.error('Erreur createBookingBatch:', error);
    res.status(500).json({ message: 'Erreur interne du serveur' });
  }
};

// ─── Lister les réservations d'une salle (pour le propriétaire) ───────────────

export const listVenueBookings = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const ownerId = req.user?.id;
    const { venueId } = req.params;

    if (!ownerId) {
      res.status(401).json({ message: 'Non authentifié' });
      return;
    }

    if (!mongoose.Types.ObjectId.isValid(venueId)) {
      res.status(400).json({ message: 'ID de salle invalide' });
      return;
    }

    const venue = await VenueModel.findById(venueId);
    if (!venue) {
      res.status(404).json({ message: 'Salle introuvable' });
      return;
    }

    if (venue.owner.toString() !== ownerId) {
      res.status(403).json({ message: 'Non autorisé à consulter ces réservations' });
      return;
    }

    const { page, limit, skip } = parsePaginationWithDefaults(req.query as Record<string, unknown>);
    const total = await VenueBookingModel.countDocuments({ venue: venueId });
    const bookings = await VenueBookingModel.find({ venue: venueId })
      .populate('requester', 'firstName lastName email phone avatarUrl role organizerProfile.companyName organizerProfile.phone')
      .sort({ requestedDate: 1 })
      .skip(skip)
      .limit(limit)
      .lean();
    res.status(200).json({ bookings, pagination: buildPaginationResult({ page, limit }, total) });
  } catch (error) {
    console.error('Erreur listVenueBookings:', error);
    res.status(500).json({ message: 'Erreur interne du serveur' });
  }
};

// ─── Mes réservations : reçues (LIEU) ou émises (ORGANIZER) ─────────────────

export const myBookings = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const requesterId = req.user?.id;
    const role = req.user?.role;

    if (!requesterId) {
      res.status(401).json({ message: 'Non authentifié' });
      return;
    }

    let findFilter: Record<string, unknown>;
    let requesterFields: string;

    if (role === 'LIEU') {
      const ownedVenues = await VenueModel.find({ owner: requesterId, isDeleted: { $ne: true } }).select('_id');
      const venueIds = ownedVenues.map(v => v._id);
      findFilter = { venue: { $in: venueIds } };
      requesterFields = 'firstName lastName email phone avatarUrl role organizerProfile.companyName organizerProfile.phone';

      // Les demandes en attente dont la date/heure est passée ne doivent plus être traitables.
      const pendingBookings = await VenueBookingModel.find({
        venue: { $in: venueIds },
        status: 'PENDING',
      }).select('_id requestedDate endTime');

      const expiredPendingIds = pendingBookings
        .filter((booking) => hasBookingEnded(booking.requestedDate, booking.endTime))
        .map((booking) => booking._id);

      if (expiredPendingIds.length > 0) {
        await VenueBookingModel.updateMany(
          { _id: { $in: expiredPendingIds }, status: 'PENDING' },
          { $set: { status: 'EXPIRED' } }
        );
      }
    } else {
      findFilter = { requester: requesterId };
      requesterFields = 'firstName lastName email organizerProfile.companyName';
    }

    const bookings = await VenueBookingModel.find(findFilter)
      .populate(
        'venue',
        'name city address postalCode country venueType capacity description shortDescription pricePerEvent cancellationPolicy isDeleted pricingType deposit extraFees currency latitude longitude photos companyName siret contactEmail contactPhone'
      )
      .populate('requester', requesterFields)
      .sort({ createdAt: -1 });

    const invoices = await InvoiceModel.find({ booking: { $in: bookings.map((b) => b._id) } })
      .select('-stripePaymentIntentId -stripeSessionId -buyerUserId -sellerOwnerId')
      .lean();
    const invoiceByBooking = new Map(invoices.map((inv) => [inv.booking.toString(), inv]));
    const bookingsWithInvoice = bookings.map((b) => {
      const booking = b.toObject();
      const invoiceSnapshot = invoiceByBooking.get(b._id.toString());
      return invoiceSnapshot ? { ...booking, invoiceSnapshot } : booking;
    });

    res.status(200).json({ bookings: bookingsWithInvoice });
  } catch (error) {
    console.error('Erreur myBookings:', error);
    res.status(500).json({ message: 'Erreur interne du serveur' });
  }
};

// ─── Réservations actives d'un visiteur sur une salle ────────────────────────

export const getMyVenueBookings = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const requesterId = req.user?.id;
    const { venueId } = req.params;

    if (!requesterId) {
      res.status(401).json({ message: 'Non authentifié' });
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const bookings = await VenueBookingModel.find({
      venue: venueId,
      requester: requesterId,
      status: { $in: ['PENDING', 'ACCEPTED', 'CONFIRMED'] },
      requestedDate: { $gte: today },
    })
      .select('requestedDate startTime endTime status')
      .sort({ requestedDate: 1 });

    res.status(200).json({ bookings });
  } catch (error) {
    console.error('Erreur getMyVenueBookings:', error);
    res.status(500).json({ message: 'Erreur interne du serveur' });
  }
};

// ─── Helpers réutilisables accept/refuse ─────────────────────────────────────

type VenueForPricing = {
  pricePerEvent: number;
  pricingType?: string;
  deposit?: number;
  extraFees?: { description: string; amount?: number }[];
};

type BookingMutable = {
  startTime: string;
  endTime: string;
  requestedDate: Date;
  status: VenueBookingStatus;
  paymentDeadlineAt?: Date;
};

function acceptBooking(
  booking: BookingMutable,
  venue: VenueForPricing
): void {
  const { requiresPayment } = computeBookingAmount(
    { pricePerEvent: venue.pricePerEvent, pricingType: venue.pricingType as any, deposit: venue.deposit, extraFees: venue.extraFees },
    { startTime: booking.startTime, endTime: booking.endTime }
  );
  if (!requiresPayment) {
    booking.status = 'CONFIRMED';
  } else {
    booking.status = 'ACCEPTED';
    booking.paymentDeadlineAt = computePaymentDeadlineAt(booking.requestedDate, booking.startTime);
  }
}

function refuseBooking(booking: BookingMutable): void {
  booking.status = 'REFUSED';
}

// ─── Accepter / Refuser une réservation (propriétaire) ───────────────────────

export const updateBookingStatus = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const ownerId = req.user?.id;
    const { bookingId } = req.params;
    const { status, ownerResponse } = req.body as { status: 'ACCEPTED' | 'REFUSED'; ownerResponse?: string };

    if (!ownerId) {
      res.status(401).json({ message: 'Non authentifié' });
      return;
    }

    if (!mongoose.Types.ObjectId.isValid(bookingId)) {
      res.status(400).json({ message: 'ID de réservation invalide' });
      return;
    }

    const booking = await VenueBookingModel.findById(bookingId).populate<{ venue: { _id: mongoose.Types.ObjectId; owner: mongoose.Types.ObjectId; name: string } }>('venue', 'owner name');
    if (!booking) {
      res.status(404).json({ message: 'Réservation introuvable' });
      return;
    }

    if (booking.venue.owner.toString() !== ownerId) {
      res.status(403).json({ message: 'Non autorisé à modifier cette réservation' });
      return;
    }

    if (booking.status !== 'PENDING') {
      res.status(400).json({ message: 'Cette réservation a déjà été traitée' });
      return;
    }

    if (hasBookingEnded(booking.requestedDate, booking.endTime)) {
      booking.status = 'EXPIRED';
      await booking.save();
      res.status(400).json({ message: 'Cette réservation est expirée car la date est passée' });
      return;
    }

    // Vérifier les conflits uniquement si on accepte
    // NOTE: cette vérification n'est pas atomique avec le booking.save() ci-dessous.
    // En haute concurrence, deux acceptations simultanées peuvent passer ce check et créer un conflit.
    // Mitigation possible : transaction MongoDB (nécessite replica set).
    if (status === 'ACCEPTED') {
      const dateStart = new Date(booking.requestedDate);
      dateStart.setHours(0, 0, 0, 0);
      const dateEnd = new Date(booking.requestedDate);
      dateEnd.setHours(23, 59, 59, 999);

      const existingAccepted = await VenueBookingModel.find({
        venue: booking.venue._id,
        status: { $in: ['ACCEPTED', 'CONFIRMED'] },
        requestedDate: { $gte: dateStart, $lte: dateEnd },
        _id: { $ne: bookingId },
      });

      const hasConflict = existingAccepted.some((b) =>
        timesOverlap(booking.startTime, booking.endTime, b.startTime, b.endTime)
      );

      if (hasConflict) {
        res.status(409).json({ message: 'Un conflit de plage horaire existe pour cette date' });
        return;
      }
    }

    if (ownerResponse) booking.ownerResponse = ownerResponse;

    if (status === 'ACCEPTED') {
      const venueDoc = await VenueModel.findById(booking.venue._id);
      if (!venueDoc) {
        res.status(409).json({ message: 'Cette salle n\'existe plus, impossible d\'accepter la réservation' });
        return;
      }
      acceptBooking(booking, venueDoc);
    } else {
      refuseBooking(booking);
    }
    await booking.save();

    emitVenueBookingStatusChanged(
      booking._id.toString(),
      (booking.venue as { _id: mongoose.Types.ObjectId })._id.toString(),
      booking.status,
      booking.paymentStatus,
      [booking.requester.toString(), ownerId]
    );

    // Notifier le demandeur (découplé : un échec de notif ne doit pas faire échouer la réponse)
    try {
      if (status === 'REFUSED') {
        await NotificationModel.create({
          user: booking.requester,
          type: 'venue_booking_response',
          title: 'Réservation refusée',
          message: `Votre demande de réservation pour "${booking.venue.name}" a été refusée.`,
          relatedVenue: booking.venue._id,
          relatedBooking: booking._id,
          read: false,
        });
      } else if ((booking.status as VenueBookingStatus) === 'CONFIRMED') {
        // Salle gratuite ou pourcentage billetterie → notification de confirmation sans paiement
        await NotificationModel.create({
          user: booking.requester,
          type: 'venue_booking_confirmed',
          title: 'Réservation confirmée',
          message: `Votre réservation pour "${booking.venue.name}" a été confirmée (aucun paiement requis).`,
          relatedVenue: booking.venue._id,
          relatedBooking: booking._id,
          read: false,
        });
      } else {
        // Salle payante → notification demandant le paiement
        const venueDoc = await VenueModel.findById(booking.venue._id);
        const price = venueDoc?.pricePerEvent ?? 0;
        await NotificationModel.create({
          user: booking.requester,
          type: 'venue_booking_payment_required',
          title: 'Réservation acceptée — paiement requis',
          message: `Votre réservation pour "${booking.venue.name}" a été acceptée. Prix : ${price}€. Vous avez 72h pour effectuer le paiement.`,
          relatedVenue: booking.venue._id,
          relatedBooking: booking._id,
          read: false,
        });
      }
    } catch (notifError) {
      console.error('Erreur création notification updateBookingStatus:', notifError, { bookingId, status });
    }

    res.status(200).json({ booking });
  } catch (error) {
    console.error('Erreur updateBookingStatus:', error);
    res.status(500).json({ message: 'Erreur interne du serveur' });
  }
};

// ─── Répondre à un lot de réservations (propriétaire LIEU) ──────────────────

export const updateBookingGroupStatus = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const ownerId = req.user?.id;
    const { bookingGroupId } = req.params;
    const { status, excludedBookingIds = [], ownerResponse } = req.body as {
      status: 'ACCEPTED' | 'REFUSED';
      excludedBookingIds?: string[];
      ownerResponse?: string;
    };

    if (!ownerId) {
      res.status(401).json({ message: 'Non authentifié' });
      return;
    }

    if (!mongoose.Types.ObjectId.isValid(bookingGroupId)) {
      res.status(400).json({ message: 'ID de groupe invalide' });
      return;
    }

    // Charger les réservations PENDING du groupe
    const pendingBookings = await VenueBookingModel.find({
      bookingGroupId,
      status: 'PENDING',
    }).populate<{ venue: { _id: mongoose.Types.ObjectId; owner: mongoose.Types.ObjectId; name: string; pricePerEvent: number; pricingType?: string; deposit?: number; extraFees?: any[] } }>(
      'venue',
      'owner name pricePerEvent pricingType deposit extraFees'
    );

    if (pendingBookings.length === 0) {
      res.status(404).json({ message: 'Aucune réservation PENDING trouvée pour ce groupe' });
      return;
    }

    // Vérifier que le propriétaire possède la salle du groupe
    const firstVenueOwner = pendingBookings[0].venue.owner;
    if (firstVenueOwner.toString() !== ownerId) {
      res.status(403).json({ message: 'Non autorisé à modifier ces réservations' });
      return;
    }

    const updated: typeof pendingBookings = [];

    // Compteurs par issue pour la notif groupée post-boucle
    type NotifCtx = { requesterId: string; venueId: string; venueName: string; firstBookingId: string };
    let refusedCount = 0;
    let acceptedCount = 0;
    let confirmedCount = 0;
    let groupCtx: NotifCtx | null = null;

    // Pré-chargement batch des conflits de créneau pour les bookings non exclus (2 requêtes au lieu de N)
    const toSlotCheck = pendingBookings.filter((b) => !excludedBookingIds.includes(b._id.toString()) && status !== 'REFUSED');
    const batchSlotResults = await checkSlotConflictBatch(
      pendingBookings[0].venue._id.toString(),
      toSlotCheck.map((b) => ({ date: b.requestedDate, startTime: b.startTime, endTime: b.endTime, pricingType: b.venue.pricingType }))
    );
    const slotCheckMap = new Map(toSlotCheck.map((b, i) => [b._id.toString(), batchSlotResults[i]]));

    for (const booking of pendingBookings) {
      const isExcluded = excludedBookingIds.includes(booking._id.toString());

      if (ownerResponse) booking.ownerResponse = ownerResponse;

      if (isExcluded || status === 'REFUSED') {
        refuseBooking(booking);
      } else {
        // NOTE: non atomique (cf. commentaire dans checkSlotConflict)
        const slotCheck = slotCheckMap.get(booking._id.toString())!;
        if (slotCheck.ok === false) {
          refuseBooking(booking);
          booking.ownerResponse = booking.ownerResponse
            ? `${booking.ownerResponse} — ${slotCheck.reason}`
            : slotCheck.reason;
        } else {
          acceptBooking(booking, booking.venue);
        }
      }

      await booking.save();

      emitVenueBookingStatusChanged(
        booking._id.toString(),
        booking.venue._id.toString(),
        booking.status,
        booking.paymentStatus,
        [booking.requester.toString(), ownerId]
      );

      updated.push(booking);

      const bookingStatus = booking.status as VenueBookingStatus;
      groupCtx = groupCtx ?? {
        requesterId: booking.requester.toString(),
        venueId: booking.venue._id.toString(),
        venueName: booking.venue.name,
        firstBookingId: booking._id.toString(),
      };
      if (bookingStatus === 'REFUSED') refusedCount++;
      else if (bookingStatus === 'CONFIRMED') confirmedCount++;
      else if (bookingStatus === 'ACCEPTED') acceptedCount++;
    }

    // Une seule notification par issue — jamais N fois la même cloche
    if (groupCtx) {
      const ctx = groupCtx;
      const s = (n: number) => (n > 1 ? 's' : '');
      if (refusedCount > 0) {
        await createNotification(
          ctx.requesterId,
          'venue_booking_response',
          'Réservation refusée',
          refusedCount > 1
            ? `${refusedCount} de vos demandes de réservation pour "${ctx.venueName}" ont été refusées.`
            : `Votre demande de réservation pour "${ctx.venueName}" a été refusée.`,
          undefined, undefined, undefined,
          ctx.venueId,
          ctx.firstBookingId
        );
      }
      if (confirmedCount > 0) {
        await createNotification(
          ctx.requesterId,
          'venue_booking_confirmed',
          'Réservation confirmée',
          confirmedCount > 1
            ? `${confirmedCount} réservation${s(confirmedCount)} pour "${ctx.venueName}" ont été confirmées (aucun paiement requis).`
            : `Votre réservation pour "${ctx.venueName}" a été confirmée (aucun paiement requis).`,
          undefined, undefined, undefined,
          ctx.venueId,
          ctx.firstBookingId
        );
      }
      if (acceptedCount > 0) {
        await createNotification(
          ctx.requesterId,
          'venue_booking_payment_required',
          'Réservation acceptée — paiement requis',
          acceptedCount > 1
            ? `${acceptedCount} réservation${s(acceptedCount)} pour "${ctx.venueName}" ont été acceptées. Vous avez 72h pour effectuer le paiement.`
            : `Votre réservation pour "${ctx.venueName}" a été acceptée. Vous avez 72h pour effectuer le paiement.`,
          undefined, undefined, undefined,
          ctx.venueId,
          ctx.firstBookingId
        );
      }
    }

    res.status(200).json({ updated });
  } catch (error) {
    console.error('Erreur updateBookingGroupStatus:', error);
    res.status(500).json({ message: 'Erreur interne du serveur' });
  }
};

// ─── Annuler une réservation (demandeur) ─────────────────────────────────────

export const cancelBooking = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const requesterId = req.user?.id;
    const { bookingId } = req.params;

    if (!requesterId) {
      res.status(401).json({ message: 'Non authentifié' });
      return;
    }

    if (!mongoose.Types.ObjectId.isValid(bookingId)) {
      res.status(400).json({ message: 'ID de réservation invalide' });
      return;
    }

    const booking = await VenueBookingModel.findById(bookingId)
      .populate<{ venue: { _id: mongoose.Types.ObjectId; owner: mongoose.Types.ObjectId; name: string; cancellationPolicy: CancellationPolicy } }>('venue', 'cancellationPolicy owner name');
    if (!booking) {
      res.status(404).json({ message: 'Réservation introuvable' });
      return;
    }

    if (booking.requester.toString() !== requesterId) {
      res.status(403).json({ message: 'Non autorisé à annuler cette réservation' });
      return;
    }

    if (!['PENDING', 'ACCEPTED', 'CONFIRMED'].includes(booking.status)) {
      res.status(400).json({ message: 'Seules les réservations en attente, acceptées ou confirmées peuvent être annulées' });
      return;
    }

    // Expire the Stripe checkout session if one exists (prevents paying a cancelled booking)
    if (booking.stripeSessionId && booking.paymentStatus === 'pending' && stripe) {
      try {
        await stripe.checkout.sessions.expire(booking.stripeSessionId);
        console.log('[Venue] Session Stripe expirée:', booking.stripeSessionId);
      } catch (stripeErr) {
        console.error('[Venue] Erreur expiration session Stripe:', stripeErr, { bookingId });
      }
    }

    // Remboursement si booking confirmé et payé — selon la politique d'annulation de la salle
    const venueInfo = booking.venue as { _id: mongoose.Types.ObjectId; owner: mongoose.Types.ObjectId; name: string; cancellationPolicy: CancellationPolicy };
    const policy: CancellationPolicy = venueInfo.cancellationPolicy ?? 'moderate';
    await applyBookingCancellationRefund(booking, policy);

    booking.status = 'CANCELLED_BY_REQUESTER';
    await booking.save();

    // Cascade ADR 0002 : l'événement lié (s'il existe) est annulé
    await cascadeCancelLinkedEvent(booking._id);

    emitVenueBookingStatusChanged(
      booking._id.toString(),
      venueInfo._id.toString(),
      booking.status,
      booking.paymentStatus,
      [requesterId, venueInfo.owner?.toString() || ''].filter(Boolean)
    );

    // Notification propriétaire :
    // - Booking sans groupe → notif immédiate
    // - Booking dans un groupe → notif uniquement quand le dernier créneau du groupe est annulé
    const ownerId = venueInfo.owner?.toString();
    if (ownerId) {
      if (!booking.bookingGroupId) {
        const d = booking.requestedDate;
        const dateStr = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
        await createNotification(
          ownerId,
          'venue_booking_cancelled_by_requester',
          'Réservation annulée par le demandeur',
          `Une réservation pour "${venueInfo.name}" le ${dateStr} a été annulée. Le créneau est de nouveau disponible.`,
          undefined, undefined, undefined,
          venueInfo._id.toString(),
          booking._id.toString()
        );
      } else {
        // Dernier booking du groupe annulé ? → 1 notif groupée pour le proprio
        const remaining = await VenueBookingModel.countDocuments({
          bookingGroupId: booking.bookingGroupId,
          status: { $in: ['PENDING', 'ACCEPTED', 'CONFIRMED'] },
        });
        if (remaining === 0) {
          const total = await VenueBookingModel.countDocuments({ bookingGroupId: booking.bookingGroupId });
          await createNotification(
            ownerId,
            'venue_booking_cancelled_by_requester',
            'Série de réservations annulée par le demandeur',
            `La série de ${total} réservation${total > 1 ? 's' : ''} pour "${venueInfo.name}" a été annulée. ${total > 1 ? `${total} créneaux sont` : 'Le créneau est'} de nouveau disponible${total > 1 ? 's' : ''}.`,
            undefined, undefined, undefined,
            venueInfo._id.toString(),
            booking._id.toString()
          );
        }
      }
    }

    res.status(200).json({
      message: 'Réservation annulée',
      booking,
      refund: {
        refundedAmount: booking.refundedAmount ?? 0,
        paymentStatus: booking.paymentStatus,
      },
    });
  } catch (error) {
    console.error('Erreur cancelBooking:', error);
    res.status(500).json({ message: 'Erreur interne du serveur' });
  }
};

// ─── Annuler une réservation ACCEPTED par le propriétaire ────────────────────

export const cancelBookingByOwner = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const ownerId = req.user?.id;
    const { bookingId } = req.params;
    const { reason } = req.body as { reason?: string };

    if (!ownerId) {
      res.status(401).json({ message: 'Non authentifié' });
      return;
    }

    if (!mongoose.Types.ObjectId.isValid(bookingId)) {
      res.status(400).json({ message: 'ID de réservation invalide' });
      return;
    }

    const booking = await VenueBookingModel.findById(bookingId)
      .populate<{ venue: { _id: mongoose.Types.ObjectId; owner: mongoose.Types.ObjectId; name: string } }>(
        'venue', 'owner name'
      );

    if (!booking) {
      res.status(404).json({ message: 'Réservation introuvable' });
      return;
    }

    if (booking.venue.owner.toString() !== ownerId) {
      res.status(403).json({ message: 'Non autorisé à annuler cette réservation' });
      return;
    }

    if (!['ACCEPTED', 'CONFIRMED'].includes(booking.status)) {
      res.status(400).json({ message: 'Seules les réservations acceptées ou confirmées peuvent être annulées par le propriétaire' });
      return;
    }

    // Remboursement automatique si le booking a été payé
    if (booking.paymentStatus === 'paid') {
      await processStripeRefund(booking);
    }

    booking.status = 'CANCELLED_BY_OWNER';
    if (reason) booking.ownerResponse = reason;
    await booking.save();

    // Cascade ADR 0002 : l'événement lié perd sa salle → annulé
    await cascadeCancelLinkedEvent(booking._id, 'Salle annulée par le LIEU');

    emitVenueBookingStatusChanged(
      booking._id.toString(),
      (booking.venue as { _id: mongoose.Types.ObjectId })._id.toString(),
      booking.status,
      booking.paymentStatus,
      [booking.requester.toString(), ownerId]
    );

    try {
      const refundInfo = booking.paymentStatus === 'refunded'
        ? ` Un remboursement de ${booking.refundedAmount ?? booking.paidAmount}€ a été effectué.`
        : booking.paymentStatus === 'refund_pending'
          ? ' Un remboursement est en cours de traitement.'
          : '';
      await NotificationModel.create({
        user: booking.requester,
        type: 'venue_booking_cancelled_by_owner',
        title: 'Réservation annulée par le propriétaire',
        message: reason
          ? `Votre réservation pour "${booking.venue.name}" a été annulée par le propriétaire. Motif : ${reason}.${refundInfo}`
          : `Votre réservation pour "${booking.venue.name}" a été annulée par le propriétaire.${refundInfo}`,
        relatedVenue: booking.venue._id,
        relatedBooking: booking._id,
        read: false,
      });
    } catch (notifError) {
      console.error('Erreur création notification cancelBookingByOwner:', notifError, { bookingId });
    }

    res.status(200).json({ booking });
  } catch (error) {
    console.error('Erreur cancelBookingByOwner:', error);
    res.status(500).json({ message: 'Erreur interne du serveur' });
  }
};

// ─── Bloquer une date (propriétaire) ─────────────────────────────────────────

export const blockDate = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const ownerId = req.user?.id;
    const { venueId } = req.params;
    const { date, startTime, endTime, reason } = req.body;

    if (!ownerId) {
      res.status(401).json({ message: 'Non authentifié' });
      return;
    }

    if (!mongoose.Types.ObjectId.isValid(venueId)) {
      res.status(400).json({ message: 'ID de salle invalide' });
      return;
    }

    const venue = await VenueModel.findById(venueId);
    if (!venue) {
      res.status(404).json({ message: 'Salle introuvable' });
      return;
    }

    if (venue.owner.toString() !== ownerId) {
      res.status(403).json({ message: 'Non autorisé à bloquer des dates pour cette salle' });
      return;
    }

    const parsedDate = new Date(date);
    if (isNaN(parsedDate.getTime())) {
      res.status(400).json({ message: 'Date invalide' });
      return;
    }

    // Trouver les réservations impactées sur cette date
    const dayStart = new Date(parsedDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(parsedDate);
    dayEnd.setHours(23, 59, 59, 999);

    const impactedBookings = await VenueBookingModel.find({
      venue: venueId,
      requestedDate: { $gte: dayStart, $lte: dayEnd },
      status: { $in: ['PENDING', 'ACCEPTED', 'CONFIRMED'] },
    });

    // Filtrer celles qui chevauchent le créneau bloqué (si créneau partiel)
    const toCancel = startTime && endTime
      ? impactedBookings.filter((b) => timesOverlap(startTime, endTime, b.startTime, b.endTime))
      : impactedBookings;

    // Annuler chaque réservation impactée — les échecs de sauvegarde sont loggés
    const saveResults = await Promise.allSettled(
      toCancel.map(async (booking) => {
        if (booking.paymentStatus === 'paid') {
          await processStripeRefund(booking);
        }
        // Expirer la session Stripe si paiement en cours (empêche le paiement d'une réservation annulée)
        if (booking.stripeSessionId && booking.paymentStatus === 'pending' && stripe) {
          try {
            await stripe.checkout.sessions.expire(booking.stripeSessionId);
            console.log('[Venue] Session Stripe expirée (blocage date):', booking.stripeSessionId);
          } catch (stripeErr) {
            console.error('[Venue] Erreur expiration session Stripe (blocage date):', stripeErr, { bookingId: booking._id });
          }
        }
        booking.status = 'CANCELLED_BY_OWNER';
        booking.ownerResponse = reason
          ? `Salle indisponible ce jour-là. Motif : ${reason}`
          : 'Salle indisponible ce jour-là.';
        await booking.save();
        // Cascade ADR 0002 : l'événement lié perd sa salle → annulé
        await cascadeCancelLinkedEvent(booking._id, 'Salle indisponible (date bloquée par le LIEU)');
        return booking;
      })
    );

    const saveFailures = saveResults.filter((r) => r.status === 'rejected');
    if (saveFailures.length > 0) {
      console.error('blockDate — échecs partiels lors des annulations:', saveFailures.map((f) => (f as PromiseRejectedResult).reason), { venueId });
    }

    const cancelledCount = toCancel.length - saveFailures.length;
    const savedBookings = saveResults
      .filter((r): r is PromiseFulfilledResult<(typeof toCancel)[number]> => r.status === 'fulfilled')
      .map((r) => r.value);

    savedBookings.forEach((b) => {
      emitVenueBookingStatusChanged(
        b._id.toString(),
        venueId,
        b.status,
        b.paymentStatus,
        [b.requester.toString(), ownerId]
      );
    });

    // Créer le blocage après les annulations pour éviter un état incohérent
    const blockedDate = await VenueBlockedDateModel.create({
      venue: venueId,
      date: parsedDate,
      startTime,
      endTime,
      reason,
    });

    // Notifications découplées — un échec de notif n'affecte pas le compteur
    await Promise.allSettled(
      savedBookings.map((booking) =>
        NotificationModel.create({
          user: booking.requester,
          type: 'venue_date_blocked',
          title: 'Réservation annulée — salle indisponible',
          message: reason
            ? `Votre réservation pour "${venue.name}" a été annulée car la salle est indisponible ce jour-là. Motif : ${reason}`
            : `Votre réservation pour "${venue.name}" a été annulée car la salle est indisponible ce jour-là.`,
          relatedVenue: venue._id,
          relatedBooking: booking._id,
          read: false,
        }).catch((notifError) => {
          console.error('blockDate — échec notification:', notifError, { bookingId: booking._id });
        })
      )
    );

    res.status(201).json({ blockedDate, cancelledBookings: cancelledCount, failedCancellations: saveFailures.length });
  } catch (error) {
    console.error('Erreur blockDate:', error);
    res.status(500).json({ message: 'Erreur interne du serveur' });
  }
};

// ─── Lister les dates bloquées d'une salle ───────────────────────────────────

export const listBlockedDates = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { venueId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(venueId)) {
      res.status(400).json({ message: 'ID de salle invalide' });
      return;
    }

    const blockedDates = await VenueBlockedDateModel.find({
      venue: venueId,
      date: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) },
    }).sort({ date: 1 });

    res.status(200).json({ blockedDates });
  } catch (error) {
    console.error('Erreur listBlockedDates:', error);
    res.status(500).json({ message: 'Erreur interne du serveur' });
  }
};

// ─── Supprimer un blocage de date (propriétaire) ─────────────────────────────

export const unblockDate = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const ownerId = req.user?.id;
    const { venueId, blockedDateId } = req.params;

    if (!ownerId) {
      res.status(401).json({ message: 'Non authentifié' });
      return;
    }

    if (!mongoose.Types.ObjectId.isValid(venueId) || !mongoose.Types.ObjectId.isValid(blockedDateId)) {
      res.status(400).json({ message: 'ID invalide' });
      return;
    }

    const venue = await VenueModel.findById(venueId);
    if (!venue) {
      res.status(404).json({ message: 'Salle introuvable' });
      return;
    }

    if (venue.owner.toString() !== ownerId) {
      res.status(403).json({ message: 'Non autorisé' });
      return;
    }

    const blockedDate = await VenueBlockedDateModel.findOneAndDelete({
      _id: blockedDateId,
      venue: venueId,
    });

    if (!blockedDate) {
      res.status(404).json({ message: 'Blocage introuvable' });
      return;
    }

    res.status(204).send();
  } catch (error) {
    console.error('Erreur unblockDate:', error);
    res.status(500).json({ message: 'Erreur interne du serveur' });
  }
};

// ─── Créneaux déjà pris sur une date (pour le formulaire de réservation) ──────
// Sans date → retourne toutes les dates futures réservées { dates: string[] } (pour le calendrier)
// Avec date → retourne les créneaux du jour { slots: { startTime, endTime }[] }

export const takenSlots = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { venueId } = req.params;
    const { date } = req.query;

    if (!mongoose.Types.ObjectId.isValid(venueId)) {
      res.status(400).json({ message: 'ID de salle invalide' });
      return;
    }

    // Mode calendrier : aucune date fournie → retourner toutes les dates futures réservées
    if (!date) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const bookings = await VenueBookingModel.find({
        venue: venueId,
        status: { $in: ['ACCEPTED', 'CONFIRMED'] },
        requestedDate: { $gte: today },
      }).select('requestedDate');
      const dates = [...new Set(bookings.map(b => {
        const d = new Date(b.requestedDate);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      }))];
      res.status(200).json({ dates });
      return;
    }

    if (typeof date !== 'string') {
      res.status(400).json({ message: 'Paramètre date invalide' });
      return;
    }

    const parsed = new Date(date);
    if (isNaN(parsed.getTime())) {
      res.status(400).json({ message: 'Date invalide' });
      return;
    }

    const dayStart = new Date(parsed);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(parsed);
    dayEnd.setHours(23, 59, 59, 999);

    const accepted = await VenueBookingModel.find({
      venue: venueId,
      status: { $in: ['ACCEPTED', 'CONFIRMED'] },
      requestedDate: { $gte: dayStart, $lte: dayEnd },
    }).select('startTime endTime');

    res.status(200).json({ slots: accepted.map((b) => ({ startTime: b.startTime, endTime: b.endTime })) });
  } catch (error) {
    console.error('Erreur takenSlots:', error);
    res.status(500).json({ message: 'Erreur interne du serveur' });
  }
};

// ─── Dates où tous les créneaux horaires sont complets ───────────────────────

export const fullDates = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { venueId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(venueId)) {
      res.status(400).json({ message: 'ID de salle invalide' });
      return;
    }

    const venue = await VenueModel.findById(venueId).select('timeRestrictions pricingType disabledWeekdays').lean();
    if (!venue) {
      res.status(404).json({ message: 'Salle introuvable' });
      return;
    }

    const openMin = venue.timeRestrictions?.openTime
      ? parseInt(venue.timeRestrictions.openTime.split(':')[0]) * 60 + parseInt(venue.timeRestrictions.openTime.split(':')[1])
      : 0;
    const closeMin = venue.timeRestrictions?.closeTime
      ? parseInt(venue.timeRestrictions.closeTime.split(':')[0]) * 60 + parseInt(venue.timeRestrictions.closeTime.split(':')[1])
      : 24 * 60;

    const totalSlots = Math.floor((closeMin - openMin) / 60);
    if (totalSlots <= 0) {
      res.status(200).json({ dates: [] });
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const horizon = new Date(today);
    horizon.setDate(horizon.getDate() + 365);

    const bookings = await VenueBookingModel.find({
      venue: venueId,
      status: { $in: ['ACCEPTED', 'CONFIRMED'] },
      requestedDate: { $gte: today, $lte: horizon },
    }).select('requestedDate startTime endTime').lean();

    const slotsByDate = new Map<string, { startTime: string; endTime: string }[]>();
    for (const b of bookings) {
      const d = new Date(b.requestedDate);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (!slotsByDate.has(key)) slotsByDate.set(key, []);
      if (b.startTime && b.endTime) slotsByDate.get(key)!.push({ startTime: b.startTime, endTime: b.endTime });
    }

    const toMin = (t: string) => {
      const [h, m] = t.split(':').map(Number);
      return h * 60 + m;
    };
    const overlaps = (s1: string, e1: string, s2: string, e2: string) =>
      toMin(s1) < toMin(e2) && toMin(e1) > toMin(s2);

    const fullDatesList: string[] = [];
    for (const [dateStr, taken] of slotsByDate.entries()) {
      let availableCount = 0;
      for (let m = openMin; m + 60 <= closeMin; m += 60) {
        const h = Math.floor(m / 60).toString().padStart(2, '0');
        const start = `${h}:00`;
        const endH = Math.floor((m + 60) / 60).toString().padStart(2, '0');
        const end = `${endH}:00`;
        const blocked = taken.some(t => overlaps(start, end, t.startTime, t.endTime));
        if (!blocked) availableCount++;
      }
      if (availableCount === 0) fullDatesList.push(dateStr);
    }

    res.status(200).json({ dates: fullDatesList });
  } catch (error) {
    console.error('Erreur fullDates:', error);
    res.status(500).json({ message: 'Erreur interne du serveur' });
  }
};

// ─── Estimation du remboursement avant annulation (lecture seule) ────────────

export const getRefundEstimate = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const requesterId = req.user?.id;
    const { bookingId } = req.params;

    if (!requesterId) {
      res.status(401).json({ message: 'Non authentifié' });
      return;
    }

    if (!mongoose.Types.ObjectId.isValid(bookingId)) {
      res.status(400).json({ message: 'ID de réservation invalide' });
      return;
    }

    const booking = await VenueBookingModel.findById(bookingId)
      .populate<{ venue: { cancellationPolicy: CancellationPolicy } }>('venue', 'cancellationPolicy');

    if (!booking || booking.requester.toString() !== requesterId) {
      res.status(404).json({ message: 'Réservation introuvable' });
      return;
    }

    if (booking.paymentStatus !== 'paid' || !booking.paidAmount) {
      res.status(200).json({ refundPercent: 0, refundAmount: 0, reason: 'not_paid' });
      return;
    }

    const eventDatetime = new Date(booking.requestedDate);
    const [h, m] = booking.startTime.split(':').map(Number);
    eventDatetime.setUTCHours(h, m, 0, 0);

    const policy: CancellationPolicy = (booking.venue as { cancellationPolicy: CancellationPolicy }).cancellationPolicy ?? 'moderate';
    const result = calculateRefundAmount(booking.paidAmount, policy, eventDatetime, booking.createdAt);

    res.status(200).json(result);
  } catch (error) {
    console.error('Erreur getRefundEstimate:', error);
    res.status(500).json({ message: 'Erreur interne du serveur' });
  }
};

// ─── Rembourser tous les bookings payés d'une salle supprimée ────────────────

export const refundVenueBookings = async (venueId: string): Promise<{ refunded: number; failed: number }> => {
  try {
    const venue = await VenueModel.findById(venueId);
    const venueName = venue?.name || 'inconnue';

    const paidBookings = await VenueBookingModel.find({
      venue: venueId,
      status: { $in: ['ACCEPTED', 'CONFIRMED'] },
      paymentStatus: 'paid',
    }).populate<{ requester: { _id: mongoose.Types.ObjectId; firstName: string; lastName: string } }>('requester', 'firstName lastName');

    let refunded = 0;
    let failed = 0;

    for (const booking of paidBookings) {
      try {
        const refundAmount = booking.paidAmount;
        await processStripeRefund(booking, refundAmount);
        booking.status = 'CANCELLED_BY_OWNER';
        booking.ownerResponse = 'La salle a été supprimée par le propriétaire. Remboursement intégral en cours.';
        await booking.save();
        // Le booking est supprimé juste après (suppression salle/compte) : le webhook
        // charge.refunded ne le retrouvera pas — figer la facture maintenant.
        await updateInvoiceRefund(booking._id.toString(), refundAmount, new Date());
        // Cascade ADR 0002 : l'événement lié perd sa salle → annulé
        await cascadeCancelLinkedEvent(booking._id, 'Salle supprimée par le LIEU');
        refunded++;

        emitVenueBookingStatusChanged(
          booking._id.toString(),
          venueId,
          booking.status,
          booking.paymentStatus,
          [booking.requester._id.toString(), venue?.owner?.toString() || ''].filter(Boolean)
        );

        try {
          await NotificationModel.create({
            user: booking.requester,
            type: 'venue_deleted_refund',
            title: 'Salle supprimée — remboursement effectué',
            message: `La salle "${venueName}" a été supprimée. Votre paiement de ${refundAmount}€ sera remboursé intégralement.`,
            relatedVenue: venueId as any,
            relatedBooking: booking._id,
            read: false,
          });
        } catch (notifErr) {
          console.error('[refundVenueBookings] Erreur notification:', notifErr, { bookingId: booking._id });
        }
      } catch (bookingErr) {
        console.error('[refundVenueBookings] Erreur remboursement booking:', bookingErr, { bookingId: booking._id });
        failed++;
      }
    }

    console.log(`[refundVenueBookings] Complété — ${refunded} remboursé(s), ${failed} échoué(s) pour venue ${venueId}`);
    return { refunded, failed };
  } catch (error) {
    console.error('[refundVenueBookings] Erreur globale:', error, { venueId });
    return { refunded: 0, failed: 0 };
  }
};

// ─── Cron job : vérifier les paiements non effectués ─────────────────────────

export const checkPaymentTimeouts = async (req: Request, res: Response): Promise<void> => {
  try {
    const cronKey = req.header('X-CRON-KEY');
    if (!cronKey || cronKey !== config.cron.secret) {
      console.error('❌ Tentative d\'accès non autorisée à l\'endpoint cron check-payment-timeouts');
      res.status(401).json({ message: 'Non autorisé' });
      return;
    }

    console.log('🔔 Démarrage du job cron: check-payment-timeouts');
    const now = new Date();
    let expiredCount = 0;
    let reminderCount = 0;

    // Step A — Expire overdue bookings (groupes traités en bloc)
    const overdueBookings = await VenueBookingModel.find({
      status: 'ACCEPTED',
      paymentDeadlineAt: { $lte: now },
    })
      .populate<{ venue: { _id: mongoose.Types.ObjectId; owner: mongoose.Types.ObjectId; name: string } | null }>('venue', 'owner name')
      .populate<{ requester: { _id: mongoose.Types.ObjectId; firstName: string; lastName: string } }>('requester', 'firstName lastName');

    const processedGroups = new Set<string>();

    for (const booking of overdueBookings) {
      try {
        const groupId = booking.bookingGroupId?.toString();

        if (groupId) {
          if (processedGroups.has(groupId)) continue;
          processedGroups.add(groupId);

          const siblings = await VenueBookingModel.find({
            bookingGroupId: booking.bookingGroupId,
            status: 'ACCEPTED',
          })
            .populate<{ venue: { _id: mongoose.Types.ObjectId; owner: mongoose.Types.ObjectId; name: string } | null }>('venue', 'owner name')
            .populate<{ requester: { _id: mongoose.Types.ObjectId; firstName: string; lastName: string } }>('requester', 'firstName lastName');

          const sessionSibling = siblings.find(s => s.stripeSessionId && s.paymentStatus === 'pending');
          if (sessionSibling?.stripeSessionId && stripe) {
            try {
              await stripe.checkout.sessions.expire(sessionSibling.stripeSessionId);
              console.log('[PaymentTimeout] Session Stripe groupe expirée:', sessionSibling.stripeSessionId);
            } catch (stripeErr) {
              console.error('[PaymentTimeout] Erreur expiration session Stripe groupe:', stripeErr, { groupId });
            }
          }

          let groupExpiredCount = 0;
          for (const sibling of siblings) {
            try {
              const expired = await VenueBookingModel.findOneAndUpdate(
                { _id: sibling._id, status: 'ACCEPTED' },
                { status: 'EXPIRED' },
                { new: true }
              );
              if (!expired) {
                console.log('[PaymentTimeout] Booking groupe déjà transitionné, skip:', sibling._id);
                continue;
              }
              groupExpiredCount++;
              expiredCount++;
              if (!sibling.venue) continue;
              emitVenueBookingPaymentUpdated(
                sibling._id.toString(),
                (sibling.venue as any)._id.toString(),
                'EXPIRED',
                sibling.paymentStatus,
                [(sibling.requester as any)._id?.toString() || sibling.requester.toString(), (sibling.venue as any)?.owner?.toString() || ''].filter(Boolean)
              );
            } catch (siblingErr) {
              console.error('[PaymentTimeout] Erreur expiration booking groupe:', siblingErr, { bookingId: sibling._id });
            }
          }

          if (groupExpiredCount === 0) continue;
          const first = siblings[0];
          if (!first?.venue) continue;

          const venueId = (first.venue as any)._id.toString();
          const ownerId = (first.venue as any).owner.toString();
          const venueName = first.venue.name;
          const requesterId = (first.requester as any)._id?.toString() || first.requester.toString();
          const requesterName = (first.requester as any)?.firstName
            ? `${(first.requester as any).firstName} ${(first.requester as any).lastName}`
            : 'un utilisateur';
          const n = groupExpiredCount;
          const plural = n > 1;

          await createNotification(
            requesterId,
            'venue_booking_payment_expired',
            'Série de réservations expirée',
            `Votre série de réservations pour "${venueName}" a expiré faute de paiement — ${n} créneau${plural ? 'x' : ''} libéré${plural ? 's' : ''}.`,
            undefined, undefined, undefined,
            venueId
          );
          await createNotification(
            ownerId,
            'venue_booking_payment_expired',
            'Série de réservations expirée — créneaux disponibles',
            `La série de réservations de "${requesterName}" pour "${venueName}" a expiré — ${n} créneau${plural ? 'x' : ''} redevien${plural ? 'nent' : 't'} disponible${plural ? 's' : ''}.`,
            undefined, undefined, undefined,
            venueId
          );

        } else {
          // Booking solo — traitement individuel
          if (booking.stripeSessionId && booking.paymentStatus === 'pending' && stripe) {
            try {
              await stripe.checkout.sessions.expire(booking.stripeSessionId);
              console.log('[PaymentTimeout] Session Stripe expirée:', booking.stripeSessionId);
            } catch (stripeErr) {
              console.error('[PaymentTimeout] Erreur expiration session Stripe:', stripeErr, { bookingId: booking._id });
            }
          }

          const expired = await VenueBookingModel.findOneAndUpdate(
            { _id: booking._id, status: 'ACCEPTED' },
            { status: 'EXPIRED' },
            { new: true }
          );
          if (!expired) {
            console.log('[PaymentTimeout] Booking déjà transitionné, skip:', booking._id);
            continue;
          }
          expiredCount++;

          if (!booking.venue) {
            console.error('[PaymentTimeout] Venue non trouvée pour booking, expiré sans notification:', booking._id);
            continue;
          }

          emitVenueBookingPaymentUpdated(
            booking._id.toString(),
            (booking.venue as any)._id.toString(),
            'EXPIRED',
            booking.paymentStatus,
            [(booking.requester as any)._id?.toString() || booking.requester.toString(), (booking.venue as any)?.owner?.toString() || ''].filter(Boolean)
          );

          const d = booking.requestedDate;
          const eventDate = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
          const venueId = (booking.venue as any)._id.toString();
          const ownerId = (booking.venue as any).owner.toString();
          const requesterId = (booking.requester as any)._id?.toString() || booking.requester.toString();
          const requesterName = (booking.requester as any)?.firstName
            ? `${(booking.requester as any).firstName} ${(booking.requester as any).lastName}`
            : 'un utilisateur';

          await createNotification(
            requesterId,
            'venue_booking_payment_expired',
            'Réservation expirée',
            `Votre réservation pour "${booking.venue.name}" le ${eventDate} a expiré car le paiement n'a pas été effectué dans les 72h.`,
            undefined, undefined, undefined,
            venueId,
            booking._id.toString()
          );
          await createNotification(
            ownerId,
            'venue_booking_payment_expired',
            'Réservation expirée — créneau disponible',
            `La réservation de "${requesterName}" pour "${booking.venue.name}" le ${eventDate} a expiré faute de paiement. Le créneau est de nouveau disponible.`,
            undefined, undefined, undefined,
            venueId,
            booking._id.toString()
          );
        }
      } catch (bookingErr) {
        console.error('[PaymentTimeout] Erreur traitement booking:', bookingErr, { bookingId: booking._id });
      }
    }

    // Step B — Rappels 24h (un seul rappel par groupe)
    const reminderDeadline = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const reminderBookings = await VenueBookingModel.find({
      status: 'ACCEPTED',
      paymentDeadlineAt: { $lte: reminderDeadline, $gt: now },
      paymentReminderSentAt: null,
    })
      .populate<{ venue: { _id: mongoose.Types.ObjectId; owner: mongoose.Types.ObjectId; name: string } | null }>('venue', 'owner name');

    const processedReminderGroups = new Set<string>();

    for (const booking of reminderBookings) {
      try {
        if (!booking.venue) {
          console.error('[PaymentTimeout] Venue non trouvée pour reminder, skip:', booking._id);
          continue;
        }

        const groupId = booking.bookingGroupId?.toString();

        if (groupId) {
          if (processedReminderGroups.has(groupId)) continue;
          processedReminderGroups.add(groupId);

          // Poser le flag sur tous les membres du groupe pour éviter les doublons
          await VenueBookingModel.updateMany(
            { bookingGroupId: booking.bookingGroupId, status: 'ACCEPTED', paymentReminderSentAt: null },
            { paymentReminderSentAt: now }
          );

          await createNotification(
            booking.requester.toString(),
            'venue_booking_payment_reminder',
            'Rappel — paiement de série requis',
            `Rappel : votre série de réservations pour "${booking.venue.name}" expire dans 24h. Effectuez le paiement pour confirmer.`,
            undefined, undefined, undefined,
            (booking.venue as any)._id.toString(),
            booking._id.toString()
          );
          reminderCount++;
        } else {
          const d = booking.requestedDate;
          const eventDate = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;

          booking.paymentReminderSentAt = new Date();
          await booking.save();

          await createNotification(
            booking.requester.toString(),
            'venue_booking_payment_reminder',
            'Rappel — paiement requis',
            `Rappel : votre réservation pour "${booking.venue.name}" le ${eventDate} expire dans 24h. Effectuez le paiement pour confirmer.`,
            undefined, undefined, undefined,
            (booking.venue as any)._id.toString(),
            booking._id.toString()
          );
          reminderCount++;
        }

        emitVenueBookingPaymentUpdated(
          booking._id.toString(),
          (booking.venue as any)._id.toString(),
          booking.status,
          booking.paymentStatus,
          [booking.requester.toString(), (booking.venue as any)?.owner?.toString() || ''].filter(Boolean)
        );
      } catch (reminderErr) {
        console.error('[PaymentTimeout] Erreur reminder booking:', reminderErr, { bookingId: booking._id });
      }
    }

    console.log(`✅ check-payment-timeouts terminé — ${expiredCount} expiré(s), ${reminderCount} rappel(s)`);
    res.status(200).json({ expired: expiredCount, reminded: reminderCount });
  } catch (error) {
    console.error('Erreur checkPaymentTimeouts:', error);
    res.status(500).json({ message: 'Erreur interne du serveur' });
  }
};

// ─── Annulation de série booking-centric (ADR 0004) ──────────────────────────

/**
 * Annule toutes les réservations non passées d'un groupe (PENDING/ACCEPTED/CONFIRMED),
 * requester-scoped. Collecte les événements annulés et envoie des notifications groupées
 * (1 notif proprio + 1 notif/email par participant distinct via notifySeriesCancellation).
 */
export const cancelBookingGroup = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const requesterId = req.user?.id;
    const { bookingGroupId } = req.params;

    if (!requesterId) {
      res.status(401).json({ message: 'Non authentifié' });
      return;
    }

    if (!mongoose.Types.ObjectId.isValid(bookingGroupId)) {
      res.status(400).json({ message: 'ID de groupe invalide' });
      return;
    }

    const bookings = await VenueBookingModel.find({
      bookingGroupId,
      requester: requesterId,
      status: { $in: ['PENDING', 'ACCEPTED', 'CONFIRMED'] },
    }).sort({ requestedDate: 1 });

    const cancellable = bookings.filter((b) => {
      const dateStr = (b.requestedDate as Date).toISOString().slice(0, 10);
      return !isCalendarDatePast(dateStr);
    });

    if (cancellable.length === 0) {
      res.status(404).json({ message: 'Aucune réservation annulable pour ce groupe' });
      return;
    }

    let groupInfo: { venueId: string; ownerId: string; venueName: string } | null = null;
    const cancelledEvents: EventDocument[] = [];
    let cancelledCount = 0;

    for (const booking of cancellable) {
      const result = await cancelBookingWithRefund(booking._id, { skipNotify: true });
      if (!result) continue;
      cancelledCount++;
      if (!groupInfo) {
        groupInfo = { venueId: result.venueId, ownerId: result.ownerId, venueName: result.venueName };
      }
      if (result.cancelledEvent) {
        cancelledEvents.push(result.cancelledEvent);
      }
    }

    if (groupInfo && cancelledCount > 0) {
      const { ownerId, venueId, venueName } = groupInfo;
      const n = cancelledCount;
      await createNotification(
        ownerId,
        'venue_booking_cancelled_by_requester',
        'Série de réservations annulée',
        n > 1
          ? `${n} réservations pour "${venueName}" ont été annulées par le demandeur. Les créneaux sont de nouveau disponibles.`
          : `Une réservation pour "${venueName}" a été annulée par le demandeur. Le créneau est de nouveau disponible.`,
        undefined, undefined, undefined,
        venueId
      );
    }

    if (cancelledEvents.length > 0) {
      await notifySeriesCancellation(cancelledEvents);
    }

    res.status(200).json({ cancelled: cancelledCount });
  } catch (error) {
    console.error('Erreur cancelBookingGroup:', error);
    res.status(500).json({ message: 'Erreur interne du serveur' });
  }
};
