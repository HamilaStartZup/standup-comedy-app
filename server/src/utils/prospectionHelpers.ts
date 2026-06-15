import crypto from 'crypto';
import { config } from '../config/env';

export function generateProspectionUnsubscribeToken(venueId: string, email: string): string {
  const secret = config.email.unsubscribeSecret;
  if (!secret) throw new Error('UNSUBSCRIBE_SECRET is not configured');
  const payload = `prospection:${venueId}:${email.toLowerCase().trim()}`;
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

export function validateProspectionUnsubscribeToken(
  token: string,
  venueId: string,
  email: string
): boolean {
  try {
    if (!token || token.length !== 64 || !/^[a-f0-9]{64}$/.test(token)) return false;
    const expected = generateProspectionUnsubscribeToken(venueId, email);
    return crypto.timingSafeEqual(Buffer.from(token, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}

export function buildCronExpression(joursActifs: number[], heureEnvoi: string): string {
  const [hourStr, minuteStr] = heureEnvoi.split(':');
  const hour = Number(hourStr);
  const minute = Number(minuteStr);
  const days = [...joursActifs].sort((a, b) => a - b).join(',');
  return `${minute} ${hour} * * ${days}`;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email);
}

export function extractEmailsFromHtml(html: string): string[] {
  const matches = html.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) ?? [];
  return [...new Set(matches.map((e) => e.toLowerCase()))];
}

export function normalizePhoneFR(phone: string | undefined | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('33') && digits.length >= 11) return `+${digits}`;
  if (digits.startsWith('0') && digits.length === 10) return `+33${digits.slice(1)}`;
  if (digits.length >= 9) return `+${digits}`;
  return phone.trim();
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
