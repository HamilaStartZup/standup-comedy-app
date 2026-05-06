import type { IUserData } from './user';

export interface IEvent {
  _id: string;
  title: string;
  description: string;
  date: string;
  time?: string;
  startTime?: string;
  endTime?: string;
  location: { venue?: string; venueType?: 'theatre' | 'salle_polyvalente' | 'cafe' | 'restaurant' | 'autre'; address: string; city: string; postalCode?: string; department?: string; country: string; latitude?: number; longitude?: number; };
  organizer: IUserData;
  status: 'DRAFT' | 'PUBLISHED' | 'CANCELLED' | 'COMPLETED' | 'draft' | 'published' | 'cancelled' | 'completed';
  requirements: { 
    minExperience: number; 
    maxPerformers: number; 
    duration: number;
    requiredExperienceLevel?: 'all' | '0-50' | '50-200' | '200+';
  };
  applications: string[];
  participants: IUserData[];
  /** IDs ou refs des spectateurs inscrits */
  spectatorRegistrations?: string[] | IUserData[];
  /** IDs des spectateurs qui se sont désinscrits (réinscription interdite) */
  withdrawnSpectators?: string[];
  maxParticipants: number;
  maxSpectators?: number;
  cancellationReason?: string;
  /** Groupe de récurrence (événements créés ensemble) */
  recurrenceGroupId?: string;
  /** URL de l'image de l'événement (carte spectateur) */
  imageUrl?: string;
} 