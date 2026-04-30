import React, { useState, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { cancelBooking, createVenueCheckoutSession, confirmVenuePayment } from '../services/api';
import { useMyBookings } from '../hooks/useMyBookings';
import BookingCardSkeleton from '../components/skeletons/BookingCardSkeleton';
import { SuccessMessages, ErrorMessages, getErrorMessage } from '../services/systemMessages';
import { useAlert } from '../hooks/useAlert';
import BookingStatusBadge from '../components/BookingStatusBadge';
import Navbar from '../components/Navbar';
import VenuesTabs from '../components/VenuesTabs';
import type { IVenueBooking } from '../types/venue';
import { calculateRefundEstimate, formatRefundMessage, formatRefundReason } from '../utils/cancellationPolicy';

const isDatePast = (dateStr: string): boolean => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(dateStr) < today;
};

const MyBookingsPage: React.FC = () => {
  const navigate = useNavigate();
  const { showSuccess, showError } = useAlert();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [cancelConfirmBooking, setCancelConfirmBooking] = useState<IVenueBooking | null>(null);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'status' | 'date-asc' | 'date-desc' | 'created-desc'>('status');
  const [page, setPage] = useState(1);

  const PAGE_SIZE = 10;

  // useRef guard prevents double-fire in React Strict Mode
  const paymentHandledRef = useRef(false);

  // Gestion du retour Stripe
  useEffect(() => {
    const payment = searchParams.get('payment');
    const sessionId = searchParams.get('session_id');

    if (payment === 'success' && sessionId && !paymentHandledRef.current) {
      paymentHandledRef.current = true;
      // Clear URL params immediately to prevent re-triggering
      setSearchParams({}, { replace: true });

      confirmVenuePayment(sessionId)
        .then(() => {
          showSuccess(SuccessMessages.BOOKING_PAYMENT_SUCCESS);
          queryClient.invalidateQueries({ queryKey: ['my-bookings'] });
        })
        .catch((err: unknown) => {
          queryClient.invalidateQueries({ queryKey: ['my-bookings'] });
          // Differentiate "already confirmed" (200/409) from real errors
          const status = (err as { response?: { status?: number } })?.response?.status;
          if (status === 200 || status === 409) {
            // Webhook already handled it — show success anyway
            showSuccess(SuccessMessages.BOOKING_PAYMENT_SUCCESS);
          } else {
            showError('Le paiement a été reçu mais la confirmation a échoué. Veuillez réessayer.');
          }
        });
    } else if (payment === 'cancelled') {
      showError('Paiement annulé.');
      setSearchParams({}, { replace: true });
    }
  }, []);

  const { data, isLoading, error } = useMyBookings();

  const handleCancelClick = (booking: IVenueBooking) => {
    setCancelConfirmBooking(booking);
  };

  const handleCancelConfirm = async () => {
    if (!cancelConfirmBooking) return;
    const bookingId = cancelConfirmBooking._id;
    setCancelConfirmBooking(null);
    setCancellingId(bookingId);
    try {
      await cancelBooking(bookingId);
      showSuccess(SuccessMessages.BOOKING_CANCELLED);
      queryClient.invalidateQueries({ queryKey: ['my-bookings'] });
    } catch (err) {
      showError(getErrorMessage(err, ErrorMessages.BOOKING_CANCEL_FAILED));
    } finally {
      setCancellingId(null);
    }
  };

  const handlePay = async (bookingId: string) => {
    setPayingId(bookingId);
    try {
      const data = await createVenueCheckoutSession(bookingId);
      if (data?.url) {
        window.location.href = data.url;
      } else {
        showError('Impossible de lancer le paiement. Veuillez réessayer.');
        setPayingId(null);
      }
    } catch (err) {
      showError(getErrorMessage(err, ErrorMessages.BOOKING_PAYMENT_FAILED));
      setPayingId(null);
    }
  };

  const isArchived = (b: IVenueBooking) =>
    isDatePast(b.requestedDate) ||
    ['EXPIRED', 'REFUSED', 'CANCELLED_BY_OWNER', 'CANCELLED_BY_REQUESTER'].includes(b.status);

  const statusPriority = (booking: IVenueBooking) => {
    if (booking.status === 'ACCEPTED' && !isDatePast(booking.requestedDate)) return 0;
    if (booking.status === 'CONFIRMED' && !isDatePast(booking.requestedDate)) return 1;
    if (booking.status === 'PENDING' && !isDatePast(booking.requestedDate)) return 2;
    if (booking.status === 'EXPIRED') return 3;
    if (booking.status === 'REFUSED') return 4;
    return 5; // CANCELLED_BY_OWNER, CANCELLED_BY_REQUESTER
  };

  const matchesSearch = (b: IVenueBooking) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      b.venue?.name?.toLowerCase().includes(q) ||
      b.venue?.city?.toLowerCase().includes(q) ||
      b.venue?.address?.toLowerCase().includes(q)
    );
  };

  const sortFn = (a: IVenueBooking, b: IVenueBooking) => {
    if (sortBy === 'status') return statusPriority(a) - statusPriority(b);
    if (sortBy === 'date-asc') return new Date(a.requestedDate).getTime() - new Date(b.requestedDate).getTime();
    if (sortBy === 'date-desc') return new Date(b.requestedDate).getTime() - new Date(a.requestedDate).getTime();
    if (sortBy === 'created-desc') return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    return 0;
  };

  const activeBookings = (data ?? []).filter((b) => !isArchived(b) && matchesSearch(b)).sort(sortFn);
  const archivedBookings = (data ?? []).filter((b) => isArchived(b) && matchesSearch(b))
    .sort((a, b) => new Date(b.requestedDate).getTime() - new Date(a.requestedDate).getTime());

  const filtered = [...activeBookings, ...archivedBookings];
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);


  // Calcul de l'estimation de remboursement pour le modal
  const refundEstimate = (() => {
    const b = cancelConfirmBooking;
    if (!b || b.paymentStatus !== 'paid' || !b.paidAmount) return null;
    const venue = b.venue as any;
    const policy = venue?.cancellationPolicy ?? 'moderate';
    const eventDatetime = new Date(b.requestedDate);
    const [h, m] = b.startTime.split(':').map(Number);
    eventDatetime.setUTCHours(h, m, 0, 0);
    return calculateRefundEstimate(b.paidAmount, policy, eventDatetime, new Date(b.createdAt));
  })();

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(to bottom right, #1a1a2e, #331f41)', paddingBottom: 60, padding: '20px' }}>
      {/* Modal de confirmation d'annulation */}
      {cancelConfirmBooking && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
        }}>
          <div style={{
            background: 'linear-gradient(135deg, #1e1b2e, #2a1f3d)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 16, padding: 28, maxWidth: 440, width: '100%',
            boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
          }}>
            <h3 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 700, color: '#fff' }}>
              Confirmer l'annulation
            </h3>
            <p style={{ margin: '0 0 20px', fontSize: 13, color: '#888' }}>
              {cancelConfirmBooking.venue?.name} — {new Date(cancelConfirmBooking.requestedDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
            </p>

            {/* Infos remboursement si booking payé */}
            {refundEstimate && cancelConfirmBooking.paidAmount ? (
              <div style={{ marginBottom: 20, padding: '14px 16px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10 }}>
                <p style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 600, color: refundEstimate.refundPercent === 0 ? '#ef4444' : refundEstimate.refundPercent === 50 ? '#f59e0b' : '#10b981' }}>
                  {formatRefundMessage(refundEstimate, cancelConfirmBooking.paidAmount)}
                </p>
                <p style={{ margin: 0, fontSize: 12, color: '#888' }}>
                  {formatRefundReason(refundEstimate.reason)}
                </p>
              </div>
            ) : cancelConfirmBooking.paymentStatus === 'paid' ? null : (
              <p style={{ marginBottom: 20, fontSize: 13, color: '#ccc' }}>
                Cette réservation n'a pas encore été payée. Aucun remboursement ne sera effectué.
              </p>
            )}

            <div style={{ display: 'flex', gap: 12 }}>
              <button
                onClick={() => setCancelConfirmBooking(null)}
                style={{
                  flex: 1, padding: '12px', background: 'rgba(255,255,255,0.06)',
                  color: '#ccc', border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer',
                }}
              >
                Garder la réservation
              </button>
              <button
                onClick={handleCancelConfirm}
                style={{
                  flex: 1, padding: '12px',
                  background: 'rgba(239,68,68,0.15)',
                  color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)',
                  borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer',
                }}
              >
                Confirmer l'annulation
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @media (max-width: 640px) {
          .my-bookings-header h1 { font-size: 1.8em !important; }
          .booking-card-header { flex-direction: column; align-items: flex-start !important; }
          .booking-card-actions { flex-direction: column; }
          .booking-card-actions button { width: 100%; }
        }
      `}</style>
      <Navbar />

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '40px 24px' }}>
        <div className="my-bookings-header" style={{ marginBottom: 24 }}>
          <h1 style={{ margin: '0 0 8px 0', fontSize: '2.5em', fontWeight: 800, color: '#ff416c' }}>
            Salles
          </h1>
          <p style={{ margin: 0, fontSize: '1.1em', color: '#aaa' }}>
            Gérez vos réservations et explorez les salles disponibles.
          </p>
        </div>

        <VenuesTabs />

        {isLoading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {Array.from({ length: 3 }).map((_, i) => <BookingCardSkeleton key={i} />)}
          </div>
        ) : error ? (
          <div style={{ textAlign: 'center', padding: 60 }}>
            <p style={{ color: '#ef4444' }}>Impossible de charger vos réservations.</p>
          </div>
        ) : !data || data.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '64px 24px',
              border: '1px dashed rgba(255,255,255,0.1)',
              borderRadius: 20,
            }}
          >
            <div style={{ fontSize: 60, marginBottom: 20 }}>📅</div>
            <h3 style={{ color: '#fff', fontSize: 22, marginBottom: 10 }}>Aucune réservation</h3>
            <p style={{ color: '#888', fontSize: 15, marginBottom: 28 }}>
              Vous n'avez encore fait aucune demande de réservation.
            </p>
            <button
              onClick={() => navigate('/venues')}
              style={{
                padding: '14px 32px',
                background: 'linear-gradient(135deg, #ff416c 0%, #ff4b2b 100%)',
                color: '#fff',
                border: 'none',
                borderRadius: 12,
                fontWeight: 700,
                fontSize: 15,
                cursor: 'pointer',
              }}
            >
              Explorer les salles
            </button>
          </div>
        ) : (
            <div>
              {/* Barre de recherche + tri */}
              <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
                <input
                  type="text"
                  placeholder="Rechercher par salle, ville..."
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  style={{
                    flex: 1,
                    minWidth: 200,
                    padding: '10px 14px',
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: 10,
                    color: '#fff',
                    fontSize: 14,
                    outline: 'none',
                  }}
                />
                <select
                  value={sortBy}
                  onChange={(e) => { setSortBy(e.target.value as typeof sortBy); setPage(1); }}
                  style={{
                    padding: '10px 14px',
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: 10,
                    color: '#fff',
                    fontSize: 14,
                    cursor: 'pointer',
                    outline: 'none',
                  }}
                >
                  <option value="status" style={{ background: '#1a1a2e' }}>Trier par statut</option>
                  <option value="date-desc" style={{ background: '#1a1a2e' }}>Date ↓ (récente)</option>
                  <option value="date-asc" style={{ background: '#1a1a2e' }}>Date ↑ (ancienne)</option>
                  <option value="created-desc" style={{ background: '#1a1a2e' }}>Demande récente</option>
                </select>
              </div>

              {filtered.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 24px', color: '#888' }}>
                  Aucune réservation ne correspond à votre recherche.
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {paginated.map((booking) => {
                      const past = isDatePast(booking.requestedDate);
                      const archived = isArchived(booking);
                      const deadlineMs = booking.paymentDeadlineAt
                        ? new Date(booking.paymentDeadlineAt).getTime() - Date.now()
                        : null;
                      const isUrgent = booking.status === 'ACCEPTED' && deadlineMs !== null && deadlineMs < 24 * 3600 * 1000 && deadlineMs > 0;

                      const venueDeleted = booking.venue?.isDeleted === true;
                      const pt = (booking.venue as any)?.pricingType;
                      const venuePricePerEvent: number = (booking.venue as any)?.pricePerEvent ?? 0;
                      const venueDeposit: number = (booking.venue as any)?.deposit ?? 0;
                      const venueExtraFees: { amount: number }[] = (booking.venue as any)?.extraFees ?? [];
                      const venueExtraFeesTotal = venueExtraFees.reduce((s, f) => s + (f.amount || 0), 0);
                      const toMinLocal = (t: string) => { const [h, m] = (t || '0:0').split(':').map(Number); return h * 60 + m; };
                      const baseAmount = (!pt || pt === 'heure')
                        ? Math.ceil(Math.max(1, (toMinLocal(booking.endTime) - toMinLocal(booking.startTime)) / 60)) * venuePricePerEvent
                        : venuePricePerEvent;
                      const displayAmount = baseAmount + venueDeposit + venueExtraFeesTotal;

                      return (
              <div
                key={booking._id}
                style={{
                  background: '#1a1a2e',
                  border: `1px solid ${venueDeleted ? 'rgba(156,163,175,0.2)' : isUrgent ? 'rgba(249,115,22,0.4)' : 'rgba(255,255,255,0.1)'}`,
                  borderRadius: 16,
                  padding: 24,
                  transition: 'border-color 0.2s',
                  opacity: venueDeleted || archived ? 0.55 : 1,
                  filter: venueDeleted ? 'grayscale(0.5)' : undefined,
                }}
              >
                <div
                  className="booking-card-header"
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    flexWrap: 'wrap',
                    gap: 12,
                    marginBottom: 16,
                  }}
                >
                  <div>
                    {venueDeleted ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#9ca3af' }}>
                          {booking.venue?.name || 'Salle inconnue'}
                        </h3>
                        <span style={{
                          fontSize: 11,
                          fontWeight: 700,
                          color: '#6b7280',
                          background: 'rgba(107,114,128,0.15)',
                          border: '1px solid rgba(107,114,128,0.3)',
                          borderRadius: 6,
                          padding: '2px 8px',
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                        }}>
                          Salle supprimée
                        </span>
                      </div>
                    ) : (
                      <button
                        onClick={() => navigate(`/venues/${booking.venue?._id}`)}
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          cursor: 'pointer',
                          textAlign: 'left',
                        }}
                      >
                        <h3
                          style={{
                            margin: '0 0 4px 0',
                            fontSize: 18,
                            fontWeight: 700,
                            color: '#fff',
                            textDecoration: 'none',
                          }}
                        >
                          {booking.venue?.name}
                        </h3>
                      </button>
                    )}
                    <p style={{ margin: 0, fontSize: 13, color: '#888' }}>
                      📍 {booking.venue?.city} · {booking.venue?.address}
                    </p>
                  </div>
                  <BookingStatusBadge
                      status={booking.status}
                      isPast={past}
                      paymentDeadlineAt={booking.paymentDeadlineAt}
                    />
                </div>

                {/* Détails de la réservation */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                    gap: 16,
                    marginBottom: 16,
                    padding: '14px 16px',
                    background: 'rgba(255,255,255,0.03)',
                    borderRadius: 10,
                  }}
                >
                  <div>
                    <p style={{ margin: '0 0 2px', fontSize: 11, color: '#666', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Date
                    </p>
                    <p style={{ margin: 0, fontSize: 14, color: '#ccc', fontWeight: 600 }}>
                      {new Date(booking.requestedDate).toLocaleDateString('fr-FR', {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })}
                    </p>
                  </div>
                  <div>
                    <p style={{ margin: '0 0 2px', fontSize: 11, color: '#666', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Horaires
                    </p>
                    <p style={{ margin: 0, fontSize: 14, color: '#ccc', fontWeight: 600 }}>
                      {booking.startTime} – {booking.endTime}
                    </p>
                  </div>
                  <div>
                    <p style={{ margin: '0 0 2px', fontSize: 11, color: '#666', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Demande envoyée
                    </p>
                    <p style={{ margin: 0, fontSize: 14, color: '#ccc' }}>
                      {new Date(booking.createdAt).toLocaleDateString('fr-FR')}
                    </p>
                  </div>
                </div>

                {booking.message && (
                  <p
                    style={{
                      margin: '0 0 14px 0',
                      fontSize: 13,
                      color: '#bbb',
                      background: 'rgba(255,255,255,0.04)',
                      padding: '10px 14px',
                      borderRadius: 8,
                      borderLeft: '3px solid rgba(255,65,108,0.4)',
                      fontStyle: 'italic',
                    }}
                  >
                    Votre message : "{booking.message}"
                  </p>
                )}

                {booking.ownerResponse && (
                  <p
                    style={{
                      margin: '0 0 14px 0',
                      fontSize: 13,
                      color: '#10b981',
                      background: 'rgba(16,185,129,0.06)',
                      padding: '10px 14px',
                      borderRadius: 8,
                      borderLeft: '3px solid rgba(16,185,129,0.4)',
                    }}
                  >
                    Réponse du propriétaire : "{booking.ownerResponse}"
                  </p>
                )}

                {/* Bandeaux contextuels selon le statut */}
                {booking.status === 'ACCEPTED' && !past && booking.paymentDeadlineAt && (
                  <div
                    style={{
                      margin: '0 0 14px 0',
                      padding: '10px 14px',
                      borderRadius: 8,
                      background: isUrgent ? 'rgba(249,115,22,0.08)' : 'rgba(16,185,129,0.06)',
                      borderLeft: `3px solid ${isUrgent ? '#f97316' : '#10b981'}`,
                      fontSize: 13,
                      color: isUrgent ? '#f97316' : '#10b981',
                    }}
                  >
                    Paiement requis avant le{' '}
                    <strong>
                      {new Date(booking.paymentDeadlineAt).toLocaleDateString('fr-FR', {
                        weekday: 'long',
                        day: 'numeric',
                        month: 'long',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </strong>
                  </div>
                )}

                {booking.status === 'EXPIRED' && (
                  <div
                    style={{
                      margin: '0 0 14px 0',
                      padding: '10px 14px',
                      borderRadius: 8,
                      background: 'rgba(107,114,128,0.08)',
                      borderLeft: '3px solid #6b7280',
                      fontSize: 13,
                      color: '#9ca3af',
                    }}
                  >
                    Le délai de paiement de 72h a expiré.{' '}
                    {booking.paymentDeadlineAt && (
                      <>Deadline : <strong>{new Date(booking.paymentDeadlineAt).toLocaleDateString('fr-FR')}</strong>.</>
                    )}{' '}
                    Vous pouvez faire une nouvelle demande pour cette salle.
                  </div>
                )}

                {booking.status === 'PENDING' && !past && (() => {
                  const daysSince = Math.floor((Date.now() - new Date(booking.createdAt).getTime()) / (1000 * 3600 * 24));
                  return daysSince >= 7 ? (
                    <div
                      style={{
                        margin: '0 0 14px 0',
                        padding: '10px 14px',
                        borderRadius: 8,
                        background: 'rgba(245,158,11,0.06)',
                        borderLeft: '3px solid #f59e0b',
                        fontSize: 13,
                        color: '#f59e0b',
                      }}
                    >
                      Pas de réponse depuis {daysSince} jours. Vous pouvez annuler et essayer une autre salle.
                    </div>
                  ) : null;
                })()}

                {booking.status === 'CONFIRMED' && booking.paidAmount !== undefined && (
                  <div
                    style={{
                      margin: '0 0 14px 0',
                      padding: '10px 14px',
                      borderRadius: 8,
                      background: 'rgba(59,130,246,0.06)',
                      borderLeft: '3px solid #3b82f6',
                      fontSize: 13,
                      color: '#93c5fd',
                    }}
                  >
                    Paiement de <strong>{booking.paidAmount.toLocaleString('fr-FR')} €</strong> reçu
                    {booking.paidAt && (
                      <> le <strong>{new Date(booking.paidAt).toLocaleDateString('fr-FR')}</strong></>
                    )}
                    .
                  </div>
                )}

                <div className="booking-card-actions" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  {!venueDeleted && (
                    <button
                      onClick={() => navigate(`/venues/${booking.venue?._id}`)}
                      style={{
                        padding: '8px 18px',
                        background: 'rgba(255,255,255,0.06)',
                        color: '#ccc',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: 8,
                        cursor: 'pointer',
                        fontSize: 13,
                        fontWeight: 600,
                      }}
                    >
                      Voir la salle
                    </button>
                  )}
                  {booking.status === 'ACCEPTED' && pt !== 'gratuit' && pt !== 'pourcentage_billetterie' && venuePricePerEvent > 0 && !past && !venueDeleted && (
                    <button
                      onClick={() => handlePay(booking._id)}
                      disabled={payingId === booking._id}
                      style={{
                        padding: '10px 22px',
                        background: isUrgent
                          ? 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)'
                          : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 8,
                        cursor: payingId === booking._id ? 'not-allowed' : 'pointer',
                        fontSize: 14,
                        fontWeight: 700,
                        opacity: payingId === booking._id ? 0.6 : 1,
                        boxShadow: isUrgent ? '0 0 12px rgba(249,115,22,0.4)' : 'none',
                      }}
                    >
                      {payingId === booking._id
                        ? 'Redirection...'
                        : `Payer ${displayAmount.toLocaleString('fr-FR')} €`}
                    </button>
                  )}
                  {booking.status === 'ACCEPTED' && pt === 'pourcentage_billetterie' && !past && (
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      padding: '8px 14px',
                      background: 'rgba(59,130,246,0.12)',
                      border: '1px solid rgba(59,130,246,0.3)',
                      borderRadius: 8,
                      fontSize: 13,
                      color: '#93c5fd',
                      fontWeight: 600,
                    }}>
                      Paiement billetterie
                    </span>
                  )}
                  {booking.status === 'ACCEPTED' && pt === 'gratuit' && !past && (
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      padding: '8px 14px',
                      background: 'rgba(16,185,129,0.1)',
                      border: '1px solid rgba(16,185,129,0.3)',
                      borderRadius: 8,
                      fontSize: 13,
                      color: '#6ee7b7',
                      fontWeight: 600,
                    }}>
                      Confirmation en cours
                    </span>
                  )}
                  {booking.status === 'EXPIRED' && (
                    <button
                      onClick={() => navigate(`/venues/${booking.venue?._id}`)}
                      style={{
                        padding: '8px 18px',
                        background: 'rgba(255,255,255,0.06)',
                        color: '#ccc',
                        border: '1px solid rgba(255,255,255,0.15)',
                        borderRadius: 8,
                        cursor: 'pointer',
                        fontSize: 13,
                        fontWeight: 600,
                      }}
                    >
                      Faire une nouvelle demande
                    </button>
                  )}
                  {(booking.status === 'PENDING' || booking.status === 'ACCEPTED') && !past && (
                    <button
                      onClick={() => handleCancelClick(booking)}
                      disabled={cancellingId === booking._id}
                      style={{
                        padding: '8px 18px',
                        background: 'rgba(239,68,68,0.1)',
                        color: '#ef4444',
                        border: '1px solid rgba(239,68,68,0.25)',
                        borderRadius: 8,
                        cursor: cancellingId === booking._id ? 'not-allowed' : 'pointer',
                        fontSize: 13,
                        fontWeight: 600,
                        opacity: cancellingId === booking._id ? 0.6 : 1,
                      }}
                    >
                      {cancellingId === booking._id ? 'Annulation...' : 'Annuler la demande'}
                    </button>
                  )}
                  {booking.status === 'CONFIRMED' && !past && (
                    <button
                      onClick={() => handleCancelClick(booking)}
                      disabled={cancellingId === booking._id}
                      style={{
                        padding: '8px 18px',
                        background: 'rgba(239,68,68,0.08)',
                        color: '#ef4444',
                        border: '1px solid rgba(239,68,68,0.2)',
                        borderRadius: 8,
                        cursor: cancellingId === booking._id ? 'not-allowed' : 'pointer',
                        fontSize: 13,
                        fontWeight: 600,
                        opacity: cancellingId === booking._id ? 0.6 : 1,
                      }}
                    >
                      {cancellingId === booking._id ? 'Annulation...' : 'Annuler la réservation'}
                    </button>
                  )}
                </div>
              </div>
                      );
                    })}
                  </div>

                  {/* Pagination */}
                  {totalPages > 1 && (
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 24 }}>
                      <button
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page === 1}
                        style={{
                          padding: '8px 16px',
                          background: page === 1 ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.08)',
                          color: page === 1 ? '#555' : '#ccc',
                          border: '1px solid rgba(255,255,255,0.1)',
                          borderRadius: 8,
                          cursor: page === 1 ? 'default' : 'pointer',
                          fontSize: 14,
                        }}
                      >
                        ← Précédent
                      </button>

                      <span style={{ color: '#888', fontSize: 13, padding: '0 8px' }}>
                        Page {page} / {totalPages}
                        <span style={{ color: '#555', marginLeft: 8 }}>({filtered.length} résultats)</span>
                      </span>

                      <button
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        disabled={page === totalPages}
                        style={{
                          padding: '8px 16px',
                          background: page === totalPages ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.08)',
                          color: page === totalPages ? '#555' : '#ccc',
                          border: '1px solid rgba(255,255,255,0.1)',
                          borderRadius: 8,
                          cursor: page === totalPages ? 'default' : 'pointer',
                          fontSize: 14,
                        }}
                      >
                        Suivant →
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
        )}
      </div>
    </div>
  );
};

export default MyBookingsPage;
