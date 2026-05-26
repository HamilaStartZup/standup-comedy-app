import React from 'react';

interface LoadingSkeletonProps {
  count?: number;
  height?: number;
  width?: string;
}

const LoadingSkeleton: React.FC<LoadingSkeletonProps> = ({ count = 1, height = 200, width = '100%' }) => {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          style={{
            height,
            width,
            background: 'linear-gradient(90deg, rgba(255,255,255,0.03) 25%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.03) 75%)',
            backgroundSize: '200% 100%',
            animation: 'shimmer 1.5s infinite',
            borderRadius: 12,
            marginBottom: 16,
          }}
        >
          <style>{`
            @keyframes shimmer {
              0% { background-position: 200% 0; }
              100% { background-position: -200% 0; }
            }
          `}</style>
        </div>
      ))}
    </>
  );
};

export default LoadingSkeleton;