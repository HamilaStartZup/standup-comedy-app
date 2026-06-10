import React from 'react';

interface PaginationProps {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
  disabled?: boolean;
}

const Pagination: React.FC<PaginationProps> = ({ page, totalPages, onChange, disabled = false }) => {
  if (totalPages <= 1) return null;

  return (
    <nav aria-label="Pagination" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 24 }}>
      <button
        onClick={() => onChange(page - 1)}
        disabled={disabled || page <= 1}
        aria-label="Page précédente"
        style={{
          padding: '8px 16px',
          borderRadius: 8,
          border: page <= 1 ? '1px solid rgba(255,255,255,0.15)' : '1px solid rgba(255,255,255,0.2)',
          background: page <= 1 ? 'rgba(255,255,255,0.05)' : 'rgba(124, 58, 237,0.15)',
          color: page <= 1 ? 'rgba(255,255,255,0.5)' : '#7c3aed',
          cursor: page <= 1 ? 'not-allowed' : 'pointer',
          fontWeight: 600,
          fontSize: 14,
          transition: 'background 0.2s',
        }}
      >
        ← Précédent
      </button>

      <span aria-live="polite" aria-atomic="true" style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14 }}>
        Page {page} / {totalPages}
      </span>

      <button
        onClick={() => onChange(page + 1)}
        disabled={disabled || page >= totalPages}
        aria-label="Page suivante"
        style={{
          padding: '8px 16px',
          borderRadius: 8,
          border: page >= totalPages ? '1px solid rgba(255,255,255,0.15)' : '1px solid rgba(255,255,255,0.2)',
          background: page >= totalPages ? 'rgba(255,255,255,0.05)' : 'rgba(124, 58, 237,0.15)',
          color: page >= totalPages ? 'rgba(255,255,255,0.5)' : '#7c3aed',
          cursor: page >= totalPages ? 'not-allowed' : 'pointer',
          fontWeight: 600,
          fontSize: 14,
          transition: 'background 0.2s',
        }}
      >
        Suivant →
      </button>
    </nav>
  );
};

export default React.memo(Pagination);
