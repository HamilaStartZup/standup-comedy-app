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
}

// Exporter l'instance singleton
export const appEventEmitter = AppEventEmitter.getInstance();

// Fonctions helpers typées pour émettre des évènements spécifiques

export const emitEventCreated = (id: string) => {
  appEventEmitter.emitSSEEvent(SSEEventType.EVENT_CREATED, { id });
};

export const emitEventUpdated = (id: string) => {
  appEventEmitter.emitSSEEvent(SSEEventType.EVENT_UPDATED, { id });
};

export const emitEventDeleted = (id: string) => {
  appEventEmitter.emitSSEEvent(SSEEventType.EVENT_DELETED, { id });
};

export const emitEventCompleted = (id: string) => {
  appEventEmitter.emitSSEEvent(SSEEventType.EVENT_COMPLETED, { id });
};

export const emitApplicationCreated = (id: string, eventId: string) => {
  appEventEmitter.emitSSEEvent(SSEEventType.APPLICATION_CREATED, { id, eventId });
};

export const emitApplicationStatusChanged = (id: string, status: string, eventId: string) => {
  appEventEmitter.emitSSEEvent(SSEEventType.APPLICATION_STATUS_CHANGED, { id, status, eventId });
};

export const emitApplicationWithdrawn = (id: string, eventId: string) => {
  appEventEmitter.emitSSEEvent(SSEEventType.APPLICATION_WITHDRAWN, { id, eventId });
};

export const emitAbsenceMarked = (eventId: string, comedianId: string) => {
  appEventEmitter.emitSSEEvent(SSEEventType.ABSENCE_MARKED, { eventId, comedianId });
};

export const emitAbsenceCancelled = (eventId: string, comedianId: string) => {
  appEventEmitter.emitSSEEvent(SSEEventType.ABSENCE_CANCELLED, { eventId, comedianId });
};

export const emitLateCancellation = (eventId: string, comedianId: string, applicationId: string) => {
  appEventEmitter.emitSSEEvent(SSEEventType.LATE_CANCELLATION, { eventId, comedianId, applicationId });
};

export const emitFavoriteComedianAdded = (organizerId: string, comedianId: string) => {
  appEventEmitter.emitSSEEvent(SSEEventType.FAVORITE_COMEDIAN_ADDED, { organizerId, comedianId });
};

export const emitFavoriteComedianRemoved = (organizerId: string, comedianId: string) => {
  appEventEmitter.emitSSEEvent(SSEEventType.FAVORITE_COMEDIAN_REMOVED, { organizerId, comedianId });
};

export const emitEventFavoriteAdded = (comedianId: string, eventId: string) => {
  appEventEmitter.emitSSEEvent(SSEEventType.EVENT_FAVORITE_ADDED, { comedianId, eventId });
};

export const emitEventFavoriteRemoved = (comedianId: string, eventId: string) => {
  appEventEmitter.emitSSEEvent(SSEEventType.EVENT_FAVORITE_REMOVED, { comedianId, eventId });
};

export const emitApplicationFavoriteAdded = (organizerId: string, applicationId: string) => {
  appEventEmitter.emitSSEEvent(SSEEventType.APPLICATION_FAVORITE_ADDED, { organizerId, applicationId });
};

export const emitApplicationFavoriteRemoved = (organizerId: string, applicationId: string) => {
  appEventEmitter.emitSSEEvent(SSEEventType.APPLICATION_FAVORITE_REMOVED, { organizerId, applicationId });
};

export const emitProfileUpdated = (userId: string) => {
  appEventEmitter.emitSSEEvent(SSEEventType.PROFILE_UPDATED, { userId });
};

export const emitUserRegistered = (userId: string) => {
  appEventEmitter.emitSSEEvent(SSEEventType.USER_REGISTERED, { userId });
};

export const emitPasswordReset = (userId: string) => {
  appEventEmitter.emitSSEEvent(SSEEventType.PASSWORD_RESET, { userId });
};

export const emitVenueBookingStatusChanged = (
  id: string,
  venueId: string,
  status: string,
  paymentStatus: string
) => {
  appEventEmitter.emitSSEEvent(SSEEventType.VENUE_BOOKING_STATUS_CHANGED, {
    id,
    venueId,
    status,
    paymentStatus,
  });
};

export const emitVenueBookingPaymentUpdated = (
  id: string,
  venueId: string,
  status: string,
  paymentStatus: string
) => {
  appEventEmitter.emitSSEEvent(SSEEventType.VENUE_BOOKING_PAYMENT_UPDATED, {
    id,
    venueId,
    status,
    paymentStatus,
  });
};
