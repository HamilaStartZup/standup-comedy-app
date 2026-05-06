export interface ILocation {
  city: string;
  postalCode: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  country?: string; // Add country based on event form
}

export interface IOrganizerProfile {
  companyName?: string;
  location?: ILocation; // Make optional as it might be nested under profile
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

export interface IUserData {
  _id: string;
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'COMEDIAN' | 'ORGANIZER' | 'SUPER_ADMIN' | 'SPECTATOR' | 'LIEU';
  // Fields from User model that might be directly on the user object
  companyName?: string; // If companyName is directly on User for Organizers
  city?: string; // If city is directly on User for Organizers
  phone?: string;
  address?: string;
  birthDate?: string | Date;
  gender?: 'femme' | 'homme';
  // Nested profiles
  profile?: {
    bio?: string;
    experience?: number;
    speciality?: string;
    numberOfScenes?: '0-50' | '50-200' | '200+';
    comedyStyle?: ('stand-up' | 'improvisation' | 'plateau' | 'sketch')[];
    performanceLanguages?: ('francais' | 'arabe' | 'anglais' | 'italien' | 'espagnol')[];
    mobilityZone?: Array<{
      type: 'ville' | 'departement' | 'region';
      value: string;
    }>;
    socialLinks?: {
      youtube?: string;
      instagram?: string;
      facebook?: string;
      twitter?: string;
    };
    // Add other user profile fields here if needed
  };
  organizerProfile?: IOrganizerProfile;
  // Add other common user fields like stats, onboardingCompleted, etc.
  stats?: {
    totalEvents?: number;
    totalRevenue?: number;
    averageRating?: number;
    viralScore?: number;
    profileViews?: number;
    lastActivity?: string; // Use string for Date objects from JSON
    applicationsSent?: number;
    applicationsAccepted?: number;
    netPromoterScore?: number;
    absences?: number;
    lateCancellations?: number;
  };
  onboardingCompleted?: boolean;
  emailVerified?: boolean;
  avatarUrl?: string | null;
  canSwitchToLieu?: boolean;
  createdAt?: string;
  lastLoginAt?: string;
  spectatorPreferences?: {
    radiusKm?: number;
    dailyRecapEmail?: boolean;
    lastDailyRecapAt?: string;
  };
} 