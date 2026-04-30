import { Response, Request } from 'express';
import mongoose from 'mongoose';
import { AuthRequest } from '../middleware/auth';
import { VenueModel, CancellationPolicy } from '../models/Venue';
import { VenueBookingModel, VenueBookingDocument } from '../models/VenueBooking';
import { VenueBlockedDateModel } from '../models/VenueBlockedDate';
import { NotificationModel } from '../models/Notification';
import { stripe } from './stripe';
import { config } from '../config/env';
import {
  emitVenueBookingStatusChanged,
  emitVenueBookingPaymentUpdated,
} from '../services/eventEmitter';
import { computeBookingAmount } from '../utils/venuePricing';

// Vérifie si deux plages horaires se chevauchent (même date)
function timesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  const toMinutes = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };
  return toMinutes(aStart) < toMinutes(bEnd) && toMinutes(bStart) < toMinutes(aEnd);
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

    // Vérifier que la date/créneau n'est pas bloqué par le propriétaire
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);

    const blockedDates = await VenueBlockedDateModel.find({
      venue: venueId,
      date: { $gte: dayStart, $lte: dayEnd },
    });

    const isBlocked = blockedDates.some((b) => {
      // Blocage journée entière
      if (!b.startTime || !b.endTime) return true;
      // Pour les types à créneau fixe non sélectionnable, les blocs partiels n'ont pas d'effet
      const fixedSlotTypes = ['journee', 'soiree', 'forfait', 'gratuit', 'pourcentage_billetterie'];
      if (fixedSlotTypes.includes(pricingType || '')) return false;
      // Pour heure et demi_journee : vérifier le chevauchement horaire
      return timesOverlap(b.startTime, b.endTime, startTime!, endTime!);
    });

    if (isBlocked) {
      res.status(409).json({ message: 'La salle est indisponible à cette date ou sur ce créneau' });
      return;
    }

    // Vérifier qu'il n'y a pas de réservation ACCEPTED/CONFIRMED qui chevauche le créneau demandé
    // NOTE: cette vérification n'est pas atomique avec le create() ci-dessous.
    // En haute concurrence, deux requêtes simultanées peuvent passer ce check et créer un conflit.
    // Mitigation possible : transaction MongoDB (nécessite replica set).
    const acceptedBookings = await VenueBookingModel.find({
      venue: venueId,
      status: { $in: ['ACCEPTED', 'CONFIRMED'] },
      requestedDate: { $gte: dayStart, $lte: dayEnd },
    });

    const hasConflict = acceptedBookings.some((b) =>
      timesOverlap(b.startTime, b.endTime, startTime!, endTime!)
    );

    if (hasConflict) {
      res.status(409).json({ message: 'La salle est déjà réservée sur ce créneau' });
      return;
    }

    const { amount, requiresPayment } = computeBookingAmount(
      { pricePerEvent: venue.pricePerEvent, pricingType: pricingType as any, deposit: venue.deposit, extraFees: venue.extraFees },
      { startTime, endTime }
    );

    const isAutomatic = venue.bookingMode === 'automatic';

    let initialStatus = 'PENDING';
    let paymentDeadlineAt: Date | undefined;

    if (isAutomatic) {
      if (!requiresPayment) {
        initialStatus = 'CONFIRMED';
      } else {
        initialStatus = 'ACCEPTED';
        const [startHour, startMinute] = startTime!.split(':').map(Number);
        const deadline72h = new Date(Date.now() + 72 * 60 * 60 * 1000);
        if (!isNaN(startHour) && !isNaN(startMinute)) {
          const eventStart = new Date(date);
          eventStart.setUTCHours(startHour, startMinute, 0, 0);
          const deadlineBeforeEvent = new Date(eventStart.getTime() - 6 * 60 * 60 * 1000);
          const minDeadline = new Date(Date.now() + 60 * 60 * 1000);
          const chosen = deadline72h < deadlineBeforeEvent ? deadline72h : deadlineBeforeEvent;
          paymentDeadlineAt = chosen < minDeadline ? minDeadline : chosen;
        } else {
          paymentDeadlineAt = deadline72h;
        }
      }
    }

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
      booking.paymentStatus
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

    const bookings = await VenueBookingModel.find({ venue: venueId })
      .populate(
        'requester',
        'firstName lastName email phone avatarUrl role organizerProfile.companyName organizerProfile.phone'
      )
      .sort({ requestedDate: 1 });

    res.status(200).json({ bookings });
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
    } else {
      findFilter = { requester: requesterId };
      requesterFields = 'firstName lastName email organizerProfile.companyName';
    }

    const bookings = await VenueBookingModel.find(findFilter)
      .populate('venue', 'name city address venueType pricePerEvent cancellationPolicy isDeleted pricingType deposit extraFees currency')
      .populate('requester', requesterFields)
      .sort({ createdAt: -1 });

    res.status(200).json({ bookings });
  } catch (error) {
    console.error('Erreur myBookings:', error);
    res.status(500).json({ message: 'Erreur interne du serveur' });
  }
};

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

    // Si acceptation : vérifier si le paiement est nécessaire
    if (status === 'ACCEPTED') {
      const venueDoc = await VenueModel.findById(booking.venue._id);
      const { requiresPayment } = computeBookingAmount(
        { pricePerEvent: venueDoc?.pricePerEvent ?? 0, pricingType: venueDoc?.pricingType as any, deposit: venueDoc?.deposit, extraFees: venueDoc?.extraFees },
        { startTime: booking.startTime, endTime: booking.endTime }
      );
      if (!requiresPayment) {
        // Salle gratuite ou pourcentage billetterie → confirmer directement
        booking.status = 'CONFIRMED';
      } else {
        booking.status = 'ACCEPTED';
        const [startHour, startMinute] = booking.startTime.split(':').map(Number);
        const deadline72h = new Date(Date.now() + 72 * 60 * 60 * 1000);
        if (isNaN(startHour) || isNaN(startMinute)) {
          console.error('[updateBookingStatus] Format startTime invalide:', booking.startTime, { bookingId });
          booking.paymentDeadlineAt = deadline72h;
        } else {
          const eventStart = new Date(booking.requestedDate);
          eventStart.setUTCHours(startHour, startMinute, 0, 0);
          const deadlineBeforeEvent = new Date(eventStart.getTime() - 6 * 60 * 60 * 1000);
          const minDeadline = new Date(Date.now() + 60 * 60 * 1000); // minimum 1h
          const chosen = deadline72h < deadlineBeforeEvent ? deadline72h : deadlineBeforeEvent;
          booking.paymentDeadlineAt = chosen < minDeadline ? minDeadline : chosen;
        }
      }
    } else {
      booking.status = status;
    }
    await booking.save();

    emitVenueBookingStatusChanged(
      booking._id.toString(),
      (booking.venue as { _id: mongoose.Types.ObjectId })._id.toString(),
      booking.status,
      booking.paymentStatus
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
          read: false,
        });
      } else if (booking.status === 'CONFIRMED') {
        // Salle gratuite ou pourcentage billetterie → notification de confirmation sans paiement
        await NotificationModel.create({
          user: booking.requester,
          type: 'venue_booking_confirmed',
          title: 'Réservation confirmée',
          message: `Votre réservation pour "${booking.venue.name}" a été confirmée (aucun paiement requis).`,
          relatedVenue: booking.venue._id,
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
      .populate<{ venue: { _id: mongoose.Types.ObjectId; cancellationPolicy: CancellationPolicy } }>('venue', 'cancellationPolicy');
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
    if (booking.status === 'CONFIRMED' && booking.paymentStatus === 'paid') {
      const eventDatetime = new Date(booking.requestedDate);
      const [startH, startM] = booking.startTime.split(':').map(Number);
      eventDatetime.setUTCHours(startH, startM, 0, 0);

      const policy: CancellationPolicy = (booking.venue as { _id: mongoose.Types.ObjectId; cancellationPolicy: CancellationPolicy }).cancellationPolicy ?? 'moderate';
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

    booking.status = 'CANCELLED_BY_REQUESTER';
    await booking.save();

    // Notification pour le requester en cas d'annulation d'un booking confirmé
    if (booking.paymentStatus === 'refunded') {
      try {
        await NotificationModel.create({
          user: booking.requester,
          type: 'venue_booking_cancelled_by_requester',
          title: 'Réservation annulée — remboursement effectué',
          message: `Votre réservation a été annulée. Remboursement de ${booking.refundedAmount ?? booking.paidAmount}€ en cours.`,
          read: false,
        });
      } catch (notifError) {
        console.error('Erreur notification cancelBooking refund:', notifError, { bookingId });
      }
    }

    emitVenueBookingStatusChanged(
      booking._id.toString(),
      booking.venue.toString(),
      booking.status,
      booking.paymentStatus
    );

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

    emitVenueBookingStatusChanged(
      booking._id.toString(),
      (booking.venue as { _id: mongoose.Types.ObjectId })._id.toString(),
      booking.status,
      booking.paymentStatus
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
        b.paymentStatus
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
        refunded++;

        emitVenueBookingStatusChanged(
          booking._id.toString(),
          venueId,
          booking.status,
          booking.paymentStatus
        );

        try {
          await NotificationModel.create({
            user: booking.requester,
            type: 'venue_deleted_refund',
            title: 'Salle supprimée — remboursement effectué',
            message: `La salle "${venueName}" a été supprimée. Votre paiement de ${refundAmount}€ sera remboursé intégralement.`,
            relatedVenue: venueId as any,
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

    // Step A — Expire overdue bookings
    const overdueBookings = await VenueBookingModel.find({
      status: 'ACCEPTED',
      paymentDeadlineAt: { $lte: now },
    })
      .populate<{ venue: { _id: mongoose.Types.ObjectId; owner: mongoose.Types.ObjectId; name: string } | null }>('venue', 'owner name')
      .populate<{ requester: { _id: mongoose.Types.ObjectId; firstName: string; lastName: string } }>('requester', 'firstName lastName');

    for (const booking of overdueBookings) {
      try {
        // Expire Stripe session if pending
        if (booking.stripeSessionId && booking.paymentStatus === 'pending' && stripe) {
          try {
            await stripe.checkout.sessions.expire(booking.stripeSessionId);
            console.log('[PaymentTimeout] Session Stripe expirée:', booking.stripeSessionId);
          } catch (stripeErr) {
            console.error('[PaymentTimeout] Erreur expiration session Stripe:', stripeErr, { bookingId: booking._id });
          }
        }

        // Atomic update to prevent race condition with Stripe webhook confirmation
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
          booking.venue._id.toString(),
          'EXPIRED',
          booking.paymentStatus
        );

        const d = booking.requestedDate;
        const eventDate = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;

        // Notify requester
        try {
          await NotificationModel.create({
            user: booking.requester,
            type: 'venue_booking_payment_expired',
            title: 'Réservation expirée',
            message: `Votre réservation pour "${booking.venue.name}" le ${eventDate} a expiré car le paiement n'a pas été effectué dans les 72h.`,
            relatedVenue: booking.venue._id,
            read: false,
          });
        } catch (notifError) {
          console.error('[PaymentTimeout] Erreur notification requester:', notifError, { bookingId: booking._id });
        }

        // Notify owner
        const requesterName = (booking.requester as any)?.firstName
          ? `${(booking.requester as any).firstName} ${(booking.requester as any).lastName}`
          : 'un utilisateur';
        try {
          await NotificationModel.create({
            user: booking.venue.owner,
            type: 'venue_booking_payment_expired',
            title: 'Réservation expirée — créneau disponible',
            message: `La réservation de "${requesterName}" pour "${booking.venue.name}" le ${eventDate} a expiré faute de paiement. Le créneau est de nouveau disponible.`,
            relatedVenue: booking.venue._id,
            read: false,
          });
        } catch (notifError) {
          console.error('[PaymentTimeout] Erreur notification owner:', notifError, { bookingId: booking._id });
        }
      } catch (bookingErr) {
        console.error('[PaymentTimeout] Erreur traitement booking:', bookingErr, { bookingId: booking._id });
      }
    }

    // Step B — Send 24h reminders
    const reminderDeadline = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const reminderBookings = await VenueBookingModel.find({
      status: 'ACCEPTED',
      paymentDeadlineAt: { $lte: reminderDeadline, $gt: now },
      paymentReminderSentAt: null,
    })
      .populate<{ venue: { _id: mongoose.Types.ObjectId; owner: mongoose.Types.ObjectId; name: string } | null }>('venue', 'owner name');

    for (const booking of reminderBookings) {
      try {
        if (!booking.venue) {
          console.error('[PaymentTimeout] Venue non trouvée pour reminder, skip:', booking._id);
          continue;
        }

        const d = booking.requestedDate;
        const eventDate = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;

        // Save reminder flag first to prevent spam if notification fails then succeeds on retry
        booking.paymentReminderSentAt = new Date();
        await booking.save();

        await NotificationModel.create({
          user: booking.requester,
          type: 'venue_booking_payment_reminder',
          title: 'Rappel — paiement requis',
          message: `Rappel : votre réservation pour "${booking.venue.name}" le ${eventDate} expire dans 24h. Effectuez le paiement pour confirmer.`,
          relatedVenue: booking.venue._id,
          read: false,
        });
        reminderCount++;

        emitVenueBookingPaymentUpdated(
          booking._id.toString(),
          booking.venue._id.toString(),
          booking.status,
          booking.paymentStatus
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
