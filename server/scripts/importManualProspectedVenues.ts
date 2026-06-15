import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import { config } from '../src/config/env';
import { FRENCH_DEPARTMENTS } from '../src/constants/frenchDepartments';
import { normalizePhoneFR } from '../src/utils/prospectionHelpers';
import { upsertProspectedVenue } from '../src/services/prospection/venueRepository';
import type { ProspectionSearchResult } from '../src/services/prospection/types';

const MANUAL_VENUES: ProspectionSearchResult[] = [
  {
    name: 'Espace Brassens',
    type: 'salle_spectacle',
    email: 'dcordier@manteslajolie.fr',
    phone: normalizePhoneFR('06 42 76 51 19'),
    address: {
      street: '18 rue de Gassicourt',
      city: 'Mantes-la-Jolie',
      postalCode: '78200',
      departement: '78',
      departementName: FRENCH_DEPARTMENTS['78'],
    },
    website: 'https://www.manteslajolie.fr',
    source: 'manuel',
  },
  {
    name: 'Collectif 12',
    type: 'salle_spectacle',
    email: null,
    phone: null,
    address: {
      street: '174 boulevard du Maréchal Juin',
      city: 'Mantes-la-Jolie',
      postalCode: '78200',
      departement: '78',
      departementName: FRENCH_DEPARTMENTS['78'],
    },
    website: 'https://collectif12.org',
    source: 'manuel',
  },
  {
    name: 'La Merise',
    type: 'salle_spectacle',
    email: 'reservation@la-merise.fr',
    phone: normalizePhoneFR('01 30 13 98 51'),
    address: {
      street: 'Place des Merisiers',
      city: 'Trappes',
      postalCode: '78190',
      departement: '78',
      departementName: FRENCH_DEPARTMENTS['78'],
    },
    website: 'https://trappesmag.fr/la-merise',
    source: 'manuel',
  },
  {
    name: 'Le Comedy Club (Jamel Comedy Club)',
    type: 'autre',
    email: 'communication@lecomedyclub.fr',
    phone: null,
    address: {
      street: '42 boulevard Bonne Nouvelle',
      city: 'Paris',
      postalCode: '75010',
      departement: '75',
      departementName: FRENCH_DEPARTMENTS['75'],
    },
    website: 'https://lecomedyclub.com',
    source: 'manuel',
  },
  {
    name: 'Paname Art Café',
    type: 'autre',
    email: null,
    phone: normalizePhoneFR('01 48 06 31 27'),
    address: {
      street: '14 rue de la Fontaine au Roi',
      city: 'Paris',
      postalCode: '75011',
      departement: '75',
      departementName: FRENCH_DEPARTMENTS['75'],
    },
    website: 'https://www.panameartcafe.com',
    source: 'manuel',
  },
  {
    name: 'Madame Sarfati Comedy Club',
    type: 'autre',
    email: null,
    phone: normalizePhoneFR('01 80 06 30 40'),
    address: {
      street: '49 rue Berger',
      city: 'Paris',
      postalCode: '75001',
      departement: '75',
      departementName: FRENCH_DEPARTMENTS['75'],
    },
    website: 'https://www.madamesarfati.com',
    source: 'manuel',
  },
  {
    name: 'Fridge Comedy Club',
    type: 'autre',
    email: 'contact@lefridgecomedy.com',
    phone: normalizePhoneFR('+33 1 83 62 40 40'),
    address: {
      street: '164 rue Saint-Denis',
      city: 'Paris',
      postalCode: '75002',
      departement: '75',
      departementName: FRENCH_DEPARTMENTS['75'],
    },
    website: 'https://lefridgecomedy.com',
    source: 'manuel',
  },
];

async function main(): Promise<void> {
  if (!config.database.url) {
    throw new Error('DATABASE_URL manquante');
  }

  await mongoose.connect(config.database.url);
  console.log('Import de', MANUAL_VENUES.length, 'lieux manuels…\n');

  let created = 0;
  let merged = 0;
  let duplicates = 0;

  for (const venue of MANUAL_VENUES) {
    const status = await upsertProspectedVenue(venue);
    if (status === 'new') created++;
    else if (status === 'merged') merged++;
    else duplicates++;

    const emailLabel = venue.email ?? '(pas d’email)';
    console.log(`  ${status.padEnd(10)} ${venue.name} — ${emailLabel}`);
  }

  console.log(`\nTerminé : ${created} créé(s), ${merged} fusionné(s), ${duplicates} doublon(s) sans changement.`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
