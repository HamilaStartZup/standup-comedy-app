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
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 24 }}>
      <button
        onClick={() => onChange(page - 1)}
        disabled={disabled || page <= 1}
        style={{
          padding: '8px 16px',
          borderRadius: 8,
          border: '1px solid rgba(255,255,255,0.2)',
          background: page <= 1 ? 'rgba(255,255,255,0.05)' : 'rgba(255,65,108,0.15)',
          color: page <= 1 ? 'rgba(255,255,255,0.3)' : '#ff416c',
          cursor: page <= 1 ? 'not-allowed' : 'pointer',
          fontWeight: 600,
          fontSize: 14,
          transition: 'background 0.2s',
        }}
      >
        ← Précédent
      </button>

      <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14 }}>
        Page {page} / {totalPages}
      </span>

      <button
        onClick={() => onChange(page + 1)}
        disabled={disabled || page >= totalPages}
        style={{
          padding: '8px 16px',
          borderRadius: 8,
          border: '1px solid rgba(255,255,255,0.2)',
          background: page >= totalPages ? 'rgba(255,255,255,0.05)' : 'rgba(255,65,108,0.15)',
          color: page >= totalPages ? 'rgba(255,255,255,0.3)' : '#ff416c',
          cursor: page >= totalPages ? 'not-allowed' : 'pointer',
          fontWeight: 600,
          fontSize: 14,
          transition: 'background 0.2s',
        }}
      >
        Suivant →
      </button>
    </div>
  );
};

export default React.memo(Pagination);