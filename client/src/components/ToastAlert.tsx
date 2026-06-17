import React, { type CSSProperties } from 'react';

interface ToastAlertProps {
  id: string;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
  onDismiss: (id: string) => void;
  autoDismiss: boolean;
}

function ToastAlert({ id, message, type, onDismiss, autoDismiss }: ToastAlertProps) {
  const getTypeColors = () => {
    switch (type) {
      case 'success': return { bg: 'var(--ccc-success)', icon: '✓' };
      case 'error':   return { bg: 'var(--ccc-error)',   icon: '✕' };
      case 'warning': return { bg: 'var(--ccc-warning)', icon: '⚠' };
      case 'info':    return { bg: 'var(--ccc-info)',     icon: 'ℹ' };
      default:        return { bg: 'var(--ccc-text-muted)', icon: '•' };
    }
  };

  const colors = getTypeColors();

  const toastStyle: CSSProperties = {
    backgroundColor: 'var(--ccc-bg-elevated)',
    borderRadius: '8px',
    padding: '12px 16px',
    color: 'var(--ccc-text-primary)',
    boxShadow: '0 4px 24px rgba(15, 23, 42, 0.12)',
    border: '1px solid var(--ccc-border-subtle)',
    borderLeft: `4px solid ${colors.bg}`,
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    minWidth: '300px',
    maxWidth: '450px',
    animation: 'slideInRight 0.3s ease-out',
  };

  const iconStyle: CSSProperties = {
    width: '28px',
    height: '28px',
    borderRadius: '50%',
    backgroundColor: colors.bg,
    color: 'var(--ccc-text-on-accent)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '0.9em',
    fontWeight: 'bold',
    flexShrink: 0,
  };

  const messageStyle: CSSProperties = {
    flex: 1,
    fontSize: '0.9em',
    lineHeight: '1.4',
    color: 'var(--ccc-text-primary)',
  };

  const closeButtonStyle: CSSProperties = {
    background: 'none',
    border: 'none',
    color: 'var(--ccc-text-muted)',
    fontSize: '1.4em',
    cursor: 'pointer',
    padding: '4px',
    lineHeight: 1,
    transition: 'color 0.2s ease',
  };

  return (
    <div style={toastStyle}>
      <div style={iconStyle}>{colors.icon}</div>
      <div style={messageStyle}>{message}</div>
      <button
        style={closeButtonStyle}
        onClick={() => onDismiss(id)}
        onMouseEnter={(e) => e.currentTarget.style.color = 'var(--ccc-text-primary)'}
        onMouseLeave={(e) => e.currentTarget.style.color = 'var(--ccc-text-muted)'}
        title="Fermer"
      >
        ×
      </button>
    </div>
  );
}

export default ToastAlert;
