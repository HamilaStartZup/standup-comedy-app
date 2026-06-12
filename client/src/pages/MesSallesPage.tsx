import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { listVenues, myBookings, updateBookingStatus, updateBookingGroupStatus } from '../services/api';
import VenueCard from '../components/VenueCard';
import Navbar from '../components/Navbar';
import BookingStatusBadge from '../components/BookingStatusBadge';
import BookingInvoiceButton from '../components/BookingInvoiceButton';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import type { IVenue, IVenueBooking } from '../types/venue';
import { useAlert } from '../hooks/useAlert';
import { ErrorMessages, SuccessMessages, getErrorMessage } from '../services/systemMessages';

type ActiveTab = 'salles' | 'reservations';

const resolveTab = (tabParam: string | null, bookingIdParam: string | null): ActiveTab =>
  (tabParam === 'reservations' || !!bookingIdParam) ? 'reservations' : 'salles';

const HIGHLIGHT_DURATION_MS = 2000;

const MesSallesPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { showSuccess, showError } = useAlert();
  const [activeTab, setActiveTab] = useState<ActiveTab>(
    resolveTab(searchParams.get('tab'), searchParams.get('bookingId'))
  );
  const [highlightedBookingId, setHighlightedBookingId] = useState<string | null>(
    searchParams.get('bookingId')
  );
  const [selectedVenueId, setSelectedVenueId] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [expandedRequesterId, setExpandedRequesterId] = useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Vue des séries récurrentes (réservations partageant un bookingGroupId)
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [isRespondingGroup, setIsRespondingGroup] = useState(false);
  const [groupOwnerResponse, setGroupOwnerResponse] = useState('');
  const [groupExcluded, setGroupExcluded] = useState<Set<string>>(new Set());
  const [groupActionLoadingId, setGroupActionLoadingId] = useState<string | null>(null);

  useEffect(() => {
    const tabParam = searchParams.get('tab');
    const bookingIdParam = searchParams.get('bookingId');
    setActiveTab(resolveTab(tabParam, bookingIdParam));
    setHighlightedBookingId(bookingIdParam);
  }, [searchParams]);

  const { data: venuesResponse, isLoading: loadingVenues } = useQuery({
    queryKey: ['venues', 'mine'],
    queryFn: () => listVenues({ owner: 'me' }),
    retry: 1,
    retryDelay: 1000,
  });

  const { data: bookingsResponse, isLoading: loadingBookings } = useQuery<IVenueBooking[]>({
    queryKey: ['venue-owner-bookings'],
    queryFn: myBookings,
    retry: 1,
    retryDelay: 1000,
  });

  const myVenues: IVenue[] = venuesResponse?.venues || [];
  const bookings: IVenueBooking[] = bookingsResponse || [];

  const bookingStatuses = useMemo(
    () => Array.from(new Set(bookings.map((booking) => booking.status))),
    [bookings]
  );

  const statusLabel = (status: string) => {
    switch (status) {
      case 'PENDING':
        return 'En attente';
      case 'ACCEPTED':
        return 'Acceptée';
      case 'REFUSED':
        return 'Refusée';
      case 'EXPIRED':
        return 'Expirée';
      case 'CONFIRMED':
        return 'Confirmée';
      case 'CANCELLED_BY_OWNER':
        return 'Annulée par la salle';
      case 'CANCELLED_BY_REQUESTER':
        return 'Annulée par le demandeur';
      default:
        return status;
    }
  };

  const filteredBookings = useMemo(
    () =>
      bookings
        .filter((booking) => {
          const matchVenue = selectedVenueId === 'ALL' || booking.venue?._id === selectedVenueId;
          const matchStatus = selectedStatus === 'ALL' || booking.status === selectedStatus;
          return matchVenue && matchStatus;
        })
        .sort((a, b) => {
          const dateA = new Date(a.requestedDate).getTime();
          const dateB = new Date(b.requestedDate).getTime();
          if (dateA !== dateB) return dateA - dateB;
          const timeA = a.startTime?.split(':').map(Number) ?? [0, 0];
          const timeB = b.startTime?.split(':').map(Number) ?? [0, 0];
          return (timeA[0] * 60 + timeA[1]) - (timeB[0] * 60 + timeB[1]);
        }),
    [bookings, selectedVenueId, selectedStatus]
  );

  // Regroupement des réservations d'une même série (bookingGroupId partagé), triées par date.
  const recurringGroups = useMemo(() => {
    const map = new Map<string, IVenueBooking[]>();
    for (const booking of bookings) {
      if (!booking.bookingGroupId) continue;
      const list = map.get(booking.bookingGroupId) ?? [];
      list.push(booking);
      map.set(booking.bookingGroupId, list);
    }
    map.forEach((list) =>
      list.sort((a, b) => new Date(a.requestedDate).getTime() - new Date(b.requestedDate).getTime())
    );
    return map;
  }, [bookings]);

  // Réservations hors série (affichées individuellement, après application des filtres).
  const standaloneBookings = filteredBookings.filter((b) => !b.bookingGroupId);

  const resetGroupResponse = () => {
    setIsRespondingGroup(false);
    setGroupOwnerResponse('');
    setGroupExcluded(new Set());
  };

  // Scroll vers la réservation ciblée et flash de surbrillance ~2 s
  useEffect(() => {
    if (!highlightedBookingId || loadingBookings) return;
    const node = document.querySelector<HTMLElement>(`[data-booking-id="${highlightedBookingId}"]`);
    if (!node) return;
    node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const timer = setTimeout(() => setHighlightedBookingId(null), HIGHLIGHT_DURATION_MS);
    return () => clearTimeout(timer);
  }, [highlightedBookingId, loadingBookings, filteredBookings]);

  const hasBookingEnded = (requestedDate: string | Date, endTime: string) => {
    const [h, m] = endTime.split(':').map(Number);
    const bookingEnd = new Date(requestedDate);
    if (!Number.isNaN(h) && !Number.isNaN(m)) {
      bookingEnd.setHours(h, m, 0, 0);
    } else {
      bookingEnd.setHours(23, 59, 59, 999);
    }
    return bookingEnd.getTime() < Date.now();
  };

  const handleBookingStatusAction = async (bookingId: string, status: 'ACCEPTED' | 'REFUSED') => {
    setActionLoadingId(bookingId);
    try {
      await updateBookingStatus(bookingId, status);
      showSuccess(status === 'ACCEPTED' ? SuccessMessages.BOOKING_ACCEPTED : SuccessMessages.BOOKING_REFUSED);
      queryClient.invalidateQueries({ queryKey: ['venue-owner-bookings'] });
    } catch (error) {
      showError(getErrorMessage(error, ErrorMessages.BOOKING_UPDATE_FAILED));
    } finally {
      setActionLoadingId(null);
    }
  };

  // Réponse du LIEU au niveau du lot : accepter (avec exclusions décochées) ou refuser tout.
  const handleGroupAction = async (bookingGroupId: string, status: 'ACCEPTED' | 'REFUSED') => {
    setGroupActionLoadingId(bookingGroupId);
    try {
      await updateBookingGroupStatus(bookingGroupId, {
        status,
        excludedBookingIds: status === 'ACCEPTED' ? [...groupExcluded] : undefined,
        ownerResponse: groupOwnerResponse || undefined,
      });
      showSuccess(status === 'ACCEPTED' ? SuccessMessages.BOOKING_ACCEPTED : SuccessMessages.BOOKING_REFUSED);
      queryClient.invalidateQueries({ queryKey: ['venue-owner-bookings'] });
      resetGroupResponse();
    } catch (error) {
      showError(getErrorMessage(error, ErrorMessages.BOOKING_UPDATE_FAILED));
    } finally {
      setGroupActionLoadingId(null);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--ccc-bg-gradient)', color: 'var(--ccc-text-primary)', padding: '20px', paddingBottom: 60 }}>
      <style>{`
        @media (max-width: 640px) {
          .mes-salles-header h1 { font-size: 1.8em !important; }
          .tab-btn { padding: 10px 16px !important; font-size: 14px !important; }
          .venue-grid { grid-template-columns: 1fr !important; }
        }
        .is-highlighted {
          background-color: rgba(124, 58, 237, 0.12) !important;
          transition: background-color 0.3s ease;
        }
      `}</style>
      <Navbar />

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '40px 24px' }}>
        <div className="mes-salles-header" style={{ marginBottom: 24 }}>
          <h1 className="ccc-page-title" style={{ margin: '0 0 8px 0' }}>
            Mes Salles
          </h1>
          <p style={{ margin: 0, fontSize: '1.1em', color: 'var(--ccc-text-muted)' }}>
            Gérez vos salles et les demandes de réservation.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 28, borderBottom: '1px solid var(--ccc-border-medium)' }}>
          <button
            onClick={() => setActiveTab('salles')}
            className="tab-btn"
            style={{
              padding: '12px 24px',
              background: activeTab === 'salles' ? 'var(--ccc-accent-gradient)' : 'transparent',
              color: activeTab === 'salles' ? '#fff' : 'var(--ccc-text-muted)',
              border: 'none',
              borderRadius: '10px 10px 0 0',
              fontWeight: 600,
              fontSize: 15,
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            Mes Salles ({myVenues.length})
          </button>
          <button
            onClick={() => setActiveTab('reservations')}
            className="tab-btn"
            style={{
              padding: '12px 24px',
              background: activeTab === 'reservations' ? 'var(--ccc-accent-gradient)' : 'transparent',
              color: activeTab === 'reservations' ? '#fff' : 'var(--ccc-text-muted)',
              border: 'none',
              borderRadius: '10px 10px 0 0',
              fontWeight: 600,
              fontSize: 15,
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            Réservations ({bookings.length})
          </button>
        </div>

        {activeTab === 'salles' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 24 }}>
              <button
                onClick={() => navigate('/venues/new')}
                style={{
                  padding: '12px 28px',
                  background: 'var(--ccc-accent-gradient)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 12,
                  fontWeight: 700,
                  fontSize: 15,
                  cursor: 'pointer',
                  boxShadow: '0 4px 16px rgba(124, 58, 237,0.3)',
                }}
              >
                + Créer une salle
              </button>
            </div>

            {loadingVenues ? (
              <LoadingSpinner message="Chargement de vos salles..." />
            ) : myVenues.length === 0 ? (
              <div style={{
                textAlign: 'center',
                padding: '64px 24px',
                border: '1px dashed rgba(255,255,255,0.1)',
                borderRadius: 20,
              }}>
                <div style={{ fontSize: 60, marginBottom: 20 }}>🏛️</div>
                <h3 style={{ color: 'var(--ccc-text-primary)', fontSize: 22, marginBottom: 10 }}>Aucune salle pour le moment</h3>
                <p style={{ color: 'var(--ccc-text-muted)', fontSize: 15, marginBottom: 28, maxWidth: 400, margin: '0 auto 28px' }}>
                  Créez votre première salle pour commencer à recevoir des demandes de réservation.
                </p>
                <button
                  onClick={() => navigate('/venues/new')}
                  style={{
                    padding: '14px 32px',
                    background: 'var(--ccc-accent-gradient)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 12,
                    fontWeight: 700,
                    fontSize: 15,
                    cursor: 'pointer',
                  }}
                >
                  Créer ma première salle
                </button>
              </div>
            ) : (
              <>
                <p style={{ color: 'var(--ccc-text-muted)', fontSize: 14, marginBottom: 24 }}>
                  {myVenues.length} salle{myVenues.length > 1 ? 's' : ''}
                </p>
                <div className="venue-grid" style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                  gap: 24,
                }}>
                  {myVenues.map((venue) => (
                    <VenueCard key={venue._id} venue={venue} />
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === 'reservations' && (
          <div>
            {loadingBookings ? (
              <LoadingSpinner message="Chargement de vos réservations..." />
            ) : bookings.length === 0 ? (
              <div style={{
                textAlign: 'center',
                padding: '64px 24px',
                border: '1px dashed rgba(255,255,255,0.1)',
                borderRadius: 20,
              }}>
                <div style={{ fontSize: 60, marginBottom: 20 }}>📅</div>
                <h3 style={{ color: 'var(--ccc-text-primary)', fontSize: 22, marginBottom: 10 }}>Aucune réservation</h3>
                <p style={{ color: 'var(--ccc-text-muted)', fontSize: 15, marginBottom: 28 }}>
                  Vous n'avez pas encore de demande de réservation pour vos salles.
                </p>
              </div>
            ) : selectedGroupId ? (
              <div>
                {(() => {
                        const groupBookings = recurringGroups.get(selectedGroupId) ?? [];
                        const first = groupBookings[0];
                        if (!first) return <p style={{ color: 'var(--ccc-text-muted)' }}>Série introuvable.</p>;
                        const hasPending = groupBookings.some((b) => b.status === 'PENDING');
                        return (
                          <>
                            <button
                              type="button"
                              onClick={() => { setSelectedGroupId(null); resetGroupResponse(); }}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 20, padding: '10px 16px', borderRadius: 8, border: '1px solid var(--ccc-border-medium)', background: 'var(--ccc-bg-elevated)', color: 'var(--ccc-text-primary)', cursor: 'pointer', fontSize: 14, fontWeight: 600, boxShadow: '0 4px 24px rgba(15, 23, 42, 0.08)' }}
                            >
                              ← Retour aux réservations
                            </button>

                            <div style={{ marginBottom: 20, padding: 16, backgroundColor: '#fff', borderRadius: 20, boxShadow: '0 10px 40px rgba(0,0,0,0.12)', border: '1px solid rgba(0,0,0,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                              <div>
                                <h3 style={{ margin: '0 0 8px 0', color: '#1a1a1a', fontSize: '1.2em' }}>
                                  {first.requester?.firstName} {first.requester?.lastName}
                                </h3>
                                <p style={{ margin: 0, color: '#64748b', fontSize: '0.9em' }}>
                                  📍 {first.venue?.name} · {first.venue?.city} · {groupBookings.length} date(s)
                                </p>
                                {first.message && (
                                  <p style={{ margin: '10px 0 0', fontSize: 13, color: '#475569', fontStyle: 'italic', background: '#f8fafc', borderRadius: 8, padding: '8px 12px', borderLeft: '3px solid rgba(124, 58, 237,0.5)' }}>
                                    "{first.message}"
                                  </p>
                                )}
                              </div>
                              <BookingInvoiceButton bookings={groupBookings} isSeries label="Facture série" />
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                              {groupBookings.map((b) => {
                                const past = hasBookingEnded(b.requestedDate, b.endTime);
                                const dateFormatted = new Date(b.requestedDate).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
                                const isExcluded = groupExcluded.has(b._id);
                                return (
                                  <div
                                    key={b._id}
                                    data-booking-id={b._id}
                                    style={{ backgroundColor: '#fff', borderRadius: 20, padding: 16, boxShadow: '0 10px 40px rgba(0,0,0,0.12)', border: '1px solid rgba(0,0,0,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, opacity: past ? 0.7 : 1, flexWrap: 'wrap' }}
                                  >
                                    <div style={{ flex: 1, minWidth: 200, display: 'flex', alignItems: 'center', gap: 12 }}>
                                      {isRespondingGroup && b.status === 'PENDING' && (
                                        <input
                                          type="checkbox"
                                          checked={!isExcluded}
                                          onChange={() => {
                                            const next = new Set(groupExcluded);
                                            if (next.has(b._id)) next.delete(b._id); else next.add(b._id);
                                            setGroupExcluded(next);
                                          }}
                                          title="Inclure cette date dans l'acceptation"
                                          style={{ width: 18, height: 18, cursor: 'pointer', flexShrink: 0 }}
                                        />
                                      )}
                                      <div>
                                        <div style={{ padding: '6px 16px', borderRadius: 999, border: '1px solid rgba(0,0,0,0.12)', backgroundColor: 'rgba(0,0,0,0.04)', fontSize: '0.85em', fontWeight: 600, color: '#1a1a1a', display: 'inline-block', marginBottom: 8 }}>
                                          {dateFormatted}
                                        </div>
                                        <div style={{ color: '#1a1a1a', fontWeight: 600 }}>{b.startTime} – {b.endTime}</div>
                                      </div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, flexWrap: 'wrap' }}>
                                      <BookingStatusBadge status={b.status} perspective="owner" isPast={past} paymentDeadlineAt={b.paymentDeadlineAt} />
                                      <BookingInvoiceButton bookings={[b]} compact />
                                    </div>
                                  </div>
                                );
                              })}
                            </div>

                            {hasPending && (
                              <div style={{ marginTop: 20 }}>
                                {isRespondingGroup ? (
                                  <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 16, boxShadow: '0 10px 40px rgba(0,0,0,0.12)', border: '1px solid rgba(0,0,0,0.08)' }}>
                                    <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 8px 0' }}>
                                      Cochez les dates à inclure dans l'acceptation (décocher = refuser cette date).
                                    </p>
                                    <textarea
                                      value={groupOwnerResponse}
                                      onChange={(e) => setGroupOwnerResponse(e.target.value)}
                                      placeholder="Message optionnel pour le demandeur..."
                                      rows={2}
                                      style={{ width: '100%', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px', color: '#1a1a1a', fontSize: 13, marginBottom: 10, boxSizing: 'border-box', resize: 'vertical' }}
                                    />
                                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                                      <button
                                        onClick={() => handleGroupAction(selectedGroupId, 'ACCEPTED')}
                                        disabled={groupActionLoadingId === selectedGroupId}
                                        style={{ padding: '9px 20px', background: '#059669', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 700, opacity: groupActionLoadingId === selectedGroupId ? 0.6 : 1 }}
                                      >
                                        ✓ Accepter le lot
                                      </button>
                                      <button
                                        onClick={() => handleGroupAction(selectedGroupId, 'REFUSED')}
                                        disabled={groupActionLoadingId === selectedGroupId}
                                        style={{ padding: '9px 20px', background: '#fff', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 700, opacity: groupActionLoadingId === selectedGroupId ? 0.6 : 1 }}
                                      >
                                        ✕ Refuser tout
                                      </button>
                                      <button
                                        onClick={resetGroupResponse}
                                        style={{ padding: '9px 20px', background: 'transparent', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: 10, cursor: 'pointer', fontSize: 13 }}
                                      >
                                        Annuler
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => setIsRespondingGroup(true)}
                                    style={{ padding: '10px 22px', background: 'var(--ccc-accent-gradient)', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 14 }}
                                  >
                                    Répondre au lot
                                  </button>
                                )}
                              </div>
                            )}
                          </>
                        );
                })()}
              </div>
            ) : (
              <div>
                {recurringGroups.size > 0 && (
                  <div style={{ marginBottom: 28 }}>
                    <h3 style={{ color: 'var(--ccc-text-primary)', fontSize: 16, fontWeight: 700, margin: '0 0 14px 0' }}>
                      🔁 Séries récurrentes ({recurringGroups.size})
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                      {Array.from(recurringGroups.entries()).map(([groupId, groupBookings]) => {
                          const first = groupBookings[0];
                          const last = groupBookings[groupBookings.length - 1];
                          const pendingCount = groupBookings.filter((b) => b.status === 'PENDING').length;
                          const dateFirst = first?.requestedDate ? new Date(first.requestedDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
                          const dateLast = last?.requestedDate ? new Date(last.requestedDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
                          return (
                            <div
                              key={groupId}
                              onClick={() => { setSelectedGroupId(groupId); resetGroupResponse(); }}
                              style={{ backgroundColor: '#fff', borderRadius: 20, padding: '16px 20px', boxShadow: '0 10px 40px rgba(0,0,0,0.12)', border: '1px solid rgba(0,0,0,0.08)', cursor: 'pointer' }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                                <div>
                                  <h3 style={{ margin: '0 0 6px 0', color: '#1a1a1a', fontSize: '1.1em' }}>
                                    {first?.requester?.firstName} {first?.requester?.lastName}
                                  </h3>
                                  <p style={{ margin: 0, color: '#64748b', fontSize: '0.9em' }}>
                                    📍 {first?.venue?.name} · {first?.venue?.city} · {groupBookings.length} date(s)
                                  </p>
                                  <p style={{ margin: '4px 0 0 0', color: '#94a3b8', fontSize: '0.82em' }}>
                                    {dateFirst} → {dateLast}
                                  </p>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, flexShrink: 0 }}>
                                  <span style={{ padding: '6px 16px', borderRadius: 999, border: '1px solid rgba(0,0,0,0.12)', backgroundColor: 'rgba(0,0,0,0.04)', fontSize: '0.85em', fontWeight: 600, color: '#1a1a1a' }}>
                                    {groupBookings.length} date(s)
                                  </span>
                                  {pendingCount > 0 && (
                                    <span style={{ padding: '4px 12px', borderRadius: 999, background: 'rgba(245,158,11,0.15)', color: '#b45309', fontSize: '0.75em', fontWeight: 700 }}>
                                      {pendingCount} en attente
                                    </span>
                                  )}
                                  <BookingInvoiceButton
                                    bookings={groupBookings}
                                    isSeries
                                    label="Facture série"
                                    onClick={(e) => e.stopPropagation()}
                                    compact
                                  />
                                </div>
                              </div>
                            </div>
                          );
                      })}
                    </div>
                  </div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: 12,
                    marginBottom: 8,
                  }}
                >
                  <select
                    value={selectedVenueId}
                    onChange={(e) => setSelectedVenueId(e.target.value)}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 10,
                      border: '1px solid var(--ccc-border-medium)',
                      background: 'var(--ccc-bg-elevated)',
                      color: 'var(--ccc-text-primary)',
                      fontSize: 14,
                    }}
                  >
                    <option value="ALL">Toutes les salles</option>
                    {myVenues.map((venue) => (
                      <option key={venue._id} value={venue._id}>
                        {venue.name}
                      </option>
                    ))}
                  </select>

                  <select
                    value={selectedStatus}
                    onChange={(e) => setSelectedStatus(e.target.value)}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 10,
                      border: '1px solid var(--ccc-border-medium)',
                      background: 'var(--ccc-bg-elevated)',
                      color: 'var(--ccc-text-primary)',
                      fontSize: 14,
                    }}
                  >
                    <option value="ALL">Tous les statuts</option>
                    {bookingStatuses.map((status) => (
                      <option key={status} value={status}>
                        {statusLabel(status)}
                      </option>
                    ))}
                  </select>
                </div>

                {standaloneBookings.length === 0 ? (
                  <div
                    style={{
                      textAlign: 'center',
                      padding: '36px 24px',
                      border: '1px dashed rgba(255,255,255,0.15)',
                      borderRadius: 16,
                      color: 'var(--ccc-text-muted)',
                    }}
                  >
                    {recurringGroups.size > 0
                      ? 'Aucune réservation individuelle (hors séries).'
                      : 'Aucune réservation ne correspond à ces filtres.'}
                  </div>
                ) : (
                  standaloneBookings.map((booking) => {
                    const isExpiredByDate = hasBookingEnded(booking.requestedDate, booking.endTime);
                    const normalizedStatus = booking.status === 'PENDING' && isExpiredByDate ? 'EXPIRED' : booking.status;
                    const statusColor =
                      normalizedStatus === 'PENDING' ? { color: '#d97706', bg: '#fef3c7', border: '#fde68a' } :
                      normalizedStatus === 'ACCEPTED' ? { color: '#2563eb', bg: '#dbeafe', border: '#bfdbfe' } :
                      normalizedStatus === 'CONFIRMED' ? { color: '#059669', bg: '#d1fae5', border: '#a7f3d0' } :
                      normalizedStatus === 'REFUSED' ? { color: '#dc2626', bg: '#fee2e2', border: '#fecaca' } :
                      { color: '#6b7280', bg: '#f3f4f6', border: '#e5e7eb' };

                    const statusLabel =
                      normalizedStatus === 'PENDING' ? 'En attente' :
                      normalizedStatus === 'ACCEPTED' ? 'Acceptée' :
                      normalizedStatus === 'REFUSED' ? 'Refusée' :
                      normalizedStatus === 'EXPIRED' ? 'Expirée' :
                      normalizedStatus === 'CONFIRMED' ? 'Confirmée' :
                      normalizedStatus === 'CANCELLED_BY_REQUESTER' ? 'Annulée par le demandeur' :
                      normalizedStatus === 'CANCELLED_BY_OWNER' ? 'Annulée par vous' : normalizedStatus;

                    const isHighlighted = highlightedBookingId === booking._id;
                    return (
                    <div
                      key={booking._id}
                      data-booking-id={booking._id}
                      className={isHighlighted ? 'is-highlighted' : undefined}
                      style={{
                        backgroundColor: '#ffffff',
                        borderRadius: 20,
                        padding: 20,
                        boxShadow: '0 10px 40px rgba(0,0,0,0.12)',
                        border: '1px solid rgba(0,0,0,0.08)',
                        marginBottom: 15,
                      }}
                    >
                      {/* Header */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <h3 style={{ margin: '0 0 4px 0', fontSize: 18, fontWeight: 700, color: '#1a1a1a' }}>
                            {booking.venue?.name || 'Salle'}
                          </h3>
                          <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>
                            📍 {booking.venue?.city} · {booking.venue?.address}
                          </p>
                        </div>
                        <span style={{
                          padding: '6px 14px',
                          borderRadius: 999,
                          fontSize: 12,
                          fontWeight: 600,
                          color: statusColor.color,
                          backgroundColor: statusColor.bg,
                          border: `1px solid ${statusColor.border}`,
                          whiteSpace: 'nowrap',
                          flexShrink: 0,
                          marginLeft: 12,
                        }}>
                          {statusLabel}
                        </span>
                      </div>

                      {/* Meta grid */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12, padding: '14px 16px', background: 'rgba(0,0,0,0.03)', borderRadius: 12, marginBottom: 14 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <span style={{ fontSize: '0.72em', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Date</span>
                          <span style={{ fontSize: '0.95em', color: '#1a1a1a', fontWeight: 600 }}>
                            {new Date(booking.requestedDate).toLocaleDateString('fr-FR')}
                          </span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <span style={{ fontSize: '0.72em', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Horaire</span>
                          <span style={{ fontSize: '0.95em', color: '#1a1a1a', fontWeight: 600 }}>
                            {booking.startTime} – {booking.endTime}
                          </span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <span style={{ fontSize: '0.72em', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Demandeur</span>
                          <span style={{ fontSize: '0.95em', color: '#1a1a1a', fontWeight: 500 }}>
                            {booking.requester?.firstName} {booking.requester?.lastName}
                          </span>
                        </div>
                      </div>

                      {/* Toggle infos demandeur */}
                      <button
                        type="button"
                        onClick={() => setExpandedRequesterId(expandedRequesterId === booking._id ? null : booking._id)}
                        style={{ padding: 0, background: 'none', border: 'none', color: '#e85d75', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                      >
                        {expandedRequesterId === booking._id ? 'Masquer les infos du demandeur' : 'Voir les infos du demandeur'}
                      </button>

                      {expandedRequesterId === booking._id && (
                        <div style={{ marginTop: 10, padding: '12px 14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, display: 'grid', gap: 6, fontSize: 13, color: '#374151' }}>
                          <div>✉ {booking.requester?.email || 'Non renseigné'}</div>
                          <div>☎ {booking.requester?.phone || booking.requester?.organizerProfile?.phone || 'Non renseigné'}</div>
                          <div>Rôle : {booking.requester?.role || 'Non renseigné'}</div>
                          {booking.requester?.organizerProfile?.companyName && (
                            <div>Société : {booking.requester.organizerProfile.companyName}</div>
                          )}
                        </div>
                      )}

                      {booking.message && (
                        <p style={{ margin: '12px 0 0', fontSize: 13, color: '#6b7280', fontStyle: 'italic' }}>
                          Message : "{booking.message}"
                        </p>
                      )}
                      {booking.ownerResponse && (
                        <p style={{ margin: '8px 0 0', fontSize: 13, color: '#059669', fontWeight: 500 }}>
                          Votre réponse : {booking.ownerResponse}
                        </p>
                      )}

                      {/* Infos paiement */}
                      {booking.status === 'ACCEPTED' && (
                        <p style={{ margin: '10px 0 0', padding: '8px 12px', fontSize: 13, color: '#d97706', background: '#fef3c7', borderRadius: 8, borderLeft: '3px solid #fbbf24' }}>
                          En attente de paiement par le demandeur
                        </p>
                      )}
                      {booking.status === 'CONFIRMED' && booking.paidAt && (
                        <p style={{ margin: '10px 0 0', padding: '8px 12px', fontSize: 13, color: '#059669', background: '#d1fae5', borderRadius: 8, borderLeft: '3px solid #34d399' }}>
                          Paiement de {booking.paidAmount != null ? `${booking.paidAmount.toLocaleString('fr-FR')} €` : 'montant non renseigné'} reçu le {new Date(booking.paidAt).toLocaleDateString('fr-FR')}
                        </p>
                      )}
                      {(booking.paymentStatus === 'refund_pending' || booking.paymentStatus === 'refunded') && (
                        <p style={{ margin: '10px 0 0', padding: '8px 12px', fontSize: 13, color: booking.paymentStatus === 'refunded' ? '#059669' : '#d97706', background: booking.paymentStatus === 'refunded' ? '#d1fae5' : '#fef3c7', borderRadius: 8, borderLeft: `3px solid ${booking.paymentStatus === 'refunded' ? '#34d399' : '#fbbf24'}` }}>
                          {booking.paymentStatus === 'refunded'
                            ? `Remboursement effectué${booking.refundedAmount != null ? ` (${booking.refundedAmount.toLocaleString('fr-FR')} €)` : ''}`
                            : 'Remboursement en attente'}
                        </p>
                      )}

                      <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
                        <BookingInvoiceButton bookings={[booking]} />
                      </div>

                      {/* Boutons action */}
                      {normalizedStatus === 'PENDING' && (
                        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                          <button
                            onClick={() => handleBookingStatusAction(booking._id, 'ACCEPTED')}
                            disabled={actionLoadingId === booking._id}
                            style={{ padding: '9px 20px', background: '#059669', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 700, opacity: actionLoadingId === booking._id ? 0.6 : 1 }}
                          >
                            ✓ Accepter
                          </button>
                          <button
                            onClick={() => handleBookingStatusAction(booking._id, 'REFUSED')}
                            disabled={actionLoadingId === booking._id}
                            style={{ padding: '9px 20px', background: '#fff', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 700, opacity: actionLoadingId === booking._id ? 0.6 : 1 }}
                          >
                            ✕ Refuser
                          </button>
                        </div>
                      )}
                    </div>
                    );
                  }))}
              </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default MesSallesPage;