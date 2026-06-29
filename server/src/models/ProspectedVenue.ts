import mongoose, { Schema, Document } from 'mongoose';
import { buildVenueDedupKey } from '../utils/prospectionHelpers';

export type ProspectedVenueType =
  | 'theatre'
  | 'cinema'
  | 'salle_spectacle'
  | 'mjc'
  | 'centre_culturel'
  | 'centre_social'
  | 'autre';

export type ProspectedVenueSource =
  | 'google_places'
  | 'insee_bpe'
  | 'data_gouv'
  | 'openstreetmap'
  | 'scraping'
  | 'manuel';

export type ProspectedEmailStatus =
  | 'non_envoye'
  | 'envoye'
  | 'echec'
  | 'desinscrit'
  | 'repondu';

export interface ProspectedVenueDocument extends Document {
  name: string;
  type: ProspectedVenueType;
  email?: string | null;
  phone?: string | null;
  address: {
    street?: string;
    city?: string;
    postalCode?: string;
    departement?: string;
    departementName?: string;
  };
  website?: string | null;
  /** Clé normalisée (nom + localisation) pour éviter les doublons, insensible à la casse. */
  dedupKey?: string | null;
  source: ProspectedVenueSource;
  emailStatus: ProspectedEmailStatus;
  emailHistory: Array<{
    sentAt: Date;
    campaign: string;
    status: 'envoye' | 'echec';
    error?: string | null;
  }>;
  optOut: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const prospectedVenueSchema = new Schema<ProspectedVenueDocument>(
  {
    name: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: ['theatre', 'cinema', 'salle_spectacle', 'mjc', 'centre_culturel', 'centre_social', 'autre'],
      required: true,
    },
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    address: {
      street: String,
      city: String,
      postalCode: String,
      departement: String,
      departementName: String,
    },
    website: { type: String, trim: true },
    dedupKey: { type: String, trim: true },
    source: {
      type: String,
      enum: ['google_places', 'insee_bpe', 'data_gouv', 'openstreetmap', 'scraping', 'manuel'],
      default: 'google_places',
    },
    emailStatus: {
      type: String,
      enum: ['non_envoye', 'envoye', 'echec', 'desinscrit', 'repondu'],
      default: 'non_envoye',
    },
    emailHistory: [{
      sentAt: { type: Date, required: true },
      campaign: { type: String, required: true },
      status: { type: String, enum: ['envoye', 'echec'], required: true },
      error: { type: String, default: null },
    }],
    optOut: { type: Boolean, default: false },
  },
  { timestamps: true, collection: 'prospected_venues' }
);

// Unicité email uniquement quand l'email est renseigné (évite E11000 sur email: null)
prospectedVenueSchema.index(
  { email: 1 },
  {
    unique: true,
    partialFilterExpression: { email: { $type: 'string', $gt: '' } },
  }
);
prospectedVenueSchema.index({ 'address.departement': 1 });
prospectedVenueSchema.index({ type: 1 });
prospectedVenueSchema.index({ 'address.departement': 1, type: 1 });
prospectedVenueSchema.index({ emailStatus: 1 });
prospectedVenueSchema.index({ name: 1, 'address.postalCode': 1, 'address.departement': 1 });
prospectedVenueSchema.index(
  { dedupKey: 1 },
  {
    unique: true,
    partialFilterExpression: { dedupKey: { $type: 'string', $gt: '' } },
  }
);

export const ProspectedVenueModel = mongoose.model<ProspectedVenueDocument>(
  'ProspectedVenue',
  prospectedVenueSchema
);

/** Corrige l'index legacy (sparse sur null) et nettoie les emails vides en base. */
export async function syncProspectedVenueIndexes(): Promise<void> {
  try {
    await ProspectedVenueModel.collection.dropIndex('email_1');
  } catch {
    // index absent ou déjà remplacé
  }
  await ProspectedVenueModel.syncIndexes();
  await ProspectedVenueModel.updateMany(
    { $or: [{ email: null }, { email: '' }] },
    { $unset: { email: '' } }
  );

  const withoutDedupKey = await ProspectedVenueModel.find({
    $or: [{ dedupKey: { $exists: false } }, { dedupKey: null }, { dedupKey: '' }],
  })
    .select('_id name address')
    .lean();

  for (const venue of withoutDedupKey) {
    const dedupKey = buildVenueDedupKey(venue.name, venue.address ?? {});
    if (!dedupKey) continue;
    await ProspectedVenueModel.updateOne(
      { _id: venue._id },
      { $set: { dedupKey } }
    ).catch(() => {
      // Conflit sur doublon existant — laissé pour fusion manuelle
    });
  }
}
