import React from 'react';
import LoadingSkeleton from '../ui/LoadingSkeleton';

const VenueCardSkeleton: React.FC = () => {
  return (
    <div
      style={{
        background: '#1a1a2e',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 16,
        overflow: 'hidden',
      }}
    >
      {/* Image placeholder — 56.25% aspect ratio matches VenueCard */}
      <div style={{ position: 'relative', width: '100%', paddingTop: '56.25%' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}>
          <LoadingSkeleton height={200} width="100%" />
        </div>
      </div>

      {/* Text lines */}
      <div style={{ padding: '16px' }}>
        {/* Title — wide */}
        <LoadingSkeleton height={18} width="75%" />
        {/* Subtitle — medium */}
        <LoadingSkeleton height={14} width="50%" />
        {/* Info row — medium */}
        <LoadingSkeleton height={14} width="66%" />
      </div>
    </div>
  );
};

export default VenueCardSkeleton;
