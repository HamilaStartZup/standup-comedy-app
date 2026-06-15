interface LoadingSpinnerProps {
  size?: number;
  message?: string;
}

const LoadingSpinner = ({ size = 48, message = 'Chargement...' }: LoadingSpinnerProps) => {
  return (
    <div role="status" aria-live="polite" style={{ textAlign: 'center', padding: 60 }}>
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @media (prefers-reduced-motion: reduce) {
          .ccc-spinner { animation-duration: 2.5s !important; }
        }
      `}</style>
      <div
        className="ccc-spinner"
        aria-hidden="true"
        style={{
          width: size,
          height: size,
          border: '4px solid rgba(124, 58, 237, 0.2)',
          borderTop: '4px solid #7c3aed',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
          margin: '0 auto 16px',
        }}
      />
      {message && <p style={{ color: 'var(--ccc-text-muted)', fontSize: 15 }}>{message}</p>}
    </div>
  );
};

export default LoadingSpinner;
