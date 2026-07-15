import { VenueBookingModel } from '../models/VenueBooking';
import { InvoiceModel } from '../models/Invoice';
import { getBookingPriceBreakdown, formatInvoiceNumber, formatGroupInvoiceNumber } from '../utils/venueInvoice';

/**
 * Fige un snapshot immuable de facture pour un booking payé. Idempotent — un 2e appel
 * (webhook + fallback client, ou retry) ne recalcule/écrase jamais un snapshot existant.
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
    requester: { _id: unknown; firstName?: string; lastName?: string; email: string };
  }>([
    {
      path: 'venue',
      select: 'name owner companyName siret legalStatus address postalCode city country currency pricingType pricePerEvent deposit extraFees',
      populate: { path: 'owner', select: 'firstName lastName' },
    },
    { path: 'requester', select: 'firstName lastName email' },
  ]);

  if (!booking || !booking.venue || !booking.requester) return;

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
          email: booking.requester.email,
        },
        seller: {
          venueName: booking.venue.name,
          companyName: booking.venue.companyName,
          siret: booking.venue.siret,
          legalStatus: booking.venue.legalStatus,
          ownerFirstName: booking.venue.owner.firstName,
          ownerLastName: booking.venue.owner.lastName,
          address: booking.venue.address,
          postalCode: booking.venue.postalCode,
          city: booking.venue.city,
          country: booking.venue.country,
        },
        lines: breakdown.lines,
        subtotal: breakdown.subtotal,
        currency: booking.venue.currency ?? 'EUR',
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

/** Met à jour un snapshot existant après remboursement. No-op si pas encore de snapshot (pré-backfill). */
export async function updateInvoiceRefund(bookingId: string, refundedAmount: number, refundedAt: Date): Promise<void> {
  await InvoiceModel.updateOne(
    { booking: bookingId },
    { $set: { paymentStatus: 'refunded', refundedAmount, refundedAt } }
  );
}
