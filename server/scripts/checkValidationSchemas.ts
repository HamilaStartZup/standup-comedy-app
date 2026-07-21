import assert from 'assert';
import {
  locationSchema,
  updateLocationSchema,
  createVenueSchema,
  updateVenueSchema,
  updateProfileSchema,
} from '../src/validation/schemas';

function assertOk(result: { success: boolean }, label: string) {
  assert.strictEqual(result.success, true, `attendu succès: ${label}`);
}

function assertFails(result: { success: boolean; error?: { issues: { message: string }[] } }, label: string, message?: string) {
  assert.strictEqual(result.success, false, `attendu échec: ${label}`);
  if (message && !result.success) {
    const messages = result.error!.issues.map((i) => i.message);
    assert.ok(messages.includes(message), `${label}: message attendu "${message}", reçu ${JSON.stringify(messages)}`);
  }
}

// locationSchema.postalCode → optionnel mais 5 chiffres si fourni
assertOk(
  locationSchema.safeParse({ venue: 'V', address: 'A', city: 'C', country: 'France' }),
  'locationSchema sans postalCode'
);
assertFails(
  locationSchema.safeParse({ venue: 'V', address: 'A', city: 'C', country: 'France', postalCode: 'abcde' }),
  'locationSchema postalCode non numérique',
  'Le code postal doit contenir 5 chiffres'
);

// updateLocationSchema → CP regex + lat/lng bornés
assertFails(
  updateLocationSchema.safeParse({ postalCode: '123' }),
  'updateLocationSchema postalCode 3 chiffres'
);
assertFails(
  updateLocationSchema.safeParse({ latitude: 91 }),
  'updateLocationSchema latitude > 90'
);
assertFails(
  updateLocationSchema.safeParse({ longitude: -181 }),
  'updateLocationSchema longitude < -180'
);
assertOk(
  updateLocationSchema.safeParse({ postalCode: '75001', latitude: 45.5, longitude: 2.3 }),
  'updateLocationSchema valide'
);

// createVenueSchema / updateVenueSchema → CP regex + lat/lng bornés
const baseVenue = {
  name: 'Salle', description: 'Une description suffisamment longue.',
  address: 'A', city: 'C', country: 'France',
  capacity: 10, pricePerEvent: 0, venueType: 'bar' as const,
};
assertFails(
  createVenueSchema.safeParse({ ...baseVenue, postalCode: '123' }),
  'createVenueSchema postalCode 3 chiffres'
);
assertOk(
  createVenueSchema.safeParse({ ...baseVenue, postalCode: '75001' }),
  'createVenueSchema postalCode valide'
);
assertFails(
  updateVenueSchema.safeParse({ latitude: 200 }),
  'updateVenueSchema latitude hors bornes'
);

// updateProfileSchema.city → optionnel, pas de minimum (ex: commune 'Y'), max 50
assertOk(updateProfileSchema.safeParse({ city: '' }), 'updateProfileSchema city vide toléré');
assertOk(updateProfileSchema.safeParse({ city: 'Y' }), 'updateProfileSchema city 1 caractère toléré');
assertOk(updateProfileSchema.safeParse({ city: 'Paris' }), 'updateProfileSchema city valide');

console.log('checkValidationSchemas: OK');
