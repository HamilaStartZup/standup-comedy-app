import express, { Response } from 'express';
import Stripe from 'stripe';
import { AuthRequest } from '../middleware/auth';
import { config } from '../config/env';
import { EventModel } from '../models/Event';
import { VenueBookingModel } from '../models/VenueBooking';
import { NotificationModel } from '../models/Notification';
import mongoose from 'mongoose';
import { emitVenueBookingPaymentUpdated } from '../services/eventEmitter';
import { computeBookingAmount } from '../utils/venuePricing';

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
              read: false,
            },
            {
              user: booking.venue.owner,
              type: 'venue_booking_confirmed',
              title: 'Paiement reçu',
              message: `Le paiement pour la réservation de "${booking.venue.name}" a été reçu. Réservation confirmée !`,
              relatedVenue: booking.venue._id,
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
            booking.paymentStatus
          );
        }

        console.log('[Stripe] Réservation confirmée après paiement (webhook):', userId, '→ booking', bookingId);
      } catch (e) {
        // Return 500 so Stripe retries the webhook instead of silently losing the confirmation
        console.error('[Stripe] Erreur confirmation réservation après webhook:', e);
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

    const paymentIntentId = typeof refund.payment_intent === 'string'
      ? refund.payment_intent
      : refund.payment_intent?.id;

    if (paymentIntentId) {
      try {
        const booking = await VenueBookingModel.findOne({ stripePaymentIntentId: paymentIntentId })
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
            booking.paymentStatus
          );

          try {
            await NotificationModel.create({
              user: booking.requester,
              type: 'venue_booking_refunded',
              title: 'Remboursement effectué',
              message: `Votre remboursement de ${booking.refundedAmount}€ pour "${booking.venue.name}" a été traité.`,
              relatedVenue: booking.venue._id,
              read: false,
            });
          } catch (notifError) {
            console.error('[Stripe] Erreur notification refund.updated:', notifError, { paymentIntentId });
          }

          console.log('[Stripe] Remboursement confirmé via webhook:', paymentIntentId);
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
    const userRole = req.user?.role;

    if (!userId || userRole !== 'ORGANIZER') {
      res.status(403).json({ message: 'Non autorisé' });
      return;
    }

    const { bookingId } = req.body;
    if (!bookingId || !mongoose.Types.ObjectId.isValid(bookingId)) {
      res.status(400).json({ message: 'ID de réservation invalide' });
      return;
    }

    const booking = await VenueBookingModel.findById(bookingId).populate<{
      venue: { _id: mongoose.Types.ObjectId; name: string; pricePerEvent: number; pricingType?: string; owner: mongoose.Types.ObjectId; deposit?: number; extraFees?: { description: string; amount: number }[] };
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
        extraFeesTotal: ((venue.extraFees ?? []).reduce((s, f) => s + f.amount, 0)).toString(),
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
    const userRole = req.user?.role;
    if (!userId || userRole !== 'ORGANIZER') {
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
          read: false,
        },
        {
          user: booking.venue.owner,
          type: 'venue_booking_confirmed',
          title: 'Paiement reçu',
          message: `Le paiement pour la réservation de "${booking.venue.name}" a été reçu. Réservation confirmée !`,
          relatedVenue: booking.venue._id,
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
        booking.paymentStatus
      );
    }

    console.log('[Stripe] Réservation confirmée après paiement:', userId, '→ booking', bookingId);
    res.status(200).json({ message: 'Réservation confirmée', bookingId });
  } catch (error: any) {
    console.error('Stripe confirmVenueBookingPayment error:', error);
    res.status(500).json({ message: 'Erreur lors de la confirmation du paiement' });
  }
};
