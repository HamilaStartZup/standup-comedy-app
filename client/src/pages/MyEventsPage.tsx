import { type CSSProperties, useState, useMemo, useEffect, useRef, useCallback } from 'react';
import Navbar from '../components/Navbar';
import Pagination from '../components/Pagination';
import { useUserEvents } from '../hooks/useUserEvents';
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
import { FRENCH_REGIONS, FRENCH_DEPARTMENTS, DEPARTMENTS_ORDER } from '../utils/geographicMatching';
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
type RecommendationItem = {
  event: IEvent;
  score: number;
  breakdown?: { geographic: number; experienceLevel: number; experienceYears: number };
  matchReasons?: string[];
};
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
        <h2 style={{ margin: '0 0 16px 0', fontSize: '1.25em', color: 'var(--ccc-text-primary)' }}>
          Notes — {event.title}
        </h2>
        {isLoading && <p style={{ color: 'var(--ccc-text-muted)' }}>Chargement des notes…</p>}
        {error && <p style={{ color: 'var(--ccc-error)' }}>Impossible de charger les notes.</p>}
        {data && !isLoading && (
          <>
            <div style={{ marginBottom: 20, padding: '16px', background: 'var(--ccc-bg-surface)', borderRadius: 'var(--ccc-radius-md)' }}>
              <div style={{ marginBottom: 12, color: 'var(--ccc-text-primary)', fontSize: '0.95em' }}>
                <span style={{ color: 'var(--ccc-text-muted)' }}>Moyenne par événement</span>
                <div style={{ color: '#FFD700', fontWeight: 600, fontSize: '1.2em', marginTop: 4 }}>
                  {data.averageEventRating != null ? `${data.averageEventRating}/5` : '—'}
                </div>
              </div>
              <div style={{ marginBottom: 12, color: 'var(--ccc-text-primary)', fontSize: '0.95em' }}>
                <span style={{ color: 'var(--ccc-text-muted)' }}>Nombre total d&apos;avis</span>
                <div style={{ color: 'var(--ccc-text-primary)', fontWeight: 600, fontSize: '1.2em', marginTop: 4 }}>
                  {data.totalRatings}
                </div>
              </div>
            </div>
            <h3 style={{ margin: '0 0 10px 0', fontSize: '1em', color: 'var(--ccc-text-secondary)' }}>Moyenne par humoriste</h3>
            {data.comedianRatings.length > 0 ? (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, maxHeight: 260, overflowY: 'auto' }}>
                {data.comedianRatings.map((cr: RatingsSummaryData['comedianRatings'][number]) => (
                  <li
                    key={cr.comedianId}
                    style={{
                      padding: '10px 0',
                      borderBottom: `1px solid var(--ccc-border-subtle)`,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 12,
                    }}
                  >
                    <span style={{ color: 'var(--ccc-text-primary)' }}>
                      {cr.firstName} {cr.lastName}
                    </span>
                    <span style={{ color: '#FFD700', fontWeight: 600 }}>
                      {cr.averageRating != null ? `${cr.averageRating}/5` : '—'} ({cr.ratingCount} avis)
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p style={{ color: 'var(--ccc-text-muted)', margin: 0 }}>Aucun humoriste à afficher.</p>
            )}
            {data.totalRatings === 0 && (
              <p style={{ color: 'var(--ccc-text-muted)', marginTop: 12 }}>Aucune notation pour cet événement.</p>
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
  const { data: eventFavoritesData, refetch: refetchEventFavorites, isError: eventFavoritesError, isLoading: eventFavoritesLoading } = useQuery<{ favorites: IEvent[] }, Error>({
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
      const favoriteIds = eventFavoritesData.favorites.map((event: IEvent) => event._id);
      setFavoriteEventIds(favoriteIds);
    } else if (!isComedianView) {
      setFavoriteEventIds([]);
    }
  }, [eventFavoritesData, isComedianView]);

  // Charger les humoristes favoris (pour les organisateurs) avec React Query
  const { data: favoriteComediansData, refetch: refetchFavoriteComedians, isError: favoriteComediansError, isLoading: favoriteComediansLoading } = useQuery<{ favorites: any[] }, Error>({
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
  const [hoveredActionsButtonId, setHoveredActionsButtonId] = useState<string | null>(null);
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
  const [isCancelling, setIsCancelling] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [upcomingPage, setUpcomingPage] = useState(1);
  const [eventsPage] = useState(1);
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

  const isOrganizerRole = user?.role === 'ORGANIZER';
  // 'full' is a capacity-derived view (no DB status), so we don't filter it server-side
  const activeStatusFilter = (() => {
    if (!isOrganizerRole) return undefined;
    switch (organizerTab) {
      case 'archived': return 'completed';
      case 'cancelled': return 'cancelled';
      case 'upcoming': return 'published';
      default: return undefined;
    }
  })();
  const activePage = (() => {
    if (!isOrganizerRole) return eventsPage;
    switch (organizerTab) {
      case 'archived': return archivedPage;
      case 'cancelled': return cancelledPage;
      case 'upcoming': return upcomingPage;
      default: return eventsPage;
    }
  })();
  const orgServerStatusTab = isOrganizerRole && (organizerTab === 'upcoming' || organizerTab === 'archived' || organizerTab === 'cancelled');

  const eventsZone = isOrganizerRole
    ? (organizerEventZoneSearch.trim() || undefined)
    : (locationSearch.trim() || undefined);
  const eventsExperienceLevel = isOrganizerRole
    ? (organizerEventExperienceFilter !== 'all' ? organizerEventExperienceFilter : undefined)
    : (experienceFilter !== 'all' ? experienceFilter : undefined);

  const { data: userEventsData, isLoading: eventsLoading, isError: eventsError, error: eventsErrorMessage, refetch } = useUserEvents({
    page: activePage,
    limit: isOrganizerRole ? (orgServerStatusTab ? ITEMS_PER_PAGE : 100) : 20,
    status: activeStatusFilter,
    zone: eventsZone,
    experienceLevel: eventsExperienceLevel,
  });
  const fetchedEvents: IEvent[] = userEventsData?.events ?? [];
  const serverEventsPagination = userEventsData?.pagination ?? null;

  // Compteurs globaux par statut (organizer + super admin) — limit:1, on lit pagination.total.
  // Évite que le compteur du tab reflète seulement la page courante.
  const needsStatusCounts = isOrganizerRole || isSuperAdminView;
  const { data: upcomingCountData } = useUserEvents({ page: 1, limit: 1, status: 'published', zone: eventsZone, experienceLevel: eventsExperienceLevel, enabled: needsStatusCounts });
  const { data: archivedCountData } = useUserEvents({ page: 1, limit: 1, status: 'completed', zone: eventsZone, experienceLevel: eventsExperienceLevel, enabled: needsStatusCounts });
  const { data: cancelledCountData } = useUserEvents({ page: 1, limit: 1, status: 'cancelled', zone: eventsZone, experienceLevel: eventsExperienceLevel, enabled: needsStatusCounts });
  const upcomingTotal = upcomingCountData?.pagination?.total ?? null;
  const archivedTotal = archivedCountData?.pagination?.total ?? null;
  const cancelledTotal = cancelledCountData?.pagination?.total ?? null;

  // Fetch dédié des events récurrents (organizer) — indépendant du tab actif.
  // Sinon `recurringGroups` n'est rempli que lorsqu'on est sur l'onglet "récurrents"
  // et le compteur affiche 0 tant qu'on n'y a pas cliqué.
  const { data: recurringEventsData } = useUserEvents({
    page: 1,
    limit: 500,
    hasRecurrence: true,
    enabled: isOrganizerRole,
  });
  const recurringFetchedEvents: IEvent[] = recurringEventsData?.events ?? [];

  // Scroll + highlight de la carte event ciblée via ?focus= (clic depuis notif)
  useEffect(() => {
    const focusId = new URLSearchParams(location.search).get('focus');
    if (!focusId || eventsLoading || !fetchedEvents?.length) return;
    const timer = setTimeout(() => {
      const node = document.querySelector<HTMLElement>(`[data-event-id="${focusId}"]`);
      if (!node) return;
      node.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const previousOutline = node.style.outline;
      const previousOffset = node.style.outlineOffset;
      node.style.outline = `3px solid var(--ccc-accent)`;
      node.style.outlineOffset = '2px';
      setTimeout(() => {
        node.style.outline = previousOutline;
        node.style.outlineOffset = previousOffset;
      }, 2000);
    }, 300);
    return () => clearTimeout(timer);
  }, [location.search, eventsLoading, fetchedEvents]);

  // New useQuery for comedian's applications
  const { data: comedianApplications, isLoading: comedianApplicationsLoading, isError: comedianApplicationsError, error: comedianApplicationsErrorMessage, refetch: refetchComedianApplications } = useQuery<IApplication[], Error>({
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
  const { data: recommendationsData, isLoading: recommendationsLoading, isError: recommendationsError } = useQuery<{
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
  const { data: smartRecommendationsData, isLoading: smartRecommendationsLoading, isError: smartRecommendationsError, refetch: refetchSmartRecommendations } = useQuery<SmartRecommendationsResponse, Error>({
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
      smartRecommendationsData.recommendations.forEach((rec: SmartRecommendation) => {
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
    return smartRecommendationsData.recommendations.map((rec: SmartRecommendation) => rec.event);
  }, [smartRecommendationsData]);

  // Créer un Map des scores et détails par eventId pour un accès rapide
  const eventRecommendationMap = useMemo(() => {
    const map = new Map<string, {
      score: number;
      breakdown?: { geographic: number; experienceLevel: number; experienceYears: number };
      matchReasons?: string[];
    }>();
    if (recommendationsData?.recommendations) {
      recommendationsData.recommendations.forEach((rec: RecommendationItem) => {
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
    return recommendationsData.recommendations.map((rec: RecommendationItem) => ({
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
        cancelledSectionRef.current.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'start' 
        });
      } else if (statusFilters.includes('completed') && archivedSectionRef.current) {
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
      return new Set(comedianApplications.filter((app: IApplication) => app.event).map((app: IApplication) => app.event._id));
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
      comedianApplications.forEach((app: IApplication) => {
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
          }
          return matches;
        });
      }

      // Filtre par organisateur (pour super admin)
      if (user?.role === 'SUPER_ADMIN' && organizerFilter) {
        filteredEvents = filteredEvents.filter((event: IEvent) => {
          const eventOrganizerName = getOrganizerName(event.organizer);
          const matches = eventOrganizerName === organizerFilter;
          return matches;
        });
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
      
      
      // Sur les tabs server-paginés (organizer upcoming/archived/cancelled), le serveur
      // a déjà filtré par status — pas de re-classement par date sinon les items disparaissent
      // (ex: status='completed' mais endTime futur => bascule dans upcoming et trou de pagination).
      if (isOrganizerRole && orgServerStatusTab) {
        if (organizerTab === 'archived') {
          archived.push(...filteredEvents);
        } else if (organizerTab === 'cancelled') {
          cancelled.push(...filteredEvents);
        } else if (organizerTab === 'upcoming') {
          filteredEvents.forEach((event: IEvent) => {
            const isCancelled = (event.status === 'CANCELLED' || event.status === 'cancelled');
            if (isCancelled) cancelled.push(event);
            else upcoming.push(event);
          });
        }
      } else {
        filteredEvents.forEach((event: IEvent) => {
          // D'abord, isoler les évènements annulés pour qu'ils n'apparaissent pas ailleurs
          const isCancelled = (event.status === 'CANCELLED' || event.status === 'cancelled');
          if (isCancelled) {
            cancelled.push(event);
            return;
          }
          // **LOGIQUE UNIVERSELLE** : TOUS les évènements passés sont archivés
          const eventIsPast = isEventPast(event.date, event.endTime);
          if (eventIsPast) {
            archived.push(event);
          } else {
            upcoming.push(event);
          }
        });
      }
      

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
  }, [fetchedEvents, location.search, isOrganizerRole, orgServerStatusTab, organizerTab, user?._id, user?.role]);

  // Groupes d'événements récurrents (par recurrenceGroupId) pour l'organisateur.
  // Basé sur `recurringFetchedEvents` (fetch dédié hasRecurrence=true) et non
  // `fetchedEvents` qui dépend du tab actif — sinon compteur faussé.
  const recurringGroups = useMemo(() => {
    if (!Array.isArray(recurringFetchedEvents) || user?.role !== 'ORGANIZER' || !user?._id) return new Map<string, IEvent[]>();
    const map = new Map<string, IEvent[]>();
    recurringFetchedEvents.forEach((event: IEvent) => {
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
  }, [recurringFetchedEvents, user?._id, user?.role]);

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

  const totalCancelledPages = (isOrganizerRole && organizerTab === 'cancelled' && serverEventsPagination)
    ? Math.max(1, serverEventsPagination.totalPages)
    : Math.max(1, Math.ceil(cancelledEvents.length / ITEMS_PER_PAGE));
  const paginatedCancelledEvents = (isOrganizerRole && organizerTab === 'cancelled' && serverEventsPagination)
    ? cancelledEvents
    : cancelledEvents.slice(
        (cancelledPage - 1) * ITEMS_PER_PAGE,
        cancelledPage * ITEMS_PER_PAGE
      );

  useEffect(() => {
    if (!(isOrganizerRole && organizerTab === 'cancelled')) setCancelledPage(1);
  }, [cancelledEvents, isOrganizerRole, organizerTab]);

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

  const totalArchivedPages = (isOrganizerRole && organizerTab === 'archived' && serverEventsPagination)
    ? Math.max(1, serverEventsPagination.totalPages)
    : Math.max(1, Math.ceil(archivedEventsToShow.length / ITEMS_PER_PAGE));
  const paginatedArchivedEvents = (isOrganizerRole && organizerTab === 'archived' && serverEventsPagination)
    ? archivedEventsToShow
    : archivedEventsToShow.slice(
        (archivedPage - 1) * ITEMS_PER_PAGE,
        archivedPage * ITEMS_PER_PAGE
      );

  useEffect(() => {
    if (!(isOrganizerRole && organizerTab === 'archived')) setArchivedPage(1);
  }, [archivedEventsToShow, isOrganizerRole, organizerTab]);

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
        const app = comedianApplications.find((a: IApplication) => a.event && a.event._id === event._id);
        return app && app.status === 'ACCEPTED';
      });
      
      return filtered;
    }
    return [] as IEvent[];
  }, [user?.role, comedianApplications, upcomingEvents]);

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
        .filter((app: IApplication) => {
          const isPending = app.status === 'PENDING';
          const hasEvent = !!app.event;
          const eventStatus = app.event?.status?.toLowerCase();
          const isPublished = eventStatus === 'published';
          return isPending && hasEvent && isPublished;
        })
        .map((app: IApplication) => app.event as unknown as IEvent);
    }
    return [] as IEvent[];
  }, [comedianApplications, user?.role]);

  const rejectedApplicationEvents = useMemo(() => {
    if (user?.role === 'COMEDIAN' && comedianApplications) {
      return comedianApplications
        .filter((app: IApplication) => app.status === 'REJECTED' && app.event)
        .map((app: IApplication) => app.event as unknown as IEvent);
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
    
    return filtered;
  }, [isComedianView, favoriteEventIds, favoriteIdsSet, comedianVisibleEvents]);

  // Fonction de filtrage pour les humoristes (par lieu ET niveau d'expérience)
  // Utilise les événements de l'API principale avec les scores de l'API recommendations
  const getFilteredUpcomingEvents = useCallback(() => {
    // Utiliser les événements de l'API principale et y attacher les scores
    let base = upcomingEventsForApply.map(event => ({
      ...event,
      _recommendationScore: eventRecommendationMap.get(String(event._id))?.score ?? 0
    })) as (IEvent & { _recommendationScore: number })[];

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

  // Appliquer les filtres aux événements organisateur
  const filteredOrganizerUpcomingEvents = useMemo(() => {
    if (!isOrganizerView) return upcomingEvents;
    let base = upcomingEvents;
    if (completionFilter === 'complete') {
      base = base.filter(event => isEventComplete(event));
    } else if (completionFilter === 'incomplete') {
      base = base.filter(event => !isEventComplete(event));
    }
    return base;
  }, [isOrganizerView, upcomingEvents, completionFilter]);

  const filteredOrganizerCompletedEvents = useMemo(() => {
    if (!isOrganizerView) return completedUpcomingEvents;
    return completedUpcomingEvents;
  }, [isOrganizerView, completedUpcomingEvents]);

  const filteredOrganizerArchivedEvents = useMemo(() => {
    if (!isOrganizerView) return archivedEventsToShow;
    return archivedEventsToShow;
  }, [isOrganizerView, archivedEventsToShow]);

  const filteredOrganizerCancelledEvents = useMemo(() => {
    if (!isOrganizerView) return cancelledEvents;
    return cancelledEvents;
  }, [isOrganizerView, cancelledEvents]);

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
    upcoming: upcomingTotal ?? (isOrganizerView ? upcomingDisplayItems.length : filteredUpcomingEvents.length),
    full: completedUpcomingEvents.length,
    archived: archivedTotal ?? archivedEventsToShow.length,
    cancelled: cancelledTotal ?? cancelledEvents.length,
    calendar: (upcomingTotal ?? upcomingEvents.length) + (archivedTotal ?? archivedEventsToShow.length) + (cancelledTotal ?? cancelledEvents.length),
    favoriteComedians: favoriteComedianIds.length,
    recurringEvents: recurringGroups.size,
  }), [isOrganizerView, upcomingDisplayItems.length, filteredUpcomingEvents, completedUpcomingEvents, archivedEventsToShow, cancelledEvents, upcomingEvents, favoriteComedianIds, recurringGroups.size, upcomingTotal, archivedTotal, cancelledTotal]);

  const superAdminTabCounts: Record<SuperAdminTab, number> = useMemo(() => ({
    full: completedUpcomingEvents.length,
    upcoming: upcomingTotal ?? superAdminUpcomingDisplayItems.length,
    archived: archivedTotal ?? archivedEventsToShow.length,
    cancelled: cancelledTotal ?? cancelledEvents.length,
  }), [completedUpcomingEvents, superAdminUpcomingDisplayItems.length, archivedEventsToShow, cancelledEvents, upcomingTotal, archivedTotal, cancelledTotal]);

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
    ? (isRecommendationsTab ? smartRecommendationsLoading : (isFavoritesTab ? eventFavoritesLoading : (isOpportunitiesTab ? eventsLoading : comedianApplicationsLoading)))
    : eventsLoading;

  const listHasError = isComedianView
    ? (isRecommendationsTab ? smartRecommendationsError : (isFavoritesTab ? (eventsError || eventFavoritesError) : (isOpportunitiesTab ? eventsError : comedianApplicationsError)))
    : eventsError;

  const listErrorMessage = isComedianView
    ? (isRecommendationsTab ? 'Impossible de charger les recommandations.' : (isFavoritesTab ? eventsErrorMessage?.message : (isOpportunitiesTab ? eventsErrorMessage?.message : comedianApplicationsErrorMessage?.message)))
    : eventsErrorMessage?.message;

  const listRefetch = isComedianView
    ? (isRecommendationsTab ? refetchSmartRecommendations : (isFavoritesTab ? refetchEventFavorites : (isOpportunitiesTab ? refetch : refetchComedianApplications)))
    : refetch;

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
    const isActionsButtonHighlighted = isOpen || hoveredActionsButtonId === menuId;
    const handleMenuItemMouseEnter = (e: React.MouseEvent<HTMLButtonElement>, disabled?: boolean) => {
      if (!disabled) e.currentTarget.style.backgroundColor = 'var(--ccc-accent-soft)';
    };
    const handleMenuItemMouseLeave = (e: React.MouseEvent<HTMLButtonElement>) => {
      e.currentTarget.style.backgroundColor = 'transparent';
    };
    const menuItemStyle: CSSProperties = {
      display: 'block',
      width: '100%',
      padding: '10px 14px',
      border: 'none',
      background: 'transparent',
      color: 'var(--ccc-text-primary)',
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
          onMouseEnter={() => setHoveredActionsButtonId(menuId)}
          onMouseLeave={() => setHoveredActionsButtonId(null)}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '36px',
            height: '36px',
            padding: 0,
            borderRadius: 'var(--ccc-radius-sm)',
            border: `1px solid ${isActionsButtonHighlighted ? 'var(--ccc-accent-soft-border)' : 'var(--ccc-border-medium)'}`,
            background: isActionsButtonHighlighted ? 'var(--ccc-accent-soft)' : 'var(--ccc-bg-surface)',
            color: isActionsButtonHighlighted ? 'var(--ccc-accent)' : 'var(--ccc-text-primary)',
            cursor: 'pointer',
            boxShadow: isActionsButtonHighlighted ? 'var(--ccc-shadow-accent)' : 'none',
            transform: isActionsButtonHighlighted ? 'scale(1.05)' : 'scale(1)',
            transition: 'background-color 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease, transform 0.15s ease, color 0.2s ease',
          }}
          title="Actions"
          aria-label="Actions"
          aria-expanded={isOpen}
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
              backgroundColor: 'var(--ccc-bg-elevated)',
              border: `1px solid var(--ccc-border-subtle)`,
              borderRadius: 'var(--ccc-radius-md)',
              boxShadow: 'var(--ccc-shadow-dropdown)',
              zIndex: 1000,
              overflow: 'hidden',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {context === 'archived' ? (
              <>
                <button
                  type="button"
                  style={{ ...menuItemStyle, borderBottom: `1px solid var(--ccc-border-subtle)` }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenActionsEventId(null);
                    handleCardClick(event, true);
                  }}
                  onMouseEnter={(e) => handleMenuItemMouseEnter(e)}
                  onMouseLeave={handleMenuItemMouseLeave}
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
                  onMouseEnter={(e) => handleMenuItemMouseEnter(e)}
                  onMouseLeave={handleMenuItemMouseLeave}
                >
                  Voir les notes
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  style={{ ...menuItemStyle, borderBottom: `1px solid var(--ccc-border-subtle)` }}
                  onClick={(e) => {
                    e.stopPropagation();
                setOpenActionsEventId(null);
                  handleEditClick(event);
                  }}
                  onMouseEnter={(e) => handleMenuItemMouseEnter(e)}
                  onMouseLeave={handleMenuItemMouseLeave}
                >
                  Modifier
                </button>
                <button
                  type="button"
                  style={{ ...menuItemStyle, borderBottom: `1px solid var(--ccc-border-subtle)` }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenActionsEventId(null);
                    handleDuplicateClick(event);
                  }}
                  onMouseEnter={(e) => handleMenuItemMouseEnter(e)}
                  onMouseLeave={handleMenuItemMouseLeave}
                >
                  Dupliquer
                </button>
                <button
                  type="button"
                  style={{ ...menuItemStyle, borderBottom: `1px solid var(--ccc-border-subtle)` }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenActionsEventId(null);
                    handleNotifyHumorists(event);
                  }}
                  disabled={notifyingEventId === event._id}
                  onMouseEnter={(e) => handleMenuItemMouseEnter(e, notifyingEventId === event._id)}
                  onMouseLeave={handleMenuItemMouseLeave}
                >
                  {notifyingEventId === event._id ? 'Envoi...' : 'Notifier les humoristes'}
                </button>
                <button
                  type="button"
                  style={{ ...menuItemStyle, borderBottom: `1px solid var(--ccc-border-subtle)` }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenActionsEventId(null);
                    setSpectatorsModalEvent(event);
                  }}
                  onMouseEnter={(e) => handleMenuItemMouseEnter(e)}
                  onMouseLeave={handleMenuItemMouseLeave}
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
                  onMouseEnter={(e) => handleMenuItemMouseEnter(e)}
                  onMouseLeave={handleMenuItemMouseLeave}
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

  const totalUpcomingPages = (isOrganizerRole && organizerTab === 'upcoming' && serverEventsPagination)
    ? Math.max(1, serverEventsPagination.totalPages)
    : Math.max(1, Math.ceil(eventsToDisplay.length / ITEMS_PER_PAGE));
  const paginatedUpcomingEvents = (isOrganizerRole && organizerTab === 'upcoming' && serverEventsPagination)
    ? eventsToDisplay
    : eventsToDisplay.slice(
        (upcomingPage - 1) * ITEMS_PER_PAGE,
        upcomingPage * ITEMS_PER_PAGE
      );

  useEffect(() => {
    if (!(isOrganizerRole && organizerTab === 'upcoming')) setUpcomingPage(1);
  }, [eventsToDisplay, isOrganizerRole, organizerTab]);

  useEffect(() => {
    if (upcomingPage > totalUpcomingPages) {
      setUpcomingPage(totalUpcomingPages);
    }
  }, [upcomingPage, totalUpcomingPages]);

  const totalCompletedPages = (isOrganizerRole && organizerTab === 'full' && serverEventsPagination)
    ? Math.max(1, serverEventsPagination.totalPages)
    : Math.max(1, Math.ceil(completedUpcomingEvents.length / ITEMS_PER_PAGE));
  const paginatedCompletedEvents = (isOrganizerRole && organizerTab === 'full' && serverEventsPagination)
    ? completedUpcomingEvents
    : completedUpcomingEvents.slice(
        (completedPage - 1) * ITEMS_PER_PAGE,
        completedPage * ITEMS_PER_PAGE
      );

  useEffect(() => {
    if (!(isOrganizerRole && organizerTab === 'full')) setCompletedPage(1);
  }, [completedUpcomingEvents, isOrganizerRole, organizerTab]);

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
    if (!event._id) {
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
    setIsWithdrawing(true);
    try {
      const app = comedianApplications?.find((a: IApplication) => a.event && a.event._id === eventToWithdraw._id);
      if (!app) {
        return;
      }
      await api.delete(`/applications/${app._id}`);
      showSuccess(SuccessMessages.APPLICATION_UNSUBSCRIBED);
      refetch();
      refreshUser();
      queryClient.invalidateQueries({ queryKey: ['comedianApplications'] });
      closeWithdrawModal();
    } catch (error: any) {
      showError(getErrorMessage(error, ErrorMessages.APPLICATION_DELETE_FAILED));
    } finally {
      setIsWithdrawing(false);
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

    setIsCancelling(true);
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
      showError(err.response?.data?.message || err.message);
    } finally {
      setIsCancelling(false);
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
    color: 'var(--ccc-text-primary)',
    padding: '20px',
    background: 'var(--ccc-bg-gradient)',
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

  const titleStyle: CSSProperties = { fontSize: '2.5em', color: 'var(--ccc-accent)', fontWeight: 700, letterSpacing: '-0.02em' };

  const buttonStyle: CSSProperties = {
    padding: '10px 20px',
    borderRadius: 'var(--ccc-radius-sm)',
    border: 'none',
    background: 'var(--ccc-accent-gradient)',
    color: 'var(--ccc-text-on-accent)',
    fontSize: '1em',
    fontWeight: 'bold',
    cursor: 'pointer',
    transition: 'opacity 0.2s ease, transform 0.2s ease',
    boxShadow: 'var(--ccc-shadow-accent)',
  };

  const sectionStyle: CSSProperties = {
    maxWidth: '1200px',
    margin: '0 auto 40px auto',
    padding: '20px',
  };

  const filterSectionWrapStyle: CSSProperties = {
    maxWidth: '1200px',
    margin: '0 auto 20px auto',
    padding: '0 20px',
  };

  const filterLabelStyle: CSSProperties = {
    display: 'block',
    color: 'var(--ccc-text-primary)',
    marginBottom: '8px',
    fontWeight: 'bold',
    fontSize: '14px',
  };

  /** Même surface visuelle que les cartes évènement à venir */
  const eventCardSurfaceStyle: CSSProperties = {
    backgroundColor: 'var(--ccc-card-default)',
    borderRadius: 'var(--ccc-radius-md)',
    boxShadow: 'var(--ccc-shadow-sm)',
    border: `1px solid var(--ccc-border-on-card)`,
    color: 'var(--ccc-text-on-card)',
  };

  const filterToggleButtonStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    padding: '10px 18px',
    marginBottom: '8px',
    cursor: 'pointer',
    fontWeight: 'bold',
    fontSize: '14px',
    fontFamily: 'inherit',
    textAlign: 'left',
    ...eventCardSurfaceStyle,
  };

  const filterFieldStyle: CSSProperties = {
    width: '100%',
    padding: '10px 18px',
    fontSize: '14px',
    outline: 'none',
    fontFamily: 'inherit',
    ...eventCardSurfaceStyle,
  };

  const completionFilterSelectStyle: CSSProperties = {
    padding: '10px 18px',
    minWidth: 160,
    outline: 'none',
    fontFamily: 'inherit',
    cursor: 'pointer',
    ...eventCardSurfaceStyle,
  };

  const sectionTitleStyle: CSSProperties = {
    fontSize: '1.8em',
    color: 'var(--ccc-accent)',
    marginBottom: '15px',
    fontWeight: 600,
    letterSpacing: '-0.01em',
  };

  const emptyStateStyle: CSSProperties = {
    color: 'var(--ccc-text-muted)',
    fontSize: '1.1em',
  };

  const comedianTabs: ComedianTab[] = ['opportunities', 'accepted', 'favorites', 'recommendations'];
  const organizerTabs: OrganizerTab[] = ['upcoming', 'full', 'archived', 'cancelled', 'calendar', 'favoriteComedians', 'recurringEvents'];
  const eventsSubTabs: EventsSubTab[] = ['upcoming', 'full', 'archived', 'cancelled', 'recurringEvents'];
  const superAdminTabs: SuperAdminTab[] = ['full', 'upcoming', 'archived', 'cancelled'];
  const isEventsSubTabActive = eventsSubTabs.includes(organizerTab as EventsSubTab);
  const eventsDropdownValue: EventsSubTab | '' = isEventsSubTabActive ? (organizerTab as EventsSubTab) : '';

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
    borderRadius: 'var(--ccc-radius-md)',
    border: `1px solid ${isActive ? 'var(--ccc-accent-soft-border)' : 'var(--ccc-border-subtle)'}`,
    backgroundColor: isActive ? 'var(--ccc-accent-soft)' : 'var(--ccc-bg-surface)',
    color: isActive ? 'var(--ccc-text-primary)' : 'var(--ccc-text-secondary)',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    boxShadow: isActive ? 'var(--ccc-shadow-accent)' : 'none',
  });

  const comedianTabTitleStyle: CSSProperties = {
    fontSize: '0.95em',
    fontWeight: 600,
  };

  const comedianTabCountStyle: CSSProperties = {
    fontSize: '0.85em',
    color: 'var(--ccc-text-accent)',
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
    borderRadius: 'var(--ccc-radius-full)',
    border: `1px solid ${isActive ? 'var(--ccc-accent-soft-border)' : 'var(--ccc-border-medium)'}`,
    backgroundColor: isActive ? 'var(--ccc-accent-soft)' : 'var(--ccc-bg-surface)',
    color: isActive ? 'var(--ccc-text-primary)' : 'var(--ccc-text-secondary)',
    fontWeight: isActive ? 700 : 500,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  });

  const organizerTabCountStyle: CSSProperties = {
    fontSize: '0.85em',
    backgroundColor: 'var(--ccc-bg-surface-hover)',
    padding: '2px 8px',
    borderRadius: 'var(--ccc-radius-full)',
  };

  const dropdownContainerStyle: CSSProperties = {
    position: 'relative',
    display: 'inline-block',
  };

  const dropdownSelectStyle = (isActive: boolean): CSSProperties => ({
    padding: '10px 18px',
    paddingRight: '40px',
    borderRadius: 'var(--ccc-radius-full)',
    border: `1px solid ${isActive ? 'var(--ccc-accent-soft-border)' : 'var(--ccc-border-medium)'}`,
    backgroundColor: isActive ? 'var(--ccc-accent-soft)' : 'var(--ccc-bg-surface)',
    color: isActive ? 'var(--ccc-text-primary)' : 'var(--ccc-text-secondary)',
    fontWeight: isActive ? 700 : 500,
    cursor: 'pointer',
    fontSize: '1em',
    fontFamily: 'inherit',
    appearance: 'none',
    backgroundImage: `url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none'%3e%3cpath d='M6 9l6 6 6-6' stroke='%23${isActive ? '7c3aed' : '64748b'}' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'/%3e%3c/svg%3e")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 14px center',
    backgroundSize: '14px',
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    minWidth: isMobile ? '100%' : '220px',
    boxShadow: isActive ? 'var(--ccc-shadow-accent)' : 'none',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    WebkitFontSmoothing: 'antialiased',
    MozOsxFontSmoothing: 'grayscale',
  } as CSSProperties);

  const eventCardStyle: CSSProperties = {
    ...eventCardSurfaceStyle,
    padding: isMobile ? '16px' : '20px',
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
    backgroundColor: 'var(--ccc-card-complete-bg)',
    border: `1px solid var(--ccc-card-complete-border)`,
  };

  /** Fond rouge clair pour les évènements annulés (comme candidatures refusées) */
  const eventCardStyleCancelled: CSSProperties = {
    backgroundColor: 'var(--ccc-card-cancelled-bg)',
    border: `1px solid var(--ccc-card-cancelled-border)`,
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
    borderRadius: 'var(--ccc-radius-full)',
    border: `1px solid var(--ccc-border-on-card-strong)`,
    backgroundColor: 'var(--ccc-bg-surface)',
    fontSize: '0.85em',
    fontWeight: 600,
    color: 'var(--ccc-text-on-card)',
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
    color: isFavorite ? 'var(--ccc-semantic-star)' : 'var(--ccc-semantic-star-inactive)',
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
    color: 'var(--ccc-text-on-card-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  };

  const cardMetaValueStyle: CSSProperties = {
    fontSize: '0.95em',
    color: 'var(--ccc-text-on-card)',
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
    borderRadius: 'var(--ccc-radius-full)',
    border: `1px solid var(--ccc-border-on-card)`,
    fontSize: '0.85em',
    fontWeight: 600,
    color: 'var(--ccc-text-on-card)',
    backgroundColor: 'var(--ccc-bg-surface)',
  };

  const renderStatusChip = (label: string, color: string, backgroundColor: string) => (
    <span style={{ ...statusBadgeStyle, color, backgroundColor }}>{label}</span>
  );

  const eventTitleStyle: CSSProperties = {
    fontSize: isMobile ? '1.2em' : '1.45em',
    color: 'var(--ccc-text-on-card)',
    margin: 0,
  };

  const eventDetailStyle: CSSProperties = {
    fontSize: '0.9em',
    color: 'var(--ccc-text-on-card-muted)',
    marginBottom: '3px',
  };

  const modalDetailStyle: CSSProperties = {
    marginBottom: '10px',
  };

  const modalLabelStyle: CSSProperties = {
    fontWeight: 'bold',
    color: 'var(--ccc-accent)',
    marginRight: '5px',
  };

  const modalValueStyle: CSSProperties = {
    color: 'var(--ccc-text-secondary)',
  };

  // const modalParticipantListStyle: CSSProperties = {
  //   listStyleType: 'none',
  //   padding: 0,
  //   margin: '5px 0 0 0',
  // };

  // const modalParticipantItemStyle: CSSProperties = {
  //   color: 'var(--ccc-text-primary)',
  //   marginBottom: '3px',
  // };

  const actionButtonStyleSmall: CSSProperties = {
    padding: '8px 15px',
    borderRadius: 'var(--ccc-radius-sm)',
    border: 'none',
    color: 'var(--ccc-text-on-accent)',
    fontWeight: 'bold',
    cursor: 'pointer',
    transition: 'opacity 0.2s ease',
  };

  const deleteButtonStyle: CSSProperties = {
    ...actionButtonStyleSmall,
    backgroundColor: 'var(--ccc-error)',
  };

  const editButtonStyle: CSSProperties = {
    ...actionButtonStyleSmall,
    backgroundColor: 'var(--ccc-warning)',
  };

  const applyButtonStyle: CSSProperties = {
    ...actionButtonStyleSmall,
    background: `linear-gradient(135deg, var(--ccc-success) 0%, var(--ccc-semantic-success-dark) 100%)`,
  };

  const disabledApplyButtonStyle: CSSProperties = {
    ...actionButtonStyleSmall,
    backgroundColor: 'var(--ccc-text-faint)',
    cursor: 'not-allowed',
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
    border: `8px solid var(--ccc-bg-surface)`,
    borderTop: `8px solid var(--ccc-accent)`,
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
          <p style={{ color: 'var(--ccc-text-muted)', marginTop: 20, fontSize: '1.2em' }}>
            {authIsLoading ? 'Chargement de votre profil...' : 'Chargement des évènements...'}
          </p>
        </div>
      ) : eventsError ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', padding: '20px' }}>
          <p style={{ color: 'var(--ccc-error)', fontSize: '1.2em', marginBottom: '20px' }}>
            Erreur lors du chargement des évènements
          </p>
          <p style={{ color: 'var(--ccc-text-muted)', fontSize: '1em', marginBottom: '20px', textAlign: 'center' }}>
            {eventsErrorMessage?.message || 'Une erreur inattendue s\'est produite'}
          </p>
          <button
            onClick={() => refetch()}
            style={{
              padding: '12px 24px',
              borderRadius: 'var(--ccc-radius-sm)',
              border: 'none',
              background: 'var(--ccc-accent-gradient)',
              color: 'var(--ccc-text-on-accent)',
              fontSize: '1em',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              boxShadow: 'var(--ccc-shadow-accent)',
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
              <p style={{ fontSize: '1.1em', color: 'var(--ccc-text-muted)' }}>
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
                backgroundColor: 'var(--ccc-bg-elevated)',
                padding: '20px',
                borderRadius: 'var(--ccc-radius-md)',
                margin: '0 auto',
                border: `1px solid var(--ccc-border-subtle)`,
                width: '100%',
                boxShadow: 'var(--ccc-shadow-sm)',
              }}>
              <h3 style={{ color: 'var(--ccc-accent)', marginBottom: '15px', fontSize: '1.2em' }}>Filtres de recherche</h3>
              <div style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, minmax(0, 320px))',
                gap: '15px',
                  justifyContent: isMobile ? 'stretch' : 'center'
              }}>
                <div style={{ maxWidth: isMobile ? '100%' : 320 }}>
                <label style={{ display: 'block', color: 'var(--ccc-text-primary)', marginBottom: '5px', fontWeight: 'bold' }}>
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
                    borderRadius: 'var(--ccc-radius-sm)',
                    border: '1px solid #555',
                    backgroundColor: 'rgba(0, 0, 0, 0.6)',
                    color: 'var(--ccc-text-primary)',
                    fontSize: '14px'
                  }}
                >
                  <option value="" style={{ backgroundColor: 'var(--ccc-bg-elevated)', color: 'var(--ccc-text-primary)' }}>
                    Tous les organisateurs
                  </option>
                  {availableOrganizers.map((organizer) => (
                    <option 
                      key={organizer.id} 
                      value={organizer.fullName}
                      style={{ backgroundColor: 'var(--ccc-bg-elevated)', color: 'var(--ccc-text-primary)' }}
                    >
                      {organizer.fullName}
                    </option>
                  ))}
                </select>
              </div>
                <div style={{ maxWidth: isMobile ? '100%' : 320 }}>
                  <label style={{ display: 'block', color: 'var(--ccc-text-primary)', marginBottom: '5px', fontWeight: 'bold' }}>
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
                        borderRadius: 'var(--ccc-radius-sm)',
                        border: '1px solid #555',
                        backgroundColor: 'rgba(0, 0, 0, 0.6)',
                        color: 'var(--ccc-text-primary)',
                        fontSize: '14px'
                      }}
                    />
                    <button
                      type="submit"
                      style={{
                        padding: '10px 18px',
                        borderRadius: 'var(--ccc-radius-sm)',
                        border: 'none',
                        background: 'var(--ccc-accent-gradient)',
                        color: 'var(--ccc-text-on-accent)',
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
                    borderRadius: 'var(--ccc-radius-sm)',
                    border: `1px solid var(--ccc-border-medium)`,
                    backgroundColor: 'var(--ccc-bg-surface)',
                    color: 'var(--ccc-text-primary)',
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
                  ...completionFilterSelectStyle,
                  marginLeft: isMobile ? 0 : 'auto',
                  width: isMobile ? '100%' : undefined,
                }}
              >
                <option value="all">Tous</option>
                <option value="complete">Complet</option>
                <option value="incomplete">Non complet</option>
              </select>
            )}
          </div>
          
          {/* Barre de recherche par lieu et filtre par niveau d'expérience pour les humoristes */}
          <div style={filterSectionWrapStyle}>
            <div style={{ marginBottom: '20px' }}>
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
                  <label style={filterLabelStyle}>
                    Recherche par lieu
                  </label>
                  <input
                    type="text"
                    placeholder="Ville, adresse, lieu..."
                    value={locationSearch}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLocationSearch(e.target.value)}
                    style={filterFieldStyle}
                  />
                </div>

                {/* Filtre par niveau d'expérience */}
                <div style={{ width: isMobile ? '100%' : '200px' }}>
                  <label style={filterLabelStyle}>
                    Niveau d'expérience
                  </label>
                  <select
                    value={experienceFilter}
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setExperienceFilter(e.target.value as 'all' | '0-50' | '50-200' | '200+')}
                    style={filterFieldStyle}
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
                      ...eventCardSurfaceStyle,
                      padding: '10px 18px',
                      cursor: 'pointer',
                      fontSize: '14px',
                      whiteSpace: 'nowrap',
                      height: 'fit-content',
                      fontWeight: 600,
                    }}
                  >
                    Réinitialiser
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Liste des événements */}
          {listIsLoading && <p style={emptyStateStyle}>Chargement des évènements...</p>}
          {listHasError && (
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <p style={{ ...emptyStateStyle, color: 'var(--ccc-error)', marginBottom: 12 }}>Erreur : {listErrorMessage}</p>
              <button
                onClick={() => listRefetch()}
                style={{ padding: '8px 20px', borderRadius: 'var(--ccc-radius-sm)', border: 'none', background: 'var(--ccc-accent-gradient)', color: 'var(--ccc-text-on-accent)', fontSize: '0.9em', fontWeight: 600, cursor: 'pointer' }}
              >
                Réessayer
              </button>
            </div>
          )}
          {eventsToDisplay.length === 0 && !listIsLoading && !listHasError && (
            <p style={emptyStateStyle}>{comedianEmptyStates[comedianTab]}</p>
          )}
          {paginatedUpcomingEvents.map((event: IEvent) => {
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
                let color = 'var(--ccc-warning)';
                let bg = 'rgba(255, 193, 7, 0.18)';
                let label = 'Candidature: En attente';
                if (relatedApplication.status === 'ACCEPTED') {
                  color = 'var(--ccc-success)';
                  bg = 'rgba(40, 167, 69, 0.18)';
                  label = 'Candidature: Acceptée';
                } else if (relatedApplication.status === 'REJECTED') {
                  color = 'var(--ccc-error)';
                  bg = 'rgba(220, 53, 69, 0.2)';
                  label = 'Candidature: Refusée';
                } else if (relatedApplication.status === 'WITHDRAWN') {
                  color = 'var(--ccc-text-muted)';
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
                data-event-id={event._id}
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
                  {renderStatusChip(`Statut: ${statusLabel}`, statusLabel === 'Publié' ? 'var(--ccc-success)' : '#ff8ba0', statusLabel === 'Publié' ? 'rgba(40, 167, 69, 0.15)' : 'rgba(124, 58, 237, 0.12)')}
                  {renderStatusChip(
                    isCompleteEvent ? `Complet • ${participantsRatio}` : `Non complet • ${participantsRatio}`,
                    isCompleteEvent ? 'var(--ccc-text-muted)' : 'var(--ccc-warning)',
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
                      <span style={{ fontSize: '12px', color: 'var(--ccc-text-muted)' }}>
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
          {totalUpcomingPages > 1 && (
            <Pagination
              page={upcomingPage}
              totalPages={totalUpcomingPages}
              onChange={setUpcomingPage}
              disabled={eventsLoading}
            />
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
                        background-color: var(--ccc-bg-elevated) !important;
                        color: #1e293b !important;
                        padding: 12px 16px;
                        font-size: 1em;
                      }
                      .organizer-events-dropdown option:hover {
                        background-color: rgba(124, 58, 237, 0.12) !important;
                      }
                      .organizer-events-dropdown option:checked {
                        background-color: rgba(124, 58, 237, 0.18) !important;
                        color: var(--ccc-accent) !important;
                        font-weight: 700;
                      }
                    `}</style>
                    <select
                      className="organizer-events-dropdown"
                      value={eventsDropdownValue}
                      onChange={(e) => {
                        const newTab = e.target.value as EventsSubTab | '';
                        if (!newTab) return;
                        if (newTab !== 'recurringEvents') setSelectedRecurrenceGroupId(null);
                        if (newTab !== 'upcoming') setExpandedUpcomingGroupId(null);
                        setOrganizerTab(newTab);
                      }}
                      style={dropdownSelectStyle(isEventsSubTabActive)}
                      aria-label="Filtrer les évènements"
                    >
                      {!isEventsSubTabActive && (
                        <option value="" disabled>
                          Évènements
                        </option>
                      )}
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
              <div style={filterSectionWrapStyle}>
                <div style={{ marginBottom: '20px' }}>
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
                      <label style={filterLabelStyle}>
                        Recherche par zone d'événement
                      </label>
                      <input
                        type="text"
                        placeholder="Ville, département, région de l'événement..."
                        value={organizerEventZoneSearch}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setOrganizerEventZoneSearch(e.target.value)}
                        style={filterFieldStyle}
                      />
                    </div>
                    
                    {/* Filtre par niveau d'expérience */}
                    <div style={{ width: isMobile ? '100%' : '200px' }}>
                      <label style={filterLabelStyle}>
                        Niveau d'expérience
                      </label>
                      <select
                        value={organizerEventExperienceFilter}
                        onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setOrganizerEventExperienceFilter(e.target.value as 'all' | '0-50' | '50-200' | '200+')}
                        style={filterFieldStyle}
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
                          ...eventCardSurfaceStyle,
                          padding: '10px 18px',
                          cursor: 'pointer',
                          fontSize: '14px',
                          whiteSpace: 'nowrap',
                          height: 'fit-content',
                          fontWeight: 600,
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
              <div style={filterSectionWrapStyle}>
                <div style={{ marginBottom: '20px' }}>
                  {/* Bouton pour afficher/masquer la section */}
                  <button
                    type="button"
                    onClick={() => setShowComedianSearchSection(!showComedianSearchSection)}
                    style={filterToggleButtonStyle}
                    aria-expanded={showComedianSearchSection}
                  >
                    <span>Rechercher des humoristes par zone</span>
                    <span style={{ fontSize: '18px', lineHeight: 1, color: 'var(--ccc-text-muted)' }}>{showComedianSearchSection ? '−' : '+'}</span>
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
                          <label style={filterLabelStyle}>
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
                            style={filterFieldStyle}
                          >
                            <option value="ville">Ville</option>
                            <option value="departement">Département</option>
                            <option value="region">Région</option>
                          </select>
                        </div>

                        {/* Recherche par zone */}
                        <div style={{ flex: isMobile ? undefined : 1, width: isMobile ? '100%' : undefined }}>
                          <label style={filterLabelStyle}>
                            Zone d'événement
                          </label>

                          {/* Select pour les régions */}
                          {comedianZoneType === 'region' && (
                            <select
                              value={comedianZoneSearch}
                              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setComedianZoneSearch(e.target.value)}
                              style={filterFieldStyle}
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
                              style={filterFieldStyle}
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
                              style={filterFieldStyle}
                            />
                          )}
                        </div>

                        {/* Filtre par niveau d'expérience */}
                        <div style={{ width: isMobile ? '100%' : '200px' }}>
                          <label style={filterLabelStyle}>
                            Niveau d'expérience
                          </label>
                          <select
                            value={comedianExperienceFilter}
                            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setComedianExperienceFilter(e.target.value as 'all' | '0-50' | '50-200' | '200+')}
                            style={filterFieldStyle}
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
                              ...eventCardSurfaceStyle,
                              padding: '10px 18px',
                              cursor: 'pointer',
                              fontSize: '14px',
                              whiteSpace: 'nowrap',
                              height: 'fit-content',
                              fontWeight: 600,
                            }}
                          >
                            Réinitialiser
                          </button>
                        )}
                      </div>

                      {/* Résultats de la recherche */}
                      {isSearchingComedians && (
                        <p style={{ color: 'var(--ccc-success)', marginTop: '15px', textAlign: 'center' }}>
                          Recherche en cours...
                        </p>
                      )}

                      {comedianSearchError && (
                        <p style={{ color: 'var(--ccc-error)', marginTop: '15px', textAlign: 'center' }}>
                          {comedianSearchError}
                        </p>
                      )}

                      {!isSearchingComedians && comedianZoneSearch.trim() && comedianSearchResults.length === 0 && !comedianSearchError && (
                        <p style={{ color: 'var(--ccc-warning)', marginTop: '15px', textAlign: 'center' }}>
                          Aucun humoriste trouvé pour cette zone.
                        </p>
                      )}

                      {comedianSearchResults.length > 0 && (
                        <div style={{ marginTop: '20px' }}>
                          <h4 style={{ color: 'var(--ccc-success)', marginBottom: '15px' }}>
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
                                  backgroundColor: 'var(--ccc-bg-elevated)',
                                  borderRadius: 'var(--ccc-radius-sm)',
                                  border: `1px solid var(--ccc-border-medium)`,
                                  boxShadow: 'var(--ccc-shadow-sm)',
                                  cursor: 'pointer',
                                  transition: 'all 0.2s ease'
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.backgroundColor = 'rgba(15, 23, 42, 0.04)';
                                  e.currentTarget.style.borderColor = 'var(--ccc-accent)';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.backgroundColor = 'var(--ccc-bg-elevated)';
                                  e.currentTarget.style.borderColor = 'rgba(15, 23, 42, 0.14)';
                                }}
                              >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
                                  <div style={{ flex: 1 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '5px' }}>
                                      <h5 style={{ color: 'var(--ccc-text-primary)', margin: 0, fontSize: '16px' }}>
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
                                          color: favoriteComedianIds.includes(comedian._id) ? '#ffd700' : 'var(--ccc-text-muted)',
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
                                          color: 'var(--ccc-text-on-accent)',
                                          fontSize: '12px',
                                          cursor: 'pointer',
                                          padding: '6px 12px',
                                          borderRadius: 'var(--ccc-radius-md)',
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
                                      <p style={{ color: 'var(--ccc-text-muted)', margin: '0 0 5px 0', fontSize: '13px' }}>
                                        {comedian.firstName} {comedian.lastName}
                                      </p>
                                    )}
                                    {comedian.mobilityZone && comedian.mobilityZone.length > 0 && (
                                      <p style={{ color: 'var(--ccc-text-muted)', margin: '0', fontSize: '13px' }}>
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
                                          color: 'var(--ccc-warning)'
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
                                          borderRadius: 'var(--ccc-radius-md)',
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
                                  borderRadius: 'var(--ccc-radius-sm)',
                                  border: '1px solid var(--ccc-success)',
                                  backgroundColor: comedianSearchPage === 1 ? 'rgba(0, 0, 0, 0.3)' : 'rgba(40, 167, 69, 0.2)',
                                  color: comedianSearchPage === 1 ? 'var(--ccc-text-secondary)' : 'var(--ccc-text-on-accent)',
                                  cursor: comedianSearchPage === 1 ? 'not-allowed' : 'pointer'
                                }}
                              >
                                Précédent
                              </button>
                              <span style={{ color: 'var(--ccc-text-primary)', alignSelf: 'center' }}>
                                Page {comedianSearchPage} / {Math.ceil(comedianSearchTotal / 10)}
                              </span>
                              <button
                                onClick={() => setComedianSearchPage(p => p + 1)}
                                disabled={comedianSearchPage >= Math.ceil(comedianSearchTotal / 10)}
                                style={{
                                  padding: '8px 16px',
                                  borderRadius: 'var(--ccc-radius-sm)',
                                  border: '1px solid var(--ccc-success)',
                                  backgroundColor: comedianSearchPage >= Math.ceil(comedianSearchTotal / 10) ? 'rgba(0, 0, 0, 0.3)' : 'rgba(40, 167, 69, 0.2)',
                                  color: comedianSearchPage >= Math.ceil(comedianSearchTotal / 10) ? 'var(--ccc-text-secondary)' : 'var(--ccc-text-on-accent)',
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
                      ...completionFilterSelectStyle,
                      marginLeft: isMobile ? 0 : 'auto',
                      width: isMobile ? '100%' : undefined,
                    }}
                  >
                    <option value="all">Tous</option>
                    <option value="complete">Complet</option>
                    <option value="incomplete">Non complet</option>
                  </select>
                )}
              </div>
              {listIsLoading && <p style={emptyStateStyle}>Chargement des évènements...</p>}
              {listHasError && (
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <p style={{ ...emptyStateStyle, color: 'var(--ccc-error)', marginBottom: 12 }}>Erreur : {listErrorMessage}</p>
              <button
                onClick={() => listRefetch()}
                style={{ padding: '8px 20px', borderRadius: 'var(--ccc-radius-sm)', border: 'none', background: 'var(--ccc-accent-gradient)', color: 'var(--ccc-text-on-accent)', fontSize: '0.9em', fontWeight: 600, cursor: 'pointer' }}
              >
                Réessayer
              </button>
            </div>
          )}
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
                          {((isOrganizerView && organizerTab === 'upcoming' && serverEventsPagination)
                            ? upcomingSectionItems
                            : upcomingSectionItems.slice((upcomingPage - 1) * ITEMS_PER_PAGE, upcomingPage * ITEMS_PER_PAGE)).map((item) => {
                    if (item.type === 'event') {
                      const event = item.event;
                      const isCompleteEvent = isEventComplete(event);
                      const participantsRatio = getParticipantsRatio(event);
                      const statusLabel = translateEventStatus(event.status);
                      return (
                        <div key={event._id} data-event-id={event._id} style={{ ...eventCardStyle, ...(isCompleteEvent ? eventCardStyleComplete : {}) }} onClick={() => handleCardClick(event)}>
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
                            {renderStatusChip(`Statut: ${statusLabel}`, statusLabel === 'Publié' ? 'var(--ccc-success)' : '#ff8ba0', statusLabel === 'Publié' ? 'rgba(40, 167, 69, 0.15)' : 'rgba(124, 58, 237, 0.12)')}
                            {renderStatusChip(
                              isCompleteEvent ? `Complet • ${participantsRatio}` : `Non complet • ${participantsRatio}`,
                              isCompleteEvent ? 'var(--ccc-text-muted)' : 'var(--ccc-warning)',
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
                                <span style={{ fontSize: '0.85em', color: 'var(--ccc-text-muted)' }}>Événement récurrent · {item.events.length} date(s)</span>
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
                                  data-event-id={event._id}
                                  onClick={(e) => { e.stopPropagation(); handleCardClick(event); }}
                                  style={{
                                    padding: '12px 16px',
                                    backgroundColor: isDateComplete ? 'var(--ccc-card-complete-bg)' : '#f8fafc',
                                    borderRadius: 'var(--ccc-radius-sm)',
                                    border: isDateComplete ? `1px solid var(--ccc-card-complete-border)` : `1px solid var(--ccc-border-subtle)`,
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
                                    <span style={{ color: 'var(--ccc-text-primary)' }}>{timeStr}</span>
                                  </div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <span style={{ color: 'var(--ccc-text-muted)', fontSize: '0.9em' }}>{participantsCount}/{maxP} humoristes</span>
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
                          {(() => {
                            const pages = (isOrganizerView && organizerTab === 'upcoming' && serverEventsPagination)
                              ? serverEventsPagination.totalPages
                              : Math.max(1, Math.ceil(upcomingSectionItems.length / ITEMS_PER_PAGE));
                            return pages > 1 ? (
                              <Pagination
                                page={upcomingPage}
                                totalPages={pages}
                                onChange={(p) => { setExpandedUpcomingGroupId(null); setUpcomingPage(p); }}
                                disabled={eventsLoading}
                              />
                            ) : null;
                          })()}
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
                    {paginatedUpcomingEvents.map((event: IEvent) => {
                      const isCompleteEvent = isEventComplete(event);
                      const participantsRatio = getParticipantsRatio(event);
                      const statusLabel = translateEventStatus(event.status);
                      return (
                        <div key={event._id} data-event-id={event._id} style={{ ...eventCardStyle, ...(isCompleteEvent ? eventCardStyleComplete : {}) }} onClick={() => handleCardClick(event)}>
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
                            {renderStatusChip(`Statut: ${statusLabel}`, statusLabel === 'Publié' ? 'var(--ccc-success)' : '#ff8ba0', statusLabel === 'Publié' ? 'rgba(40, 167, 69, 0.15)' : 'rgba(124, 58, 237, 0.12)')}
                            {renderStatusChip(
                              isCompleteEvent ? `Complet • ${participantsRatio}` : `Non complet • ${participantsRatio}`,
                              isCompleteEvent ? 'var(--ccc-text-muted)' : 'var(--ccc-warning)',
                              isCompleteEvent ? 'rgba(0, 0, 0, 0.06)' : 'rgba(255, 193, 7, 0.15)'
                            )}
                            {renderOrganizerActions(event, 'upcoming')}
                          </div>
                        </div>
                      );
                    })}
                    {totalUpcomingPages > 1 && (
                      <Pagination
                        page={upcomingPage}
                        totalPages={totalUpcomingPages}
                        onChange={setUpcomingPage}
                        disabled={eventsLoading}
                      />
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
              {eventsError && <p style={{ ...emptyStateStyle, color: 'var(--ccc-error)' }}>Erreur : {eventsErrorMessage?.message}</p>}
              {!eventsLoading && !eventsError && completedUpcomingEvents.length === 0 && (
                <p style={emptyStateStyle}>Aucun évènement complet à venir.</p>
              )}
              {paginatedCompletedEvents.map((event) => {
                const participantsRatio = getParticipantsRatio(event);
                const statusLabel = translateEventStatus(event.status);

                return (
                  <div key={event._id} data-event-id={event._id} style={{ ...eventCardStyle, ...eventCardStyleComplete }} onClick={() => handleCardClick(event)}>
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
                      {renderStatusChip(`Statut: ${statusLabel}`, statusLabel === 'Publié' ? 'var(--ccc-success)' : '#ff8ba0', statusLabel === 'Publié' ? 'rgba(40, 167, 69, 0.15)' : 'rgba(124, 58, 237, 0.12)')}
                      {renderStatusChip(`Complet • ${participantsRatio}`, 'var(--ccc-text-muted)', 'rgba(0, 0, 0, 0.06)')}
                      {renderOrganizerActions(event, 'full')}
                    </div>
                  </div>
                );
              })}
              {totalCompletedPages > 1 && (
                <Pagination
                  page={completedPage}
                  totalPages={totalCompletedPages}
                  onChange={setCompletedPage}
                  disabled={eventsLoading}
                />
              )}
            </div>
          )}
        </>
      )}

      {showArchivedSection && (
        <div ref={archivedSectionRef} style={sectionStyle}>
          <h2 style={sectionTitleStyle}>Évènements archivés</h2>
          {eventsLoading && <p style={emptyStateStyle}>Chargement des évènements...</p>}
          {eventsError && <p style={{ ...emptyStateStyle, color: 'var(--ccc-error)' }}>Erreur: {eventsErrorMessage?.message}</p>}
          {!eventsLoading && !eventsError && archivedEventsToShow.length === 0 && (
            <p style={emptyStateStyle}>Aucun évènement archivé.</p>
          )}
          {paginatedArchivedEvents.map((event) => {
            const participantsRatio = getParticipantsRatio(event);
            const statusLabel = translateEventStatus(event.status);
            const isFutureButArchived = new Date(event.date) >= new Date();

            return (
              <div key={event._id} data-event-id={event._id} style={eventCardStyle} onClick={() => handleCardClick(event)}>
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
                  {isFutureButArchived && renderStatusChip('Évènement futur classé en archive', 'var(--ccc-warning)', 'rgba(255, 193, 7, 0.18)')}
                  {renderOrganizerActions(event, 'archived')}
                </div>
              </div>
            );
          })}
          {totalArchivedPages > 1 && (
            <Pagination
              page={archivedPage}
              totalPages={totalArchivedPages}
              onChange={setArchivedPage}
              disabled={eventsLoading}
            />
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
          {eventsError && <p style={{ ...emptyStateStyle, color: 'var(--ccc-error)' }}>Erreur: {eventsErrorMessage?.message}</p>}
          {!eventsLoading && !eventsError && cancelledEvents.length === 0 && (
            <p style={emptyStateStyle}>Aucun évènement annulé.</p>
          )}
          {paginatedCancelledEvents.map((event) => {
            const statusLabel = translateEventStatus(event.status);
            const reason = event.cancellationReason;

            return (
              <div key={event._id} data-event-id={event._id} style={{ ...eventCardStyle, ...eventCardStyleCancelled }} onClick={() => handleCardClick(event)}>
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
                  {renderStatusChip(`Statut: ${statusLabel}`, 'var(--ccc-error)', 'rgba(220, 53, 69, 0.18)')}
                </div>
              </div>
            );
          })}
          {totalCancelledPages > 1 && (
            <Pagination
              page={cancelledPage}
              totalPages={totalCancelledPages}
              onChange={setCancelledPage}
              disabled={eventsLoading}
            />
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
          {favoriteComediansLoading && <p style={emptyStateStyle}>Chargement des humoristes favoris...</p>}
          {favoriteComediansError && (
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <p style={{ ...emptyStateStyle, color: 'var(--ccc-error)', marginBottom: 12 }}>Impossible de charger les humoristes favoris.</p>
              <button
                onClick={() => refetchFavoriteComedians()}
                style={{ padding: '8px 20px', borderRadius: 'var(--ccc-radius-sm)', border: 'none', background: 'var(--ccc-accent-gradient)', color: 'var(--ccc-text-on-accent)', fontSize: '0.9em', fontWeight: 600, cursor: 'pointer' }}
              >
                Réessayer
              </button>
            </div>
          )}
          {!favoriteComediansLoading && !favoriteComediansError && (favoriteComediansData?.favorites && favoriteComediansData.favorites.length > 0 ? (
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
                    backgroundColor: 'var(--ccc-bg-elevated)',
                    borderRadius: 'var(--ccc-radius-sm)',
                    border: `1px solid var(--ccc-border-medium)`,
                    boxShadow: 'var(--ccc-shadow-sm)',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(15, 23, 42, 0.04)';
                    e.currentTarget.style.borderColor = 'var(--ccc-accent)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--ccc-bg-elevated)';
                    e.currentTarget.style.borderColor = 'rgba(15, 23, 42, 0.14)';
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '5px' }}>
                        <h5 style={{ color: 'var(--ccc-text-primary)', margin: 0, fontSize: '16px' }}>
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
                        <p style={{ color: 'var(--ccc-text-muted)', margin: '0 0 5px 0', fontSize: '13px' }}>
                          {comedian.firstName} {comedian.lastName}
                        </p>
                      )}
                      {(comedian.mobilityZone || comedian.profile?.mobilityZone) && 
                       (comedian.mobilityZone || comedian.profile?.mobilityZone).length > 0 && (
                        <p style={{ color: 'var(--ccc-text-muted)', margin: '0', fontSize: '13px' }}>
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
                            color: 'var(--ccc-warning)'
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
                            borderRadius: 'var(--ccc-radius-md)',
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
            <p style={{ color: 'var(--ccc-text-muted)', marginTop: '20px', textAlign: 'center' }}>
              Aucun humoriste en favoris pour le moment. Utilisez la recherche d'humoristes pour en ajouter.
            </p>
          ))}
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
                  borderRadius: 'var(--ccc-radius-sm)',
                  border: `1px solid var(--ccc-border-medium)`,
                  background: 'var(--ccc-bg-surface)',
                  color: 'var(--ccc-text-primary)',
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
                      <h3 style={{ margin: '0 0 8px 0', color: 'var(--ccc-text-primary)', fontSize: '1.2em' }}>{firstEvent?.title}</h3>
                      <p style={{ margin: 0, color: 'var(--ccc-text-muted)', fontSize: '0.9em' }}>
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
                            data-event-id={event._id}
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
                              <div style={{ color: 'var(--ccc-text-primary)', fontWeight: 600, marginBottom: '4px' }}>{timeStr}</div>
                              <div style={{ color: 'var(--ccc-text-muted)', fontSize: '0.9em' }}>
                                {event.location?.venue} · {event.location?.city}
                              </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                              <span style={{ ...statusBadgeStyle, opacity: (event.status === 'CANCELLED' || event.status === 'cancelled') ? 0.7 : 1 }}>
                                {status}
                              </span>
                              <span style={{ color: 'var(--ccc-text-muted)', fontSize: '0.9em' }}>
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
                            <h3 style={{ margin: '0 0 6px 0', color: 'var(--ccc-text-primary)', fontSize: '1.1em' }}>{first?.title}</h3>
                            <p style={{ margin: 0, color: 'var(--ccc-text-muted)', fontSize: '0.9em' }}>
                              {dateFirst} → {dateLast} · {events.length} date(s)
                            </p>
                            {first?.location?.city && (
                              <p style={{ margin: '4px 0 0 0', color: 'var(--ccc-text-muted)', fontSize: '0.85em' }}>{first.location.venue} — {first.location.city}</p>
                            )}
                          </div>
                          <span style={{ ...cardDateBadgeStyle, flexShrink: 0 }}>{events.length} date(s)</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p style={{ color: 'var(--ccc-text-muted)', marginTop: '20px', textAlign: 'center' }}>
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
          {(eventToCancel?.venueBookingId || eventsGroupToCancel?.some(e => !!e.venueBookingId)) && (
            <p style={{ marginBottom: 12, padding: '10px 12px', backgroundColor: 'var(--ccc-bg-surface)', borderRadius: 'var(--ccc-radius-sm)', border: `1px solid var(--ccc-border-subtle)`, color: 'var(--ccc-text-secondary)', fontSize: '0.9em' }}>
              ℹ️ La réservation de salle reste active. Vous pourrez créer un nouvel événement sur ce créneau.
            </p>
          )}
          <p style={{ marginBottom: 12, color: 'var(--ccc-text-secondary)' }}>
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
            style={{ width: '100%', minHeight: 80, padding: 10, borderRadius: 'var(--ccc-radius-sm)', border: `1px solid var(--ccc-border-medium)`, background: 'var(--ccc-bg-surface)', color: 'var(--ccc-text-primary)' }}
          />
          <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button onClick={() => setShowCancelModal(false)} disabled={isCancelling} style={{ ...actionButtonStyleSmall, backgroundColor: '#6c757d', cursor: isCancelling ? 'not-allowed' : 'pointer' }}>
              Fermer
            </button>
            <button onClick={confirmCancelEvent} disabled={isCancelling} style={{ ...actionButtonStyleSmall, background: 'var(--ccc-accent-gradient)', opacity: isCancelling ? 0.7 : 1, cursor: isCancelling ? 'not-allowed' : 'pointer' }}>
              {isCancelling ? 'Annulation...' : "Confirmer l'annulation"}
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
            <h2 style={{ margin: '0 0 16px 0', fontSize: '1.25em', color: 'var(--ccc-text-primary)' }}>
              Spectateurs — {spectatorsModalEvent.title}
            </h2>
            {(() => {
              const regs = spectatorsModalEvent.spectatorRegistrations || [];
              const max = spectatorsModalEvent.maxSpectators;
              const count = Array.isArray(regs) ? regs.length : 0;
              const placesLeft = max != null && typeof max === 'number' ? Math.max(0, max - count) : null;
              return (
                <>
                  <p style={{ marginBottom: 16, color: 'var(--ccc-success)', fontSize: '1em' }}>
                    <strong>{count}</strong> personne{count !== 1 ? 's' : ''} inscrite{count !== 1 ? 's' : ''}
                    {placesLeft !== null && (
                      <span style={{ color: 'var(--ccc-text-muted)' }}> · <strong>{placesLeft}</strong> place{placesLeft !== 1 ? 's' : ''} restante{placesLeft !== 1 ? 's' : ''}</span>
                    )}
                  </p>
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0, maxHeight: 320, overflowY: 'auto' }}>
                    {regs.map((reg, i) => {
                      const name = reg && typeof reg === 'object' && 'firstName' in reg && 'lastName' in reg
                        ? `${(reg as { firstName: string; lastName: string }).firstName} ${(reg as { lastName: string }).lastName}`
                        : '—';
                      return (
                        <li key={i} style={{ padding: '8px 0', borderBottom: `1px solid var(--ccc-border-subtle)`, color: 'var(--ccc-text-primary)' }}>
                          {name}
                        </li>
                      );
                    })}
                  </ul>
                  {regs.length === 0 && (
                    <p style={{ color: 'var(--ccc-text-muted)', marginTop: 8 }}>Aucun spectateur inscrit pour le moment.</p>
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
              <p style={{ marginBottom: 16, color: 'var(--ccc-text-secondary)' }}>
                Inviter <strong>{comedianToInvite.stageName || `${comedianToInvite.firstName} ${comedianToInvite.lastName}`}</strong> à postuler pour un de vos événements :
              </p>

              <select
                value={selectedEventForInvite}
                onChange={(e) => setSelectedEventForInvite(e.target.value)}
                style={{
                  ...filterFieldStyle,
                  padding: '12px',
                  marginBottom: '16px',
                  border: `1px solid var(--ccc-border-medium)`,
                  borderRadius: 'var(--ccc-radius-sm)',
                  backgroundColor: 'var(--ccc-bg-surface)',
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
            backgroundColor: 'var(--ccc-bg-overlay)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={(e) => e.target === e.currentTarget && closeWithdrawModal()}
        >
          <div style={{
            backgroundColor: 'var(--ccc-bg-elevated)',
            borderRadius: 'var(--ccc-radius-md)',
            padding: '24px',
            maxWidth: '500px',
            width: '90%',
            boxShadow: 'var(--ccc-shadow-dropdown)',
            border: `1px solid var(--ccc-border-subtle)`,
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
                color: 'var(--ccc-text-primary)',
                margin: 0,
              }}>
                Retirer votre candidature
              </h2>
              <button
                onClick={closeWithdrawModal}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--ccc-text-muted)',
                  cursor: 'pointer',
                  fontSize: '20px',
                  padding: '4px 8px',
                  borderRadius: 'var(--ccc-radius-sm)',
                  transition: 'all 0.2s',
                }}
                aria-label="Fermer"
              >
                ✕
              </button>
            </div>

            {/* Message principal */}
            <p style={{
              color: 'var(--ccc-text-secondary)',
              fontSize: '15px',
              lineHeight: '1.6',
              margin: '0 0 12px 0',
            }}>
              Êtes-vous sûr de vouloir retirer votre candidature pour l'évènement <strong style={{ color: 'var(--ccc-text-primary)' }}>"{eventToWithdraw.title}"</strong> ?
            </p>

            {/* Avertissement */}
            <p style={{
              color: '#ff6b6b',
              fontSize: '14px',
              margin: '0 0 24px 0',
              padding: '10px 12px',
              backgroundColor: 'rgba(220, 53, 69, 0.15)',
              borderRadius: 'var(--ccc-radius-sm)',
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
                disabled={isWithdrawing}
                style={{
                  padding: '10px 24px',
                  borderRadius: 'var(--ccc-radius-sm)',
                  border: `1px solid var(--ccc-border-medium)`,
                  backgroundColor: 'var(--ccc-bg-surface)',
                  color: 'var(--ccc-text-primary)',
                  fontWeight: '600',
                  cursor: isWithdrawing ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s ease',
                  fontSize: '14px',
                }}
              >
                Annuler
              </button>
              <button
                onClick={confirmWithdrawApplication}
                disabled={isWithdrawing}
                style={{
                  padding: '10px 24px',
                  borderRadius: 'var(--ccc-radius-sm)',
                  border: 'none',
                  backgroundColor: 'var(--ccc-error)',
                  color: 'var(--ccc-text-on-accent)',
                  fontWeight: '600',
                  cursor: isWithdrawing ? 'not-allowed' : 'pointer',
                  opacity: isWithdrawing ? 0.7 : 1,
                  transition: 'all 0.2s ease',
                  fontSize: '14px',
                }}
              >
                {isWithdrawing ? 'Retrait...' : '✕ Confirmer le retrait'}
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