import type { IVenueBooking } from '../types/venue';
import type { IUserData } from '../types/user';

export interface InvoicePriceLine {
  label: string;
  amount: number;
  note?: string;
}

export interface InvoicePriceBreakdown {
  lines: InvoicePriceLine[];
  subtotal: number;
}

function toMin(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function formatMoney(amount: number, currency: string): string {
  return `${amount.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} ${currency}`;
}

export function canShowInvoice(booking: IVenueBooking): boolean {
  if (booking.status === 'CONFIRMED') return true;
  return booking.paymentStatus === 'paid' || booking.paymentStatus === 'refunded';
}

export function canShowGroupInvoice(bookings: IVenueBooking[]): boolean {
  return bookings.some(canShowInvoice);
}

export function getInvoiceBookings(bookings: IVenueBooking[]): IVenueBooking[] {
  return [...bookings]
    .filter(canShowInvoice)
    .sort((a, b) => new Date(a.requestedDate).getTime() - new Date(b.requestedDate).getTime());
}

export function formatInvoiceNumber(bookingId: string): string {
  return `CCC-${bookingId.slice(-8).toUpperCase()}`;
}

export function formatGroupInvoiceNumber(groupId: string): string {
  return `CCC-SER-${groupId.slice(-8).toUpperCase()}`;
}

export function getBookingLineAmount(booking: IVenueBooking): number {
  if (booking.paidAmount != null) return booking.paidAmount;
  const breakdown = getBookingPriceBreakdown(booking);
  return breakdown?.subtotal ?? 0;
}

/** Détail location / caution / frais — même logique que VenueBookingForm et computeBookingAmount. */
export function getBookingPriceBreakdown(booking: IVenueBooking): InvoicePriceBreakdown | null {
  // Facture figée côté serveur au paiement : source de vérité tant que le backfill n'est pas fait partout.
  if (booking.invoiceSnapshot) {
    return { lines: booking.invoiceSnapshot.lines, subtotal: booking.invoiceSnapshot.subtotal };
  }

  const venue = booking.venue;
  if (!venue) return null;

  const pricingType = venue.pricingType;
  const pricePerEvent = venue.pricePerEvent ?? 0;
  const currency = venue.currency ?? 'EUR';
  const depositAmount = venue.deposit ?? 0;
  const extraFeesList = (venue.extraFees ?? []).filter((f) => (f.amount ?? 0) > 0);

  if (pricingType === 'gratuit' || pricingType === 'pourcentage_billetterie') {
    return {
      lines: [{ label: pricingType === 'gratuit' ? 'Réservation gratuite' : 'Pourcentage billetterie', amount: 0 }],
      subtotal: booking.paidAmount ?? 0,
    };
  }

  let base: number;
  let locationLabel: string;

  if (pricingType === 'heure' || !pricingType) {
    const hours = Math.ceil(Math.max(1, (toMin(booking.endTime) - toMin(booking.startTime)) / 60));
    base = hours * pricePerEvent;
    locationLabel = `Location (${hours} h × ${pricePerEvent} ${currency}/h)`;
  } else {
    base = pricePerEvent;
    const fixedLabels: Record<string, string> = {
      demi_journee: 'Demi-journée',
      journee: 'Journée',
      soiree: 'Soirée',
      forfait: 'Forfait',
    };
    const typeLabel = fixedLabels[pricingType] ?? 'Location';
    locationLabel = `Location (${typeLabel})`;
  }

  const lines: InvoicePriceLine[] = [{ label: locationLabel, amount: base }];

  if (depositAmount > 0) {
    lines.push({
      label: 'Caution',
      amount: depositAmount,
      note: 'Restituée selon conditions de la salle',
    });
  }

  for (const fee of extraFeesList) {
    lines.push({
      label: fee.description || 'Frais supplémentaire',
      amount: fee.amount ?? 0,
    });
  }

  const computedTotal = lines.reduce((sum, line) => sum + line.amount, 0);
  return {
    lines,
    subtotal: booking.paidAmount ?? computedTotal,
  };
}

export function formatInvoiceMoney(amount: number, currency: string): string {
  return formatMoney(amount, currency);
}

export function getInvoiceTotal(bookings: IVenueBooking[]): number {
  return getInvoiceBookings(bookings).reduce((sum, b) => sum + getBookingLineAmount(b), 0);
}

export function formatPricingLabel(pricingType?: string): string {
  const labels: Record<string, string> = {
    heure: 'À l\'heure',
    demi_journee: 'Demi-journée',
    journee: 'Journée',
    soiree: 'Soirée',
    forfait: 'Forfait',
    pourcentage_billetterie: '% billetterie',
    gratuit: 'Gratuit',
  };
  return pricingType ? (labels[pricingType] ?? pricingType) : '—';
}

export function formatClientName(user?: IUserData): string {
  if (!user) return '—';
  const name = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim();
  return name || user.email || '—';
}

export function formatVenueAddress(venue: IVenueBooking['venue']): string {
  if (!venue) return '—';
  const parts = [venue.address, venue.postalCode, venue.city, venue.country].filter(Boolean);
  return parts.join(', ') || '—';
}

export function getPaymentStatusLabel(booking: IVenueBooking): string {
  switch (booking.paymentStatus) {
    case 'paid':
      return 'Payée';
    case 'refunded':
      return 'Remboursée';
    case 'refund_pending':
      return 'Remboursement en cours';
    default:
      return booking.status === 'CONFIRMED' ? 'Confirmée' : '—';
  }
}
