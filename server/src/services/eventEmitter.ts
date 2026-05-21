import { EventEmitter } from 'events';

// Types d'évènements SSE
export enum SSEEventType {
  // Évènements
  EVENT_CREATED = 'EVENT_CREATED',
  EVENT_UPDATED = 'EVENT_UPDATED',
  EVENT_DELETED = 'EVENT_DELETED',
  EVENT_COMPLETED = 'EVENT_COMPLETED',

  // Candidatures
  APPLICATION_CREATED = 'APPLICATION_CREATED',
  APPLICATION_STATUS_CHANGED = 'APPLICATION_STATUS_CHANGED',
  APPLICATION_WITHDRAWN = 'APPLICATION_WITHDRAWN',

  // Absences
  ABSENCE_MARKED = 'ABSENCE_MARKED',
  ABSENCE_CANCELLED = 'ABSENCE_CANCELLED',

  // Annulations tardives
  LATE_CANCELLATION = 'LATE_CANCELLATION',

  // Favoris comédiens
  FAVORITE_COMEDIAN_ADDED = 'FAVORITE_COMEDIAN_ADDED',
  FAVORITE_COMEDIAN_REMOVED = 'FAVORITE_COMEDIAN_REMOVED',

  // Favoris évènements
  EVENT_FAVORITE_ADDED = 'EVENT_FAVORITE_ADDED',
  EVENT_FAVORITE_REMOVED = 'EVENT_FAVORITE_REMOVED',

  // Favoris candidatures
  APPLICATION_FAVORITE_ADDED = 'APPLICATION_FAVORITE_ADDED',
  APPLICATION_FAVORITE_REMOVED = 'APPLICATION_FAVORITE_REMOVED',

  // Profils & Utilisateurs
  PROFILE_UPDATED = 'PROFILE_UPDATED',
  USER_REGISTERED = 'USER_REGISTERED',
  PASSWORD_RESET = 'PASSWORD_RESET',

  // Réservations de salles
  VENUE_BOOKING_STATUS_CHANGED = 'VENUE_BOOKING_STATUS_CHANGED',
  VENUE_BOOKING_PAYMENT_UPDATED = 'VENUE_BOOKING_PAYMENT_UPDATED',

  // Notifications
  NOTIFICATION_CREATED = 'NOTIFICATION_CREATED',
  NOTIFICATION_READ = 'NOTIFICATION_READ',
  NOTIFICATION_ALL_READ = 'NOTIFICATION_ALL_READ',

  // Salles (Venue CRUD)
  VENUE_CREATED = 'VENUE_CREATED',
  VENUE_UPDATED = 'VENUE_UPDATED',
  VENUE_DELETED = 'VENUE_DELETED',

  // Signalements comédiens
  COMEDIAN_REPORT_CREATED = 'COMEDIAN_REPORT_CREATED',
  COMEDIAN_REPORT_UPDATED = 'COMEDIAN_REPORT_UPDATED',

  // Spectateurs
  SPECTATOR_REGISTERED = 'SPECTATOR_REGISTERED',
  SPECTATOR_UNREGISTERED = 'SPECTATOR_UNREGISTERED',
  SPECTATOR_RATING_SUBMITTED = 'SPECTATOR_RATING_SUBMITTED',

  // Alertes admin
  PRESENCE_ALERT_ACKNOWLEDGED = 'PRESENCE_ALERT_ACKNOWLEDGED',
  LATE_CANCELLATION_ALERT_ACKNOWLEDGED = 'LATE_CANCELLATION_ALERT_ACKNOWLEDGED',
}

// Interface pour le payload des évènements SSE
export interface SSEEventPayload {
  type: SSEEventType;
  data: {
    id?: string;
    eventId?: string;
    userId?: string;
    comedianId?: string;
    organizerId?: string;
    status?: string;
    [key: string]: any;
  };
  timestamp: string;
  targetUserIds?: string[];
}

/**
 * Service centralisé d'émission d'évènements pour SSE
 * Utilise un singleton EventEmitter pour toute l'application
 */
class AppEventEmitter extends EventEmitter {
  private static instance: AppEventEmitter;

  private constructor() {
    super();
    // Augmenter la limite des listeners pour éviter les warnings
    this.setMaxListeners(100);
  }

  /**
   * Obtenir l'instance singleton de l'EventEmitter
   */
  public static getInstance(): AppEventEmitter {
    if (!AppEventEmitter.instance) {
      AppEventEmitter.instance = new AppEventEmitter();
    }
    return AppEventEmitter.instance;
  }

  /**
   * Émettre un évènement typé avec payload standardisé
   */
  public emitSSEEvent(type: SSEEventType, data: Record<string, any>): void {
    const payload: SSEEventPayload = {
      type,
      data,
      timestamp: new Date().toISOString(),
    };

    this.emit('sse-event', payload);
    console.log(`📡 Évènement SSE émis: ${type}`, data);
  }

  public emitTargetedSSEEvent(type: SSEEventType, data: Record<string, any>, targetUserIds: string[]): void {
    const payload: SSEEventPayload = {
      type,
      data,
      timestamp: new Date().toISOString(),
      targetUserIds,
    };
    this.emit('sse-event', payload);
    console.log(`📡 Targeted SSE ${type} → [${targetUserIds.join(', ')}]`, data);
  }
}

// Exporter l'instance singleton
export const appEventEmitter = AppEventEmitter.getInstance();

// Fonctions helpers typées pour émettre des évènements spécifiques

export const emitEventCreated = (id: string, targetUserIds: string[]) => {
  appEventEmitter.emitTargetedSSEEvent(SSEEventType.EVENT_CREATED, { id }, targetUserIds);
};

export const emitEventUpdated = (id: string, targetUserIds: string[]) => {
  appEventEmitter.emitTargetedSSEEvent(SSEEventType.EVENT_UPDATED, { id }, targetUserIds);
};

export const emitEventDeleted = (id: string, targetUserIds: string[]) => {
  appEventEmitter.emitTargetedSSEEvent(SSEEventType.EVENT_DELETED, { id }, targetUserIds);
};

export const emitEventCompleted = (id: string, targetUserIds: string[]) => {
  appEventEmitter.emitTargetedSSEEvent(SSEEventType.EVENT_COMPLETED, { id }, targetUserIds);
};

export const emitApplicationCreated = (id: string, eventId: string, organizerId: string) => {
  appEventEmitter.emitTargetedSSEEvent(SSEEventType.APPLICATION_CREATED, { id, eventId, organizerId }, [organizerId]);
};

export const emitApplicationStatusChanged = (id: string, status: string, eventId: string, targetUserIds: string[]) => {
  appEventEmitter.emitTargetedSSEEvent(SSEEventType.APPLICATION_STATUS_CHANGED, { id, status, eventId }, targetUserIds);
};

export const emitApplicationWithdrawn = (id: string, eventId: string, organizerId: string) => {
  appEventEmitter.emitTargetedSSEEvent(SSEEventType.APPLICATION_WITHDRAWN, { id, eventId, organizerId }, [organizerId]);
};

export const emitAbsenceMarked = (eventId: string, comedianId: string, organizerId: string) => {
  appEventEmitter.emitTargetedSSEEvent(SSEEventType.ABSENCE_MARKED, { eventId, comedianId }, [organizerId, comedianId]);
};

export const emitAbsenceCancelled = (eventId: string, comedianId: string, organizerId: string) => {
  appEventEmitter.emitTargetedSSEEvent(SSEEventType.ABSENCE_CANCELLED, { eventId, comedianId }, [organizerId, comedianId]);
};

export const emitLateCancellation = (eventId: string, comedianId: string, applicationId: string, organizerId: string) => {
  appEventEmitter.emitTargetedSSEEvent(SSEEventType.LATE_CANCELLATION, { eventId, comedianId, applicationId }, [organizerId]);
};

export const emitFavoriteComedianAdded = (organizerId: string, comedianId: string) => {
  appEventEmitter.emitTargetedSSEEvent(SSEEventType.FAVORITE_COMEDIAN_ADDED, { organizerId, comedianId }, [organizerId]);
};

export const emitFavoriteComedianRemoved = (organizerId: string, comedianId: string) => {
  appEventEmitter.emitTargetedSSEEvent(SSEEventType.FAVORITE_COMEDIAN_REMOVED, { organizerId, comedianId }, [organizerId]);
};

export const emitEventFavoriteAdded = (comedianId: string, eventId: string) => {
  appEventEmitter.emitTargetedSSEEvent(SSEEventType.EVENT_FAVORITE_ADDED, { comedianId, eventId }, [comedianId]);
};

export const emitEventFavoriteRemoved = (comedianId: string, eventId: string) => {
  appEventEmitter.emitTargetedSSEEvent(SSEEventType.EVENT_FAVORITE_REMOVED, { comedianId, eventId }, [comedianId]);
};

export const emitApplicationFavoriteAdded = (organizerId: string, applicationId: string) => {
  appEventEmitter.emitTargetedSSEEvent(SSEEventType.APPLICATION_FAVORITE_ADDED, { organizerId, applicationId }, [organizerId]);
};

export const emitApplicationFavoriteRemoved = (organizerId: string, applicationId: string) => {
  appEventEmitter.emitTargetedSSEEvent(SSEEventType.APPLICATION_FAVORITE_REMOVED, { organizerId, applicationId }, [organizerId]);
};

export const emitProfileUpdated = (userId: string) => {
  appEventEmitter.emitTargetedSSEEvent(SSEEventType.PROFILE_UPDATED, { userId }, [userId]);
};

export const emitUserRegistered = (userId: string) => {
  appEventEmitter.emitSSEEvent(SSEEventType.USER_REGISTERED, { userId }); // reste global
};

export const emitPasswordReset = (userId: string) => {
  appEventEmitter.emitTargetedSSEEvent(SSEEventType.PASSWORD_RESET, { userId }, [userId]);
};

export const emitVenueBookingStatusChanged = (
  id: string,
  venueId: string,
  status: string,
  paymentStatus: string,
  targetUserIds: string[]
) => {
  appEventEmitter.emitTargetedSSEEvent(SSEEventType.VENUE_BOOKING_STATUS_CHANGED, { id, venueId, status, paymentStatus }, targetUserIds);
};

export const emitVenueBookingPaymentUpdated = (
  id: string,
  venueId: string,
  status: string,
  paymentStatus: string,
  targetUserIds: string[]
) => {
  appEventEmitter.emitTargetedSSEEvent(SSEEventType.VENUE_BOOKING_PAYMENT_UPDATED, { id, venueId, status, paymentStatus }, targetUserIds);
};

// === NOTIFICATIONS ===
export const emitNotificationCreated = (userId: string, notificationId: string) => {
  appEventEmitter.emitTargetedSSEEvent(SSEEventType.NOTIFICATION_CREATED, { notificationId }, [userId]);
};

export const emitNotificationRead = (userId: string, notificationId: string) => {
  appEventEmitter.emitTargetedSSEEvent(SSEEventType.NOTIFICATION_READ, { notificationId }, [userId]);
};

export const emitNotificationAllRead = (userId: string) => {
  appEventEmitter.emitTargetedSSEEvent(SSEEventType.NOTIFICATION_ALL_READ, {}, [userId]);
};

// === VENUES ===
export const emitVenueCreated = (venueId: string, ownerId: string) => {
  appEventEmitter.emitTargetedSSEEvent(SSEEventType.VENUE_CREATED, { venueId }, [ownerId]);
};

export const emitVenueUpdated = (venueId: string, ownerId: string) => {
  appEventEmitter.emitTargetedSSEEvent(SSEEventType.VENUE_UPDATED, { venueId }, [ownerId]);
};

export const emitVenueDeleted = (venueId: string, targetUserIds: string[]) => {
  appEventEmitter.emitTargetedSSEEvent(SSEEventType.VENUE_DELETED, { venueId }, targetUserIds);
};

// === SIGNALEMENTS ===
export const emitComedianReportCreated = (reportId: string, adminIds: string[]) => {
  appEventEmitter.emitTargetedSSEEvent(SSEEventType.COMEDIAN_REPORT_CREATED, { reportId }, adminIds);
};

export const emitComedianReportUpdated = (reportId: string, comedianId: string) => {
  appEventEmitter.emitTargetedSSEEvent(SSEEventType.COMEDIAN_REPORT_UPDATED, { reportId, comedianId }, [comedianId]);
};

// === SPECTATEURS ===
export const emitSpectatorRegistered = (eventId: string, spectatorId: string, organizerId: string) => {
  appEventEmitter.emitTargetedSSEEvent(SSEEventType.SPECTATOR_REGISTERED, { eventId, spectatorId }, [organizerId]);
};

export const emitSpectatorUnregistered = (eventId: string, spectatorId: string, organizerId: string) => {
  appEventEmitter.emitTargetedSSEEvent(SSEEventType.SPECTATOR_UNREGISTERED, { eventId, spectatorId }, [organizerId]);
};

export const emitSpectatorRatingSubmitted = (eventId: string, targetUserIds: string[]) => {
  appEventEmitter.emitTargetedSSEEvent(SSEEventType.SPECTATOR_RATING_SUBMITTED, { eventId }, targetUserIds);
};

// === ALERTES ADMIN ===
export const emitPresenceAlertAcknowledged = (alertId: string, adminIds: string[]) => {
  appEventEmitter.emitTargetedSSEEvent(SSEEventType.PRESENCE_ALERT_ACKNOWLEDGED, { alertId }, adminIds);
};

export const emitLateCancellationAlertAcknowledged = (alertId: string, adminIds: string[]) => {
  appEventEmitter.emitTargetedSSEEvent(SSEEventType.LATE_CANCELLATION_ALERT_ACKNOWLEDGED, { alertId }, adminIds);
};
