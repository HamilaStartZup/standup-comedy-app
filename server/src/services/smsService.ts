import twilio from 'twilio';
import { config } from '../config/env';

/**
 * Convertit un numéro français (06...) ou belge (04...) en format E.164
 */
export function toE164(phone: string): string {
  const clean = phone.replace(/[\s\-\(\)\.]/g, '').replace(/^\+/, '');
  if (clean.startsWith('33') && clean.length === 11) return `+${clean}`;
  if (clean.startsWith('32') && clean.length >= 10 && clean.length <= 11) return `+${clean}`;
  if (clean.startsWith('0') && clean.length === 10) {
    return `+33${clean.slice(1)}`; // France par défaut
  }
  if (clean.startsWith('0') && (clean.length === 9 || clean.length === 10)) {
    if (clean.startsWith('04') || clean.length === 9) {
      return `+32${clean.slice(1)}`; // Belgique
    }
    return `+33${clean.slice(1)}`; // France
  }
  return clean.startsWith('+') ? clean : `+${clean}`;
}

/**
 * Envoie un code de vérification via Twilio Verify API
 * POST https://verify.twilio.com/v2/Services/{Sid}/Verifications
 */
export async function sendSmsVerificationCode(phone: string): Promise<void> {
  if (!config.twilio.accountSid || !config.twilio.authToken) {
    throw new Error('Configuration Twilio manquante (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)');
  }
  if (!config.twilio.verifyServiceSid) {
    throw new Error('TWILIO_VERIFY_SERVICE_SID est requis pour la vérification SMS');
  }

  const client = twilio(config.twilio.accountSid, config.twilio.authToken);
  const to = toE164(phone);

  await client.verify.v2
    .services(config.twilio.verifyServiceSid)
    .verifications.create({ to, channel: 'sms' });
}

/**
 * Vérifie un code saisi par l'utilisateur via Twilio Verify API
 * POST https://verify.twilio.com/v2/Services/{Sid}/VerificationCheck
 */
export async function verifySmsCode(phone: string, code: string): Promise<boolean> {
  if (!config.twilio.accountSid || !config.twilio.authToken || !config.twilio.verifyServiceSid) {
    throw new Error('Configuration Twilio Verify manquante');
  }

  const client = twilio(config.twilio.accountSid, config.twilio.authToken);
  const to = toE164(phone);

  const check = await client.verify.v2
    .services(config.twilio.verifyServiceSid)
    .verificationChecks.create({ to, code: code.trim() });

  return check.status === 'approved';
}
