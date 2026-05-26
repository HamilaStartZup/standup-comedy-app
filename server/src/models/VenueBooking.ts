import mongoose, { Schema, Document, Types } from 'mongoose';

export type VenueBookingStatus = 'PENDING' | 'ACCEPTED' | 'REFUSED' | 'CONFIRMED' | 'CANCELLED_BY_OWNER' | 'CANCELLED_BY_REQUESTER' | 'EXPIRED';

export type VenueBookingPaymentStatus = 'none' | 'pending' | 'paid' | 'refund_pending' | 'refunded';

export interface VenueBookingDocument extends Document {
  venue: Types.ObjectId;
  requester: Types.ObjectId;
  requestedDate: Date;
  startTime: string;
  endTime: string;
  message?: string;
  status: VenueBookingStatus;
  ownerResponse?: string;
  paymentStatus: VenueBookingPaymentStatus;
  stripeSessionId?: string;
  paidAmount?: number;
  paidAt?: Date;
  stripePaymentIntentId?: string;
  stripeRefundId?: string;
  refundedAmount?: number;
  refundedAt?: Date;
  paymentDeadlineAt?: Date;
  paymentReminderSentAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const venueBookingSchema = new Schema<VenueBookingDocument>(
  {
    venue: { type: Schema.Types.ObjectId, ref: 'Venue', required: true, index: true },
    requester: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    requestedDate: { type: Date, required: true },
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
    message: { type: String, maxlength: 500 },
    status: {
      type: String,
      enum: ['PENDING', 'ACCEPTED', 'REFUSED', 'CONFIRMED', 'CANCELLED_BY_OWNER', 'CANCELLED_BY_REQUESTER', 'EXPIRED'],
      default: 'PENDING',
      index: true,
    },
    ownerResponse: { type: String, maxlength: 500 },
    paymentStatus: {
      type: String,
      enum: ['none', 'pending', 'paid', 'refund_pending', 'refunded'],
      default: 'none',
    },
    stripeSessionId: { type: String },
    paidAmount: { type: Number, min: 0 },
    paidAt: { type: Date },
    stripePaymentIntentId: { type: String },
    stripeRefundId: { type: String },
    refundedAmount: { type: Number, min: 0 },
    refundedAt: { type: Date },
    paymentDeadlineAt: { type: Date },
    paymentReminderSentAt: { type: Date },
  },
  { timestamps: true }
);

venueBookingSchema.index({ venue: 1, requestedDate: 1, status: 1 });
venueBookingSchema.index({ status: 1, paymentDeadlineAt: 1 });

export const VenueBookingModel = mongoose.model<VenueBookingDocument>('VenueBooking', venueBookingSchema);
