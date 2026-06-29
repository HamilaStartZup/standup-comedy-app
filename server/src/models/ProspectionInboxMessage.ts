import mongoose, { Schema, Document, Types } from 'mongoose';

export interface ProspectionInboxMessageDocument extends Document {
  messageId: string;
  from: string;
  fromName?: string | null;
  subject: string;
  snippet: string;
  receivedAt: Date;
  venueId?: Types.ObjectId | null;
  handled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const prospectionInboxMessageSchema = new Schema<ProspectionInboxMessageDocument>(
  {
    messageId: { type: String, required: true, unique: true, trim: true },
    from: { type: String, required: true, trim: true, lowercase: true },
    fromName: { type: String, trim: true, default: null },
    subject: { type: String, default: '' },
    snippet: { type: String, default: '' },
    receivedAt: { type: Date, required: true },
    venueId: { type: Schema.Types.ObjectId, ref: 'ProspectedVenue', default: null },
    handled: { type: Boolean, default: false },
  },
  { timestamps: true, collection: 'prospection_inbox_messages' }
);

prospectionInboxMessageSchema.index({ receivedAt: -1 });
prospectionInboxMessageSchema.index({ venueId: 1 });
prospectionInboxMessageSchema.index({ handled: 1, receivedAt: -1 });

export const ProspectionInboxMessageModel = mongoose.model<ProspectionInboxMessageDocument>(
  'ProspectionInboxMessage',
  prospectionInboxMessageSchema
);
