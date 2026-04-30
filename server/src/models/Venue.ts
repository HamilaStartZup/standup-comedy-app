import mongoose, { Schema, Document, Types } from 'mongoose';
import { getDepartmentFromPostalCode } from '../utils/cityMapping';
import { DEPARTMENT_TO_REGION } from '../utils/geographicMatching';

export type CancellationPolicy = 'flexible' | 'moderate' | 'firm';

export interface VenueDocument extends Document {
  name: string;
  owner: Types.ObjectId;
  description: string;
  address: string;
  city: string;
  postalCode: string;
  country: string;
  latitude?: number;
  longitude?: number;
  photos: string[];
  equipment: string[];
  capacity: number;
  pricePerEvent: number;
  venueType: 'bar' | 'theatre' | 'cinema' | 'cafe_theatre' | 'comedy_club' | 'salle_municipale' | 'salle_polyvalente' | 'salle_des_fetes' | 'autre';
  cancellationPolicy: CancellationPolicy;
  isActive: boolean;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
  // Étape 1 — Présentation
  shortDescription?: string;
  fullDescription?: string;
  // Étape 2 — Localisation
  addressComplement?: string;
  // Étape 3 — Capacité & configuration
  seatedCapacity?: number;
  standingCapacity?: number;
  stageArea?: number;
  configurationType?: 'frontal' | 'gradins' | 'cabaret' | 'cinema' | 'modulable';
  dressingRooms?: number;
  accessiblePMR?: boolean;
  parkingAvailable?: boolean;
  // Étape 5 — Tarifs & conditions
  currency?: string;
  pricingType?: 'heure' | 'demi_journee' | 'journee' | 'soiree' | 'forfait' | 'pourcentage_billetterie' | 'gratuit';
  deposit?: number;
  extraFees?: { description: string; amount: number }[];
  bookingMode?: 'manual' | 'automatic';
  minBookingDelay?: number;
  minDuration?: number;
  maxDuration?: number;
  acceptedEventTypes?: string[];
  cancellationConditions?: string;
  houseRules?: string;
  // Restrictions horaires
  timeRestrictions?: {
    openTime?: string;
    closeTime?: string;
    matinEnabled?: boolean;
    matinStart?: string;
    matinEnd?: string;
    apremEnabled?: boolean;
    apremStart?: string;
    apremEnd?: string;
    soireeStart?: string;
    soireeEnd?: string;
  };
  // Étape 6 — Contact & légal
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  legalStatus?: string;
  siret?: string;
  invoicingAvailable?: boolean;
  department?: string;
  region?: string;
}

const venueSchema = new Schema<VenueDocument>(
  {
    name: { type: String, required: true, trim: true, maxlength: 200 },
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    description: { type: String, required: true, maxlength: 2000 },
    address: { type: String, required: true },
    city: { type: String, required: true },
    postalCode: { type: String, required: true },
    country: { type: String, required: true },
    latitude: { type: Number },
    longitude: { type: Number },
    photos: [{ type: String }],
    equipment: [{ type: String }],
    capacity: { type: Number, required: true, min: 1 },
    pricePerEvent: { type: Number, required: true, min: 0 },
    venueType: {
      type: String,
      enum: ['bar', 'theatre', 'cinema', 'cafe_theatre', 'comedy_club', 'salle_municipale', 'salle_polyvalente', 'salle_des_fetes', 'autre'],
      required: true,
    },
    cancellationPolicy: {
      type: String,
      enum: ['flexible', 'moderate', 'firm'],
      default: 'moderate',
    },
    isActive: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false, index: true },
    // Étape 1
    shortDescription: { type: String, maxlength: 300 },
    fullDescription: { type: String },
    // Étape 2
    addressComplement: { type: String },
    // Étape 3
    seatedCapacity: { type: Number },
    standingCapacity: { type: Number },
    stageArea: { type: Number },
    configurationType: { type: String, enum: ['frontal', 'gradins', 'cabaret', 'cinema', 'modulable'] },
    dressingRooms: { type: Number },
    accessiblePMR: { type: Boolean },
    parkingAvailable: { type: Boolean },
    // Étape 5
    currency: { type: String, default: 'EUR' },
    pricingType: { type: String, enum: ['heure', 'demi_journee', 'journee', 'soiree', 'forfait', 'pourcentage_billetterie', 'gratuit'] },
    deposit: { type: Number },
    extraFees: [{ description: { type: String }, amount: { type: Number } }],
    bookingMode: { type: String, enum: ['manual', 'automatic'] },
    minBookingDelay: { type: Number },
    minDuration: { type: Number },
    maxDuration: { type: Number },
    acceptedEventTypes: [{ type: String }],
    cancellationConditions: { type: String },
    houseRules: { type: String },
    timeRestrictions: {
      openTime: { type: String },
      closeTime: { type: String },
      matinEnabled: { type: Boolean },
      matinStart: { type: String },
      matinEnd: { type: String },
      apremEnabled: { type: Boolean },
      apremStart: { type: String },
      apremEnd: { type: String },
      soireeStart: { type: String },
      soireeEnd: { type: String },
    },
    // Étape 6
    contactName: { type: String },
    contactEmail: { type: String },
    contactPhone: { type: String },
    legalStatus: { type: String },
    siret: { type: String },
    invoicingAvailable: { type: Boolean },
    department: { type: String, index: true },
    region: { type: String, index: true },
  },
  { timestamps: true }
);

venueSchema.index({ city: 1 });
venueSchema.index({ owner: 1, isActive: 1 });

venueSchema.pre('save', function (next) {
  if (this.isModified('postalCode') || this.isNew) {
    const dept = getDepartmentFromPostalCode(this.postalCode);
    this.department = dept ?? undefined;
    this.region = dept ? (DEPARTMENT_TO_REGION[dept] ?? undefined) : undefined;
  }
  next();
});

export const VenueModel = mongoose.model<VenueDocument>('Venue', venueSchema);
