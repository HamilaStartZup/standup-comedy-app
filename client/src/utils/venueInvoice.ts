import type { IVenueBooking, IInvoiceSnapshot } from '../types/venue';

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

export interface InvoiceSellerView {
  name: string;
  companyName?: string;
  address: string;
  siret?: string;
  representedBy?: string;
  contactEmail?: string;
}

export interface InvoiceBuyerView {
  name: string;
  companyName?: string;
  email?: string;
}

/** Vue normalisée d'une facture pour un booking : snapshot figé prioritaire, repli live seulement en son absence. */
export interface BookingInvoiceView {
  booking: IVenueBooking;
  hasSnapshot: boolean;
  seller: InvoiceSellerView;
  buyer: InvoiceBuyerView;
  lines: InvoicePriceLine[];
  subtotal: number;
  currency: string;
  statusLabel: string;
  pricingLabel: string;
}

export function getInvoiceViewStatusLabel(status: IInvoiceSnapshot['paymentStatus']): string {
  switch (status) {
    case 'paid':
      return 'Payée';
    case 'refunded':
      return 'Remboursée';
    case 'refund_pending':
      return 'Remboursement en cours';
    default:
      return '—';
  }
}

function joinAddress(parts: (string | undefined)[]): string {
  return parts.filter(Boolean).join(', ') || '—';
}

/**
 * Source de vérité unique pour l'affichage d'une facture. Le snapshot figé au paiement
 * gagne toujours (justificatif légal) ; le repli live ne sert que quand rien n'est figé
 * (cas légitime CONFIRMED non payé). Passe par cette vue interdit toute lecture directe
 * de `venue.*` / `requester` dans le composant → le bug de données périmées ne peut plus
 * être réintroduit champ par champ.
 */
export function getBookingInvoiceView(booking: IVenueBooking): BookingInvoiceView {
  const snap = booking.invoiceSnapshot;
  if (snap) {
    const s = snap.seller;
    const representedBy =
      s.contactName || `${s.ownerFirstName ?? ''} ${s.ownerLastName ?? ''}`.trim() || undefined;
    const buyerName =
      `${snap.buyer.firstName ?? ''} ${snap.buyer.lastName ?? ''}`.trim() || snap.buyer.email || '—';
    return {
      booking,
      hasSnapshot: true,
      seller: {
        name: s.venueName || '—',
        companyName: s.companyName,
        address: joinAddress([s.address, s.postalCode, s.city, s.country]),
        siret: s.siret,
        representedBy,
        contactEmail: s.contactEmail,
      },
      buyer: { name: buyerName, companyName: snap.buyer.companyName, email: snap.buyer.email },
      lines: snap.lines,
      subtotal: snap.subtotal,
      currency: snap.currency,
      statusLabel: getInvoiceViewStatusLabel(snap.paymentStatus),
      // Type de tarif figé prioritaire ; repli live seulement pour les vieux snapshots d'avant le backfill.
      pricingLabel: formatPricingLabel(snap.pricingType ?? booking.venue?.pricingType),
    };
  }

  // Repli live : aucun snapshot figé à contredire (CONFIRMED non payé).
  const venue = booking.venue;
  const requester = booking.requester;
  const breakdown = getBookingPriceBreakdown(booking);
  const buyerName = requester
    ? `${requester.firstName ?? ''} ${requester.lastName ?? ''}`.trim() || requester.email || '—'
    : '—';
  // Libellés des statuts figés délégués au helper (source unique) ; seul le cas non-figé
  // CONFIRMED (facture live pas encore payée) est spécifique au repli.
  const statusLabel =
    booking.paymentStatus === 'paid' ||
    booking.paymentStatus === 'refunded' ||
    booking.paymentStatus === 'refund_pending'
      ? getInvoiceViewStatusLabel(booking.paymentStatus)
      : booking.status === 'CONFIRMED'
        ? 'Confirmée'
        : '—';
  return {
    booking,
    hasSnapshot: false,
    seller: {
      name: venue?.name ?? '—',
      companyName: venue?.companyName,
      address: venue ? joinAddress([venue.address, venue.postalCode, venue.city, venue.country]) : '—',
      siret: venue?.siret,
      representedBy: venue?.contactName || undefined,
      contactEmail: venue?.contactEmail,
    },
    buyer: {
      name: buyerName,
      companyName: requester?.organizerProfile?.companyName,
      email: requester?.email,
    },
    lines: breakdown?.lines ?? [],
    subtotal: breakdown?.subtotal ?? booking.paidAmount ?? 0,
    currency: venue?.currency ?? 'EUR',
    statusLabel,
    pricingLabel: formatPricingLabel(venue?.pricingType),
  };
}
