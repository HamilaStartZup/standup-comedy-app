export interface InvoicePriceLine {
  label: string;
  amount: number;
  note?: string;
}

export interface InvoicePriceBreakdown {
  lines: InvoicePriceLine[];
  subtotal: number;
}

export interface InvoiceVenueInput {
  pricingType?: 'heure' | 'demi_journee' | 'journee' | 'soiree' | 'forfait' | 'pourcentage_billetterie' | 'gratuit';
  pricePerEvent: number;
  currency?: string;
  deposit?: number;
  extraFees?: { description: string; amount?: number }[];
}

export interface InvoiceBookingInput {
  startTime: string;
  endTime: string;
  paidAmount?: number;
}

function toMin(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

export function formatInvoiceNumber(bookingId: string): string {
  return `CCC-${bookingId.slice(-8).toUpperCase()}`;
}

export function formatGroupInvoiceNumber(groupId: string): string {
  return `CCC-SER-${groupId.slice(-8).toUpperCase()}`;
}

/** Détail location / caution / frais — parité avec client/src/utils/venueInvoice.ts. */
export function getBookingPriceBreakdown(venue: InvoiceVenueInput, booking: InvoiceBookingInput): InvoicePriceBreakdown {
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
