import mongoose, { Schema, Document, Types } from 'mongoose';

export interface InvoicePriceLine {
  label: string;
  amount: number;
  note?: string;
}

export type InvoicePaymentStatus = 'paid' | 'refund_pending' | 'refunded';

export interface InvoiceDocument extends Document {
  invoiceNumber: string;
  booking: Types.ObjectId;
  bookingGroupId?: Types.ObjectId;
  issuedAt: Date;
  buyerUserId: Types.ObjectId;
  sellerOwnerId: Types.ObjectId;
  buyer: {
    firstName?: string;
    lastName?: string;
    email: string;
  };
  seller: {
    venueName: string;
    companyName?: string;
    siret?: string;
    legalStatus?: string;
    ownerFirstName?: string;
    ownerLastName?: string;
    contactName?: string;
    address: string;
    postalCode: string;
    city: string;
    country: string;
  };
  lines: InvoicePriceLine[];
  subtotal: number;
  currency: string;
  paymentStatus: InvoicePaymentStatus;
  paidAmount?: number;
  paidAt?: Date;
  refundedAmount?: number;
  refundedAt?: Date;
  stripePaymentIntentId?: string;
  stripeSessionId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const invoiceLineSchema = new Schema<InvoicePriceLine>(
  {
    label: { type: String, required: true },
    amount: { type: Number, required: true },
    note: { type: String },
  },
  { _id: false }
);

const invoiceSchema = new Schema<InvoiceDocument>(
  {
    invoiceNumber: { type: String, required: true },
    booking: { type: Schema.Types.ObjectId, ref: 'VenueBooking', required: true, unique: true },
    bookingGroupId: { type: Schema.Types.ObjectId },
    issuedAt: { type: Date, required: true },
    buyerUserId: { type: Schema.Types.ObjectId, required: true, index: true },
    sellerOwnerId: { type: Schema.Types.ObjectId, required: true, index: true },
    buyer: {
      firstName: { type: String },
      lastName: { type: String },
      email: { type: String, required: true },
    },
    seller: {
      venueName: { type: String, required: true },
      companyName: { type: String },
      siret: { type: String },
      legalStatus: { type: String },
      ownerFirstName: { type: String },
      ownerLastName: { type: String },
      contactName: { type: String },
      address: { type: String, required: true },
      postalCode: { type: String, required: true },
      city: { type: String, required: true },
      country: { type: String, required: true },
    },
    lines: { type: [invoiceLineSchema], default: [] },
    subtotal: { type: Number, required: true },
    currency: { type: String, required: true, default: 'EUR' },
    paymentStatus: { type: String, enum: ['paid', 'refund_pending', 'refunded'], required: true },
    paidAmount: { type: Number },
    paidAt: { type: Date },
    refundedAmount: { type: Number },
    refundedAt: { type: Date },
    stripePaymentIntentId: { type: String },
    stripeSessionId: { type: String },
  },
  { timestamps: true }
);

export const InvoiceModel = mongoose.model<InvoiceDocument>('Invoice', invoiceSchema);
