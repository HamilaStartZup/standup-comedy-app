import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { listVenueBookings, updateBookingStatus, updateBookingGroupStatus, cancelBookingByOwner } from '../services/api';
import { SuccessMessages, ErrorMessages, getErrorMessage } from '../services/systemMessages';
import { useAlert } from '../hooks/useAlert';
import BookingStatusBadge from './BookingStatusBadge';
import ConfirmDialog from './ConfirmDialog';
import type { IVenueBooking } from '../types/venue';
import type { IUserData } from '../types/user';

const ROLE_STYLES: Record<string, { bg: string; fg: string; label: string }> = {
  ORGANIZER: { bg: 'rgba(255,140,0,0.15)', fg: '#ff8c00', label: 'Organisateur' },
  COMEDIAN: { bg: 'rgba(168,85,247,0.15)', fg: '#a855f7', label: 'Humoriste' },
  LIEU: { bg: 'rgba(59,130,246,0.15)', fg: 'var(--ccc-info)', label: 'Lieu' },
  SPECTATOR: { bg: 'rgba(34,197,94,0.15)', fg: '#22c55e', label: 'Spectateur' },
  SUPER_ADMIN: { bg: 'rgba(239,68,68,0.15)', fg: 'var(--ccc-error)', label: 'Admin' },
};

const RequesterInfoBlock: React.FC<{ requester: IUserData }> = ({ requester }) => {
  const phone = requester.phone ?? requester.organizerProfile?.phone;
  const company = requester.organizerProfile?.companyName ?? requester.companyName;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: '#bbb' }}>
      <div>
        <span style={{ color: 'rgba(255,255,255,0.53)' }}>✉ </span>
        <a href={`mailto:${requester.email}`} style={{ color: 'var(--ccc-accent)', textDecoration: 'none' }}>
          {requester.email}
        </a>
      </div>
      {phone && (
        <div>
          <span style={{ color: 'rgba(255,255,255,0.53)' }}>☎ </span>
          <a href={`tel:${phone}`} style={{ color: 'var(--ccc-accent)', textDecoration: 'none' }}>
            {phone}
          </a>
        </div>
      )}
      {company && (
        <div style={{ fontStyle: 'italic', color: 'rgba(255,255,255,0.53)' }}>🏢 {company}</div>
      )}
    </div>
  );
};

const RequesterAvatar: React.FC<{ requester: IUserData; size?: number }> = ({ requester, size = 32 }) => {
  const initials = `${requester.firstName?.[0] ?? ''}${requester.lastName?.[0] ?? ''}`.toUpperCase();
  if (requester.avatarUrl) {
    return (
      <img
        src={requester.avatarUrl}
        alt=""
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
      />
    );
  }
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: 'rgba(124, 58, 237,0.2)',
        color: 'var(--ccc-accent)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 700,
        fontSize: size * 0.4,
        flexShrink: 0,
      }}
    >
      {initials || '?'}
    </div>
  );
};

const RoleBadge: React.FC<{ role?: string }> = ({ role }) => {
  if (!role) return null;
  const s = ROLE_STYLES[role] ?? { bg: 'rgba(255,255,255,0.1)', fg: 'rgba(255,255,255,0.8)', label: role };
  return (
    <span
      style={{
        padding: '2px 8px',
        borderRadius: 999,
        background: s.bg,
        color: s.fg,
        fontSize: 11,
        fontWeight: 600,
      }}
    >
      {s.label}
    </span>
  );
};

interface VenueBookingsManagementProps {
  venueId: string;
  initialStatus?: string;
}

const STATUS_FILTERS = [
  { key: 'ALL', label: 'Tous' },
  { key: 'PENDING', label: 'En attente' },
  { key: 'ACCEPTED', label: 'Acceptées' },
  { key: 'CONFIRMED', label: 'Confirmées' },
  { key: 'REFUSED', label: 'Refusées' },
  { key: 'EXPIRED', label: 'Expirées' },
] as const;

const VenueBookingsManagement: React.FC<VenueBookingsManagementProps> = ({ venueId, initialStatus }) => {
  const { showSuccess, showError } = useAlert();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>(initialStatus ?? 'PENDING');
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [ownerResponse, setOwnerResponse] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  // Réservation dont l'annulation par le lieu attend confirmation
  const [cancelConfirmId, setCancelConfirmId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // État pour la gestion de lots
  const [respondingGroupId, setRespondingGroupId] = useState<string | null>(null);
  const [groupOwnerResponse, setGroupOwnerResponse] = useState('');
  const [groupExcluded, setGroupExcluded] = useState<Set<string>>(new Set());
  const [groupActionLoading, setGroupActionLoading] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery<IVenueBooking[]>({
    queryKey: ['venue-bookings', venueId],
    queryFn: () => listVenueBookings(venueId),
  });

  const handleAccept = async (bookingId: string) => {
    setActionLoading(bookingId);
    try {
      await updateBookingStatus(bookingId, 'ACCEPTED', ownerResponse || undefined);
      showSuccess(SuccessMessages.BOOKING_ACCEPTED);
      queryClient.invalidateQueries({ queryKey: ['venue-bookings', venueId] });
      setRespondingId(null);
      setOwnerResponse('');
    } catch (err) {
      showError(getErrorMessage(err, ErrorMessages.BOOKING_UPDATE_FAILED));
    } finally {
      setActionLoading(null);
    }
  };

  const handleRefuse = async (bookingId: string) => {
    setActionLoading(bookingId);
    try {
      await updateBookingStatus(bookingId, 'REFUSED', ownerResponse || undefined);
      showSuccess(SuccessMessages.BOOKING_REFUSED);
      queryClient.invalidateQueries({ queryKey: ['venue-bookings', venueId] });
      setRespondingId(null);
      setOwnerResponse('');
    } catch (err) {
      showError(getErrorMessage(err, ErrorMessages.BOOKING_UPDATE_FAILED));
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancelByOwner = async (bookingId: string) => {
    setActionLoading(bookingId);
    try {
      await cancelBookingByOwner(bookingId);
      showSuccess(SuccessMessages.BOOKING_CANCELLED);
      queryClient.invalidateQueries({ queryKey: ['venue-bookings', venueId] });
    } catch (err) {
      showError(getErrorMessage(err, ErrorMessages.BOOKING_CANCEL_FAILED));
    } finally {
      setActionLoading(null);
    }
  };

  const handleGroupAction = async (bookingGroupId: string, status: 'ACCEPTED' | 'REFUSED') => {
    setGroupActionLoading(bookingGroupId);
    try {
      await updateBookingGroupStatus(bookingGroupId, {
        status,
        excludedBookingIds: status === 'ACCEPTED' ? [...groupExcluded] : undefined,
        ownerResponse: groupOwnerResponse || undefined,
      });
      showSuccess(status === 'ACCEPTED' ? SuccessMessages.BOOKING_ACCEPTED : SuccessMessages.BOOKING_REFUSED);
      queryClient.invalidateQueries({ queryKey: ['venue-bookings', venueId] });
      setRespondingGroupId(null);
      setGroupOwnerResponse('');
      setGroupExcluded(new Set());
    } catch (err) {
      showError(getErrorMessage(err, ErrorMessages.BOOKING_UPDATE_FAILED));
    } finally {
      setGroupActionLoading(null);
    }
  };

  const bookings = data || [];

  // Séparer les réservations par lot des réservations unitaires
  const { bookingsByGroup, standaloneBookings } = useMemo(() => {
    const groups = new Map<string, IVenueBooking[]>();
    const standalone: IVenueBooking[] = [];
    for (const b of bookings) {
      if (b.bookingGroupId) {
        const list = groups.get(b.bookingGroupId) ?? [];
        list.push(b);
        groups.set(b.bookingGroupId, list);
      } else {
        standalone.push(b);
      }
    }
    return { bookingsByGroup: groups, standaloneBookings: standalone };
  }, [bookings]);

  const filteredStandalones = statusFilter === 'ALL'
    ? standaloneBookings
    : standaloneBookings.filter((b) => b.status === statusFilter);

  const filteredGroups = useMemo(() => {
    const result: [string, IVenueBooking[]][] = [];
    for (const [groupId, groupBookings] of bookingsByGroup.entries()) {
      const filtered = statusFilter === 'ALL'
        ? groupBookings
        : groupBookings.filter((b) => b.status === statusFilter);
      if (filtered.length > 0) result.push([groupId, filtered]);
    }
    return result;
  }, [bookingsByGroup, statusFilter]);


  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { ALL: bookings.length };
    for (const b of bookings) {
      counts[b.status] = (counts[b.status] ?? 0) + 1;
    }
    return counts;
  }, [bookings]);

  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 40, color: 'rgba(255,255,255,0.53)' }}>
        Chargement des réservations...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ textAlign: 'center', padding: 40, color: 'var(--ccc-error)' }}>
        Impossible de charger les réservations.
      </div>
    );
  }

  if (bookings.length === 0) {
    return (
      <div
        style={{
          textAlign: 'center',
          padding: '48px 24px',
          color: 'rgba(255,255,255,0.53)',
          border: '1px dashed rgba(255,255,255,0.1)',
          borderRadius: 16,
        }}
      >
        <div style={{ fontSize: 40, marginBottom: 12 }}>📅</div>
        <p style={{ margin: 0, fontSize: 15 }}>Aucune demande de réservation pour le moment.</p>
      </div>
    );
  }

  return (
    <div>
      <style>{`
        @media (max-width: 480px) {
          .booking-mgmt-header { flex-direction: column; align-items: flex-start !important; }
          .booking-respond-actions { flex-direction: column; }
          .booking-respond-actions button { width: 100%; }
        }
      `}</style>
      {/* Filtre par statut */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
        {STATUS_FILTERS.map(({ key, label }) => {
          const count = statusCounts[key] ?? 0;
          const isActive = statusFilter === key;
          return (
            <button
              key={key}
              onClick={() => setStatusFilter(key)}
              style={{
                padding: '6px 14px',
                borderRadius: 20,
                border: 'none',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                background: isActive
                  ? 'var(--ccc-accent-gradient)'
                  : 'rgba(255,255,255,0.07)',
                color: isActive ? 'var(--ccc-text-on-accent)' : 'rgba(255,255,255,0.53)',
                outline: isActive ? 'none' : '1px solid rgba(255,255,255,0.1)',
                transition: 'all 0.15s',
              }}
            >
              {label} ({count})
            </button>
          );
        })}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* ── Lots groupés ── */}
      {filteredGroups.map(([groupId, groupBookings]) => {
        const hasPending = groupBookings.some((b) => b.status === 'PENDING');
        const firstBooking = groupBookings[0];
        const isRespondingThisGroup = respondingGroupId === groupId;
        return (
          <div
            key={groupId}
            style={{
              background: 'rgba(0,0,0,0.35)',
              border: '1px solid rgba(255,165,0,0.25)',
              borderRadius: 14,
              padding: 20,
            }}
          >
            <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 700, background: 'rgba(255,165,0,0.15)', color: '#fbbf24', borderRadius: 6, padding: '3px 10px' }}>
                Série · {groupBookings.length} réservation(s)
              </span>
              {firstBooking.requester && (
                <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.67)' }}>
                  {firstBooking.requester.firstName} {firstBooking.requester.lastName}
                </span>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
              {groupBookings.map((b) => (
                <div
                  key={b._id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '6px 10px',
                    background: 'rgba(255,255,255,0.03)',
                    borderRadius: 8,
                    fontSize: 13,
                  }}
                >
                  {hasPending && b.status === 'PENDING' && isRespondingThisGroup && (
                    <input
                      type="checkbox"
                      checked={!groupExcluded.has(b._id)}
                      onChange={() => {
                        const next = new Set(groupExcluded);
                        if (next.has(b._id)) next.delete(b._id);
                        else next.add(b._id);
                        setGroupExcluded(next);
                      }}
                      title="Inclure dans l'acceptation"
                    />
                  )}
                  <span style={{ color: '#ddd', flex: 1 }}>
                    {new Date(b.requestedDate).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                    {' · '}{b.startTime} – {b.endTime}
                  </span>
                  <BookingStatusBadge status={b.status} perspective="owner" />
                </div>
              ))}
            </div>

            {firstBooking.message && (
              <p style={{ margin: '0 0 12px 0', fontSize: 13, color: 'rgba(255,255,255,0.8)', background: 'rgba(255,255,255,0.04)', padding: '8px 12px', borderRadius: 8, borderLeft: '3px solid rgba(255,165,0,0.4)' }}>
                "{firstBooking.message}"
              </p>
            )}

            {hasPending && (
              isRespondingThisGroup ? (
                <div>
                  <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.67)', margin: '0 0 6px 0' }}>Cochez les dates à inclure dans l'acceptation (décocher = refuser).</p>
                  <textarea
                    value={groupOwnerResponse}
                    onChange={(e) => setGroupOwnerResponse(e.target.value)}
                    placeholder="Message optionnel..."
                    rows={2}
                    style={{ width: '100%', background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '8px 12px', color: 'var(--ccc-text-on-accent)', fontSize: 13, marginBottom: 10, boxSizing: 'border-box', resize: 'vertical' }}
                  />
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <button
                      onClick={() => handleGroupAction(groupId, 'ACCEPTED')}
                      disabled={groupActionLoading === groupId}
                      style={{ padding: '8px 18px', background: 'rgba(16,185,129,0.2)', color: 'var(--ccc-success)', border: '1px solid rgba(16,185,129,0.4)', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}
                    >
                      ✓ Accepter le lot
                    </button>
                    <button
                      onClick={() => handleGroupAction(groupId, 'REFUSED')}
                      disabled={groupActionLoading === groupId}
                      style={{ padding: '8px 18px', background: 'rgba(239,68,68,0.2)', color: 'var(--ccc-error)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}
                    >
                      ✕ Refuser tout
                    </button>
                    <button
                      onClick={() => { setRespondingGroupId(null); setGroupOwnerResponse(''); setGroupExcluded(new Set()); }}
                      style={{ padding: '8px 18px', background: 'transparent', color: 'rgba(255,255,255,0.53)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}
                    >
                      Annuler
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => { setRespondingGroupId(groupId); setGroupOwnerResponse(''); setGroupExcluded(new Set()); }}
                  style={{ padding: '8px 18px', background: 'var(--ccc-accent-gradient)', color: 'var(--ccc-text-on-accent)', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}
                >
                  Répondre au lot
                </button>
              )
            )}
          </div>
        );
      })}

      {/* ── Réservations unitaires ── */}
      {filteredStandalones.map((booking) => (
        <div
          key={booking._id}
          style={{
            background: 'rgba(0,0,0,0.3)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 14,
            padding: 20,
          }}
        >
          <div
            className="booking-mgmt-header"
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              flexWrap: 'wrap',
              gap: 12,
              marginBottom: 12,
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                {booking.requester && <RequesterAvatar requester={booking.requester} size={32} />}
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <p style={{ margin: 0, fontWeight: 700, color: 'var(--ccc-text-on-accent)', fontSize: 15 }}>
                      {booking.requester?.firstName} {booking.requester?.lastName}
                    </p>
                    <RoleBadge role={booking.requester?.role} />
                  </div>
                  <p style={{ margin: '2px 0 0 0', fontSize: 13, color: 'rgba(255,255,255,0.53)' }}>
                    {new Date(booking.requestedDate).toLocaleDateString('fr-FR', {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}{' '}
                    · {booking.startTime} – {booking.endTime}
                  </p>
                </div>
              </div>

              {booking.requester && (
                <div style={{ marginTop: 6, marginLeft: 42 }}>
                  <button
                    onClick={() =>
                      setExpandedId(expandedId === booking._id ? null : booking._id)
                    }
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--ccc-accent)',
                      fontSize: 12,
                      cursor: 'pointer',
                      padding: 0,
                      fontWeight: 600,
                    }}
                  >
                    {expandedId === booking._id ? 'Masquer le profil ▴' : 'Voir le profil ▾'}
                  </button>
                  {expandedId === booking._id && (
                    <div
                      style={{
                        marginTop: 10,
                        padding: 12,
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: 8,
                      }}
                    >
                      <RequesterInfoBlock requester={booking.requester} />
                    </div>
                  )}
                </div>
              )}
            </div>
            <BookingStatusBadge status={booking.status} perspective="owner" />
          </div>

          {booking.message && (
            <p
              style={{
                margin: '0 0 12px 0',
                fontSize: 13,
                color: 'rgba(255,255,255,0.8)',
                background: 'rgba(255,255,255,0.04)',
                padding: '10px 14px',
                borderRadius: 8,
                borderLeft: '3px solid rgba(124, 58, 237,0.5)',
              }}
            >
              "{booking.message}"
            </p>
          )}

          {booking.ownerResponse && (
            <p style={{ margin: '0 0 12px 0', fontSize: 13, color: 'var(--ccc-success)' }}>
              Votre réponse : {booking.ownerResponse}
            </p>
          )}

          {/* Actions pour PENDING */}
          {booking.status === 'PENDING' && (
            <div>
              {respondingId === booking._id ? (
                <div>
                  <textarea
                    value={ownerResponse}
                    onChange={(e) => setOwnerResponse(e.target.value)}
                    placeholder="Message optionnel pour le demandeur..."
                    rows={2}
                    style={{
                      width: '100%',
                      background: 'rgba(0,0,0,0.4)',
                      border: '1px solid rgba(255,255,255,0.12)',
                      borderRadius: 8,
                      padding: '8px 12px',
                      color: 'var(--ccc-text-on-accent)',
                      fontSize: 13,
                      marginBottom: 10,
                      boxSizing: 'border-box',
                      resize: 'vertical',
                    }}
                  />
                  <div className="booking-respond-actions" style={{ display: 'flex', gap: 10 }}>
                    <button
                      onClick={() => handleAccept(booking._id)}
                      disabled={actionLoading === booking._id}
                      style={{
                        padding: '8px 18px',
                        background: 'rgba(16,185,129,0.2)',
                        color: 'var(--ccc-success)',
                        border: '1px solid rgba(16,185,129,0.4)',
                        borderRadius: 8,
                        cursor: 'pointer',
                        fontWeight: 600,
                        fontSize: 13,
                      }}
                    >
                      ✓ Accepter
                    </button>
                    <button
                      onClick={() => handleRefuse(booking._id)}
                      disabled={actionLoading === booking._id}
                      style={{
                        padding: '8px 18px',
                        background: 'rgba(239,68,68,0.2)',
                        color: 'var(--ccc-error)',
                        border: '1px solid rgba(239,68,68,0.4)',
                        borderRadius: 8,
                        cursor: 'pointer',
                        fontWeight: 600,
                        fontSize: 13,
                      }}
                    >
                      ✕ Refuser
                    </button>
                    <button
                      onClick={() => { setRespondingId(null); setOwnerResponse(''); }}
                      style={{
                        padding: '8px 18px',
                        background: 'transparent',
                        color: 'rgba(255,255,255,0.53)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: 8,
                        cursor: 'pointer',
                        fontSize: 13,
                      }}
                    >
                      Annuler
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => { setRespondingId(booking._id); setOwnerResponse(''); }}
                  style={{
                    padding: '8px 18px',
                    background: 'var(--ccc-accent-gradient)',
                    color: 'var(--ccc-text-on-accent)',
                    border: 'none',
                    borderRadius: 8,
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: 13,
                  }}
                >
                  Répondre
                </button>
              )}
            </div>
          )}

          {/* Info paiement pour ACCEPTED */}
          {booking.status === 'ACCEPTED' && (
            <p style={{ margin: '0 0 12px 0', fontSize: 13, color: 'var(--ccc-warning)', fontStyle: 'italic' }}>
              En attente de paiement par le demandeur
            </p>
          )}

          {/* Info paiement pour CONFIRMED */}
          {booking.status === 'CONFIRMED' && booking.paidAt && (
            <p style={{ margin: '0 0 12px 0', fontSize: 13, color: 'var(--ccc-info)' }}>
              Payé le {new Date(booking.paidAt).toLocaleDateString('fr-FR')}
              {booking.paidAmount != null && ` — ${booking.paidAmount.toLocaleString('fr-FR')} €`}
            </p>
          )}

          {/* Annuler si ACCEPTED ou CONFIRMED */}
          {(booking.status === 'ACCEPTED' || booking.status === 'CONFIRMED') && (
            <button
              onClick={() => setCancelConfirmId(booking._id)}
              disabled={actionLoading === booking._id}
              style={{
                padding: '8px 18px',
                background: 'rgba(239,68,68,0.15)',
                color: 'var(--ccc-error)',
                border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: 8,
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: 13,
              }}
            >
              {booking.status === 'CONFIRMED' && booking.paymentStatus === 'paid'
                ? 'Annuler (remboursement nécessaire)'
                : 'Annuler cette réservation'}
            </button>
          )}
        </div>
      ))}
      </div>

      <ConfirmDialog
        isOpen={cancelConfirmId !== null}
        title="Annuler la réservation"
        message="Annuler cette réservation acceptée ? Le demandeur en sera notifié."
        confirmText="Annuler la réservation"
        cancelText="Retour"
        isDangerous
        onConfirm={async () => {
          if (!cancelConfirmId) return;
          await handleCancelByOwner(cancelConfirmId);
          setCancelConfirmId(null);
        }}
        onCancel={() => setCancelConfirmId(null)}
      />
    </div>
  );
};

export default VenueBookingsManagement;
