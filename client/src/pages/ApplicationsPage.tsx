import { type CSSProperties, useState, useEffect, useRef, useMemo } from 'react';
import Navbar from '../components/Navbar';
import api from '../services/api';
import { useAuth } from '../hooks/useAuth';
import { useAlert } from '../hooks/useAlert';
import { useLocation, useNavigate } from 'react-router-dom';
import ApplicationDetailsModal from '../components/ApplicationDetailsModal';
import ConfirmDialog from '../components/ConfirmDialog';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { addFavorite, removeFavorite, getFavorites, addApplicationFavorite, removeApplicationFavorite, getApplicationFavorites } from '../services/api';
import { checkGeographicCompatibility, isGeographicMatch, matchesMobilityZones, normalizeString } from '../utils/geographicMatching';
import { getErrorMessage, ErrorMessages, SuccessMessages, WarningMessages, InfoMessages, ConfirmMessages } from '../services/systemMessages';

export interface IUser {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  avatarUrl?: string | null;
  profile?: { 
    bio?: string; 
    experience?: number; 
    speciality?: string;
    numberOfScenes?: '0-50' | '50-200' | '200+';
    mobilityZone?: Array<{ type: 'ville' | 'departement' | 'region'; value: string }>;
  };
}

export interface IEventPopulated {
  _id: string;
  title: string;
  date: string;
  startTime: string;
  endTime?: string;
  location: { address: string; city: string; venue?: string; };
  organizer: IUser; // Change to IUser
  status: 'DRAFT' | 'PUBLISHED' | 'CANCELLED' | 'COMPLETED' | 'cancelled';
  requirements: { minExperience: number; maxPerformers: number; duration: number; };
  createdAt?: string;
  updatedAt?: string;
  modifiedByOrganizer?: boolean;
}

export interface IApplication {
  _id: string;
  event: IEventPopulated;
  comedian: IUser; // Renamed from applicant to comedian for consistency with backend
  performanceDetails?: { duration: number; description: string; videoLink?: string; }; // Make optional
  message?: string; // Add optional message field
  organizerMessage?: string; // Message de l'organisateur lors de l'acceptation/refus
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED' | 'WITHDRAWN' | 'CANCELLED_BY_PLATFORM';
  createdAt: string;
}

type ComedianApplicationTab = 'accepted' | 'pending' | 'rejected' | 'archived' | 'cancelled';
type OrganizerApplicationTab = 'all' | 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'favorites';

const VALID_COMEDIAN_TABS: ComedianApplicationTab[] = ['accepted', 'pending', 'rejected', 'archived', 'cancelled'];

// Composant pour afficher l'indicateur de compatibilité géographique
function GeographicCompatibilityBadge({ 
  eventCity, 
  mobilityZones 
}: { 
  eventCity: string; 
  mobilityZones?: Array<{ type: 'ville' | 'departement' | 'region'; value: string }> 
}) {
  const [isCompatible, setIsCompatible] = useState<boolean | null>(null);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    // Log pour déboguer
    const checkCompatibility = async () => {
      setIsChecking(true);
      try {
        const result = await checkGeographicCompatibility(eventCity, mobilityZones);
        setIsCompatible(result.isCompatible);
      } catch (error) {
        setIsCompatible(false);
      } finally {
        setIsChecking(false);
      }
    };

    if (eventCity && mobilityZones && mobilityZones.length > 0) {
      checkCompatibility();
    } else {
      setIsCompatible(false);
      setIsChecking(false);
    }
  }, [eventCity, mobilityZones]);

  if (isChecking) {
    return (
      <span style={{ 
        fontSize: '0.75em', 
        color: '#aaa',
        marginTop: '4px',
        display: 'block'
      }}>
        🔍 Vérification...
      </span>
    );
  }

  // Si pas de zones de mobilité, ne rien afficher
  if (!mobilityZones || mobilityZones.length === 0) {
    return null;
  }

  // Si compatible, afficher le badge
  if (isCompatible === true) {
    return (
      <span style={{ 
        fontSize: '0.75em', 
        color: '#4caf50',
        marginTop: '4px',
        display: 'block',
        fontWeight: 'bold'
      }}>
        ✅ Zone compatible
      </span>
    );
  }

  // Si pas compatible, ne rien afficher (ou afficher un message d'incompatibilité si besoin)
  return null;
}

function ApplicationsPage() {
  const { user, refreshUser } = useAuth();
  const { showSuccess, showError, showInfo } = useAlert();
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const [selectedApplication, setSelectedApplication] = useState<IApplication | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedTab, setSelectedTab] = useState<OrganizerApplicationTab>('all');
  const [comedianTab, setComedianTab] = useState<ComedianApplicationTab>('accepted');
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => Promise<void> | void;
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });
  const [statusToSet, setStatusToSet] = useState<'ACCEPTED' | 'REJECTED' | null>(null);
  const [statusAppId, setStatusAppId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState('');
  const messageInputRef = useRef<HTMLInputElement | null>(null);
  const [comedianFilter, setComedianFilter] = useState<string>('all');
  const [selectedEventId] = useState<string>('all');
  const [sortKey, setSortKey] = useState<'dateAsc' | 'dateDesc' | 'statusAsc' | 'statusDesc'>('dateDesc');
  // États pour les filtres spécifiques COMEDIAN
  const [comedianSortKey, setComedianSortKey] = useState<'dateAsc' | 'dateDesc'>('dateDesc');
  const [comedianOrganizerFilter, setComedianOrganizerFilter] = useState<string>('all');
  const [archivedOutcomeFilter, setArchivedOutcomeFilter] = useState<'all' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED'>('all');
  // États pour la recherche par zone d'événement et filtre par niveau d'expérience (organisateur)
  const [eventZoneSearch, setEventZoneSearch] = useState<string>('');
  const [organizerExperienceFilter, setOrganizerExperienceFilter] = useState<'all' | '0-50' | '50-200' | '200+'>('all');
  const ITEMS_PER_PAGE = 5;
  const [currentPage, setCurrentPage] = useState(1);
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < 768;
  });
  const [favoriteComedianIds, setFavoriteComedianIds] = useState<string[]>([]);
  const favoriteComedianIdsSet = useMemo(
    () => new Set(favoriteComedianIds),
    [favoriteComedianIds]
  );
  const [favoriteApplicationIds, setFavoriteApplicationIds] = useState<string[]>([]);
  const favoriteApplicationIdsSet = useMemo(
    () => new Set(favoriteApplicationIds),
    [favoriteApplicationIds]
  );
  const [applicationIdFromUrl, setApplicationIdFromUrl] = useState<string | null>(null);
  const isOrganizerView = user?.role === 'ORGANIZER';
  const isQueryEnabled = !!user?._id && isOrganizerView;

  // Charger les candidatures avec React Query
  const { data: applicationsData, isLoading: loading, error: applicationsError } = useQuery({
    queryKey: ['applications', selectedEventId],
    queryFn: async () => {
      if (!user?._id) {
        throw new Error("Vous devez être connecté pour voir les candidatures.");
      }
      const query = selectedEventId !== 'all' ? `?eventId=${encodeURIComponent(selectedEventId)}` : '';
      const res = await api.get<IApplication[]>(`/applications${query}`);
      const list = Array.isArray(res.data)
        ? res.data
        : (Array.isArray((res.data as any)?.applications) ? (res.data as any).applications : []);
      
      // Log pour déboguer les zones de mobilité
      list.forEach((app: IApplication, idx: number) => {
        if (app.comedian?.profile?.mobilityZone) {
        }
      });

      return list as IApplication[];
    },
    enabled: !!user,
  });

  const applications = applicationsData || [];
  const error = applicationsError ? (applicationsError as any).response?.data?.message || (applicationsError as any).message || 'Échec de la récupération des candidatures.' : null;

  // Charger les favoris d'humoristes depuis l'API
  const { data: favoritesData, refetch: refetchFavorites } = useQuery<{ favorites: IUser[] }, Error>({
    queryKey: ['organizerFavorites', user?._id],
    queryFn: async () => {
      if (!user?._id || user?.role !== 'ORGANIZER') {
        throw new Error("Informations d'authentification manquantes.");
      }
      const response = await getFavorites();
      return response;
    },
    enabled: isQueryEnabled,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  // Charger les favoris de candidatures depuis l'API
  const { data: applicationFavoritesData, refetch: refetchApplicationFavorites } = useQuery<{ favorites: IApplication[] }, Error>({
    queryKey: ['organizerApplicationFavorites', user?._id],
    queryFn: async () => {
      if (!user?._id || user?.role !== 'ORGANIZER') {
        throw new Error("Informations d'authentification manquantes.");
      }
      const response = await getApplicationFavorites();
      return response;
    },
    enabled: isQueryEnabled,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  // Extraire les IDs des comédiens favoris
  useEffect(() => {
    if (favoritesData?.favorites) {
      const favoriteIds = favoritesData.favorites.map((comedian: IUser) => comedian._id);
      setFavoriteComedianIds(favoriteIds);
    } else if (!isOrganizerView) {
      setFavoriteComedianIds([]);
    }
  }, [favoritesData, isOrganizerView]);

  // Extraire les IDs des candidatures favorites
  useEffect(() => {
    if (applicationFavoritesData?.favorites) {
      const favoriteIds = applicationFavoritesData.favorites.map((application: IApplication) => application._id);
      setFavoriteApplicationIds(favoriteIds);
    } else if (!isOrganizerView) {
      setFavoriteApplicationIds([]);
    }
  }, [applicationFavoritesData, isOrganizerView]);

  const toggleFavoriteApplication = async (appId: string) => {
    if (!isOrganizerView || !user?._id) return;
    
    const app = applications.find(a => a._id === appId);
    if (!app) {
      return;
    }

    const isCurrentlyFavorite = favoriteApplicationIdsSet.has(appId);
    
    // Optimistic update
    setFavoriteApplicationIds(prev => {
      const updated = new Set(prev);
      if (isCurrentlyFavorite) {
        updated.delete(appId);
      } else {
        updated.add(appId);
      }
      return Array.from(updated);
    });

    try {
      if (isCurrentlyFavorite) {
        await removeApplicationFavorite(appId);
      } else {
        await addApplicationFavorite(appId);
      }
      // Rafraîchir les favoris depuis l'API pour s'assurer de la cohérence
      await refetchApplicationFavorites();
    } catch (error: any) {
      // Revert optimistic update en cas d'erreur
      setFavoriteApplicationIds(prev => {
        const updated = new Set(prev);
        if (isCurrentlyFavorite) {
          updated.add(appId);
        } else {
          updated.delete(appId);
        }
        return Array.from(updated);
      });
      showError(getErrorMessage(error, ErrorMessages.PROFILE_UPDATE_FAILED));
    }
  };

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  const getStatusFromUrlOrTab = () => {
    const queryParams = new URLSearchParams(location.search);
    const statusParam = queryParams.get('status');
    if (statusParam === 'favorites') {
      return 'favorites';
    }
    if (statusParam && ['PENDING', 'ACCEPTED', 'REJECTED'].includes(statusParam)) {
      return statusParam as OrganizerApplicationTab;
    }
    return 'all';
  };

  useEffect(() => {
    setSelectedTab(getStatusFromUrlOrTab());
  }, [location.search]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const appIdParam = params.get('applicationId');
    setApplicationIdFromUrl(appIdParam);
  }, [location.search]);

  // Affichage message après action email (?update=kept|withdrawn)
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const update = params.get('update');
    if (update === 'kept') {
      showInfo(InfoMessages.ORGANIZER_APPLICATION_CONFIRMED);
    } else if (update === 'withdrawn') {
      showInfo(InfoMessages.ORGANIZER_APPLICATION_WITHDRAWN);
    }
  }, [location.search, showInfo]);

  // Synchronise l'onglet COMEDIAN depuis ?tab= (ex: clic notif → accepted/rejected/cancelled)
  useEffect(() => {
    if (user?.role !== 'COMEDIAN') return;
    const params = new URLSearchParams(location.search);
    const tab = params.get('tab');
    if (tab && VALID_COMEDIAN_TABS.includes(tab as ComedianApplicationTab)) {
      setComedianTab(tab as ComedianApplicationTab);
    }
  }, [location.search, user?.role]);

  // Auto-switch du tab COMEDIAN quand ?applicationId= est présent sans ?tab= (#8)
  useEffect(() => {
    if (user?.role !== 'COMEDIAN') return;
    if (!applicationIdFromUrl) return;
    const params = new URLSearchParams(location.search);
    if (params.get('tab')) return; // tab explicite → déjà géré par l'effet précédent
    const found = applications.find(app => app._id === applicationIdFromUrl);
    if (!found) return;
    const status = found.status;
    if (status === 'PENDING') {
      setComedianTab('pending');
    } else if (status === 'ACCEPTED') {
      setComedianTab('accepted');
    } else if (status === 'REJECTED') {
      setComedianTab('rejected');
    } else {
      // WITHDRAWN / EXPIRED / CANCELLED_BY_PLATFORM
      const isPast = found.event?.date ? new Date(found.event.date) < new Date() : false;
      setComedianTab(isPast ? 'archived' : 'cancelled');
    }
  }, [applicationIdFromUrl, applications, user?.role, location.search]);

  // Scroll + highlight de la candidature ciblée via ?applicationId= (clic depuis notif)
  useEffect(() => {
    if (!applicationIdFromUrl || loading || !applications.length) return;
    const timer = setTimeout(() => {
      const node = document.querySelector<HTMLElement>(`[data-application-id="${applicationIdFromUrl}"]`);
      if (!node) return;
      node.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const previousOutline = node.style.outline;
      const previousOffset = node.style.outlineOffset;
      node.style.outline = '3px solid #ff416c';
      node.style.outlineOffset = '2px';
      setTimeout(() => {
        node.style.outline = previousOutline;
        node.style.outlineOffset = previousOffset;
      }, 2000);
    }, 350);
    return () => clearTimeout(timer);
  }, [applicationIdFromUrl, applications, loading, comedianTab, selectedTab]);

  // Charger les évènements de l'organisateur pour le sélecteur
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedTab, selectedEventId, comedianFilter, sortKey, applications.length, eventZoneSearch, organizerExperienceFilter]);
  const organizerFilteredApplications = user?.role === 'ORGANIZER'
    ? getFilteredApplications().filter(app => app.event && app.comedian && app.event.organizer)
    : [];

  const totalOrganizerPages = Math.max(1, Math.ceil(organizerFilteredApplications.length / ITEMS_PER_PAGE));

  useEffect(() => {
    if (currentPage > totalOrganizerPages) {
      setCurrentPage(totalOrganizerPages);
    }
  }, [totalOrganizerPages, currentPage]);

  const paginatedOrganizerApplications = organizerFilteredApplications.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const clearApplicationParam = () => {
    const params = new URLSearchParams(location.search);
    if (!params.has('applicationId')) return;
    params.delete('applicationId');
    const newSearch = params.toString();
    navigate(newSearch ? `${location.pathname}?${newSearch}` : location.pathname, { replace: true });
  };

  const closeApplicationModal = () => {
    setIsModalOpen(false);
    setSelectedApplication(null);
    clearApplicationParam();
  };

  const openStatusModal = (appId: string, status: 'ACCEPTED' | 'REJECTED') => {
    setStatusAppId(appId);
    setStatusToSet(status);
    setStatusMessage('');
    setShowStatusModal(true);
    setTimeout(() => messageInputRef.current?.focus(), 100);
  };

  const closeStatusModal = () => {
    setShowStatusModal(false);
    setStatusToSet(null);
    setStatusAppId(null);
    setStatusMessage('');
  };

  const handleConfirmStatus = async () => {
    if (!user?._id || !statusAppId || !statusToSet) return;
    try {
      await api.put(`/applications/${statusAppId}/status`, { status: statusToSet, organizerMessage: statusMessage });
      showSuccess(`Candidature ${statusToSet === 'ACCEPTED' ? 'acceptée' : 'refusée'} avec succès !`);
      queryClient.invalidateQueries({ queryKey: ['applications'] });
      refreshUser();
      closeStatusModal();
    } catch (err: any) {
      showError(getErrorMessage(err, ErrorMessages.APPLICATION_UPDATE_FAILED));
    }
  };

  const handleTabChange = (status: OrganizerApplicationTab) => {
    setSelectedTab(status);
    if (status === 'all') {
      navigate('/applications');
    } else if (status === 'favorites') {
      navigate('/applications?status=favorites');
    } else {
      navigate(`/applications?status=${status}`);
    }
  };

  // Récupérer la liste unique des humoristes
  const uniqueComedians = Array.from(new Set(applications.map(app => app.comedian ? `${app.comedian._id}::${app.comedian.firstName} ${app.comedian.lastName}` : '')))
    .filter(Boolean)
    .map(str => {
      const [id, name] = str.split('::');
      return { id, name };
    });

  // Fonction de filtrage combinée
  function getFilteredApplications(): IApplication[] {
    let filtered = applications;
    if (selectedTab !== 'all' && selectedTab !== 'favorites') {
      filtered = filtered.filter(app => app.status === selectedTab);
    }
    // Filtre par humoriste: seulement utile côté ORGANIZER
    if (user?.role === 'ORGANIZER' && comedianFilter !== 'all') {
      filtered = filtered.filter(app => app.comedian && app.comedian._id === comedianFilter);
    }
    
    // Filtre par zone d'événement (recherche par zone de mobilité compatible)
    if (user?.role === 'ORGANIZER' && eventZoneSearch.trim()) {
      const searchTerm = eventZoneSearch.trim();
      const searchNormalized = normalizeString(searchTerm);
      
      filtered = filtered.filter(app => {
        const mobilityZones = app.comedian?.profile?.mobilityZone;
        
        // Si l'humoriste n'a pas de zones de mobilité, on ne l'affiche pas
        if (!mobilityZones || mobilityZones.length === 0) {
          return false;
        }
        
        // Déterminer le type de recherche (ville, département ou région)
        // On essaie de deviner le type en fonction du format
        let searchType: 'ville' | 'departement' | 'region' = 'ville';
        
        // Si c'est un numéro à 2 chiffres (ou 2A, 2B), c'est probablement un département
        if (/^\d{1,2}[AB]?$/.test(searchTerm.toUpperCase())) {
          searchType = 'departement';
        } else {
          // Vérifier si c'est une région connue
          const knownRegions = [
            'Auvergne-Rhône-Alpes', 'Bourgogne-Franche-Comté', 'Bretagne',
            'Centre-Val de Loire', 'Corse', 'Grand Est', 'Hauts-de-France',
            'Île-de-France', 'Normandie', 'Nouvelle-Aquitaine', 'Occitanie',
            'Pays de la Loire', "Provence-Alpes-Côte d'Azur"
          ];
          const isRegion = knownRegions.some(region => 
            normalizeString(region) === searchNormalized
          );
          if (isRegion) {
            searchType = 'region';
          }
        }
        
        const searchZone = { type: searchType, value: searchTerm };
        
        // Vérifier si la recherche correspond à une zone de mobilité de l'humoriste
        const matches = matchesMobilityZones(searchZone, mobilityZones);
        
        if (matches) {
          return true;
        }
        
        // Vérifier aussi si la recherche correspond directement à une zone de mobilité
        // (match partiel dans le nom)
        const directMatch = mobilityZones.some(zone => {
          const zoneNormalized = normalizeString(zone.value);
          return zoneNormalized.includes(searchNormalized) || searchNormalized.includes(zoneNormalized);
        });
        
        return directMatch;
      });
    }
    
    // Filtre par niveau d'expérience (organisateur)
    if (user?.role === 'ORGANIZER' && organizerExperienceFilter !== 'all') {
      filtered = filtered.filter(app => {
        const comedianLevel = app.comedian?.profile?.numberOfScenes;
        if (!comedianLevel) return false;
        return comedianLevel === organizerExperienceFilter;
      });
    }
    
    // Tri
    const sortByStatusOrder = (a: IApplication['status'], b: IApplication['status']) => {
      const order = ['PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED'];
      return order.indexOf(a) - order.indexOf(b);
    };
    const sorted = [...filtered].sort((a, b) => {
      if (sortKey === 'dateAsc') {
        // Vérifier que les évènements et leurs dates existent
        if (!a.event || !a.event.date || !b.event || !b.event.date) return 0;
        return new Date(a.event.date).getTime() - new Date(b.event.date).getTime();
      }
      if (sortKey === 'dateDesc') {
        // Vérifier que les évènements et leurs dates existent
        if (!a.event || !a.event.date || !b.event || !b.event.date) return 0;
        return new Date(b.event.date).getTime() - new Date(a.event.date).getTime();
      }
      if (sortKey === 'statusAsc') {
        return sortByStatusOrder(a.status, b.status);
      }
      if (sortKey === 'statusDesc') {
        return sortByStatusOrder(b.status, a.status);
      }
      return 0;
    });
    const withFavoritesFilter = selectedTab === 'favorites'
      ? sorted.filter(app => favoriteApplicationIdsSet.has(app._id))
      : sorted;

    return withFavoritesFilter;
  }

  // Fonctions de filtrage pour les onglets humoriste
  const todayMidnight = new Date();
  todayMidnight.setHours(0, 0, 0, 0);

  const isEventUpcoming = (eventDate: string): boolean => {
    if (!eventDate) return false;
    const eventDateObj = new Date(eventDate);
    eventDateObj.setHours(0, 0, 0, 0);
    return eventDateObj >= todayMidnight;
  };

  const isEventPast = (eventDate: string): boolean => {
    if (!eventDate) return false;
    const eventDateObj = new Date(eventDate);
    eventDateObj.setHours(0, 0, 0, 0);
    return eventDateObj < todayMidnight;
  };

  /** true si l'événement commence dans moins d'1 h ou a déjà commencé → plus de désinscription possible */
  const isEventWithinOneHour = (event: { date?: string; startTime?: string } | null): boolean => {
    if (!event?.date) return false;
    const dateStr = typeof event.date === 'string' ? event.date.split('T')[0] : new Date(event.date).toISOString().split('T')[0];
    const startTime = (event.startTime || '00:00').trim();
    const eventStart = new Date(dateStr + 'T' + startTime + ':00');
    const oneHourFromNow = Date.now() + 60 * 60 * 1000;
    return eventStart.getTime() <= oneHourFromNow;
  };

  // Extraction des organisateurs uniques pour le filtre du tab "accepted"
  const getAcceptedOrganizers = () => {
    return Array.from(
      new Set(
        applications
          .filter(app =>
            app.status === 'ACCEPTED' &&
            app.event?.date &&
            isEventUpcoming(app.event.date) &&
            app.event?.organizer
          )
          .map(app => `${app.event.organizer._id}::${app.event.organizer.firstName} ${app.event.organizer.lastName}`)
      )
    ).map(str => {
      const [id, name] = str.split('::');
      return { id, name };
    });
  };

  const acceptedOrganizers = user?.role === 'COMEDIAN' ? getAcceptedOrganizers() : [];

  const isEventCancelled = (event: IApplication['event']) =>
    event?.status === 'CANCELLED' || event?.status === 'cancelled';

  const getComedianFilteredApplications = (): IApplication[] => {
    const base = applications.filter(app => app.event);

    // Étape 1: Filtrage par tab (switch existant)
    let tabFiltered: IApplication[] = [];
    switch (comedianTab) {
      case 'accepted':
        tabFiltered = base.filter(app =>
          app.status === 'ACCEPTED' &&
          app.event?.date &&
          isEventUpcoming(app.event.date) &&
          !isEventCancelled(app.event)
        );
        break;
      case 'pending':
        tabFiltered = base.filter(app =>
          app.status === 'PENDING' &&
          app.event?.date &&
          isEventUpcoming(app.event.date) &&
          !isEventCancelled(app.event)
        );
        break;
      case 'rejected':
        tabFiltered = base.filter(app =>
          app.status === 'REJECTED' &&
          app.event?.date &&
          isEventUpcoming(app.event.date)
        );
        break;
      case 'archived':
        tabFiltered = base.filter(app =>
          app.event?.date &&
          isEventPast(app.event.date) &&
          app.status !== 'PENDING' &&
          !isEventCancelled(app.event)
        );
        break;
      case 'cancelled':
        tabFiltered = base.filter(app => isEventCancelled(app.event));
        break;
      default:
        return [];
    }

    // Étape 2: Filtre organisateur (tab "accepted")
    let filtered = tabFiltered;
    if (comedianTab === 'accepted' && comedianOrganizerFilter !== 'all') {
      filtered = filtered.filter(app =>
        app.event.organizer._id === comedianOrganizerFilter
      );
    }

    // Étape 3: Filtre outcome (tab "archived")
    if (comedianTab === 'archived' && archivedOutcomeFilter !== 'all') {
      filtered = filtered.filter(app => app.status === archivedOutcomeFilter);
    }

    // Étape 4: Tri par date
    const sorted = [...filtered].sort((a, b) => {
      if (!a.event?.date || !b.event?.date) return 0;

      const dateA = new Date(a.event.date).getTime();
      const dateB = new Date(b.event.date).getTime();

      return comedianSortKey === 'dateAsc' ? dateA - dateB : dateB - dateA;
    });

    return sorted;
  };

  const comedianFilteredApplications = user?.role === 'COMEDIAN' 
    ? getComedianFilteredApplications() 
    : [];

  const comedianTabCounts = {
    accepted: applications.filter(app =>
      app.status === 'ACCEPTED' &&
      app.event?.date &&
      isEventUpcoming(app.event.date) &&
      !isEventCancelled(app.event)
    ).length,
    pending: applications.filter(app =>
      app.status === 'PENDING' &&
      app.event?.date &&
      isEventUpcoming(app.event.date) &&
      !isEventCancelled(app.event)
    ).length,
    rejected: applications.filter(app =>
      app.status === 'REJECTED' &&
      app.event?.date &&
      isEventUpcoming(app.event.date)
    ).length,
    archived: applications.filter(app =>
      app.event?.date &&
      isEventPast(app.event.date) &&
      app.status !== 'PENDING' &&
      !isEventCancelled(app.event)
    ).length,
    cancelled: applications.filter(app => isEventCancelled(app.event)).length,
  };

  const comedianTabTitles: Record<ComedianApplicationTab, string> = {
    accepted: 'Acceptées',
    pending: 'En attente',
    rejected: 'Refusées',
    archived: 'Archivées',
    cancelled: 'Annulées',
  };

  const comedianEmptyStates: Record<ComedianApplicationTab, string> = {
    accepted: 'Aucune candidature acceptée à venir.',
    pending: 'Aucune candidature en attente.',
    rejected: 'Aucune candidature refusée à venir.',
    archived: 'Aucune candidature archivée.',
    cancelled: 'Aucun évènement annulé.',
  };

  // Pagination pour les candidatures humoriste
  const totalComedianPages = Math.max(1, Math.ceil(comedianFilteredApplications.length / ITEMS_PER_PAGE));
  const [comedianPage, setComedianPage] = useState(1);

  useEffect(() => {
    setComedianPage(1);
    // Réinitialiser tous les filtres au changement de tab
    setComedianOrganizerFilter('all');
    setArchivedOutcomeFilter('all');
    setComedianSortKey('dateDesc');
  }, [comedianTab]);

  useEffect(() => {
    setComedianPage(1);
  }, [comedianSortKey, comedianOrganizerFilter, archivedOutcomeFilter, comedianFilteredApplications.length]);

  useEffect(() => {
    if (comedianPage > totalComedianPages) {
      setComedianPage(totalComedianPages);
    }
  }, [comedianPage, totalComedianPages]);

  const paginatedComedianApplications = comedianFilteredApplications.slice(
    (comedianPage - 1) * ITEMS_PER_PAGE,
    comedianPage * ITEMS_PER_PAGE
  );

  const allApplicationsCount = applications.length;
  const pendingApplicationsCount = applications.filter(app => app.status === 'PENDING').length;
  const acceptedApplicationsCount = applications.filter(app => app.status === 'ACCEPTED').length;
  const rejectedApplicationsCount = applications.filter(app => app.status === 'REJECTED').length;
  const favoriteApplicationsCount = applications.filter(app => favoriteApplicationIdsSet.has(app._id)).length;

  const organizerTabsConfig: Array<{ id: OrganizerApplicationTab; label: string; count: number }> = [
    { id: 'all', label: 'Toutes', count: allApplicationsCount },
    { id: 'PENDING', label: 'En attente', count: pendingApplicationsCount },
    { id: 'ACCEPTED', label: 'Acceptées', count: acceptedApplicationsCount },
    { id: 'REJECTED', label: 'Refusées', count: rejectedApplicationsCount },
    { id: 'favorites', label: 'Favoris', count: favoriteApplicationsCount },
  ];

  const mainContainerStyle: CSSProperties = {
    minHeight: '100vh',
    color: '#ffffff',
    padding: isMobile ? '16px 12px' : '20px',
    background: 'linear-gradient(to bottom right, #1a1a2e, #331f41)',
  };

  const pageHeaderStyle: CSSProperties = {
    padding: isMobile ? '10px 0 20px' : '20px',
    maxWidth: '1200px',
    margin: '0 auto',
    display: 'flex',
    flexDirection: isMobile ? 'column' : 'row',
    justifyContent: 'space-between',
    alignItems: isMobile ? 'flex-start' : 'center',
    gap: isMobile ? '12px' : 0,
    marginBottom: '30px',
  };

  const titleStyle: CSSProperties = {
    fontSize: '2.5em',
    color: '#ff416c',
  };

  const subtitleStyle: CSSProperties = {
    fontSize: '1.1em',
    color: '#aaa',
    marginBottom: '20px',
  };

  const contentContainerStyle: CSSProperties = {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: isMobile ? '16px' : '20px',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: '8px',
    boxShadow: '0 4px 8px rgba(0, 0, 0, 0.3)',
  };

  const applicationsListStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: isMobile ? '12px' : '16px',
    marginTop: '20px',
  };

  const applicationCardStyle: CSSProperties = {
    backgroundColor: '#1a1a2e',
    borderRadius: '12px',
    padding: isMobile ? '16px' : '20px',
    boxShadow: '0 4px 10px rgba(0, 0, 0, 0.5)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    display: 'flex',
    flexDirection: isMobile ? 'column' : 'row',
    alignItems: isMobile ? 'stretch' : 'center',
    gap: isMobile ? '14px' : '20px',
    cursor: 'pointer',
    transition: 'transform 0.2s ease, box-shadow 0.2s ease',
    flexWrap: isMobile ? 'nowrap' : 'wrap',
  };

  /** Fond jaune très clair lorsque la candidature est en attente */
  const applicationCardStylePending: CSSProperties = {
    backgroundColor: '#FFFDE7',
    border: '1px solid #FFF9C4',
    color: '#1a1a1a',
  };

  /** Fond vert lorsque la candidature est acceptée (comme pour les évènements complets) */
  const applicationCardStyleAccepted: CSSProperties = {
    backgroundColor: '#E1FFE6',
    border: '1px solid #c8f0d0',
    color: '#1a1a1a',
  };

  /** Fond rouge clair lorsque la candidature est refusée (comme dans la capture) */
  const applicationCardStyleRejected: CSSProperties = {
    backgroundColor: '#FFEBEE',
    border: '1px solid #ffcdd2',
    color: '#1a1a1a',
  };

  /** Fond blanc lorsque la candidature est expirée (comme dans la page évènements) */
  const applicationCardStyleExpired: CSSProperties = {
    backgroundColor: '#ffffff',
    border: '1px solid rgba(0, 0, 0, 0.08)',
    color: '#1a1a1a',
  };

  /** Fond gris lorsque la candidature est retirée (WITHDRAWN) */
  const applicationCardStyleWithdrawn: CSSProperties = {
    backgroundColor: '#f5f5f5',
    border: '1px solid #e0e0e0',
    color: '#1a1a1a',
  };

  const cardTitleStyle: CSSProperties = {
    fontSize: '1.4em',
    color: '#ff4b2b',
    marginBottom: '10px',
  };

  const cardDetailStyle: CSSProperties = {
    fontSize: '0.9em',
    color: '#ccc',
    marginBottom: '5px',
  };

  const comedianInfoStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: isMobile ? '12px' : '16px',
    flex: '1',
    minWidth: 0,
    width: isMobile ? '100%' : 'auto',
    flexWrap: isMobile ? 'wrap' : 'nowrap',
  };

  const comedianDetailsStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    minWidth: 0,
    flex: isMobile ? '1 1 auto' : undefined,
  };

  const comedianInitialBubbleStyle: CSSProperties = {
    width: isMobile ? '48px' : '56px',
    height: isMobile ? '48px' : '56px',
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 700,
    fontSize: '1.2em',
    textTransform: 'uppercase',
    flexShrink: 0,
    overflow: 'hidden'
  };

  const comedianNameTextStyle: CSSProperties = {
    fontSize: '1.1em',
    fontWeight: 700,
    color: '#fff',
    margin: 0,
  };

  const comedianRoleTextStyle: CSSProperties = {
    fontSize: '0.85em',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: 'rgba(255, 255, 255, 0.7)',
    margin: 0,
  };

  const viewProfileInlineButtonStyle: CSSProperties = {
    padding: '8px 14px',
    borderRadius: '8px',
    border: '1px solid rgba(255, 255, 255, 0.3)',
    background: 'rgba(0, 0, 0, 0.2)',
    color: '#fff',
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    justifyContent: 'center',
    width: isMobile ? '100%' : 'auto',
  };

  const eventInfoStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    flex: '1',
    minWidth: 0,
    width: isMobile ? '100%' : 'auto',
  };

  const eventTitleStyle: CSSProperties = {
    fontSize: '1.2em',
    color: '#ff4b2b',
    margin: 0,
    fontWeight: 700,
  };

  const eventDateStyle: CSSProperties = {
    fontSize: '0.9em',
    color: '#aaa',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    margin: 0,
  };

  const cardRightSectionStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: isMobile ? 'stretch' : 'flex-end',
    gap: '12px',
    flexShrink: 0,
    width: isMobile ? '100%' : 'auto',
  };

  const actionsContainerStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: isMobile ? '8px' : '10px',
    flexWrap: 'wrap',
    width: isMobile ? '100%' : 'auto',
    justifyContent: isMobile ? 'space-between' : 'flex-end',
  };

  const comedianApplicationRowStyle: CSSProperties = {
    display: 'flex',
    flexDirection: isMobile ? 'column' : 'row',
    gap: isMobile ? '12px' : '20px',
    alignItems: isMobile ? 'flex-start' : 'center',
    width: '100%',
  };

  const comedianApplicationInfoStyle: CSSProperties = {
    flex: '1 1 auto',
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
  };

  const comedianApplicationDateBadgeStyle: CSSProperties = {
    padding: '4px 12px',
    borderRadius: '999px',
    border: '1px solid rgba(255, 255, 255, 0.15)',
    color: '#fff',
    fontSize: '0.85em',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    whiteSpace: 'nowrap',
  };

  const comedianApplicationStatusStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    flexShrink: 0,
    alignItems: isMobile ? 'stretch' : 'flex-end',
    width: isMobile ? '100%' : 'auto',
  };

  const statusBadgeStyle = (status: IApplication['status']): CSSProperties => {
    let backgroundColor = '';
    let color = '#ffffff';
    switch (status) {
      case 'PENDING':
        backgroundColor = '#ffc107'; // yellow
        color = '#333';
        break;
      case 'ACCEPTED':
        backgroundColor = 'transparent'; // pas de fond vert
        color = '#28a745'; // texte vert
        break;
      case 'REJECTED':
        backgroundColor = 'transparent'; // pas de fond rouge
        color = '#dc3545'; // texte rouge
        break;
      case 'EXPIRED':
        backgroundColor = 'transparent'; // pas de fond gris
        color = '#999'; // texte gris
        break;
      case 'WITHDRAWN':
      case 'CANCELLED_BY_PLATFORM':
        backgroundColor = 'transparent';
        color = '#6c757d';
        break;
      default:
        backgroundColor = '#6c757d'; // gray
    }
    return {
      display: 'inline-block',
      padding: '6px 12px',
      borderRadius: '6px',
      backgroundColor: (status === 'ACCEPTED' || status === 'REJECTED' || status === 'EXPIRED' || status === 'WITHDRAWN' || status === 'CANCELLED_BY_PLATFORM') ? 'transparent' : backgroundColor,
      color: status === 'ACCEPTED' ? '#28a745' : (status === 'REJECTED' ? '#dc3545' : (status === 'EXPIRED' ? '#999' : (status === 'WITHDRAWN' || status === 'CANCELLED_BY_PLATFORM' ? '#6c757d' : color))),
      fontWeight: 'bold',
      fontSize: '0.9em',
      border: status === 'ACCEPTED' ? 'none' : undefined,
      width: isMobile ? '100%' : 'auto',
      textAlign: isMobile ? 'center' : 'left',
    };
  };

  const translateStatus = (status: IApplication['status']): string => {
    switch (status) {
      case 'PENDING':
        return 'En attente';
      case 'ACCEPTED':
        return 'Acceptée';
      case 'REJECTED':
        return 'Refusée';
      case 'EXPIRED':
        return 'Expirée';
      case 'WITHDRAWN':
        return 'Retirée';
      case 'CANCELLED_BY_PLATFORM':
        return 'Annulée par la plateforme';
      default:
        return status; // Fallback for other statuses not directly related to application (e.g., event status)
    }
  };

  const actionButtonStyle: CSSProperties = {
    padding: '8px 15px',
    borderRadius: '5px',
    border: 'none',
    color: 'white',
    fontWeight: 'bold',
    cursor: 'pointer',
    transition: 'background 0.3s ease',
    marginTop: '10px',
    marginRight: '10px',
  };

  const acceptButtonStyle: CSSProperties = {
    ...actionButtonStyle,
    backgroundColor: '#28a745', // Green
    marginTop: 0,
    marginRight: 0,
    flex: isMobile ? 1 : undefined,
  };

  const rejectButtonStyle: CSSProperties = {
    ...actionButtonStyle,
    backgroundColor: '#dc3545', // Red
    marginTop: 0,
    marginRight: 0,
    flex: isMobile ? 1 : undefined,
  };

  const handleViewComedianProfile = (
    e: React.MouseEvent<HTMLButtonElement>,
    comedianId: string,
    applicationId?: string
  ) => {
    e.stopPropagation();
    const params = new URLSearchParams();
    params.set('from', 'applications');
    if (applicationId) {
      params.set('applicationId', applicationId);
    }
    navigate(`/profile/comedian/${comedianId}?${params.toString()}`);
  };

  const organizerTabsContainerStyle: CSSProperties = {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '12px',
    marginBottom: '16px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
    paddingBottom: '12px',
  };

  const organizerTabButtonStyle = (isActive: boolean): CSSProperties => ({
    padding: '10px 18px',
    borderRadius: '999px',
    border: isActive ? '1px solid #ff4b2b' : '1px solid rgba(255, 255, 255, 0.2)',
    backgroundColor: isActive ? 'rgba(255, 65, 108, 0.15)' : 'rgba(0, 0, 0, 0.25)',
    color: isActive ? '#ff4b2b' : '#ddd',
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

  const filtersRowStyle: CSSProperties = {
    display: 'flex',
    gap: '10px',
    marginBottom: '20px',
    flexWrap: 'wrap',
    alignItems: 'center',
  };

  const paginationContainerStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    marginTop: '20px',
    flexWrap: 'wrap',
  };

  const paginationButtonStyle: CSSProperties = {
    padding: '8px 14px',
    borderRadius: '6px',
    border: '1px solid rgba(255, 255, 255, 0.3)',
    backgroundColor: '#331f41',
    color: '#fff',
    fontWeight: 600,
    cursor: 'pointer',
    minWidth: '100px',
    opacity: 1,
    transition: 'opacity 0.2s, transform 0.2s',
  };

  const paginationInfoStyle: CSSProperties = {
    color: '#ddd',
    fontWeight: 600,
  };

  const favoriteStarButtonStyle = (isActive: boolean): CSSProperties => ({
    background: 'none',
    border: 'none',
    color: isActive ? '#ffd700' : '#bbb',
    fontSize: '1.4em',
    cursor: 'pointer',
    padding: 0,
    lineHeight: 1,
    transition: 'color 0.2s ease, transform 0.2s ease',
  });

  // Styles pour les onglets humoriste
  const comedianTabsContainerStyle: CSSProperties = {
    display: 'flex',
    gap: '8px',
    marginBottom: '20px',
    flexWrap: 'wrap',
    borderBottom: '2px solid rgba(255, 255, 255, 0.1)',
    paddingBottom: '10px',
  };

  const comedianTabButtonStyle = (isActive: boolean): CSSProperties => ({
    padding: '10px 16px',
    borderRadius: '8px 8px 0 0',
    border: 'none',
    backgroundColor: isActive ? 'rgba(255, 65, 108, 0.2)' : 'transparent',
    color: isActive ? '#ff416c' : '#aaa',
    fontWeight: isActive ? 'bold' : 'normal',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    borderBottom: isActive ? '2px solid #ff416c' : '2px solid transparent',
    fontSize: '0.95em',
  });

  const comedianTabTitleStyle: CSSProperties = {
    display: 'block',
    fontSize: '1em',
  };

  const comedianTabCountStyle: CSSProperties = {
    display: 'block',
    fontSize: '0.85em',
    opacity: 0.8,
    marginTop: '2px',
  };

  // Détermine si l'évènement a été modifié par l'organisateur
  const wasEventUpdatedAfterApplication = (app: IApplication): boolean => {
    // Utiliser le champ modifiedByOrganizer qui est défini uniquement lors de vraies modifications
    return Boolean(app?.event?.modifiedByOrganizer);
  };

  return (
    <div style={mainContainerStyle}>
      <Navbar />
      <div style={pageHeaderStyle}>
        <div>
          <h1 style={titleStyle}>{user?.role === 'ORGANIZER' ? 'Gérer les Candidatures' : 'Mes Candidatures'}</h1>
          <p style={subtitleStyle}>
            {user?.role === 'ORGANIZER' 
              ? 'Visualisez et gérez toutes les candidatures pour vos évènements.'
              : 'Visualisez le statut de vos candidatures.'}
          </p>
        </div>
      </div>

      <div style={contentContainerStyle}>
        {/* Onglets pour humoriste */}
        {user?.role === 'COMEDIAN' && (
          <div style={comedianTabsContainerStyle}>
            {(['accepted', 'pending', 'rejected', 'archived', 'cancelled'] as ComedianApplicationTab[]).map((tabId) => (
              <button
                key={tabId}
                style={comedianTabButtonStyle(comedianTab === tabId)}
                onClick={() => setComedianTab(tabId)}
              >
                <span style={comedianTabTitleStyle}>{comedianTabTitles[tabId]}</span>
                <span style={comedianTabCountStyle}>{comedianTabCounts[tabId]} candidature(s)</span>
              </button>
            ))}
          </div>
        )}

        {/* Onglets pour organisateur */}
        {user?.role === 'ORGANIZER' && (
          <div style={organizerTabsContainerStyle}>
            {organizerTabsConfig.map(tab => (
              <button
                key={tab.id}
                style={organizerTabButtonStyle(selectedTab === tab.id)}
                onClick={() => handleTabChange(tab.id)}
              >
                <span>{tab.label}</span>
                <span style={organizerTabCountStyle}>{tab.count}</span>
              </button>
            ))}
          </div>
        )}

        <div style={filtersRowStyle}>
          {/* FILTRES ORGANISATEUR - Garder l'existant */}
          {user?.role === 'ORGANIZER' && (
            <>
              <select
                value={comedianFilter}
                onChange={e => setComedianFilter(e.target.value)}
                style={{ padding: '8px', borderRadius: '6px', border: '1px solid #444', background: '#222', color: '#fff', minWidth: 180 }}
              >
                <option value="all">Tous les humoristes</option>
                {uniqueComedians.map(comedian => (
                  <option key={comedian.id} value={comedian.id}>{comedian.name}</option>
                ))}
              </select>

              <select
                value={sortKey}
                onChange={e => setSortKey(e.target.value as any)}
                style={{ padding: '8px', borderRadius: '6px', border: '1px solid #444', background: '#222', color: '#fff', minWidth: 220, marginLeft: 'auto' }}
              >
                <option value="dateDesc">Trier: Date (plus récent)</option>
                <option value="dateAsc">Trier: Date (plus ancien)</option>
                <option value="statusAsc">Trier: Statut (En attente→Acceptée→Refusée)</option>
                <option value="statusDesc">Trier: Statut (Refusée→Acceptée→En attente)</option>
              </select>
            </>
          )}

          {/* FILTRES HUMORISTE - Nouveaux filtres conditionnels */}
          {user?.role === 'COMEDIAN' && (
            <>
              {/* TAB "ACCEPTED": Filtre organisateur + Tri */}
              {comedianTab === 'accepted' && (
                <>
                  <select
                    value={comedianOrganizerFilter}
                    onChange={e => setComedianOrganizerFilter(e.target.value)}
                    style={{ padding: '8px', borderRadius: '6px', border: '1px solid #444', background: '#222', color: '#fff', minWidth: 200 }}
                  >
                    <option value="all">Tous les organisateurs</option>
                    {acceptedOrganizers.map(org => (
                      <option key={org.id} value={org.id}>{org.name}</option>
                    ))}
                  </select>
                  <select
                    value={comedianSortKey}
                    onChange={e => setComedianSortKey(e.target.value as 'dateAsc' | 'dateDesc')}
                    style={{ padding: '8px', borderRadius: '6px', border: '1px solid #444', background: '#222', color: '#fff', minWidth: 200 }}
                  >
                    <option value="dateDesc">Trier: Date (plus récent)</option>
                    <option value="dateAsc">Trier: Date (plus ancien)</option>
                  </select>
                </>
              )}

              {/* TABS "PENDING", "REJECTED", "CANCELLED": Tri uniquement */}
              {['pending', 'rejected', 'cancelled'].includes(comedianTab) && (
                <select
                  value={comedianSortKey}
                  onChange={e => setComedianSortKey(e.target.value as 'dateAsc' | 'dateDesc')}
                  style={{ padding: '8px', borderRadius: '6px', border: '1px solid #444', background: '#222', color: '#fff', minWidth: 200 }}
                >
                  <option value="dateDesc">Trier: Date (plus récent)</option>
                  <option value="dateAsc">Trier: Date (plus ancien)</option>
                </select>
              )}

              {/* TAB "ARCHIVED": Filtre outcome + Tri */}
              {comedianTab === 'archived' && (
                <>
                  <select
                    value={archivedOutcomeFilter}
                    onChange={e => setArchivedOutcomeFilter(e.target.value as any)}
                    style={{ padding: '8px', borderRadius: '6px', border: '1px solid #444', background: '#222', color: '#fff', minWidth: 180 }}
                  >
                    <option value="all">Tous les statuts</option>
                    <option value="ACCEPTED">Acceptées</option>
                    <option value="REJECTED">Refusées</option>
                    <option value="EXPIRED">Expirées</option>
                  </select>
                  <select
                    value={comedianSortKey}
                    onChange={e => setComedianSortKey(e.target.value as 'dateAsc' | 'dateDesc')}
                    style={{ padding: '8px', borderRadius: '6px', border: '1px solid #444', background: '#222', color: '#fff', minWidth: 200 }}
                  >
                    <option value="dateDesc">Trier: Date (plus récent)</option>
                    <option value="dateAsc">Trier: Date (plus ancien)</option>
                  </select>
                </>
              )}
            </>
          )}
        </div>

        {/* Barre de recherche par zone d'événement et filtre par niveau d'expérience (organisateur) */}
        {user?.role === 'ORGANIZER' && (
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
                  value={eventZoneSearch}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEventZoneSearch(e.target.value)}
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
                  value={organizerExperienceFilter}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setOrganizerExperienceFilter(e.target.value as 'all' | '0-50' | '50-200' | '200+')}
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
              {(eventZoneSearch.trim() || organizerExperienceFilter !== 'all') && (
                <button
                  onClick={() => {
                    setEventZoneSearch('');
                    setOrganizerExperienceFilter('all');
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
        )}

        {loading && <p style={{ textAlign: 'center', color: '#ccc' }}>Chargement des candidatures...</p>}
        {error && <p style={{ textAlign: 'center', color: '#dc3545' }}>Erreur: {error}</p>}
        
        {user?.role === 'COMEDIAN' ? (
          <>
            {!loading && !error && comedianFilteredApplications.length === 0 && (
              <p style={{ textAlign: 'center', fontSize: '1.2em', color: '#ccc' }}>
                {comedianEmptyStates[comedianTab]}
              </p>
            )}
            {!loading && !error && comedianFilteredApplications.length > 0 && (
              <>
                <div style={applicationsListStyle}>
                  {paginatedComedianApplications.map(app => (
                    <div
                      key={app._id}
                      data-application-id={app._id}
                      style={{
                        ...applicationCardStyle,
                        ...(app.status === 'PENDING' ? applicationCardStylePending : app.status === 'ACCEPTED' ? applicationCardStyleAccepted : app.status === 'REJECTED' ? applicationCardStyleRejected : app.status === 'EXPIRED' ? applicationCardStyleExpired : ((app.status === 'WITHDRAWN' || app.status === 'CANCELLED_BY_PLATFORM') || app.status === 'CANCELLED_BY_PLATFORM') ? applicationCardStyleWithdrawn : {}),
                      }}
                      onClick={() => { setSelectedApplication(app); setIsModalOpen(true); }}
                    >
                      <div style={comedianApplicationRowStyle}>
                        <div style={comedianApplicationInfoStyle}>
                          {app.event && <>
                          {/* Ligne 1 : Titre + Date */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: isMobile ? 'wrap' : 'nowrap', marginBottom: '8px' }}>
                            <h3 style={{ ...cardTitleStyle, margin: 0, lineHeight: 1.2, ...((app.status === 'PENDING' || app.status === 'ACCEPTED' || app.status === 'REJECTED' || app.status === 'EXPIRED' || (app.status === 'WITHDRAWN' || app.status === 'CANCELLED_BY_PLATFORM')) ? { color: '#1a1a1a' } : {}) }}>{app.event.title}</h3>
                            <span style={{ ...comedianApplicationDateBadgeStyle, display: 'inline-flex', alignItems: 'center', lineHeight: 1, ...((app.status === 'PENDING' || app.status === 'ACCEPTED' || app.status === 'REJECTED' || app.status === 'EXPIRED' || (app.status === 'WITHDRAWN' || app.status === 'CANCELLED_BY_PLATFORM')) ? { color: '#1a1a1a', border: '1px solid rgba(0,0,0,0.12)', backgroundColor: 'rgba(0,0,0,0.04)' } : {}) }}>
                              {app.event?.date ? new Date(app.event.date).toLocaleDateString() : 'Date non disponible'}
                            </span>
                          </div>

                          {/* Ligne 2 : Organisateur */}
                          <p style={{ ...cardDetailStyle, margin: 0, marginBottom: '4px', color: (app.status === 'PENDING' || app.status === 'ACCEPTED' || app.status === 'REJECTED' || app.status === 'EXPIRED' || (app.status === 'WITHDRAWN' || app.status === 'CANCELLED_BY_PLATFORM')) ? '#64748B' : '#9ad7ff' }}>
                            · Organisateur: {app.event.organizer?.firstName ?? ''} {app.event.organizer?.lastName ?? ''}
                          </p>

                          {/* Heure de l'évènement */}
                          {(app.event.startTime || app.event.endTime) && (
                            <p style={{ ...cardDetailStyle, margin: 0, marginBottom: '4px', color: (app.status === 'PENDING' || app.status === 'ACCEPTED' || app.status === 'REJECTED' || app.status === 'EXPIRED' || (app.status === 'WITHDRAWN' || app.status === 'CANCELLED_BY_PLATFORM')) ? '#64748B' : '#ccc' }}>
                              · Heure: {[app.event.startTime, app.event.endTime].filter(Boolean).join(' – ')}
                            </p>
                          )}

                          {/* Lieu */}
                          {app.event?.location && (app.event.location.venue || app.event.location.city || app.event.location.address) && (
                            <p style={{ ...cardDetailStyle, margin: 0, marginBottom: '4px', color: (app.status === 'PENDING' || app.status === 'ACCEPTED' || app.status === 'REJECTED' || app.status === 'EXPIRED' || (app.status === 'WITHDRAWN' || app.status === 'CANCELLED_BY_PLATFORM')) ? '#64748B' : '#ccc' }}>
                              · Lieu: {[app.event.location.venue, app.event.location.city, app.event.location.address].filter(Boolean).join(' — ')}
                            </p>
                          )}

                          {/* Durée de l'évènement */}
                          {app.event.requirements?.duration != null && (
                            <p style={{ ...cardDetailStyle, margin: 0, marginBottom: '4px', color: (app.status === 'PENDING' || app.status === 'ACCEPTED' || app.status === 'REJECTED' || app.status === 'EXPIRED' || (app.status === 'WITHDRAWN' || app.status === 'CANCELLED_BY_PLATFORM')) ? '#64748B' : '#ccc' }}>
                              · Durée de l'évènement: {app.event.requirements.duration} min
                            </p>
                          )}

                          {/* Ligne 3 : Prestation = durée (min) et/ou description indiquées par l'humoriste en candidatant */}
                          {app.performanceDetails && (app.performanceDetails.duration != null || app.performanceDetails.description) && (
                            <p style={{ ...cardDetailStyle, color: (app.status === 'PENDING' || app.status === 'ACCEPTED' || app.status === 'REJECTED' || app.status === 'EXPIRED' || (app.status === 'WITHDRAWN' || app.status === 'CANCELLED_BY_PLATFORM')) ? '#64748B' : '#9ad7ff', margin: 0, marginBottom: '4px' }}>
                              · Prestation: {[
                                app.performanceDetails.duration != null ? `${app.performanceDetails.duration} min` : null,
                                app.performanceDetails.description || null
                              ].filter(Boolean).join(' • ')}
                            </p>
                          )}

                          {/* Ligne 4 : Message (si disponible) */}
                          {app.message && (
                            <p style={{ ...cardDetailStyle, margin: 0, color: (app.status === 'PENDING' || app.status === 'ACCEPTED' || app.status === 'REJECTED' || app.status === 'EXPIRED' || (app.status === 'WITHDRAWN' || app.status === 'CANCELLED_BY_PLATFORM')) ? '#64748B' : '#ccc' }}>
                              · Message: {app.message}
                            </p>
                          )}
                          </>}
                        </div>

                        <div style={comedianApplicationStatusStyle}>
                          <span style={statusBadgeStyle(app.status)}>Statut: {translateStatus(app.status)}</span>
                          {/* Tag Annulé quand l'événement a été annulé par l'organisateur */}
                          {user?.role === 'COMEDIAN' && isEventCancelled(app.event) && (
                            <span style={{
                              ...statusBadgeStyle(app.status),
                              marginTop: '8px',
                              display: 'inline-block',
                              backgroundColor: 'rgba(0,0,0,0.12)',
                              color: '#64748B',
                              border: '1px solid rgba(0,0,0,0.2)',
                            }}>
                              Annulé
                            </span>
                          )}
                          {/* Afficher le statut supplémentaire sur les cartes archivées */}
                          {comedianTab === 'archived' && app.status !== 'EXPIRED' && !isEventCancelled(app.event) && (
                            <span style={{
                              ...statusBadgeStyle(app.status),
                              marginTop: '8px',
                              display: 'block',
                            }}>
                              {app.status === 'ACCEPTED' ? '✓ Acceptée' : app.status === 'REJECTED' ? '✕ Refusée' : ''}
                            </span>
                          )}
                          {/* Candidature acceptée SANS modification de l'événement : uniquement "Me désinscrire" */}
                          {user?.role === 'COMEDIAN' && !isEventCancelled(app.event) && comedianTab === 'accepted' && app.status === 'ACCEPTED' && app.event?.date && isEventUpcoming(app.event.date) && !wasEventUpdatedAfterApplication(app) && !isEventWithinOneHour(app.event) && (
                            <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                              <button
                                onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                                  e.stopPropagation();
                                  if (!user?._id) return;
                                  setConfirmDialog({
                                    isOpen: true,
                                    title: 'Confirmer la désinscription',
                                    message: ConfirmMessages.UNSUBSCRIBE_DETAIL,
                                     onConfirm: async () => {
                                       try {
                                         await api.delete(`/applications/${app._id}`);
                                         showSuccess(SuccessMessages.APPLICATION_UNSUBSCRIBED);
                                         queryClient.invalidateQueries({ queryKey: ['applications'] });
                                         refreshUser();
                                         setConfirmDialog({ ...confirmDialog, isOpen: false });
                                       } catch (err: any) {
                                         showError(ErrorMessages.APPLICATION_WITHDRAW_FAILED);
                                       }
                                     },
                                  });
                                }}
                                style={{ ...actionButtonStyle, backgroundColor: '#dc3545', width: isMobile ? '100%' : 'auto' }}
                              >
                                Me désinscrire
                              </button>
                            </div>
                          )}
                          {user?.role === 'COMEDIAN' && comedianTab === 'accepted' && app.status === 'ACCEPTED' && app.event && isEventWithinOneHour(app.event) && (
                            <div style={{ marginTop: 12, fontSize: '12px', color: '#888' }}>
                              Plus de modification possible (événement dans moins d'1 h)
                            </div>
                          )}
                          {/* Candidature acceptée ET événement modifié par l'organisateur : "Je reste inscrit" + "Me désinscrire" */}
                          {user?.role === 'COMEDIAN' && !isEventCancelled(app.event) && comedianTab === 'accepted' && app.status === 'ACCEPTED' && wasEventUpdatedAfterApplication(app) && app.event?.date && isEventUpcoming(app.event.date) && !isEventWithinOneHour(app.event) && (
                            <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                              <button
                                onClick={async (e: React.MouseEvent<HTMLButtonElement>) => {
                                  e.stopPropagation();
                                  try {
                                    await api.patch(`/applications/${app._id}/confirm`, {});
                                    showSuccess(SuccessMessages.APPLICATION_CONFIRMED);
                                    queryClient.invalidateQueries({ queryKey: ['applications'] });
                                  } catch (error) {
                                    showError(ErrorMessages.APPLICATION_CONFIRM_FAILED);
                                  }
                                }}
                                style={{ ...actionButtonStyle, backgroundColor: '#ff9800' }}
                              >
                                Je reste inscrit
                              </button>
                              <button
                                onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                                  e.stopPropagation();
                                  if (!user?._id) return;
                                  setConfirmDialog({
                                    isOpen: true,
                                    title: 'Confirmer la désinscription',
                                    message: ConfirmMessages.UNSUBSCRIBE,
                                     onConfirm: async () => {
                                       try {
                                         await api.delete(`/applications/${app._id}`);
                                         showSuccess(SuccessMessages.APPLICATION_WITHDRAWN);
                                         queryClient.invalidateQueries({ queryKey: ['applications'] });
                                         refreshUser();
                                         setConfirmDialog({ ...confirmDialog, isOpen: false });
                                       } catch (err: any) {
                                         showError(ErrorMessages.APPLICATION_WITHDRAW_FAILED);
                                       }
                                     },
                                  });
                                }}
                                style={{ ...actionButtonStyle, backgroundColor: '#dc3545' }}
                              >
                                Me désinscrire
                              </button>
                            </div>
                          )}
                          {user?.role === 'COMEDIAN' && comedianTab === 'accepted' && app.status === 'ACCEPTED' && wasEventUpdatedAfterApplication(app) && app.event && isEventWithinOneHour(app.event) && (
                            <div style={{ marginTop: 12, fontSize: '12px', color: '#888' }}>
                              Plus de modification possible (événement dans moins d'1 h)
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {comedianFilteredApplications.length > ITEMS_PER_PAGE && (
                  <div style={paginationContainerStyle}>
                    <button
                      style={paginationButtonStyle}
                      disabled={comedianPage === 1}
                      onClick={() => setComedianPage(prev => Math.max(1, prev - 1))}
                    >
                      Précédent
                    </button>
                    <span style={paginationInfoStyle}>
                      Page {Math.min(comedianPage, totalComedianPages)} / {Math.max(totalComedianPages, 1)}
                    </span>
                    <button
                      style={paginationButtonStyle}
                      disabled={comedianPage >= totalComedianPages}
                      onClick={() => setComedianPage(prev => Math.min(totalComedianPages, prev + 1))}
                    >
                      Suivant
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        ) : (
          <>
            {!loading && !error && getFilteredApplications().length === 0 && (
              <p style={{ textAlign: 'center', fontSize: '1.2em', color: '#ccc' }}>
                Aucune candidature trouvée pour ce filtre.
              </p>
            )}
            {!loading && !error && getFilteredApplications().length > 0 && (
              // Affichage organisateur - Liste horizontale
              <>
                <div style={applicationsListStyle}>
                  {paginatedOrganizerApplications.map((app) => (
                  <div
                    key={app._id}
                    data-application-id={app._id}
                    style={{
                      ...applicationCardStyle,
                      ...(app.status === 'PENDING' ? applicationCardStylePending : app.status === 'ACCEPTED' ? applicationCardStyleAccepted : app.status === 'REJECTED' ? applicationCardStyleRejected : app.status === 'EXPIRED' ? applicationCardStyleExpired : ((app.status === 'WITHDRAWN' || app.status === 'CANCELLED_BY_PLATFORM') || app.status === 'CANCELLED_BY_PLATFORM') ? applicationCardStyleWithdrawn : {}),
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-2px)';
                      e.currentTarget.style.boxShadow = '0 6px 15px rgba(0, 0, 0, 0.6)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = '0 4px 10px rgba(0, 0, 0, 0.5)';
                    }}
                    onClick={() => {
                      setSelectedApplication(app);
                      setIsModalOpen(true);
                    }}
                  >
                    {/* Section gauche - Avatar et info humoriste */}
                    {user?.role === 'ORGANIZER' && (
                      <div style={comedianInfoStyle}>
                        <div style={comedianInitialBubbleStyle}>
                          {app.comedian?.avatarUrl ? (
                            <img
                              src={app.comedian.avatarUrl}
                              alt={`${app.comedian?.firstName ?? ''} ${app.comedian?.lastName ?? ''}`}
                              style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }}
                            />
                          ) : (
                            `${app.comedian?.firstName?.[0] ?? ''}${app.comedian?.lastName?.[0] ?? ''}`.trim() || '🎤'
                          )}
                        </div>
                        <div style={comedianDetailsStyle}>
                          <p style={{ ...comedianNameTextStyle, ...((app.status === 'PENDING' || app.status === 'ACCEPTED' || app.status === 'REJECTED' || app.status === 'EXPIRED' || (app.status === 'WITHDRAWN' || app.status === 'CANCELLED_BY_PLATFORM')) ? { color: '#1a1a1a' } : {}) }}>{app.comedian?.firstName ?? ''} {app.comedian?.lastName ?? ''}</p>
                          <p style={{ ...comedianRoleTextStyle, ...((app.status === 'PENDING' || app.status === 'ACCEPTED' || app.status === 'REJECTED' || app.status === 'EXPIRED' || (app.status === 'WITHDRAWN' || app.status === 'CANCELLED_BY_PLATFORM')) ? { color: '#64748B' } : {}) }}>Humoriste</p>
                          <GeographicCompatibilityBadge 
                            eventCity={app.event?.location?.city} 
                            mobilityZones={app.comedian.profile?.mobilityZone}
                          />
                        </div>
                        <button 
                          style={viewProfileInlineButtonStyle}
                          onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                            e.stopPropagation();
                            if (app.comedian?._id) handleViewComedianProfile(e, app.comedian._id, app._id);
                          }}
                        >
                          👤 Voir le profil
                        </button>
                      </div>
                    )}

                    {/* Section centre - Info évènement */}
                    <div style={eventInfoStyle}>
                      <h3 style={{ ...eventTitleStyle, ...((app.status === 'PENDING' || app.status === 'ACCEPTED' || app.status === 'REJECTED' || app.status === 'EXPIRED' || (app.status === 'WITHDRAWN' || app.status === 'CANCELLED_BY_PLATFORM')) ? { color: '#1a1a1a' } : {}) }}>{app.event.title}</h3>
                      <p style={{ ...eventDateStyle, ...((app.status === 'PENDING' || app.status === 'ACCEPTED' || app.status === 'REJECTED' || app.status === 'EXPIRED' || (app.status === 'WITHDRAWN' || app.status === 'CANCELLED_BY_PLATFORM')) ? { color: '#64748B' } : {}) }}>
                        📅 {app.event?.date ? new Date(app.event.date).toLocaleDateString() : 'Date non disponible'}
                      </p>
                    </div>

                    {/* Section droite - Statut et actions */}
                    <div style={cardRightSectionStyle}>
                      {isOrganizerView && (
                        <button
                          type="button"
                          aria-label={favoriteApplicationIdsSet.has(app._id) ? 'Retirer des favoris' : 'Ajouter aux favoris'}
                          style={{ ...favoriteStarButtonStyle(favoriteApplicationIdsSet.has(app._id)), alignSelf: 'flex-end' }}
                          onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                            e.stopPropagation();
                            toggleFavoriteApplication(app._id);
                          }}
                        >
                          {favoriteApplicationIdsSet.has(app._id) ? '★' : '☆'}
                        </button>
                      )}
                      <span style={statusBadgeStyle(app.status)}>Statut: {translateStatus(app.status)}</span>
                      {app.status === 'PENDING' && (
                        <div style={actionsContainerStyle}>
                          <button 
                            style={acceptButtonStyle} 
                            onClick={(e: React.MouseEvent<HTMLButtonElement>) => { 
                              e.stopPropagation(); 
                              openStatusModal(app._id, 'ACCEPTED'); 
                            }}
                          >
                            ✓ Accepter
                          </button>
                          <button 
                            style={rejectButtonStyle} 
                            onClick={(e: React.MouseEvent<HTMLButtonElement>) => { 
                              e.stopPropagation(); 
                              openStatusModal(app._id, 'REJECTED'); 
                            }}
                          >
                            ✕ Refuser
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                </div>
                {organizerFilteredApplications.length > ITEMS_PER_PAGE && (
                  <div style={paginationContainerStyle}>
                    <button
                      style={{
                        ...paginationButtonStyle,
                        opacity: currentPage === 1 ? 0.5 : 1,
                        cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                      }}
                      onClick={() => currentPage > 1 && setCurrentPage(prev => prev - 1)}
                      disabled={currentPage === 1}
                    >
                      ◀ Précédent
                    </button>
                    <span style={paginationInfoStyle}>
                      Page {currentPage} / {totalOrganizerPages}
                    </span>
                    <button
                      style={{
                        ...paginationButtonStyle,
                        opacity: currentPage === totalOrganizerPages ? 0.5 : 1,
                        cursor: currentPage === totalOrganizerPages ? 'not-allowed' : 'pointer',
                      }}
                      onClick={() => currentPage < totalOrganizerPages && setCurrentPage(prev => prev + 1)}
                      disabled={currentPage === totalOrganizerPages}
                    >
                      Suivant ▶
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
      {selectedApplication && (
        <ApplicationDetailsModal 
          isOpen={isModalOpen}
          onClose={closeApplicationModal}
          application={selectedApplication}
        />
      )}
      {showStatusModal && (
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
          onClick={(e) => e.target === e.currentTarget && closeStatusModal()}
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
                {statusToSet === 'ACCEPTED' ? 'Accepter la candidature' : 'Refuser la candidature'}
              </h2>
              <button
                onClick={closeStatusModal}
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

            {/* Description contextuelle */}
            <p style={{
              color: '#aaa',
              fontSize: '14px',
              lineHeight: '1.5',
              margin: '0 0 20px 0',
            }}>
              {statusToSet === 'ACCEPTED'
                ? "Vous pouvez ajouter un message personnel à l'humoriste pour l'informer de détails supplémentaires."
                : "Vous pouvez indiquer la raison du refus pour aider l'humoriste à comprendre votre décision."}
            </p>

            {/* Label et textarea */}
            <label style={{
              color: '#ccc',
              fontWeight: '600',
              display: 'block',
              marginBottom: '10px',
              fontSize: '14px',
            }}>
              Message (optionnel)
            </label>
            <textarea
              ref={messageInputRef as any}
              value={statusMessage}
              onChange={e => setStatusMessage(e.target.value)}
              rows={5}
              placeholder={statusToSet === 'ACCEPTED'
                ? "Ex: Nous sommes ravis de vous accueillir ! Voici quelques détails..."
                : "Ex: Nous recherchons un profil avec plus d'expérience pour cet événement..."}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '8px',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                backgroundColor: '#2d2d44',
                color: '#fff',
                fontSize: '14px',
                lineHeight: '1.5',
                resize: 'vertical',
                marginBottom: '24px',
                boxSizing: 'border-box',
                fontFamily: 'inherit',
              }}
            />

            {/* Boutons d'action */}
            <div style={{
              display: 'flex',
              gap: '12px',
              justifyContent: 'flex-end',
            }}>
              <button
                onClick={closeStatusModal}
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
                onClick={handleConfirmStatus}
                style={{
                  padding: '10px 24px',
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: statusToSet === 'ACCEPTED' ? '#28a745' : '#dc3545',
                  color: '#fff',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  fontSize: '14px',
                }}
              >
                {statusToSet === 'ACCEPTED' ? '✓ Accepter' : '✕ Refuser'}
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
        confirmText="Confirmer"
        cancelText="Annuler"
      />
    </div>
  );
}

export default ApplicationsPage; 