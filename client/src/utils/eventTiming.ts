/**
 * Miroir client de `server/src/utils/eventTiming.ts` — MÊME règle de timing,
 * pour que le front ne réinvente pas une définition de « passé / à venir » qui
 * diverge du serveur (cause racine des écarts onglets/statuts).
 *
 * Règle :
 *   1. `endDate` fourni  → fin réelle (évènement multi-jours).
 *   2. sinon `date` (jour) + `endTime`, passage minuit si `endTime <= startTime`.
 *   3. sinon fin de journée (23:59:59.999).
 */

export interface EventTimingFields {
  date?: string | Date | null;
  startTime?: string | null;
  endTime?: string | null;
  endDate?: string | Date | null;
}

export function computeEventEnd(event: EventTimingFields): Date {
  // Jour de fin : `endDate` s'il est fourni (jour déjà matérialisé, passage minuit
  // encodé côté formulaire) — sinon le jour de `date`, avec bascule +1 jour si
  // `endTime <= startTime` (passage minuit d'un évènement mono-jour).
  const endDay = event.endDate ? new Date(event.endDate as string | Date) : new Date(event.date as string | Date);
  const y = endDay.getFullYear();
  const mo = endDay.getMonth();
  let d = endDay.getDate();

  if (event.endTime) {
    const [eh, em] = event.endTime.split(':').map(Number);
    if (!event.endDate && event.startTime) {
      const [sh, sm] = event.startTime.split(':').map(Number);
      if (eh * 60 + em <= sh * 60 + sm) d = d + 1;
    }
    return new Date(y, mo, d, eh, em, 0, 0);
  }

  return new Date(y, mo, d, 23, 59, 59, 999);
}

export function isEventPast(event: EventTimingFields | null | undefined, now: Date = new Date()): boolean {
  if (!event?.date) return false;
  return now.getTime() > computeEventEnd(event).getTime();
}

export function isEventUpcoming(event: EventTimingFields | null | undefined, now: Date = new Date()): boolean {
  if (!event?.date) return false;
  return !isEventPast(event, now);
}
