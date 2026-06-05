import express, { Response } from 'express';
import Stripe from 'stripe';
import { AuthRequest } from '../middleware/auth';
import { config } from '../config/env';
import { EventModel } from '../models/Event';
import { VenueBookingModel } from '../models/VenueBooking';
import { NotificationModel } from '../models/Notification';
import mongoose from 'mongoose';
import { emitVenueBookingPaymentUpdated } from '../services/eventEmitter';
import { createNotification } from './notification';
import { computeBookingAmount } from '../utils/venuePricing';
import { ProcessedStripeEventModel } from '../models/ProcessedStripeEvent';

const stripe = config.stripe.secretKey ? new Stripe(config.stripe.secretKey) : null;

export { stripe };

/**
 * Crée une session Stripe Checkout pour l'achat d'une place à 1€.
 * Mêmes validations que l'inscription spectateur (événement, places, désinscription, etc.).
 */
export const createCheckoutSession = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!stripe) {
      res.status(503).json({ message: 'Paiement non configuré' });
      return;
    }

    const userId = req.user?.id;
    const userRole = req.user?.role;

    if (!userId || userRole !== 'SPECTATOR') {
      res.status(403).json({ message: 'Seuls les spectateurs peuvent acheter une place' });
      return;
    }

    const { eventId } = req.body;
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
      res.status(422).json({ message: 'Cet événement est annulé' });
      return;
    }

    const withdrawnSpectators = (event as any).withdrawnSpectators || [];
    if (withdrawnSpectators.some((id: mongoose.Types.ObjectId) => id.toString() === userId)) {
      res.status(403).json({ message: 'Réinscription à cet événement non possible.' });
      return;
    }

    const spectatorRegistrations = event.spectatorRegistrations || [];
    if (spectatorRegistrations.some((id) => id.toString() === userId)) {
      res.status(409).json({ message: 'Vous êtes déjà inscrit à cet événement' });
      return;
    }

    const maxSpectators = (event as any).maxSpectators;
    if (maxSpectators != null && typeof maxSpectators === 'number' && spectatorRegistrations.length >= maxSpectators) {
      res.status(409).json({ message: 'Plus de places disponibles' });
      return;
    }

    const baseUrl = config.frontend.url.replace(/\/$/, '');
    const successUrl = `${baseUrl}/spectateur/events?payment=success&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${baseUrl}/spectateur/events?payment=cancelled`;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: {
              name: `Place - ${event.title}`,
              description: event.location?.city ? `Événement à ${event.location.city}` : undefined,
            },
            unit_amount: 100, // 1€ = 100 centimes
          },
          quantity: 1,
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: userId,
      metadata: {
        eventId: eventId.toString(),
        userId,
      },
    });

    res.status(200).json({ url: session.url });
  } catch (error: any) {
    console.error('Stripe createCheckoutSession error:', error);
    res.status(500).json({ message: 'Erreur lors de la création du paiement' });
  }
};

/**
 * Webhook Stripe : après paiement réussi, inscrire le spectateur à l'événement.
 * Doit être enregistré avec body brut (express.raw) pour la signature.
 */
export const handleStripeWebhook = async (req: express.Request, res: Response): Promise<void> => {
  // req.body est le Buffer brut (route enregistrée avec express.raw())
  const rawBody = req.body;
  if (!rawBody || !Buffer.isBuffer(rawBody)) {
    console.error('[Stripe] Webhook appelé sans body brut');
    res.status(400).send('Webhook Error: missing raw body');
    return;
  }

  const sig = req.headers['stripe-signature'];
  const webhookSecret = config.stripe.webhookSecret;

  if (!stripe || !webhookSecret) {
    console.error('[Stripe] Stripe ou STRIPE_WEBHOOK_SECRET non configuré');
    res.status(500).send('Webhook not configured');
    return;
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig as string, webhookSecret);
  } catch (err: any) {
    console.error('[Stripe] Webhook signature verification failed:', err.message);
    res.status(400).send(`Webhook Error: ${err.message}`);
    return;
  }

  try {
    await ProcessedStripeEventModel.create({ stripeEventId: event.id });
  } catch (dedupErr: unknown) {
    // Clé dupliquée = événement déjà traité
    if (
      typeof dedupErr === 'object' &&
      dedupErr !== null &&
      (dedupErr as any).code === 11000
    ) {
      res.status(200).json({ received: true });
      return;
    }
    throw dedupErr;
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;

    // Routage par type de paiement via metadata
    if (session.metadata?.type === 'venue_booking') {
      // ── Paiement réservation de salle ──
      const bookingId = session.metadata?.bookingId;
      const userId = session.metadata?.userId;

      if (!bookingId || !userId) {
        console.error('[Stripe] Metadata venue_booking manquant:', session.metadata);
        res.status(200).send('OK');
        return;
      }

      try {
        // Populate venue for notification messages
        const tempBooking = await VenueBookingModel.findById(bookingId);
        if (!tempBooking) {
          console.error('[Stripe] Réservation non trouvée:', bookingId);
          res.status(200).send('OK');
          return;
        }

        // Only ACCEPTED bookings can be confirmed — prevents resurrecting cancelled/refused bookings
        if (tempBooking.status !== 'ACCEPTED') {
          if (tempBooking.status === 'CONFIRMED') {
            console.log('[Stripe] Réservation déjà confirmée, skip:', bookingId);
          } else {
            console.warn('[Stripe] Réservation non ACCEPTED, skip confirmation:', bookingId, tempBooking.status);
          }
          res.status(200).send('OK');
          return;
        }

        // Atomic update — prevents race condition with confirmVenueBookingPayment
        const paidAmount = session.amount_total != null ? session.amount_total / 100 : undefined;
        const booking = await VenueBookingModel.findOneAndUpdate(
          { _id: bookingId, status: 'ACCEPTED' },
          {
            status: 'CONFIRMED',
            paymentStatus: 'paid',
            paidAmount,
            paidAt: new Date(),
            stripePaymentIntentId: session.payment_intent as string,
          },
          { new: true }
        ).populate<{ venue: { _id: mongoose.Types.ObjectId; name: string; owner: mongoose.Types.ObjectId } }>('venue', 'name owner');

        if (!booking) {
          console.log('[Stripe] Réservation déjà traitée par un autre handler, skip:', bookingId);
          res.status(200).send('OK');
          return;
        }

        // Notifications pour les deux parties
        try {
          await NotificationModel.create([
            {
              user: booking.requester,
              type: 'venue_booking_confirmed',
              title: 'Réservation confirmée',
              message: `Votre paiement pour "${booking.venue.name}" a été reçu. Réservation confirmée !`,
              relatedVenue: booking.venue._id,
              relatedBooking: booking._id,
              read: false,
            },
            {
              user: booking.venue.owner,
              type: 'venue_booking_confirmed',
              title: 'Paiement reçu',
              message: `Le paiement pour la réservation de "${booking.venue.name}" a été reçu. Réservation confirmée !`,
              relatedVenue: booking.venue._id,
              relatedBooking: booking._id,
              read: false,
            },
          ]);
        } catch (notifError) {
          console.error('[Stripe] Erreur notification webhook venue_booking:', notifError, { bookingId, userId });
        }

        if (booking) {
          emitVenueBookingPaymentUpdated(
            booking._id.toString(),
            (booking.venue as { _id: mongoose.Types.ObjectId })._id.toString(),
            booking.status,
            booking.paymentStatus,
            [booking.requester.toString(), (booking.venue as { _id: mongoose.Types.ObjectId; owner: mongoose.Types.ObjectId }).owner.toString()]
          );
        }

        console.log('[Stripe] Réservation confirmée après paiement (webhook):', userId, '→ booking', bookingId);
      } catch (e) {
        // Return 500 so Stripe retries the webhook instead of silently losing the confirmation
        console.error('[Stripe] Erreur confirmation réservation après webhook:', e);
        try {
          await ProcessedStripeEventModel.deleteOne({ stripeEventId: event.id });
        } catch (cleanupErr) {
          console.error('[Stripe] Erreur nettoyage dedup record:', cleanupErr);
        }
        res.status(500).send('Internal error');
        return;
      }
    } else if (session.metadata?.type === 'venue_booking_group') {
      // ── Paiement lot de réservations (série récurrente Org B) ──
      const bookingGroupId = session.metadata?.bookingGroupId;
      const userId = session.metadata?.userId;

      if (!bookingGroupId || !userId) {
        console.error('[Stripe] Metadata venue_booking_group manquant:', session.metadata);
        res.status(200).send('OK');
        return;
      }

      try {
        const bookings = await VenueBookingModel.find({ bookingGroupId })
          .populate<{ venue: { _id: mongoose.Types.ObjectId; name: string; owner: mongoose.Types.ObjectId; pricePerEvent: number; pricingType?: string; deposit?: number; extraFees?: { description: string; amount?: number }[] } }>(
            'venue', 'name owner pricePerEvent pricingType deposit extraFees'
          );

        let confirmedCount = 0;
        let groupNotifCtx: { requesterId: string; ownerId: string; venueId: string; venueName: string; firstBookingId: string } | null = null;

        for (const booking of bookings) {
          if (booking.status !== 'ACCEPTED') continue;

          const { amount } = computeBookingAmount(
            { pricePerEvent: booking.venue.pricePerEvent, pricingType: booking.venue.pricingType as any, deposit: booking.venue.deposit, extraFees: booking.venue.extraFees },
            { startTime: booking.startTime, endTime: booking.endTime }
          );

          const updated = await VenueBookingModel.findOneAndUpdate(
            { _id: booking._id, status: 'ACCEPTED' },
            {
              status: 'CONFIRMED',
              paymentStatus: 'paid',
              paidAmount: amount,
              paidAt: new Date(),
              stripePaymentIntentId: session.payment_intent as string,
            },
            { new: true }
          );

          if (!updated) continue;
          confirmedCount++;
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

        console.log('[Stripe] Lot confirmé après paiement (webhook):', userId, '→ group', bookingGroupId);
      } catch (e) {
        console.error('[Stripe] Erreur confirmation lot après webhook:', e);
        try {
          await ProcessedStripeEventModel.deleteOne({ stripeEventId: event.id });
        } catch (cleanupErr) {
          console.error('[Stripe] Erreur nettoyage dedup record (groupe):', cleanupErr);
        }
        res.status(500).send('Internal error');
        return;
      }
    } else {
      // ── Paiement ticket spectateur (flow existant) ──
      const eventId = session.metadata?.eventId;
      const userId = session.metadata?.userId;

      if (!eventId || !userId) {
        console.error('[Stripe] Metadata manquant dans checkout.session.completed', session.metadata);
        res.status(200).send('OK');
        return;
      }

      try {
        const eventDoc = await EventModel.findById(eventId);
        if (!eventDoc) {
          console.error('[Stripe] Événement non trouvé:', eventId);
          res.status(200).send('OK');
          return;
        }

        const spectatorRegistrations = eventDoc.spectatorRegistrations || [];
        if (spectatorRegistrations.some((id) => id.toString() === userId)) {
          console.log('[Stripe] Spectateur déjà inscrit, skip:', userId);
          res.status(200).send('OK');
          return;
        }

        await EventModel.findByIdAndUpdate(eventId, {
          $addToSet: { spectatorRegistrations: new mongoose.Types.ObjectId(userId) },
        });
        console.log('[Stripe] Spectateur inscrit après paiement:', userId, '→ événement', eventId);
      } catch (e) {
        console.error('[Stripe] Erreur inscription spectateur après webhook:', e);
      }
    }
  }

  if (event.type === 'checkout.session.expired') {
    const session = event.data.object as Stripe.Checkout.Session;
    const bookingId = session.metadata?.bookingId;

    if (bookingId && session.metadata?.type === 'venue_booking') {
      try {
        const booking = await VenueBookingModel.findOneAndUpdate(
          { _id: bookingId, status: 'ACCEPTED', paymentStatus: { $ne: 'paid' } },
          { paymentStatus: 'expired' },
          { new: true }
        );

        if (booking) {
          console.log('[Stripe] Session expirée — réservation marquée expired:', bookingId);
        }
      } catch (e) {
        console.error('[Stripe] Erreur traitement checkout.session.expired:', e);
      }
    }
  }

  if (event.type === 'refund.updated') {
    const refund = event.data.object as Stripe.Refund;

    if (refund.status !== 'succeeded') {
      res.status(200).send('OK');
      return;
    }

    const refundId = refund.id;

    if (refundId) {
      try {
        // Rattachement par refund.id (et non par PaymentIntent) : un lot partage un seul
        // PaymentIntent entre ses N réservations, mais chaque remboursement a son propre id.
        const booking = await VenueBookingModel.findOne({ stripeRefundId: refundId })
          .populate<{ venue: { _id: mongoose.Types.ObjectId; name: string; owner: mongoose.Types.ObjectId } }>('venue', 'name owner');

        if (booking && booking.paymentStatus !== 'refunded') {
          booking.paymentStatus = 'refunded';
          booking.refundedAmount = refund.amount / 100;
          booking.refundedAt = new Date();
          await booking.save();

          emitVenueBookingPaymentUpdated(
            booking._id.toString(),
            (booking.venue as { _id: mongoose.Types.ObjectId })._id.toString(),
            booking.status,
            booking.paymentStatus,
            [booking.requester.toString(), (booking.venue as { _id: mongoose.Types.ObjectId; owner: mongoose.Types.ObjectId }).owner.toString()]
          );

          // Pour les séries (bookingGroupId), n'envoyer qu'une seule notification au demandeur
          // (la première fois qu'un booking du groupe est remboursé).
          const isFirstGroupRefund = booking.bookingGroupId
            ? (await VenueBookingModel.countDocuments({
                bookingGroupId: booking.bookingGroupId,
                paymentStatus: 'refunded',
                _id: { $ne: booking._id },
              })) === 0
            : true;

          if (isFirstGroupRefund) {
            await createNotification(
              booking.requester.toString(),
              'venue_booking_refunded',
              'Remboursement effectué',
              `Votre remboursement de ${booking.refundedAmount}€ pour "${booking.venue.name}" a été traité.`,
              undefined, undefined, undefined,
              (booking.venue as { _id: mongoose.Types.ObjectId })._id.toString(),
              booking._id.toString()
            );
          }

          console.log('[Stripe] Remboursement confirmé via webhook:', refundId);
        }
      } catch (e) {
        console.error('[Stripe] Erreur traitement refund.updated:', e);
        res.status(200).send('OK');
        return;
      }
    }
  }

  res.status(200).send('OK');
};

/**
 * Confirme l'inscription après paiement (appelé par le client au retour de Stripe).
 * Récupère la session Stripe, vérifie le paiement et inscrit le spectateur si pas déjà fait.
 * Utile si le webhook n'est pas configuré (ex. dev local) ou en secours.
 */
export const confirmRegistrationAfterPayment = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!stripe) {
      res.status(503).json({ message: 'Paiement non configuré' });
      return;
    }

    const userId = req.user?.id;
    const userRole = req.user?.role;
    if (!userId || userRole !== 'SPECTATOR') {
      res.status(403).json({ message: 'Non autorisé' });
      return;
    }

    const sessionId = (req.query.session_id || req.body?.session_id) as string;
    if (!sessionId) {
      res.status(400).json({ message: 'session_id manquant' });
      return;
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.payment_status !== 'paid') {
      res.status(422).json({ message: 'Paiement non reçu' });
      return;
    }
    if (session.metadata?.userId !== userId) {
      res.status(403).json({ message: 'Session ne correspond pas à l\'utilisateur' });
      return;
    }

    const eventId = session.metadata?.eventId;
    if (!eventId) {
      res.status(400).json({ message: 'Données de session invalides' });
      return;
    }

    const eventDoc = await EventModel.findById(eventId);
    if (!eventDoc) {
      res.status(404).json({ message: 'Événement non trouvé' });
      return;
    }

    const spectatorRegistrations = eventDoc.spectatorRegistrations || [];
    if (spectatorRegistrations.some((id) => id.toString() === userId)) {
      res.status(200).json({ message: 'Déjà inscrit', eventId });
      return;
    }

    await EventModel.findByIdAndUpdate(eventId, {
      $addToSet: { spectatorRegistrations: new mongoose.Types.ObjectId(userId) },
    });
    console.log('[Stripe] Inscription confirmée après paiement (confirmRegistration):', userId, '→', eventId);
    res.status(200).json({ message: 'Inscription enregistrée', eventId });
  } catch (error: any) {
    console.error('Stripe confirmRegistrationAfterPayment error:', error);
    res.status(500).json({ message: 'Erreur lors de la confirmation' });
  }
};

/**
 * Crée une session Stripe Checkout pour le paiement d'une réservation de salle.
 * Appelé par le requester après que le propriétaire a accepté la réservation.
 */
export const createVenueBookingCheckoutSession = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!stripe) {
      res.status(503).json({ message: 'Paiement non configuré' });
      return;
    }

    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ message: 'Non authentifié' });
      return;
    }

    const { bookingId } = req.body;
    if (!bookingId || !mongoose.Types.ObjectId.isValid(bookingId)) {
      res.status(400).json({ message: 'ID de réservation invalide' });
      return;
    }

    const booking = await VenueBookingModel.findById(bookingId).populate<{
      venue: { _id: mongoose.Types.ObjectId; name: string; pricePerEvent: number; pricingType?: string; owner: mongoose.Types.ObjectId; deposit?: number; extraFees?: { description: string; amount?: number }[] };
    }>('venue', 'name pricePerEvent pricingType owner deposit extraFees');

    if (!booking) {
      res.status(404).json({ message: 'Réservation introuvable' });
      return;
    }

    if (booking.requester.toString() !== userId) {
      res.status(403).json({ message: 'Cette réservation ne vous appartient pas' });
      return;
    }

    if (booking.status !== 'ACCEPTED') {
      res.status(400).json({ message: 'Cette réservation n\'est pas en attente de paiement' });
      return;
    }

    if (booking.paymentStatus === 'paid') {
      res.status(409).json({ message: 'Cette réservation a déjà été payée' });
      return;
    }

    const venue = booking.venue;
    const { amount, requiresPayment } = computeBookingAmount(
      { pricePerEvent: venue.pricePerEvent, pricingType: venue.pricingType as any, deposit: venue.deposit, extraFees: venue.extraFees },
      { startTime: booking.startTime, endTime: booking.endTime }
    );
    if (!venue || !requiresPayment) {
      res.status(400).json({ message: 'Cette réservation ne nécessite pas de paiement Stripe' });
      return;
    }

    const baseUrl = config.frontend.url.replace(/\/$/, '');
    const successUrl = `${baseUrl}/my-bookings?payment=success&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${baseUrl}/my-bookings?payment=cancelled`;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: {
              name: `Réservation - ${venue.name}`,
            },
            unit_amount: Math.round(amount * 100),
          },
          quantity: 1,
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: userId,
      metadata: {
        type: 'venue_booking',
        bookingId: bookingId.toString(),
        userId,
        venueId: venue._id.toString(),
        pricingType: venue.pricingType ?? 'unknown',
        computedAmount: amount.toString(),
        deposit: (venue.deposit ?? 0).toString(),
        extraFeesTotal: ((venue.extraFees ?? []).reduce((s, f) => s + (f.amount ?? 0), 0)).toString(),
      },
    });

    booking.paymentStatus = 'pending';
    booking.stripeSessionId = session.id;
    await booking.save();

    res.status(200).json({ url: session.url });
  } catch (error: any) {
    console.error('Stripe createVenueBookingCheckoutSession error:', error);
    res.status(500).json({ message: 'Erreur lors de la création du paiement' });
  }
};

/**
 * Confirme le paiement d'une réservation de salle après retour de Stripe.
 * Fallback si le webhook est lent ou non configuré.
 */
export const confirmVenueBookingPayment = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!stripe) {
      res.status(503).json({ message: 'Paiement non configuré' });
      return;
    }

    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ message: 'Non authentifié' });
      return;
    }

    const sessionId = (req.query.session_id || req.body?.session_id) as string;
    if (!sessionId) {
      res.status(400).json({ message: 'session_id manquant' });
      return;
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.payment_status !== 'paid') {
      res.status(422).json({ message: 'Paiement non reçu' });
      return;
    }
    if (session.metadata?.userId !== userId) {
      res.status(403).json({ message: 'Session ne correspond pas à l\'utilisateur' });
      return;
    }
    if (session.metadata?.type !== 'venue_booking') {
      res.status(400).json({ message: 'Type de session invalide' });
      return;
    }

    const bookingId = session.metadata?.bookingId;
    if (!bookingId) {
      res.status(400).json({ message: 'Données de session invalides' });
      return;
    }

    const existingBooking = await VenueBookingModel.findById(bookingId);
    if (!existingBooking) {
      res.status(404).json({ message: 'Réservation introuvable' });
      return;
    }

    // Only ACCEPTED bookings can be confirmed — prevents resurrecting cancelled/refused bookings
    if (existingBooking.status !== 'ACCEPTED') {
      if (existingBooking.status === 'CONFIRMED') {
        res.status(200).json({ message: 'Déjà confirmée', bookingId });
      } else {
        res.status(400).json({ message: 'Cette réservation ne peut pas être confirmée' });
      }
      return;
    }

    // Atomic update — prevents race condition with webhook handler
    const paidAmount = session.amount_total != null ? session.amount_total / 100 : undefined;
    const booking = await VenueBookingModel.findOneAndUpdate(
      { _id: bookingId, status: 'ACCEPTED' },
      {
        status: 'CONFIRMED',
        paymentStatus: 'paid',
        paidAmount,
        paidAt: new Date(),
        stripePaymentIntentId: session.payment_intent as string,
      },
      { new: true }
    ).populate<{ venue: { _id: mongoose.Types.ObjectId; name: string; owner: mongoose.Types.ObjectId } }>('venue', 'name owner');

    if (!booking) {
      res.status(200).json({ message: 'Déjà confirmée', bookingId });
      return;
    }

    // Notifications pour les deux parties
    try {
      await NotificationModel.create([
        {
          user: booking.requester,
          type: 'venue_booking_confirmed',
          title: 'Réservation confirmée',
          message: `Votre paiement pour "${booking.venue.name}" a été reçu. Réservation confirmée !`,
          relatedVenue: booking.venue._id,
          relatedBooking: booking._id,
          read: false,
        },
        {
          user: booking.venue.owner,
          type: 'venue_booking_confirmed',
          title: 'Paiement reçu',
          message: `Le paiement pour la réservation de "${booking.venue.name}" a été reçu. Réservation confirmée !`,
          relatedVenue: booking.venue._id,
          relatedBooking: booking._id,
          read: false,
        },
      ]);
    } catch (notifError) {
      console.error('Erreur notification confirmVenueBookingPayment:', notifError, { bookingId, userId });
    }

    if (booking) {
      emitVenueBookingPaymentUpdated(
        booking._id.toString(),
        (booking.venue as { _id: mongoose.Types.ObjectId })._id.toString(),
        booking.status,
        booking.paymentStatus,
        [booking.requester.toString(), (booking.venue as { _id: mongoose.Types.ObjectId; owner: mongoose.Types.ObjectId }).owner.toString()]
      );
    }

    console.log('[Stripe] Réservation confirmée après paiement:', userId, '→ booking', bookingId);
    res.status(200).json({ message: 'Réservation confirmée', bookingId });
  } catch (error: any) {
    console.error('Stripe confirmVenueBookingPayment error:', error);
    res.status(500).json({ message: 'Erreur lors de la confirmation du paiement' });
  }
};

/**
 * Crée une session Stripe Checkout groupée pour un lot de réservations ACCEPTED.
 * Si toutes sont gratuites/CONFIRMED, renvoie { allFree: true } sans créer de session.
 * expires_at = min(min(paymentDeadlineAt du lot), now+24h), planché à now+30min (décision 3).
 */
export const createVenueGroupCheckoutSession = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!stripe) {
      res.status(503).json({ message: 'Paiement non configuré' });
      return;
    }

    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ message: 'Non authentifié' });
      return;
    }

    const { bookingGroupId } = req.body as { bookingGroupId: string };
    if (!bookingGroupId || !mongoose.Types.ObjectId.isValid(bookingGroupId)) {
      res.status(400).json({ message: 'bookingGroupId invalide' });
      return;
    }

    const bookings = await VenueBookingModel.find({
      bookingGroupId,
      requester: userId,
      status: 'ACCEPTED',
      paymentStatus: { $ne: 'paid' },
    }).populate<{ venue: { _id: mongoose.Types.ObjectId; name: string; owner: mongoose.Types.ObjectId; pricePerEvent: number; pricingType?: string; deposit?: number; extraFees?: { description: string; amount?: number }[] } }>(
      'venue', 'name owner pricePerEvent pricingType deposit extraFees'
    );

    if (bookings.length === 0) {
      res.status(404).json({ message: 'Aucune réservation ACCEPTED non payée pour ce lot' });
      return;
    }

    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];
    let hasPayable = false;
    let minDeadline: Date | undefined;

    for (const booking of bookings) {
      const { amount, requiresPayment } = computeBookingAmount(
        { pricePerEvent: booking.venue.pricePerEvent, pricingType: booking.venue.pricingType as any, deposit: booking.venue.deposit, extraFees: booking.venue.extraFees },
        { startTime: booking.startTime, endTime: booking.endTime }
      );
      if (!requiresPayment || amount === 0) continue;

      hasPayable = true;
      const dateStr = new Date(booking.requestedDate).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
      lineItems.push({
        price_data: {
          currency: 'eur',
          product_data: { name: `Réservation — ${booking.venue.name} — ${dateStr}` },
          unit_amount: Math.round(amount * 100),
        },
        quantity: 1,
      });

      if (booking.paymentDeadlineAt) {
        if (!minDeadline || booking.paymentDeadlineAt < minDeadline) {
          minDeadline = booking.paymentDeadlineAt;
        }
      }
    }

    if (!hasPayable) {
      res.status(200).json({ allFree: true });
      return;
    }

    const now = Date.now();
    const expiresAtMs = Math.max(
      now + 30 * 60 * 1000,
      Math.min(
        minDeadline ? minDeadline.getTime() : now + 24 * 60 * 60 * 1000,
        now + 24 * 60 * 60 * 1000
      )
    );
    const expiresAt = Math.floor(expiresAtMs / 1000);

    const baseUrl = config.frontend.url.replace(/\/$/, '');
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: lineItems,
      success_url: `${baseUrl}/my-bookings?payment=success&type=group&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/my-bookings?payment=cancelled`,
      client_reference_id: userId,
      expires_at: expiresAt,
      metadata: {
        type: 'venue_booking_group',
        bookingGroupId,
        userId,
      },
    });

    for (const booking of bookings) {
      const { requiresPayment } = computeBookingAmount(
        { pricePerEvent: booking.venue.pricePerEvent, pricingType: booking.venue.pricingType as any, deposit: booking.venue.deposit, extraFees: booking.venue.extraFees },
        { startTime: booking.startTime, endTime: booking.endTime }
      );
      if (!requiresPayment) continue;
      booking.paymentStatus = 'pending';
      booking.stripeSessionId = session.id;
      await booking.save();
    }

    res.status(200).json({ url: session.url });
  } catch (error: any) {
    console.error('Stripe createVenueGroupCheckoutSession error:', error);
    res.status(500).json({ message: 'Erreur lors de la création du paiement groupé' });
  }
};

/**
 * Confirme le paiement d'un lot de réservations après retour de Stripe.
 * Fallback si le webhook est lent ou non configuré (ex. dev local).
 * Calqué sur la branche webhook 'venue_booking_group' : recalcul du montant
 * par réservation (jamais session.amount_total, qui est le total de la série)
 * + garde atomique sur status: 'ACCEPTED' (anti-race avec le webhook).
 */
export const confirmVenueGroupPayment = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!stripe) {
      res.status(503).json({ message: 'Paiement non configuré' });
      return;
    }

    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ message: 'Non authentifié' });
      return;
    }

    const sessionId = (req.query.session_id || req.body?.session_id) as string;
    if (!sessionId) {
      res.status(400).json({ message: 'session_id manquant' });
      return;
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.payment_status !== 'paid') {
      res.status(422).json({ message: 'Paiement non reçu' });
      return;
    }
    if (session.metadata?.userId !== userId) {
      res.status(403).json({ message: 'Session ne correspond pas à l\'utilisateur' });
      return;
    }
    if (session.metadata?.type !== 'venue_booking_group') {
      res.status(400).json({ message: 'Type de session invalide' });
      return;
    }

    const bookingGroupId = session.metadata?.bookingGroupId;
    if (!bookingGroupId) {
      res.status(400).json({ message: 'Données de session invalides' });
      return;
    }

    const bookings = await VenueBookingModel.find({ bookingGroupId, requester: userId })
      .populate<{ venue: { _id: mongoose.Types.ObjectId; name: string; owner: mongoose.Types.ObjectId; pricePerEvent: number; pricingType?: string; deposit?: number; extraFees?: { description: string; amount?: number }[] } }>(
        'venue', 'name owner pricePerEvent pricingType deposit extraFees'
      );

    let confirmed = 0;
    let groupNotifCtx: { requesterId: string; ownerId: string; venueId: string; venueName: string; firstBookingId: string } | null = null;

    for (const booking of bookings) {
      if (booking.status !== 'ACCEPTED') continue;

      const { amount } = computeBookingAmount(
        { pricePerEvent: booking.venue.pricePerEvent, pricingType: booking.venue.pricingType as any, deposit: booking.venue.deposit, extraFees: booking.venue.extraFees },
        { startTime: booking.startTime, endTime: booking.endTime }
      );

      // Atomic update — prevents race condition with webhook handler
      const updated = await VenueBookingModel.findOneAndUpdate(
        { _id: booking._id, status: 'ACCEPTED' },
        {
          status: 'CONFIRMED',
          paymentStatus: 'paid',
          paidAmount: amount,
          paidAt: new Date(),
          stripePaymentIntentId: session.payment_intent as string,
        },
        { new: true }
      );

      if (!updated) continue;
      confirmed += 1;
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

    if (groupNotifCtx && confirmed > 0) {
      const n = confirmed;
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

    console.log('[Stripe] Lot confirmé après paiement (confirm):', userId, '→ group', bookingGroupId, `(${confirmed} réservations)`);
    res.status(200).json({ message: 'Lot confirmé', bookingGroupId, confirmed });
  } catch (error: any) {
    console.error('Stripe confirmVenueGroupPayment error:', error);
    res.status(500).json({ message: 'Erreur lors de la confirmation du paiement groupé' });
  }
};

/**
 * Confirme un remboursement en attente (fallback si le webhook `refund.updated` n'est pas reçu,
 * ex. dev local — une annulation ne fait pas revenir l'utilisateur depuis Stripe). Interroge
 * Stripe par `stripeRefundId` ; si le remboursement a réussi, finalise la réservation. Idempotent.
 */
export const confirmVenueRefund = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!stripe) {
      res.status(503).json({ message: 'Paiement non configuré' });
      return;
    }

    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ message: 'Non authentifié' });
      return;
    }

    const bookingId = (req.query.bookingId || req.body?.bookingId) as string;
    if (!bookingId || !mongoose.Types.ObjectId.isValid(bookingId)) {
      res.status(400).json({ message: 'bookingId invalide' });
      return;
    }

    const booking = await VenueBookingModel.findById(bookingId)
      .populate<{ venue: { _id: mongoose.Types.ObjectId; name: string; owner: mongoose.Types.ObjectId } }>('venue', 'name owner');
    if (!booking) {
      res.status(404).json({ message: 'Réservation introuvable' });
      return;
    }
    if (booking.requester.toString() !== userId) {
      res.status(403).json({ message: 'Non autorisé' });
      return;
    }
    if (booking.paymentStatus === 'refunded') {
      res.status(200).json({ message: 'Déjà remboursé', paymentStatus: 'refunded' });
      return;
    }
    if (booking.paymentStatus !== 'refund_pending' || !booking.stripeRefundId) {
      res.status(422).json({ message: 'Aucun remboursement en attente' });
      return;
    }

    const refund = await stripe.refunds.retrieve(booking.stripeRefundId);
    if (refund.status !== 'succeeded') {
      res.status(202).json({ message: 'Remboursement en cours', paymentStatus: 'refund_pending' });
      return;
    }

    booking.paymentStatus = 'refunded';
    booking.refundedAmount = refund.amount / 100;
    booking.refundedAt = new Date();
    await booking.save();

    emitVenueBookingPaymentUpdated(
      booking._id.toString(),
      booking.venue._id.toString(),
      booking.status,
      booking.paymentStatus,
      [booking.requester.toString(), booking.venue.owner.toString()]
    );

    await createNotification(
      booking.requester.toString(),
      'venue_booking_refunded',
      'Remboursement effectué',
      `Votre remboursement de ${booking.refundedAmount}€ pour "${booking.venue.name}" a été traité.`,
      undefined, undefined, undefined,
      booking.venue._id.toString(),
      booking._id.toString()
    );

    res.status(200).json({ message: 'Remboursement confirmé', paymentStatus: 'refunded', refundedAmount: booking.refundedAmount });
  } catch (error: any) {
    console.error('Stripe confirmVenueRefund error:', error);
    res.status(500).json({ message: 'Erreur lors de la confirmation du remboursement' });
  }
};
