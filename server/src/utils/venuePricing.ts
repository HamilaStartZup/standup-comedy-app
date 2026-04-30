export type PricingType =
  | 'heure'
  | 'demi_journee'
  | 'journee'
  | 'soiree'
  | 'forfait'
  | 'pourcentage_billetterie'
  | 'gratuit';

export interface BookingAmountResult {
  amount: number;
  baseAmount: number;
  requiresPayment: boolean;
  needsSlot: boolean;
}

function toMin(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

export function computeBookingAmount(
  venue: {
    pricePerEvent: number;
    pricingType?: PricingType;
    deposit?: number;
    extraFees?: { description: string; amount: number }[];
  },
  booking: { startTime?: string; endTime?: string }
): BookingAmountResult {
  const { pricePerEvent, pricingType } = venue;
  const depositAmount = venue.deposit ?? 0;
  const extraFeesTotal = (venue.extraFees ?? []).reduce((sum, f) => sum + (f.amount || 0), 0);

  switch (pricingType) {
    case 'heure': {
      const start = booking.startTime ?? '00:00';
      const end = booking.endTime ?? '01:00';
      const hours = Math.ceil(Math.max(1, (toMin(end) - toMin(start)) / 60));
      const baseAmount = hours * pricePerEvent;
      return { amount: baseAmount + depositAmount + extraFeesTotal, baseAmount, requiresPayment: true, needsSlot: true };
    }
    case 'demi_journee': {
      const baseAmount = pricePerEvent;
      return { amount: baseAmount + depositAmount + extraFeesTotal, baseAmount, requiresPayment: true, needsSlot: true };
    }
    case 'journee': {
      const baseAmount = pricePerEvent;
      return { amount: baseAmount + depositAmount + extraFeesTotal, baseAmount, requiresPayment: true, needsSlot: false };
    }
    case 'soiree': {
      const baseAmount = pricePerEvent;
      return { amount: baseAmount + depositAmount + extraFeesTotal, baseAmount, requiresPayment: true, needsSlot: false };
    }
    case 'forfait': {
      const baseAmount = pricePerEvent;
      return { amount: baseAmount + depositAmount + extraFeesTotal, baseAmount, requiresPayment: true, needsSlot: false };
    }
    case 'gratuit':
      return { amount: 0, baseAmount: 0, requiresPayment: false, needsSlot: false };
    case 'pourcentage_billetterie':
      return { amount: 0, baseAmount: 0, requiresPayment: false, needsSlot: false };
    default: {
      const baseAmount = pricePerEvent;
      const total = baseAmount + depositAmount + extraFeesTotal;
      return {
        amount: total,
        baseAmount,
        requiresPayment: pricePerEvent > 0,
        needsSlot: true,
      };
    }
  }
}
