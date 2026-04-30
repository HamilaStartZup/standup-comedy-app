import { z } from 'zod';

// ============================================================================
// SCHÉMAS D'AUTHENTIFICATION
// ============================================================================

export const registerSchema = z.object({
  email: z.string()
    .email('Format d\'email invalide (ex: nom@domaine.com)')
    .refine((email) => {
      // Validation stricte de l'email
      const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
      if (!emailRegex.test(email.trim())) return false;
      
      // Vérification supplémentaire pour les emails évidents invalides
      const invalidPatterns = [
        /^[^@]*$/, // Pas de @
        /@$/, // @ à la fin
        /^@/, // @ au début
        /\.$/, // Point à la fin
        /^\./, // Point au début
        /\.{2,}/, // Points multiples
        /@{2,}/, // @ multiples
        /[^a-zA-Z0-9.!#$%&'*+/=?^_`{|}~@-]/, // Caractères non autorisés
      ];
      
      return !invalidPatterns.some(pattern => pattern.test(email.trim()));
    }, 'Format d\'email invalide (ex: nom@domaine.com)'),
  phone: z.string()
    .optional()
    .refine((phone) => {
      if (!phone || phone.trim() === '') return true;
      const cleanPhone = phone.replace(/[\s\-\(\)\+]/g, '');
      const frenchPhoneRegex = /^(0[1-9])[0-9]{8}$/;
      const belgianPhoneRegex = /^(0[1-9][0-9]{7,8})$/;
      return frenchPhoneRegex.test(cleanPhone) || belgianPhoneRegex.test(cleanPhone);
    }, 'Numéro de téléphone invalide (format français: 0XXXXXXXXX, format belge: 0XXXXXXXX ou 0XXXXXXXXX)'),
  password: z.string()
    .min(8, 'Le mot de passe doit contenir au moins 8 caractères')
    .regex(/[A-Z]/, 'Le mot de passe doit contenir au moins une majuscule')
    .regex(/[0-9]/, 'Le mot de passe doit contenir au moins un chiffre'),
  firstName: z.string()
    .min(2, 'Le prénom doit contenir au moins 2 caractères')
    .regex(/^[a-zA-ZÀ-ÿ\s'-]+$/, 'Le prénom ne peut contenir que des lettres, espaces, apostrophes et tirets'),
  lastName: z.string()
    .min(2, 'Le nom doit contenir au moins 2 caractères')
    .regex(/^[a-zA-ZÀ-ÿ\s'-]+$/, 'Le nom ne peut contenir que des lettres, espaces, apostrophes et tirets'),
  role: z.enum(['COMEDIAN', 'ORGANIZER', 'SUPER_ADMIN', 'SPECTATOR', 'LIEU']),
  city: z.string().optional(),
  birthDate: z.string().optional(),
  profile: z.object({
    bio: z.string()
      .min(10, 'La biographie doit contenir au moins 10 caractères')
      .max(500, 'La biographie ne peut pas dépasser 500 caractères'),
    experience: z.preprocess(
      (val) => {
        if (typeof val === 'string') {
          const parsed = parseInt(val, 10);
          return isNaN(parsed) ? 0 : parsed;
        }
        return typeof val === 'number' ? val : 0;
      },
      z.number()
        .min(0, 'L\'expérience doit être un nombre positif')
        .max(50, 'L\'expérience ne peut pas dépasser 50 ans')
    )
  }).optional().refine((data) => {
    if (!data) return true;
    if (data.bio && data.bio.length < 10) return false;
    return true;
  }, {
    message: 'La biographie doit contenir au moins 10 caractères',
    path: ['profile', 'bio']
  }),
  // Consentement RGPD
  consent: z.object({
    termsAccepted: z.boolean(),
    privacyAccepted: z.boolean(),
    isAdult: z.boolean()
  }).optional(),
  smsCode: z.string().optional()
})
  .refine((data) => {
    if (data.role === 'COMEDIAN') {
      if (!data.profile || data.profile === null || data.profile === undefined) {
        return false;
      }
      if (!data.profile.bio || data.profile.bio.trim().length < 10) {
        return false;
      }
      if (data.profile.experience === undefined || data.profile.experience === null) {
        return false;
      }
      return true;
    }
    return true;
  }, {
    message: 'Le profil est requis pour les humoristes avec une biographie d\'au moins 10 caractères et une expérience',
    path: ['profile']
  })
  .refine((data) => {
    if (data.role === 'SPECTATOR') {
      return typeof data.city === 'string' && data.city.trim().length >= 2;
    }
    return true;
  }, {
    message: 'La ville de résidence est requise pour les spectateurs (au moins 2 caractères)',
    path: ['city']
  })
  .refine((data) => {
    if (data.role === 'COMEDIAN' || data.role === 'ORGANIZER' || data.role === 'LIEU') {
      return typeof data.phone === 'string' && data.phone.trim().length > 0;
    }
    return true;
  }, {
    message: 'Le numéro de téléphone est requis',
    path: ['phone']
  });

export const upgradeToOrganizerSchema = z.object({
  companyName: z.string().max(200).optional(),
  description: z.string().max(1000).optional(),
  website: z.string().url('URL du site invalide').optional().or(z.literal('')),
  venueTypes: z.array(z.string()).optional(),
  eventFrequency: z.enum(['weekly', 'monthly', 'occasional']).optional(),
  averageBudget: z.object({
    min: z.number().min(0),
    max: z.number().min(0),
  }).optional(),
  postalCode: z.string().min(1, 'Le code postal est requis'),
});

export const loginSchema = z.object({
  email: z.string()
    .min(1, { message: 'Email est requis' })
    .email('Invalid email format')
    .transform((val) => val.trim().toLowerCase()),
  password: z.string()
    .min(1, { message: 'Le mot de passe est requis' })
});

// ============================================================================
// SCHÉMAS D'ÉVÈNEMENT
// ============================================================================

export const locationSchema = z.object({
  venue: z.string()
    .min(1, { message: 'Event location is incomplete or invalid' })
    .max(100, { message: 'Le nom du lieu est trop long' })
    .transform((val) => val.trim()),
  venueType: z.enum(['theatre', 'salle_polyvalente', 'cafe', 'restaurant', 'autre']).optional(),
  address: z.string()
    .min(1, { message: 'Event location is incomplete or invalid' })
    .max(200, { message: 'L\'adresse est trop longue' })
    .transform((val) => val.trim()),
  city: z.string()
    .min(1, { message: 'Event location is incomplete or invalid' })
    .max(50, { message: 'Le nom de la ville est trop long' })
    .transform((val) => val.trim()),
  postalCode: z.string()
    .regex(/^\d{5}$/, { message: 'Le code postal doit contenir 5 chiffres' })
    .optional()
    .transform((val) => val?.trim()),
  department: z.string()
    .max(3, { message: 'Le code département est invalide' })
    .optional()
    .transform((val) => val?.trim()),
  country: z.string()
    .min(1, { message: 'Event location is incomplete or invalid' })
    .max(50, { message: 'Le nom du pays est trop long' })
    .transform((val) => val.trim())
});

export const updateLocationSchema = z.object({
  venue: z.string().max(100).optional().transform((val) => val?.trim()),
  venueType: z.enum(['theatre', 'salle_polyvalente', 'cafe', 'restaurant', 'autre']).optional(),
  address: z.string().max(200).optional().transform((val) => val?.trim()),
  city: z.string().max(50).optional().transform((val) => val?.trim()),
  postalCode: z.string().optional().transform((val) => val?.trim()),
  department: z.string().max(3).optional().transform((val) => val?.trim()),
  country: z.string().max(50).optional().transform((val) => val?.trim()),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
}).strict().partial();

export const requirementsSchema = z.object({
  minExperience: z.number()
    .min(0, { message: 'Invalid event requirements' })
    .max(100, { message: 'Invalid event requirements' })
    .optional(),
  maxPerformers: z.number()
    .min(1, { message: 'Invalid event requirements' })
    .max(100, { message: 'Invalid event requirements' })
    .optional(),
  duration: z.number()
    .min(1, { message: 'Invalid event requirements' })
    .max(480, { message: 'Invalid event requirements' })
    .optional(),
  requiredExperienceLevel: z.enum(['all', '0-50', '50-200', '200+']).optional()
});

export const createEventSchema = z.object({
  title: z.string()
    .min(3, { message: 'Event title is invalid or missing' })
    .max(100, { message: 'Event title is invalid or missing' })
    .transform((val) => val.trim()),
  description: z.string()
    .min(10, { message: 'La description doit contenir au moins 10 caractères' })
    .max(2000, { message: 'La description ne peut pas dépasser 2000 caractères' })
    .transform((val) => val.trim()),
  // date est optionnel si isRecurring est true
  date: z.string()
    .refine((str) => {
      const date = new Date(str);
      return !isNaN(date.getTime());
    }, { message: 'Event date is invalid or in the past' })
    .refine((str) => {
      const date = new Date(str);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return date >= today;
    }, { message: 'Event date is invalid or in the past' })
    .transform((str) => new Date(str))
    .optional(),
  // dates est requis si isRecurring est true
  dates: z.array(z.string())
    .min(1, { message: 'Au moins une date est requise pour un événement récurrent' })
    .refine((dates) => {
      return dates.every(dateStr => {
        const date = new Date(dateStr);
        return !isNaN(date.getTime());
      });
    }, { message: 'Une ou plusieurs dates sont invalides' })
    .refine((dates) => {
      return dates.length === new Set(dates).size;
    }, { message: 'Les dates doivent être uniques' })
    .refine((dates) => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return dates.every(dateStr => {
        const date = new Date(dateStr);
        date.setHours(0, 0, 0, 0);
        return date >= today;
      });
    }, { message: 'Toutes les dates doivent être dans le futur' })
    .optional(),
  isRecurring: z.union([z.boolean(), z.string()])
    .transform((val) => {
      if (typeof val === 'string') {
        return val === 'true' || val === '1';
      }
      return val === true;
    })
    .optional(),
  location: locationSchema,
  requirements: requirementsSchema,
  startTime: z.string()
    .regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, {
      message: 'Invalid start time'
    }),
  endTime: z.string()
    .regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, {
      message: 'Invalid end time'
    }),
  /** Date de fin (événement unique qui dépasse minuit, ex. 22h → 1h lendemain) */
  endDate: z.string()
    .refine((str) => {
      const date = new Date(str);
      return !isNaN(date.getTime());
    }, { message: 'Invalid end date' })
    .transform((str) => new Date(str))
    .optional(),
  budget: z.number()
    .min(0, { message: 'Event budget is invalid' })
    .optional(),
  maxPerformers: z.number()
    .min(1, { message: 'Invalid maximum number of performers' })
    .max(100, { message: 'Invalid maximum number of performers' })
    .optional(),
  maxSpectators: z.number()
    .min(1, { message: 'Le nombre de places doit être au moins 1' })
    .max(10000, { message: 'Le nombre de places ne peut pas dépasser 10000' })
    .optional(),
  // Heures par date pour événements récurrents (optionnel)
  dateTimes: z.array(z.object({
    date: z.string(),
    startTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/),
    endTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/),
  })).optional(),
  imageUrl: z.string().max(2000).optional().transform((v) => (v && v.trim() ? v.trim() : undefined)).refine((v) => !v || /^https?:\/\//i.test(v), { message: 'L\'URL de l\'image doit commencer par http:// ou https://' }),
}).refine((data) => {
  // Validation : si isRecurring est true, dates doit être présent et date ne doit pas l'être
  if (data.isRecurring === true) {
    if (!data.dates || data.dates.length === 0) {
      return false;
    }
    if (data.date) {
      return false; // Ne pas permettre date et dates en même temps
    }
  } else {
    // Si isRecurring est false ou undefined, date doit être présent
    if (!data.date) {
      return false;
    }
  }
  return true;
}, {
  message: 'Pour un événement unique, fournissez "date". Pour un événement récurrent, fournissez "isRecurring: true" et "dates"',
  path: ['date']
}).refine((data) => {
  const startParts = data.startTime.split(':');
  const endParts = data.endTime.split(':');
  const startMinutes = parseInt(startParts[0]) * 60 + parseInt(startParts[1]);
  const endMinutes = parseInt(endParts[0]) * 60 + parseInt(endParts[1]);
  // Si endDate est fourni, la fin peut être le lendemain (endTime <= startTime autorisé)
  if (data.endDate) return true;
  return endMinutes > startMinutes;
}, {
  message: 'End time must be after start time',
  path: ['endTime']
});

export const updateEventSchema = z.object({
  title: z.string()
    .min(3, { message: 'Event title is invalid or missing' })
    .max(100, { message: 'Event title is invalid or missing' })
    .optional(),
  description: z.string()
    .min(10, { message: 'La description doit contenir au moins 10 caractères' })
    .max(2000, { message: 'La description ne peut pas dépasser 2000 caractères' })
    .optional(),
  date: z.string()
    .refine((str) => {
      const date = new Date(str);
      return !isNaN(date.getTime());
    }, { message: 'Event date is invalid or in the past' })
    .refine((str) => {
      const date = new Date(str);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return date >= today;
    }, { message: 'Event date is invalid or in the past' })
    .optional(),
  location: updateLocationSchema.optional(),
  requirements: requirementsSchema.optional(),
  status: z.enum(['draft', 'published', 'cancelled', 'completed', 'DRAFT', 'PUBLISHED', 'CANCELLED', 'COMPLETED'], {
    errorMap: () => ({ message: 'Invalid enum value' })
  }).optional(),
  cancellationReason: z.string().max(1000).optional(),
  startTime: z.string()
    .regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, {
      message: 'Invalid start time'
    })
    .optional(),
  endTime: z.string()
    .regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, {
      message: 'Invalid end time'
    })
    .optional(),
  budget: z.number()
    .min(0, { message: 'Event budget is invalid' })
    .optional(),
  maxPerformers: z.number()
    .min(1, { message: 'Invalid maximum number of performers' })
    .max(100, { message: 'Invalid maximum number of performers' })
    .optional(),
  maxSpectators: z.number()
    .min(1, { message: 'Le nombre de places doit être au moins 1' })
    .max(10000, { message: 'Le nombre de places ne peut pas dépasser 10000' })
    .optional(),
  imageUrl: z.string().max(2000).optional().transform((v) => (v && v.trim() ? v.trim() : undefined)).refine((v) => !v || /^https?:\/\//i.test(v), { message: 'L\'URL de l\'image doit commencer par http:// ou https://' }),
}).partial().refine((data) => {
  // Si les deux heures sont fournies, validez que la fin est après le début
  if (data.startTime && data.endTime) {
    const startParts = data.startTime.split(':');
    const endParts = data.endTime.split(':');
    const startMinutes = parseInt(startParts[0]) * 60 + parseInt(startParts[1]);
    const endMinutes = parseInt(endParts[0]) * 60 + parseInt(endParts[1]);
    return endMinutes > startMinutes;
  }
  return true;
}, {
  message: 'End time must be after start time',
  path: ['endTime']
});

// ============================================================================
// SCHÉMAS D'APPLICATION
// ============================================================================

export const performanceDetailsSchema = z.object({
  duration: z.number()
    .min(1, { message: 'Invalid performance details' })
    .max(480, { message: 'Invalid performance details' }),
  description: z.string()
    .min(10, { message: 'La description doit contenir au moins 10 caractères' })
    .max(500, { message: 'La description ne peut pas dépasser 500 caractères' })
    .optional(),
  videoLink: z.string()
    .url('Invalid URL format')
    .optional()
});

export const createApplicationSchema = z.object({
  eventId: z.string()
    .min(24, { message: 'Invalid event ID format' })
    .regex(/^[0-9a-fA-F]{24}$/, { message: 'Invalid event ID format' }),
  performanceDetails: performanceDetailsSchema.optional(),
  message: z.string()
    .max(1000, { message: 'Message exceeds maximum length' })
    .optional()
});

export const updateApplicationStatusSchema = z.object({
  status: z.enum(['PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED'], {
    errorMap: () => ({ message: 'Invalid application status' })
  }),
  organizerMessage: z.string()
    .max(1000, { message: 'Message exceeds maximum length' })
    .optional()
});

// ============================================================================
// SCHÉMAS DE PROFIL UTILISATEUR
// ============================================================================

export const updateProfileSchema = z.object({
  firstName: z.string()
    .min(2, { message: 'Name must be at least 2 characters' })
    .optional(),
  lastName: z.string()
    .min(2, { message: 'Name must be at least 2 characters' })
    .optional(),
  email: z.string()
    .email('Invalid email format')
    .optional(),
  city: z.string()
    .max(50, { message: 'Invalid city' })
    .optional(),
  phone: z.string()
    .refine((phone) => {
      const cleanPhone = phone.replace(/[\s\-\(\)\+]/g, '');
      const frenchPhoneRegex = /^(0[1-9])[0-9]{8}$/;
      const belgianPhoneRegex = /^(0[1-9][0-9]{7,8})$/;
      return frenchPhoneRegex.test(cleanPhone) || belgianPhoneRegex.test(cleanPhone);
    }, { message: 'Invalid phone number format' })
    .optional(),
  address: z.string().optional(),
  birthDate: z.string().optional(),
  gender: z.enum(['femme', 'homme'], {
    errorMap: () => ({ message: 'Le genre doit être "femme" ou "homme"' })
  }).optional(),
  avatarUrl: z.union([
    z.string().refine(
      (val) => !val || val.startsWith('data:image/') || val.startsWith('http://') || val.startsWith('https://'),
      { message: 'URL d\'avatar ou format base64 invalide' }
    ),
    z.null()
  ]).optional(),
  profile: z.object({
    bio: z.string().max(500).optional(),
    experience: z.number()
      .min(0, { message: 'L\'expérience doit être 0 ou plus' })
      .max(100, { message: 'L\'expérience ne peut pas dépasser 100 ans' })
      .optional(),
    speciality: z.string().optional(),
    numberOfScenes: z.enum(['0-50', '50-200', '200+']).optional(),
    comedyStyle: z.array(z.enum(['stand-up', 'improvisation', 'plateau', 'sketch'])).optional(),
    performanceLanguages: z.array(z.enum(['francais', 'arabe', 'anglais', 'italien', 'espagnol'])).optional(),
    mobilityZone: z.array(z.object({
      type: z.enum(['ville', 'departement', 'region']),
      value: z.string().min(1, { message: 'La valeur de la zone ne peut pas être vide' }),
    })).optional(),
    socialLinks: z.object({
      youtube: z.string().url().optional().or(z.string().length(0)),
      instagram: z.string().url().optional().or(z.string().length(0)),
      facebook: z.string().url().optional().or(z.string().length(0)),
      twitter: z.string().url().optional().or(z.string().length(0)),
    }).optional(),
  }).optional(),
  organizerProfile: z.object({
    companyName: z.string().optional(),
    description: z.string().max(1000).optional(),
    website: z.string()
      .url('URL du site invalide')
      .optional()
      .or(z.string().length(0)), // Allow empty string
    venueTypes: z.array(z.string()).optional(),
    eventFrequency: z.enum(['weekly', 'monthly', 'occasional']).optional(),
    location: updateLocationSchema.optional(),
    phone: z.string().optional(),
  }).optional(),
  spectatorPreferences: z.object({
    radiusKm: z.number().refine((n) => [5, 10, 20, 50].includes(n), { message: 'Rayon invalide (5, 10, 20 ou 50 km)' }).optional(),
    dailyRecapEmail: z.boolean().optional(),
  }).optional(),
  consent: z.object({
    termsAccepted: z.boolean().optional(),
    privacyAccepted: z.boolean().optional(),
    isAdult: z.boolean().optional(),
  }).optional(),
}).partial();

// ============================================================================
// SCHÉMAS DE RECOMMANDATION
// ============================================================================

export const getRecommendationsQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(500).default(10), // Augmenté pour charger tous les événements
  minScore: z.coerce.number().min(0).max(100).default(0)
});

// Schéma pour les recommandations intelligentes (basées sur l'historique)
export const getSmartRecommendationsQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(50)
});

// ============================================================================
// SCHÉMAS VENUES (SALLES)
// ============================================================================

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

const photoArraySchema = z.array(
  z.string().refine(
    (val) => val.startsWith('data:image/') || val.startsWith('http://') || val.startsWith('https://'),
    { message: 'Format photo invalide (data URL ou URL HTTP/HTTPS attendu)' }
  )
).optional().default([]);

const optionalTime = z.preprocess(
  (val) => (val === '' ? undefined : val),
  z.string().regex(timeRegex).optional()
);

const timeRestrictionsSchema = z.object({
  openTime: optionalTime,
  closeTime: optionalTime,
  matinEnabled: z.boolean().optional(),
  matinStart: optionalTime,
  matinEnd: optionalTime,
  apremEnabled: z.boolean().optional(),
  apremStart: optionalTime,
  apremEnd: optionalTime,
  soireeStart: optionalTime,
  soireeEnd: optionalTime,
}).optional();

export const createVenueSchema = z.object({
  name: z.string().min(2).max(200),
  description: z.string().min(10).max(2000),
  address: z.string().min(1),
  city: z.string().min(1),
  postalCode: z.string().min(1),
  country: z.string().min(1),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  photos: photoArraySchema,
  equipment: z.array(z.string()).optional().default([]),
  capacity: z.number().int().min(1),
  pricePerEvent: z.number().min(0),
  venueType: z.enum(['bar', 'theatre', 'cinema', 'cafe_theatre', 'comedy_club', 'salle_municipale', 'salle_polyvalente', 'salle_des_fetes', 'autre']),
  // Étape 1
  shortDescription: z.string().max(300).optional(),
  fullDescription: z.string().optional(),
  // Étape 2
  addressComplement: z.string().optional(),
  // Étape 3
  seatedCapacity: z.number().int().min(0).optional(),
  standingCapacity: z.number().int().min(0).optional(),
  stageArea: z.number().min(0).optional(),
  configurationType: z.enum(['frontal', 'gradins', 'cabaret', 'cinema', 'modulable']).optional(),
  dressingRooms: z.number().int().min(0).optional(),
  accessiblePMR: z.boolean().optional(),
  parkingAvailable: z.boolean().optional(),
  // Étape 5
  currency: z.string().optional(),
  pricingType: z.enum(['heure', 'demi_journee', 'journee', 'soiree', 'forfait', 'pourcentage_billetterie', 'gratuit']).optional(),
  deposit: z.number().min(0).optional(),
  extraFees: z.array(z.object({ description: z.string(), amount: z.number().min(0) })).optional(),
  bookingMode: z.enum(['manual', 'automatic']).optional(),
  minBookingDelay: z.number().int().min(0).optional(),
  minDuration: z.number().min(0).optional(),
  maxDuration: z.number().min(0).optional(),
  acceptedEventTypes: z.array(z.string()).optional(),
  cancellationConditions: z.string().optional(),
  houseRules: z.string().optional(),
  timeRestrictions: timeRestrictionsSchema,
  // Étape 6
  contactName: z.string().optional(),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().optional(),
  legalStatus: z.string().optional(),
  siret: z.string().optional(),
  invoicingAvailable: z.boolean().optional(),
});

export const updateVenueSchema = createVenueSchema.partial();

export const createBookingSchema = z.object({
  requestedDate: z.string().refine((str) => {
    const date = new Date(str);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return !isNaN(date.getTime()) && date >= today;
  }, { message: 'La date doit être aujourd\'hui ou dans le futur' }),
  startTime: z.string().regex(timeRegex, { message: 'Format HH:MM requis' }).optional(),
  endTime: z.string().regex(timeRegex, { message: 'Format HH:MM requis' }).optional(),
  message: z.string().max(500).optional(),
}).refine((data) => {
  if (!data.startTime || !data.endTime) return true;
  const [sh, sm] = data.startTime.split(':').map(Number);
  const [eh, em] = data.endTime.split(':').map(Number);
  return eh * 60 + em > sh * 60 + sm;
}, { message: "L'heure de fin doit être après l'heure de début", path: ['endTime'] });

export const updateBookingStatusSchema = z.object({
  status: z.enum(['ACCEPTED', 'REFUSED']),
  ownerResponse: z.string().max(500).optional(),
});

export const cancelBookingByOwnerSchema = z.object({
  reason: z.string().max(500).optional(),
});

export const blockDateSchema = z.object({
  date: z.string().refine((str) => {
    const date = new Date(str);
    return !isNaN(date.getTime()) && date >= new Date(new Date().setHours(0, 0, 0, 0));
  }, { message: 'La date doit être aujourd\'hui ou dans le futur' }),
  startTime: z.string().regex(timeRegex, { message: 'Format HH:MM requis' }).optional(),
  endTime: z.string().regex(timeRegex, { message: 'Format HH:MM requis' }).optional(),
  reason: z.string().max(500).optional(),
}).refine((data) => {
  if (data.startTime && data.endTime) {
    const [sh, sm] = data.startTime.split(':').map(Number);
    const [eh, em] = data.endTime.split(':').map(Number);
    return eh * 60 + em > sh * 60 + sm;
  }
  return true;
}, { message: "L'heure de fin doit être après l'heure de début", path: ['endTime'] })
.refine((data) => {
  // startTime et endTime doivent être fournis ensemble ou pas du tout
  return !(data.startTime && !data.endTime) && !(!data.startTime && data.endTime);
}, { message: 'startTime et endTime doivent être fournis ensemble', path: ['startTime'] });