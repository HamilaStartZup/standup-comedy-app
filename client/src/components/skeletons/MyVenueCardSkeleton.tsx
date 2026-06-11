import React from 'react';
import LoadingSkeleton from '../ui/LoadingSkeleton';

const MyVenueCardSkeleton: React.FC = () => {
  return (
    <div
      style={{
        background: 'var(--ccc-bg-elevated)',
        border: '1px solid var(--ccc-border-subtle)',
        boxShadow: '0 4px 24px rgba(15, 23, 42, 0.08)',
        borderRadius: 16,
        overflow: 'hidden',
      }}
    >
      {/* Image placeholder */}
      <LoadingSkeleton height={160} width="100%" />

      <div style={{ padding: '16px' }}>
        {/* Title */}
        <LoadingSkeleton height={20} width="50%" />
        {/* Stat line */}
        <LoadingSkeleton height={16} width="33%" />

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 8 }}>
          <LoadingSkeleton height={32} width="80px" />
          <LoadingSkeleton height={32} width="80px" />
        </div>
      </div>
    </div>
  );
};

export default MyVenueCardSkeleton;
