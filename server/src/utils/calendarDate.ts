/**
 * Utilitaires de dates calendaires en UTC (ADR 0003).
 * `new Date("YYYY-MM-DD")` parse en minuit UTC mais est relu en heure locale sur le serveur,
 * ce qui donne un jour erroné en fuseau négatif. Ces fonctions garantissent un ancrage UTC strict.
 */

/** Parse une chaîne "YYYY-MM-DD" en Date minuit UTC. */
export function parseCalendarDate(s: string): Date {
  return new Date(`${s}T00:00:00Z`);
}

/** Retourne le jour de la semaine en UTC (0=dimanche … 6=samedi). */
export function calendarWeekday(s: string): number {
  return parseCalendarDate(s).getUTCDay();
}

/** Retourne true si la date "YYYY-MM-DD" est strictement dans le passé (comparaison date-only UTC). */
export function isCalendarDatePast(s: string, now: Date = new Date()): boolean {
  const dateUtcMs = parseCalendarDate(s).getTime();
  const todayUtcMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return dateUtcMs < todayUtcMs;
}

/** Décalage (ms) entre l'heure murale d'un fuseau IANA et UTC à un instant donné. */
function tzOffsetMs(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(at);
  const get = (type: string): number => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'));
  return asUtc - at.getTime();
}

/**
 * Instant réel d'un créneau de réservation : jour calendaire (Date minuit UTC,
 * cf. parseCalendarDate) + heure murale "HH:MM" interprétée dans le fuseau de
 * la salle. Standard des plateformes de réservation : les deadlines d'annulation
 * se calculent en heure locale du lieu — toutes les salles actuelles sont en
 * France, d'où le défaut Europe/Paris (passer venue.timezone le jour où l'app
 * s'exporte). Ne PAS poser l'heure murale via setUTCHours/setHours : ça décale
 * les seuils de 1-2h selon la saison et le fuseau du serveur.
 */
export function slotInstant(day: Date, time: string, timeZone = 'Europe/Paris'): Date {
  const [h, m] = (time ?? '').split(':').map(Number);
  const wallUtc = Date.UTC(
    day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(),
    Number.isFinite(h) ? h : 0, Number.isFinite(m) ? m : 0,
  );
  // 1re passe avec l'offset estimé au niveau de l'heure murale, 2e passe pour
  // les créneaux qui tombent près d'un changement d'heure.
  let instant = wallUtc - tzOffsetMs(new Date(wallUtc), timeZone);
  instant = wallUtc - tzOffsetMs(new Date(instant), timeZone);
  return new Date(instant);
}