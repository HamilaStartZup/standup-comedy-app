import mongoose from 'mongoose';
import { VenueBookingModel } from '../models/VenueBooking';
import { InvoiceModel } from '../models/Invoice';
import { getBookingPriceBreakdown, formatInvoiceNumber, formatGroupInvoiceNumber } from '../utils/venueInvoice';
import Logger from '../utils/logger';

/**
 * Fige un snapshot immuable de facture pour un booking payé. Idempotent — un 2e appel
 * (webhook + fallback client, ou retry) ne recalcule/écrase jamais un snapshot existant.
 * Lève une exception si les données nécessaires sont manquantes.
 */
export async function createInvoiceSnapshot(bookingId: string): Promise<void> {
  const booking = await VenueBookingModel.findById(bookingId).populate<{
    venue: {
      _id: unknown;
      name: string;
      owner: { _id: unknown; toString(): string; firstName?: string; lastName?: string };
      companyName?: string;
      siret?: string;
      legalStatus?: string;
      contactName?: string;
      contactEmail?: string;
      address: string;
      postalCode: string;
      city: string;
      country: string;
      currency?: string;
      pricingType?: 'heure' | 'demi_journee' | 'journee' | 'soiree' | 'forfait' | 'pourcentage_billetterie' | 'gratuit';
      pricePerEvent: number;
      deposit?: number;
      extraFees?: { description: string; amount?: number }[];
    };
    requester: {
      _id: unknown;
      firstName?: string;
      lastName?: string;
      email: string;
      organizerProfile?: { companyName?: string };
    };
  }>([
    {
      path: 'venue',
      select: 'name owner companyName siret legalStatus contactName contactEmail address postalCode city country currency pricingType pricePerEvent deposit extraFees',
      populate: { path: 'owner', select: 'firstName lastName' },
    },
    { path: 'requester', select: 'firstName lastName email organizerProfile.companyName' },
  ]);

  if (!booking) {
    throw new Error(`[Invoice] Booking not found: ${bookingId}`);
  }
  if (!booking.venue) {
    throw new Error(`[Invoice] Venue missing for booking ${bookingId} (deleted?)`);
  }
  if (!booking.requester) {
    throw new Error(`[Invoice] Requester missing for booking ${bookingId} (deleted?)`);
  }

  const breakdown = getBookingPriceBreakdown(booking.venue, {
    startTime: booking.startTime,
    endTime: booking.endTime,
    paidAmount: booking.paidAmount,
  });

  // Série : N documents Invoice ne peuvent pas partager un numéro (unicité légale) —
  // suffixe = position du booking dans le groupe, stable car le groupe est créé d'un bloc
  // et le numéro est figé au 1er snapshot ($setOnInsert).
  let invoiceNumber: string;
  if (booking.bookingGroupId) {
    const siblings = await VenueBookingModel.find({ bookingGroupId: booking.bookingGroupId })
      .select('_id requestedDate')
      .sort({ requestedDate: 1, _id: 1 });
    const position = siblings.findIndex((s) => s._id.toString() === booking._id.toString()) + 1;
    invoiceNumber = `${formatGroupInvoiceNumber(booking.bookingGroupId.toString())}-${position}`;
  } else {
    invoiceNumber = formatInvoiceNumber(booking._id.toString());
  }

  await InvoiceModel.updateOne(
    { booking: booking._id },
    {
      $setOnInsert: {
        invoiceNumber,
        booking: booking._id,
        bookingGroupId: booking.bookingGroupId,
        issuedAt: booking.paidAt ?? new Date(),
        buyerUserId: booking.requester._id,
        sellerOwnerId: booking.venue.owner,
        buyer: {
          firstName: booking.requester.firstName,
          lastName: booking.requester.lastName,
          companyName: booking.requester.organizerProfile?.companyName,
          email: booking.requester.email,
        },
        seller: {
          venueName: booking.venue.name,
          companyName: booking.venue.companyName,
          siret: booking.venue.siret,
          legalStatus: booking.venue.legalStatus,
          ownerFirstName: booking.venue.owner.firstName,
          ownerLastName: booking.venue.owner.lastName,
          contactName: booking.venue.contactName,
          contactEmail: booking.venue.contactEmail,
          address: booking.venue.address,
          postalCode: booking.venue.postalCode,
          city: booking.venue.city,
          country: booking.venue.country,
        },
        lines: breakdown.lines,
        subtotal: breakdown.subtotal,
        currency: booking.venue.currency ?? 'EUR',
        eventDate: booking.requestedDate,
        startTime: booking.startTime,
        endTime: booking.endTime,
        pricingType: booking.venue.pricingType,
        paymentStatus: 'paid',
        paidAmount: booking.paidAmount,
        paidAt: booking.paidAt,
        stripePaymentIntentId: booking.stripePaymentIntentId,
        stripeSessionId: booking.stripeSessionId,
      },
    },
    { upsert: true }
  );
}

/**
 * Met à jour un snapshot existant après remboursement.
 * Lève une exception si aucun snapshot n'existe (remboursement orphelin).
 */
export async function updateInvoiceRefund(bookingId: string, refundedAmount: number, refundedAt: Date): Promise<void> {
  const result = await InvoiceModel.updateOne(
    { booking: new mongoose.Types.ObjectId(bookingId) },
    { $set: { paymentStatus: 'refunded', refundedAmount, refundedAt } }
  );

  if (result.matchedCount === 0) {
    // Race : refund.updated peut arriver avant checkout.session.completed → aucun snapshot
    // encore. L'appelant catche (non-bloquant) et le backfill recrée puis re-rembourse.
    throw new Error(
      `[Invoice] Orphan refund for booking ${bookingId} (no snapshot). ` +
      `Will be recovered by backfill if snapshot created later.`
    );
  }
}

/**
 * Variantes non-bloquantes des opérations de facture pour les flux de paiement :
 * l'échec est loggé mais jamais propagé (le backfill rejouera). `context` identifie l'appelant.
 */
export async function createInvoiceSnapshotSafe(bookingId: string, context?: string): Promise<void> {
  try {
    await createInvoiceSnapshot(bookingId);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    Logger.error(`[Invoice] Snapshot creation failed (non-bloquant): ${message}`, { bookingId, context });
  }
}

export async function updateInvoiceRefundSafe(
  bookingId: string,
  refundedAmount: number,
  refundedAt: Date,
  context?: string
): Promise<void> {
  try {
    await updateInvoiceRefund(bookingId, refundedAmount, refundedAt);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    Logger.error(`[Invoice] Refund update failed (non-bloquant): ${message}`, { bookingId, context });
  }
}
