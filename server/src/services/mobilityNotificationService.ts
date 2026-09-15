/**
 * Service de notification par mobilité
 * Envoie des emails à tous les humoristes abonnés lorsqu'un événement est publié
 * (aucun filtrage par zone de mobilité : tous les évènements créés sur la plateforme
 * sont notifiés à tous les humoristes abonnés aux emails)
 */

import { sendEventNotificationByMobility, sendRecurringEventNotificationByMobility } from './emailService';
import { UserModel } from '../models/User';
import { EventDocument } from '../models/Event';

/**
 * Résultat d'une notification par mobilité
 */
export interface MobilityNotificationResult {
  count: number;
  comedians: { _id: string; email: string }[];
}

/**
 * Notifie par email tous les humoristes abonnés d'un événement publié
 *
 * @param event - L'événement publié
 * @param organizer - Les infos de l'organisateur (optionnel)
 * @param excludeComedianIds - IDs des comédiens à exclure (ex: ceux qui ont déjà candidaté)
 * @returns Objet avec le nombre d'humoristes notifiés et leurs détails
 */
export const notifyComediansByMobility = async (
  event: EventDocument,
  organizer?: { firstName: string; lastName: string; email: string },
  excludeComedianIds?: string[]
): Promise<MobilityNotificationResult> => {
  try {
    // 1. Vérifier que l'événement a une ville définie
    if (!event.location?.city) {
      console.log('[MobilityNotification] Événement sans ville définie, notification ignorée');
      return { count: 0, comedians: [] };
    }

    // 2. Trouver tous les comédiens abonnés aux emails
    // Exclure ceux déjà dans la liste d'exclusion
    const query: any = {
      role: 'COMEDIAN',
      'emailSubscriptions.globalSubscribed': { $ne: false }
    };

    if (excludeComedianIds && excludeComedianIds.length > 0) {
      query._id = { $nin: excludeComedianIds };
    }

    const matchingComedians = await UserModel.find(query).lean();

    if (matchingComedians.length === 0) {
      console.log('[MobilityNotification] Aucun comédien abonné trouvé');
      return { count: 0, comedians: [] };
    }

    console.log(`[MobilityNotification] ${matchingComedians.length} comédiens à notifier pour l'événement "${event.title}" à ${event.location.city}`);

    // 3. Envoyer les emails en parallèle (avec gestion des erreurs individuelles)
    const emailResults = await Promise.allSettled(
      matchingComedians.map(comedian =>
        sendEventNotificationByMobility(comedian, event, organizer)
      )
    );

    // Identifier les comedians notifiés avec succès
    const notifiedComedians: { _id: string; email: string }[] = [];
    emailResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        const comedian = matchingComedians[index] as any;
        notifiedComedians.push({
          _id: comedian._id?.toString() || '',
          email: comedian.email || ''
        });
      }
    });

    const failureCount = emailResults.filter(r => r.status === 'rejected').length;

    if (failureCount > 0) {
      console.warn(`[MobilityNotification] ${failureCount} emails ont échoué sur ${matchingComedians.length}`);
    }

    console.log(`[MobilityNotification] ${notifiedComedians.length} humoristes notifiés avec succès pour l'événement "${event.title}" à ${event.location.city}`);

    return { count: notifiedComedians.length, comedians: notifiedComedians };
  } catch (error) {
    console.error('[MobilityNotification] Erreur lors de la notification:', error);
    throw error;
  }
};

/**
 * Version asynchrone qui ne bloque pas l'appelant
 * Utile pour appeler depuis un controller sans attendre la fin des envois
 *
 * @param event - L'événement publié
 * @param organizer - Les infos de l'organisateur (optionnel)
 */
export const notifyComediansByMobilityAsync = (
  event: EventDocument,
  organizer?: { firstName: string; lastName: string; email: string }
): void => {
  notifyComediansByMobility(event, organizer).catch(error => {
    console.error('[MobilityNotification] Erreur asynchrone:', error);
  });
};

/**
 * Notifie par email tous les humoristes abonnés d'une série d'événements récurrents.
 * Envoie UN SEUL email par humoriste avec toutes les dates (au lieu d'un email par date).
 *
 * @param events - Les événements du groupe récurrent (même lieu, dates différentes)
 * @param organizer - Les infos de l'organisateur
 * @returns Le nombre d'humoristes notifiés
 */
export const notifyComediansByMobilityForRecurringGroup = async (
  events: EventDocument[],
  organizer: { firstName: string; lastName: string; email: string }
): Promise<number> => {
  if (!events || events.length === 0) {
    console.log('[MobilityNotification] Groupe récurrent vide, notification ignorée');
    return 0;
  }
  const event = events[0];
  try {
    if (!event.location?.city) {
      console.log('[MobilityNotification] Événement sans ville définie, notification récurrente ignorée');
      return 0;
    }

    const matchingComedians = await UserModel.find({
      role: 'COMEDIAN',
      'emailSubscriptions.globalSubscribed': { $ne: false }
    }).lean();

    if (matchingComedians.length === 0) {
      console.log('[MobilityNotification] Aucun comédien abonné trouvé');
      return 0;
    }

    console.log(`[MobilityNotification] ${matchingComedians.length} comédiens à notifier pour le groupe récurrent "${event.title}" (${events.length} dates) à ${event.location.city}`);

    const emailResults = await Promise.allSettled(
      matchingComedians.map(comedian => sendRecurringEventNotificationByMobility(comedian, events, organizer))
    );

    const successCount = emailResults.filter(r => r.status === 'fulfilled').length;
    const failureCount = emailResults.filter(r => r.status === 'rejected').length;
    if (failureCount > 0) {
      console.warn(`[MobilityNotification] ${failureCount} emails récurrents ont échoué sur ${matchingComedians.length}`);
    }
    console.log(`[MobilityNotification] ${successCount} humoristes notifiés (1 email chacun avec ${events.length} dates) pour "${event.title}"`);

    return successCount;
  } catch (error) {
    console.error('[MobilityNotification] Erreur lors de la notification récurrente:', error);
    throw error;
  }
};

/**
 * Version asynchrone pour le groupe récurrent (ne bloque pas l'appelant)
 */
export const notifyComediansByMobilityForRecurringGroupAsync = (
  events: EventDocument[],
  organizer: { firstName: string; lastName: string; email: string }
): void => {
  notifyComediansByMobilityForRecurringGroup(events, organizer).catch(error => {
    console.error('[MobilityNotification] Erreur asynchrone (groupe récurrent):', error);
  });
};

/**
 * Notifie les humoristes d'une place disponible suite à un désistement tardif
 * Envoie UN SEUL email groupé à tous les humoristes concernés (en BCC)
 *
 * @param event - L'événement avec une place disponible
 * @param organizer - Les infos de l'organisateur
 * @param excludeComedianIds - IDs des comédiens à exclure (ex: celui qui s'est désisté)
 * @returns Nombre d'humoristes notifiés
 */
export const notifyComediansOfLateCancellation = async (
  event: EventDocument,
  organizer?: { firstName: string; lastName: string; email: string; organizerProfile?: any },
  excludeComedianIds?: string[]
): Promise<number> => {
  try {
    console.log(`[LateCancellationNotification] Début notification pour "${event.title}"`);

    // 1. Vérifier que l'événement a une ville définie
    if (!event.location?.city) {
      console.log('[LateCancellationNotification] Événement sans ville définie, notification ignorée');
      return 0;
    }

    // 2. Trouver tous les comédiens abonnés aux emails
    const query: any = {
      role: 'COMEDIAN',
      'emailSubscriptions.globalSubscribed': { $ne: false }
    };

    if (excludeComedianIds && excludeComedianIds.length > 0) {
      query._id = { $nin: excludeComedianIds };
    }

    const matchingComedians = await UserModel.find(query).lean();

    if (matchingComedians.length === 0) {
      console.log('[LateCancellationNotification] Aucun comédien abonné trouvé');
      return 0;
    }

    console.log(`[LateCancellationNotification] ${matchingComedians.length} comédiens à notifier`);

    // 3. Envoyer l'email urgent
    const { sendUrgentAvailabilityToComedians } = await import('./emailService');

    const comedianEmails = matchingComedians.map(c => c.email);

    // Déterminer si c'est une notification de suivi (nouvelle place)
    const notificationCount = event.lateCancellationNotificationCount || 0;
    const isFollowUpNotification = notificationCount > 0;

    await sendUrgentAvailabilityToComedians(
      event,
      organizer || { firstName: '', lastName: '', email: '' },
      comedianEmails,
      isFollowUpNotification
    );

    console.log(`[LateCancellationNotification] ✅ ${matchingComedians.length} humoristes notifiés pour "${event.title}"`);

    return matchingComedians.length;

  } catch (error) {
    console.error('[LateCancellationNotification] Erreur lors de la notification:', error);
    return 0;
  }
};

/**
 * Version asynchrone qui ne bloque pas l'appelant
 */
export const notifyComediansOfLateCancellationAsync = (
  event: EventDocument,
  organizer?: { firstName: string; lastName: string; email: string; organizerProfile?: any },
  excludeComedianIds?: string[]
): void => {
  notifyComediansOfLateCancellation(event, organizer, excludeComedianIds).catch(error => {
    console.error('[LateCancellationNotification] Erreur asynchrone:', error);
  });
};
