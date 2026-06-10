import { type CSSProperties, useState, useEffect, useMemo } from 'react';
import Navbar from '../components/Navbar';
import EventCalendar from '../components/EventCalendar';
import AbsenceModal from '../components/AbsenceModal';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api, { markAbsence, cancelAbsence } from '../services/api';
import type { IEvent } from '../types/event';
import { useAuth } from '../hooks/useAuth';
import { useAlert } from '../hooks/useAlert';
import { useUserEvents } from '../hooks/useUserEvents';
import { ErrorMessages, SuccessMessages } from '../services/systemMessages';

const CalendarPage = () => {
  const { user } = useAuth();
  const { showSuccess, showError } = useAlert();
  const queryClient = useQueryClient();
  const [screenSize, setScreenSize] = useState<'mobile' | 'tablet' | 'desktop'>('desktop');
  const [selectedComedian, setSelectedComedian] = useState<any>(null);
  const [isComedianModalOpen, setIsComedianModalOpen] = useState(false);
  const [isAbsenceModalOpen, setIsAbsenceModalOpen] = useState(false);
  const [selectedAbsenceParticipant, setSelectedAbsenceParticipant] = useState<any>(null);
  const [closeModalTrigger, setCloseModalTrigger] = useState(0);

  // --- Responsive detection hook ---
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    const checkScreenSize = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        const width = window.innerWidth;
        if (width < 768) setScreenSize('mobile');
        else if (width < 1024) setScreenSize('tablet');
        else setScreenSize('desktop');
      }, 150);
    };
    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);
    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', checkScreenSize);
    };
  }, []);

  // --- Responsive helper function ---
  const getResponsiveValue = <T,>(mobile: T, tablet: T, desktop: T): T => {
    if (screenSize === 'mobile') return mobile;
    if (screenSize === 'tablet') return tablet;
    return desktop;
  };

  const startOfMonth = useMemo(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString(),
    []
  );

  // Cache hit instantané depuis le Dashboard (événements du mois courant + futurs)
  const upcomingQuery = useUserEvents({ dateFrom: startOfMonth });
  // Fetch complet en arrière-plan pour permettre la navigation vers les mois passés
  const fullQuery = useUserEvents();

  const fetchedEvents = fullQuery.data?.events ?? upcomingQuery.data?.events ?? [];
  const isLoading = !fullQuery.data && !upcomingQuery.data && (fullQuery.isLoading || upcomingQuery.isLoading);
  const isError = fullQuery.isError && upcomingQuery.isError;

  // Séparer les événements et éviter doublons pour les annulés
  const { upcomingEvents, archivedEvents, cancelledEvents, allEvents } = useMemo(() => {
    const now = new Date();

    const upcomingEvents = fetchedEvents
      .filter(e => new Date(e.date) >= now && e.status?.toLowerCase() !== 'cancelled')
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const archivedEvents = fetchedEvents
      .filter(e => new Date(e.date) < now && e.status?.toLowerCase() !== 'cancelled')
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const cancelledEvents = fetchedEvents
      .filter(e => e.status?.toLowerCase() === 'cancelled')
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    return { upcomingEvents, archivedEvents, cancelledEvents, allEvents: [...upcomingEvents, ...archivedEvents, ...cancelledEvents] };
  }, [fetchedEvents]);

  // Récupérer les absences pour tous les événements affichés
  const { data: eventAbsences = [] } = useQuery({
    queryKey: ['event-absences', allEvents.map(e => e._id)],
    queryFn: async () => {
      if (allEvents.length === 0) return [];
      const allAbsences: any[] = [];
      for (const event of allEvents) {
        try {
          const res = await api.get(`/absences/event/${event._id}`);
          if (Array.isArray(res.data)) {
            allAbsences.push(...res.data);
          }
        } catch (err) {
          // Ignorer les erreurs individuelles
        }
      }
      return allAbsences;
    },
    enabled: !!user?._id && (user?.role === 'ORGANIZER' || user?.role === 'SUPER_ADMIN') && allEvents.length > 0,
  });

  // Mutation pour marquer absent
  const markAbsenceMutation = useMutation({
    mutationFn: async ({ eventId, comedianId, reason }: { eventId: string; comedianId: string; reason?: string }) => {
      return await markAbsence(eventId, comedianId, reason);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['event-absences'] });
      queryClient.invalidateQueries({ queryKey: ['events', user?._id] });
    },
  });

  // Mutation pour annuler absence
  const cancelAbsenceMutation = useMutation({
    mutationFn: async ({ eventId, comedianId }: { eventId: string; comedianId: string }) => {
      return await cancelAbsence(eventId, comedianId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['event-absences'] });
      queryClient.invalidateQueries({ queryKey: ['events', user?._id] });
    },
  });

  const handleEventClick = (_event: IEvent) => {
  };

  const handleAbsenceClick = (participant: any, event: IEvent) => {
    setSelectedAbsenceParticipant({
      ...participant,
      eventId: event._id,
      eventTitle: event.title
    });
    setIsAbsenceModalOpen(true);
  };

  const closeAbsenceModal = () => {
    setIsAbsenceModalOpen(false);
    setSelectedAbsenceParticipant(null);
  };

  const handleMarkAbsent = async (reason: string) => {
    if (!selectedAbsenceParticipant) return;

    try {
      await markAbsenceMutation.mutateAsync({
        eventId: selectedAbsenceParticipant.eventId,
        comedianId: selectedAbsenceParticipant._id,
        reason
      });
      showSuccess(SuccessMessages.ABSENCE_MARKED);
      closeAbsenceModal();
      setCloseModalTrigger(prev => prev + 1);
    } catch (error) {
      console.error('Erreur lors du marquage de l\'absence:', error);
      showError(ErrorMessages.ABSENCE_MARK_FAILED);
      throw error;
    }
  };

  const handleCancelAbsence = async () => {
    if (!selectedAbsenceParticipant) return;

    try {
      await cancelAbsenceMutation.mutateAsync({
        eventId: selectedAbsenceParticipant.eventId,
        comedianId: selectedAbsenceParticipant._id
      });
      showSuccess(SuccessMessages.ABSENCE_CANCELLED);
      closeAbsenceModal();
      setCloseModalTrigger(prev => prev + 1);
    } catch (error) {
      console.error('Erreur lors de l\'annulation de l\'absence:', error);
      showError(ErrorMessages.ABSENCE_CANCEL_FAILED);
      throw error;
    }
  };

  const handleComedianClick = (participant: any) => {
    setSelectedComedian(participant);
    setIsComedianModalOpen(true);
  };

  const mainContainerStyle: CSSProperties = {
    minHeight: '100vh',
    color: 'var(--ccc-text-primary)',
    padding: '20px',
    background: 'var(--ccc-bg-gradient)',
  };

  const contentWrapperStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: getResponsiveValue('16px', '24px', '32px'),
  };

  return (
    <div style={mainContainerStyle}>
      <Navbar />
      <div style={contentWrapperStyle}>

      {isLoading && (
        <p style={{ textAlign:'center', marginTop:'50px', color:'#7c3aed' }}>
          Chargement des événements…
        </p>
      )}
      {isError && (
        <p style={{ textAlign:'center', marginTop:'50px', color:'#dc3545' }}>
          Erreur lors du chargement des événements.
        </p>
      )}

      {!isLoading && !isError && (
        <EventCalendar
          events={allEvents}
          onEventClick={handleEventClick}
          user={user}
          eventAbsences={eventAbsences}
          onAbsenceClick={handleAbsenceClick}
          onComedianClick={handleComedianClick}
          shouldCloseModal={closeModalTrigger}
        />
      )}

      {/* Modal d'absence */}
      {selectedAbsenceParticipant && (
        <AbsenceModal
          isOpen={isAbsenceModalOpen}
          onClose={closeAbsenceModal}
          comedianName={`${selectedAbsenceParticipant.firstName} ${selectedAbsenceParticipant.lastName}`}
          eventTitle={selectedAbsenceParticipant.eventTitle || ''}
          isAlreadyAbsent={eventAbsences.some(
            (absence: any) =>
              absence.comedian._id === selectedAbsenceParticipant._id &&
              absence.event === selectedAbsenceParticipant.eventId
          )}
          onMarkAbsent={handleMarkAbsent}
          onCancelAbsence={handleCancelAbsence}
          existingReason={
            eventAbsences.find(
              (absence: any) =>
                absence.comedian._id === selectedAbsenceParticipant._id &&
                absence.event === selectedAbsenceParticipant.eventId
            )?.reason || ''
          }
        />
      )}
      </div>
    </div>
  );
};

export default CalendarPage;
