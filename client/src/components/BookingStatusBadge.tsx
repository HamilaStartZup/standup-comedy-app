import React, { useEffect, useState } from 'react';
import type { VenueBookingStatus } from '../types/venue';

interface BookingStatusBadgeProps {
  status: VenueBookingStatus;
  isPast?: boolean;
  paymentDeadlineAt?: string;
  perspective?: 'requester' | 'owner';
}

const STATUS_CONFIG: Record<VenueBookingStatus, { label: string; color: string; bg: string }> = {
  PENDING: { label: 'En attente', color: '#f59e0b', bg: 'rgba(245,158,11,0.15)' },
  ACCEPTED: { label: 'Acceptée — paiement requis', color: '#10b981', bg: 'rgba(16,185,129,0.15)' },
  REFUSED: { label: 'Refusée', color: '#ef4444', bg: 'rgba(239,68,68,0.15)' },
  CONFIRMED: { label: 'Confirmée', color: '#3b82f6', bg: 'rgba(59,130,246,0.15)' },
  CANCELLED_BY_OWNER: { label: 'Annulée par le propriétaire', color: '#6b7280', bg: 'rgba(107,114,128,0.15)' },
  CANCELLED_BY_REQUESTER: { label: 'Annulée par vous', color: '#6b7280', bg: 'rgba(107,114,128,0.15)' },
  EXPIRED: { label: 'Expirée — paiement non effectué', color: '#6b7280', bg: 'rgba(107,114,128,0.15)' },
};

const DATE_PAST_OVERRIDES: Partial<Record<VenueBookingStatus, { label: string; color: string; bg: string }>> = {
  CONFIRMED: { label: 'Passée', color: '#6b7280', bg: 'rgba(107,114,128,0.15)' },
  ACCEPTED: { label: 'Expirée — date passée', color: '#6b7280', bg: 'rgba(107,114,128,0.15)' },
  PENDING: { label: 'Expirée — date passée', color: '#6b7280', bg: 'rgba(107,114,128,0.15)' },
};

function getRemainingMs(deadline: string): number {
  return new Date(deadline).getTime() - Date.now();
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return 'Délai expiré';
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}h ${m.toString().padStart(2, '0')}min`;
  if (m > 0) return `${m}min ${s.toString().padStart(2, '0')}s`;
  return `${s}s`;
}

function getUrgencyColor(ms: number): { color: string; bg: string } {
  if (ms <= 0) return { color: '#6b7280', bg: 'rgba(107,114,128,0.15)' };
  if (ms < 6 * 3600 * 1000) return { color: '#ef4444', bg: 'rgba(239,68,68,0.15)' };   // < 6h → rouge
  if (ms < 24 * 3600 * 1000) return { color: '#f97316', bg: 'rgba(249,115,22,0.15)' };  // < 24h → orange
  return { color: '#10b981', bg: 'rgba(16,185,129,0.15)' };                              // > 24h → vert
}

const OWNER_LABEL_OVERRIDES: Partial<Record<VenueBookingStatus, string>> = {
  CANCELLED_BY_REQUESTER: 'Annulée par le demandeur',
  CANCELLED_BY_OWNER: 'Annulée par vous',
};

const BookingStatusBadge: React.FC<BookingStatusBadgeProps> = ({ status, isPast, paymentDeadlineAt, perspective = 'requester' }) => {
  const [remainingMs, setRemainingMs] = useState<number | null>(
    paymentDeadlineAt && status === 'ACCEPTED' ? getRemainingMs(paymentDeadlineAt) : null
  );

  useEffect(() => {
    if (!paymentDeadlineAt || status !== 'ACCEPTED') return;

    setRemainingMs(getRemainingMs(paymentDeadlineAt));
    const interval = setInterval(() => {
      const ms = getRemainingMs(paymentDeadlineAt);
      setRemainingMs(ms);
      if (ms <= 0) clearInterval(interval);
    }, 1000);

    return () => clearInterval(interval);
  }, [paymentDeadlineAt, status]);

  const ownerLabel = perspective === 'owner' ? OWNER_LABEL_OVERRIDES[status] : undefined;
  const baseConfig = (isPast && DATE_PAST_OVERRIDES[status]) || {
    ...STATUS_CONFIG[status],
    ...(ownerLabel ? { label: ownerLabel } : {}),
  };

  // Countdown actif uniquement pour ACCEPTED avec deadline future
  const showCountdown = status === 'ACCEPTED' && !isPast && remainingMs !== null && remainingMs > 0;
  const urgency = showCountdown ? getUrgencyColor(remainingMs!) : null;
  const config = urgency ? { ...baseConfig, ...urgency } : baseConfig;

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
      <span
        style={{
          display: 'inline-block',
          padding: '4px 12px',
          borderRadius: 20,
          fontSize: 12,
          fontWeight: 600,
          color: config.color,
          backgroundColor: config.bg,
          border: `1px solid ${config.color}40`,
          letterSpacing: '0.02em',
        }}
      >
        {config.label}
      </span>

      {showCountdown && (
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: urgency!.color,
            letterSpacing: '0.03em',
          }}
        >
          ⏱ {formatCountdown(remainingMs!)} restant{remainingMs! < 3600 * 1000 ? '' : 's'}
        </span>
      )}

      {status === 'ACCEPTED' && !isPast && remainingMs !== null && remainingMs <= 0 && (
        <span style={{ fontSize: 11, fontWeight: 700, color: '#6b7280' }}>
          Délai dépassé
        </span>
      )}
    </div>
  );
};

export default BookingStatusBadge;
