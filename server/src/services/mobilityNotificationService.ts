/**
 * Service de notification par mobilité
 * Envoie des emails aux humoristes pour un événement publié.
 * Filtre par zone de mobilité si config.notifications.mobilityFilterEnabled est actif ;
 * sinon notifie tous les humoristes abonnés.
 */

import { sendEventNotificationByMobility, sendRecurringEventNotificationByMobility } from './emailService';
import { UserModel } from '../models/User';
import { EventDocument } from '../models/Event';
import { getCityGeoInfo, getCityGeoInfoByPostalCode } from '../utils/cityMapping';
import { config } from '../config/env';

/**
 * Résultat d'une notification par mobilité
 */
export interface MobilityNotificationResult {
  count: number;
  comedians: { _id: string; email: string }[];
}

/** Clause de requête sur la zone de mobilité, appliquée seulement si le filtre est actif */
const mobilityZoneQueryClause = () =>
  config.notifications.mobilityFilterEnabled
    ? { 'profile.mobilityZone': { $exists: true, $not: { $size: 0 } } }
    : {};

/**
 * Notifie par email les humoristes pour un événement publié
 * (filtré par zone de mobilité seulement si le filtre est actif, cf. config.notifications)
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

    // 2. Trouver tous les comédiens abonnés aux emails (zone de mobilité requise
    //    seulement si le filtre géographique est actif)
    // Exclure ceux déjà dans la liste d'exclusion
    const query: any = {
      role: 'COMEDIAN',
      'emailSubscriptions.globalSubscribed': { $ne: false },
      ...mobilityZoneQueryClause(),
    };

    if (excludeComedianIds && excludeComedianIds.length > 0) {
      query._id = { $nin: excludeComedianIds };
    }

    const comedians = await UserModel.find(query).lean();

    console.log(`[MobilityNotification] Filtre géographique ${config.notifications.mobilityFilterEnabled ? 'actif' : 'désactivé'}`);

    if (comedians.length === 0) {
      console.log('[MobilityNotification] Aucun comédien trouvé');
      return { count: 0, comedians: [] };
    }

    let targets = comedians;

    if (config.notifications.mobilityFilterEnabled) {

    // 3. Récupérer les infos géographiques : priorité au département stocké en base
    //    Puis au code postal stocké ou extrait de l'adresse
    //    (évite les ambiguïtés : ex. Grigny 91 vs Grigny 62)
    let geoInfo: { department: string | null; region: string | null };
    
    // Priorité 1: Utiliser le département stocké en base
    if (event.location.department) {
      console.log(`[MobilityNotification] Utilisation du département stocké en base: ${event.location.department}`);
      // On récupère quand même la région via l'API
      const cityGeoInfo = await getCityGeoInfo(event.location.city);
      geoInfo = {
        department: event.location.department,
        region: cityGeoInfo.region
      };
    } else {
      // Priorité 2: Utiliser le code postal stocké ou extraire de l'adresse
      const postalCode = event.location.postalCode || event.location.address?.match(/\b(\d{5})\b/)?.[1] || null;
      if (postalCode) {
        console.log(`[MobilityNotification] Récupération des infos géo pour code postal "${postalCode}" (événement: ${event.location.city}) via API Geo Gouv...`);
        geoInfo = await getCityGeoInfoByPostalCode(postalCode);
      } else {
        console.log(`[MobilityNotification] Récupération des infos géo pour "${event.location.city}" via API Geo Gouv...`);
        geoInfo = await getCityGeoInfo(event.location.city);
      }
    }
    
    // Normaliser la ville de l'événement pour le matching (gérer les arrondissements)
    // Ex: "Paris 10e Arrondissement" → "paris"
    let eventCity = event.location.city.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    
    // Si c'est un arrondissement de Paris, Lyon ou Marseille, extraire juste le nom de la ville
    if (eventCity.includes('paris') && (eventCity.includes('arrondissement') || /paris\s+\d+/.test(eventCity))) {
      eventCity = 'paris';
    } else if (eventCity.includes('lyon') && /lyon\s+\d+/.test(eventCity)) {
      eventCity = 'lyon';
    } else if (eventCity.includes('marseille') && /marseille\s+\d+/.test(eventCity)) {
      eventCity = 'marseille';
    }
    
    const eventDepartment = geoInfo.department;
    const eventRegion = geoInfo.region;

    console.log(`[MobilityNotification] Ville: ${event.location.city} (normalisé: ${eventCity}) → Département: ${eventDepartment}, Région: ${eventRegion}`);

    // 4. Filtrer les comédiens dont la zone de mobilité matche
    targets = comedians.filter(comedian => {
      const mobilityZones = (comedian as any).profile?.mobilityZone;
      if (!mobilityZones || !Array.isArray(mobilityZones) || mobilityZones.length === 0) {
        return false;
      }

      return mobilityZones.some((zone: { type: string; value: string }) => {
        let normalizedZoneValue = zone.value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
        
        // Normaliser aussi les arrondissements dans les zones de mobilité
        if (normalizedZoneValue.includes('paris') && (normalizedZoneValue.includes('arrondissement') || /paris\s+\d+/.test(normalizedZoneValue))) {
          normalizedZoneValue = 'paris';
        } else if (normalizedZoneValue.includes('lyon') && /lyon\s+\d+/.test(normalizedZoneValue)) {
          normalizedZoneValue = 'lyon';
        } else if (normalizedZoneValue.includes('marseille') && /marseille\s+\d+/.test(normalizedZoneValue)) {
          normalizedZoneValue = 'marseille';
        }

        switch (zone.type) {
          case 'ville':
            // Matching exact ou partiel (pour gérer "Paris" vs "Paris 10e Arrondissement")
            return eventCity === normalizedZoneValue || 
                   eventCity.includes(normalizedZoneValue) || 
                   normalizedZoneValue.includes(eventCity);

          case 'departement':
            if (!eventDepartment) return false;
            // Normaliser le département (ajouter zéro si nécessaire)
            const normalizedDept = /^\d{1,2}$/.test(zone.value.trim())
              ? zone.value.trim().padStart(2, '0')
              : zone.value.trim().toUpperCase();
            return eventDepartment === normalizedDept;

          case 'region':
            if (!eventRegion) return false;
            const normalizedEventRegion = eventRegion.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
            return normalizedEventRegion === normalizedZoneValue;

          default:
            return false;
        }
      });
    });

    if (targets.length === 0) {
      console.log(`[MobilityNotification] Aucun comédien ne matche pour l'événement à ${event.location.city}`);
      return { count: 0, comedians: [] };
    }

    }

    console.log(`[MobilityNotification] ${targets.length} comédiens ciblés pour l'événement "${event.title}" à ${event.location.city}`);

    // 5. Envoyer les emails en parallèle (avec gestion des erreurs individuelles)
    const emailResults = await Promise.allSettled(
      targets.map(comedian =>
        sendEventNotificationByMobility(comedian, event, organizer)
      )
    );

    // Identifier les comedians notifiés avec succès
    const notifiedComedians: { _id: string; email: string }[] = [];
    emailResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        const comedian = targets[index] as any;
        notifiedComedians.push({
          _id: comedian._id?.toString() || '',
          email: comedian.email || ''
        });
      }
    });

    const failureCount = emailResults.filter(r => r.status === 'rejected').length;

    if (failureCount > 0) {
      console.warn(`[MobilityNotification] ${failureCount} emails ont échoué sur ${targets.length}`);
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
 * Notifie par email les humoristes pour une série d'événements récurrents (filtré par zone
 * de mobilité seulement si le filtre est actif). Envoie UN SEUL email par humoriste avec
 * toutes les dates (au lieu d'un email par date).
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

    const comedians = await UserModel.find({
      role: 'COMEDIAN',
      'emailSubscriptions.globalSubscribed': { $ne: false },
      ...mobilityZoneQueryClause(),
    }).lean();

    console.log(`[MobilityNotification] Filtre géographique ${config.notifications.mobilityFilterEnabled ? 'actif' : 'désactivé'} (groupe récurrent)`);

    if (comedians.length === 0) {
      console.log('[MobilityNotification] Aucun comédien trouvé');
      return 0;
    }

    let targets = comedians;

    if (config.notifications.mobilityFilterEnabled) {

    // Priorité 1: Utiliser le département stocké en base
    let geoInfo: { department: string | null; region: string | null };
    
    if (event.location.department) {
      console.log(`[MobilityNotification] Utilisation du département stocké en base pour groupe récurrent: ${event.location.department}`);
      const cityGeoInfo = await getCityGeoInfo(event.location.city);
      geoInfo = {
        department: event.location.department,
        region: cityGeoInfo.region
      };
    } else {
      // Priorité 2: Utiliser le code postal stocké ou extraire de l'adresse
      const postalCodeRec = event.location.postalCode || event.location.address?.match(/\b(\d{5})\b/)?.[1] || null;
      if (postalCodeRec) {
        console.log(`[MobilityNotification] Récupération des infos géo pour code postal "${postalCodeRec}" (groupe récurrent: ${event.location.city}, ${events.length} dates)...`);
        geoInfo = await getCityGeoInfoByPostalCode(postalCodeRec);
      } else {
        console.log(`[MobilityNotification] Récupération des infos géo pour "${event.location.city}" (groupe récurrent, ${events.length} dates)...`);
        geoInfo = await getCityGeoInfo(event.location.city);
      }
    }

    let eventCity = event.location.city.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    if (eventCity.includes('paris') && (eventCity.includes('arrondissement') || /paris\s+\d+/.test(eventCity))) {
      eventCity = 'paris';
    } else if (eventCity.includes('lyon') && /lyon\s+\d+/.test(eventCity)) {
      eventCity = 'lyon';
    } else if (eventCity.includes('marseille') && /marseille\s+\d+/.test(eventCity)) {
      eventCity = 'marseille';
    }

    const eventDepartment = geoInfo.department;
    const eventRegion = geoInfo.region;

    targets = comedians.filter(comedian => {
      const mobilityZones = (comedian as any).profile?.mobilityZone;
      if (!mobilityZones || !Array.isArray(mobilityZones) || mobilityZones.length === 0) return false;
      return mobilityZones.some((zone: { type: string; value: string }) => {
        let normalizedZoneValue = zone.value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
        if (normalizedZoneValue.includes('paris') && (normalizedZoneValue.includes('arrondissement') || /paris\s+\d+/.test(normalizedZoneValue))) {
          normalizedZoneValue = 'paris';
        } else if (normalizedZoneValue.includes('lyon') && /lyon\s+\d+/.test(normalizedZoneValue)) {
          normalizedZoneValue = 'lyon';
        } else if (normalizedZoneValue.includes('marseille') && /marseille\s+\d+/.test(normalizedZoneValue)) {
          normalizedZoneValue = 'marseille';
        }
        switch (zone.type) {
          case 'ville':
            return eventCity === normalizedZoneValue || eventCity.includes(normalizedZoneValue) || normalizedZoneValue.includes(eventCity);
          case 'departement':
            if (!eventDepartment) return false;
            const normalizedDept = /^\d{1,2}$/.test(zone.value.trim()) ? zone.value.trim().padStart(2, '0') : zone.value.trim().toUpperCase();
            return eventDepartment === normalizedDept;
          case 'region':
            if (!eventRegion) return false;
            const normalizedEventRegion = eventRegion.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
            return normalizedEventRegion === normalizedZoneValue;
          default:
            return false;
        }
      });
    });

    if (targets.length === 0) {
      console.log(`[MobilityNotification] Aucun comédien ne matche pour l'événement récurrent à ${event.location.city}`);
      return 0;
    }
    }

    console.log(`[MobilityNotification] ${targets.length} comédiens ciblés pour le groupe récurrent "${event.title}" (${events.length} dates) à ${event.location.city}`);

    const emailResults = await Promise.allSettled(
      targets.map(comedian => sendRecurringEventNotificationByMobility(comedian, events, organizer))
    );

    const successCount = emailResults.filter(r => r.status === 'fulfilled').length;
    const failureCount = emailResults.filter(r => r.status === 'rejected').length;
    if (failureCount > 0) {
      console.warn(`[MobilityNotification] ${failureCount} emails récurrents ont échoué sur ${targets.length}`);
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
 * Utilise la même logique de filtrage géographique que notifyComediansByMobility
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

    // 2. Trouver tous les comédiens abonnés aux emails (zone de mobilité requise
    //    seulement si le filtre géographique est actif)
    const query: any = {
      role: 'COMEDIAN',
      'emailSubscriptions.globalSubscribed': { $ne: false },
      ...mobilityZoneQueryClause(),
    };

    if (excludeComedianIds && excludeComedianIds.length > 0) {
      query._id = { $nin: excludeComedianIds };
    }

    const comedians = await UserModel.find(query).lean();

    console.log(`[LateCancellationNotification] Filtre géographique ${config.notifications.mobilityFilterEnabled ? 'actif' : 'désactivé'}`);

    if (comedians.length === 0) {
      console.log('[LateCancellationNotification] Aucun comédien trouvé');
      return 0;
    }

    let targets = comedians;

    console.log(`[LateCancellationNotification] ${comedians.length} comédiens à filtrer`);

    if (config.notifications.mobilityFilterEnabled) {
    // 3. Récupérer les infos géographiques de l'événement
    let geoInfo: { department: string | null; region: string | null };

    if (event.location.department) {
      const cityGeoInfo = await getCityGeoInfo(event.location.city);
      geoInfo = {
        department: event.location.department,
        region: cityGeoInfo.region
      };
    } else {
      const postalCode = event.location.postalCode || event.location.address?.match(/\b(\d{5})\b/)?.[1] || null;
      if (postalCode) {
        geoInfo = await getCityGeoInfoByPostalCode(postalCode);
      } else {
        geoInfo = await getCityGeoInfo(event.location.city);
      }
    }

    // Normaliser la ville de l'événement
    let eventCity = event.location.city.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    if (eventCity.includes('paris') && (eventCity.includes('arrondissement') || /paris\s+\d+/.test(eventCity))) {
      eventCity = 'paris';
    } else if (eventCity.includes('lyon') && /lyon\s+\d+/.test(eventCity)) {
      eventCity = 'lyon';
    } else if (eventCity.includes('marseille') && /marseille\s+\d+/.test(eventCity)) {
      eventCity = 'marseille';
    }

    const eventDepartment = geoInfo.department;
    const eventRegion = geoInfo.region;

    // 4. Filtrer les comédiens par zone de mobilité
    targets = comedians.filter(comedian => {
      const mobilityZones = comedian.profile?.mobilityZone || [];

      for (const zone of mobilityZones) {
        // Match ville exacte
        if (zone.type === 'ville') {
          let zoneValue = zone.value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
          if (zoneValue.includes('paris') && (zoneValue.includes('arrondissement') || /paris\s+\d+/.test(zoneValue))) {
            zoneValue = 'paris';
          } else if (zoneValue.includes('lyon') && /lyon\s+\d+/.test(zoneValue)) {
            zoneValue = 'lyon';
          } else if (zoneValue.includes('marseille') && /marseille\s+\d+/.test(zoneValue)) {
            zoneValue = 'marseille';
          }

          if (zoneValue === eventCity) return true;
        }

        // Match département
        if (zone.type === 'departement' && eventDepartment) {
          const deptCode = zone.value.match(/\d{2,3}/)?.[0];
          const eventDeptCode = eventDepartment.match(/\d{2,3}/)?.[0];
          if (deptCode && eventDeptCode && deptCode === eventDeptCode) return true;
          if (zone.value.toLowerCase().includes(eventDepartment.toLowerCase())) return true;
        }

        // Match région
        if (zone.type === 'region' && eventRegion) {
          if (zone.value.toLowerCase().includes(eventRegion.toLowerCase())) return true;
          if (eventRegion.toLowerCase().includes(zone.value.toLowerCase())) return true;
        }
      }

      return false;
    });

    if (targets.length === 0) {
      console.log('[LateCancellationNotification] Aucun comédien ne correspond à la zone de mobilité');
      return 0;
    }
    }

    console.log(`[LateCancellationNotification] ${targets.length} comédiens ciblés`);

    // 5. Importer et utiliser la fonction d'email urgente
    const { sendUrgentAvailabilityToComedians } = await import('./emailService');

    const comedianEmails = targets.map(c => c.email);

    // Déterminer si c'est une notification de suivi (nouvelle place)
    const notificationCount = event.lateCancellationNotificationCount || 0;
    const isFollowUpNotification = notificationCount > 0;

    await sendUrgentAvailabilityToComedians(
      event,
      organizer || { firstName: '', lastName: '', email: '' },
      comedianEmails,
      isFollowUpNotification
    );

    console.log(`[LateCancellationNotification] ✅ ${targets.length} humoristes notifiés pour "${event.title}"`);

    return targets.length;

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
