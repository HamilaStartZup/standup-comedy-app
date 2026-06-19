import React from 'react';
import LoadingSkeleton from '../ui/LoadingSkeleton';

const BookingCardSkeleton: React.FC = () => {
  return (
    <div
      className="booking-card-layout"
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'stretch',
        background: 'var(--ccc-bg-elevated)',
        border: '1px solid rgba(0,0,0,0.08)',
        borderRadius: 20,
        overflow: 'hidden',
      }}
    >
      <div
        className="booking-card-image"
        style={{
          width: '25%',
          flexShrink: 0,
          minHeight: 200,
          background: 'rgba(0,0,0,0.04)',
        }}
      >
        <LoadingSkeleton height={200} width="100%" />
      </div>

      <div style={{ flex: 1, minWidth: 0, padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div style={{ flex: 1 }}>
            <LoadingSkeleton height={18} width="60%" />
            <LoadingSkeleton height={14} width="40%" />
          </div>
          <LoadingSkeleton height={24} width="80px" />
        </div>

        <div
          style={{
            padding: '14px 16px',
            background: 'rgba(0,0,0,0.03)',
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

        <div style={{ display: 'flex', gap: 12 }}>
          <LoadingSkeleton height={36} width="96px" />
          <LoadingSkeleton height={36} width="96px" />
        </div>
      </div>
    </div>
  );
};

export default BookingCardSkeleton;
