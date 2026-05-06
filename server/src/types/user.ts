import { Types } from 'mongoose';
import { RecommendationPreferences } from './recommendation';

export interface ILocation {
  city: string;
  postalCode: string;
  address?: string;
  latitude?: number;
  longitude?: number;
}

export interface Performance {
  eventId: Types.ObjectId;
  date: Date;
  duration: number;
  videoLink?: string;
  feedback?: string;
}

export interface MobilityZone {
  type: 'ville' | 'departement' | 'region';
  value: string; // Nom de la ville, département ou région
}

export interface UserProfile {
  bio?: string;
  experience?: number;
  speciality?: string;
  numberOfScenes?: '0-50' | '50-200' | '200+';
  comedyStyle?: ('stand-up' | 'improvisation' | 'plateau' | 'sketch')[];
  performanceLanguages?: ('francais' | 'arabe' | 'anglais' | 'italien' | 'espagnol')[];
  mobilityZone?: MobilityZone[]; // Zone de mobilité : villes, départements ou régions
  socialLinks?: {
    youtube?: string;
    instagram?: string;
    facebook?: string;
    twitter?: string;
  };
  performances?: Performance[];
  recommendationPreferences?: RecommendationPreferences;
}

export interface IOrganisateurProfile {
  companyName?: string;
  location?: ILocation;
  description?: string;
  website?: string;
  venueTypes?: string[];
  averageBudget?: {
    min?: number;
    max?: number;
  };
  eventFrequency?: 'weekly' | 'monthly' | 'occasional';
  phone?: string;
}

export interface User {
  email: string;
  password?: string;
  firstName: string;
  lastName: string;
  city?: string;
  birthDate?: Date;
  latitude?: number;
  longitude?: number;
  spectatorPreferences?: {
    radiusKm?: number;
    dailyRecapEmail?: boolean;
    lastDailyRecapAt?: Date;
  };
  role: 'COMEDIAN' | 'ORGANIZER' | 'SUPER_ADMIN' | 'SPECTATOR' | 'LIEU';
  profile?: UserProfile;
  organizerProfile?: IOrganisateurProfile;
  stats?: any;
  onboardingCompleted?: boolean;
  emailVerified?: boolean;
  avatarUrl?: string | null;
  avatar?: {
    data?: Buffer;
    contentType?: string;
    uploadedAt?: Date;
  };
  favoriteComedians?: Types.ObjectId[];
  favoriteEvents?: Types.ObjectId[];
  favoriteApplications?: Types.ObjectId[];
  createdAt?: Date;
  updatedAt?: Date;
  lastLoginAt?: Date;
  phone?: string;
  address?: string;
  gender?: 'femme' | 'homme';
  emailSubscriptions?: {
    globalSubscribed: boolean;
    unsubscribedAt?: Date;
    unsubscribeToken?: string;
  };
  keycloakId?: string;
  // Champs de gestion de desactivation de compte
  isActive?: boolean;
  deactivatedAt?: Date;
  deactivatedBy?: Types.ObjectId;
  deactivationReason?: string;
  // Restriction temporaire (ex: signalement en cours)
  isRestricted?: boolean;
  restrictedAt?: Date;
  // Permet d'afficher le switch retour vers le compte LIEU
  canSwitchToLieu?: boolean;
  // Consentement RGPD
  consent?: {
    termsAccepted?: boolean;
    termsAcceptedAt?: Date;
    termsVersion?: string;
    privacyAccepted?: boolean;
    privacyAcceptedAt?: Date;
    privacyVersion?: string;
    isAdult?: boolean;
  };
}

// Interface for a user document after being populated
export interface IPopulatedUser {
  _id: Types.ObjectId;
  firstName: string;
  lastName: string;
  email: string;
  role: 'COMEDIAN' | 'ORGANIZER' | 'SUPER_ADMIN' | 'SPECTATOR' | 'LIEU';
  // Add other fields that might be populated and needed, e.g., companyName, city
  companyName?: string;
  city?: string;
  organizerProfile?: IOrganisateurProfile;
  profile?: UserProfile;
}