import { Types } from 'mongoose';
import { IPopulatedUser } from './user';

export interface Location {
  venue?: string;
  venueType?: 'theatre' | 'salle_polyvalente' | 'cafe' | 'restaurant' | 'autre';
  address: string;
  city: string;
  postalCode?: string;
  department?: string;
  country: string;
  latitude?: number;
  longitude?: number;
}

export interface EventRequirements {
  minExperience: number;
  maxPerformers?: number;
  duration: number;
  requiredExperienceLevel?: 'all' | '0-50' | '50-200' | '200+';
}

export interface IPopulatedEvent extends Event {
  organizer: IPopulatedUser;
}

export interface Event {
  title: string;
  description: string;
  date: Date;
  location: Location;
  organizer: Types.ObjectId | IPopulatedUser;
  status: 'draft' | 'published' | 'cancelled' | 'completed';
  requirements: EventRequirements;
  applications: Types.ObjectId[];
  participants: Types.ObjectId[] | IPopulatedUser[];
  maxSpectators?: number;
}

export interface PerformanceDetails {
  duration: number;
  description: string;
  videoLink?: string;
}

export interface IPopulatedApplication extends Application {
  event: IPopulatedEvent;
  comedian: IPopulatedUser;
}

export interface Application {
  event: Types.ObjectId | IPopulatedEvent;
  comedian: Types.ObjectId | IPopulatedUser;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED' | 'WITHDRAWN' | 'CANCELLED_BY_PLATFORM';
  performanceDetails: PerformanceDetails;
}

/**
 * Interface pour les données de relance organisateur
 * Utilisée par le système de cron pour envoyer des rappels automatiques
 */
export interface OrganizerReminderData {
  organizer: {
    email: string;
    firstName?: string;
    lastName?: string;
  };
  event: {
    _id: any;
    title: string;
    date: Date;
    location?: Location;
    startTime?: string;
  };
  daysRemaining: number;
  currentCount: number;
  targetCount: number;
  pendingApplicationsCount: number;
} 