interface LoadingSkeletonProps {
  count?: number;
  height?: number;
  width?: string;
}

const LoadingSkeleton = ({ count = 1, height = 200, width = '100%' }: LoadingSkeletonProps) => {
  return (
    <>
      <style>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          .ccc-skeleton { animation: none !important; }
        }
      `}</style>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="ccc-skeleton"
          aria-hidden="true"
          style={{
            height,
            width,
            background: 'linear-gradient(90deg, rgba(15,23,42,0.06) 25%, rgba(15,23,42,0.12) 50%, rgba(15,23,42,0.06) 75%)',
            backgroundSize: '200% 100%',
            animation: 'shimmer 1.5s infinite',
            borderRadius: 12,
            marginBottom: 16,
          }}
        />
      ))}
    </>
  );
};

export default LoadingSkeleton;
