import React, { type CSSProperties } from 'react';

interface CustomAlertProps {
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
  onClose: () => void;
}

function CustomAlert({ message, type, onClose }: CustomAlertProps) {
  const overlayStyle: CSSProperties = {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  };

  const getTypeColors = () => {
    switch (type) {
      case 'success':
        return { bg: '#10b981', border: '#059669', icon: '✓' };
      case 'error':
        return { bg: '#ef4444', border: '#dc2626', icon: '✕' };
      case 'warning':
        return { bg: '#f59e0b', border: '#d97706', icon: '⚠' };
      case 'info':
        return { bg: '#3b82f6', border: '#2563eb', icon: 'ℹ' };
      default:
        return { bg: '#6b7280', border: '#4b5563', icon: '•' };
    }
  };

  const colors = getTypeColors();

  const alertStyle: CSSProperties = {
    backgroundColor: 'var(--ccc-bg-elevated)',
    borderRadius: '12px',
    padding: '24px',
    maxWidth: '400px',
    width: '100%',
    margin: '0 16px',
    color: 'var(--ccc-text-primary)',
    boxShadow: '0 4px 24px rgba(15, 23, 42, 0.12)',
    border: `2px solid ${colors.border}`,
    animation: 'slideIn 0.3s ease-out',
  };

  const headerStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '16px',
  };

  const iconStyle: CSSProperties = {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    backgroundColor: colors.bg,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '1.5em',
    fontWeight: 'bold',
    flexShrink: 0,
  };

  const messageStyle: CSSProperties = {
    flex: 1,
    fontSize: '1em',
    lineHeight: '1.5',
    color: 'var(--ccc-text-secondary)',
  };

  const buttonStyle: CSSProperties = {
    marginTop: '16px',
    width: '100%',
    padding: '10px',
    backgroundColor: colors.bg,
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '0.95em',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'opacity 0.2s ease',
  };

  return (
    <>
      <style>{`
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateY(-20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
      <div style={overlayStyle} onClick={onClose}>
        <div style={alertStyle} onClick={(e) => e.stopPropagation()}>
          <div style={headerStyle}>
            <div style={iconStyle}>{colors.icon}</div>
            <div style={messageStyle}>{message}</div>
          </div>
          <button
            style={buttonStyle}
            onClick={onClose}
            onMouseEnter={(e) => e.currentTarget.style.opacity = '0.8'}
            onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
          >
            OK
          </button>
        </div>
      </div>
    </>
  );
}

export default CustomAlert;
