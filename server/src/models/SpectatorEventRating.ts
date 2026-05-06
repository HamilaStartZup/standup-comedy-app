import mongoose, { Schema, Document } from 'mongoose';

export interface IComedianRatingEntry {
  comedian: mongoose.Types.ObjectId;
  rating: number; // 1-5
}

export interface ISpectatorEventRating extends Document {
  event: mongoose.Types.ObjectId;
  spectator: mongoose.Types.ObjectId;
  eventRating: number; // 1-5
  comedianRatings: IComedianRatingEntry[];
  createdAt: Date;
  updatedAt: Date;
}

const comedianRatingEntrySchema = new Schema<IComedianRatingEntry>({
  comedian: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  rating: { type: Number, required: true, min: 1, max: 5 },
}, { _id: false });

const spectatorEventRatingSchema = new Schema<ISpectatorEventRating>({
  event: { type: Schema.Types.ObjectId, ref: 'Event', required: true, index: true },
  spectator: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  eventRating: { type: Number, required: true, min: 1, max: 5 },
  comedianRatings: {
    type: [comedianRatingEntrySchema],
    default: [],
  },
}, {
  timestamps: true,
});

spectatorEventRatingSchema.index({ event: 1, spectator: 1 }, { unique: true });

export const SpectatorEventRatingModel = mongoose.model<ISpectatorEventRating>(
  'SpectatorEventRating',
  spectatorEventRatingSchema
);
