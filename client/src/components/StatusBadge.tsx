import { type CSSProperties } from 'react';
import { STATUS_META, type AppStatus } from '../utils/applicationStatus';

interface StatusBadgeProps {
  status: AppStatus;
  style?: CSSProperties;
}

const FALLBACK_META = { label: '', emoji: '❓', color: '#6b7280', bg: 'rgba(107,114,128,0.15)' };

function StatusBadge({ status, style }: StatusBadgeProps) {
  // Filet si l'API renvoie un statut hors énumération (legacy, casse différente) :
  // sans ça `meta.color` planterait. Le label retombe sur la valeur brute.
  const meta = STATUS_META[status] ?? { ...FALLBACK_META, label: status };
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '4px 12px',
        borderRadius: 20,
        fontSize: 12,
        fontWeight: 600,
        color: meta.color,
        backgroundColor: meta.bg,
        border: `1px solid ${meta.color}40`,
        letterSpacing: '0.02em',
        ...style,
      }}
    >
      {meta.emoji} {meta.label}
    </span>
  );
}

export default StatusBadge;
