import React, { useState, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { cancelBooking, cancelBookingGroup, createVenueCheckoutSession, createVenueGroupCheckoutSession, confirmVenuePayment, confirmVenueGroupPayment, confirmVenueRefund } from '../services/api';
import { useMyBookings } from '../hooks/useMyBookings';
import BookingCardSkeleton from '../components/skeletons/BookingCardSkeleton';
import { SuccessMessages, ErrorMessages, getErrorMessage } from '../services/systemMessages';
import { useAlert } from '../hooks/useAlert';
import BookingStatusBadge from '../components/BookingStatusBadge';
import BookingInvoiceButton from '../components/BookingInvoiceButton';
import Navbar from '../components/Navbar';
import VenuesTabs from '../components/VenuesTabs';
import type { IVenueBooking, CancellationPolicy } from '../types/venue';
import { calculateRefundEstimate, formatRefundMessage, formatRefundReason, type RefundEstimate } from '../utils/cancellationPolicy';

type DisplayItem =
  | { kind: 'single'; booking: IVenueBooking }
  | { kind: 'group'; groupId: string; bookings: IVenueBooking[] };

const isDatePast = (dateStr: string): boolean => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(dateStr) < today;
};

const getVenueCoverPhoto = (venue: IVenueBooking['venue']): string | undefined =>
  venue?.photos?.[0] || venue?.mainPhoto;

/** Estimation de remboursement d'une réservation (null si non payée). Miroir du backend. */
const computeBookingRefund = (b: IVenueBooking): RefundEstimate | null => {
  if (b.paymentStatus !== 'paid' || !b.paidAmount) return null;
  const policy = ((b.venue as { cancellationPolicy?: CancellationPolicy })?.cancellationPolicy) ?? 'moderate';
  const eventDatetime = new Date(b.requestedDate);
  const [h, m] = b.startTime.split(':').map(Number);
  eventDatetime.setUTCHours(h, m, 0, 0);
  return calculateRefundEstimate(b.paidAmount, policy, eventDatetime, new Date(b.createdAt));
};

const MyBookingsPage: React.FC = () => {
  const navigate = useNavigate();
  const { showSuccess, showError } = useAlert();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [cancelConfirmBooking, setCancelConfirmBooking] = useState<IVenueBooking | null>(null);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [payingGroupId, setPayingGroupId] = useState<string | null>(null);
  const [cancelConfirmGroup, setCancelConfirmGroup] = useState<{ groupId: string; bookings: IVenueBooking[] } | null>(null);
  const [cancellingGroupId, setCancellingGroupId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'status' | 'date-asc' | 'date-desc' | 'created-desc'>('status');
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'PENDING' | 'ACCEPTED' | 'CONFIRMED' | 'REFUSED' | 'EXPIRED' | 'CANCELLED_BY_OWNER' | 'CANCELLED_BY_REQUESTER'>('ALL');
  const [page, setPage] = useState(1);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const PAGE_SIZE = 10;

  // useRef guard prevents double-fire in React Strict Mode
  const paymentHandledRef = useRef(false);

  // Gestion du highlight — ?bookingId= (notifs) ou ?highlight= (legacy)
  const highlightId = searchParams.get('bookingId') ?? searchParams.get('highlight');
  const highlightIdRef = useRef(highlightId);

  // Gestion du retour Stripe
  useEffect(() => {
    const payment = searchParams.get('payment');
    const sessionId = searchParams.get('session_id');
    const paymentType = searchParams.get('type');

    if (payment === 'success' && sessionId && !paymentHandledRef.current) {
      paymentHandledRef.current = true;
      setSearchParams({}, { replace: true });

      // Série récurrente (lot) ou réservation unique : confirmation synchrone au retour
      // de Stripe (fallback si le webhook est lent ou non configuré).
      const confirm = paymentType === 'group'
        ? confirmVenueGroupPayment(sessionId)
        : confirmVenuePayment(sessionId);
      confirm
        .then(() => {
          showSuccess(SuccessMessages.BOOKING_PAYMENT_SUCCESS);
          queryClient.invalidateQueries({ queryKey: ['my-bookings'] });
        })
        .catch((err: unknown) => {
          queryClient.invalidateQueries({ queryKey: ['my-bookings'] });
          const status = (err as { response?: { status?: number } })?.response?.status;
          if (status === 200 || status === 409) {
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

  // Highlight scroll effect
  useEffect(() => {
    const id = highlightIdRef.current;
    if (!id || !data) return;
    setSearchParams({}, { replace: true });
    // Si la réservation ciblée appartient à une série, déplier le groupe pour qu'elle soit rendue
    const target = data.find((b: IVenueBooking) => b._id === id);
    if (target?.bookingGroupId) {
      const groupId = target.bookingGroupId;
      setExpandedGroups((prev) => (prev.has(groupId) ? prev : new Set(prev).add(groupId)));
    }
    // Scroll après le re-render (le sous-élément du groupe doit être monté)
    setTimeout(() => {
      const el = document.querySelector(`[data-booking-id="${id}"]`) as HTMLElement | null;
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 250);
  }, [data, setSearchParams]);

  // Fallback dev : confirmer les remboursements en attente si le webhook refund.updated n'a pas
  // été reçu (le serveur interroge Stripe par stripeRefundId). Une tentative par réservation.
  const polledRefundsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!data) return;
    const pending = (data as IVenueBooking[]).filter(
      (b) => b.paymentStatus === 'refund_pending' && !polledRefundsRef.current.has(b._id)
    );
    if (pending.length === 0) return;
    let cancelled = false;
    (async () => {
      let anyConfirmed = false;
      for (const b of pending) {
        polledRefundsRef.current.add(b._id);
        try {
          const res = await confirmVenueRefund(b._id);
          if (res.paymentStatus === 'refunded') anyConfirmed = true;
        } catch {
          /* remboursement encore en cours ou non applicable — ignoré */
        }
      }
      if (!cancelled && anyConfirmed) queryClient.invalidateQueries({ queryKey: ['my-bookings'] });
    })();
    return () => { cancelled = true; };
  }, [data, queryClient]);

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

  // Annulation de toute une série Org B : appel unique booking-centric (ADR 0004).
  const handleCancelSeriesConfirm = async () => {
    if (!cancelConfirmGroup) return;
    const { groupId } = cancelConfirmGroup;
    setCancelConfirmGroup(null);
    setCancellingGroupId(groupId);
    try {
      await cancelBookingGroup(groupId);
      showSuccess('Série annulée.');
      queryClient.invalidateQueries({ queryKey: ['my-bookings'] });
    } catch (err) {
      showError(getErrorMessage(err, ErrorMessages.BOOKING_CANCEL_FAILED));
    } finally {
      setCancellingGroupId(null);
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

  const handlePayGroup = async (bookingGroupId: string) => {
    setPayingGroupId(bookingGroupId);
    try {
      const data = await createVenueGroupCheckoutSession(bookingGroupId);
      if ('url' in data && data.url) {
        window.location.href = data.url;
      } else if ('allFree' in data && data.allFree) {
        showSuccess('Toutes les réservations de la série sont gratuites et déjà confirmées.');
        queryClient.invalidateQueries({ queryKey: ['my-bookings'] });
        setPayingGroupId(null);
      } else {
        showError('Impossible de lancer le paiement. Veuillez réessayer.');
        setPayingGroupId(null);
      }
    } catch (err) {
      showError(getErrorMessage(err, ErrorMessages.BOOKING_PAYMENT_FAILED));
      setPayingGroupId(null);
    }
  };

  const isArchived = (b: IVenueBooking) =>
    isDatePast(b.requestedDate) ||
    b.venue?.isDeleted === true ||
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
    if (sortBy === 'status') {
      const statusDiff = statusPriority(a) - statusPriority(b);
      if (statusDiff !== 0) return statusDiff;
      const dateA = new Date(a.requestedDate).getTime();
      const dateB = new Date(b.requestedDate).getTime();
      if (dateA !== dateB) return dateA - dateB;
      const timeA = a.startTime?.split(':').map(Number) ?? [0, 0];
      const timeB = b.startTime?.split(':').map(Number) ?? [0, 0];
      return (timeA[0] * 60 + timeA[1]) - (timeB[0] * 60 + timeB[1]);
    }
    if (sortBy === 'date-asc') {
      const dateA = new Date(a.requestedDate).getTime();
      const dateB = new Date(b.requestedDate).getTime();
      if (dateA !== dateB) return dateA - dateB;
      const timeA = a.startTime?.split(':').map(Number) ?? [0, 0];
      const timeB = b.startTime?.split(':').map(Number) ?? [0, 0];
      return (timeA[0] * 60 + timeA[1]) - (timeB[0] * 60 + timeB[1]);
    }
    if (sortBy === 'date-desc') {
      const dateA = new Date(a.requestedDate).getTime();
      const dateB = new Date(b.requestedDate).getTime();
      if (dateA !== dateB) return dateB - dateA;
      const timeA = a.startTime?.split(':').map(Number) ?? [0, 0];
      const timeB = b.startTime?.split(':').map(Number) ?? [0, 0];
      return (timeB[0] * 60 + timeB[1]) - (timeA[0] * 60 + timeA[1]);
    }
    if (sortBy === 'created-desc') return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    return 0;
  };

  const matchesStatus = (b: IVenueBooking) => filterStatus === 'ALL' || b.status === filterStatus;

  const recurringGroups = React.useMemo(() => {
    const map = new Map<string, IVenueBooking[]>();
    for (const b of data ?? []) {
      if (!b.bookingGroupId) continue;
      const list = map.get(b.bookingGroupId) ?? [];
      list.push(b);
      map.set(b.bookingGroupId, list);
    }
    map.forEach(list => list.sort((a, b) => new Date(a.requestedDate).getTime() - new Date(b.requestedDate).getTime()));
    return map;
  }, [data]);

  const allBookings: IVenueBooking[] = data ?? [];
  const activeBookings = allBookings.filter((b) => !isArchived(b) && matchesSearch(b) && matchesStatus(b)).sort(sortFn);
  const archivedBookings = allBookings.filter((b) => isArchived(b) && matchesSearch(b) && matchesStatus(b))
    .sort((a, b) => {
      const dateA = new Date(a.requestedDate).getTime();
      const dateB = new Date(b.requestedDate).getTime();
      if (dateA !== dateB) return dateB - dateA;
      const timeA = a.startTime?.split(':').map(Number) ?? [0, 0];
      const timeB = b.startTime?.split(':').map(Number) ?? [0, 0];
      return (timeB[0] * 60 + timeB[1]) - (timeA[0] * 60 + timeA[1]);
    });

  const filtered = [...activeBookings, ...archivedBookings];

  // Liste unifiée : chaque série récurrente devient un item unique (placé à la position de sa
  // première réservation filtrée) ; les réservations simples restent individuelles.
  const displayItems: DisplayItem[] = [];
  const seenGroups = new Set<string>();
  for (const b of filtered) {
    if (b.bookingGroupId) {
      if (seenGroups.has(b.bookingGroupId)) continue;
      seenGroups.add(b.bookingGroupId);
      displayItems.push({ kind: 'group', groupId: b.bookingGroupId, bookings: recurringGroups.get(b.bookingGroupId) ?? [b] });
    } else {
      displayItems.push({ kind: 'single', booking: b });
    }
  }

  const totalPages = Math.ceil(displayItems.length / PAGE_SIZE);
  const paginatedItems = displayItems.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Ramener la page courante dans les bornes si le nombre d'items diminue (regroupement, annulations…)
  useEffect(() => {
    if (totalPages > 0 && page > totalPages) setPage(totalPages);
  }, [page, totalPages]);


  // Calcul de l'estimation de remboursement pour le modal (réservation unique)
  const refundEstimate = cancelConfirmBooking ? computeBookingRefund(cancelConfirmBooking) : null;

  const toggleGroup = (groupId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  // Sous-carte d'une date à l'intérieur d'une série dépliée
  const renderGroupSubCard = (booking: IVenueBooking) => {
    const past = isDatePast(booking.requestedDate);
    const dateFormatted = new Date(booking.requestedDate).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
    const timeStr = `${booking.startTime} – ${booking.endTime}`;
    const pt = booking.venue?.pricingType;
    const isHighlighted = booking._id === (highlightId ?? highlightIdRef.current);
    return (
      <div
        key={booking._id}
        data-booking-id={booking._id}
        style={{
          backgroundColor: '#f9fafb', borderRadius: 14, padding: 14,
          border: isHighlighted ? '2px solid #7c3aed' : '1px solid rgba(0,0,0,0.08)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 12, opacity: past ? 0.7 : 1, flexWrap: 'wrap',
        }}
      >
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ padding: '5px 14px', borderRadius: 999, border: '1px solid rgba(0,0,0,0.12)', backgroundColor: '#fff', fontSize: '0.82em', fontWeight: 600, color: '#1a1a1a', display: 'inline-block', marginBottom: 6 }}>
            {dateFormatted}
          </div>
          <div style={{ color: '#1a1a1a', fontWeight: 600, fontSize: '0.9em' }}>{timeStr}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, flexWrap: 'wrap' }}>
          <BookingStatusBadge status={booking.status} isPast={past} paymentDeadlineAt={booking.paymentDeadlineAt} />
          {booking.status === 'ACCEPTED' && pt === 'gratuit' && !past && (
            <span style={{ padding: '6px 12px', background: '#d1fae5', border: '1px solid #6ee7b7', borderRadius: 8, fontSize: 12, color: '#065f46', fontWeight: 600 }}>
              Confirmation en cours
            </span>
          )}
          {(booking.status === 'PENDING' || booking.status === 'ACCEPTED') && !past && (
            <button
              onClick={() => handleCancelClick(booking)}
              disabled={cancellingId === booking._id}
              style={{ padding: '8px 16px', background: '#fff', color: '#ef4444', border: '1px solid #fca5a5', borderRadius: 8, cursor: cancellingId === booking._id ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600, opacity: cancellingId === booking._id ? 0.6 : 1 }}
            >
              {cancellingId === booking._id ? 'Annulation...' : 'Annuler'}
            </button>
          )}
          <BookingInvoiceButton bookings={[booking]} onClick={(e) => e.stopPropagation()} compact />
        </div>
      </div>
    );
  };

  // Carte d'une série récurrente : en-tête + badge d'état + bouton « Payer la série », dépliable
  const renderGroupCard = (groupId: string, bookings: IVenueBooking[]) => {
    const expanded = expandedGroups.has(groupId);
    const first = bookings[0];
    const last = bookings[bookings.length - 1];
    const dateFirst = first?.requestedDate ? new Date(first.requestedDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
    const dateLast = last?.requestedDate ? new Date(last.requestedDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
    // Réservation représentative de l'état de la série (la plus « active » selon la priorité de statut)
    const seriesStatusBooking = bookings.reduce((best, b) => (statusPriority(b) < statusPriority(best) ? b : best), first);
    const pt = first?.venue?.pricingType;
    const venuePricePerEvent: number = first?.venue?.pricePerEvent ?? 0;
    const acceptedUnpaid = bookings.filter((b) => b.status === 'ACCEPTED' && b.paymentStatus !== 'paid');
    const hasPayable = acceptedUnpaid.some((b) => !isDatePast(b.requestedDate));
    const showPayGroup = pt !== 'gratuit' && pt !== 'pourcentage_billetterie' && venuePricePerEvent > 0 && hasPayable;
    const cancellableSeries = bookings.some((b) => ['PENDING', 'ACCEPTED', 'CONFIRMED'].includes(b.status) && !isDatePast(b.requestedDate));
    const coverPhoto = getVenueCoverPhoto(first?.venue);

    return (
      <div key={groupId} style={{ backgroundColor: '#fff', borderRadius: 20, boxShadow: '0 10px 40px rgba(0,0,0,0.12)', border: '1px solid rgba(0,0,0,0.08)', overflow: 'hidden' }}>
        <div
          onClick={() => toggleGroup(groupId)}
          className="booking-card-layout"
          style={{ display: 'flex', flexDirection: 'row', alignItems: 'stretch', cursor: 'pointer' }}
        >
          <div
            className="booking-card-image"
            style={{ width: '25%', flexShrink: 0, minHeight: 160, position: 'relative', background: 'linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%)' }}
          >
            {coverPhoto ? (
              <img
                src={coverPhoto}
                alt={first?.venue?.name || 'Salle'}
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--ccc-bg-surface)' }}>
                <span style={{ fontSize: 48 }}>🏛️</span>
              </div>
            )}
            <span style={{ position: 'absolute', top: 10, left: 10, fontSize: '0.72em', fontWeight: 700, color: '#fff', background: 'rgba(124,58,237,0.92)', padding: '4px 10px', borderRadius: 999, boxShadow: '0 2px 8px rgba(0,0,0,0.25)' }}>
              🔁 Série
            </span>
          </div>

          <div
            className="booking-card-content"
            style={{ flex: 1, minWidth: 0, padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}
          >
            <div style={{ minWidth: 160 }}>
              <h3 style={{ margin: '0 0 6px 0', color: '#1a1a1a', fontSize: '1.1em' }}>{first?.venue?.name}</h3>
              <p style={{ margin: 0, color: '#64748b', fontSize: '0.9em' }}>
                📍 {first?.venue?.city} · {bookings.length} date(s)
              </p>
              <p style={{ margin: '4px 0 0 0', color: '#94a3b8', fontSize: '0.82em' }}>
                {dateFirst} → {dateLast}
              </p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10, flexShrink: 0 }}>
              {seriesStatusBooking && (
                <BookingStatusBadge
                  status={seriesStatusBooking.status}
                  isPast={isDatePast(seriesStatusBooking.requestedDate)}
                  paymentDeadlineAt={seriesStatusBooking.paymentDeadlineAt}
                />
              )}
              {showPayGroup && (
                <button
                  onClick={(e) => { e.stopPropagation(); handlePayGroup(groupId); }}
                  disabled={payingGroupId === groupId}
                  style={{ padding: '9px 18px', background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)', color: '#fff', border: 'none', borderRadius: 8, cursor: payingGroupId === groupId ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 700, opacity: payingGroupId === groupId ? 0.6 : 1, boxShadow: '0 4px 14px rgba(139,92,246,0.35)' }}
                >
                  {payingGroupId === groupId ? 'Redirection...' : `Payer la série (${acceptedUnpaid.length} réserv.)`}
                </button>
              )}
              {cancellableSeries && (
                <button
                  onClick={(e) => { e.stopPropagation(); setCancelConfirmGroup({ groupId, bookings }); }}
                  disabled={cancellingGroupId === groupId}
                  style={{ padding: '8px 16px', background: '#fff', color: '#ef4444', border: '1px solid #fca5a5', borderRadius: 8, cursor: cancellingGroupId === groupId ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600, opacity: cancellingGroupId === groupId ? 0.6 : 1 }}
                >
                  {cancellingGroupId === groupId ? 'Annulation...' : 'Annuler la série'}
                </button>
              )}
              <BookingInvoiceButton
                bookings={bookings}
                isSeries
                label="Facture série"
                onClick={(e) => e.stopPropagation()}
              />
              <span style={{ color: '#7c3aed', fontSize: 13, fontWeight: 600 }}>
                {expanded ? 'Masquer les dates ▲' : 'Voir les dates ▼'}
              </span>
            </div>
          </div>
        </div>

        {expanded && (
          <div style={{ borderTop: '1px solid rgba(0,0,0,0.06)', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {bookings.map((b) => renderGroupSubCard(b))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--ccc-bg-gradient)', color: 'var(--ccc-text-primary)', padding: '20px', paddingBottom: 60 }}>
      {/* Modal de confirmation d'annulation */}
      {cancelConfirmBooking && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
        }}>
          <div style={{
            background: 'var(--ccc-bg-elevated)',
            border: '1px solid var(--ccc-border-subtle)',
            borderRadius: 16,
            padding: 28,
            maxWidth: 440,
            width: '100%',
            boxShadow: '0 12px 40px rgba(15, 23, 42, 0.12)',
          }}>
            <h3 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 700, color: 'var(--ccc-text-primary)' }}>
              Confirmer l'annulation
            </h3>
            <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--ccc-text-muted)' }}>
              {cancelConfirmBooking.venue?.name} — {new Date(cancelConfirmBooking.requestedDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
            </p>

            {/* Infos remboursement si booking payé */}
            {refundEstimate && cancelConfirmBooking.paidAmount ? (
              <div style={{ marginBottom: 20, padding: '14px 16px', background: 'var(--ccc-bg-surface)', border: '1px solid var(--ccc-border-subtle)', borderRadius: 10 }}>
                <p style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 600, color: refundEstimate.refundPercent === 0 ? '#ef4444' : refundEstimate.refundPercent === 50 ? '#f59e0b' : '#10b981' }}>
                  {formatRefundMessage(refundEstimate, cancelConfirmBooking.paidAmount)}
                </p>
                <p style={{ margin: 0, fontSize: 12, color: 'var(--ccc-text-muted)' }}>
                  {formatRefundReason(refundEstimate.reason)}
                </p>
              </div>
            ) : cancelConfirmBooking.paymentStatus === 'paid' ? null : (
              <p style={{ marginBottom: 20, fontSize: 13, color: 'var(--ccc-text-secondary)' }}>
                Cette réservation n'a pas encore été payée. Aucun remboursement ne sera effectué.
              </p>
            )}

            <div style={{ display: 'flex', gap: 12 }}>
              <button
                onClick={() => setCancelConfirmBooking(null)}
                style={{
                  flex: 1, padding: '12px', background: 'var(--ccc-bg-surface)',
                  color: 'var(--ccc-text-secondary)', border: '1px solid var(--ccc-border-medium)',
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

      {/* Modal de confirmation d'annulation de série — remboursement par occurrence */}
      {cancelConfirmGroup && (() => {
        const toCancel = cancelConfirmGroup.bookings.filter(
          (b) => ['PENDING', 'ACCEPTED', 'CONFIRMED'].includes(b.status) && !isDatePast(b.requestedDate)
        );
        const rows = toCancel.map((b) => ({ booking: b, estimate: computeBookingRefund(b) }));
        const paidTotal = rows.reduce((s, r) => s + (r.booking.paymentStatus === 'paid' ? (r.booking.paidAmount ?? 0) : 0), 0);
        const refundTotal = rows.reduce((s, r) => s + (r.estimate?.refundAmount ?? 0), 0);
        return (
          <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <div style={{ background: 'var(--ccc-bg-elevated)', border: '1px solid var(--ccc-border-subtle)', borderRadius: 16, padding: 28, maxWidth: 520, width: '100%', maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 12px 40px rgba(15, 23, 42, 0.12)' }}>
              <h3 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 700, color: 'var(--ccc-text-primary)' }}>Annuler la série</h3>
              <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--ccc-text-muted)' }}>
                {cancelConfirmGroup.bookings[0]?.venue?.name} — {toCancel.length} date(s) annulable(s)
              </p>

              {paidTotal > 0 ? (
                <div style={{ marginBottom: 16, padding: '12px 14px', background: 'var(--ccc-bg-surface)', border: '1px solid var(--ccc-border-subtle)', borderRadius: 10 }}>
                  <p style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 700, color: refundTotal === 0 ? '#ef4444' : refundTotal >= paidTotal ? '#10b981' : '#f59e0b' }}>
                    Remboursement estimé : {refundTotal.toFixed(2)}€ sur {paidTotal.toFixed(2)}€ payés
                  </p>
                  <p style={{ margin: 0, fontSize: 12, color: 'var(--ccc-text-muted)' }}>
                    Chaque date est remboursée selon la politique de la salle, en fonction de son échéance.
                  </p>
                </div>
              ) : (
                <p style={{ marginBottom: 16, fontSize: 13, color: 'var(--ccc-text-secondary)' }}>
                  Aucune réservation payée — aucun remboursement ne sera effectué.
                </p>
              )}

              <div style={{ marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {rows.map(({ booking, estimate }) => {
                  const dateStr = new Date(booking.requestedDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
                  const paid = booking.paymentStatus === 'paid';
                  const label = !paid
                    ? 'non payée'
                    : estimate
                      ? `${estimate.refundAmount.toFixed(2)}€ (${estimate.refundPercent}%)`
                      : '—';
                  const color = !paid ? 'var(--ccc-text-muted)' : estimate && estimate.refundPercent === 0 ? '#ef4444' : estimate && estimate.refundPercent === 50 ? '#f59e0b' : '#10b981';
                  return (
                    <div key={booking._id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--ccc-text-secondary)', padding: '6px 0', borderBottom: '1px solid var(--ccc-border-subtle)' }}>
                      <span>{dateStr}</span>
                      <span style={{ color, fontWeight: 600 }}>{label}</span>
                    </div>
                  );
                })}
              </div>

              <div style={{ display: 'flex', gap: 12 }}>
                <button onClick={() => setCancelConfirmGroup(null)} style={{ flex: 1, padding: '12px', background: 'var(--ccc-bg-surface)', color: 'var(--ccc-text-secondary)', border: '1px solid var(--ccc-border-medium)', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                  Garder la série
                </button>
                <button onClick={handleCancelSeriesConfirm} style={{ flex: 1, padding: '12px', background: 'rgba(239,68,68,0.15)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                  Annuler les {toCancel.length} date(s)
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      <style>{`
        @media (max-width: 640px) {
          .my-bookings-header h1 { font-size: 1.8em !important; }
          .booking-card-layout { flex-direction: column !important; }
          .booking-card-image {
            width: 100% !important;
            min-height: 180px !important;
          }
          .booking-card-header { flex-direction: column; align-items: flex-start !important; }
          .booking-card-actions { flex-direction: column; }
          .booking-card-actions button { width: 100%; }
        }
      `}</style>
      <Navbar />

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '40px 24px' }}>
        <div className="my-bookings-header" style={{ marginBottom: 24 }}>
          <h1 className="ccc-page-title" style={{ margin: '0 0 8px 0' }}>
            Salles
          </h1>
          <p style={{ margin: 0, fontSize: '1.1em', color: 'var(--ccc-text-muted)' }}>
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
              border: '1px dashed var(--ccc-border-medium)',
              borderRadius: 20,
            }}
          >
            <div style={{ fontSize: 60, marginBottom: 20 }}>📅</div>
            <h3 style={{ color: 'var(--ccc-text-primary)', fontSize: 22, marginBottom: 10 }}>Aucune réservation</h3>
            <p style={{ color: 'var(--ccc-text-muted)', fontSize: 15, marginBottom: 28 }}>
              Vous n'avez encore fait aucune demande de réservation.
            </p>
            <button
              onClick={() => navigate('/venues')}
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
              Explorer les salles
            </button>
          </div>
        ) : (
            <div>
                <>
              {/* Barre de recherche + filtre + tri */}
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
                    background: '#fff',
                    border: '1px solid #e2e8f0',
                    borderRadius: 10,
                    color: '#1a1a1a',
                    fontSize: 14,
                    outline: 'none',
                  }}
                />
                <select
                  value={filterStatus}
                  onChange={(e) => { setFilterStatus(e.target.value as typeof filterStatus); setPage(1); }}
                  style={{
                    padding: '10px 14px',
                    background: '#fff',
                    border: `1px solid ${filterStatus !== 'ALL' ? '#7c3aed' : '#e2e8f0'}`,
                    borderRadius: 10,
                    color: filterStatus !== 'ALL' ? '#7c3aed' : '#1a1a1a',
                    fontSize: 14,
                    cursor: 'pointer',
                    outline: 'none',
                    fontWeight: filterStatus !== 'ALL' ? 600 : 400,
                  }}
                >
                  <option value="ALL">Tous les statuts</option>
                  <option value="PENDING">En attente</option>
                  <option value="ACCEPTED">Acceptée</option>
                  <option value="CONFIRMED">Confirmée</option>
                  <option value="REFUSED">Refusée</option>
                  <option value="EXPIRED">Expirée</option>
                  <option value="CANCELLED_BY_OWNER">Annulée par la salle</option>
                  <option value="CANCELLED_BY_REQUESTER">Annulée par moi</option>
                </select>
                <select
                  value={sortBy}
                  onChange={(e) => { setSortBy(e.target.value as typeof sortBy); setPage(1); }}
                  style={{
                    padding: '10px 14px',
                    background: '#fff',
                    border: '1px solid #e2e8f0',
                    borderRadius: 10,
                    color: '#1a1a1a',
                    fontSize: 14,
                    cursor: 'pointer',
                    outline: 'none',
                  }}
                >
                  <option value="status">Trier par statut</option>
                  <option value="date-asc">Date ↑ (ancienne)</option>
                  <option value="date-desc">Date ↓ (récente)</option>
                  <option value="created-desc">Demande récente</option>
                </select>
              </div>

              {displayItems.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 24px', color: '#64748b' }}>
                  Aucune réservation ne correspond à votre recherche.
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {paginatedItems.map((item) => {
                      if (item.kind === 'group') return renderGroupCard(item.groupId, item.bookings);
                      const booking = item.booking;
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

                      const effectiveHighlight = highlightId ?? highlightIdRef.current;
                      const isHighlighted = booking._id === effectiveHighlight;
                      const coverPhoto = getVenueCoverPhoto(booking.venue);

                      return (
              <div
                key={booking._id}
                data-booking-id={booking._id}
                className="booking-card-layout"
                style={{
                  display: 'flex',
                  flexDirection: 'row',
                  alignItems: 'stretch',
                  backgroundColor: '#ffffff',
                  border: isHighlighted
                    ? '2px solid #7c3aed'
                    : `1px solid ${isUrgent ? '#f97316' : 'rgba(0,0,0,0.08)'}`,
                  borderRadius: 20,
                  overflow: 'hidden',
                  boxShadow: isHighlighted
                    ? '0 0 20px rgba(124, 58, 237,0.4)'
                    : '0 10px 40px rgba(0,0,0,0.12)',
                  transition: 'border-color 0.2s',
                  opacity: venueDeleted || archived ? 0.6 : 1,
                  filter: venueDeleted ? 'grayscale(0.4)' : undefined,
                }}
              >
                <div
                  className="booking-card-image"
                  style={{
                    width: '25%',
                    flexShrink: 0,
                    minHeight: 200,
                    position: 'relative',
                    background: 'linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%)',
                  }}
                >
                  {coverPhoto ? (
                    <img
                      src={coverPhoto}
                      alt={booking.venue?.name || 'Salle'}
                      style={{
                        position: 'absolute',
                        inset: 0,
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'var(--ccc-bg-surface)',
                      }}
                    >
                      <span style={{ fontSize: 48 }}>🏛️</span>
                    </div>
                  )}
                </div>

                <div
                  className="booking-card-content"
                  style={{
                    flex: 1,
                    minWidth: 0,
                    padding: 24,
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
                          background: '#f3f4f6',
                          border: '1px solid #e5e7eb',
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
                            color: '#1a1a1a',
                            textDecoration: 'none',
                          }}
                        >
                          {booking.venue?.name}
                        </h3>
                      </button>
                    )}
                    <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>
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
                    background: 'rgba(0,0,0,0.03)',
                    borderRadius: 10,
                  }}
                >
                  <div>
                    <p style={{ margin: '0 0 2px', fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Date
                    </p>
                    <p style={{ margin: 0, fontSize: 14, color: '#1a1a1a', fontWeight: 600 }}>
                      {new Date(booking.requestedDate).toLocaleDateString('fr-FR', {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })}
                    </p>
                  </div>
                  <div>
                    <p style={{ margin: '0 0 2px', fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Horaires
                    </p>
                    <p style={{ margin: 0, fontSize: 14, color: '#1a1a1a', fontWeight: 600 }}>
                      {booking.startTime} – {booking.endTime}
                    </p>
                  </div>
                  <div>
                    <p style={{ margin: '0 0 2px', fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Demande envoyée
                    </p>
                    <p style={{ margin: 0, fontSize: 14, color: '#1a1a1a' }}>
                      {new Date(booking.createdAt).toLocaleDateString('fr-FR')}
                    </p>
                  </div>
                </div>

                {booking.message && (
                  <p
                    style={{
                      margin: '0 0 14px 0',
                      fontSize: 13,
                      color: '#475569',
                      background: '#fdf2f8',
                      padding: '10px 14px',
                      borderRadius: 8,
                      borderLeft: '3px solid #7c3aed',
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
                      color: '#065f46',
                      background: '#d1fae5',
                      padding: '10px 14px',
                      borderRadius: 8,
                      borderLeft: '3px solid #10b981',
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
                      background: isUrgent ? '#fff7ed' : '#dbeafe',
                      borderLeft: `3px solid ${isUrgent ? '#f97316' : '#3b82f6'}`,
                      fontSize: 13,
                      color: isUrgent ? '#c2410c' : '#1e40af',
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
                      background: '#f3f4f6',
                      borderLeft: '3px solid #9ca3af',
                      fontSize: 13,
                      color: '#4b5563',
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
                        background: '#fef3c7',
                        borderLeft: '3px solid #f59e0b',
                        fontSize: 13,
                        color: '#92400e',
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
                      background: '#d1fae5',
                      borderLeft: '3px solid #10b981',
                      fontSize: 13,
                      color: '#065f46',
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
                  <BookingInvoiceButton bookings={[booking]} />
                  {!venueDeleted && (
                    <button
                      onClick={() => navigate(`/venues/${booking.venue?._id}`)}
                      style={{
                        padding: '8px 18px',
                        background: '#fff',
                        color: '#64748b',
                        border: '1px solid #e2e8f0',
                        borderRadius: 8,
                        cursor: 'pointer',
                        fontSize: 13,
                        fontWeight: 600,
                      }}
                    >
                      Voir la salle
                    </button>
                  )}
                  {booking.status === 'ACCEPTED' && pt !== 'gratuit' && pt !== 'pourcentage_billetterie' && venuePricePerEvent > 0 && !past && !venueDeleted && !booking.bookingGroupId && (
                    <button
                      onClick={() => handlePay(booking._id)}
                      disabled={payingId === booking._id}
                      style={{
                        padding: '10px 22px',
                        background: isUrgent
                          ? 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)'
                          : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                        color: '#fff', border: 'none', borderRadius: 8,
                        cursor: payingId === booking._id ? 'not-allowed' : 'pointer',
                        fontSize: 14, fontWeight: 700,
                        opacity: payingId === booking._id ? 0.6 : 1,
                        boxShadow: isUrgent ? '0 4px 14px rgba(249,115,22,0.4)' : '0 4px 14px rgba(16,185,129,0.3)',
                      }}
                    >
                      {payingId === booking._id ? 'Redirection...' : `Payer ${displayAmount.toLocaleString('fr-FR')} €`}
                    </button>
                  )}
                  {booking.status === 'ACCEPTED' && pt === 'pourcentage_billetterie' && !past && (
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      padding: '8px 14px',
                      background: '#dbeafe',
                      border: '1px solid #93c5fd',
                      borderRadius: 8,
                      fontSize: 13,
                      color: '#1e40af',
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
                      background: '#d1fae5',
                      border: '1px solid #6ee7b7',
                      borderRadius: 8,
                      fontSize: 13,
                      color: '#065f46',
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
                        background: '#fff',
                        color: '#64748b',
                        border: '1px solid #e2e8f0',
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
                        background: '#fff',
                        color: '#ef4444',
                        border: '1px solid #fca5a5',
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
                        background: '#fff',
                        color: '#ef4444',
                        border: '1px solid #fca5a5',
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
                          background: '#fff',
                          color: page === 1 ? '#cbd5e1' : '#64748b',
                          border: '1px solid #e2e8f0',
                          borderRadius: 8,
                          cursor: page === 1 ? 'default' : 'pointer',
                          fontSize: 14,
                        }}
                      >
                        ← Précédent
                      </button>

                      <span style={{ color: '#64748b', fontSize: 13, padding: '0 8px' }}>
                        Page {page} / {totalPages}
                        <span style={{ color: '#94a3b8', marginLeft: 8 }}>({displayItems.length} résultats)</span>
                      </span>

                      <button
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        disabled={page === totalPages}
                        style={{
                          padding: '8px 16px',
                          background: '#fff',
                          color: page === totalPages ? '#cbd5e1' : '#64748b',
                          border: '1px solid #e2e8f0',
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
              </>
            </div>
        )}
      </div>
    </div>
  );
};

export default MyBookingsPage;
