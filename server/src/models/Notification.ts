import mongoose, { Schema, Document, Types } from 'mongoose';

export type NotificationType =
  | 'new_application'
  | 'application_accepted'
  | 'application_rejected'
  | 'event_updated'
  | 'absence_marked'
  | 'event_cancelled'
  | 'late_cancellation_organizer'
  | 'late_cancellation_comedian'
  | 'new_event'
  | 'venue_booking_request'
  | 'venue_booking_response'
  | 'venue_booking_cancelled_by_owner'
  | 'venue_booking_refunded'
  | 'venue_date_blocked'
  | 'venue_booking_payment_required'
  | 'venue_booking_confirmed'
  | 'venue_booking_payment_reminder'
  | 'venue_booking_payment_expired'
  | 'venue_deleted_refund';

export interface NotificationDocument extends Document {
  user: Types.ObjectId; // Utilisateur destinataire (organisateur ou humoriste)
  type: NotificationType;
  title: string; // Titre de la notification
  message: string; // Message détaillé
  relatedEvent?: Types.ObjectId; // Évènement concerné
  relatedApplication?: Types.ObjectId; // Candidature concernée
  relatedUser?: Types.ObjectId; // Utilisateur concerné (humoriste qui a postulé, etc.)
  relatedVenue?: Types.ObjectId; // Salle concernée (réservations)
  read: boolean; // Si la notification a été lue
  readAt?: Date; // Date de lecture
  createdAt: Date;
  updatedAt: Date;
}

const notificationSchema = new Schema<NotificationDocument>({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  type: {
    type: String,
    enum: ['new_application', 'application_accepted', 'application_rejected', 'event_updated', 'absence_marked', 'event_cancelled', 'late_cancellation_organizer', 'late_cancellation_comedian', 'new_event', 'venue_booking_request', 'venue_booking_response', 'venue_booking_cancelled_by_owner', 'venue_booking_refunded', 'venue_date_blocked', 'venue_booking_payment_required', 'venue_booking_confirmed', 'venue_booking_payment_reminder', 'venue_booking_payment_expired', 'venue_deleted_refund'] satisfies NotificationType[],
    required: true,
    index: true
  },
  title: {
    type: String,
    required: true,
    maxlength: 200
  },
  message: {
    type: String,
    required: true,
    maxlength: 500
  },
  relatedEvent: {
    type: Schema.Types.ObjectId,
    ref: 'Event',
    index: true
  },
  relatedApplication: {
    type: Schema.Types.ObjectId,
    ref: 'Application',
    index: true
  },
  relatedUser: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },
  relatedVenue: {
    type: Schema.Types.ObjectId,
    ref: 'Venue',
    index: true
  },
  read: {
    type: Boolean,
    default: false,
    index: true
  },
  readAt: {
    type: Date
  }
}, {
  timestamps: true
});

// Index pour améliorer les performances
notificationSchema.index({ user: 1, read: 1 });
notificationSchema.index({ user: 1, createdAt: -1 });
notificationSchema.index({ relatedEvent: 1 });
notificationSchema.index({ relatedApplication: 1 });

export const NotificationModel = mongoose.model<NotificationDocument>('Notification', notificationSchema);

