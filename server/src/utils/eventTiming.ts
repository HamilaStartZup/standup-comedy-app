/**
 * Source de vérité UNIQUE du timing d'un évènement : « quand se termine-t-il
 * réellement, et est-il passé ? ». Remplace les 6 définitions concurrentes qui
 * divergeaient entre les contrôleurs, le cron et les pages front.
 *
 * Règle (identique en JS et dans le miroir client `client/src/utils/eventTiming.ts`) :
 *   1. `endDate` fourni  → c'est la fin réelle (festival / évènement multi-jours).
 *   2. sinon `date` (jour calendaire) + `endTime`, avec passage minuit : si
 *      `endTime <= startTime`, la fin est le lendemain (ex. 22h → 01h).
 *   3. sinon fin de journée (23:59:59.999).
 *
 * `buildEventEndExpr` produit la MÊME règle sous forme d'expression d'agrégation
 * MongoDB, pour filtrer par `timeScope` au niveau DB (pagination correcte) sans
 * dupliquer la logique.
 *
 * ponytail: le calcul JS utilise le fuseau local du serveur ; les pipelines Mongo
 * épinglent Europe/Paris. Sur un VPS réglé sur Europe/Paris (cas nominal, app FR)
 * les deux coïncident. Si le VPS tourne en UTC, passer ce calcul JS en TZ-aware.
 */

export interface EventTimingFields {
  date: Date | string;
  startTime?: string | null;
  endTime?: string | null;
  endDate?: Date | string | null;
}

export function computeEventEnd(event: EventTimingFields): Date {
  // Jour de fin : `endDate` s'il est fourni (le jour est déjà matérialisé, y compris
  // le passage minuit encodé côté formulaire) — sinon le jour de `date`, avec bascule
  // +1 jour si `endTime <= startTime` (passage minuit d'un évènement mono-jour).
  const endDay = event.endDate ? new Date(event.endDate) : new Date(event.date);
  const y = endDay.getFullYear();
  const mo = endDay.getMonth();
  let d = endDay.getDate();

  if (event.endTime) {
    const [eh, em] = event.endTime.split(':').map(Number);
    // Rollover uniquement quand le jour de fin n'est PAS donné explicitement par endDate.
    if (!event.endDate && event.startTime) {
      const [sh, sm] = event.startTime.split(':').map(Number);
      if (eh * 60 + em <= sh * 60 + sm) d = d + 1; // new Date gère le débordement de mois
    }
    return new Date(y, mo, d, eh, em, 0, 0);
  }

  return new Date(y, mo, d, 23, 59, 59, 999);
}

export function isEventPast(event: EventTimingFields, now: Date = new Date()): boolean {
  return now.getTime() > computeEventEnd(event).getTime();
}

const TZ = 'Europe/Paris';
type Expr = unknown;

/**
 * Même règle que `computeEventEnd`, en expression d'agrégation MongoDB.
 * `refs` = expressions pointant vers les champs (`'$date'`, ou `{ $arrayElemAt: [...] }`
 * après un `$lookup`). Retourne une Date (ou null si `date` invalide, comme avant).
 */
export function buildEventEndExpr(refs: {
  date: Expr;
  endDate: Expr;
  endTime: Expr;
  startTime: Expr;
}): Record<string, unknown> {
  // Instant de fin = <jour> à <endTime> (ou 23:59 si endTime absent), en TZ Paris.
  const endAtDay = (dayExpr: Expr) => ({
    $dateFromString: {
      dateString: {
        $concat: [
          { $dateToString: { date: dayExpr, format: '%Y-%m-%dT', timezone: TZ } },
          { $ifNull: [refs.endTime, '23:59'] },
          ':00',
        ],
      },
      timezone: TZ,
      onError: null,
    },
  });

  const baseDay = { $convert: { input: refs.date, to: 'date', onError: new Date(0), onNull: new Date(0) } };
  const endDay = { $convert: { input: refs.endDate, to: 'date', onError: null, onNull: null } };

  // Passage minuit (mono-jour) : endTime <= startTime → jour de fin = lendemain civil.
  // ponytail: comparaison lexicographique des HH:MM zero-paddés (sortie native de
  // <input type="time">). Si des heures non paddées ('9:00') apparaissent en base,
  // basculer en comparaison numérique.
  // $dateAdd unit:'day' fait un décalage CIVIL (DST-safe), pas +86_400_000 ms fixes.
  const nextDay = { $dateAdd: { startDate: baseDay, unit: 'day', amount: 1, timezone: TZ } };
  const withMidnight = {
    $cond: [
      {
        $and: [
          { $ne: [refs.startTime, null] },
          { $ne: [refs.endTime, null] },
          { $lte: [refs.endTime, refs.startTime] },
        ],
      },
      endAtDay(nextDay),
      endAtDay(baseDay),
    ],
  };

  // endDate fourni → le jour de fin est explicite ; on y applique endTime (pas de rollover).
  return {
    $cond: [
      { $ne: [endDay, null] },
      endAtDay(endDay),
      withMidnight,
    ],
  };
}
