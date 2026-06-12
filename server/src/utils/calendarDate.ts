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
