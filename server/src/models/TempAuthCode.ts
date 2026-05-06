import mongoose, { Document, Schema } from 'mongoose';

/**
 * Interface for temporary auth code document
 * Used for two purposes:
 * 1. Exchange a short-lived code for tokens (login flow) - token required
 * 2. Pending registration after OAuth (registration flow) - pendingRegistration required
 */
export interface ITempAuthCode extends Document {
  code: string;
  // Login flow fields
  token?: string;
  accessToken?: string;
  refreshToken?: string;
  idToken?: string;
  // Pending registration fields (when userType was passed and user doesn't exist)
  pendingRegistration?: boolean;
  email?: string;
  firstName?: string;
  lastName?: string;
  keycloakId?: string;
  userType?: 'COMEDIAN' | 'ORGANIZER' | 'SPECTATOR';
  keycloakAccessToken?: string;
  keycloakRefreshToken?: string;
  keycloakIdToken?: string;
  createdAt: Date;
}

/**
 * Schema for temporary auth code with TTL index
 * Documents are automatically deleted after 10 minutes (600 seconds)
 * Regular login codes are deleted on use (one-time); pending registrations
 * persist until the user completes the form or the TTL expires.
 */
const TempAuthCodeSchema = new Schema<ITempAuthCode>({
  code: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  // Login flow
  token: String,
  accessToken: String,
  refreshToken: String,
  idToken: String,
  // Pending registration flow
  pendingRegistration: { type: Boolean, default: false },
  email: String,
  firstName: String,
  lastName: String,
  keycloakId: String,
  userType: {
    type: String,
    enum: ['COMEDIAN', 'ORGANIZER', 'SPECTATOR'],
  },
  keycloakAccessToken: String,
  keycloakRefreshToken: String,
  keycloakIdToken: String,
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 120 // TTL: 2 minutes (réduit pour limiter l'exposition des tokens chiffrés)
  }
});

export const TempAuthCodeModel = mongoose.model<ITempAuthCode>('TempAuthCode', TempAuthCodeSchema);
