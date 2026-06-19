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
          border: page <= 1 ? '1px solid var(--ccc-border-subtle)' : '1px solid var(--ccc-border-medium)',
          background: page <= 1 ? 'var(--ccc-bg-inactive)' : 'var(--ccc-accent-soft)',
          color: page <= 1 ? 'var(--ccc-text-faint)' : 'var(--ccc-accent)',
          cursor: page <= 1 ? 'not-allowed' : 'pointer',
          fontWeight: 600,
          fontSize: 14,
          transition: 'background 0.2s',
        }}
      >
        ← Précédent
      </button>

      <span aria-live="polite" aria-atomic="true" style={{ color: 'var(--ccc-text-muted)', fontSize: 14 }}>
        Page {page} / {totalPages}
      </span>

      <button
        onClick={() => onChange(page + 1)}
        disabled={disabled || page >= totalPages}
        aria-label="Page suivante"
        style={{
          padding: '8px 16px',
          borderRadius: 8,
          border: page >= totalPages ? '1px solid var(--ccc-border-subtle)' : '1px solid var(--ccc-border-medium)',
          background: page >= totalPages ? 'var(--ccc-bg-inactive)' : 'var(--ccc-accent-soft)',
          color: page >= totalPages ? 'var(--ccc-text-faint)' : 'var(--ccc-accent)',
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
