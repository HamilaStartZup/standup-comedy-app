import { type CSSProperties, useState, useMemo, useEffect, useRef, useCallback } from 'react';
import Navbar from '../components/Navbar';
import Modal from '../components/Modal';
import CreateEventForm from '../components/CreateEventForm';
import EditEventForm from '../components/EditEventForm';
import ApplyToEventForm from '../components/ApplyToEventForm';
import ComedianDetailsModal from '../components/ComedianDetailsModal';
import AbsenceModal from '../components/AbsenceModal';
import EventCalendar from '../components/EventCalendar';
import EventDetailModal from '../components/EventDetailModal';
import ScorePieChart from '../components/ScorePieChart';
import ConfirmDialog from '../components/ConfirmDialog';
import { matchesMobilityZones, normalizeString, FRENCH_REGIONS, FRENCH_DEPARTMENTS, DEPARTMENTS_ORDER } from '../utils/geographicMatching';
import { getOrganizerName, translateEventStatus } from '../utils/eventHelpers';
import api from '../services/api';
import { useAuth } from '../hooks/useAuth';
import { useAlert } from '../hooks/useAlert';
import type { IEvent } from '../types/event';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { IApplication } from './ApplicationsPage'; // Import IApplication
import { markAbsence, cancelAbsence, getEventAbsences, addEventFavorite, removeEventFavorite, getEventFavorites, getRecommendations, getSmartRecommendations, searchComediansByZone, addFavorite, removeFavorite, getFavorites, inviteComedianToEvent } from '../services/api';
import type { ComedianSearchResult, SearchComediansByZoneResponse } from '../services/api';
import { getErrorMessage, ErrorMessages, SuccessMessages, WarningMessages, InfoMessages, ConfirmMessages } from '../services/systemMessages';
import { MoreVertical } from 'lucide-react';

const ITEMS_PER_PAGE = 5;
type ComedianTab = 'opportunities' | 'accepted' | 'favorites' | 'recommendations';

// Types pour les recommandations intelligentes
type SmartRecommendationMatchType = 'same_event_name' | 'same_organizer' | 'recurring_event_group';
interface SmartRecommendation {
  event: IEvent;
  matchType: SmartRecommendationMatchType;
  matchedEventTitle?: string;
  matchedOrganizerName?: string;
  matchedRecurrenceEventTitle?: string;
}
interface SmartRecommendationsResponse {
  recommendations: SmartRecommendation[];
  total: number;
  page: number;
  limit: number;
}
type OrganizerTab = 'upcoming' | 'full' | 'archived' | 'cancelled' | 'calendar' | 'favoriteComedians' | 'recurringEvents';
type EventsSubTab = 'upcoming' | 'full' | 'archived' | 'cancelled' | 'recurringEvents';
type SuperAdminTab = 'full' | 'upcoming' | 'archived' | 'cancelled';

interface RatingsSummaryData {
  eventTitle: string;
  averageEventRating: number | null;
  totalRatings: number;
  comedianRatings: Array<{
    comedianId: string;
    firstName: string;
    lastName: string;
    averageRating: number | null;
    ratingCount: number;
  }>;
}

function RatingsSummaryModal({ event, onClose }: { event: IEvent | null; onClose: () => void }) {
  const { data, isLoading, error } = useQuery<RatingsSummaryData>({
    queryKey: ['event-ratings-summary', event?._id],
    queryFn: async () => {
      const res = await api.get(`/events/${event!._id}/ratings-summary`);
      return res.data;
    },
    enabled: !!event?._id,
  });

  if (!event) return null;

  return (
    <Modal isOpen onClose={onClose}>
      <div>
        <h2 style={{ margin: '0 0 16px 0', fontSize: '1.25em', color: '#fff' }}>
          Notes — {event.title}
        </h2>
        {isLoading && <p style={{ color: '#aaa' }}>Chargement des notes…</p>}
        {error && <p style={{ color: '#dc3545' }}>Impossible de charger les notes.</p>}
        {data && !isLoading && (
          <>
            <div style={{ marginBottom: 20, padding: '16px', background: 'rgba(255,255,255,0.06)', borderRadius: 8 }}>
              <div style={{ marginBottom: 12, color: '#fff', fontSize: '0.95em' }}>
                <span style={{ color: '#888' }}>Moyenne par événement</span>
                <div style={{ color: '#FFD700', fontWeight: 600, fontSize: '1.2em', marginTop: 4 }}>
                  {data.averageEventRating != null ? `${data.averageEventRating}/5` : '—'}
                </div>
              </div>
              <div style={{ marginBottom: 12, color: '#fff', fontSize: '0.95em' }}>
                <span style={{ color: '#888' }}>Nombre total d&apos;avis</span>
                <div style={{ color: '#fff', fontWeight: 600, fontSize: '1.2em', marginTop: 4 }}>
                  {data.totalRatings}
                </div>
              </div>
            </div>
            <h3 style={{ margin: '0 0 10px 0', fontSize: '1em', color: '#ddd' }}>Moyenne par humoriste</h3>
            {data.comedianRatings.length > 0 ? (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, maxHeight: 260, overflowY: 'auto' }}>
                {data.comedianRatings.map((cr) => (
                  <li
                    key={cr.comedianId}
                    style={{
                      padding: '10px 0',
                      borderBottom: '1px solid rgba(255,255,255,0.08)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 12,
                    }}
                  >
                    <span style={{ color: '#fff' }}>
                      {cr.firstName} {cr.lastName}
                    </span>
                    <span style={{ color: '#FFD700', fontWeight: 600 }}>
                      {cr.averageRating != null ? `${cr.averageRating}/5` : '—'} ({cr.ratingCount} avis)
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p style={{ color: '#888', margin: 0 }}>Aucun humoriste à afficher.</p>
            )}
            {data.totalRatings === 0 && (
              <p style={{ color: '#888', marginTop: 12 }}>Aucune notation pour cet événement.</p>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

function MyEventsPage() {
  const { user, refreshUser, isLoading: authIsLoading } = useAuth();
  const { showSuccess, showError, showWarning, showInfo } = useAlert();
  const [isMobile, setIsMobile] = useState<boolean>(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => Promise<void> | void;
    isDangerous?: boolean;
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });
  const isComedianView = user?.role === 'COMEDIAN';
  const isOrganizerView = user?.role === 'ORGANIZER';
  const isSuperAdminView = user?.role === 'SUPER_ADMIN';

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!isOrganizerView) {
      setOrganizerTab('upcoming');
    }
  }, [isOrganizerView]);

  useEffect(() => {
    if (user?.role !== 'SUPER_ADMIN') {
      setSuperAdminTab('full');
    }
  }, [user?.role]);

  // Calculer isQueryEnabled avant son utilisation (auth par cookie : user suffit, token peut être null)
  const isQueryEnabled = !authIsLoading && !!user?._id;

  // Charger les favoris depuis l'API
  const { data: eventFavoritesData, refetch: refetchEventFavorites } = useQuery<{ favorites: IEvent[] }, Error>({
    queryKey: ['eventFavorites', user?._id],
    queryFn: async () => {
      if (!user?._id || user?.role !== 'COMEDIAN') {
        throw new Error("Informations d'authentification manquantes.");
      }
      const response = await getEventFavorites();
      return response;
    },
    enabled: isComedianView && isQueryEnabled,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  // Extraire les IDs des évènements favoris
  useEffect(() => {
    if (eventFavoritesData?.favorites) {
      const favoriteIds = eventFavoritesData.favorites.map(event => event._id);
      setFavoriteEventIds(favoriteIds);
    } else if (!isComedianView) {
      setFavoriteEventIds([]);
    }
  }, [eventFavoritesData, isComedianView]);

  // Charger les humoristes favoris (pour les organisateurs) avec React Query
  const { data: favoriteComediansData, refetch: refetchFavoriteComedians } = useQuery<{ favorites: any[] }, Error>({
    queryKey: ['organizerFavoriteComedians', user?._id],
    queryFn: async () => {
      if (!user?._id || user?.role !== 'ORGANIZER') {
        throw new Error("Informations d'authentification manquantes.");
      }
      const response = await getFavorites();
      return response;
    },
    enabled: isOrganizerView && isQueryEnabled,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  // Extraire les IDs des humoristes favoris
  useEffect(() => {
    if (favoriteComediansData?.favorites) {
      const favoriteIds = favoriteComediansData.favorites.map((comedian: any) => comedian._id || comedian.id) || [];
      setFavoriteComedianIds(favoriteIds);
    } else if (!isOrganizerView) {
      setFavoriteComedianIds([]);
    }
  }, [favoriteComediansData, isOrganizerView]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<IEvent | null>(null);
  const [showCreateEventForm, setShowCreateEventForm] = useState(false);
  const [showApplyEventForm, setShowApplyEventForm] = useState(false);
  const [showEditEventForm, setShowEditEventForm] = useState(false);
  const [eventToEdit, setEventToEdit] = useState<IEvent | null>(null);
  const [isComedianModalOpen, setIsComedianModalOpen] = useState(false);
  const [selectedComedian, setSelectedComedian] = useState<any>(null);
  const [isAbsenceModalOpen, setIsAbsenceModalOpen] = useState(false);
  const [selectedAbsenceParticipant, setSelectedAbsenceParticipant] = useState<any>(null);
  const [eventAbsences, setEventAbsences] = useState<any[]>([]);
  const [completionFilter, setCompletionFilter] = useState<'all' | 'complete' | 'incomplete'>('all');
  const [comedianTab, setComedianTab] = useState<ComedianTab>('opportunities');
  const [organizerTab, setOrganizerTab] = useState<OrganizerTab>('upcoming');
  const [superAdminTab, setSuperAdminTab] = useState<SuperAdminTab>('full');
  const [favoriteEventIds, setFavoriteEventIds] = useState<string[]>([]);
  const [favoriteComedianIds, setFavoriteComedianIds] = useState<string[]>([]);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [eventToCancel, setEventToCancel] = useState<IEvent | null>(null);
  const [eventsGroupToCancel, setEventsGroupToCancel] = useState<IEvent[] | null>(null);
  const [notifyingEventId, setNotifyingEventId] = useState<string | null>(null);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [eventToWithdraw, setEventToWithdraw] = useState<IEvent | null>(null);
  const [eventToDuplicate, setEventToDuplicate] = useState<IEvent | null>(null);
  const [selectedRecurrenceGroupId, setSelectedRecurrenceGroupId] = useState<string | null>(null);
  const [expandedUpcomingGroupId, setExpandedUpcomingGroupId] = useState<string | null>(null);
  const [openActionsEventId, setOpenActionsEventId] = useState<string | null>(null);
  const [spectatorsModalEvent, setSpectatorsModalEvent] = useState<IEvent | null>(null);
  const [ratingsModalEvent, setRatingsModalEvent] = useState<IEvent | null>(null);
  const actionsMenuRef = useRef<HTMLDivElement | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [locationSearch, setLocationSearch] = useState(''); // Recherche par lieu pour les humoristes
  const [experienceFilter, setExperienceFilter] = useState<'all' | '0-50' | '50-200' | '200+'>('all'); // Filtre par niveau d'expérience
  // États pour les filtres organisateur
  const [organizerEventZoneSearch, setOrganizerEventZoneSearch] = useState(''); // Recherche par zone d'événement pour les organisateurs
  const [organizerEventExperienceFilter, setOrganizerEventExperienceFilter] = useState<'all' | '0-50' | '50-200' | '200+'>('all'); // Filtre par niveau d'expérience pour les organisateurs
  // États pour la recherche d'humoristes par zone
  const [comedianZoneType, setComedianZoneType] = useState<'ville' | 'departement' | 'region'>('ville'); // Type de zone
  const [comedianZoneSearch, setComedianZoneSearch] = useState(''); // Zone de recherche
  const [comedianExperienceFilter, setComedianExperienceFilter] = useState<'all' | '0-50' | '50-200' | '200+'>('all'); // Filtre par niveau
  const [comedianSearchResults, setComedianSearchResults] = useState<ComedianSearchResult[]>([]);
  const [comedianSearchTotal, setComedianSearchTotal] = useState(0);
  const [comedianSearchPage, setComedianSearchPage] = useState(1);
  const [isSearchingComedians, setIsSearchingComedians] = useState(false);
  const [comedianSearchError, setComedianSearchError] = useState<string | null>(null);
  const [showComedianSearchSection, setShowComedianSearchSection] = useState(false);
  // États pour la modal d'invitation d'humoriste
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [comedianToInvite, setComedianToInvite] = useState<ComedianSearchResult | null>(null);
  const [selectedEventForInvite, setSelectedEventForInvite] = useState<string>('');
  const [isInviting, setIsInviting] = useState(false);
  const [upcomingPage, setUpcomingPage] = useState(1);
  const [archivedPage, setArchivedPage] = useState(1);
  const [cancelledPage, setCancelledPage] = useState(1);
  const [completedPage, setCompletedPage] = useState(1);
  const [focusParticipantsSection, setFocusParticipantsSection] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Définir l'onglet initial pour les comédiens en fonction du paramètre URL 'tab'
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tabParam = params.get('tab');

    if (isComedianView && tabParam) {
      const validComedianTabs: ComedianTab[] = ['opportunities', 'accepted', 'favorites', 'recommendations'];
      if (validComedianTabs.includes(tabParam as ComedianTab)) {
        setComedianTab(tabParam as ComedianTab);
      } else {
        setComedianTab('opportunities');
      }
    }
  }, [isComedianView, location.search]);

  // Définir l'onglet initial pour les organisateurs en fonction du paramètre URL 'tab'
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tabParam = params.get('tab');

    if (isOrganizerView && tabParam) {
      const validOrganizerTabs: OrganizerTab[] = ['upcoming', 'full', 'archived', 'cancelled', 'calendar', 'favoriteComedians', 'recurringEvents'];
      if (validOrganizerTabs.includes(tabParam as OrganizerTab)) {
        setOrganizerTab(tabParam as OrganizerTab);
      } else {
        setOrganizerTab('upcoming');
      }
    } else if (!isOrganizerView) {
      setOrganizerTab('upcoming');
    }
  }, [isOrganizerView, location.search]);

  // Définir l'onglet initial pour les super-admins en fonction du paramètre URL 'tab'
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tabParam = params.get('tab');

    if (user?.role === 'SUPER_ADMIN' && tabParam) {
      const validSuperAdminTabs: SuperAdminTab[] = ['full', 'upcoming', 'archived', 'cancelled'];
      if (validSuperAdminTabs.includes(tabParam as SuperAdminTab)) {
        setSuperAdminTab(tabParam as SuperAdminTab);
      } else {
        setSuperAdminTab('full');
      }
    } else if (user?.role !== 'SUPER_ADMIN') {
      setSuperAdminTab('full');
    }
  }, [user?.role, location.search]);

useEffect(() => {
  if (user?.role === 'SUPER_ADMIN') {
    const params = new URLSearchParams(location.search);
    setSearchTerm(params.get('search') || '');
  } else {
    setSearchTerm('');
  }
}, [user?.role, location.search]);

  // Refs pour le scroll automatique
  const cancelledSectionRef = useRef<HTMLDivElement>(null);
  const archivedSectionRef = useRef<HTMLDivElement>(null);
  const participantsSectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isModalOpen && focusParticipantsSection && participantsSectionRef.current) {
      const timeout = setTimeout(() => {
        participantsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setFocusParticipantsSection(false);
      }, 200);
      return () => clearTimeout(timeout);
    }
  }, [isModalOpen, focusParticipantsSection]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (openActionsEventId && actionsMenuRef.current && !actionsMenuRef.current.contains(e.target as Node)) {
        setOpenActionsEventId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [openActionsEventId]);

  const { data: fetchedEvents, isLoading: eventsLoading, isError: eventsError, error: eventsErrorMessage, refetch } = useQuery<IEvent[], Error>({
    queryKey: ['events', user?._id, user?.role, location.search],
    queryFn: async () => {
      if (!user?._id) {
        throw new Error("Informations d'authentification manquantes.");
      }
      // Pour les humoristes, récupérer TOUS les évènements
      // Pour les organisateurs, récupérer seulement leurs évènements
      const apiUrl = user?.role === 'ORGANIZER'
        ? `/events?organizerId=${user._id}`
        : `/events`; // Pas de filtre organizerId pour les humoristes
      
      try {
        const res = await api.get<IEvent[]>(apiUrl);
        const list = Array.isArray(res.data) ? res.data : (Array.isArray((res.data as any)?.events) ? (res.data as any).events : []);
        console.log("MyEventsPage: Données d'évènements reçues par useQuery:", list);
        console.log("MyEventsPage: User role:", user?.role);
        console.log("📅 DÉTAIL DES DATES RÉCUPÉRÉES:", list.map((e: IEvent) => ({
          title: e.title,
          status: e.status,
          dateOriginale: e.date,
          dateParsee: new Date(e.date).toLocaleDateString('fr-FR'),
          estPasse: new Date(e.date) < new Date()
        })));
        return list as IEvent[];
      } catch (error: any) {
        console.error("❌ Erreur lors de la récupération des évènements:", error);
        console.error("❌ Détails de l'erreur:", error.response?.data || error.message);
        throw error;
      }
    },
    enabled: isQueryEnabled, // Utiliser isQueryEnabled au lieu de true
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  // New useQuery for comedian's applications
  const { data: comedianApplications, isLoading: comedianApplicationsLoading, isError: comedianApplicationsError, error: comedianApplicationsErrorMessage } = useQuery<IApplication[], Error>({
    queryKey: ['comedianApplications', user?._id],
    queryFn: async () => {
      if (!user?._id) {
        throw new Error("Informations d'authentification manquantes pour les candidatures.");
      }
      const res = await api.get<IApplication[]>(`/applications?comedianId=${user._id}`);
      const list = Array.isArray(res.data) ? res.data : (Array.isArray((res.data as any)?.applications) ? (res.data as any).applications : []);
      return list as IApplication[];
    },
    enabled: user?.role === 'COMEDIAN' && isQueryEnabled, // Only enable for comedians
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  // Charger les scores de recommandation pour les humoristes
  const { data: recommendationsData, isLoading: recommendationsLoading } = useQuery<{
    recommendations: Array<{
      event: IEvent;
      score: number;
      breakdown?: { geographic: number; experienceLevel: number; experienceYears: number };
      matchReasons?: string[];
    }>
  }, Error>({
    queryKey: ['recommendations', user?._id],
    queryFn: async () => {
      if (!user?._id || user?.role !== 'COMEDIAN') {
        throw new Error("Informations d'authentification manquantes.");
      }
      const response = await getRecommendations({ limit: 200 }); // Charger suffisamment d'événements
      return response;
    },
    enabled: isComedianView && isQueryEnabled,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  // Charger les recommandations intelligentes (basées sur l'historique)
  const { data: smartRecommendationsData, isLoading: smartRecommendationsLoading } = useQuery<SmartRecommendationsResponse, Error>({
    queryKey: ['smartRecommendations', user?._id],
    queryFn: async () => {
      if (!user?._id || user?.role !== 'COMEDIAN') {
        throw new Error("Informations d'authentification manquantes.");
      }
      const response = await getSmartRecommendations({ limit: 100 });
      return response;
    },
    enabled: isComedianView && isQueryEnabled,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  // Créer un Map pour accéder aux informations de match par eventId
  const smartRecommendationMap = useMemo(() => {
    const map = new Map<string, SmartRecommendation>();
    if (smartRecommendationsData?.recommendations) {
      smartRecommendationsData.recommendations.forEach(rec => {
        if (rec.event?._id) {
          map.set(String(rec.event._id), rec);
        }
      });
    }
    return map;
  }, [smartRecommendationsData]);

  // Événements des recommandations intelligentes
  const smartRecommendationEvents = useMemo(() => {
    if (!smartRecommendationsData?.recommendations) return [];
    return smartRecommendationsData.recommendations.map(rec => rec.event);
  }, [smartRecommendationsData]);

  // Créer un Map des scores et détails par eventId pour un accès rapide
  const eventRecommendationMap = useMemo(() => {
    const map = new Map<string, {
      score: number;
      breakdown?: { geographic: number; experienceLevel: number; experienceYears: number };
      matchReasons?: string[];
    }>();
    if (recommendationsData?.recommendations) {
      recommendationsData.recommendations.forEach(rec => {
        if (rec.event?._id) {
          map.set(String(rec.event._id), {
            score: rec.score,
            breakdown: rec.breakdown,
            matchReasons: rec.matchReasons
          });
        }
      });
    }
    return map;
  }, [recommendationsData]);

  // Événements de l'API recommendations avec leurs scores (pour l'onglet Opportunités)
  const recommendationEventsWithScores = useMemo(() => {
    if (!recommendationsData?.recommendations) return [];
    return recommendationsData.recommendations.map(rec => ({
      ...rec.event,
      _recommendationScore: rec.score
    }));
  }, [recommendationsData]);

  // Scroll automatique vers les sections selon les paramètres URL
  useEffect(() => {
    const queryParams = new URLSearchParams(location.search);
    const statusFilters = queryParams.getAll('status');
    
    // Délai pour s'assurer que les éléments sont rendus
    const scrollTimeout = setTimeout(() => {
      if (statusFilters.includes('cancelled') && cancelledSectionRef.current) {
        console.log('🎯 Scroll automatique vers la section "Évènements annulés"');
        cancelledSectionRef.current.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'start' 
        });
      } else if (statusFilters.includes('completed') && archivedSectionRef.current) {
        console.log('🎯 Scroll automatique vers la section "Évènements archivés"');
        archivedSectionRef.current.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'start' 
        });
      }
    }, 500); // Délai de 500ms pour s'assurer que les données sont chargées

    return () => clearTimeout(scrollTimeout);
  }, [location.search, fetchedEvents]); // Dépend de la recherche et des données

  // Memoize the set of applied event IDs
  const appliedEventIds = useMemo(() => {
    if (user?.role === 'COMEDIAN' && comedianApplications) {
      return new Set(comedianApplications.filter(app => app.event).map(app => app.event._id));
    }
    return new Set<string>();
  }, [comedianApplications, user?.role]);

  const favoriteIdsSet = useMemo(() => new Set(favoriteEventIds), [favoriteEventIds]);

  const toggleFavoriteEvent = async (eventId: string) => {
    if (!isComedianView || !user?._id) return;

    const isCurrentlyFavorite = favoriteIdsSet.has(eventId);

    // Optimistic update
    setFavoriteEventIds(prev => {
      const updated = new Set(prev);
      if (isCurrentlyFavorite) {
        updated.delete(eventId);
      } else {
        updated.add(eventId);
      }
      return Array.from(updated);
    });

    try {
      if (isCurrentlyFavorite) {
        await removeEventFavorite(eventId);
      } else {
        await addEventFavorite(eventId);
      }
      // Rafraîchir les favoris depuis l'API pour s'assurer de la cohérence
      await refetchEventFavorites();
    } catch (error: any) {
      console.error('❌ [MyEventsPage] Erreur lors de la modification des favoris:', error);
      // Revert optimistic update en cas d'erreur
      setFavoriteEventIds(prev => {
        const updated = new Set(prev);
        if (isCurrentlyFavorite) {
          updated.add(eventId);
        } else {
          updated.delete(eventId);
        }
        return Array.from(updated);
      });
      showError(getErrorMessage(error, 'Erreur lors de la modification des favoris'));
    }
  };

  // Toggle favori pour un humoriste (organisateurs)
  const toggleFavoriteComedian = async (comedianId: string) => {
    if (!isOrganizerView || !user?._id) return;

    const isCurrentlyFavorite = favoriteComedianIds.includes(comedianId);

    // Mise à jour optimiste
    setFavoriteComedianIds((prev: string[]) => {
      if (isCurrentlyFavorite) {
        return prev.filter((id: string) => id !== comedianId);
      } else {
        return [...prev, comedianId];
      }
    });

    try {
      if (isCurrentlyFavorite) {
        await removeFavorite(comedianId);
      } else {
        await addFavorite(comedianId);
      }
    } catch (error: any) {
      console.error('Erreur lors de la modification des favoris d\'humoriste:', error);
      // Revert en cas d'erreur
      setFavoriteComedianIds((prev: string[]) => {
        if (isCurrentlyFavorite) {
          return [...prev, comedianId];
        } else {
          return prev.filter((id: string) => id !== comedianId);
        }
      });
      showError(getErrorMessage(error, 'Erreur lors de la modification des favoris'));
    }
  };

  const comedianApplicationsMap = useMemo(() => {
    const map = new Map<string, IApplication>();
    if (comedianApplications) {
      comedianApplications.forEach(app => {
        if (app.event?._id) {
          map.set(app.event._id, app);
        }
      });
    }
    return map;
  }, [comedianApplications]);

  /** true si l'événement commence dans moins d'1 h ou a déjà commencé → plus de postuler ni désinscrire */
  const isEventWithinOneHour = (event: { date: string; startTime?: string }): boolean => {
    if (!event?.date) return false;
    const dateStr = typeof event.date === 'string' ? event.date.split('T')[0] : new Date(event.date).toISOString().split('T')[0];
    const startTime = (event.startTime || '00:00').trim();
    const eventStart = new Date(dateStr + 'T' + startTime + ':00');
    const oneHourFromNow = Date.now() + 60 * 60 * 1000;
    return eventStart.getTime() <= oneHourFromNow;
  };

  // Fonction utilitaire pour comparer les dates (ignorer l'heure)
  const isEventPast = (eventDateString: string, endTime?: string): boolean => {
    // Si endTime n'est pas fourni, on considère la fin de la journée
    const eventDate = new Date(eventDateString);
    let eventEndDateTime: Date;
    if (endTime) {
      // On suppose que endTime est au format "HH:mm" (ex: "23:30")
      const [hours, minutes] = endTime.split(":").map(Number);
      eventEndDateTime = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate(), hours, minutes);
    } else {
      // Fin de la journée si pas d'heure de fin
      eventEndDateTime = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate(), 23, 59, 59, 999);
    }
    const now = new Date();
    return now > eventEndDateTime;
  };

  // Fonction utilitaire pour obtenir le nom de l'organisateur de manière sécurisée
  const getOrganizerIdFromEvent = (organizer: any): string | undefined => {
    if (!organizer) return undefined;
    if (typeof organizer === 'string') return organizer;
    return organizer._id || organizer.id;
  };

  const formatEventLocation = (event: IEvent): string => {
    const location = event.location;
    if (location && typeof location === 'object') {
      const venue = location.venue || '';
      const address = location.address || '';
      const city = location.city || '';
      return [venue, address, city].filter(Boolean).join(', ') || 'Lieu non spécifié';
    }
    return 'Lieu non spécifié';
  };

  const formatEventTimeRange = (event: IEvent): string => {
    const { startTime, endTime } = event;
    if (startTime && endTime) return `${startTime} - ${endTime}`;
    if (startTime) return startTime;
    if (endTime) return endTime;
    return 'Horaires non précisés';
  };

  const getParticipantsRatio = (event: IEvent): string => {
    const current = event.participants?.length || 0;
    const max = event.requirements?.maxPerformers || 0;
    return `${current}/${max}`;
  };

  const isEventComplete = (event: IEvent): boolean => {
    const current = event.participants?.length || 0;
    const max = event.requirements?.maxPerformers || 0;
    if (!max) return false;
    return current >= max;
  };

  // Extraire la liste unique des organisateurs pour le dropdown
  const availableOrganizers = useMemo(() => {
    if (!fetchedEvents || user?.role !== 'SUPER_ADMIN') return [];
    
    const organizersMap = new Map();
    fetchedEvents.forEach((event: IEvent) => {
      if (!event.organizer) return; // Ignorer les évènements sans organisateur
      const organizer = typeof event.organizer === 'object' ? event.organizer : null;
      if (!organizer) return;
      
      const fullName = `${organizer.firstName || ''} ${organizer.lastName || ''}`.trim();
      if (!fullName) return;
      
      if (!organizersMap.has(fullName)) {
        organizersMap.set(fullName, {
          fullName,
          firstName: organizer.firstName || '',
          lastName: organizer.lastName || '',
          id: organizer._id || organizer
        });
      }
    });
    
    return Array.from(organizersMap.values()).sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [fetchedEvents, user?.role]);

  const { upcomingEvents, archivedEvents, cancelledEvents } = useMemo(() => {
    const upcoming: IEvent[] = [];
    const archived: IEvent[] = [];
    const cancelled: IEvent[] = [];

    if (fetchedEvents) {
      const eventsToFilter = fetchedEvents as IEvent[];
      const queryParams = new URLSearchParams(location.search);
      const statusFilters = queryParams.getAll('status');
      const dateFilter = queryParams.get('date');
      const organizerFilter = queryParams.get('organizer');
      const keywordFilter = queryParams.get('search');

      console.log('🔄 RECALCUL DES FILTRES:', {
        totalEvents: eventsToFilter.length,
        organizerFilter,
        keywordFilter,
        userRole: user?.role
      });

      let filteredEvents = eventsToFilter;

      if (statusFilters.length > 0) {
        filteredEvents = filteredEvents.filter((event: IEvent) => event.status && statusFilters.includes(event.status));
      }

      // Sécurité supplémentaire côté client : un organisateur ne peut voir que ses propres évènements
      if (user?.role === 'ORGANIZER' && user?._id) {
        filteredEvents = filteredEvents.filter((event: IEvent) => {
          const organizerId = getOrganizerIdFromEvent(event.organizer);
          const matches = organizerId === user._id;
          if (!matches) {
            console.warn('🚫 Évènement ignoré car il n’appartient pas à cet organisateur:', {
              eventTitle: event.title,
              eventOrganizer: organizerId,
              currentUser: user._id,
            });
          }
          return matches;
        });
      }

      // Filtre par organisateur (pour super admin)
      if (user?.role === 'SUPER_ADMIN' && organizerFilter) {
        console.log(`🔍 Filtrage par organisateur: "${organizerFilter}"`);
        console.log(`📊 Évènements avant filtrage organisateur: ${filteredEvents.length}`);
        filteredEvents = filteredEvents.filter((event: IEvent) => {
          const eventOrganizerName = getOrganizerName(event.organizer);
          const matches = eventOrganizerName === organizerFilter;
          console.log(`   - Évènement "${event.title}" (organisateur: "${eventOrganizerName}") → ${matches ? 'INCLUS' : 'EXCLU'}`);
          return matches;
        });
        console.log(`📊 Évènements après filtrage organisateur: ${filteredEvents.length}`);
      }

      // Barre de recherche mots-clés (pour super admin)
      if (user?.role === 'SUPER_ADMIN' && keywordFilter) {
        const normalized = keywordFilter.toLowerCase();
        filteredEvents = filteredEvents.filter((event: IEvent) => {
          const locationData = event.location || { city: '', address: '', venue: '' };
          const organizerName = getOrganizerName(event.organizer);
          const fieldsToSearch = [
            event.title,
            event.description,
            organizerName,
            locationData.city,
            locationData.address,
            locationData.venue,
          ];
          return fieldsToSearch.some((field) => field?.toLowerCase().includes(normalized));
        });
      }

      const now = new Date();
      // Comparaison uniquement par date (ignorer l'heure)
      const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      
      console.log(`🔍 DEBUG CLASSIFICATION - Aujourd'hui: ${todayMidnight.toLocaleDateString('fr-FR')}`);
      console.log(`📊 Total évènements récupérés: ${filteredEvents.length}`);
      
      filteredEvents.forEach((event: IEvent) => {
        // D'abord, isoler les évènements annulés pour qu'ils n'apparaissent pas ailleurs
        const isCancelled = (event.status === 'CANCELLED' || event.status === 'cancelled');
        if (isCancelled) {
          cancelled.push(event);
          return;
        }
        // Utilise la nouvelle logique avec endTime
        const eventIsPast = isEventPast(event.date, event.endTime);
        const eventDate = new Date(event.date);
        
        // Debug logging détaillé pour tracer TOUS les évènements
        console.log(`\n🎭 Évènement "${event.title}":`, {
          dateOriginale: event.date,
          dateParsee: eventDate.toLocaleDateString('fr-FR'),
          aujourdhuiMidnight: todayMidnight.toLocaleDateString('fr-FR'),
          status: event.status,
          estPasse: eventIsPast,
          estFutur: !eventIsPast
        });
        
        // **LOGIQUE UNIVERSELLE** : TOUS les évènements passés sont archivés
        if (eventIsPast) {
          archived.push(event);
          console.log(`✅ → ARCHIVÉ: ${event.title} (date passée: ${eventDate.toLocaleDateString('fr-FR')})`);
        } else {
          upcoming.push(event);
          console.log(`📅 → À VENIR: ${event.title} (date future/aujourd'hui: ${eventDate.toLocaleDateString('fr-FR')})`);
        }
      });
      
      console.log(`\n📈 RÉSULTAT CLASSIFICATION:`);
      console.log(`   • Évènements à venir: ${upcoming.length}`);
      console.log(`   • Évènements archivés: ${archived.length}`);
      console.log(`   • Évènements annulés: ${cancelled.length}`);

      if (dateFilter === 'upcoming') {
          archived.length = 0;
      } else if (dateFilter === 'past') {
          upcoming.length = 0;
      }

      upcoming.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      archived.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      cancelled.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }

    return { upcomingEvents: upcoming, archivedEvents: archived, cancelledEvents: cancelled };
  }, [fetchedEvents, location.search]);

  // Groupes d'événements récurrents (par recurrenceGroupId) pour l'organisateur
  const recurringGroups = useMemo(() => {
    if (!fetchedEvents || !Array.isArray(fetchedEvents) || user?.role !== 'ORGANIZER' || !user?._id) return new Map<string, IEvent[]>();
    const map = new Map<string, IEvent[]>();
    (fetchedEvents as IEvent[]).forEach((event: IEvent) => {
      const groupId = (event as IEvent & { recurrenceGroupId?: string }).recurrenceGroupId;
      if (!groupId) return;
      const organizerId = getOrganizerIdFromEvent(event.organizer);
      if (organizerId !== user._id) return;
      const list = map.get(groupId) || [];
      list.push(event);
      map.set(groupId, list);
    });
    map.forEach((list) => list.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()));
    return map;
  }, [fetchedEvents, user?._id, user?.role]);

  // Groupes d'événements récurrents pour le super admin (tous organisateurs)
  const recurringGroupsSuperAdmin = useMemo(() => {
    if (!fetchedEvents || !Array.isArray(fetchedEvents) || user?.role !== 'SUPER_ADMIN') return new Map<string, IEvent[]>();
    const map = new Map<string, IEvent[]>();
    (fetchedEvents as IEvent[]).forEach((event: IEvent) => {
      const groupId = (event as IEvent & { recurrenceGroupId?: string }).recurrenceGroupId;
      if (!groupId) return;
      const list = map.get(groupId) || [];
      list.push(event);
      map.set(groupId, list);
    });
    map.forEach((list) => list.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()));
    return map;
  }, [fetchedEvents, user?.role]);

  const totalCancelledPages = Math.max(1, Math.ceil(cancelledEvents.length / ITEMS_PER_PAGE));
  const paginatedCancelledEvents = cancelledEvents.slice(
    (cancelledPage - 1) * ITEMS_PER_PAGE,
    cancelledPage * ITEMS_PER_PAGE
  );

  useEffect(() => {
    setCancelledPage(1);
  }, [cancelledEvents]);

  useEffect(() => {
    if (cancelledPage > totalCancelledPages) {
      setCancelledPage(totalCancelledPages);
    }
  }, [cancelledPage, totalCancelledPages]);

  // Filtrer les évènements archivés côté HUMORISTE: afficher uniquement ceux auxquels il a postulé
  const archivedEventsToShow = useMemo(() => {
    if (user?.role === 'COMEDIAN') {
      return archivedEvents.filter(e => appliedEventIds.has(e._id));
    }
    return archivedEvents;
  }, [archivedEvents, appliedEventIds, user?.role]);

  const totalArchivedPages = Math.max(1, Math.ceil(archivedEventsToShow.length / ITEMS_PER_PAGE));
  const paginatedArchivedEvents = archivedEventsToShow.slice(
    (archivedPage - 1) * ITEMS_PER_PAGE,
    archivedPage * ITEMS_PER_PAGE
  );

  useEffect(() => {
    setArchivedPage(1);
  }, [archivedEventsToShow]);

  useEffect(() => {
    if (archivedPage > totalArchivedPages) {
      setArchivedPage(totalArchivedPages);
    }
  }, [archivedPage, totalArchivedPages]);

  // Fonction de filtrage pour les évènements à venir
  // Évènements ACCEPTÉS (à venir) pour l'humoriste
  const acceptedUpcomingEvents = useMemo(() => {
    if (user?.role === 'COMEDIAN' && comedianApplications) {
      let filtered = upcomingEvents.filter((event) => {
        const app = comedianApplications.find(a => a.event && a.event._id === event._id);
        return app && app.status === 'ACCEPTED';
      });
      
      // Filtre 1 : par lieu (recherche dans city, address, venue)
      if (locationSearch.trim()) {
        const searchLower = locationSearch.toLowerCase().trim();
        filtered = filtered.filter(event => {
          const location = event.location;
          if (!location || typeof location !== 'object') return false;
          const city = (location.city || '').toLowerCase();
          const address = (location.address || '').toLowerCase();
          const venue = (location.venue || '').toLowerCase();
          return city.includes(searchLower) || address.includes(searchLower) || venue.includes(searchLower);
        });
      }
      
      // Filtre 2 : par niveau d'expérience requis de l'événement
      // Ce filtre est appliqué sur les résultats déjà filtrés par lieu
      if (experienceFilter !== 'all') {
        filtered = filtered.filter(event => {
          const eventRequiredLevel = event.requirements?.requiredExperienceLevel || 'all';
          // Si l'événement accepte tous les niveaux, on l'affiche
          if (eventRequiredLevel === 'all') {
            return true;
          }
          // Sinon, on vérifie si le niveau requis correspond au filtre sélectionné
          return eventRequiredLevel === experienceFilter;
        });
      }
      
      // Retourne les événements acceptés qui satisfont les deux filtres (si les deux sont actifs)
      return filtered;
    }
    return [] as IEvent[];
  }, [user?.role, comedianApplications, upcomingEvents, locationSearch, experienceFilter]);

  // Base des évènements à venir POUR POSTULER (exclut les acceptés pour l'humoriste)
  const upcomingEventsForApply = useMemo(() => {
    if (user?.role === 'COMEDIAN') {
      const acceptedIds = new Set(acceptedUpcomingEvents.map(e => e._id));
      return upcomingEvents.filter(e => !acceptedIds.has(e._id));
    }
    return upcomingEvents;
  }, [user?.role, acceptedUpcomingEvents, upcomingEvents]);

  const pendingApplicationEvents = useMemo(() => {
    if (user?.role === 'COMEDIAN' && comedianApplications) {
      return comedianApplications
        .filter(app => {
          const isPending = app.status === 'PENDING';
          const hasEvent = !!app.event;
          const eventStatus = app.event?.status?.toLowerCase();
          const isPublished = eventStatus === 'published';
          return isPending && hasEvent && isPublished;
        })
        .map(app => app.event as unknown as IEvent);
    }
    return [] as IEvent[];
  }, [comedianApplications, user?.role]);

  const rejectedApplicationEvents = useMemo(() => {
    if (user?.role === 'COMEDIAN' && comedianApplications) {
      return comedianApplications
        .filter(app => app.status === 'REJECTED' && app.event)
        .map(app => app.event as unknown as IEvent);
    }
    return [] as IEvent[];
  }, [comedianApplications, user?.role]);

  const comedianVisibleEvents = useMemo(() => {
    if (!isComedianView) return [] as IEvent[];
    const map = new Map<string, IEvent>();
    [...upcomingEventsForApply, ...acceptedUpcomingEvents, ...pendingApplicationEvents, ...rejectedApplicationEvents].forEach(event => {
      if (event?._id) {
        map.set(event._id, event);
      }
    });
    return Array.from(map.values());
  }, [isComedianView, upcomingEventsForApply, acceptedUpcomingEvents, pendingApplicationEvents, rejectedApplicationEvents]);

  const favoriteEvents = useMemo(() => {
    if (!isComedianView || favoriteEventIds.length === 0) return [] as IEvent[];
    const favoriteSet = favoriteIdsSet;
    let filtered = comedianVisibleEvents.filter(event => favoriteSet.has(event._id));
    
    // Filtre 1 : par lieu (recherche dans city, address, venue)
    if (locationSearch.trim()) {
      const searchLower = locationSearch.toLowerCase().trim();
      filtered = filtered.filter(event => {
        const location = event.location;
        if (!location || typeof location !== 'object') return false;
        const city = (location.city || '').toLowerCase();
        const address = (location.address || '').toLowerCase();
        const venue = (location.venue || '').toLowerCase();
        return city.includes(searchLower) || address.includes(searchLower) || venue.includes(searchLower);
      });
    }
    
    // Filtre 2 : par niveau d'expérience requis de l'événement
    // Ce filtre est appliqué sur les résultats déjà filtrés par lieu
    if (experienceFilter !== 'all') {
      filtered = filtered.filter(event => {
        const eventRequiredLevel = event.requirements?.requiredExperienceLevel || 'all';
        // Si l'événement accepte tous les niveaux, on l'affiche
        if (eventRequiredLevel === 'all') {
          return true;
        }
        // Sinon, on vérifie si le niveau requis correspond au filtre sélectionné
        return eventRequiredLevel === experienceFilter;
      });
    }
    
    // Retourne les événements favoris qui satisfont les deux filtres (si les deux sont actifs)
    return filtered;
  }, [isComedianView, favoriteEventIds, favoriteIdsSet, comedianVisibleEvents, locationSearch, experienceFilter]);

  // Fonction de filtrage pour les humoristes (par lieu ET niveau d'expérience)
  // Utilise les événements de l'API principale avec les scores de l'API recommendations
  const getFilteredUpcomingEvents = useCallback(() => {
    // Utiliser les événements de l'API principale et y attacher les scores
    let base = upcomingEventsForApply.map(event => ({
      ...event,
      _recommendationScore: eventRecommendationMap.get(String(event._id))?.score ?? 0
    })) as (IEvent & { _recommendationScore: number })[];

    // Filtre 1 : par lieu (recherche dans city, address, venue)
    if (locationSearch.trim()) {
      const searchLower = locationSearch.toLowerCase().trim();
      base = base.filter(event => {
        const location = event.location;
        if (!location || typeof location !== 'object') return false;
        const city = (location.city || '').toLowerCase();
        const address = (location.address || '').toLowerCase();
        const venue = (location.venue || '').toLowerCase();
        return city.includes(searchLower) || address.includes(searchLower) || venue.includes(searchLower);
      });
    }

    // Filtre 2 : par niveau d'expérience requis de l'événement
    if (experienceFilter !== 'all') {
      base = base.filter(event => {
        const eventRequiredLevel = event.requirements?.requiredExperienceLevel || 'all';
        if (eventRequiredLevel === 'all') {
          return true;
        }
        return eventRequiredLevel === experienceFilter;
      });
    }

    // Filtre par complétion
    if (completionFilter === 'complete') {
      base = base.filter(event => (event.participants?.length || 0) >= (event.requirements?.maxPerformers || 0));
    }
    if (completionFilter === 'incomplete') {
      base = base.filter(event => (event.participants?.length || 0) < (event.requirements?.maxPerformers || 0));
    }

    // Trier par score de recommandation (décroissant)
    return base.sort((a, b) => b._recommendationScore - a._recommendationScore);
  }, [completionFilter, upcomingEventsForApply, locationSearch, experienceFilter, eventRecommendationMap]);

  const filteredUpcomingEvents = useMemo(
    () => getFilteredUpcomingEvents(),
    [getFilteredUpcomingEvents]
  );

  const completedUpcomingEvents = useMemo(() => {
    return upcomingEvents.filter(event => isEventComplete(event));
  }, [upcomingEvents]);

  const incompleteUpcomingEvents = useMemo(() => {
    return upcomingEvents.filter(event => !isEventComplete(event));
  }, [upcomingEvents]);

  // Fonction de filtrage pour les organisateurs (par zone d'événement ET niveau d'expérience)
  // Les deux filtres sont appliqués ensemble : un événement doit satisfaire les deux conditions
  const getFilteredOrganizerEvents = (events: IEvent[]): IEvent[] => {
    let filtered = [...events];
    
    // Filtre 1 : par zone d'événement (recherche dans city, address, venue)
    if (organizerEventZoneSearch.trim()) {
      const searchLower = organizerEventZoneSearch.toLowerCase().trim();
      filtered = filtered.filter(event => {
        const location = event.location;
        if (!location || typeof location !== 'object') return false;
        const city = (location.city || '').toLowerCase();
        const address = (location.address || '').toLowerCase();
        const venue = (location.venue || '').toLowerCase();
        return city.includes(searchLower) || address.includes(searchLower) || venue.includes(searchLower);
      });
    }
    
    // Filtre 2 : par niveau d'expérience requis de l'événement
    // Ce filtre est appliqué sur les résultats déjà filtrés par zone
    if (organizerEventExperienceFilter !== 'all') {
      filtered = filtered.filter(event => {
        const eventRequiredLevel = event.requirements?.requiredExperienceLevel || 'all';
        // Si l'événement accepte tous les niveaux, on l'affiche
        if (eventRequiredLevel === 'all') {
          return true;
        }
        // Sinon, on vérifie si le niveau requis correspond au filtre
        return eventRequiredLevel === organizerEventExperienceFilter;
      });
    }
    
    // Retourne les événements qui satisfont les deux filtres (si les deux sont actifs)
    return filtered;
  };

  // Appliquer les filtres aux événements organisateur
  const filteredOrganizerUpcomingEvents = useMemo(() => {
    if (!isOrganizerView) return upcomingEvents;
    let base = upcomingEvents;
    // Appliquer le filtre par complétion si nécessaire
    if (completionFilter === 'complete') {
      base = base.filter(event => isEventComplete(event));
    } else if (completionFilter === 'incomplete') {
      base = base.filter(event => !isEventComplete(event));
    }
    return getFilteredOrganizerEvents(base);
  }, [isOrganizerView, upcomingEvents, completionFilter, organizerEventZoneSearch, organizerEventExperienceFilter]);

  const filteredOrganizerCompletedEvents = useMemo(() => {
    if (!isOrganizerView) return completedUpcomingEvents;
    return getFilteredOrganizerEvents(completedUpcomingEvents);
  }, [isOrganizerView, completedUpcomingEvents, organizerEventZoneSearch, organizerEventExperienceFilter]);

  const filteredOrganizerArchivedEvents = useMemo(() => {
    if (!isOrganizerView) return archivedEventsToShow;
    return getFilteredOrganizerEvents(archivedEventsToShow);
  }, [isOrganizerView, archivedEventsToShow, organizerEventZoneSearch, organizerEventExperienceFilter]);

  const filteredOrganizerCancelledEvents = useMemo(() => {
    if (!isOrganizerView) return cancelledEvents;
    return getFilteredOrganizerEvents(cancelledEvents);
  }, [isOrganizerView, cancelledEvents, organizerEventZoneSearch, organizerEventExperienceFilter]);

  // Liste d'affichage "Évènements à venir" pour l'organisateur : événements uniques + groupes récurrents (un bloc par groupe)
  type UpcomingDisplayItem = { type: 'event'; event: IEvent } | { type: 'group'; groupId: string; events: IEvent[] };
  const upcomingDisplayItems = useMemo((): UpcomingDisplayItem[] => {
    if (!isOrganizerView || !filteredOrganizerUpcomingEvents?.length) return [];
    const groupIdsSeen = new Set<string>();
    const items: UpcomingDisplayItem[] = [];
    filteredOrganizerUpcomingEvents.forEach((event: IEvent) => {
      const groupId = (event as IEvent & { recurrenceGroupId?: string }).recurrenceGroupId;
      if (groupId) {
        if (!groupIdsSeen.has(groupId)) {
          groupIdsSeen.add(groupId);
          const groupEvents = recurringGroups.get(groupId) || [];
          const upcomingInGroup = groupEvents.filter((e) => {
            if (e.status === 'CANCELLED' || e.status === 'cancelled') return false;
            const d = new Date(e.date);
            d.setHours(0, 0, 0, 0);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            return d >= today;
          });
          if (upcomingInGroup.length > 0) {
            items.push({ type: 'group', groupId, events: upcomingInGroup.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()) });
          }
        }
        return;
      }
      items.push({ type: 'event', event });
    });
    items.sort((a, b) => {
      const dateA = a.type === 'event' ? new Date(a.event.date).getTime() : new Date(a.events[0]?.date ?? 0).getTime();
      const dateB = b.type === 'event' ? new Date(b.event.date).getTime() : new Date(b.events[0]?.date ?? 0).getTime();
      return dateA - dateB;
    });
    return items;
  }, [isOrganizerView, filteredOrganizerUpcomingEvents, recurringGroups]);

  // Liste d'affichage "Évènements à venir" pour le super admin : événements uniques + groupes récurrents (comme côté organisateur)
  const superAdminUpcomingDisplayItems = useMemo((): UpcomingDisplayItem[] => {
    if (!isSuperAdminView || !incompleteUpcomingEvents?.length) return [];
    const groupIdsSeen = new Set<string>();
    const items: UpcomingDisplayItem[] = [];
    incompleteUpcomingEvents.forEach((event: IEvent) => {
      const groupId = (event as IEvent & { recurrenceGroupId?: string }).recurrenceGroupId;
      if (groupId) {
        if (!groupIdsSeen.has(groupId)) {
          groupIdsSeen.add(groupId);
          const groupEvents = recurringGroupsSuperAdmin.get(groupId) || [];
          const upcomingInGroup = groupEvents.filter((e) => {
            if (e.status === 'CANCELLED' || e.status === 'cancelled') return false;
            const d = new Date(e.date);
            d.setHours(0, 0, 0, 0);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            return d >= today;
          });
          if (upcomingInGroup.length > 0) {
            items.push({ type: 'group', groupId, events: upcomingInGroup.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()) });
          }
        }
        return;
      }
      items.push({ type: 'event', event });
    });
    items.sort((a, b) => {
      const dateA = a.type === 'event' ? new Date(a.event.date).getTime() : new Date(a.events[0]?.date ?? 0).getTime();
      const dateB = b.type === 'event' ? new Date(b.event.date).getTime() : new Date(b.events[0]?.date ?? 0).getTime();
      return dateA - dateB;
    });
    return items;
  }, [isSuperAdminView, incompleteUpcomingEvents, recurringGroupsSuperAdmin]);

  const eventsToDisplay = useMemo(() => {
    if (isComedianView) {
      switch (comedianTab) {
        case 'accepted':
          return acceptedUpcomingEvents;
        case 'favorites':
          return favoriteEvents;
        case 'recommendations':
          return smartRecommendationEvents;
        default:
          return filteredUpcomingEvents;
      }
    }

    if (isOrganizerView) {
      switch (organizerTab) {
        case 'upcoming':
          return filteredOrganizerUpcomingEvents;
        case 'full':
          return filteredOrganizerCompletedEvents;
        case 'archived':
          return filteredOrganizerArchivedEvents;
        case 'cancelled':
          return filteredOrganizerCancelledEvents;
        case 'calendar':
          return upcomingEvents; // Le calendrier n'a pas besoin de filtres
        default:
          return filteredOrganizerUpcomingEvents;
      }
    }

    if (isSuperAdminView) {
      switch (superAdminTab) {
        case 'upcoming':
          return incompleteUpcomingEvents;
        case 'full':
          return completedUpcomingEvents;
        case 'archived':
          return archivedEventsToShow;
        case 'cancelled':
          return cancelledEvents;
        default:
          return incompleteUpcomingEvents;
      }
    }

    return filteredUpcomingEvents;
  }, [
    isComedianView,
    isOrganizerView,
    isSuperAdminView,
    superAdminTab,
    organizerTab,
    comedianTab,
    filteredUpcomingEvents,
    filteredOrganizerUpcomingEvents,
    filteredOrganizerCompletedEvents,
    filteredOrganizerArchivedEvents,
    filteredOrganizerCancelledEvents,
    acceptedUpcomingEvents,
    favoriteEvents,
    smartRecommendationEvents,
    incompleteUpcomingEvents,
    completedUpcomingEvents,
    archivedEventsToShow,
    cancelledEvents,
    upcomingEvents,
  ]);

  const comedianTabCounts: Record<ComedianTab, number> = useMemo(() => ({
    opportunities: filteredUpcomingEvents.length,
    accepted: acceptedUpcomingEvents.length,
    favorites: favoriteEvents.length,
    recommendations: smartRecommendationEvents.length,
  }), [filteredUpcomingEvents, acceptedUpcomingEvents, favoriteEvents, smartRecommendationEvents]);

  const organizerTabCounts: Record<OrganizerTab, number> = useMemo(() => ({
    upcoming: isOrganizerView ? upcomingDisplayItems.length : filteredUpcomingEvents.length,
    full: completedUpcomingEvents.length,
    archived: archivedEventsToShow.length,
    cancelled: cancelledEvents.length,
    calendar: upcomingEvents.length + archivedEventsToShow.length + cancelledEvents.length,
    favoriteComedians: favoriteComedianIds.length,
    recurringEvents: recurringGroups.size,
  }), [isOrganizerView, upcomingDisplayItems.length, filteredUpcomingEvents, completedUpcomingEvents, archivedEventsToShow, cancelledEvents, upcomingEvents, favoriteComedianIds, recurringGroups.size]);

  const superAdminTabCounts: Record<SuperAdminTab, number> = useMemo(() => ({
    full: completedUpcomingEvents.length,
    upcoming: superAdminUpcomingDisplayItems.length,
    archived: archivedEventsToShow.length,
    cancelled: cancelledEvents.length,
  }), [completedUpcomingEvents, superAdminUpcomingDisplayItems.length, archivedEventsToShow, cancelledEvents]);

  const comedianTabTitles: Record<ComedianTab, string> = {
    opportunities: 'Opportunités à venir',
    accepted: 'Évènements acceptés',
    favorites: 'Mes favoris',
    recommendations: 'Recommandations',
  };

  const organizerTabTitles: Record<OrganizerTab, string> = {
    upcoming: 'Évènements à venir',
    full: 'Évènements complets',
    archived: 'Évènements archivés',
    cancelled: 'Évènements annulés',
    calendar: 'Calendrier',
    favoriteComedians: 'Humoristes favoris',
    recurringEvents: 'Événements récurrents',
  };

  const superAdminTabTitles: Record<SuperAdminTab, string> = {
    full: 'Évènements complets',
    upcoming: 'Évènements à venir (non complets)',
    archived: 'Évènements archivés',
    cancelled: 'Évènements annulés',
  };

  const comedianEmptyStates: Record<ComedianTab, string> = {
    opportunities: 'Aucune opportunité disponible pour le moment.',
    accepted: 'Aucun évènement accepté à venir.',
    favorites: 'Aucun évènement en favori.',
    recommendations: 'Aucune recommandation basée sur votre historique. Postulez à des évènements pour recevoir des recommandations personnalisées !',
  };

  const isOpportunitiesTab = comedianTab === 'opportunities';
  const isFavoritesTab = comedianTab === 'favorites';
  const isRecommendationsTab = comedianTab === 'recommendations';

  const listIsLoading = isComedianView
    ? (isRecommendationsTab ? smartRecommendationsLoading : (isFavoritesTab ? eventsLoading : (isOpportunitiesTab ? eventsLoading : comedianApplicationsLoading)))
    : eventsLoading;

  const listHasError = isComedianView
    ? (isFavoritesTab ? eventsError : (isOpportunitiesTab ? eventsError : comedianApplicationsError))
    : eventsError;

  const listErrorMessage = isComedianView
    ? (isFavoritesTab ? eventsErrorMessage?.message : (isOpportunitiesTab ? eventsErrorMessage?.message : comedianApplicationsErrorMessage?.message))
    : eventsErrorMessage?.message;

  const showOrganizerUpcomingSection = !isComedianView && (
    (isOrganizerView && organizerTab === 'upcoming') ||
    (isSuperAdminView && superAdminTab === 'upcoming')
  );
  const showCompletedSection = !isComedianView && (
    (isOrganizerView && organizerTab === 'full') ||
    (isSuperAdminView && superAdminTab === 'full')
  );
  const showArchivedSection = !isComedianView && (
    (isOrganizerView && organizerTab === 'archived') ||
    (isSuperAdminView && superAdminTab === 'archived')
  );
  const showCancelledSection = !isComedianView && (
    (isOrganizerView && organizerTab === 'cancelled') ||
    (isSuperAdminView && superAdminTab === 'cancelled')
  );
  const showCalendarSection = isOrganizerView && organizerTab === 'calendar';
  const showFavoriteComediansSection = isOrganizerView && organizerTab === 'favoriteComedians';
  const showRecurringEventsSection = isOrganizerView && organizerTab === 'recurringEvents';

  const renderOrganizerActions = (event: IEvent, context: 'upcoming' | 'full' | 'archived', groupEvents?: IEvent[], actionKey?: string) => {
    if (user?.role !== 'ORGANIZER') {
      return null;
    }
    const menuId = actionKey ?? event._id;
    const isOpen = openActionsEventId === menuId;
    const menuItemStyle: CSSProperties = {
      display: 'block',
      width: '100%',
      padding: '10px 14px',
      border: 'none',
      background: 'transparent',
      color: '#fff',
      fontSize: '14px',
      textAlign: 'left',
      cursor: 'pointer',
      whiteSpace: 'nowrap',
      fontFamily: 'inherit',
      transition: 'background-color 0.15s ease',
    };

    return (
      <div
        style={{ ...cardActionStackStyle, position: 'relative' }}
        ref={isOpen ? actionsMenuRef : undefined}
      >
        <button
          type="button"
          onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
            e.stopPropagation();
            setOpenActionsEventId(isOpen ? null : menuId);
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '36px',
            height: '36px',
            padding: 0,
            borderRadius: '8px',
            border: '1px solid rgba(255, 255, 255, 0.25)',
            background: isOpen ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.25)',
            color: '#fff',
            cursor: 'pointer',
          }}
          title="Actions"
          aria-label="Actions"
        >
          <MoreVertical size={20} />
        </button>
        {isOpen && (
          <div
            style={{
              position: 'absolute',
              right: 0,
              bottom: '100%',
              marginBottom: '8px',
              minWidth: '200px',
              ...(isMobile ? { maxWidth: 'min(280px, calc(100vw - 24px))' } : {}),
              backgroundColor: '#2a2a3a',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: '8px',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
              zIndex: 1000,
              overflow: 'hidden',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {context === 'archived' ? (
              <>
                <button
                  type="button"
                  style={{ ...menuItemStyle, borderBottom: '1px solid rgba(255,255,255,0.08)' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenActionsEventId(null);
                    handleCardClick(event, true);
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                >
                  Gérer absences
                </button>
                <button
                  type="button"
                  style={{ ...menuItemStyle }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenActionsEventId(null);
                    setRatingsModalEvent(event);
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                >
                  Voir les notes
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  style={{ ...menuItemStyle, borderBottom: '1px solid rgba(255,255,255,0.08)' }}
                  onClick={(e) => {
                    e.stopPropagation();
                setOpenActionsEventId(null);
                  handleEditClick(event);
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                >
                  Modifier
                </button>
                <button
                  type="button"
                  style={{ ...menuItemStyle, borderBottom: '1px solid rgba(255,255,255,0.08)' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenActionsEventId(null);
                    handleDuplicateClick(event);
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                >
                  Dupliquer
                </button>
                <button
                  type="button"
                  style={{ ...menuItemStyle, borderBottom: '1px solid rgba(255,255,255,0.08)' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenActionsEventId(null);
                    handleNotifyHumorists(event);
                  }}
                  disabled={notifyingEventId === event._id}
                  onMouseEnter={(e) => { if (notifyingEventId !== event._id) e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                >
                  {notifyingEventId === event._id ? 'Envoi...' : 'Notifier les humoristes'}
                </button>
                <button
                  type="button"
                  style={{ ...menuItemStyle, borderBottom: '1px solid rgba(255,255,255,0.08)' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenActionsEventId(null);
                    setSpectatorsModalEvent(event);
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                >
                  Voir spectateurs
                </button>
                <button
                  type="button"
                  style={menuItemStyle}
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenActionsEventId(null);
                    if (groupEvents && groupEvents.length > 0) {
                      openCancelGroupModal(groupEvents);
                    } else {
                      openCancelModal(event);
                    }
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                >
                  Annuler
                </button>
              </>
            )}
          </div>
        )}
      </div>
    );
  };

  const totalUpcomingPages = Math.max(1, Math.ceil(eventsToDisplay.length / ITEMS_PER_PAGE));
  const paginatedUpcomingEvents = eventsToDisplay.slice(
    (upcomingPage - 1) * ITEMS_PER_PAGE,
    upcomingPage * ITEMS_PER_PAGE
  );

  useEffect(() => {
    setUpcomingPage(1);
  }, [eventsToDisplay]);

  useEffect(() => {
    if (upcomingPage > totalUpcomingPages) {
      setUpcomingPage(totalUpcomingPages);
    }
  }, [upcomingPage, totalUpcomingPages]);

  const totalCompletedPages = Math.max(1, Math.ceil(completedUpcomingEvents.length / ITEMS_PER_PAGE));
  const paginatedCompletedEvents = completedUpcomingEvents.slice(
    (completedPage - 1) * ITEMS_PER_PAGE,
    completedPage * ITEMS_PER_PAGE
  );

  useEffect(() => {
    setCompletedPage(1);
  }, [completedUpcomingEvents]);

  useEffect(() => {
    if (completedPage > totalCompletedPages) {
      setCompletedPage(totalCompletedPages);
    }
  }, [completedPage, totalCompletedPages]);

  const handleCardClick = (event: IEvent, shouldFocusParticipants = false) => {
    setSelectedEvent(event);
    setIsModalOpen(true);
    setFocusParticipantsSection(shouldFocusParticipants);
    // Charger les absences si l'utilisateur est organisateur
    if (user?.role === 'ORGANIZER') {
      loadEventAbsences(event._id);
    }
  };

  // Fonction de recherche d'humoristes par zone géographique
  const handleComedianSearch = useCallback(async () => {
    if (!comedianZoneSearch.trim()) {
      setComedianSearchResults([]);
      setComedianSearchTotal(0);
      setComedianSearchError(null);
      return;
    }

    setIsSearchingComedians(true);
    setComedianSearchError(null);

    try {
      const response = await searchComediansByZone({
        zone: comedianZoneSearch.trim(),
        experienceLevel: comedianExperienceFilter,
        page: comedianSearchPage,
        limit: 10
      });

      setComedianSearchResults(response.comedians);
      setComedianSearchTotal(response.total);
    } catch (error) {
      console.error('Erreur lors de la recherche d\'humoristes:', error);
      setComedianSearchError('Erreur lors de la recherche. Veuillez réessayer.');
      setComedianSearchResults([]);
      setComedianSearchTotal(0);
    } finally {
      setIsSearchingComedians(false);
    }
  }, [comedianZoneSearch, comedianExperienceFilter, comedianSearchPage]);

  // Effectuer la recherche quand les paramètres changent
  useEffect(() => {
    if (isOrganizerView && showComedianSearchSection && comedianZoneSearch.trim()) {
      const debounceTimer = setTimeout(() => {
        handleComedianSearch();
      }, 500);
      return () => clearTimeout(debounceTimer);
    }
  }, [isOrganizerView, showComedianSearchSection, comedianZoneSearch, comedianExperienceFilter, comedianSearchPage, comedianZoneType, handleComedianSearch]);

  // Réinitialiser la page lors d'un changement de recherche
  useEffect(() => {
    setComedianSearchPage(1);
  }, [comedianZoneSearch, comedianExperienceFilter, comedianZoneType]);

  const handleEditClick = (event: IEvent) => {
    console.log('🔍 [MyEventsPage] handleEditClick - Vérification évènement', {
      eventId: event._id,
      eventTitle: event.title,
      eventOrganizer: event.organizer,
      organizerId: typeof event.organizer === 'object' ? event.organizer._id : event.organizer,
      userId: user?._id,
      isOwner: typeof event.organizer === 'object' 
        ? event.organizer._id === user?._id 
        : event.organizer === user?._id,
    });
    
    if (!event._id) {
      console.error('❌ [MyEventsPage] Évènement sans ID - impossible de modifier', { event });
      showError(ErrorMessages.EVENT_MISSING_ID);
      return;
    }
    
    setEventToEdit(event);
    setShowEditEventForm(true);
  };

  const handleApplyClick = (event: IEvent) => {
    setSelectedEvent(event);
    setShowApplyEventForm(true);
  };

  const openWithdrawModal = (event: IEvent) => {
    setEventToWithdraw(event);
    setShowWithdrawModal(true);
  };

  const closeWithdrawModal = () => {
    setShowWithdrawModal(false);
    setEventToWithdraw(null);
  };

  const confirmWithdrawApplication = async () => {
    if (!user?._id || !eventToWithdraw) return;
    try {
      console.log('🔄 Début de la désinscription depuis MyEventsPage pour event:', eventToWithdraw._id);
      const app = comedianApplications?.find(a => a.event && a.event._id === eventToWithdraw._id);
      if (!app) {
        console.log('❌ Application non trouvée pour cet événement');
        return;
      }
      await api.delete(`/applications/${app._id}`);
      console.log('✅ API call réussi, affichage de l\'alerte de succès');
      showSuccess(SuccessMessages.APPLICATION_UNSUBSCRIBED);
      refetch();
      refreshUser();
      queryClient.invalidateQueries({ queryKey: ['comedianApplications'] });
      closeWithdrawModal();
    } catch (error: any) {
      console.error('❌ Erreur lors de la désinscription:', error.response?.status);
      console.log('📢 Affichage de l\'alerte d\'erreur');
      showError(getErrorMessage(error, ErrorMessages.APPLICATION_DELETE_FAILED));
    }
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedEvent(null);
    setFocusParticipantsSection(false);
  };

  const handleComedianClick = (comedian: any) => {
    // Recherche l'objet complet dans la liste des participants de l'évènement sélectionné
    const fullComedian = selectedEvent?.participants?.find((p: any) => p._id === comedian._id) || comedian;
    setSelectedComedian(fullComedian);
    setIsComedianModalOpen(true);
  };

  const closeComedianModal = () => {
    setIsComedianModalOpen(false);
    setSelectedComedian(null);
  };

  const handleEventUpdated = () => {
    setShowEditEventForm(false);
    setEventToEdit(null);
    refetch();
    refreshUser();
  };

  const handleEventCreated = () => {
    setShowCreateEventForm(false);
    setEventToDuplicate(null);
    refetch();
    refreshUser();
  };

  const handleApplicationSubmitted = () => {
    setShowApplyEventForm(false);
    refetch(); // Refetch events to update counts/status if needed
    refreshUser();
    queryClient.invalidateQueries({ queryKey: ['comedianApplications'] }); // Force refresh des candidatures humoriste
  };

  const applyKeywordSearch = () => {
    const params = new URLSearchParams(location.search);
    const trimmed = searchTerm.trim();
    if (trimmed) {
      params.set('search', trimmed);
    } else {
      params.delete('search');
    }
    navigate(`${location.pathname}?${params.toString()}`, { replace: true });
  };

  

  const openCancelModal = async (event: IEvent) => {
    try {
      const now = new Date();
      const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const eventDate = new Date(event.date);
      const eventMidnight = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate());
      const diffDays = Math.ceil((eventMidnight.getTime() - todayMidnight.getTime()) / (1000 * 60 * 60 * 24));

      if (diffDays >= 10) {
        setConfirmDialog({
          isOpen: true,
          title: 'Supprimer l\'évènement',
          message: 'Confirmer la suppression de cet évènement (plus de 10 jours avant) ?',
          isDangerous: true,
          onConfirm: async () => {
            try {
              await api.delete(`/events/${event._id}`);
              showSuccess(SuccessMessages.EVENT_DELETED);
              refetch();
              refreshUser();
              setConfirmDialog({ ...confirmDialog, isOpen: false });
            } catch (error) {
              showError(getErrorMessage(error, ErrorMessages.EVENT_DELETE_FAILED));
            }
          },
        });
        return;
      }

      setEventToCancel(event);
      setEventsGroupToCancel(null);
      setCancelReason('');
      setShowCancelModal(true);
    } catch (error: any) {
      console.error('Erreur lors de la suppression de l\'évènement:', error.response?.status);
      showError(getErrorMessage(error, ErrorMessages.EVENT_DELETE_FAILED));
    }
  };

  const openCancelGroupModal = (events: IEvent[]) => {
    setEventsGroupToCancel(events);
    setEventToCancel(null);
    setCancelReason('');
    setShowCancelModal(true);
  };

  const confirmCancelEvent = async () => {
    const isGroup = eventsGroupToCancel && eventsGroupToCancel.length > 0;
    const eventsToProcess = isGroup ? eventsGroupToCancel : (eventToCancel ? [eventToCancel] : []);
    if (eventsToProcess.length === 0) return;

    const now = new Date();
    const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const needReason = eventsToProcess.some((ev) => {
      const eventDate = new Date(ev.date);
      const eventMidnight = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate());
      const diffDays = Math.ceil((eventMidnight.getTime() - todayMidnight.getTime()) / (1000 * 60 * 60 * 24));
      return diffDays < 10;
    });

    if (needReason && !cancelReason.trim()) {
      showWarning(isGroup
        ? 'Veuillez fournir une raison d\'annulation (au moins un évènement du groupe est dans moins de 10 jours).'
        : 'Veuillez fournir une raison d\'annulation (évènement dans moins de 10 jours).');
      return;
    }

    try {
      let cancelledCount = 0;
      let skippedCount = 0;
      for (const ev of eventsToProcess) {
        const eventDate = new Date(ev.date);
        const eventMidnight = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate());
        const diffDays = Math.ceil((eventMidnight.getTime() - todayMidnight.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays < 10) {
          await api.put(`/events/${ev._id}`, { status: 'cancelled', cancellationReason: cancelReason });
          cancelledCount += 1;
        } else {
          skippedCount += 1;
        }
      }
      if (cancelledCount > 0) {
        showSuccess(isGroup
          ? `Groupe annulé : ${cancelledCount} évènement(s) déplacé(s) vers "Évènements annulés".${skippedCount > 0 ? ` ${skippedCount} évènement(s) non annulé(s) (date à plus de 10 jours).` : ''}`
          : 'Évènement annulé et déplacé vers "Évènements annulés".');
        refetch();
        refreshUser();
      } else if (skippedCount > 0) {
        showInfo(InfoMessages.EVENT_NOT_CANCELLED_OLD);
      }
    } catch (err: any) {
      console.error("Erreur lors de l'annulation:", err.response?.data || err.message);
      showError(err.response?.data?.message || err.message);
    } finally {
      setShowCancelModal(false);
      setEventToCancel(null);
      setEventsGroupToCancel(null);
      setCancelReason('');
    }
  };

  const handleDuplicateClick = (event: IEvent) => {
    setEventToDuplicate(event);
    setShowCreateEventForm(true);
  };

  const handleNotifyHumorists = async (event: IEvent) => {
    if (!user?._id) {
      showWarning(WarningMessages.AUTH_REQUIRED_SEND_NOTIFICATIONS);
      return;
    }

    setConfirmDialog({
      isOpen: true,
      title: 'Envoyer des notifications',
      message: `Voulez-vous envoyer une notification par email à tous les humoristes pour l'évènement "${event.title}" ?`,
      onConfirm: async () => {
        setNotifyingEventId(event._id);
        try {
          await api.post(`/events/${event._id}/notify`, {});
          showSuccess(SuccessMessages.NOTIFICATIONS_SENT);
          setConfirmDialog({ ...confirmDialog, isOpen: false });
        } catch (error: any) {
          console.error('Erreur lors de l\'envoi des notifications:', error.response?.status);
          showError(getErrorMessage(error, ErrorMessages.PROFILE_UPDATE_FAILED));
        } finally {
          setNotifyingEventId(null);
        }
      },
    });
  };

  // Handlers pour l'invitation d'humoriste
  const openInviteModal = (comedian: ComedianSearchResult) => {
    setComedianToInvite(comedian);
    setSelectedEventForInvite('');
    setShowInviteModal(true);
  };

  const handleInviteComedian = async () => {
    if (!comedianToInvite || !selectedEventForInvite || !user?._id) {
      showWarning(WarningMessages.SELECT_EVENT_REQUIRED);
      return;
    }

    setIsInviting(true);
    try {
      await inviteComedianToEvent(selectedEventForInvite, comedianToInvite._id);
      showSuccess(SuccessMessages.INVITATION_SENT);
      setShowInviteModal(false);
      setComedianToInvite(null);
      setSelectedEventForInvite('');
    } catch (error: any) {
      console.error('Erreur lors de l\'envoi de l\'invitation:', error);
      showError(getErrorMessage(error, ErrorMessages.INVITATION_FAILED));
    } finally {
      setIsInviting(false);
    }
  };

  // Handlers pour les absences
  const handleAbsenceClick = (participant: any, event: IEvent) => {
    setSelectedAbsenceParticipant({ 
      ...participant, 
      eventId: event._id,
      eventTitle: event.title 
    });
    // Charger les absences de cet évènement
    loadEventAbsences(event._id);
    setIsAbsenceModalOpen(true);
  };

  const loadEventAbsences = async (eventId: string) => {
    try {
      const absences = await getEventAbsences(eventId);
      setEventAbsences(absences);
    } catch (error) {
      console.error('Erreur lors du chargement des absences:', error);
      setEventAbsences([]);
    }
  };

  const handleMarkAbsent = async (reason: string) => {
    if (!selectedAbsenceParticipant) return;

    try {
      await markAbsence(
        selectedAbsenceParticipant.eventId,
        selectedAbsenceParticipant._id,
        reason
      );

      // Mise à jour locale du compteur d'absences
      setSelectedEvent(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          participants: prev.participants.map(p =>
            p._id === selectedAbsenceParticipant._id
              ? {
                  ...p,
                  stats: {
                    ...p.stats,
                    absences: (p.stats?.absences || 0) + 1
                  }
                }
              : p
          )
        };
      });

      showSuccess(SuccessMessages.ABSENCE_MARKED);
      // Fermer les deux modals (absence + event)
      closeAbsenceModal();
      closeModal();
    } catch (error: any) {
      console.error('Erreur lors du marquage d\'absence:', error.response?.status);
      showError(getErrorMessage(error, ErrorMessages.ABSENCE_MARK_FAILED));
      throw error; // Re-throw pour que AbsenceModal sache que l'opération a échoué
    }
  };

  const handleCancelAbsence = async () => {
    if (!selectedAbsenceParticipant) return;

    try {
      await cancelAbsence(
        selectedAbsenceParticipant.eventId,
        selectedAbsenceParticipant._id
      );

      // Mise à jour locale du compteur d'absences
      setSelectedEvent(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          participants: prev.participants.map(p =>
            p._id === selectedAbsenceParticipant._id
              ? {
                  ...p,
                  stats: {
                    ...p.stats,
                    absences: Math.max((p.stats?.absences || 1) - 1, 0)
                  }
                }
              : p
          )
        };
      });

      showSuccess(SuccessMessages.ABSENCE_CANCELLED);
      // Fermer les deux modals (absence + event)
      closeAbsenceModal();
      closeModal();
    } catch (error: any) {
      console.error('Erreur lors de l\'annulation d\'absence:', error.response?.status);
      showError(getErrorMessage(error, ErrorMessages.ABSENCE_CANCEL_FAILED));
      throw error; // Re-throw pour que AbsenceModal sache que l'opération a échoué
    }
  };

  const closeAbsenceModal = () => {
    setIsAbsenceModalOpen(false);
    setSelectedAbsenceParticipant(null);
    setEventAbsences([]);
  };

  const isParticipantAbsent = (participantId: string): boolean => {
    return eventAbsences.some(absence => absence.comedian._id === participantId);
  };

  const mainContainerStyle: CSSProperties = {
    minHeight: '100vh',
    color: '#ffffff',
    padding: '20px',
    background: 'linear-gradient(to bottom right, #1a1a2e, #331f41)',
  };

  const pageHeaderStyle: CSSProperties = {
    padding: '20px',
    maxWidth: '1200px',
    margin: '0 auto',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '30px',
  };

  const titleStyle: CSSProperties = {
    fontSize: '2.5em',
    color: '#ff416c',
  };

  const buttonStyle: CSSProperties = {
    padding: '10px 20px',
    borderRadius: '8px',
    border: 'none',
    background: 'linear-gradient(to right, #ff416c, #ff4b2b)',
    color: 'white',
    fontSize: '1em',
    fontWeight: 'bold',
    cursor: 'pointer',
    transition: 'background 0.3s ease',
  };

  const sectionStyle: CSSProperties = {
    maxWidth: '1200px',
    margin: '0 auto 40px auto',
    padding: '20px',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: '8px',
    boxShadow: '0 4px 8px rgba(0, 0, 0, 0.3)',
  };

  const sectionTitleStyle: CSSProperties = {
    fontSize: '1.8em',
    color: '#ff4b2b',
    marginBottom: '15px',
  };

  const emptyStateStyle: CSSProperties = {
    color: '#aaa',
    fontSize: '1.1em',
  };

  const comedianTabs: ComedianTab[] = ['opportunities', 'accepted', 'favorites', 'recommendations'];
  const organizerTabs: OrganizerTab[] = ['upcoming', 'full', 'archived', 'cancelled', 'calendar', 'favoriteComedians', 'recurringEvents'];
  const eventsSubTabs: EventsSubTab[] = ['upcoming', 'full', 'archived', 'cancelled', 'recurringEvents'];
  const superAdminTabs: SuperAdminTab[] = ['full', 'upcoming', 'archived', 'cancelled'];

  const comedianTabsContainerStyle: CSSProperties = {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '12px',
    marginBottom: '20px',
  };

  const comedianTabButtonStyle = (isActive: boolean): CSSProperties => ({
    flex: isMobile ? '1 1 45%' : '0 0 auto',
    minWidth: '140px',
    padding: '10px 14px',
    borderRadius: '10px',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    backgroundColor: isActive ? 'rgba(255, 75, 43, 0.25)' : 'rgba(0, 0, 0, 0.35)',
    color: isActive ? '#ffffff' : '#ddd',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    boxShadow: isActive ? '0 4px 12px rgba(255, 75, 43, 0.25)' : 'none',
  });

  const comedianTabTitleStyle: CSSProperties = {
    fontSize: '0.95em',
    fontWeight: 600,
  };

  const comedianTabCountStyle: CSSProperties = {
    fontSize: '0.85em',
    color: '#ffb3c1',
  };

  const organizerTabsContainerStyle: CSSProperties = {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '12px',
    marginBottom: '20px',
    justifyContent: isMobile ? 'center' : 'flex-start',
  };

  const organizerTabButtonStyle = (isActive: boolean): CSSProperties => ({
    padding: '10px 18px',
    borderRadius: '999px',
    border: isActive ? '1px solid #ff4b2b' : '1px solid rgba(255, 255, 255, 0.25)',
    backgroundColor: isActive ? 'rgba(255, 75, 43, 0.25)' : 'rgba(0, 0, 0, 0.25)',
    color: isActive ? '#ffffff' : '#ddd',
    fontWeight: isActive ? 700 : 500,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  });

  const organizerTabCountStyle: CSSProperties = {
    fontSize: '0.85em',
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    padding: '2px 8px',
    borderRadius: '999px',
  };

  const dropdownContainerStyle: CSSProperties = {
    position: 'relative',
    display: 'inline-block',
  };

  const dropdownSelectStyle = (isActive: boolean): CSSProperties => ({
    padding: '10px 18px',
    paddingRight: '40px',
    borderRadius: '999px',
    border: isActive ? '1px solid #ff4b2b' : '1px solid rgba(255, 255, 255, 0.25)',
    backgroundColor: isActive ? 'rgba(255, 75, 43, 0.25)' : 'rgba(0, 0, 0, 0.25)',
    color: isActive ? '#ffffff' : '#ddd',
    fontWeight: isActive ? 700 : 500,
    cursor: 'pointer',
    fontSize: '1em',
    fontFamily: 'inherit',
    appearance: 'none',
    backgroundImage: `url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none'%3e%3cpath d='M6 9l6 6 6-6' stroke='%23${isActive ? 'ffffff' : 'dddddd'}' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'/%3e%3c/svg%3e")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 14px center',
    backgroundSize: '14px',
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    minWidth: isMobile ? '100%' : '220px',
    boxShadow: isActive
      ? '0 4px 12px rgba(255, 75, 43, 0.25), 0 0 0 1px rgba(255, 75, 43, 0.1) inset'
      : '0 2px 4px rgba(0, 0, 0, 0.1)',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    WebkitFontSmoothing: 'antialiased',
    MozOsxFontSmoothing: 'grayscale',
  } as CSSProperties);

  const eventCardStyle: CSSProperties = {
    backgroundColor: '#ffffff',
    borderRadius: '20px',
    padding: isMobile ? '16px' : '20px',
    boxShadow: '0 10px 40px rgba(0, 0, 0, 0.12)',
    border: '1px solid rgba(0, 0, 0, 0.08)',
    marginBottom: '15px',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: isMobile ? 'column' : 'row',
    gap: isMobile ? '16px' : '24px',
    alignItems: isMobile ? 'flex-start' : 'stretch',
    transition: 'transform 0.2s ease, box-shadow 0.2s ease',
  };

  /** Style carte lorsque l'événement est en statut Complet (fond vert comme la capture) */
  const eventCardStyleComplete: CSSProperties = {
    backgroundColor: '#E1FFE6',
    border: '1px solid #c8f0d0',
  };

  /** Fond rouge clair pour les évènements annulés (comme candidatures refusées) */
  const eventCardStyleCancelled: CSSProperties = {
    backgroundColor: '#FFEBEE',
    border: '1px solid #ffcdd2',
  };

  const cardContentStyle: CSSProperties = {
    flex: '1 1 auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  };

  const cardHeaderRowStyle: CSSProperties = {
    display: 'flex',
    flexDirection: isMobile ? 'column' : 'row',
    alignItems: isMobile ? 'flex-start' : 'center',
    justifyContent: 'space-between',
    gap: isMobile ? '8px' : '16px',
  };

  const cardDateBadgeStyle: CSSProperties = {
    padding: '6px 16px',
    borderRadius: '999px',
    border: '1px solid rgba(0, 0, 0, 0.12)',
    backgroundColor: 'rgba(0, 0, 0, 0.04)',
    fontSize: '0.85em',
    fontWeight: 600,
    color: '#1a1a1a',
  };

  const cardHeaderActionsStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    flexShrink: 0,
  };

  const favoriteStarButtonStyle = (isFavorite: boolean): CSSProperties => ({
    border: 'none',
    background: 'transparent',
    color: isFavorite ? '#ffd700' : '#888888',
    fontSize: '1.4em',
    cursor: 'pointer',
    transition: 'color 0.2s ease, transform 0.2s ease',
    padding: 0,
    lineHeight: 1,
  });

  const cardMetaGridStyle: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, minmax(0, 1fr))',
    gap: '12px 18px',
  };

  const cardMetaItemStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  };

  const cardMetaLabelStyle: CSSProperties = {
    fontSize: '0.72em',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  };

  const cardMetaValueStyle: CSSProperties = {
    fontSize: '0.95em',
    color: '#1a1a1a',
    fontWeight: 600,
  };

  const cardStatusBlockStyle: CSSProperties = {
    display: 'flex',
    flexDirection: isMobile ? 'row' : 'column',
    flexWrap: isMobile ? 'wrap' : 'nowrap',
    alignItems: isMobile ? 'center' : 'flex-end',
    justifyContent: isMobile ? 'space-between' : 'space-between',
    gap: '10px',
    minWidth: isMobile ? 'auto' : '240px',
  };

  const cardActionStackStyle: CSSProperties = {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
    justifyContent: isMobile ? 'flex-end' : 'flex-end',
  };

  const statusBadgeStyle: CSSProperties = {
    padding: '6px 14px',
    borderRadius: '999px',
    border: '1px solid rgba(0, 0, 0, 0.1)',
    fontSize: '0.85em',
    fontWeight: 600,
    color: '#1a1a1a',
    backgroundColor: 'rgba(0, 0, 0, 0.04)',
  };

  const renderStatusChip = (label: string, color: string, backgroundColor: string) => (
    <span style={{ ...statusBadgeStyle, color, backgroundColor }}>{label}</span>
  );

  const eventTitleStyle: CSSProperties = {
    fontSize: isMobile ? '1.2em' : '1.45em',
    color: '#1a1a1a',
    margin: 0,
  };

  const eventDetailStyle: CSSProperties = {
    fontSize: '0.9em',
    color: '#64748B',
    marginBottom: '3px',
  };

  const modalDetailStyle: CSSProperties = {
    marginBottom: '10px',
  };

  const modalLabelStyle: CSSProperties = {
    fontWeight: 'bold',
    color: '#ff4b2b',
    marginRight: '5px',
  };

  const modalValueStyle: CSSProperties = {
    color: '#ffffff',
  };

  // const modalParticipantListStyle: CSSProperties = {
  //   listStyleType: 'none',
  //   padding: 0,
  //   margin: '5px 0 0 0',
  // };

  // const modalParticipantItemStyle: CSSProperties = {
  //   color: '#ffffff',
  //   marginBottom: '3px',
  // };

  const actionButtonStyleSmall: CSSProperties = {
    padding: '8px 15px',
    borderRadius: '5px',
    border: 'none',
    color: 'white',
    fontWeight: 'bold',
    cursor: 'pointer',
    transition: 'background-color 0.3s ease',
  };

  const deleteButtonStyle: CSSProperties = {
    ...actionButtonStyleSmall,
    backgroundColor: '#dc3545',
  };

  const editButtonStyle: CSSProperties = {
    ...actionButtonStyleSmall,
    backgroundColor: '#ffc107',
  };

  const applyButtonStyle: CSSProperties = {
    ...actionButtonStyleSmall,
    background: 'linear-gradient(to right, #28a745, #218838)',
  };

  const disabledApplyButtonStyle: CSSProperties = {
    ...actionButtonStyleSmall,
    backgroundColor: '#6c757d',
    cursor: 'not-allowed',
  };

  const paginationControlsStyle: CSSProperties = {
    marginTop: '18px',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: '12px',
    flexWrap: 'wrap',
  };

  const paginationButtonStyle: CSSProperties = {
    ...actionButtonStyleSmall,
    backgroundColor: '#2d2d44',
    padding: '8px 14px',
    minWidth: '90px',
  };

  const paginationInfoStyle: CSSProperties = {
    color: '#aaa',
    fontWeight: 'bold',
    fontSize: '0.95em',
  };

  const organizerMobileButtonAdjustments: CSSProperties = isMobile
    ? {
        padding: '6px 10px',
        fontSize: '0.85em',
        minWidth: 'auto',
      }
    : {};

  const translateEventStatus = (status: IEvent['status']) => {
    switch (status) {
      case 'DRAFT':
      case 'draft':
        return 'Brouillon';
      case 'PUBLISHED':
      case 'published':
        return 'Publié';
      case 'CANCELLED':
      case 'cancelled':
        return 'Annulé';
      case 'COMPLETED':
      case 'completed':
        return 'Terminé';
      default:
        return status;
    }
  };

  // Ajout du style du spinner
  const spinnerStyle: React.CSSProperties = {
    border: '8px solid #f3f3f3',
    borderTop: '8px solid #ff416c',
    borderRadius: '50%',
    width: '70px',
    height: '70px',
    animation: 'spin 1s linear infinite',
    margin: 'auto',
  };

  // Ajout de l'animation CSS dans le composant
  const spinnerKeyframes = `
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }`;

  return (
    <div style={mainContainerStyle}>
      <style>{spinnerKeyframes}</style>
      <Navbar />
      {authIsLoading || eventsLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
          <div style={spinnerStyle}></div>
          <p style={{ color: '#aaa', marginTop: 20, fontSize: '1.2em' }}>
            {authIsLoading ? 'Chargement de votre profil...' : 'Chargement des évènements...'}
          </p>
        </div>
      ) : eventsError ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', padding: '20px' }}>
          <p style={{ color: '#dc3545', fontSize: '1.2em', marginBottom: '20px' }}>
            Erreur lors du chargement des évènements
          </p>
          <p style={{ color: '#aaa', fontSize: '1em', marginBottom: '20px', textAlign: 'center' }}>
            {eventsErrorMessage?.message || 'Une erreur inattendue s\'est produite'}
          </p>
          <button
            onClick={() => refetch()}
            style={{
              padding: '12px 24px',
              borderRadius: '8px',
              border: 'none',
              background: 'linear-gradient(135deg, #ff416c 0%, #ff4b2b 100%)',
              color: '#fff',
              fontSize: '1em',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
          >
            Réessayer
          </button>
        </div>
      ) : (
        <>
          <div style={{
              ...pageHeaderStyle,
              display: 'flex',
              flexDirection: isMobile ? 'column' : 'row',
              alignItems: isMobile ? 'center' : 'center',
              gap: isMobile ? 12 : 0
            }}>
            <div style={{ textAlign: isMobile ? 'center' : 'left' }}>
              <h1 style={titleStyle}>Les évènements</h1>
              <p style={{ fontSize: '1.1em', color: '#aaa' }}>
                {user?.role === 'ORGANIZER' 
                  ? 'Gérez et visualisez vos évènements. Créez de nouveaux évènements pour trouver les meilleurs humoristes.'
                  : user?.role === 'SUPER_ADMIN'
                  ? 'Supervisez tous les évènements de la plateforme. Utilisez les filtres pour affiner votre recherche.'
                  : 'Découvrez les évènements à venir et postulez pour votre prochaine performance.'}
              </p>
            </div>
            {user?.role === 'ORGANIZER' && (
              isMobile ? (
                <div style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
                  <button onClick={() => setShowCreateEventForm(true)} style={buttonStyle}>
                    Créer un évènement
                  </button>
                </div>
              ) : (
                <button onClick={() => setShowCreateEventForm(true)} style={buttonStyle}>
                  Créer un évènement
                </button>
              )
            )}
          </div>

          {/* Filtres pour super admin */}
          {user?.role === 'SUPER_ADMIN' && (
            <div style={{ maxWidth: '1200px', margin: '0 auto 20px auto', padding: '0 20px' }}>
              <div style={{
                backgroundColor: 'rgba(0, 0, 0, 0.4)',
                padding: '20px',
                borderRadius: '8px',
                margin: '0 auto',
                border: '1px solid #444',
                width: '100%'
              }}>
              <h3 style={{ color: '#ff4b2b', marginBottom: '15px', fontSize: '1.2em' }}>Filtres de recherche</h3>
              <div style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, minmax(0, 320px))',
                gap: '15px',
                  justifyContent: isMobile ? 'stretch' : 'center'
              }}>
                <div style={{ maxWidth: isMobile ? '100%' : 320 }}>
                <label style={{ display: 'block', color: '#ffffff', marginBottom: '5px', fontWeight: 'bold' }}>
                  Filtrer par organisateur:
                </label>
                <select
                  value={new URLSearchParams(location.search).get('organizer') || ''}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                    const params = new URLSearchParams(location.search);
                    if (e.target.value) {
                      params.set('organizer', e.target.value);
                    } else {
                      params.delete('organizer');
                    }
                    navigate(`${location.pathname}?${params.toString()}`, { replace: true });
                  }}
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '5px',
                    border: '1px solid #555',
                    backgroundColor: 'rgba(0, 0, 0, 0.6)',
                    color: '#ffffff',
                    fontSize: '14px'
                  }}
                >
                  <option value="" style={{ backgroundColor: '#1a1a2e', color: '#ffffff' }}>
                    Tous les organisateurs
                  </option>
                  {availableOrganizers.map((organizer) => (
                    <option 
                      key={organizer.id} 
                      value={organizer.fullName}
                      style={{ backgroundColor: '#1a1a2e', color: '#ffffff' }}
                    >
                      {organizer.fullName}
                    </option>
                  ))}
                </select>
              </div>
                <div style={{ maxWidth: isMobile ? '100%' : 320 }}>
                  <label style={{ display: 'block', color: '#ffffff', marginBottom: '5px', fontWeight: 'bold' }}>
                    Recherche par mots-clés:
                  </label>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      applyKeywordSearch();
                    }}
                    style={{
                      display: 'flex',
                      flexDirection: isMobile ? 'column' : 'row',
                      gap: '10px',
                      alignItems: isMobile ? 'stretch' : 'center'
                    }}
                  >
                    <input
                      type="text"
                      placeholder="Titre, organisateur, ville..."
                      value={searchTerm}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchTerm(e.target.value)}
                      style={{
                        flex: isMobile ? undefined : 1,
                        width: isMobile ? '100%' : undefined,
                        padding: '10px',
                        borderRadius: '5px',
                        border: '1px solid #555',
                        backgroundColor: 'rgba(0, 0, 0, 0.6)',
                        color: '#ffffff',
                        fontSize: '14px'
                      }}
                    />
                    <button
                      type="submit"
                      style={{
                        padding: '10px 18px',
                        borderRadius: '6px',
                        border: 'none',
                        background: '#ff4b2b',
                        color: '#fff',
                        fontWeight: 600,
                        cursor: 'pointer',
                        width: isMobile ? '100%' : 'auto'
                      }}
                    >
                      Rechercher
                    </button>
                  </form>
                </div>
              </div>
              <div style={{
                marginTop: '15px',
                display: 'flex',
                flexDirection: isMobile ? 'column' : 'row',
                gap: '10px',
                alignItems: 'center'
              }}>
                <button
                  onClick={() => {
                    const params = new URLSearchParams(location.search);
                    params.delete('organizer');
                    params.delete('search');
                    navigate(`${location.pathname}?${params.toString()}`, { replace: true });
                    setSearchTerm('');
                  }}
                  style={{
                    padding: '8px 15px',
                    borderRadius: '5px',
                    border: '1px solid #555',
                    backgroundColor: 'rgba(255, 255, 255, 0.1)',
                    color: '#ffffff',
                    cursor: 'pointer',
                    fontSize: '14px',
                    width: isMobile ? '100%' : 'auto',
                    maxWidth: isMobile ? '100%' : 220
                  }}
                >
                  Réinitialiser les filtres
                </button>
              </div>
            </div>
            </div>
          )}
        </>
      )}

      {isComedianView ? (
        <div style={sectionStyle}>
          <div style={comedianTabsContainerStyle}>
            {comedianTabs.map((tabId) => (
              <button
                key={tabId}
                style={comedianTabButtonStyle(comedianTab === tabId)}
                onClick={() => setComedianTab(tabId)}
              >
                <span style={comedianTabTitleStyle}>{comedianTabTitles[tabId]}</span>
                <span style={comedianTabCountStyle}>{comedianTabCounts[tabId]} évènement(s)</span>
              </button>
            ))}
          </div>
          <div
            style={{
              display: 'flex',
              flexDirection: isMobile ? 'column' : 'row',
              alignItems: isMobile ? 'flex-start' : 'center',
              gap: isMobile ? '10px' : '16px',
              marginBottom: '18px'
            }}
          >
            <h2 style={sectionTitleStyle}>{comedianTabTitles[comedianTab]}</h2>
            {isOpportunitiesTab && (
              <select
                value={completionFilter}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setCompletionFilter(e.target.value as 'all' | 'complete' | 'incomplete')}
                style={{
                  marginLeft: isMobile ? 0 : 'auto',
                  padding: '8px',
                  borderRadius: '6px',
                  border: '1px solid #444',
                  background: '#222',
                  color: '#fff',
                  minWidth: 160,
                  width: isMobile ? '100%' : undefined
                }}
              >
                <option value="all">Tous</option>
                <option value="complete">Complet</option>
                <option value="incomplete">Non complet</option>
              </select>
            )}
          </div>
          
          {/* Barre de recherche par lieu et filtre par niveau d'expérience pour les humoristes */}
          <div
            style={{
              marginBottom: '20px',
              padding: '15px',
              backgroundColor: 'rgba(0, 0, 0, 0.3)',
              borderRadius: '8px',
              border: '1px solid #444'
            }}
          >
            <div
              style={{
                display: 'flex',
                flexDirection: isMobile ? 'column' : 'row',
                gap: '15px',
                alignItems: isMobile ? 'stretch' : 'flex-end'
              }}
            >
              {/* Recherche par lieu */}
              <div style={{ flex: isMobile ? undefined : 1, width: isMobile ? '100%' : undefined }}>
                <label
                  style={{
                    display: 'block',
                    color: '#ffffff',
                    marginBottom: '8px',
                    fontWeight: 'bold',
                    fontSize: '14px'
                  }}
                >
                  Recherche par lieu
                </label>
                <input
                  type="text"
                  placeholder="Ville, adresse, lieu..."
                  value={locationSearch}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLocationSearch(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '6px',
                    border: '1px solid #555',
                    backgroundColor: 'rgba(0, 0, 0, 0.6)',
                    color: '#ffffff',
                    fontSize: '14px'
                  }}
                />
              </div>
              
              {/* Filtre par niveau d'expérience */}
              <div style={{ width: isMobile ? '100%' : '200px' }}>
                <label
                  style={{
                    display: 'block',
                    color: '#ffffff',
                    marginBottom: '8px',
                    fontWeight: 'bold',
                    fontSize: '14px'
                  }}
                >
                  Niveau d'expérience
                </label>
                <select
                  value={experienceFilter}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setExperienceFilter(e.target.value as 'all' | '0-50' | '50-200' | '200+')}
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '6px',
                    border: '1px solid #555',
                    backgroundColor: 'rgba(0, 0, 0, 0.6)',
                    color: '#ffffff',
                    fontSize: '14px'
                  }}
                >
                  <option value="all">Tous les niveaux</option>
                  <option value="0-50">Débutant (0-50 scènes)</option>
                  <option value="50-200">Expérimenté (50-200 scènes)</option>
                  <option value="200+">Pro (200+ scènes)</option>
                </select>
              </div>
              
              {/* Bouton réinitialiser */}
              {(locationSearch.trim() || experienceFilter !== 'all') && (
                <button
                  onClick={() => {
                    setLocationSearch('');
                    setExperienceFilter('all');
                  }}
                  style={{
                    padding: '10px 18px',
                    borderRadius: '6px',
                    border: '1px solid #555',
                    backgroundColor: 'rgba(255, 255, 255, 0.1)',
                    color: '#ffffff',
                    cursor: 'pointer',
                    fontSize: '14px',
                    whiteSpace: 'nowrap',
                    height: 'fit-content'
                  }}
                >
                  Réinitialiser
                </button>
              )}
            </div>
          </div>

          {/* Liste des événements */}
          {listIsLoading && <p style={emptyStateStyle}>Chargement des évènements...</p>}
          {listHasError && <p style={{ ...emptyStateStyle, color: '#dc3545' }}>Erreur: {listErrorMessage}</p>}
          {eventsToDisplay.length === 0 && !listIsLoading && !listHasError && (
            <p style={emptyStateStyle}>{comedianEmptyStates[comedianTab]}</p>
          )}
          {paginatedUpcomingEvents.map((event) => {
            const isCompleteEvent = isEventComplete(event);
            const participantsRatio = getParticipantsRatio(event);
            const statusLabel = translateEventStatus(event.status);
            // Récupérer les données de recommandation (score, breakdown, matchReasons)
            const recommendationData = eventRecommendationMap.get(String(event._id));
            const matchScore = recommendationData?.score ?? 0;
            const breakdown = recommendationData?.breakdown;
            const matchReasons = recommendationData?.matchReasons;

            let comedianApplicationChip: React.ReactNode = null;
            let relatedApplication: IApplication | undefined;
            if (comedianApplicationsMap.size > 0) {
              relatedApplication = comedianApplicationsMap.get(event._id);
              if (relatedApplication) {
                let color = '#ffc107';
                let bg = 'rgba(255, 193, 7, 0.18)';
                let label = 'Candidature: En attente';
                if (relatedApplication.status === 'ACCEPTED') {
                  color = '#28a745';
                  bg = 'rgba(40, 167, 69, 0.18)';
                  label = 'Candidature: Acceptée';
                } else if (relatedApplication.status === 'REJECTED') {
                  color = '#dc3545';
                  bg = 'rgba(220, 53, 69, 0.2)';
                  label = 'Candidature: Refusée';
                } else if (relatedApplication.status === 'WITHDRAWN') {
                  color = '#888';
                  bg = 'rgba(136, 136, 136, 0.15)';
                  label = 'Candidature: Retirée';
                }
                comedianApplicationChip = renderStatusChip(label, color, bg);
              }
            }

            const isWithdrawn = relatedApplication?.status === 'WITHDRAWN';

            return (
              <div
                key={event._id}
                style={{
                  ...eventCardStyle,
                  ...(isCompleteEvent ? eventCardStyleComplete : {}),
                  opacity: isWithdrawn ? 0.6 : 1,
                  cursor: isWithdrawn ? 'not-allowed' : 'pointer',
                  pointerEvents: isWithdrawn ? 'none' : 'auto',
                }}
                onClick={() => !isWithdrawn && handleCardClick(event)}
              >
                <div style={cardContentStyle}>
                  <div style={cardHeaderRowStyle}>
                    <div>
                      <h3 style={eventTitleStyle}>{event.title}</h3>
                    </div>
                    <div style={cardHeaderActionsStyle}>
                      <span style={cardDateBadgeStyle}>{new Date(event.date).toLocaleDateString()}</span>
                      {isOpportunitiesTab && !relatedApplication && (
                        <ScorePieChart
                          score={matchScore}
                          size={72}
                          isLoading={recommendationsLoading}
                          breakdown={breakdown}
                          matchReasons={matchReasons}
                        />
                      )}
                      <button
                        type="button"
                        aria-label={favoriteIdsSet.has(event._id) ? 'Retirer des favoris' : 'Ajouter aux favoris'}
                        style={favoriteStarButtonStyle(favoriteIdsSet.has(event._id))}
                        onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                          e.stopPropagation();
                          toggleFavoriteEvent(event._id);
                        }}
                      >
                        {favoriteIdsSet.has(event._id) ? '★' : '☆'}
                      </button>
                    </div>
                  </div>
                  <div style={cardMetaGridStyle}>
                    <div style={cardMetaItemStyle}>
                      <span style={cardMetaLabelStyle}>Lieu</span>
                      <span style={cardMetaValueStyle}>{formatEventLocation(event)}</span>
                    </div>
                    <div style={cardMetaItemStyle}>
                      <span style={cardMetaLabelStyle}>Horaires</span>
                      <span style={cardMetaValueStyle}>{formatEventTimeRange(event)}</span>
                    </div>
                    <div style={cardMetaItemStyle}>
                      <span style={cardMetaLabelStyle}>Statut</span>
                      <span style={cardMetaValueStyle}>{statusLabel}</span>
                    </div>
                  </div>
                </div>
                <div style={cardStatusBlockStyle}>
                  {renderStatusChip(`Statut: ${statusLabel}`, statusLabel === 'Publié' ? '#28a745' : '#ff8ba0', statusLabel === 'Publié' ? 'rgba(40, 167, 69, 0.15)' : 'rgba(255, 65, 108, 0.12)')}
                  {renderStatusChip(
                    isCompleteEvent ? `Complet • ${participantsRatio}` : `Non complet • ${participantsRatio}`,
                    isCompleteEvent ? '#64748B' : '#ffc107',
                    isCompleteEvent ? 'rgba(0, 0, 0, 0.06)' : 'rgba(255, 193, 7, 0.15)'
                  )}
                  {comedianApplicationChip}
                  {/* Badge pour les recommandations intelligentes */}
                  {isRecommendationsTab && smartRecommendationMap.has(String(event._id)) && (() => {
                    const smartRec = smartRecommendationMap.get(String(event._id));
                    if (smartRec?.matchType === 'recurring_event_group') {
                      return renderStatusChip(
                        `Événement récurrent: ${smartRec.matchedRecurrenceEventTitle || event.title}`,
                        '#c084fc',
                        'rgba(192, 132, 252, 0.25)'
                      );
                    }
                    if (smartRec?.matchType === 'same_event_name') {
                      return renderStatusChip(
                        `Même événement: ${smartRec.matchedEventTitle || event.title}`,
                        '#a78bfa',
                        'rgba(139, 92, 246, 0.2)'
                      );
                    }
                    if (smartRec?.matchType === 'same_organizer') {
                      return renderStatusChip(
                        `Même organisateur: ${smartRec.matchedOrganizerName || 'Organisateur'}`,
                        '#60a5fa',
                        'rgba(96, 165, 250, 0.2)'
                      );
                    }
                    return null;
                  })()}
                  <div style={cardActionStackStyle}>
                    {isEventWithinOneHour(event) ? (
                      <span style={{ fontSize: '12px', color: '#888' }}>
                        Plus de modification possible (événement dans moins d'1 h)
                      </span>
                    ) : !appliedEventIds.has(event._id) ? (
                      <button
                        onClick={(e: React.MouseEvent<HTMLButtonElement>) => { e.stopPropagation(); handleApplyClick(event); }}
                        style={
                          (event.participants?.length || 0) >= event.requirements.maxPerformers
                            ? disabledApplyButtonStyle
                            : applyButtonStyle
                        }
                        disabled={(event.participants?.length || 0) >= event.requirements.maxPerformers}
                      >
                        {(event.participants?.length || 0) >= event.requirements.maxPerformers
                          ? 'Évènement complet'
                          : 'Postuler'}
                      </button>
                    ) : isWithdrawn ? null : (
                      <button
                        onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                          e.stopPropagation();
                          openWithdrawModal(event);
                        }}
                        style={deleteButtonStyle}
                      >
                        Me désinscrire
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {filteredUpcomingEvents.length > ITEMS_PER_PAGE && (
            <div style={paginationControlsStyle}>
              <button
                style={paginationButtonStyle}
                disabled={upcomingPage === 1}
                onClick={() => setUpcomingPage(prev => Math.max(1, prev - 1))}
              >
                Précédent
              </button>
              <span style={paginationInfoStyle}>
                Page {Math.min(upcomingPage, totalUpcomingPages)} / {Math.max(totalUpcomingPages, 1)}
              </span>
              <button
                style={paginationButtonStyle}
                disabled={upcomingPage >= totalUpcomingPages}
                onClick={() => setUpcomingPage(prev => Math.min(totalUpcomingPages, prev + 1))}
              >
                Suivant
              </button>
            </div>
          )}
        </div>
      ) : (
        <>
          {isOrganizerView && (
            <>
              <div style={{ maxWidth: '1200px', margin: '0 auto 20px auto', padding: '0 20px' }}>
                <div style={organizerTabsContainerStyle}>
                  {/* Dropdown pour les événements */}
                  <div style={dropdownContainerStyle}>
                    <style>{`
                      .organizer-events-dropdown option {
                        background-color: #1a1a2e !important;
                        color: #ffffff !important;
                        padding: 12px 16px;
                        font-size: 1em;
                      }
                      .organizer-events-dropdown option:hover {
                        background-color: rgba(255, 75, 43, 0.2) !important;
                      }
                      .organizer-events-dropdown option:checked {
                        background-color: rgba(255, 75, 43, 0.3) !important;
                        color: #ffffff !important;
                        font-weight: 700;
                      }
                    `}</style>
                    <select
                      className="organizer-events-dropdown"
                      value={organizerTab}
                      onChange={(e) => {
                        const newTab = e.target.value as OrganizerTab;
                        if (newTab !== 'recurringEvents') setSelectedRecurrenceGroupId(null);
                        if (newTab !== 'upcoming') setExpandedUpcomingGroupId(null);
                        setOrganizerTab(newTab);
                      }}
                      style={dropdownSelectStyle(eventsSubTabs.includes(organizerTab as EventsSubTab))}
                    >
                      {eventsSubTabs.map(tabId => (
                        <option key={tabId} value={tabId}>
                          {organizerTabTitles[tabId]} ({organizerTabCounts[tabId]})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Tabs normaux pour Calendrier et Humoristes favoris */}
                  <button
                    style={organizerTabButtonStyle(organizerTab === 'calendar')}
                    onClick={() => {
                      setSelectedRecurrenceGroupId(null);
                      setExpandedUpcomingGroupId(null);
                      setOrganizerTab('calendar');
                    }}
                  >
                    <span>{organizerTabTitles['calendar']}</span>
                    <span style={organizerTabCountStyle}>{organizerTabCounts['calendar']}</span>
                  </button>

                  <button
                    style={organizerTabButtonStyle(organizerTab === 'favoriteComedians')}
                    onClick={() => {
                      setSelectedRecurrenceGroupId(null);
                      setExpandedUpcomingGroupId(null);
                      setOrganizerTab('favoriteComedians');
                    }}
                  >
                    <span>{organizerTabTitles['favoriteComedians']}</span>
                    <span style={organizerTabCountStyle}>{organizerTabCounts['favoriteComedians']}</span>
                  </button>
                </div>
              </div>
              
              {/* Barre de recherche par zone d'événement et filtre (masquée sur l'onglet Événements récurrents) */}
              {organizerTab !== 'recurringEvents' && (
              <div
                style={{
                  maxWidth: '1200px',
                  margin: '0 auto 20px auto',
                  padding: '0 20px'
                }}
              >
                <div
                  style={{
                    marginBottom: '20px',
                    padding: '15px',
                    backgroundColor: 'rgba(0, 0, 0, 0.3)',
                    borderRadius: '8px',
                    border: '1px solid #444'
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: isMobile ? 'column' : 'row',
                      gap: '15px',
                      alignItems: isMobile ? 'stretch' : 'flex-end'
                    }}
                  >
                    {/* Recherche par zone d'événement */}
                    <div style={{ flex: isMobile ? undefined : 1, width: isMobile ? '100%' : undefined }}>
                      <label
                        style={{
                          display: 'block',
                          color: '#ffffff',
                          marginBottom: '8px',
                          fontWeight: 'bold',
                          fontSize: '14px'
                        }}
                      >
                        Recherche par zone d'événement
                      </label>
                      <input
                        type="text"
                        placeholder="Ville, département, région de l'événement..."
                        value={organizerEventZoneSearch}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setOrganizerEventZoneSearch(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '10px',
                          borderRadius: '6px',
                          border: '1px solid #555',
                          backgroundColor: 'rgba(0, 0, 0, 0.6)',
                          color: '#ffffff',
                          fontSize: '14px'
                        }}
                      />
                    </div>
                    
                    {/* Filtre par niveau d'expérience */}
                    <div style={{ width: isMobile ? '100%' : '200px' }}>
                      <label
                        style={{
                          display: 'block',
                          color: '#ffffff',
                          marginBottom: '8px',
                          fontWeight: 'bold',
                          fontSize: '14px'
                        }}
                      >
                        Niveau d'expérience
                      </label>
                      <select
                        value={organizerEventExperienceFilter}
                        onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setOrganizerEventExperienceFilter(e.target.value as 'all' | '0-50' | '50-200' | '200+')}
                        style={{
                          width: '100%',
                          padding: '10px',
                          borderRadius: '6px',
                          border: '1px solid #555',
                          backgroundColor: 'rgba(0, 0, 0, 0.6)',
                          color: '#ffffff',
                          fontSize: '14px'
                        }}
                      >
                        <option value="all">Tous les niveaux</option>
                        <option value="0-50">Débutant (0-50 scènes)</option>
                        <option value="50-200">Expérimenté (50-200 scènes)</option>
                        <option value="200+">Pro (200+ scènes)</option>
                      </select>
                    </div>
                    
                    {/* Bouton réinitialiser */}
                    {(organizerEventZoneSearch.trim() || organizerEventExperienceFilter !== 'all') && (
                      <button
                        onClick={() => {
                          setOrganizerEventZoneSearch('');
                          setOrganizerEventExperienceFilter('all');
                        }}
                        style={{
                          padding: '10px 18px',
                          borderRadius: '6px',
                          border: '1px solid #555',
                          backgroundColor: 'rgba(255, 255, 255, 0.1)',
                          color: '#ffffff',
                          cursor: 'pointer',
                          fontSize: '14px',
                          whiteSpace: 'nowrap',
                          height: 'fit-content'
                        }}
                      >
                        Réinitialiser
                      </button>
                    )}
                  </div>
                </div>
              </div>
              )}

              {/* Section de recherche d'humoristes par zone d'événement (masquée sur l'onglet Événements récurrents) */}
              {organizerTab !== 'recurringEvents' && (
              <div
                style={{
                  maxWidth: '1200px',
                  margin: '0 auto 20px auto',
                  padding: '0 20px'
                }}
              >
                <div
                  style={{
                    marginBottom: '20px',
                    padding: '15px',
                    backgroundColor: 'rgba(0, 0, 0, 0.3)',
                    borderRadius: '8px',
                    border: '1px solid #444'
                  }}
                >
                  {/* Bouton pour afficher/masquer la section */}
                  <button
                    onClick={() => setShowComedianSearchSection(!showComedianSearchSection)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      width: '100%',
                      padding: '10px 15px',
                      backgroundColor: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      color: '#ffffffff',
                      fontWeight: 'bold',
                      fontSize: '16px'
                    }}
                  >
                    <span>Rechercher des humoristes par zone</span>
                    <span style={{ fontSize: '20px' }}>{showComedianSearchSection ? '−' : '+'}</span>
                  </button>

                  {showComedianSearchSection && (
                    <div style={{ marginTop: '15px' }}>
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: isMobile ? 'column' : 'row',
                          gap: '15px',
                          alignItems: isMobile ? 'stretch' : 'flex-end'
                        }}
                      >
                        {/* Sélection du type de zone */}
                        <div style={{ width: isMobile ? '100%' : '180px' }}>
                          <label
                            style={{
                              display: 'block',
                              color: '#ffffff',
                              marginBottom: '8px',
                              fontWeight: 'bold',
                              fontSize: '14px'
                            }}
                          >
                            Type de zone
                          </label>
                          <select
                            value={comedianZoneType}
                            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                              setComedianZoneType(e.target.value as 'ville' | 'departement' | 'region');
                              setComedianZoneSearch(''); // Réinitialiser la recherche lors du changement de type
                              setComedianSearchResults([]); // Réinitialiser les résultats
                              setComedianSearchTotal(0);
                            }}
                            style={{
                              width: '100%',
                              padding: '10px',
                              borderRadius: '6px',
                              border: '1px solid #555',
                              backgroundColor: 'rgba(0, 0, 0, 0.6)',
                              color: '#ffffff',
                              fontSize: '14px'
                            }}
                          >
                            <option value="ville">Ville</option>
                            <option value="departement">Département</option>
                            <option value="region">Région</option>
                          </select>
                        </div>

                        {/* Recherche par zone */}
                        <div style={{ flex: isMobile ? undefined : 1, width: isMobile ? '100%' : undefined }}>
                          <label
                            style={{
                              display: 'block',
                              color: '#ffffff',
                              marginBottom: '8px',
                              fontWeight: 'bold',
                              fontSize: '14px'
                            }}
                          >
                            Zone d'événement
                          </label>

                          {/* Select pour les régions */}
                          {comedianZoneType === 'region' && (
                            <select
                              value={comedianZoneSearch}
                              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setComedianZoneSearch(e.target.value)}
                              style={{
                                width: '100%',
                                padding: '10px',
                                borderRadius: '6px',
                                border: '1px solid #555',
                                backgroundColor: 'rgba(0, 0, 0, 0.6)',
                                color: '#ffffff',
                                fontSize: '14px'
                              }}
                            >
                              <option value="">Sélectionnez une région</option>
                              {Object.keys(FRENCH_REGIONS).map(region => (
                                <option key={region} value={region}>{region}</option>
                              ))}
                            </select>
                          )}

                          {/* Select pour les départements */}
                          {comedianZoneType === 'departement' && (
                            <select
                              value={comedianZoneSearch}
                              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setComedianZoneSearch(e.target.value)}
                              style={{
                                width: '100%',
                                padding: '10px',
                                borderRadius: '6px',
                                border: '1px solid #555',
                                backgroundColor: 'rgba(0, 0, 0, 0.6)',
                                color: '#ffffff',
                                fontSize: '14px'
                              }}
                            >
                              <option value="">Sélectionnez un département</option>
                              {DEPARTMENTS_ORDER.map(code => (
                                <option key={code} value={code}>{code} - {FRENCH_DEPARTMENTS[code]}</option>
                              ))}
                            </select>
                          )}

                          {/* Input pour les villes */}
                          {comedianZoneType === 'ville' && (
                            <input
                              type="text"
                              placeholder="Ex: Paris, Lyon, Marseille..."
                              value={comedianZoneSearch}
                              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setComedianZoneSearch(e.target.value)}
                              style={{
                                width: '100%',
                                padding: '10px',
                                borderRadius: '6px',
                                border: '1px solid #555',
                                backgroundColor: 'rgba(0, 0, 0, 0.6)',
                                color: '#ffffff',
                                fontSize: '14px'
                              }}
                            />
                          )}
                        </div>

                        {/* Filtre par niveau d'expérience */}
                        <div style={{ width: isMobile ? '100%' : '200px' }}>
                          <label
                            style={{
                              display: 'block',
                              color: '#ffffff',
                              marginBottom: '8px',
                              fontWeight: 'bold',
                              fontSize: '14px'
                            }}
                          >
                            Niveau d'expérience
                          </label>
                          <select
                            value={comedianExperienceFilter}
                            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setComedianExperienceFilter(e.target.value as 'all' | '0-50' | '50-200' | '200+')}
                            style={{
                              width: '100%',
                              padding: '10px',
                              borderRadius: '6px',
                              border: '1px solid #555',
                              backgroundColor: 'rgba(0, 0, 0, 0.6)',
                              color: '#ffffff',
                              fontSize: '14px'
                            }}
                          >
                            <option value="all">Tous les niveaux</option>
                            <option value="0-50">Débutant (0-50 scènes)</option>
                            <option value="50-200">Expérimenté (50-200 scènes)</option>
                            <option value="200+">Pro (200+ scènes)</option>
                          </select>
                        </div>

                        {/* Bouton réinitialiser */}
                        {(comedianZoneSearch.trim() || comedianExperienceFilter !== 'all' || comedianZoneType !== 'ville') && (
                          <button
                            onClick={() => {
                              setComedianZoneType('ville');
                              setComedianZoneSearch('');
                              setComedianExperienceFilter('all');
                              setComedianSearchResults([]);
                              setComedianSearchTotal(0);
                            }}
                            style={{
                              padding: '10px 18px',
                              borderRadius: '6px',
                              border: '1px solid #555',
                              backgroundColor: 'rgba(255, 255, 255, 0.1)',
                              color: '#ffffff',
                              cursor: 'pointer',
                              fontSize: '14px',
                              whiteSpace: 'nowrap',
                              height: 'fit-content'
                           }}
                          >
                            Réinitialiser
                          </button>
                        )}
                      </div>

                      {/* Résultats de la recherche */}
                      {isSearchingComedians && (
                        <p style={{ color: '#28a745', marginTop: '15px', textAlign: 'center' }}>
                          Recherche en cours...
                        </p>
                      )}

                      {comedianSearchError && (
                        <p style={{ color: '#dc3545', marginTop: '15px', textAlign: 'center' }}>
                          {comedianSearchError}
                        </p>
                      )}

                      {!isSearchingComedians && comedianZoneSearch.trim() && comedianSearchResults.length === 0 && !comedianSearchError && (
                        <p style={{ color: '#ffc107', marginTop: '15px', textAlign: 'center' }}>
                          Aucun humoriste trouvé pour cette zone.
                        </p>
                      )}

                      {comedianSearchResults.length > 0 && (
                        <div style={{ marginTop: '20px' }}>
                          <h4 style={{ color: '#28a745', marginBottom: '15px' }}>
                            {comedianSearchTotal} humoriste{comedianSearchTotal > 1 ? 's' : ''} trouvé{comedianSearchTotal > 1 ? 's' : ''}
                          </h4>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {comedianSearchResults.map((comedian) => (
                              <div
                                key={comedian._id}
                                onClick={() => {
                                  setSelectedComedian({
                                    id: comedian._id,
                                    firstName: comedian.firstName,
                                    lastName: comedian.lastName,
                                    email: comedian.email,
                                    phone: comedian.phone,
                                    stageName: comedian.stageName,
                                    bio: comedian.bio,
                                    numberOfScenes: comedian.numberOfScenes,
                                    comedyStyle: comedian.comedyStyle,
                                    performanceLanguages: comedian.performanceLanguages,
                                    mobilityZone: comedian.mobilityZone,
                                    socialLinks: comedian.socialLinks,
                                    stats: comedian.stats
                                  });
                                  setIsComedianModalOpen(true);
                                }}
                                style={{
                                  padding: '15px',
                                  backgroundColor: 'rgba(0, 0, 0, 0.4)',
                                  borderRadius: '8px',
                                  border: '1px solid #444',
                                  cursor: 'pointer',
                                  transition: 'all 0.2s ease'
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.backgroundColor = 'rgba(40, 167, 69, 0.2)';
                                  e.currentTarget.style.borderColor = '#28a745';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.4)';
                                  e.currentTarget.style.borderColor = '#444';
                                }}
                              >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
                                  <div style={{ flex: 1 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '5px' }}>
                                      <h5 style={{ color: '#ffffff', margin: 0, fontSize: '16px' }}>
                                        {comedian.stageName || `${comedian.firstName} ${comedian.lastName}`}
                                      </h5>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          toggleFavoriteComedian(comedian._id);
                                        }}
                                        style={{
                                          border: 'none',
                                          background: 'transparent',
                                          color: favoriteComedianIds.includes(comedian._id) ? '#ffd700' : '#888888',
                                          fontSize: '1.3em',
                                          cursor: 'pointer',
                                          transition: 'color 0.2s ease, transform 0.2s ease',
                                          padding: 0,
                                          lineHeight: 1,
                                        }}
                                        title={favoriteComedianIds.includes(comedian._id) ? 'Retirer des favoris' : 'Ajouter aux favoris'}
                                        onMouseEnter={(e) => {
                                          e.currentTarget.style.transform = 'scale(1.2)';
                                        }}
                                        onMouseLeave={(e) => {
                                          e.currentTarget.style.transform = 'scale(1)';
                                        }}
                                      >
                                        {favoriteComedianIds.includes(comedian._id) ? '⭐' : '☆'}
                                      </button>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          openInviteModal(comedian);
                                        }}
                                        style={{
                                          border: 'none',
                                          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                                          color: '#ffffff',
                                          fontSize: '12px',
                                          cursor: 'pointer',
                                          padding: '6px 12px',
                                          borderRadius: '15px',
                                          transition: 'transform 0.2s ease, opacity 0.2s ease',
                                        }}
                                        title="Inviter pour un événement"
                                        onMouseEnter={(e) => {
                                          e.currentTarget.style.transform = 'scale(1.05)';
                                          e.currentTarget.style.opacity = '0.9';
                                        }}
                                        onMouseLeave={(e) => {
                                          e.currentTarget.style.transform = 'scale(1)';
                                          e.currentTarget.style.opacity = '1';
                                        }}
                                      >
                                        Inviter
                                      </button>
                                    </div>
                                    {comedian.stageName && (
                                      <p style={{ color: '#aaa', margin: '0 0 5px 0', fontSize: '13px' }}>
                                        {comedian.firstName} {comedian.lastName}
                                      </p>
                                    )}
                                    {comedian.mobilityZone && comedian.mobilityZone.length > 0 && (
                                      <p style={{ color: '#888', margin: '0', fontSize: '13px' }}>
                                        🚗 Zones : {comedian.mobilityZone.map(z => z.value).join(', ')}
                                      </p>
                                    )}
                                  </div>
                                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '5px' }}>
                                    {comedian.numberOfScenes && (
                                      <span
                                        style={{
                                          padding: '4px 10px',
                                          borderRadius: '12px',
                                          fontSize: '15px',
                                          // On garde la même couleur jaune pour tous les niveaux
                                          backgroundColor: 'rgba(255, 193, 7, 0.3)',
                                          color: '#ffc107'
                                        }}
                                      >
                                        {comedian.numberOfScenes === '200+' ? 'Pro' : comedian.numberOfScenes === '50-200' ? 'Expérimenté' : 'Débutant'}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                {comedian.comedyStyle && comedian.comedyStyle.length > 0 && (
                                  <div style={{ marginTop: '10px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                    {comedian.comedyStyle.map((style, idx) => (
                                      <span
                                        key={idx}
                                        style={{
                                          padding: '3px 8px',
                                          borderRadius: '10px',
                                          fontSize: '15px',
                                          backgroundColor: 'rgba(102, 126, 234, 0.2)',
                                          color: '#667eea'
                                        }}
                                      >
                                        {style}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>

                          {/* Pagination */}
                          {comedianSearchTotal > 10 && (
                            <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', marginTop: '20px' }}>
                              <button
                                onClick={() => setComedianSearchPage(p => Math.max(1, p - 1))}
                                disabled={comedianSearchPage === 1}
                                style={{
                                  padding: '8px 16px',
                                  borderRadius: '6px',
                                  border: '1px solid #28a745',
                                  backgroundColor: comedianSearchPage === 1 ? 'rgba(0, 0, 0, 0.3)' : 'rgba(40, 167, 69, 0.2)',
                                  color: comedianSearchPage === 1 ? '#666' : '#ffffff',
                                  cursor: comedianSearchPage === 1 ? 'not-allowed' : 'pointer'
                                }}
                              >
                                Précédent
                              </button>
                              <span style={{ color: '#ffffff', alignSelf: 'center' }}>
                                Page {comedianSearchPage} / {Math.ceil(comedianSearchTotal / 10)}
                              </span>
                              <button
                                onClick={() => setComedianSearchPage(p => p + 1)}
                                disabled={comedianSearchPage >= Math.ceil(comedianSearchTotal / 10)}
                                style={{
                                  padding: '8px 16px',
                                  borderRadius: '6px',
                                  border: '1px solid #28a745',
                                  backgroundColor: comedianSearchPage >= Math.ceil(comedianSearchTotal / 10) ? 'rgba(0, 0, 0, 0.3)' : 'rgba(40, 167, 69, 0.2)',
                                  color: comedianSearchPage >= Math.ceil(comedianSearchTotal / 10) ? '#666' : '#ffffff',
                                  cursor: comedianSearchPage >= Math.ceil(comedianSearchTotal / 10) ? 'not-allowed' : 'pointer'
                                }}
                              >
                                Suivant
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
              )}
            </>
          )}
          {isSuperAdminView && (
            <div style={{ maxWidth: '1200px', margin: '0 auto 20px auto', padding: '0 20px' }}>
              <div style={organizerTabsContainerStyle}>
                {superAdminTabs.map(tabId => (
                  <button
                    key={tabId}
                    style={organizerTabButtonStyle(superAdminTab === tabId)}
                    onClick={() => setSuperAdminTab(tabId)}
                  >
                    <span>{superAdminTabTitles[tabId]}</span>
                    <span style={organizerTabCountStyle}>{superAdminTabCounts[tabId]}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {showOrganizerUpcomingSection && (
            <div style={sectionStyle}>
              <div
                style={{
                  display: 'flex',
                  flexDirection: isMobile ? 'column' : 'row',
                  alignItems: isMobile ? 'flex-start' : 'center',
                  gap: isMobile ? '10px' : '16px',
                  marginBottom: '18px'
                }}
              >
                <h2 style={sectionTitleStyle}>Évènements à venir</h2>
                {isOrganizerView && (
                  <select
                    value={completionFilter}
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setCompletionFilter(e.target.value as 'all' | 'complete' | 'incomplete')}
                    style={{
                      marginLeft: isMobile ? 0 : 'auto',
                      padding: '8px',
                      borderRadius: '6px',
                      border: '1px solid #444',
                      background: '#222',
                      color: '#fff',
                      minWidth: 160,
                      width: isMobile ? '100%' : undefined
                    }}
                  >
                    <option value="all">Tous</option>
                    <option value="complete">Complet</option>
                    <option value="incomplete">Non complet</option>
                  </select>
                )}
              </div>
              {listIsLoading && <p style={emptyStateStyle}>Chargement des évènements...</p>}
              {listHasError && <p style={{ ...emptyStateStyle, color: '#dc3545' }}>Erreur: {listErrorMessage}</p>}
              {((isOrganizerView && organizerTab === 'upcoming') || (isSuperAdminView && superAdminTab === 'upcoming'))
                ? (
                  <>
                    {(() => {
                      const upcomingSectionItems = isOrganizerView ? upcomingDisplayItems : superAdminUpcomingDisplayItems;
                      return (
                        <>
                          {upcomingSectionItems.length === 0 && !listIsLoading && !listHasError && (
                            <p style={emptyStateStyle}>
                              {isOrganizerView ? 'Aucun évènement à venir pour ce filtre.' : 'Aucun évènement à venir (non complet).'}
                            </p>
                          )}
                          {upcomingSectionItems.slice((upcomingPage - 1) * ITEMS_PER_PAGE, upcomingPage * ITEMS_PER_PAGE).map((item) => {
                    if (item.type === 'event') {
                      const event = item.event;
                      const isCompleteEvent = isEventComplete(event);
                      const participantsRatio = getParticipantsRatio(event);
                      const statusLabel = translateEventStatus(event.status);
                      return (
                        <div key={event._id} style={{ ...eventCardStyle, ...(isCompleteEvent ? eventCardStyleComplete : {}) }} onClick={() => handleCardClick(event)}>
                          <div style={cardContentStyle}>
                            <div style={cardHeaderRowStyle}>
                              <div>
                                <h3 style={eventTitleStyle}>{event.title}</h3>
                              </div>
                              <div style={cardHeaderActionsStyle}>
                                <span style={cardDateBadgeStyle}>{new Date(event.date).toLocaleDateString('fr-FR')}</span>
                              </div>
                            </div>
                            <div style={cardMetaGridStyle}>
                              <div style={cardMetaItemStyle}>
                                <span style={cardMetaLabelStyle}>Lieu</span>
                                <span style={cardMetaValueStyle}>{formatEventLocation(event)}</span>
                              </div>
                              <div style={cardMetaItemStyle}>
                                <span style={cardMetaLabelStyle}>Horaires</span>
                                <span style={cardMetaValueStyle}>{formatEventTimeRange(event)}</span>
                              </div>
                              <div style={cardMetaItemStyle}>
                                <span style={cardMetaLabelStyle}>Statut</span>
                                <span style={cardMetaValueStyle}>{statusLabel}</span>
                              </div>
                            </div>
                          </div>
                          <div style={cardStatusBlockStyle}>
                            {renderStatusChip(`Statut: ${statusLabel}`, statusLabel === 'Publié' ? '#28a745' : '#ff8ba0', statusLabel === 'Publié' ? 'rgba(40, 167, 69, 0.15)' : 'rgba(255, 65, 108, 0.12)')}
                            {renderStatusChip(
                              isCompleteEvent ? `Complet • ${participantsRatio}` : `Non complet • ${participantsRatio}`,
                              isCompleteEvent ? '#64748B' : '#ffc107',
                              isCompleteEvent ? 'rgba(0, 0, 0, 0.06)' : 'rgba(255, 193, 7, 0.15)'
                            )}
                            {renderOrganizerActions(event, 'upcoming')}
                          </div>
                        </div>
                      );
                    }
                    const first = item.events[0];
                    const last = item.events[item.events.length - 1];
                    const dateFirst = first?.date ? new Date(first.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
                    const dateLast = last?.date ? new Date(last.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
                    const isExpanded = expandedUpcomingGroupId === item.groupId;
                    return (
                      <div key={item.groupId} style={{ marginBottom: '15px' }}>
                        <div
                          style={{ ...eventCardStyle, borderLeft: '4px solid rgba(255, 75, 43, 0.6)' }}
                          onClick={() => setExpandedUpcomingGroupId((id) => (id === item.groupId ? null : item.groupId))}
                        >
                          <div style={cardContentStyle}>
                            <div style={cardHeaderRowStyle}>
                              <div>
                                <h3 style={eventTitleStyle}>{first?.title}</h3>
                                <span style={{ fontSize: '0.85em', color: '#64748B' }}>Événement récurrent · {item.events.length} date(s)</span>
                              </div>
                              <div style={cardHeaderActionsStyle}>
                                <span style={cardDateBadgeStyle}>Voir les dates</span>
                                <span style={{ ...cardDateBadgeStyle, marginLeft: '8px' }}>{isExpanded ? '−' : '+'}</span>
                              </div>
                            </div>
                            <div style={cardMetaGridStyle}>
                              <div style={cardMetaItemStyle}>
                                <span style={cardMetaLabelStyle}>Lieu</span>
                                <span style={cardMetaValueStyle}>{first?.location?.venue} — {first?.location?.city}</span>
                              </div>
                            </div>
                          </div>
                          <div style={cardStatusBlockStyle}>
                            {renderStatusChip(`Groupe · ${item.events.length} date(s)`, '#5b9bd5', 'rgba(65, 131, 215, 0.15)')}
                            {first && renderOrganizerActions(first, 'upcoming', item.events, `upcoming-group-${item.groupId}`)}
                          </div>
                        </div>
                        {isExpanded && (
                          <div style={{ marginLeft: isMobile ? 0 : '20px', marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {item.events.map((event) => {
                              const dateStr = typeof event.date === 'string' ? event.date : '';
                              const dateFormatted = dateStr ? new Date(dateStr).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : '';
                              const timeStr = event.startTime && event.endTime ? `${event.startTime} – ${event.endTime}` : '';
                              const participantsCount = event.participants?.length ?? 0;
                              const maxP = event.requirements?.maxPerformers ?? event.maxParticipants ?? 0;
                              const isDateComplete = maxP > 0 && participantsCount >= maxP;
                              return (
                                <div
                                  key={event._id}
                                  onClick={(e) => { e.stopPropagation(); handleCardClick(event); }}
                                  style={{
                                    padding: '12px 16px',
                                    backgroundColor: isDateComplete ? '#E1FFE6' : '#f8fafc',
                                    borderRadius: '8px',
                                    border: isDateComplete ? '1px solid #c8f0d0' : '1px solid rgba(0, 0, 0, 0.08)',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    flexWrap: 'wrap',
                                    gap: '8px',
                                  }}
                                >
                                  <div>
                                    <span style={{ ...cardDateBadgeStyle, marginRight: '8px', fontSize: '0.8em' }}>{dateFormatted}</span>
                                    <span style={{ color: '#1a1a1a' }}>{timeStr}</span>
                                  </div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <span style={{ color: '#64748B', fontSize: '0.9em' }}>{participantsCount}/{maxP} humoristes</span>
                                    {user?.role === 'ORGANIZER' && renderOrganizerActions(event, 'upcoming', undefined, `upcoming-expanded-${event._id}`)}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                          {upcomingSectionItems.length > ITEMS_PER_PAGE && (
                            <div style={paginationControlsStyle}>
                              <button
                                style={paginationButtonStyle}
                                disabled={upcomingPage === 1}
                                onClick={() => { setExpandedUpcomingGroupId(null); setUpcomingPage(prev => Math.max(1, prev - 1)); }}
                              >
                                Précédent
                              </button>
                              <span style={paginationInfoStyle}>
                                Page {Math.min(upcomingPage, Math.max(1, Math.ceil(upcomingSectionItems.length / ITEMS_PER_PAGE)))} / {Math.max(1, Math.ceil(upcomingSectionItems.length / ITEMS_PER_PAGE))}
                              </span>
                              <button
                                style={paginationButtonStyle}
                                disabled={upcomingPage >= Math.ceil(upcomingSectionItems.length / ITEMS_PER_PAGE)}
                                onClick={() => { setExpandedUpcomingGroupId(null); setUpcomingPage(prev => Math.min(Math.ceil(upcomingSectionItems.length / ITEMS_PER_PAGE), prev + 1)); }}
                              >
                                Suivant
                              </button>
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </>
                  )
                : (
                  <>
                    {eventsToDisplay.length === 0 && !listIsLoading && !listHasError && (
                      <p style={emptyStateStyle}>
                        {isOrganizerView ? 'Aucun évènement à venir pour ce filtre.' : 'Aucun évènement à venir (non complet).'}
                      </p>
                    )}
                    {paginatedUpcomingEvents.map((event) => {
                      const isCompleteEvent = isEventComplete(event);
                      const participantsRatio = getParticipantsRatio(event);
                      const statusLabel = translateEventStatus(event.status);
                      return (
                        <div key={event._id} style={{ ...eventCardStyle, ...(isCompleteEvent ? eventCardStyleComplete : {}) }} onClick={() => handleCardClick(event)}>
                          <div style={cardContentStyle}>
                            <div style={cardHeaderRowStyle}>
                              <div>
                                <h3 style={eventTitleStyle}>{event.title}</h3>
                              </div>
                              <div style={cardHeaderActionsStyle}>
                                <span style={cardDateBadgeStyle}>{new Date(event.date).toLocaleDateString()}</span>
                              </div>
                            </div>
                            <div style={cardMetaGridStyle}>
                              <div style={cardMetaItemStyle}>
                                <span style={cardMetaLabelStyle}>Lieu</span>
                                <span style={cardMetaValueStyle}>{formatEventLocation(event)}</span>
                              </div>
                              <div style={cardMetaItemStyle}>
                                <span style={cardMetaLabelStyle}>Horaires</span>
                                <span style={cardMetaValueStyle}>{formatEventTimeRange(event)}</span>
                              </div>
                              <div style={cardMetaItemStyle}>
                                <span style={cardMetaLabelStyle}>Statut</span>
                                <span style={cardMetaValueStyle}>{statusLabel}</span>
                              </div>
                            </div>
                          </div>
                          <div style={cardStatusBlockStyle}>
                            {renderStatusChip(`Statut: ${statusLabel}`, statusLabel === 'Publié' ? '#28a745' : '#ff8ba0', statusLabel === 'Publié' ? 'rgba(40, 167, 69, 0.15)' : 'rgba(255, 65, 108, 0.12)')}
                            {renderStatusChip(
                              isCompleteEvent ? `Complet • ${participantsRatio}` : `Non complet • ${participantsRatio}`,
                              isCompleteEvent ? '#64748B' : '#ffc107',
                              isCompleteEvent ? 'rgba(0, 0, 0, 0.06)' : 'rgba(255, 193, 7, 0.15)'
                            )}
                            {renderOrganizerActions(event, 'upcoming')}
                          </div>
                        </div>
                      );
                    })}
                    {filteredUpcomingEvents.length > ITEMS_PER_PAGE && (
                      <div style={paginationControlsStyle}>
                        <button
                          style={paginationButtonStyle}
                          disabled={upcomingPage === 1}
                          onClick={() => setUpcomingPage(prev => Math.max(1, prev - 1))}
                        >
                          Précédent
                        </button>
                        <span style={paginationInfoStyle}>
                          Page {Math.min(upcomingPage, totalUpcomingPages)} / {Math.max(totalUpcomingPages, 1)}
                        </span>
                        <button
                          style={paginationButtonStyle}
                          disabled={upcomingPage >= totalUpcomingPages}
                          onClick={() => setUpcomingPage(prev => Math.min(totalUpcomingPages, prev + 1))}
                        >
                          Suivant
                        </button>
                      </div>
                    )}
                  </>
                )}
            </div>
          )}

          {showCompletedSection && (
            <div style={sectionStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '18px' }}>
                <h2 style={sectionTitleStyle}>Évènements complets</h2>
              </div>
              {eventsLoading && <p style={emptyStateStyle}>Chargement des évènements...</p>}
              {eventsError && <p style={{ ...emptyStateStyle, color: '#dc3545' }}>Erreur: {eventsErrorMessage?.message}</p>}
              {!eventsLoading && !eventsError && completedUpcomingEvents.length === 0 && (
                <p style={emptyStateStyle}>Aucun évènement complet à venir.</p>
              )}
              {paginatedCompletedEvents.map((event) => {
                const participantsRatio = getParticipantsRatio(event);
                const statusLabel = translateEventStatus(event.status);

                return (
                  <div key={event._id} style={{ ...eventCardStyle, ...eventCardStyleComplete }} onClick={() => handleCardClick(event)}>
                    <div style={cardContentStyle}>
                      <div style={cardHeaderRowStyle}>
                        <div>
                          <h3 style={eventTitleStyle}>{event.title}</h3>
                        </div>
                        <div style={cardHeaderActionsStyle}>
                          <span style={cardDateBadgeStyle}>{new Date(event.date).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <div style={cardMetaGridStyle}>
                        <div style={cardMetaItemStyle}>
                          <span style={cardMetaLabelStyle}>Lieu</span>
                          <span style={cardMetaValueStyle}>{formatEventLocation(event)}</span>
                        </div>
                        <div style={cardMetaItemStyle}>
                          <span style={cardMetaLabelStyle}>Horaires</span>
                          <span style={cardMetaValueStyle}>{formatEventTimeRange(event)}</span>
                        </div>
                        <div style={cardMetaItemStyle}>
                          <span style={cardMetaLabelStyle}>Statut</span>
                          <span style={cardMetaValueStyle}>{statusLabel}</span>
                        </div>
                      </div>
                    </div>
                    <div style={cardStatusBlockStyle}>
                      {renderStatusChip(`Statut: ${statusLabel}`, statusLabel === 'Publié' ? '#28a745' : '#ff8ba0', statusLabel === 'Publié' ? 'rgba(40, 167, 69, 0.15)' : 'rgba(255, 65, 108, 0.12)')}
                      {renderStatusChip(`Complet • ${participantsRatio}`, '#64748B', 'rgba(0, 0, 0, 0.06)')}
                      {renderOrganizerActions(event, 'full')}
                    </div>
                  </div>
                );
              })}
              {completedUpcomingEvents.length > ITEMS_PER_PAGE && (
                <div style={paginationControlsStyle}>
                  <button
                    style={paginationButtonStyle}
                    disabled={completedPage === 1}
                    onClick={() => setCompletedPage(prev => Math.max(1, prev - 1))}
                  >
                    Précédent
                  </button>
                  <span style={paginationInfoStyle}>
                    Page {Math.min(completedPage, totalCompletedPages)} / {Math.max(totalCompletedPages, 1)}
                  </span>
                  <button
                    style={paginationButtonStyle}
                    disabled={completedPage >= totalCompletedPages}
                    onClick={() => setCompletedPage(prev => Math.min(totalCompletedPages, prev + 1))}
                  >
                    Suivant
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {showArchivedSection && (
        <div ref={archivedSectionRef} style={sectionStyle}>
          <h2 style={sectionTitleStyle}>Évènements archivés</h2>
          {eventsLoading && <p style={emptyStateStyle}>Chargement des évènements...</p>}
          {eventsError && <p style={{ ...emptyStateStyle, color: '#dc3545' }}>Erreur: {eventsErrorMessage?.message}</p>}
          {!eventsLoading && !eventsError && archivedEventsToShow.length === 0 && (
            <p style={emptyStateStyle}>Aucun évènement archivé.</p>
          )}
          {paginatedArchivedEvents.map((event) => {
            const participantsRatio = getParticipantsRatio(event);
            const statusLabel = translateEventStatus(event.status);
            const isFutureButArchived = new Date(event.date) >= new Date();

            return (
              <div key={event._id} style={eventCardStyle} onClick={() => handleCardClick(event)}>
                <div style={cardContentStyle}>
                  <div style={cardHeaderRowStyle}>
                    <div>
                      <h3 style={eventTitleStyle}>{event.title}</h3>
                    </div>
                    <span style={cardDateBadgeStyle}>{new Date(event.date).toLocaleDateString()}</span>
                  </div>
                  <div style={cardMetaGridStyle}>
                    <div style={cardMetaItemStyle}>
                      <span style={cardMetaLabelStyle}>Lieu</span>
                      <span style={cardMetaValueStyle}>{formatEventLocation(event)}</span>
                    </div>
                    <div style={cardMetaItemStyle}>
                      <span style={cardMetaLabelStyle}>Horaires</span>
                      <span style={cardMetaValueStyle}>{formatEventTimeRange(event)}</span>
                    </div>
                  </div>
                </div>
                <div style={cardStatusBlockStyle}>
                  {renderStatusChip(`Statut: ${statusLabel}`, '#4dd0e1', 'rgba(77, 208, 225, 0.18)')}
                  {renderStatusChip(`Participants: ${participantsRatio}`, '#9b8bff', 'rgba(155, 139, 255, 0.18)')}
                  {isFutureButArchived && renderStatusChip('Évènement futur classé en archive', '#ffc107', 'rgba(255, 193, 7, 0.18)')}
                  {renderOrganizerActions(event, 'archived')}
                </div>
              </div>
            );
          })}
          {archivedEventsToShow.length > ITEMS_PER_PAGE && (
            <div style={paginationControlsStyle}>
              <button
                style={paginationButtonStyle}
                disabled={archivedPage === 1}
                onClick={() => setArchivedPage(prev => Math.max(1, prev - 1))}
              >
                Précédent
              </button>
              <span style={paginationInfoStyle}>
                Page {Math.min(archivedPage, totalArchivedPages)} / {Math.max(totalArchivedPages, 1)}
              </span>
              <button
                style={paginationButtonStyle}
                disabled={archivedPage >= totalArchivedPages}
                onClick={() => setArchivedPage(prev => Math.min(totalArchivedPages, prev + 1))}
              >
                Suivant
              </button>
            </div>
          )}
        </div>
      )}

      <EventDetailModal
        isOpen={isModalOpen}
        onClose={closeModal}
        event={selectedEvent}
        user={user}
        eventAbsences={eventAbsences}
        onAbsenceClick={handleAbsenceClick}
        onComedianClick={handleComedianClick}
        participantsSectionRef={participantsSectionRef}
      />

      <Modal isOpen={showEditEventForm} onClose={() => setShowEditEventForm(false)} title="Modifier l'évènement" closeOnOverlayClick={false}>
        {eventToEdit && (
          <EditEventForm
            eventToEdit={eventToEdit}
            onClose={() => setShowEditEventForm(false)}
            onEventUpdated={handleEventUpdated}
          />
        )}
      </Modal>

      <Modal isOpen={showCreateEventForm && user?.role === 'ORGANIZER'} onClose={() => { setShowCreateEventForm(false); setEventToDuplicate(null); }} title={eventToDuplicate ? "Dupliquer l'évènement" : "Créer un évènement"} closeOnOverlayClick={false} transparentOverlay>
        {showCreateEventForm && user?.role === 'ORGANIZER' && (
          <CreateEventForm 
            onClose={() => { setShowCreateEventForm(false); setEventToDuplicate(null); }} 
            onEventCreated={handleEventCreated}
            initialData={eventToDuplicate ? {
              title: eventToDuplicate.title,
              description: eventToDuplicate.description,
              city: eventToDuplicate.location?.city || '',
              postalCode: (eventToDuplicate.location as any)?.postalCode || '',
              address: eventToDuplicate.location?.address || '',
              country: eventToDuplicate.location?.country || '',
              date: eventToDuplicate.date,
              venue: eventToDuplicate.location?.venue || '',
              venueType: eventToDuplicate.location?.venueType || '',
              maxSpectators: eventToDuplicate.maxSpectators,
              startTime: eventToDuplicate.startTime || '',
              endTime: eventToDuplicate.endTime || '',
              minExperience: eventToDuplicate.requirements?.minExperience,
              maxComedians: eventToDuplicate.requirements?.maxPerformers,
              imageUrl: eventToDuplicate.imageUrl || '',
            } : undefined}
          />
        )}
      </Modal>

      {/* Section Évènements annulés */}
      {showCancelledSection && (
        <div ref={cancelledSectionRef} style={sectionStyle}>
          <h2 style={sectionTitleStyle}>Évènements annulés</h2>
          {eventsLoading && <p style={emptyStateStyle}>Chargement des évènements...</p>}
          {eventsError && <p style={{ ...emptyStateStyle, color: '#dc3545' }}>Erreur: {eventsErrorMessage?.message}</p>}
          {!eventsLoading && !eventsError && cancelledEvents.length === 0 && (
            <p style={emptyStateStyle}>Aucun évènement annulé.</p>
          )}
          {paginatedCancelledEvents.map((event) => {
            const statusLabel = translateEventStatus(event.status);
            const reason = event.cancellationReason;

            return (
              <div key={event._id} style={{ ...eventCardStyle, ...eventCardStyleCancelled }} onClick={() => handleCardClick(event)}>
                <div style={cardContentStyle}>
                  <div style={cardHeaderRowStyle}>
                    <div>
                      <h3 style={eventTitleStyle}>{event.title}</h3>
                    </div>
                    <span style={cardDateBadgeStyle}>{new Date(event.date).toLocaleDateString()}</span>
                  </div>
                  <div style={cardMetaGridStyle}>
                    <div style={cardMetaItemStyle}>
                      <span style={cardMetaLabelStyle}>Lieu</span>
                      <span style={cardMetaValueStyle}>{formatEventLocation(event)}</span>
                    </div>
                    <div style={cardMetaItemStyle}>
                      <span style={cardMetaLabelStyle}>Horaires</span>
                      <span style={cardMetaValueStyle}>{formatEventTimeRange(event)}</span>
                    </div>
                  </div>
                  {reason && (
                    <p style={{ ...eventDetailStyle, marginTop: 8, color: '#b71c1c' }}>
                      <span style={{ fontWeight: 'bold', color: '#c62828' }}>Raison:</span> {reason}
                    </p>
                  )}
                </div>
                <div style={cardStatusBlockStyle}>
                  {renderStatusChip(`Statut: ${statusLabel}`, '#dc3545', 'rgba(220, 53, 69, 0.18)')}
                </div>
              </div>
            );
          })}
          {cancelledEvents.length > ITEMS_PER_PAGE && (
            <div style={paginationControlsStyle}>
              <button
                style={paginationButtonStyle}
                disabled={cancelledPage === 1}
                onClick={() => setCancelledPage(prev => Math.max(1, prev - 1))}
              >
                Précédent
              </button>
              <span style={paginationInfoStyle}>
                Page {Math.min(cancelledPage, totalCancelledPages)} / {Math.max(totalCancelledPages, 1)}
              </span>
              <button
                style={paginationButtonStyle}
                disabled={cancelledPage >= totalCancelledPages}
                onClick={() => setCancelledPage(prev => Math.min(totalCancelledPages, prev + 1))}
              >
                Suivant
              </button>
            </div>
          )}
        </div>
      )}

      {/* Section Calendrier */}
      {showCalendarSection && (
        <div style={sectionStyle}>
          <h2 style={sectionTitleStyle}>Calendrier des évènements</h2>
          <EventCalendar
            events={[...upcomingEvents, ...archivedEventsToShow, ...cancelledEvents]}
            onEventClick={handleCardClick}
            useInternalModal={false}
          />
        </div>
      )}

      {/* Section Humoristes favoris */}
      {showFavoriteComediansSection && (
        <div style={sectionStyle}>
          <h2 style={sectionTitleStyle}>Humoristes favoris</h2>
          {favoriteComediansData?.favorites && favoriteComediansData.favorites.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '20px' }}>
              {favoriteComediansData.favorites.map((comedian: any) => (
                <div
                  key={comedian._id || comedian.id}
                  onClick={() => {
                    setSelectedComedian({
                      id: comedian._id || comedian.id,
                      firstName: comedian.firstName,
                      lastName: comedian.lastName,
                      email: comedian.email,
                      phone: comedian.phone,
                      stageName: comedian.stageName,
                      bio: comedian.bio,
                      numberOfScenes: comedian.numberOfScenes || comedian.profile?.numberOfScenes,
                      comedyStyle: comedian.comedyStyle || comedian.profile?.comedyStyle,
                      performanceLanguages: comedian.performanceLanguages || comedian.profile?.performanceLanguages,
                      mobilityZone: comedian.mobilityZone || comedian.profile?.mobilityZone,
                      socialLinks: comedian.socialLinks || comedian.profile?.socialLinks,
                      stats: comedian.stats
                    });
                    setIsComedianModalOpen(true);
                  }}
                  style={{
                    padding: '15px',
                    backgroundColor: 'rgba(0, 0, 0, 0.4)',
                    borderRadius: '8px',
                    border: '1px solid #444',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(40, 167, 69, 0.2)';
                    e.currentTarget.style.borderColor = '#28a745';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.4)';
                    e.currentTarget.style.borderColor = '#444';
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '5px' }}>
                        <h5 style={{ color: '#ffffff', margin: 0, fontSize: '16px' }}>
                          {comedian.stageName || `${comedian.firstName} ${comedian.lastName}`}
                        </h5>
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            await toggleFavoriteComedian(comedian._id || comedian.id);
                            await refetchFavoriteComedians();
                          }}
                          style={{
                            border: 'none',
                            background: 'transparent',
                            color: '#ffd700',
                            fontSize: '1.3em',
                            cursor: 'pointer',
                            transition: 'color 0.2s ease, transform 0.2s ease',
                            padding: 0,
                            lineHeight: 1,
                          }}
                          title="Retirer des favoris"
                          onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'scale(1.2)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'scale(1)';
                          }}
                        >
                          ⭐
                        </button>
                      </div>
                      {comedian.stageName && (
                        <p style={{ color: '#aaa', margin: '0 0 5px 0', fontSize: '13px' }}>
                          {comedian.firstName} {comedian.lastName}
                        </p>
                      )}
                      {(comedian.mobilityZone || comedian.profile?.mobilityZone) && 
                       (comedian.mobilityZone || comedian.profile?.mobilityZone).length > 0 && (
                        <p style={{ color: '#888', margin: '0', fontSize: '13px' }}>
                          🚗 Zones : {(comedian.mobilityZone || comedian.profile?.mobilityZone).map((z: any) => z.value).join(', ')}
                        </p>
                      )}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '5px' }}>
                      {(comedian.numberOfScenes || comedian.profile?.numberOfScenes) && (
                        <span
                          style={{
                            padding: '4px 10px',
                            borderRadius: '12px',
                            fontSize: '15px',
                            backgroundColor: 'rgba(255, 193, 7, 0.3)',
                            color: '#ffc107'
                          }}
                        >
                          {(comedian.numberOfScenes || comedian.profile?.numberOfScenes) === '200+' ? 'Pro' : 
                           (comedian.numberOfScenes || comedian.profile?.numberOfScenes) === '50-200' ? 'Expérimenté' : 'Débutant'}
                        </span>
                      )}
                    </div>
                  </div>
                  {(comedian.comedyStyle || comedian.profile?.comedyStyle) && 
                   (comedian.comedyStyle || comedian.profile?.comedyStyle).length > 0 && (
                    <div style={{ marginTop: '10px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      {(comedian.comedyStyle || comedian.profile?.comedyStyle).map((style: string, idx: number) => (
                        <span
                          key={idx}
                          style={{
                            padding: '3px 8px',
                            borderRadius: '10px',
                            fontSize: '15px',
                            backgroundColor: 'rgba(102, 126, 234, 0.2)',
                            color: '#667eea'
                          }}
                        >
                          {style}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: '#aaa', marginTop: '20px', textAlign: 'center' }}>
              Aucun humoriste en favoris pour le moment. Utilisez la recherche d'humoristes pour en ajouter.
            </p>
          )}
        </div>
      )}

      {/* Section Événements récurrents */}
      {showRecurringEventsSection && (
        <div style={sectionStyle}>
          <h2 style={sectionTitleStyle}>Événements récurrents</h2>
          {selectedRecurrenceGroupId ? (
            <>
              <button
                type="button"
                onClick={() => setSelectedRecurrenceGroupId(null)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginBottom: '20px',
                  padding: '10px 16px',
                  borderRadius: '8px',
                  border: '1px solid rgba(255, 255, 255, 0.3)',
                  background: 'rgba(255, 255, 255, 0.08)',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 600,
                }}
              >
                ← Retour aux groupes
              </button>
              {(() => {
                const eventsInGroup = recurringGroups.get(selectedRecurrenceGroupId) || [];
                const firstEvent = eventsInGroup[0];
                if (eventsInGroup.length === 0) return <p style={emptyStateStyle}>Groupe introuvable.</p>;
                return (
                  <>
                    <div style={{ marginBottom: '20px', padding: '16px', ...eventCardStyle }}>
                      <h3 style={{ margin: '0 0 8px 0', color: '#1a1a1a', fontSize: '1.2em' }}>{firstEvent?.title}</h3>
                      <p style={{ margin: 0, color: '#64748B', fontSize: '0.9em' }}>
                        {firstEvent?.location?.venue} — {firstEvent?.location?.city} · {eventsInGroup.length} date(s)
                      </p>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {eventsInGroup.map((event) => {
                        const dateStr = typeof event.date === 'string' ? event.date : (event.date as any)?.toString?.() || '';
                        const dateFormatted = dateStr ? new Date(dateStr).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' }) : '';
                        const timeStr = event.startTime && event.endTime ? `${event.startTime} – ${event.endTime}` : '';
                        const participantsCount = event.participants?.length ?? 0;
                        const maxP = event.requirements?.maxPerformers ?? event.maxParticipants ?? 0;
                        const isDateComplete = maxP > 0 && participantsCount >= maxP;
                        const status = event.status === 'CANCELLED' || event.status === 'cancelled' ? 'Annulé' : event.status === 'COMPLETED' || event.status === 'completed' ? 'Terminé' : 'Publié';
                        return (
                          <div
                            key={event._id}
                            onClick={() => handleCardClick(event)}
                            style={{
                              ...eventCardStyle,
                              ...(isDateComplete ? eventCardStyleComplete : {}),
                              padding: '16px',
                              display: 'flex',
                              flexDirection: isMobile ? 'column' : 'row',
                              alignItems: isMobile ? 'flex-start' : 'center',
                              justifyContent: 'space-between',
                              gap: '12px',
                            }}
                          >
                            <div style={{ flex: 1 }}>
                              <div style={{ ...cardDateBadgeStyle, marginBottom: '8px', display: 'inline-block' }}>{dateFormatted}</div>
                              <div style={{ color: '#1a1a1a', fontWeight: 600, marginBottom: '4px' }}>{timeStr}</div>
                              <div style={{ color: '#64748B', fontSize: '0.9em' }}>
                                {event.location?.venue} · {event.location?.city}
                              </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                              <span style={{ ...statusBadgeStyle, opacity: (event.status === 'CANCELLED' || event.status === 'cancelled') ? 0.7 : 1 }}>
                                {status}
                              </span>
                              <span style={{ color: '#64748B', fontSize: '0.9em' }}>
                                {participantsCount}/{maxP} humoristes
                              </span>
                              {user?.role === 'ORGANIZER' && renderOrganizerActions(event, 'upcoming')}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                );
              })()}
            </>
          ) : (
            <>
              {recurringGroups.size > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '20px' }}>
                  {Array.from(recurringGroups.entries()).map(([groupId, events]) => {
                    const first = events[0];
                    const last = events[events.length - 1];
                    const dateFirst = first?.date ? new Date(first.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
                    const dateLast = last?.date ? new Date(last.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
                    return (
                      <div
                        key={groupId}
                        onClick={() => setSelectedRecurrenceGroupId(groupId)}
                        style={{
                          ...eventCardStyle,
                          padding: '16px 20px',
                          cursor: 'pointer',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
                          <div>
                            <h3 style={{ margin: '0 0 6px 0', color: '#1a1a1a', fontSize: '1.1em' }}>{first?.title}</h3>
                            <p style={{ margin: 0, color: '#64748B', fontSize: '0.9em' }}>
                              {dateFirst} → {dateLast} · {events.length} date(s)
                            </p>
                            {first?.location?.city && (
                              <p style={{ margin: '4px 0 0 0', color: '#64748B', fontSize: '0.85em' }}>{first.location.venue} — {first.location.city}</p>
                            )}
                          </div>
                          <span style={{ ...cardDateBadgeStyle, flexShrink: 0 }}>{events.length} date(s)</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p style={{ color: '#aaa', marginTop: '20px', textAlign: 'center' }}>
                  Aucun événement récurrent. Les événements créés en série apparaîtront ici regroupés par groupe.
                </p>
              )}
            </>
          )}
        </div>
      )}

      {showApplyEventForm && user?.role === 'COMEDIAN' && selectedEvent && (
        <ApplyToEventForm
          event={selectedEvent}
          onClose={() => setShowApplyEventForm(false)}
          onApplicationSubmitted={handleApplicationSubmitted}
        />
      )}

      <ComedianDetailsModal
        isOpen={isComedianModalOpen}
        onClose={closeComedianModal}
        comedian={selectedComedian}
      />

      <AbsenceModal
        isOpen={isAbsenceModalOpen}
        onClose={closeAbsenceModal}
        comedianName={selectedAbsenceParticipant ? 
          `${selectedAbsenceParticipant.firstName} ${selectedAbsenceParticipant.lastName}` : 
          ''
        }
        eventTitle={selectedAbsenceParticipant?.eventTitle || ''}
        isAlreadyAbsent={selectedAbsenceParticipant ? 
          isParticipantAbsent(selectedAbsenceParticipant._id) : 
          false
        }
        existingReason={selectedAbsenceParticipant ? 
          eventAbsences.find(absence => absence.comedian._id === selectedAbsenceParticipant._id)?.reason : 
          undefined
        }
        onMarkAbsent={handleMarkAbsent}
        onCancelAbsence={handleCancelAbsence}
      />

      {/* Modal d'annulation d'évènement avec raison */}
      <Modal isOpen={showCancelModal} onClose={() => { setShowCancelModal(false); setEventToCancel(null); setEventsGroupToCancel(null); setCancelReason(''); }} title={eventsGroupToCancel?.length ? "Annuler le groupe d'événements" : "Annuler l'évènement"}>
        <div>
          <p style={{ marginBottom: 12, color: '#ddd' }}>
            {(() => {
              const eventsToCheck = eventsGroupToCancel?.length ? eventsGroupToCancel : (eventToCancel ? [eventToCancel] : []);
              if (eventsToCheck.length === 0) return "";
              const now = new Date();
              const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
              const needReason = eventsToCheck.some((ev) => {
                const eventDate = new Date(ev.date);
                const eventMidnight = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate());
                const diffDays = Math.ceil((eventMidnight.getTime() - todayMidnight.getTime()) / (1000 * 60 * 60 * 24));
                return diffDays < 10;
              });
              return needReason
                ? (eventsGroupToCancel?.length ? "Veuillez indiquer la raison de l'annulation (obligatoire car au moins un évènement du groupe est dans moins de 10 jours)." : "Veuillez indiquer la raison de l'annulation (obligatoire car l'évènement est dans moins de 10 jours).")
                : "Vous pouvez indiquer une raison (facultatif).";
            })()}
          </p>
          <textarea
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            placeholder="Raison de l'annulation"
            style={{ width: '100%', minHeight: 80, padding: 10, borderRadius: 6, border: '1px solid #555', background: 'rgba(0,0,0,0.4)', color: '#fff' }}
          />
          <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button onClick={() => setShowCancelModal(false)} style={{ ...actionButtonStyleSmall, backgroundColor: '#6c757d' }}>
              Fermer
            </button>
            <button onClick={confirmCancelEvent} style={{ ...actionButtonStyleSmall, background: 'linear-gradient(to right, #ff416c, #ff4b2b)' }}>
              Confirmer l'annulation
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal Voir les notes (organisateur - événements archivés) */}
      <RatingsSummaryModal
        event={ratingsModalEvent}
        onClose={() => setRatingsModalEvent(null)}
      />

      {/* Modal Voir spectateurs */}
      <Modal
        isOpen={!!spectatorsModalEvent}
        onClose={() => setSpectatorsModalEvent(null)}
      >
        {spectatorsModalEvent && (
          <div>
            <h2 style={{ margin: '0 0 16px 0', fontSize: '1.25em', color: '#fff' }}>
              Spectateurs — {spectatorsModalEvent.title}
            </h2>
            {(() => {
              const regs = spectatorsModalEvent.spectatorRegistrations || [];
              const max = spectatorsModalEvent.maxSpectators;
              const count = Array.isArray(regs) ? regs.length : 0;
              const placesLeft = max != null && typeof max === 'number' ? Math.max(0, max - count) : null;
              return (
                <>
                  <p style={{ marginBottom: 16, color: '#22c55e', fontSize: '1em' }}>
                    <strong>{count}</strong> personne{count !== 1 ? 's' : ''} inscrite{count !== 1 ? 's' : ''}
                    {placesLeft !== null && (
                      <span style={{ color: '#ddd' }}> · <strong>{placesLeft}</strong> place{placesLeft !== 1 ? 's' : ''} restante{placesLeft !== 1 ? 's' : ''}</span>
                    )}
                  </p>
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0, maxHeight: 320, overflowY: 'auto' }}>
                    {regs.map((reg, i) => {
                      const name = reg && typeof reg === 'object' && 'firstName' in reg && 'lastName' in reg
                        ? `${(reg as { firstName: string; lastName: string }).firstName} ${(reg as { lastName: string }).lastName}`
                        : '—';
                      return (
                        <li key={i} style={{ padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.08)', color: '#fff' }}>
                          {name}
                        </li>
                      );
                    })}
                  </ul>
                  {regs.length === 0 && (
                    <p style={{ color: '#888', marginTop: 8 }}>Aucun spectateur inscrit pour le moment.</p>
                  )}
                </>
              );
            })()}
          </div>
        )}
      </Modal>

      {/* Modal d'invitation d'humoriste */}
      <Modal isOpen={showInviteModal} onClose={() => setShowInviteModal(false)} title="Inviter un humoriste">
        <div>
          {comedianToInvite && (
            <>
              <p style={{ marginBottom: 16, color: '#ddd' }}>
                Inviter <strong>{comedianToInvite.stageName || `${comedianToInvite.firstName} ${comedianToInvite.lastName}`}</strong> à postuler pour un de vos événements :
              </p>

              <select
                value={selectedEventForInvite}
                onChange={(e) => setSelectedEventForInvite(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: '8px',
                  border: '1px solid #555',
                  backgroundColor: 'rgba(0, 0, 0, 0.6)',
                  color: '#fff',
                  marginBottom: '16px',
                }}
              >
                <option value="">-- Choisir un événement --</option>
                {upcomingEvents
                  .filter(event => event.status === 'PUBLISHED' || event.status === 'published')
                  .map(event => (
                    <option key={event._id} value={event._id}>
                      {event.title} - {new Date(event.date).toLocaleDateString('fr-FR')}
                    </option>
                  ))
                }
              </select>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                <button
                  onClick={() => setShowInviteModal(false)}
                  style={{ ...actionButtonStyleSmall, backgroundColor: '#6c757d' }}
                >
                  Annuler
                </button>
                <button
                  onClick={handleInviteComedian}
                  disabled={!selectedEventForInvite || isInviting}
                  style={{
                    ...actionButtonStyleSmall,
                    background: selectedEventForInvite && !isInviting ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : '#555',
                    cursor: selectedEventForInvite && !isInviting ? 'pointer' : 'not-allowed',
                  }}
                >
                  {isInviting ? 'Envoi...' : 'Envoyer l\'invitation'}
                </button>
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* Modal de confirmation de retrait */}
      {showWithdrawModal && eventToWithdraw && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={(e) => e.target === e.currentTarget && closeWithdrawModal()}
        >
          <div style={{
            backgroundColor: '#1a1a2e',
            borderRadius: '12px',
            padding: '24px',
            maxWidth: '500px',
            width: '90%',
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
          }}>
            {/* Header avec titre et bouton X */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '20px',
            }}>
              <h2 style={{
                fontSize: '20px',
                fontWeight: '600',
                color: '#fff',
                margin: 0,
              }}>
                Retirer votre candidature
              </h2>
              <button
                onClick={closeWithdrawModal}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#999',
                  cursor: 'pointer',
                  fontSize: '20px',
                  padding: '4px 8px',
                  borderRadius: '6px',
                  transition: 'all 0.2s',
                }}
                aria-label="Fermer"
              >
                ✕
              </button>
            </div>

            {/* Message principal */}
            <p style={{
              color: '#ccc',
              fontSize: '15px',
              lineHeight: '1.6',
              margin: '0 0 12px 0',
            }}>
              Êtes-vous sûr de vouloir retirer votre candidature pour l'évènement <strong style={{ color: '#fff' }}>"{eventToWithdraw.title}"</strong> ?
            </p>

            {/* Avertissement */}
            <p style={{
              color: '#ff6b6b',
              fontSize: '14px',
              margin: '0 0 24px 0',
              padding: '10px 12px',
              backgroundColor: 'rgba(220, 53, 69, 0.15)',
              borderRadius: '8px',
              border: '1px solid rgba(220, 53, 69, 0.3)',
            }}>
              ⚠️ Cette action est définitive.
            </p>

            {/* Boutons d'action */}
            <div style={{
              display: 'flex',
              gap: '12px',
              justifyContent: 'flex-end',
            }}>
              <button
                onClick={closeWithdrawModal}
                style={{
                  padding: '10px 24px',
                  borderRadius: '8px',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  backgroundColor: 'rgba(255, 255, 255, 0.1)',
                  color: '#fff',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  fontSize: '14px',
                }}
              >
                Annuler
              </button>
              <button
                onClick={confirmWithdrawApplication}
                style={{
                  padding: '10px 24px',
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: '#dc3545',
                  color: '#fff',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  fontSize: '14px',
                }}
              >
                ✕ Confirmer le retrait
              </button>
            </div>
          </div>
        </div>
      )}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog({ ...confirmDialog, isOpen: false })}
        isDangerous={confirmDialog.isDangerous}
        confirmText="Confirmer"
        cancelText="Annuler"
      />
    </div>
  );
}

export default MyEventsPage; 