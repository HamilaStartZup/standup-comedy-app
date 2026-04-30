import type { IUserData } from './user';

export type CancellationPolicy = 'flexible' | 'moderate' | 'firm';

export const CANCELLATION_POLICIES = [
  { value: 'flexible' as CancellationPolicy, label: 'Flexible' },
  { value: 'moderate' as CancellationPolicy, label: 'Modérée' },
  { value: 'firm' as CancellationPolicy, label: 'Stricte' },
];

export const CANCELLATION_POLICY_LABELS: Record<CancellationPolicy, string> = {
  flexible: 'Flexible',
  moderate: 'Modérée',
  firm: 'Stricte',
};

export const CANCELLATION_POLICY_DESCRIPTIONS: Record<CancellationPolicy, string> = {
  flexible: 'Remboursement intégral si annulation ≥ 24h avant l\'événement. Aucun remboursement < 24h.',
  moderate: 'Remboursement intégral si annulation ≥ 5 jours avant l\'événement. Aucun remboursement < 5 jours.',
  firm: 'Remboursement intégral ≥ 30 jours avant. 50% entre 7 et 30 jours. Aucun remboursement < 7 jours.',
};

export const VENUE_TYPES = [
  { value: 'bar', label: 'Bar' },
  { value: 'theatre', label: 'Théâtre' },
  { value: 'cinema', label: 'Cinéma' },
  { value: 'cafe_theatre', label: 'Café-théâtre' },
  { value: 'comedy_club', label: 'Comedy Club' },
  { value: 'salle_municipale', label: 'Salle municipale' },
  { value: 'salle_polyvalente', label: 'Salle polyvalente' },
  { value: 'salle_des_fetes', label: 'Salle des fêtes' },
  { value: 'autre', label: 'Autre' },
] as const;

export const VENUE_TYPE_LABELS: Record<string, string> = {
  bar: 'Bar',
  theatre: 'Théâtre',
  cinema: 'Cinéma',
  cafe_theatre: 'Café-théâtre',
  comedy_club: 'Comedy Club',
  salle_municipale: 'Salle municipale',
  salle_polyvalente: 'Salle polyvalente',
  salle_des_fetes: 'Salle des fêtes',
  autre: 'Autre',
};

export const EQUIPMENT_OPTIONS = [
  'Sonorisation', 'Micros', 'Éclairage', 'Projecteur', 'Écran', 'Régie technique', 'Wi-Fi', 'Climatisation', 'Chauffage', 'Piano',
] as const;

export const CONFIGURATION_TYPES = [
  { value: 'frontal', label: 'Frontal' },
  { value: 'gradins', label: 'Gradins' },
  { value: 'cabaret', label: 'Cabaret' },
  { value: 'cinema', label: 'Cinéma' },
  { value: 'modulable', label: 'Modulable' },
] as const;

export const PRICING_TYPES = [
  { value: 'heure', label: 'À l\'heure' },
  { value: 'demi_journee', label: 'Demi-journée' },
  { value: 'journee', label: 'Journée' },
  { value: 'soiree', label: 'Soirée' },
  { value: 'forfait', label: 'Forfait' },
  { value: 'pourcentage_billetterie', label: '% billetterie' },
  { value: 'gratuit', label: 'Gratuit' },
] as const;

export const PRICING_TYPE_LABELS: Record<string, string> = {
  heure: '/heure',
  demi_journee: '/demi-journée',
  journee: '/journée',
  soiree: '/soirée',
  forfait: 'forfait',
  pourcentage_billetterie: '% billetterie',
  gratuit: 'gratuit',
};

export const PRICING_TYPE_LABELS_DISPLAY: Record<string, string> = {
  heure: 'À l\'heure',
  demi_journee: 'Demi-journée',
  journee: 'Journée complète',
  soiree: 'Soirée',
  forfait: 'Forfait',
  pourcentage_billetterie: '% billetterie',
  gratuit: 'Gratuit',
};

export function getPricingLabel(pricingType?: string | null): string {
  return pricingType ? PRICING_TYPE_LABELS[pricingType] || '/soirée' : '/soirée';
}

export const BOOKING_MODES = [
  { value: 'manual', label: 'Manuel (validation requise)' },
  { value: 'automatic', label: 'Automatique' },
] as const;

export const ACCEPTED_EVENT_TYPES = [
  'Stand-up', 'One-man-show', 'Théâtre', 'Projection film', 'Répétition', 'Tournage', 'Événement privé',
] as const;

export interface IExtraFee {
  description: string;
  amount: number;
}

export interface IVenueTimeRestrictions {
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
}

export interface IVenue {
  _id: string;
  name: string;
  owner: IUserData;
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
  isDeleted?: boolean;
  createdAt: string;
  updatedAt: string;
  // Étape 1
  shortDescription?: string;
  fullDescription?: string;
  mainPhoto?: string;
  gallery?: string[];
  // Étape 2
  addressComplement?: string;
  // Étape 3
  seatedCapacity?: number;
  standingCapacity?: number;
  stageArea?: number;
  configurationType?: 'frontal' | 'gradins' | 'cabaret' | 'cinema' | 'modulable';
  dressingRooms?: number;
  accessiblePMR?: boolean;
  parkingAvailable?: boolean;
  // Étape 5
  currency?: string;
  pricingType?: 'heure' | 'demi_journee' | 'journee' | 'soiree' | 'forfait' | 'pourcentage_billetterie' | 'gratuit';
  deposit?: number;
  extraFees?: IExtraFee[];
  bookingMode?: 'manual' | 'automatic';
  minBookingDelay?: number;
  minDuration?: number;
  maxDuration?: number;
  acceptedEventTypes?: string[];
  cancellationConditions?: string;
  houseRules?: string;
  timeRestrictions?: IVenueTimeRestrictions;
  // Étape 6
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  legalStatus?: string;
  siret?: string;
  invoicingAvailable?: boolean;
}

export type VenueBookingStatus =
  | 'PENDING'
  | 'ACCEPTED'
  | 'REFUSED'
  | 'CONFIRMED'
  | 'CANCELLED_BY_OWNER'
  | 'CANCELLED_BY_REQUESTER'
  | 'EXPIRED';

export interface IVenueBooking {
  _id: string;
  venue: IVenue;
  requester: IUserData;
  requestedDate: string;
  startTime: string;
  endTime: string;
  message?: string;
  status: VenueBookingStatus;
  ownerResponse?: string;
  paymentStatus: 'none' | 'pending' | 'paid' | 'refund_pending' | 'refunded';
  paidAmount?: number;
  paidAt?: string;
  paymentDeadlineAt?: string;
  refundedAmount?: number;
  stripeRefundId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface IVenueBlockedDate {
  _id: string;
  venue: string;
  date: string;
  startTime?: string;
  endTime?: string;
  reason?: string;
}
