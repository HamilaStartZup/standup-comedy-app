import axios from 'axios';
import type { IVenue, IVenueBooking, IVenueBlockedDate } from '../types/venue';

// Configuration automatique de l'URL de base selon l'environnement
const baseURL =
  process.env.REACT_APP_API_URL ||
  (process.env.NODE_ENV === 'production'
    ? 'https://connectcomedyclub.com/api'
    : process.env.NODE_ENV === 'test'
      ? 'https://test.connectcomedyclub.com/api'
      : 'http://localhost:3001/api');
const api = axios.create({
  baseURL,
  withCredentials: true, // Send HttpOnly cookies with every request
  headers: {
    'Content-Type': 'application/json',
  },
});

// Intercepteur pour gérer les erreurs
// La redirection 401 est gérée par AuthContext (séparation des responsabilités)
api.interceptors.response.use(
  (response) => response,
  (error) => Promise.reject(error)
);

export const upgradeToOrganizer = async (payload: {
  companyName?: string;
  description?: string;
  website?: string;
  venueTypes?: string[];
  eventFrequency?: string;
  averageBudget?: { min: number; max: number };
  postalCode: string;
}) => {
  const response = await api.post('/auth/upgrade-to-organizer', payload);
  return response.data;
};

export const switchToLieu = async () => {
  const response = await api.post('/auth/switch-to-lieu');
  return response.data;
};

export const switchToOrganizer = async () => {
  const response = await api.post('/auth/switch-to-organizer');
  return response.data;
};

// Fonctions pour gérer les absences
export const markAbsence = async (eventId: string, comedianId: string, reason?: string) => {
  const response = await api.post('/absences', { eventId, comedianId, reason });
  return response.data;
};

export const cancelAbsence = async (eventId: string, comedianId: string) => {
  const response = await api.delete(`/absences/${eventId}/${comedianId}`);
  return response.data;
};

export const getEventAbsences = async (eventId: string) => {
  const response = await api.get(`/absences/event/${eventId}`);
  return response.data;
};

export const getComedianAbsences = async (comedianId: string) => {
  const response = await api.get(`/absences/comedian/${comedianId}`);
  return response.data;
};

// Fonctions pour gérer les favoris d'évènements (comédiens)
export const addEventFavorite = async (eventId: string) => {
  const response = await api.post('/event-favorites', { eventId });
  return response.data;
};

export const removeEventFavorite = async (eventId: string) => {
  const response = await api.delete(`/event-favorites/${eventId}`);
  return response.data;
};

export const getEventFavorites = async () => {
  const response = await api.get('/event-favorites');
  return response.data;
};

export const checkIsEventFavorite = async (eventId: string) => {
  const response = await api.get(`/event-favorites/check/${eventId}`);
  return response.data;
};

// Inscription / désinscription spectateur à un événement
export const registerSpectatorToEvent = async (eventId: string) => {
  const response = await api.post(`/events/${eventId}/spectator-register`);
  return response.data;
};

/** Crée une session Stripe Checkout pour acheter une place à 1€. Rediriger vers data.url */
export const createStripeCheckoutSession = async (eventId: string): Promise<{ url: string }> => {
  const response = await api.post<{ url: string }>('/stripe/create-checkout-session', { eventId });
  return response.data;
};

/** Confirme l'inscription après retour de Stripe (si webhook pas encore traité). */
export const confirmStripeRegistration = async (sessionId: string) => {
  const response = await api.get('/stripe/confirm-registration', { params: { session_id: sessionId } });
  return response.data;
};

/** Crée une session Stripe Checkout pour le paiement d'une réservation de salle. */
export const createVenueCheckoutSession = async (bookingId: string): Promise<{ url: string }> => {
  const response = await api.post<{ url: string }>('/stripe/create-venue-checkout', { bookingId });
  return response.data;
};

/** Confirme le paiement d'une réservation de salle après retour de Stripe. */
export const confirmVenuePayment = async (sessionId: string) => {
  const response = await api.get('/stripe/confirm-venue-payment', { params: { session_id: sessionId } });
  return response.data;
};

/** Upload photo de l'événement (organisateur). JPG, PNG, GIF max 5MB. Retourne { imageUrl }. */
export const uploadEventImage = async (file: File): Promise<{ imageUrl: string }> => {
  const formData = new FormData();
  formData.append('image', file);
  const response = await api.post<{ imageUrl: string }>('/events/upload-image', formData, {
    headers: { 'Content-Type': undefined } as any,
  });
  return response.data;
};

export const unregisterSpectatorFromEvent = async (eventId: string) => {
  const response = await api.delete(`/events/${eventId}/spectator-register`);
  return response.data;
};

// Statut de notation d'un évènement pour le spectateur connecté
export const getSpectatorEventRatingStatus = async (
  eventId: string
): Promise<{ alreadyRated: boolean; ratingWindowClosed?: boolean; eventRating?: number | null }> => {
  const response = await api.get<{ alreadyRated: boolean; ratingWindowClosed?: boolean; eventRating?: number | null }>(
    `/events/${eventId}/rating-status`,
  );
  return response.data;
};

// Fonctions pour gérer les favoris de comédiens (organisateurs)
export const addFavorite = async (comedianId: string) => {
  const response = await api.post('/favorites', { comedianId });
  return response.data;
};

export const removeFavorite = async (comedianId: string) => {
  const response = await api.delete(`/favorites/${comedianId}`);
  return response.data;
};

export const getFavorites = async () => {
  const response = await api.get('/favorites');
  return response.data;
};

export const checkIsFavorite = async (comedianId: string) => {
  const response = await api.get(`/favorites/check/${comedianId}`);
  return response.data;
};

// Fonctions pour gérer les favoris de candidatures (organisateurs)
export const addApplicationFavorite = async (applicationId: string) => {
  const response = await api.post('/application-favorites', { applicationId });
  return response.data;
};

export const removeApplicationFavorite = async (applicationId: string) => {
  const response = await api.delete(`/application-favorites/${applicationId}`);
  return response.data;
};

export const getApplicationFavorites = async () => {
  const response = await api.get('/application-favorites');
  return response.data;
};

export const checkIsApplicationFavorite = async (applicationId: string) => {
  const response = await api.get(`/application-favorites/check/${applicationId}`);
  return response.data;
};

// Fonctions pour gérer les alertes de présence (Super Admin)
export const getPresenceAlerts = async () => {
  const response = await api.get('/presence-alerts');
  return response.data;
};

export const getComedianPresenceScore = async (comedianId: string) => {
  const response = await api.get(`/presence-alerts/${comedianId}`);
  return response.data;
};

export const acknowledgePresenceAlert = async (alertId: string) => {
  const response = await api.post(`/presence-alerts/${alertId}/acknowledge`);
  return response.data;
};

export const triggerPresenceCheck = async () => {
  const response = await api.post('/presence-alerts/check');
  return response.data;
};

// Fonctions pour gérer les alertes d'annulations tardives (Super Admin)
export const getLateCancellationAlerts = async (isActive?: boolean) => {
  const params = isActive !== undefined ? `?isActive=${isActive}` : '';
  const response = await api.get(`/late-cancellation-alerts${params}`);
  return response.data;
};

export const acknowledgeLateCancellationAlert = async (alertId: string) => {
  const response = await api.post(`/late-cancellation-alerts/${alertId}/acknowledge`);
  return response.data;
};

export const getComedianLateCancellationHistory = async (comedianId: string) => {
  const response = await api.get(`/late-cancellation-alerts/comedian/${comedianId}`);
  return response.data;
};

// Fonctions pour gérer les signalements d'humoristes (Organisateurs)
export const createComedianReport = async (comedianId: string, reason: string, description?: string) => {
  const response = await api.post('/comedian-reports', { comedianId, reason, description });
  return response.data;
};

export const checkComedianReport = async (comedianId: string) => {
  const response = await api.get(`/comedian-reports/comedian/${comedianId}`);
  return response.data;
};

// Fonctions pour gérer les signalements (Super Admin)
export const getComedianReports = async (status?: string) => {
  const query = status ? `?status=${status}` : '';
  const response = await api.get(`/comedian-reports${query}`);
  return response.data;
};

export const getComedianReport = async (reportId: string) => {
  const response = await api.get(`/comedian-reports/${reportId}`);
  return response.data;
};

export const updateComedianReport = async (reportId: string, status: string) => {
  const response = await api.patch(`/comedian-reports/${reportId}`, { status });
  return response.data;
};

// Fonctions pour gérer les notifications in-app (Organisateurs)
export const getNotifications = async (read?: boolean, limit?: number) => {
  const params = new URLSearchParams();
  if (read !== undefined) params.append('read', read.toString());
  if (limit !== undefined) params.append('limit', limit.toString());
  const query = params.toString();
  const response = await api.get(`/notifications${query ? `?${query}` : ''}`);
  return response.data;
};

export const markNotificationAsRead = async (notificationId: string) => {
  const response = await api.patch(`/notifications/${notificationId}/read`);
  return response.data;
};

export const markAllNotificationsAsRead = async () => {
  const response = await api.patch('/notifications/read-all');
  return response.data;
};

export const deleteNotification = async (notificationId: string) => {
  const response = await api.delete(`/notifications/${notificationId}`);
  return response.data;
};

// Fonctions pour gérer les recommandations (Humoristes)
export const getRecommendations = async (options?: { page?: number; limit?: number; minScore?: number }) => {
  const params = new URLSearchParams();
  if (options?.page) params.append('page', options.page.toString());
  if (options?.limit) params.append('limit', options.limit.toString());
  if (options?.minScore !== undefined) params.append('minScore', options.minScore.toString());
  const query = params.toString();
  const response = await api.get(`/recommendations${query ? `?${query}` : ''}`);
  return response.data;
};

// Recommandations intelligentes basées sur l'historique (même nom/même organisateur)
export const getSmartRecommendations = async (options?: { page?: number; limit?: number }) => {
  const params = new URLSearchParams();
  if (options?.page) params.append('page', options.page.toString());
  if (options?.limit) params.append('limit', options.limit.toString());
  const query = params.toString();
  const response = await api.get(`/recommendations/smart${query ? `?${query}` : ''}`);
  return response.data;
};

// Fonctions pour rechercher des humoristes par zone géographique (Organisateurs)
export interface SearchComediansByZoneOptions {
  zone: string;
  experienceLevel?: 'all' | '0-50' | '50-200' | '200+';
  page?: number;
  limit?: number;
}

export interface ComedianSearchResult {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  city?: string;
  phone?: string;
  stageName?: string;
  bio?: string;
  numberOfScenes?: string;
  comedyStyle?: string[];
  performanceLanguages?: string[];
  mobilityZone?: Array<{ type: 'ville' | 'departement' | 'region'; value: string }>;
  socialLinks?: {
    youtube?: string;
    instagram?: string;
    facebook?: string;
    twitter?: string;
  };
  stats?: {
    totalEvents?: number;
    averageRating?: number;
    absences?: number;
  };
}

export interface SearchComediansByZoneResponse {
  comedians: ComedianSearchResult[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  searchZone: {
    type: 'ville' | 'departement' | 'region';
    value: string;
    department?: string;
    region?: string;
  };
}

export const searchComediansByZone = async (options: SearchComediansByZoneOptions): Promise<SearchComediansByZoneResponse> => {
  const params = new URLSearchParams();
  params.append('zone', options.zone);
  if (options.experienceLevel && options.experienceLevel !== 'all') {
    params.append('experienceLevel', options.experienceLevel);
  }
  if (options.page) params.append('page', options.page.toString());
  if (options.limit) params.append('limit', options.limit.toString());
  const query = params.toString();
  const response = await api.get(`/comedians/search-by-zone?${query}`);
  return response.data;
};

// Inviter un humoriste à postuler pour un événement
export const inviteComedianToEvent = async (eventId: string, comedianId: string): Promise<void> => {
  await api.post(`/events/${eventId}/invite-comedian/${comedianId}`);
};

// Gestion des comptes (Super Admin uniquement)
export const deactivateUser = async (userId: string, reason?: string) => {
  const response = await api.patch(`/auth/users/${userId}/deactivate`, { reason });
  return response.data;
};

export const reactivateUser = async (userId: string) => {
  const response = await api.patch(`/auth/users/${userId}/reactivate`);
  return response.data;
};

export const deleteUser = async (userId: string) => {
  const response = await api.delete(`/auth/users/${userId}`);
  return response.data;
};

// ===== Salles (Venues) =====

export const createVenue = async (data: Partial<IVenue> & { name: string; description: string; address: string; city: string; postalCode: string; country: string; capacity: number; pricePerEvent: number; venueType: IVenue['venueType'] }): Promise<IVenue> => {
  const response = await api.post<{ venue: IVenue }>('/venues', data);
  return response.data.venue;
};

export const listVenues = async (filters?: {
  city?: string;
  venueType?: string;
  minCapacity?: number;
  owner?: 'me';
  region?: string;
  department?: string;
  page?: number;
  limit?: number;
}): Promise<{ venues: IVenue[]; total: number; page: number; limit: number }> => {
  const params = new URLSearchParams();
  if (filters?.city) params.append('city', filters.city);
  if (filters?.venueType) params.append('venueType', filters.venueType);
  if (filters?.minCapacity) params.append('minCapacity', filters.minCapacity.toString());
  if (filters?.owner) params.append('owner', filters.owner);
  // department is more specific than region — send only one
  if (filters?.department) {
    params.append('department', filters.department);
  } else if (filters?.region) {
    params.append('region', filters.region);
  }
  if (filters?.page) params.append('page', filters.page.toString());
  if (filters?.limit) params.append('limit', filters.limit.toString());
  const query = params.toString();
  const response = await api.get<{ venues: IVenue[]; total: number; page: number; limit: number }>(
    `/venues${query ? `?${query}` : ''}`
  );
  return response.data;
};

export const listMyVenues = async (filters?: { page?: number; limit?: number }): Promise<{ venues: IVenue[]; total: number; page: number; limit: number }> => {
  const params = new URLSearchParams();
  if (filters?.page) params.append('page', filters.page.toString());
  if (filters?.limit) params.append('limit', filters.limit.toString());
  const query = params.toString();
  const response = await api.get<{ venues: IVenue[]; total: number; page: number; limit: number }>(`/venues/mine${query ? `?${query}` : ''}`);
  return response.data;
};

export const getVenue = async (venueId: string): Promise<IVenue> => {
  const response = await api.get<{ venue: IVenue }>(`/venues/${venueId}`);
  return response.data.venue;
};

export const updateVenue = async (venueId: string, data: Partial<IVenue>): Promise<IVenue> => {
  const response = await api.put<{ venue: IVenue }>(`/venues/${venueId}`, data);
  return response.data.venue;
};

export const deleteVenue = async (venueId: string): Promise<void> => {
  await api.delete(`/venues/${venueId}`);
};

// ===== Réservations de salles (Venue Bookings) =====

export const createBooking = async (venueId: string, data: {
  requestedDate: string;
  startTime?: string;
  endTime?: string;
  message?: string;
}): Promise<{ booking: IVenueBooking }> => {
  const response = await api.post<{ booking: IVenueBooking }>(`/venues/${venueId}/bookings`, data);
  return response.data;
};

export const listVenueBookings = async (venueId: string): Promise<IVenueBooking[]> => {
  const response = await api.get<{ bookings: IVenueBooking[] }>(`/venues/${venueId}/bookings`);
  return response.data.bookings;
};

export const myBookings = async (): Promise<IVenueBooking[]> => {
  const response = await api.get<{ bookings: IVenueBooking[] }>('/venues/bookings/mine');
  return response.data.bookings;
};

export const getMyVenueBookings = async (venueId: string): Promise<IVenueBooking[]> => {
  const response = await api.get<{ bookings: IVenueBooking[] }>(`/venues/${venueId}/my-bookings`);
  return response.data.bookings;
};

export const updateBookingStatus = async (bookingId: string, status: 'ACCEPTED' | 'REFUSED', ownerResponse?: string): Promise<{ booking: IVenueBooking }> => {
  const response = await api.patch<{ booking: IVenueBooking }>(`/venues/bookings/${bookingId}`, { status, ownerResponse });
  return response.data;
};

export const cancelBooking = async (bookingId: string): Promise<void> => {
  await api.delete(`/venues/bookings/${bookingId}`);
};

export const cancelBookingByOwner = async (bookingId: string): Promise<void> => {
  await api.patch(`/venues/bookings/${bookingId}/cancel`);
};

export const getRefundEstimate = async (bookingId: string): Promise<{ refundAmount: number; refundPercent: 0 | 50 | 100; reason: string }> => {
  const response = await api.get(`/venues/bookings/${bookingId}/refund-estimate`);
  return response.data;
};

// ===== Dates bloquées =====

export const blockDate = async (venueId: string, data: {
  date: string;
  startTime?: string;
  endTime?: string;
  reason?: string;
}): Promise<{ blockedDate: IVenueBlockedDate; cancelledBookings: number; failedCancellations: number }> => {
  const response = await api.post<{ blockedDate: IVenueBlockedDate; cancelledBookings: number; failedCancellations: number }>(`/venues/${venueId}/blocked-dates`, data);
  return response.data;
};

export const listBlockedDates = async (venueId: string): Promise<IVenueBlockedDate[]> => {
  const response = await api.get<{ blockedDates: IVenueBlockedDate[] }>(`/venues/${venueId}/blocked-dates`);
  return response.data.blockedDates;
};

export const getTakenSlots = async (venueId: string, date: string): Promise<{ startTime: string; endTime: string }[]> => {
  const response = await api.get(`/venues/${venueId}/taken-slots`, { params: { date } });
  return response.data.slots;
};

export const getBookedDates = async (venueId: string): Promise<string[]> => {
  const response = await api.get<{ dates: string[] }>(`/venues/${venueId}/taken-slots`);
  return response.data.dates;
};

export const getFullDates = async (venueId: string): Promise<string[]> => {
  const response = await api.get<{ dates: string[] }>(`/venues/${venueId}/full-dates`);
  return response.data.dates;
};

export const unblockDate = async (venueId: string, blockedDateId: string): Promise<void> => {
  await api.delete(`/venues/${venueId}/blocked-dates/${blockedDateId}`);
};

// ===== Géocodage =====

export type GeocodeFailureReason = 'no_results' | 'network_error';
export type GeocodeResult = { lat: number; lng: number } | { error: GeocodeFailureReason };

export async function geocodeAddress(
  address: string,
  city: string,
  postalCode: string,
  _country: string
): Promise<GeocodeResult> {
  const banFetch = async (query: string, type?: string) => {
    const params = new URLSearchParams({ q: query, limit: '1', ...(type && { type }) });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const res = await fetch(`https://api-adresse.data.gouv.fr/search/?${params}`, {
        signal: controller.signal,
        cache: 'no-store',
      });
      clearTimeout(timeout);
      if (!res.ok) return { status: 'error' as const, data: null };
      return { status: 'success' as const, data: await res.json() };
    } catch (err) {
      clearTimeout(timeout);
      if (err instanceof Error) {
        if (err.name === 'AbortError') {
          console.warn('geocodeAddress: timeout atteint (5s)', { query });
        } else {
          console.warn('geocodeAddress: erreur réseau ou réponse invalide', err, { query });
        }
      }
      return { status: 'error' as const, data: null };
    }
  };

  const streetOnly = address.replace(/^\d+\s*(bis|ter|quater)?\s+/i, '').trim();

  let result = await banFetch(`${address} ${postalCode} ${city}`, 'housenumber');
  if (!result.data?.features?.length)
    result = await banFetch(`${streetOnly} ${postalCode} ${city}`, 'street');
  if (!result.data?.features?.length)
    result = await banFetch(`${address} ${postalCode} ${city}`);

  const data = result.data;
  const feature = data?.features?.[0];
  if (!feature) {
    console.warn('geocodeAddress: aucun résultat pour toutes les stratégies', { address, city, postalCode });
    return { error: 'no_results' };
  }
  if (result.status === 'error') {
    return { error: 'network_error' };
  }
  const coordinates = feature?.geometry?.coordinates;
  if (!coordinates) return { error: 'no_results' };
  const [lng, lat] = coordinates;
  return { lat, lng };
}

export default api;
