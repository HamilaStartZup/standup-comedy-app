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
  {
    name: "Le Paris de l'Humour",
    type: 'salle_spectacle',
    email: 'marineleclezio@yahoo.fr',
    phone: normalizePhoneFR('06 12 63 24 61'),
    address: {
      street: '8 rue Pradier',
      city: 'Paris',
      postalCode: '75019',
      departement: '75',
      departementName: FRENCH_DEPARTMENTS['75'],
    },
    website: 'https://www.leparisdelhumour.com',
    source: 'manuel',
  },
  {
    name: 'Les Ami(E)S Du Comedy Club',
    type: 'autre',
    email: null,
    phone: normalizePhoneFR('07 78 12 81 46'),
    address: {
      city: 'Paris',
      departement: '75',
      departementName: FRENCH_DEPARTMENTS['75'],
    },
    website: null,
    source: 'manuel',
  },
  {
    name: 'La Ferme Comedy Club',
    type: 'autre',
    email: null,
    phone: null,
    address: {
      street: '5 rue des Petites Écuries',
      city: 'Paris',
      postalCode: '75010',
      departement: '75',
      departementName: FRENCH_DEPARTMENTS['75'],
    },
    website: null,
    source: 'manuel',
  },
  {
    name: 'Studio Asnières',
    type: 'salle_spectacle',
    email: 'info@studio-asnieres.com',
    phone: normalizePhoneFR('+33 1 47 90 95 33'),
    address: {
      street: '3 rue Edmond Fantin',
      city: 'Asnières-sur-Seine',
      postalCode: '92600',
      departement: '92',
      departementName: FRENCH_DEPARTMENTS['92'],
    },
    website: null,
    source: 'manuel',
  },
  {
    name: 'Dopo x Le Stand Up Club',
    type: 'autre',
    email: 'alexia@stand-up-club.com',
    phone: null,
    address: {
      street: '63-64 quai Georges Gorse',
      city: 'Boulogne-Billancourt',
      postalCode: '92100',
      departement: '92',
      departementName: FRENCH_DEPARTMENTS['92'],
    },
    website: null,
    source: 'manuel',
  },
  {
    name: 'All In Comedy Club',
    type: 'autre',
    email: null,
    phone: normalizePhoneFR('06 61 41 13 03'),
    address: {
      city: 'Boulogne-Billancourt',
      postalCode: '92100',
      departement: '92',
      departementName: FRENCH_DEPARTMENTS['92'],
    },
    website: null,
    source: 'manuel',
  },
  {
    name: 'Maison de la musique de Nanterre',
    type: 'centre_culturel',
    email: null,
    phone: normalizePhoneFR('01 41 37 94 21'),
    address: {
      street: '8 rue des Anciennes-Mairies',
      city: 'Nanterre',
      postalCode: '92000',
      departement: '92',
      departementName: FRENCH_DEPARTMENTS['92'],
    },
    website: null,
    source: 'manuel',
  },
  {
    name: 'Quartier de la Gare / Agora',
    type: 'centre_culturel',
    email: null,
    phone: normalizePhoneFR('01 81 87 34 92'),
    address: {
      street: '50 avenue Carnot',
      city: 'Massy',
      postalCode: '91300',
      departement: '91',
      departementName: FRENCH_DEPARTMENTS['91'],
    },
    website: null,
    source: 'manuel',
  },
  {
    name: 'Soirée Stand-Up !',
    type: 'autre',
    email: null,
    phone: normalizePhoneFR('01 81 87 34 92'),
    address: {
      street: '50 avenue Carnot',
      city: 'Massy',
      postalCode: '91300',
      departement: '91',
      departementName: FRENCH_DEPARTMENTS['91'],
    },
    website: null,
    source: 'manuel',
  },
  {
    name: 'Caméléon Comedy Club',
    type: 'autre',
    email: 'objectif.reussite@hotmail.fr',
    phone: null,
    address: {
      street: 'Salle Caméléon, Avenue Redouane Bougara',
      city: 'Pontoise',
      postalCode: '95300',
      departement: '95',
      departementName: FRENCH_DEPARTMENTS['95'],
    },
    website: null,
    source: 'manuel',
  },
  {
    name: 'Espace Simone-Veil',
    type: 'salle_spectacle',
    email: 'vaad.accueil.simoneveil@ville-lesmureaux.fr',
    phone: null,
    address: {
      city: 'Les Mureaux',
      postalCode: '78130',
      departement: '78',
      departementName: FRENCH_DEPARTMENTS['78'],
    },
    website: null,
    source: 'manuel',
  },
  {
    name: 'Espace Georges-Brassens',
    type: 'salle_spectacle',
    email: 'vaad.accueil.brassens@ville-lesmureaux.fr',
    phone: null,
    address: {
      city: 'Les Mureaux',
      postalCode: '78130',
      departement: '78',
      departementName: FRENCH_DEPARTMENTS['78'],
    },
    website: null,
    source: 'manuel',
  },
  {
    name: 'Espace SRV / Espace des Habitants',
    type: 'salle_spectacle',
    email: 'locationdesalles@ville-lesmureaux.fr',
    phone: null,
    address: {
      city: 'Les Mureaux',
      postalCode: '78130',
      departement: '78',
      departementName: FRENCH_DEPARTMENTS['78'],
    },
    website: null,
    source: 'manuel',
  },
  {
    name: 'Espace Colette-Besson',
    type: 'salle_spectacle',
    email: 'vaad.accueil.gerardphilipe@ville-lesmureaux.fr',
    phone: null,
    address: {
      city: 'Les Mureaux',
      postalCode: '78130',
      departement: '78',
      departementName: FRENCH_DEPARTMENTS['78'],
    },
    website: null,
    source: 'manuel',
  },
  {
    name: 'Espace de Bècheville',
    type: 'salle_spectacle',
    email: 'vaad.accueil.becheville@ville-lesmureaux.fr',
    phone: null,
    address: {
      city: 'Les Mureaux',
      postalCode: '78130',
      departement: '78',
      departementName: FRENCH_DEPARTMENTS['78'],
    },
    website: null,
    source: 'manuel',
  },
  {
    name: 'Billetterie des Mureaux / Salle Micro Folie',
    type: 'salle_spectacle',
    email: 'billetterie@ville-lesmureaux.fr',
    phone: null,
    address: {
      city: 'Les Mureaux',
      postalCode: '78130',
      departement: '78',
      departementName: FRENCH_DEPARTMENTS['78'],
    },
    website: null,
    source: 'manuel',
  },
  {
    name: 'Le Prisme',
    type: 'salle_spectacle',
    email: 'reservations.prisme@ville-elancourt.fr',
    phone: null,
    address: {
      street: 'Centre commercial des 7 Mares',
      city: 'Élancourt',
      postalCode: '78990',
      departement: '78',
      departementName: FRENCH_DEPARTMENTS['78'],
    },
    website: null,
    source: 'manuel',
  },
  {
    name: 'Espace Paul Eluard',
    type: 'salle_spectacle',
    email: 'resaepe@stains.fr',
    phone: null,
    address: {
      city: 'Stains',
      postalCode: '93240',
      departement: '93',
      departementName: FRENCH_DEPARTMENTS['93'],
    },
    website: null,
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
