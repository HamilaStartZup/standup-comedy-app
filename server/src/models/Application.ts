import mongoose, { Schema, Document, Types } from 'mongoose';
import { Application, PerformanceDetails } from '../types';

export interface ApplicationDocument extends Document {
  event: Types.ObjectId;
  comedian: Types.ObjectId;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED' | 'WITHDRAWN' | 'CANCELLED_BY_PLATFORM';
  performanceDetails?: PerformanceDetails;
  message?: string;
  organizerMessage?: string;
  reminders?: {
    j3Sent?: boolean;
    j1Sent?: boolean;
    h2Sent?: boolean;
  };
}

const performanceDetailsSchema = new Schema<PerformanceDetails>({
  duration: { type: Number, required: false },
  description: { type: String, required: false },
  videoLink: { type: String }
});

const applicationSchema = new Schema<ApplicationDocument>({
  event: {
    type: Schema.Types.ObjectId,
    ref: 'Event',
    required: true
  },
  comedian: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  status: {
    type: String,
    enum: ['PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'WITHDRAWN', 'CANCELLED_BY_PLATFORM'],
    default: 'PENDING'
  },
  performanceDetails: {
    type: performanceDetailsSchema,
    required: false
  },
  message: {
    type: String,
    required: false
  },
  organizerMessage: {
    type: String,
    required: false
  },
  reminders: {
    j3Sent: { type: Boolean, default: false },
    j1Sent: { type: Boolean, default: false },
    h2Sent: { type: Boolean, default: false }
  }
}, {
  timestamps: true
});

// Index pour améliorer les performances des requêtes
applicationSchema.index({ event: 1, comedian: 1 }, { unique: true });
applicationSchema.index({ status: 1 });
applicationSchema.index({ comedian: 1 });

export const ApplicationModel = mongoose.model<ApplicationDocument>('Application', applicationSchema); 