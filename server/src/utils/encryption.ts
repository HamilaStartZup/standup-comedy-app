import crypto from 'crypto';
import { config } from '../config/env';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

/**
 * Derives a 32-byte encryption key from the JWT secret.
 * In production, use a dedicated ENCRYPTION_KEY env variable.
 */
function getKey(): Buffer {
  return crypto.createHash('sha256').update(config.jwt.secret as string).digest();
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * Returns a base64 string containing IV + ciphertext + auth tag.
 */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  // IV (12) + encrypted + tag (16) → single base64 string
  return Buffer.concat([iv, encrypted, tag]).toString('base64');
}

/**
 * Decrypts a base64 string produced by encrypt().
 */
export function decrypt(encoded: string): string {
  const key = getKey();
  const data = Buffer.from(encoded, 'base64');

  const iv = data.subarray(0, IV_LENGTH);
  const tag = data.subarray(data.length - TAG_LENGTH);
  const ciphertext = data.subarray(IV_LENGTH, data.length - TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  return decipher.update(ciphertext) + decipher.final('utf8');
}