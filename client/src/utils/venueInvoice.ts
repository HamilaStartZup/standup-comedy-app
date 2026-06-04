import type { IVenueBooking } from '../types/venue';
import type { IUserData } from '../types/user';

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
  return 0;
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
