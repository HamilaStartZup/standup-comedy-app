export const PHONE_VALIDATION_MESSAGE =
  'Numéro invalide (format local FR/BE ou international avec indicatif, ex. +224 621 00 00 00)';

/**
 * Valide un numéro local FR/BE ou international (E.164 : +indicatif…).
 */
export function isValidPhoneNumber(phone: string, options?: { allowEmpty?: boolean }): boolean {
  const value = phone.trim();
  if (!value) return options?.allowEmpty ?? false;

  const normalized = value.replace(/[\s\-\(\)\.]/g, '');

  if (/^\+\d{7,15}$/.test(normalized)) return true;
  if (/^00\d{8,15}$/.test(normalized)) return true;

  const frenchPhoneRegex = /^(0[1-9])[0-9]{8}$/;
  const belgianPhoneRegex = /^(0[1-9][0-9]{7,8})$/;
  return frenchPhoneRegex.test(normalized) || belgianPhoneRegex.test(normalized);
}
