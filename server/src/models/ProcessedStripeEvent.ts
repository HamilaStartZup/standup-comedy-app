import mongoose, { Schema, Document } from 'mongoose';

export interface IProcessedStripeEvent extends Document {
  stripeEventId: string;
  processedAt: Date;
}

const ProcessedStripeEventSchema = new Schema<IProcessedStripeEvent>({
  stripeEventId: {
    type: String,
    required: true,
    unique: true,
  },
  processedAt: {
    type: Date,
    default: Date.now,
    expires: 7 * 24 * 60 * 60, // TTL 7 jours en secondes
  },
});

export const ProcessedStripeEventModel = mongoose.model<IProcessedStripeEvent>(
  'ProcessedStripeEvent',
  ProcessedStripeEventSchema
);
