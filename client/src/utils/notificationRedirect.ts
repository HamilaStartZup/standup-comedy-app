export type NotificationType =
  | 'new_application'
  | 'application_accepted'
  | 'application_rejected'
  | 'event_updated'
  | 'absence_marked'
  | 'event_cancelled'
  | 'event_deleted'
  | 'new_event'
  | 'venue_booking_request'
  | 'venue_booking_response'
  | 'venue_booking_cancelled_by_owner'
  | 'venue_booking_cancelled_by_requester'
  | 'venue_date_blocked'
  | 'venue_booking_payment_required'
  | 'venue_booking_confirmed'
  | 'venue_booking_payment_reminder'
  | 'venue_booking_payment_expired'
  | 'venue_booking_refunded'
  | 'venue_deleted_refund'
  | 'late_cancellation_comedian'
  | 'late_cancellation_organizer';

export type UserRole = 'ORGANIZER' | 'COMEDIAN' | 'SPECTATOR' | 'LIEU' | 'SUPER_ADMIN' | undefined;

export interface NotificationForRedirect {
  type: NotificationType;
  relatedEvent?: { _id: string };
  relatedApplication?: { _id: string };
  relatedVenue?: { _id: string };
  relatedBooking?: { _id: string };
}

/**
 * Résultat d'une redirection de notification.
 * - path présent → naviguer vers cette URL
 * - toast présent → afficher un toast informatif (pas de navigation)
 */
export type RedirectResult =
  | { path: string; toast?: never }
  | { path?: never; toast: string };

function buildUrl(path: string, params: Record<string, string | undefined>): string {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') {
      sp.set(key, value);
    }
  }
  const query = sp.toString();
  return query ? `${path}?${query}` : path;
}

export function getRedirectPath(
  notification: NotificationForRedirect,
  role: UserRole
): RedirectResult {
  const eventId = notification.relatedEvent?._id;
  const appId = notification.relatedApplication?._id;
  const bookingId = notification.relatedBooking?._id;

  switch (notification.type) {
    // ── SPECTATEUR ──────────────────────────────────────────────────────────
    case 'new_event':
      return { path: buildUrl('/spectateur', { focus: eventId }) };

    case 'event_updated':
      if (role === 'SPECTATOR') {
        return { path: buildUrl('/spectateur/events', { tab: 'inscrits', focus: eventId }) };
      }
      if (role === 'COMEDIAN') {
        // Pas de tab forcé : auto-switch selon status de la candidature (géré dans ApplicationsPage)
        return { path: buildUrl('/applications', { applicationId: appId }) };
      }
      return { path: '/events' };

    case 'event_cancelled':
      if (role === 'SPECTATOR') {
        return { path: buildUrl('/spectateur/events', { tab: 'annules', focus: eventId }) };
      }
      if (role === 'COMEDIAN') {
        return { path: buildUrl('/applications', { tab: 'cancelled', applicationId: appId }) };
      }
      return { path: '/events' };

    case 'event_deleted':
      // Spectateur : l'event n'existe plus → pas de navigation, juste un toast
      return { toast: 'Cet événement a été supprimé par l\'organisateur.' };

    // ── COMÉDIEN ─────────────────────────────────────────────────────────────
    case 'application_accepted':
      return { path: buildUrl('/applications', { tab: 'accepted', applicationId: appId }) };

    case 'application_rejected':
      return { path: buildUrl('/applications', { tab: 'rejected', applicationId: appId }) };

    case 'late_cancellation_comedian':
      // Confirmation de désistement : pas de navigation, juste un toast
      return { toast: 'Votre désistement a bien été enregistré.' };

    // ── ORGANISATEUR / LIEU ──────────────────────────────────────────────────
    case 'new_application':
      return { path: buildUrl('/events', { focus: eventId }) };

    case 'late_cancellation_organizer':
      return { path: buildUrl('/events', { focus: eventId }) };

    // ── VENUE BOOKINGS ───────────────────────────────────────────────────────
    // Notifs destinées au propriétaire (LIEU)
    case 'venue_booking_request':
    case 'venue_booking_cancelled_by_requester':
      return { path: buildUrl('/my-venues-management', { tab: 'reservations', bookingId }) };

    // Notifs à double destinataire selon rôle
    case 'venue_booking_confirmed':
    case 'venue_booking_payment_expired':
      if (role === 'LIEU') {
        return { path: buildUrl('/my-venues-management', { tab: 'reservations', bookingId }) };
      }
      return { path: buildUrl('/my-bookings', { bookingId }) };

    // Notifs destinées au requester (ORGANIZER)
    case 'venue_booking_response':
    case 'venue_booking_payment_required':
    case 'venue_booking_payment_reminder':
    case 'venue_booking_refunded':
    case 'venue_deleted_refund':
    case 'venue_booking_cancelled_by_owner':
    case 'venue_date_blocked':
      return { path: buildUrl('/my-bookings', { bookingId }) };

    case 'absence_marked':
    // Type legacy : jamais émis côté serveur. Fallback générique.
    default:
      return { path: '/dashboard' };
  }
}
