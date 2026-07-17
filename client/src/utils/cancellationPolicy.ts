export interface RefundEstimate {
  refundAmount: number;
  refundPercent: 0 | 50 | 100;
  reason: 'grace_period' | 'full_refund' | 'partial_refund' | 'no_refund';
}

// Le calcul du remboursement vit uniquement côté backend (calculateRefundAmount) :
// l'estimation affichée vient de GET /venues/bookings/:id/refund-estimate, plus de
// miroir local à maintenir (dérive de règle métier et de fuseau impossible).

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