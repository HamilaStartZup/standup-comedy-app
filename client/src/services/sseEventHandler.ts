import { QueryClient } from '@tanstack/react-query';
import type { SSEEvent } from '../hooks/useSSE';

/**
 * Handler pour les évènements SSE
 * Mappe les types d'évènements aux clés de cache React Query à invalider
 *
 * @param queryClient - Instance du QueryClient React Query
 * @param event - Évènement SSE reçu
 */
export const handleSSEEvent = (queryClient: QueryClient, event: SSEEvent): void => {
  console.log(`🔄 [SSE Handler] Traitement de l'évènement: ${event.type}`, event.data);

  switch (event.type) {
    // === ÉVÈNEMENTS ===
    case 'EVENT_CREATED':
      console.log('📅 [SSE] Nouvel évènement créé');
      queryClient.invalidateQueries({ queryKey: ['events'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['events', 'stats'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['notifications'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['recommendations'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['smartRecommendations'], exact: false });
      break;

    case 'EVENT_UPDATED':
      console.log('📅 [SSE] Évènement mis à jour:', event.data.id);
      queryClient.invalidateQueries({ queryKey: ['events'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['events', 'stats'], exact: false });
      if (event.data.id) {
        queryClient.invalidateQueries({ queryKey: ['event', event.data.id], exact: false });
      }
      queryClient.invalidateQueries({ queryKey: ['recommendations'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['smartRecommendations'], exact: false });
      break;

    case 'EVENT_DELETED':
      console.log('🗑️ [SSE] Évènement supprimé:', event.data.id);
      queryClient.invalidateQueries({ queryKey: ['events'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['events', 'stats'], exact: false });
      if (event.data.id) {
        queryClient.removeQueries({ queryKey: ['event', event.data.id] });
      }
      queryClient.invalidateQueries({ queryKey: ['recommendations'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['smartRecommendations'], exact: false });
      break;

    case 'EVENT_COMPLETED':
      console.log('✅ [SSE] Évènement complété:', event.data.id);
      queryClient.invalidateQueries({ queryKey: ['events'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['events', 'stats'], exact: false });
      if (event.data.id) {
        queryClient.invalidateQueries({ queryKey: ['event', event.data.id], exact: false });
      }
      queryClient.invalidateQueries({ queryKey: ['recommendations'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['smartRecommendations'], exact: false });
      break;

    // === CANDIDATURES ===
    case 'APPLICATION_CREATED':
      console.log('📝 [SSE] Nouvelle candidature:', event.data.id);
      queryClient.invalidateQueries({ queryKey: ['applications'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['comedianApplications'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['events'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['events', 'stats'], exact: false });
      if (event.data.eventId) {
        queryClient.invalidateQueries({ queryKey: ['event', event.data.eventId], exact: false });
      }
      queryClient.invalidateQueries({ queryKey: ['recommendations'], exact: false });
      break;

    case 'APPLICATION_STATUS_CHANGED':
      console.log('🔄 [SSE] Statut de candidature changé:', event.data.id, event.data.status);
      queryClient.invalidateQueries({ queryKey: ['applications'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['comedianApplications'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['events'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['events', 'stats'], exact: false });
      if (event.data.eventId) {
        queryClient.invalidateQueries({ queryKey: ['event', event.data.eventId], exact: false });
      }
      queryClient.invalidateQueries({ queryKey: ['smartRecommendations'], exact: false });
      break;

    case 'APPLICATION_WITHDRAWN':
      console.log('❌ [SSE] Candidature retirée:', event.data.id);
      queryClient.invalidateQueries({ queryKey: ['applications'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['comedianApplications'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['events'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['events', 'stats'], exact: false });
      if (event.data.eventId) {
        queryClient.invalidateQueries({ queryKey: ['event', event.data.eventId], exact: false });
      }
      queryClient.invalidateQueries({ queryKey: ['smartRecommendations'], exact: false });
      break;

    // === ABSENCES ===
    case 'ABSENCE_MARKED':
      console.log('⚠️ [SSE] Absence marquée:', event.data.eventId, event.data.comedianId);
      queryClient.invalidateQueries({ queryKey: ['absences'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['event-absences'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['events'], exact: false });
      if (event.data.eventId) {
        queryClient.invalidateQueries({ queryKey: ['event', event.data.eventId], exact: false });
      }
      break;

    case 'ABSENCE_CANCELLED':
      console.log('✅ [SSE] Absence annulée:', event.data.eventId, event.data.comedianId);
      queryClient.invalidateQueries({ queryKey: ['absences'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['event-absences'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['events'], exact: false });
      if (event.data.eventId) {
        queryClient.invalidateQueries({ queryKey: ['event', event.data.eventId], exact: false });
      }
      break;

    // === FAVORIS COMÉDIENS ===
    case 'FAVORITE_COMEDIAN_ADDED':
      console.log('⭐ [SSE] Comédien ajouté aux favoris:', event.data.comedianId);
      queryClient.invalidateQueries({ queryKey: ['favorites'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['organizerFavorites'], exact: false });
      break;

    case 'FAVORITE_COMEDIAN_REMOVED':
      console.log('⭐ [SSE] Comédien retiré des favoris:', event.data.comedianId);
      queryClient.invalidateQueries({ queryKey: ['favorites'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['organizerFavorites'], exact: false });
      break;

    // === FAVORIS ÉVÈNEMENTS ===
    case 'EVENT_FAVORITE_ADDED':
      console.log('⭐ [SSE] Évènement ajouté aux favoris:', event.data.eventId);
      queryClient.invalidateQueries({ queryKey: ['event-favorites'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['eventFavorites'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['events'], exact: false });
      break;

    case 'EVENT_FAVORITE_REMOVED':
      console.log('⭐ [SSE] Évènement retiré des favoris:', event.data.eventId);
      queryClient.invalidateQueries({ queryKey: ['event-favorites'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['eventFavorites'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['events'], exact: false });
      break;

    // === PROFILS & UTILISATEURS ===
    case 'PROFILE_UPDATED':
      console.log('👤 [SSE] Profil mis à jour:', event.data.userId);
      queryClient.invalidateQueries({ queryKey: ['profile'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['user'], exact: false });
      if (event.data.userId) {
        queryClient.invalidateQueries({ queryKey: ['user', event.data.userId], exact: false });
      }
      queryClient.invalidateQueries({ queryKey: ['recommendations'], exact: false });
      break;

    case 'USER_REGISTERED':
      console.log('🆕 [SSE] Nouvel utilisateur enregistré:', event.data.userId);
      queryClient.invalidateQueries({ queryKey: ['users'], exact: false });
      break;

    case 'PASSWORD_RESET':
      console.log('🔐 [SSE] Mot de passe réinitialisé:', event.data.userId);
      queryClient.invalidateQueries({ queryKey: ['user'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['password-reset-requests'], exact: false });
      if (event.data.userId) {
        queryClient.invalidateQueries({ queryKey: ['user', event.data.userId], exact: false });
      }
      break;

    // === RÉSERVATIONS DE SALLES ===
    case 'VENUE_BOOKING_STATUS_CHANGED':
      console.log('🏢 [SSE] Statut de réservation salle modifié:', event.data.id, event.data.status);
      queryClient.invalidateQueries({ queryKey: ['my-bookings'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['venue-owner-bookings'], exact: false });
      if (event.data.venueId) {
        queryClient.invalidateQueries({ queryKey: ['venue-bookings', event.data.venueId], exact: false });
        queryClient.invalidateQueries({ queryKey: ['venue', event.data.venueId], exact: false });
        queryClient.invalidateQueries({ queryKey: ['blocked-dates', event.data.venueId], exact: false });
      }
      queryClient.invalidateQueries({ queryKey: ['notifications'], exact: false });
      break;

    case 'VENUE_BOOKING_PAYMENT_UPDATED':
      console.log('💳 [SSE] Paiement réservation salle mis à jour:', event.data.id, event.data.paymentStatus);
      queryClient.invalidateQueries({ queryKey: ['my-bookings'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['venue-owner-bookings'], exact: false });
      if (event.data.venueId) {
        queryClient.invalidateQueries({ queryKey: ['venue-bookings', event.data.venueId], exact: false });
        queryClient.invalidateQueries({ queryKey: ['venue', event.data.venueId], exact: false });
      }
      queryClient.invalidateQueries({ queryKey: ['notifications'], exact: false });
      break;

    // === NOTIFICATIONS ===
    case 'NOTIFICATION_CREATED':
      console.log('🔔 [SSE] Notification créée:', event.data.notificationId);
      queryClient.invalidateQueries({ queryKey: ['notifications'], exact: false });
      break;

    case 'NOTIFICATION_READ':
      console.log('✅ [SSE] Notification lue:', event.data.notificationId);
      queryClient.invalidateQueries({ queryKey: ['notifications'], exact: false });
      break;

    case 'NOTIFICATION_ALL_READ':
      console.log('✅ [SSE] Toutes les notifications lues:', event.data.userId);
      queryClient.invalidateQueries({ queryKey: ['notifications'], exact: false });
      break;

    // === SALLES ===
    case 'VENUE_CREATED':
      console.log('🏢 [SSE] Salle créée:', event.data.venueId);
      queryClient.invalidateQueries({ queryKey: ['venues'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['my-venues'], exact: false });
      break;

    case 'VENUE_UPDATED':
      console.log('🏢 [SSE] Salle mise à jour:', event.data.venueId);
      queryClient.invalidateQueries({ queryKey: ['venues'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['my-venues'], exact: false });
      if (event.data.venueId) {
        queryClient.invalidateQueries({ queryKey: ['venue', event.data.venueId], exact: false });
      }
      break;

    case 'VENUE_DELETED':
      console.log('🗑️ [SSE] Salle supprimée:', event.data.venueId);
      queryClient.invalidateQueries({ queryKey: ['venues'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['my-venues'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['venue-owner-bookings'], exact: false });
      if (event.data.venueId) {
        queryClient.cancelQueries({ queryKey: ['venue', event.data.venueId] });
        queryClient.removeQueries({ queryKey: ['venue', event.data.venueId] });
        queryClient.removeQueries({ queryKey: ['venue-bookings', event.data.venueId] });
        queryClient.removeQueries({ queryKey: ['my-venue-bookings', event.data.venueId] });
      }
      queryClient.invalidateQueries({ queryKey: ['my-bookings'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['notifications'], exact: false });
      break;

    // === SIGNALEMENTS COMÉDIENS ===
    case 'COMEDIAN_REPORT_CREATED':
      console.log('🚨 [SSE] Signalement comédien créé:', event.data.reportId);
      queryClient.invalidateQueries({ queryKey: ['comedian-reports'], exact: false });
      break;

    case 'COMEDIAN_REPORT_UPDATED':
      console.log('🚨 [SSE] Signalement comédien mis à jour:', event.data.reportId);
      queryClient.invalidateQueries({ queryKey: ['comedian-reports'], exact: false });
      break;

    // === SPECTATEURS ===
    case 'SPECTATOR_REGISTERED':
      console.log('🎟️ [SSE] Spectateur inscrit:', event.data.eventId, event.data.userId);
      queryClient.invalidateQueries({ queryKey: ['events'], exact: false });
      if (event.data.eventId) {
        queryClient.invalidateQueries({ queryKey: ['event', event.data.eventId], exact: false });
        queryClient.invalidateQueries({ queryKey: ['spectators', event.data.eventId], exact: false });
      }
      break;

    case 'SPECTATOR_UNREGISTERED':
      console.log('🎟️ [SSE] Spectateur désinscrit:', event.data.eventId, event.data.userId);
      queryClient.invalidateQueries({ queryKey: ['events'], exact: false });
      if (event.data.eventId) {
        queryClient.invalidateQueries({ queryKey: ['event', event.data.eventId], exact: false });
        queryClient.invalidateQueries({ queryKey: ['spectators', event.data.eventId], exact: false });
      }
      break;

    case 'SPECTATOR_RATING_SUBMITTED':
      console.log('⭐ [SSE] Notation spectateur soumise:', event.data.eventId);
      if (event.data.eventId) {
        queryClient.invalidateQueries({ queryKey: ['event-ratings', event.data.eventId], exact: false });
        queryClient.invalidateQueries({ queryKey: ['ratings-summary', event.data.eventId], exact: false });
      }
      break;

    // === FAVORIS CANDIDATURES ===
    case 'APPLICATION_FAVORITE_ADDED':
      console.log('⭐ [SSE] Candidature ajoutée aux favoris:', event.data.applicationId);
      queryClient.invalidateQueries({ queryKey: ['favorite-applications'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['applicationFavorites'], exact: false });
      break;

    case 'APPLICATION_FAVORITE_REMOVED':
      console.log('⭐ [SSE] Candidature retirée des favoris:', event.data.applicationId);
      queryClient.invalidateQueries({ queryKey: ['favorite-applications'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['applicationFavorites'], exact: false });
      break;

    // === ANNULATION TARDIVE ===
    case 'LATE_CANCELLATION':
      console.log('⏰ [SSE] Annulation tardive:', event.data.eventId);
      queryClient.invalidateQueries({ queryKey: ['applications'], exact: false });
      if (event.data.eventId) {
        queryClient.invalidateQueries({ queryKey: ['event', event.data.eventId], exact: false });
      }
      break;

    // === ALERTES ===
    case 'PRESENCE_ALERT_ACKNOWLEDGED':
      console.log('✅ [SSE] Alerte de présence acquittée:', event.data.alertId);
      queryClient.invalidateQueries({ queryKey: ['presence-alerts'], exact: false });
      break;

    case 'LATE_CANCELLATION_ALERT_ACKNOWLEDGED':
      console.log('✅ [SSE] Alerte annulation tardive acquittée:', event.data.alertId);
      queryClient.invalidateQueries({ queryKey: ['late-cancellation-alerts'], exact: false });
      break;

    // === ÉVÈNEMENT DE CONNEXION ===
    case 'CONNECTED':
      console.log('🔌 [SSE] Connexion SSE établie');
      // Rafraîchir toutes les données au moment de la connexion
      queryClient.invalidateQueries();
      break;

    default:
      console.warn(`⚠️ [SSE Handler] Type d'évènement non géré: ${event.type}`);
  }
};

/**
 * Crée une fonction handler pré-configurée avec le queryClient
 * @param queryClient - Instance du QueryClient
 * @returns Fonction handler pour les évènements SSE
 */
export const createSSEEventHandler = (queryClient: QueryClient) => {
  return (event: SSEEvent) => handleSSEEvent(queryClient, event);
};
