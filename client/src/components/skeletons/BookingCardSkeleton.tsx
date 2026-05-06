import React from 'react';
import LoadingSkeleton from '../ui/LoadingSkeleton';

const BookingCardSkeleton: React.FC = () => {
  return (
    <div
      style={{
        background: '#1a1a2e',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 16,
        padding: 24,
      }}
    >
      {/* Header row: venue name + status badge */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div style={{ flex: 1 }}>
          {/* Venue name */}
          <LoadingSkeleton height={18} width="60%" />
          {/* Address line */}
          <LoadingSkeleton height={14} width="40%" />
        </div>
        {/* Status badge */}
        <LoadingSkeleton height={24} width="80px" />
      </div>

      {/* Info grid: date/time/created */}
      <div
        style={{
          padding: '14px 16px',
          background: 'rgba(255,255,255,0.03)',
          borderRadius: 10,
          marginBottom: 16,
          display: 'flex',
          gap: 24,
          flexWrap: 'wrap',
        }}
      >
        <LoadingSkeleton height={16} width="160px" />
        <LoadingSkeleton height={16} width="160px" />
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 12 }}>
        <LoadingSkeleton height={36} width="96px" />
        <LoadingSkeleton height={36} width="96px" />
      </div>
    </div>
  );
};

export default BookingCardSkeleton;
