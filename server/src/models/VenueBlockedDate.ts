import mongoose, { Schema, Document, Types } from 'mongoose';

export interface VenueBlockedDateDocument extends Document {
  venue: Types.ObjectId;
  date: Date;
  startTime?: string; // Si absent : toute la journée bloquée
  endTime?: string;
  reason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const venueBlockedDateSchema = new Schema<VenueBlockedDateDocument>(
  {
    venue: { type: Schema.Types.ObjectId, ref: 'Venue', required: true, index: true },
    date: { type: Date, required: true },
    startTime: { type: String },
    endTime: { type: String },
    reason: { type: String, maxlength: 500 },
  },
  { timestamps: true }
);

venueBlockedDateSchema.index({ venue: 1, date: 1 });

export const VenueBlockedDateModel = mongoose.model<VenueBlockedDateDocument>('VenueBlockedDate', venueBlockedDateSchema);
