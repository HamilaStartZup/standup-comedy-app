import { useState, useMemo, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import type { IEvent } from '../types/event';
import { useAuth } from '../hooks/useAuth';
import { useAlert } from '../hooks/useAlert';
import {
  getEventFavorites,
  removeEventFavorite,
  createStripeCheckoutSession,
  confirmStripeRegistration,
  unregisterSpectatorFromEvent,
  getSpectatorEventRatingStatus,
} from '../services/api';
import EventDetailModal from '../components/EventDetailModal';
import ConfirmDialog from '../components/ConfirmDialog';

function parseEventsResponse(data: any): IEvent[] {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.events)) return data.events;
  return [];
}

type EventsFilterTab = 'inscrits' | 'archives' | 'annules' | 'favoris';

export default function SpectatorEventsPage() {
  const { token, user } = useAuth();
  const { showSuccess, showError } = useAlert();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [eventFilter, setEventFilter] = useState<EventsFilterTab>('inscrits');
  const [selectedEvent, setSelectedEvent] = useState<IEvent | null>(null);
  const [unregisterConfirm, setUnregisterConfirm] = useState<{ isOpen: boolean; event: IEvent | null }>({ isOpen: false, event: null });
  const [ratedEvents, setRatedEvents] = useState<Record<string, boolean>>({});
  const [ratingWindowClosed, setRatingWindowClosed] = useState<Record<string, boolean>>({});
  const [eventRatings, setEventRatings] = useState<Record<string, number>>({});

  const { data: myRegistrationsList = [], isLoading: loadingRegistrations } = useQuery({
    queryKey: ['events', 'spectator', 'myRegistrations'],
    queryFn: async () => {
      const res = await api.get('/events?myRegistrations=true');
      return parseEventsResponse(res.data);
    },
    enabled: !!user,
  });

  const { data: favoritesResponse, isLoading: loadingFavorites } = useQuery({
    queryKey: ['event-favorites'],
    queryFn: getEventFavorites,
    enabled: !!user,
  });
  const favoritesList: IEvent[] = Array.isArray(favoritesResponse?.favorites) ? favoritesResponse.favorites : [];

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['events'], exact: false });
    queryClient.invalidateQueries({ queryKey: ['event-favorites'], exact: false });
  };

  const removeFavoriteMutation = useMutation({
    mutationFn: removeEventFavorite,
    onSuccess: () => { invalidate(); showSuccess('Retiré des favoris'); },
    onError: (e: any) => showError(e?.response?.data?.message || 'Erreur'),
  });
  const unregisterMutation = useMutation({
    mutationFn: unregisterSpectatorFromEvent,
    onSuccess: () => { invalidate(); showSuccess('Désinscription enregistrée'); },
    onError: (e: any) => showError(e?.response?.data?.message || 'Erreur'),
  });
  const stripeCheckoutMutation = useMutation({
    mutationFn: createStripeCheckoutSession,
    onSuccess: (data) => { if (data?.url) window.location.href = data.url; },
    onError: (e: any) => showError(e?.response?.data?.message || 'Erreur de paiement'),
  });

  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const payment = searchParams.get('payment');
    const sessionId = searchParams.get('session_id');
    if (payment === 'success') {
      if (sessionId) {
        confirmStripeRegistration(sessionId)
          .then(() => {
            invalidate();
            showSuccess('Paiement réussi, vous êtes inscrit à l\'événement.');
          })
          .catch(() => showError('Erreur lors de la confirmation de l\'inscription.'))
          .finally(() => setSearchParams({}, { replace: true }));
      } else {
        invalidate();
        showSuccess('Paiement réussi, vous êtes inscrit à l\'événement.');
        setSearchParams({}, { replace: true });
      }
    } else if (payment === 'cancelled') {
      showError('Paiement annulé.');
      setSearchParams({}, { replace: true });
    }
  }, [searchParams]);

  // Build a Set of event IDs the user is registered to (from myRegistrationsList)
  // This is reliable regardless of whether spectatorRegistrations is populated on the event
  const registeredEventIds = useMemo(() => {
    return new Set(myRegistrationsList.map((e) => e._id));
  }, [myRegistrationsList]);

  const isUserRegistered = (event: IEvent) => {
    return registeredEventIds.has(event._id);
  };

  const isUserWithdrawn = (event: IEvent) => {
    const ids = event.withdrawnSpectators;
    if (!ids?.length || !user?._id) return false;
    return ids.some((id) => (typeof id === 'string' ? id : (id as { _id?: string })?._id) === user._id);
  };

  const openUnregisterConfirm = (event: IEvent) => {
    setUnregisterConfirm({ isOpen: true, event });
  };

  const handleConfirmUnregister = () => {
    if (unregisterConfirm.event) {
      unregisterMutation.mutate(unregisterConfirm.event._id);
      setUnregisterConfirm({ isOpen: false, event: null });
    }
  };

  const now = new Date();
  const registeredUpcoming = myRegistrationsList
    .filter((e) => new Date(e.date) >= now && e.status?.toLowerCase() !== 'cancelled')
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const registeredArchived = myRegistrationsList
    .filter((e) => (new Date(e.date) < now) && e.status?.toLowerCase() !== 'cancelled')
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const registeredCancelled = myRegistrationsList
    .filter((e) => e.status?.toLowerCase() === 'cancelled')
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const favoritesUpcoming = favoritesList
    .filter((e) => new Date(e.date) >= now && e.status?.toLowerCase() !== 'cancelled' && !isUserWithdrawn(e))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const isLoading = loadingRegistrations || loadingFavorites;

  // Charger le statut "déjà noté" pour les événements archivés
  useEffect(() => {
    if (!user || registeredArchived.length === 0) return;

    let cancelled = false;

    const fetchStatuses = async () => {
      try {
        const entries = await Promise.all(
          registeredArchived.map(async (e) => {
            try {
              const res = await getSpectatorEventRatingStatus(e._id);
              return [e._id, !!res.alreadyRated, !!res.ratingWindowClosed, res.eventRating ?? null] as const;
            } catch {
              return [e._id, false, false, null] as const;
            }
          })
        );

        if (cancelled) return;

        setRatedEvents((prev) => {
          const updated: Record<string, boolean> = { ...prev };
          entries.forEach(([id, alreadyRated]) => {
            updated[id] = alreadyRated;
          });
          return updated;
        });

        setRatingWindowClosed((prev) => {
          const updated: Record<string, boolean> = { ...prev };
          entries.forEach(([id, _alreadyRated, windowClosed]) => {
            updated[id] = windowClosed;
          });
          return updated;
        });

        setEventRatings((prev) => {
          const updated: Record<string, number> = { ...prev };
          entries.forEach(([id, _alreadyRated, _windowClosed, rating]) => {
            if (rating != null) {
              updated[id] = rating;
            }
          });
          return updated;
        });
      } catch {
        // en cas d'erreur globale, on ne bloque pas l'affichage
      }
    };

    fetchStatuses();

    return () => {
      cancelled = true;
    };
  }, [user, registeredArchived]);

  const filterTabs: { id: EventsFilterTab; label: string }[] = [
    { id: 'inscrits', label: 'Inscrits (à venir)' },
    { id: 'archives', label: 'Archivés (auxquels vous étiez inscrit)' },
    { id: 'annules', label: 'Événements annulés' },
    { id: 'favoris', label: 'Favoris' },
  ];

  return (
    <>
      <Navbar />
      <div
        style={{
          minHeight: 'calc(100vh - 60px)',
          background: 'linear-gradient(to bottom right, #1a1a2e, #331f41)',
          color: '#fff',
          padding: '24px',
        }}
      >
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <h1 style={{ marginBottom: 24, fontSize: '1.75rem' }}>Mes évènements</h1>

          {/* Onglets filtre */}
          <div
            style={{
              display: 'flex',
              gap: 8,
              flexWrap: 'wrap',
              marginBottom: 32,
              alignItems: 'center',
            }}
          >
            {filterTabs.map((tab) => {
              const isActive = eventFilter === tab.id;
              const isCancelledTab = tab.id === 'annules';
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setEventFilter(tab.id)}
                  style={{
                    padding: '10px 16px',
                    borderRadius: 8,
                    border: isActive
                      ? isCancelledTab ? '2px solid #dc3545' : '2px solid #FF5A7E'
                      : '1px solid rgba(255,255,255,0.3)',
                    background: isActive
                      ? isCancelledTab ? 'rgba(220, 53, 69, 0.25)' : 'rgba(255,90,126,0.25)'
                      : 'rgba(0,0,0,0.3)',
                    color: isActive && isCancelledTab ? '#f8d7da' : '#fff',
                    cursor: 'pointer',
                    fontWeight: isActive ? 600 : 400,
                    fontSize: '0.9rem',
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {isLoading ? (
            <p style={{ color: 'rgba(255,255,255,0.7)' }}>Chargement…</p>
          ) : eventFilter === 'inscrits' ? (
            <Section
              title="Événements auxquels je suis inscrit"
              events={registeredUpcoming}
              emptyMessage="Aucune inscription à venir."
              onEventClick={setSelectedEvent}
              onUnregister={(e) => openUnregisterConfirm(e)}
              onRemoveFavorite={(e) => removeFavoriteMutation.mutate(e._id)}
              isUnregistering={unregisterMutation.isPending}
              showUnregister
              isRegistered={() => true}
            />
          ) : eventFilter === 'archives' ? (
            <Section
              title="Archivés (auxquels vous étiez inscrit)"
              events={registeredArchived}
              emptyMessage="Aucun événement archivé."
              onEventClick={setSelectedEvent}
              onRemoveFavorite={(e) => removeFavoriteMutation.mutate(e._id)}
              onRate={(e) => navigate(`/spectateur/events/rate/${e._id}`)}
              showRate
              isUnregistering={false}
              showUnregister={false}
              isRegistered={() => true}
              isAlreadyRated={(e) => !!ratedEvents[e._id]}
              isRatingWindowClosed={(e) => !!ratingWindowClosed[e._id]}
              getEventRating={(e) => eventRatings[e._id] ?? 0}
            />
          ) : eventFilter === 'annules' ? (
            <section style={{ marginBottom: 40 }}>
              <h2 style={{ marginBottom: 16, fontSize: '1.25rem' }}>Événements annulés</h2>
              {registeredCancelled.length === 0 ? (
                <p style={{ color: 'rgba(255,255,255,0.7)' }}>Aucun événement annulé.</p>
              ) : (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                    gap: 16,
                  }}
                >
                  {registeredCancelled.map((event) => (
                    <div
                      key={event._id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedEvent(event)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setSelectedEvent(event); }}
                      style={{
                        background: '#fff',
                        border: '1px solid rgba(220, 53, 69, 0.4)',
                        borderRadius: 12,
                        padding: 16,
                        cursor: 'pointer',
                      }}
                      title="Voir les détails"
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                        <h3 style={{ margin: 0, fontSize: '1rem', flex: 1, color: '#1a1a2e', textDecoration: 'underline' }}>{event.title}</h3>
                        <span
                          style={{
                            fontSize: '0.75rem',
                            padding: '4px 8px',
                            borderRadius: 6,
                            background: 'rgba(220, 53, 69, 0.15)',
                            color: '#b71c1c',
                            fontWeight: 600,
                          }}
                        >
                          Annulé
                        </span>
                      </div>
                      <p style={{ margin: 0, fontSize: '0.85rem', color: '#555' }}>
                        {new Date(event.date).toLocaleDateString('fr-FR', {
                          weekday: 'short',
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </p>
                      {event.location?.city && (
                        <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: '#666' }}>
                          📍 {event.location.city}
                        </p>
                      )}
                      {event.cancellationReason && (
                        <p style={{ margin: '8px 0 0', fontSize: '0.8rem', color: '#b71c1c' }}>
                          <strong>Raison :</strong> {event.cancellationReason}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          ) : (
            <Section
              title="Favoris"
              events={favoritesUpcoming}
              emptyMessage="Aucun favori à venir."
              onEventClick={setSelectedEvent}
              onRegister={(e) => stripeCheckoutMutation.mutate(e._id)}
              onUnregister={(e) => openUnregisterConfirm(e)}
              onRemoveFavorite={(e) => removeFavoriteMutation.mutate(e._id)}
              isUnregistering={unregisterMutation.isPending}
              isRegistering={stripeCheckoutMutation.isPending}
              showUnregister
              showRemoveFavorite
              isRegistered={isUserRegistered}
            />
          )}
        </div>
      </div>
      <EventDetailModal
        isOpen={!!selectedEvent}
        onClose={() => setSelectedEvent(null)}
        event={selectedEvent}
        user={user}
      />
      <ConfirmDialog
        isOpen={unregisterConfirm.isOpen}
        title="Se désinscrire"
        message="Êtes-vous sûr de vouloir vous désinscrire ? Vous ne pourrez pas vous réinscrire à cet événement."
        confirmText="Confirmer"
        cancelText="Annuler"
        isDangerous
        onConfirm={handleConfirmUnregister}
        onCancel={() => setUnregisterConfirm({ isOpen: false, event: null })}
      />
    </>
  );
}

function Section({
  title,
  events,
  emptyMessage,
  onEventClick,
  onRegister,
  onUnregister,
  onRemoveFavorite,
  onRate,
  showRate = false,
  isUnregistering,
  isRegistering = false,
  showUnregister,
  showRemoveFavorite = false,
  isRegistered,
  isAlreadyRated,
  isRatingWindowClosed,
  getEventRating,
}: {
  title: string;
  events: IEvent[];
  emptyMessage: string;
  onEventClick?: (e: IEvent) => void;
  onRegister?: (e: IEvent) => void;
  onUnregister?: (e: IEvent) => void;
  onRemoveFavorite: (e: IEvent) => void;
  onRate?: (e: IEvent) => void;
  showRate?: boolean;
  isUnregistering: boolean;
  isRegistering?: boolean;
  showUnregister: boolean;
  showRemoveFavorite?: boolean;
  isRegistered?: (e: IEvent) => boolean;
  isAlreadyRated?: (e: IEvent) => boolean;
  isRatingWindowClosed?: (e: IEvent) => boolean;
  getEventRating?: (e: IEvent) => number;
}) {
  return (
    <section style={{ marginBottom: 40 }}>
      <h2 style={{ marginBottom: 16, fontSize: '1.25rem' }}>{title}</h2>
      {events.length === 0 ? (
        <p style={{ color: 'rgba(255,255,255,0.7)' }}>{emptyMessage}</p>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 16,
          }}
        >
          {events.map((event) => (
            <EventCard
              key={event._id}
              event={event}
              onEventClick={onEventClick ? () => onEventClick(event) : undefined}
              onRegister={onRegister ? () => onRegister(event) : undefined}
              onUnregister={showUnregister && onUnregister ? () => onUnregister(event) : undefined}
              onRemoveFavorite={showRemoveFavorite ? () => onRemoveFavorite(event) : undefined}
              onRate={showRate && onRate ? () => onRate(event) : undefined}
              showRateButton={showRate}
              isRegistered={isRegistered ? isRegistered(event) : false}
              alreadyRated={isAlreadyRated ? isAlreadyRated(event) : false}
              ratingWindowClosed={isRatingWindowClosed ? isRatingWindowClosed(event) : false}
              ratingValue={getEventRating ? getEventRating(event) : 0}
              isUnregistering={isUnregistering}
              isRegistering={isRegistering}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function EventCard({
  event,
  onEventClick,
  onRegister,
  onUnregister,
  onRemoveFavorite,
  onRate,
  showRateButton = false,
  isRegistered,
  isUnregistering,
  isRegistering = false,
  alreadyRated = false,
  ratingWindowClosed = false,
  ratingValue = 0,
}: {
  event: IEvent;
  onEventClick?: () => void;
  onRegister?: () => void;
  onUnregister?: () => void;
  onRemoveFavorite?: () => void;
  onRate?: () => void;
  showRateButton?: boolean;
  isRegistered: boolean;
  isUnregistering: boolean;
  isRegistering?: boolean;
  alreadyRated?: boolean;
  ratingWindowClosed?: boolean;
  ratingValue?: number;
}) {
  const dateStr = new Date(event.date).toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const city = event.location?.city || '';
  const isPast = new Date(event.date) < new Date();
  const isCancelled = event.status?.toLowerCase() === 'cancelled';
  const maxSpectators = event.maxSpectators;
  const registeredCount = Array.isArray(event.spectatorRegistrations) ? event.spectatorRegistrations.length : 0;
  const placesRemaining = maxSpectators != null ? Math.max(0, maxSpectators - registeredCount) : null;
  const canRegister = onRegister && !isRegistered && !isPast && !isCancelled && (placesRemaining === null || placesRemaining > 0);
  const imageUrl = event.imageUrl;
  const hasBg = !!imageUrl;
  const textColor = hasBg ? '#fff' : '#1a1a2e';
  const textColorMuted = hasBg ? 'rgba(255,255,255,0.92)' : '#555';
  const textColorMuted2 = hasBg ? 'rgba(255,255,255,0.88)' : '#666';
  const textShadow = hasBg ? '0 1px 2px rgba(0,0,0,0.8)' : 'none';

  return (
    <div
      style={{
        position: 'relative',
        background: hasBg ? undefined : '#fff',
        backgroundImage: hasBg ? `url(${imageUrl})` : undefined,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        border: '1px solid rgba(0,0,0,0.1)',
        borderRadius: 12,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
      }}
    >
      {hasBg && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(to bottom, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0.7) 100%)',
            pointerEvents: 'none',
          }}
        />
      )}
      <div style={{ position: 'relative', zIndex: 1, padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <h3
          style={{
            margin: 0,
            fontSize: '1rem',
            color: textColor,
            textShadow,
            cursor: onEventClick ? 'pointer' : 'default',
            textDecoration: onEventClick ? 'underline' : 'none',
          }}
          onClick={onEventClick}
          title={onEventClick ? 'Voir les détails' : undefined}
        >
          {event.title}
        </h3>
        {isRegistered && (
          <span
            style={{
              padding: '4px 10px',
              borderRadius: 6,
              fontSize: '0.75rem',
              fontWeight: 600,
              color: '#fff',
              background: 'rgba(34, 197, 94, 0.95)',
              boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
            }}
          >
            Je participe
          </span>
        )}
        </div>
        <div
          role={onEventClick ? 'button' : undefined}
          tabIndex={onEventClick ? 0 : undefined}
          onClick={onEventClick}
          onKeyDown={onEventClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') onEventClick(); } : undefined}
          style={{ cursor: onEventClick ? 'pointer' : 'default' }}
        >
          <p style={{ margin: 0, fontSize: '0.85rem', color: textColorMuted, textShadow }}>{dateStr}</p>
          {city && <p style={{ margin: 0, fontSize: '0.85rem', color: textColorMuted2, textShadow }}>📍 {city}</p>}
          <p style={{ margin: 0, fontSize: '0.8rem', color: textColorMuted2, lineHeight: 1.4, textShadow }}>
            {event.description?.slice(0, 100)}
            {event.description && event.description.length > 100 ? '…' : ''}
          </p>
          {placesRemaining !== null && (
            <p style={{ margin: '4px 0 0', fontSize: '0.8rem', fontWeight: 500, color: textColorMuted, textShadow }}>
              {placesRemaining === 0 ? 'Complet' : `${placesRemaining} place${placesRemaining > 1 ? 's' : ''} restante${placesRemaining > 1 ? 's' : ''}`}
            </p>
          )}
        </div>
        {isPast && (
          <span style={{ fontSize: '0.75rem', color: hasBg ? 'rgba(255,255,255,0.85)' : '#888' }}>Passé</span>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
        {canRegister && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onRegister?.(); }}
            disabled={isRegistering}
            style={{
              padding: '8px 12px',
              borderRadius: 8,
              border: '1px solid #28a745',
              background: 'rgba(40, 167, 69, 0.2)',
              color: '#5dd879',
              cursor: isRegistering ? 'wait' : 'pointer',
              fontSize: '0.9rem',
            }}
          >
            Je participe pour 1€
          </button>
        )}
        {onUnregister && isRegistered && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onUnregister(); }}
            disabled={isUnregistering}
            style={{
              padding: '8px 12px',
              borderRadius: 8,
              border: '1px solid #ff5a7e',
              background: 'transparent',
              color: '#ff5a7e',
              cursor: isUnregistering ? 'wait' : 'pointer',
              fontSize: '0.9rem',
            }}
          >
            Se désinscrire
          </button>
        )}
        {showRateButton && isPast && !ratingWindowClosed && (
          alreadyRated ? (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontSize: '1rem',
                color: '#fbbf24',
              }}
            >
              {[1, 2, 3, 4, 5].map((star) => (
                <span key={star}>
                  {ratingValue >= star ? '★' : '☆'}
                </span>
              ))}
            </span>
          ) : (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (onRate) onRate();
              }}
              style={{
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid #D4AF37',
                background: 'linear-gradient(180deg, #FFD700 0%, #D4AF37 100%)',
                color: '#1a1a2e',
                fontWeight: 600,
                cursor: 'pointer',
                fontSize: '0.9rem',
                boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
              }}
            >
              Évaluer
            </button>
          )
        )}
        {onRemoveFavorite && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onRemoveFavorite(); }}
            style={{
              padding: '8px 12px',
              borderRadius: 8,
              border: '1px solid rgba(0,0,0,0.2)',
              background: 'rgba(0,0,0,0.06)',
              color: '#444',
              cursor: 'pointer',
              fontSize: '0.9rem',
            }}
          >
            Retirer des favoris
          </button>
        )}
        </div>
      </div>
    </div>
  );
}
