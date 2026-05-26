import React from 'react';
import LoadingSkeleton from '../ui/LoadingSkeleton';

const MyVenueCardSkeleton: React.FC = () => {
  return (
    <div
      style={{
        background: '#1a1a2e',
        border: '1px solid rgba(255,255,255,0.1)',
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
