import React from 'react';
import LoadingSkeleton from '../ui/LoadingSkeleton';

const VenueDetailSkeleton: React.FC = () => {
  return (
    <div>
      {/* Large image area */}
      <LoadingSkeleton height={256} width="100%" />

      {/* Title */}
      <LoadingSkeleton height={32} width="50%" />

      {/* Subtitle */}
      <LoadingSkeleton height={16} width="33%" />

      {/* Tab placeholders */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <LoadingSkeleton height={40} width="96px" />
        <LoadingSkeleton height={40} width="96px" />
        <LoadingSkeleton height={40} width="96px" />
      </div>

      {/* Content lines */}
      <LoadingSkeleton height={16} width="100%" />
      <LoadingSkeleton height={16} width="90%" />
      <LoadingSkeleton height={16} width="80%" />
      <LoadingSkeleton height={16} width="70%" />
    </div>
  );
};

export default VenueDetailSkeleton;
