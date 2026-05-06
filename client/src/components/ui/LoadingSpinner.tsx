import React from 'react';

interface LoadingSpinnerProps {
  size?: number;
  message?: string;
}

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ size = 48, message = 'Chargement...' }) => {
  return (
    <div style={{ textAlign: 'center', padding: 60 }}>
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
      <div
        style={{
          width: size,
          height: size,
          border: '4px solid rgba(255,65,108,0.2)',
          borderTop: '4px solid #ff416c',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
          margin: '0 auto 16px',
        }}
      />
      {message && <p style={{ color: '#888', fontSize: 15 }}>{message}</p>}
    </div>
  );
};

export default LoadingSpinner;