import mongoose, { Document, Schema } from 'mongoose';

/**
 * Interface for OAuth state document
 * Used to store PKCE code verifier and state during OAuth flow
 */
export interface IOAuthState extends Document {
  state: string;
  codeVerifier: string;
  nonce: string; // Protection contre les replay attacks
  userType?: 'COMEDIAN' | 'ORGANIZER' | 'SPECTATOR';
  createdAt: Date;
}

/**
 * Schema for OAuth state with TTL index
 * Documents are automatically deleted after 10 minutes (600 seconds)
 */
const OAuthStateSchema = new Schema<IOAuthState>({
  state: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  codeVerifier: {
    type: String,
    required: true
  },
  nonce: {
    type: String,
    required: true
  },
  userType: {
    type: String,
    enum: ['COMEDIAN', 'ORGANIZER', 'SPECTATOR'],
    required: false
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 600 // TTL: 10 minutes - MongoDB automatically deletes expired documents
  }
});

export const OAuthStateModel = mongoose.model<IOAuthState>('OAuthState', OAuthStateSchema);
