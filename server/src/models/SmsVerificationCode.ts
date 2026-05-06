import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ISmsVerificationCode extends Document {
  phone: string;
  code: string;
  expiresAt: Date;
  verified: boolean;
  createdAt: Date;
}

const smsVerificationCodeSchema = new Schema<ISmsVerificationCode>({
  phone: { type: String, required: true, index: true },
  code: { type: String, required: true },
  expiresAt: { type: Date, required: true, index: true },
  verified: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
}, { timestamps: true });

// TTL index pour supprimer automatiquement les codes expirés (après 15 min)
smsVerificationCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const SmsVerificationCodeModel: Model<ISmsVerificationCode> =
  mongoose.models.SmsVerificationCode || mongoose.model<ISmsVerificationCode>('SmsVerificationCode', smsVerificationCodeSchema);
