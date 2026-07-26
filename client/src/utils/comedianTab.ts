/**
 * CLASSIFIEUR UNIQUE des onglets humoriste (miroir du serveur, getAllApplications).
 * Chaque candidature a exactement UN foyer, fonction de (statut × soirée annulée ? × passé ?).
 * Garantit : aucun doublon, aucun orphelin, compteur == liste.
 */
import { isEventPast, EventTimingFields } from './eventTiming';

export type ComedianTab = 'accepted' | 'pending' | 'rejected' | 'archived' | 'cancelled';

// Statuts « à enjeu » : j'étais encore en jeu au moment de l'annulation → "Annulées".
const ENJEU_STATUSES = ['PENDING', 'ACCEPTED', 'CANCELLED_BY_PLATFORM'];

export interface ClassifiableApplication {
  status: string;
  event?: (EventTimingFields & { status?: string }) | null;
}

export function comedianTabOf(app: ClassifiableApplication, now: Date = new Date()): ComedianTab | null {
  const event = app.event;
  if (!event?.date) return null;
  const cancelled = event.status === 'cancelled' || event.status === 'CANCELLED';
  const s = app.status;

  if (cancelled && ENJEU_STATUSES.includes(s)) return 'cancelled';
  if (s === 'PENDING') return 'pending';                              // soirée non annulée, visible jusqu'à expiration cron
  if (s === 'ACCEPTED') return isEventPast(event, now) ? 'archived' : 'accepted';
  if (s === 'REJECTED') return isEventPast(event, now) ? 'archived' : 'rejected';
  return 'archived';                                                  // EXPIRED / WITHDRAWN / CBP (soirée non annulée)
}
