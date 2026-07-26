/**
 * Source unique des libellés/couleurs/emojis de statut de candidature.
 * Remplace les mappings divergents d'ApplicationsPage, ApplicationDetailsModal
 * et ComedianApplicationsModal (cf. BookingStatusBadge pour le style "tint doux").
 */
export type AppStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED' | 'WITHDRAWN' | 'CANCELLED_BY_PLATFORM';

interface StatusMeta {
  label: string;
  emoji: string;
  color: string;
  bg: string;
}

export const STATUS_META: Record<AppStatus, StatusMeta> = {
  PENDING: { label: 'En attente', emoji: '⏳', color: '#f59e0b', bg: 'rgba(245,158,11,0.15)' },
  ACCEPTED: { label: 'Acceptée', emoji: '✅', color: '#10b981', bg: 'rgba(16,185,129,0.15)' },
  REJECTED: { label: 'Refusée', emoji: '❌', color: '#ef4444', bg: 'rgba(239,68,68,0.15)' },
  EXPIRED: { label: 'Expirée', emoji: '⏰', color: '#6b7280', bg: 'rgba(107,114,128,0.15)' },
  WITHDRAWN: { label: 'Retirée', emoji: '↩', color: '#6b7280', bg: 'rgba(107,114,128,0.15)' },
  CANCELLED_BY_PLATFORM: { label: 'Annulée par la plateforme', emoji: '🚫', color: '#6b7280', bg: 'rgba(107,114,128,0.15)' },
};
