import type { CancellationPolicy } from '../types/venue';

export interface RefundEstimate {
  refundAmount: number;
  refundPercent: 0 | 50 | 100;
  reason: 'grace_period' | 'full_refund' | 'partial_refund' | 'no_refund';
}

/**
 * Calcule le montant remboursé selon la politique d'annulation de la salle.
 * Miroir exact de la fonction backend calculateRefundAmount().
 */
export function calculateRefundEstimate(
  paidAmount: number,
  policy: CancellationPolicy,
  eventDatetime: Date,
  bookingCreatedAt: Date,
  cancellationTime: Date = new Date()
): RefundEstimate {
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

/** Retourne un message lisible pour l'utilisateur sur le remboursement attendu. */
export function formatRefundMessage(estimate: RefundEstimate, paidAmount: number): string {
  if (estimate.refundPercent === 100) {
    return `Vous serez remboursé(e) intégralement : ${paidAmount.toFixed(2)}€`;
  }
  if (estimate.refundPercent === 50) {
    return `Vous serez remboursé(e) à 50% : ${estimate.refundAmount.toFixed(2)}€`;
  }
  return 'Cette annulation n\'est pas remboursable.';
}

/** Retourne la raison du remboursement en texte clair. */
export function formatRefundReason(reason: RefundEstimate['reason']): string {
  switch (reason) {
    case 'grace_period': return 'Période de grâce (réservation effectuée il y a moins de 24h)';
    case 'full_refund': return 'Annulation dans les délais de la politique';
    case 'partial_refund': return 'Annulation partielle selon la politique de la salle';
    case 'no_refund': return 'Annulation hors délai — aucun remboursement';
  }
}
