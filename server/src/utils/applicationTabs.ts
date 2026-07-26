/**
 * Classifieur d'onglets humoriste, exprimé en étapes d'agrégation MongoDB.
 * SOURCE UNIQUE côté serveur : la liste (getAllApplications) ET les compteurs
 * (getApplicationTabCounts) consomment ces mêmes étapes → impossible de diverger.
 * Miroir EXACT de `comedianTabOf` (client/src/utils/comedianTab.ts).
 *
 * Suppose des documents post-`$lookup` event avec :
 *   - `status`            : statut de la candidature,
 *   - `eventDoc[0].status`: statut de la soirée (annulée ?),
 *   - `_eventEnd`         : fin réelle (buildEventEndExpr), pour le test "passé".
 */

export const COMEDIAN_TABS = ['accepted', 'pending', 'rejected', 'archived', 'cancelled'] as const;
export type ComedianTab = typeof COMEDIAN_TABS[number];

const CANCELLED_EVENT = ['cancelled', 'CANCELLED'];
// Statuts « à enjeu » : encore en jeu au moment de l'annulation → foyer "Annulées".
const ENJEU = ['PENDING', 'ACCEPTED', 'CANCELLED_BY_PLATFORM'];

export function isComedianTab(v: unknown): v is ComedianTab {
  return typeof v === 'string' && (COMEDIAN_TABS as readonly string[]).includes(v);
}

/**
 * Étape(s) `$match` isolant l'unique foyer d'un onglet humoriste.
 * `$$NOW` = instant serveur ; à exécuter dans un pipeline d'agrégation.
 */
export function comedianTabMatchStages(tab: ComedianTab): Record<string, unknown>[] {
  const eventStatus = { $arrayElemAt: ['$eventDoc.status', 0] };
  const cancelledEvent = { $in: [eventStatus, CANCELLED_EVENT] };
  const isPast = { $lt: ['$_eventEnd', '$$NOW'] };

  let expr: Record<string, unknown>;
  switch (tab) {
    case 'pending':
      // PENDING sur soirée non annulée (sans filtre temporel : visible jusqu'au cron).
      expr = { $and: [{ $eq: ['$status', 'PENDING'] }, { $not: [cancelledEvent] }] };
      break;
    case 'accepted':
      // ACCEPTED, soirée non annulée, à venir.
      expr = { $and: [{ $eq: ['$status', 'ACCEPTED'] }, { $not: [cancelledEvent] }, { $not: [isPast] }] };
      break;
    case 'rejected':
      // REJECTED à venir (un refus sur soirée passée bascule en "Archivées").
      expr = { $and: [{ $eq: ['$status', 'REJECTED'] }, { $not: [isPast] }] };
      break;
    case 'cancelled':
      // Soirée annulée ET candidature encore à enjeu au moment de l'annulation.
      expr = { $and: [cancelledEvent, { $in: ['$status', ENJEU] }] };
      break;
    case 'archived':
      // Tout le reste : dénouements terminaux, ou ACCEPTED/REJECTED une fois la
      // soirée passée — sauf ce qui part en "Annulées" (soirée annulée + enjeu).
      expr = { $and: [
        { $not: [{ $and: [cancelledEvent, { $in: ['$status', ['ACCEPTED', 'CANCELLED_BY_PLATFORM']] }] }] },
        { $or: [
          { $in: ['$status', ['EXPIRED', 'WITHDRAWN', 'CANCELLED_BY_PLATFORM']] },
          { $and: [{ $in: ['$status', ['ACCEPTED', 'REJECTED']] }, isPast] },
        ] },
      ] };
      break;
  }
  return [{ $match: { $expr: expr } }];
}
