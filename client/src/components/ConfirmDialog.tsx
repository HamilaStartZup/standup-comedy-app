import React, { type CSSProperties } from 'react';
import { X } from 'lucide-react';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmText?: string;
  cancelText?: string;
  isDangerous?: boolean;
  isLoading?: boolean;
}

const ConfirmDialog = ({
  isOpen,
  title,
  message,
  onConfirm,
  onCancel,
  confirmText = 'Confirmer',
  cancelText = 'Annuler',
  isDangerous = false,
  isLoading = false,
}: ConfirmDialogProps) => {
  if (!isOpen) return null;

  const containerStyle: CSSProperties = {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  };

  const dialogStyle: CSSProperties = {
    backgroundColor: 'var(--ccc-bg-elevated)',
    borderRadius: '12px',
    padding: '24px',
    maxWidth: '400px',
    width: '90%',
    boxShadow: '0 4px 24px rgba(15, 23, 42, 0.12)',
    border: '1px solid var(--ccc-border-subtle)',
  };

  const headerStyle: CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
  };

  const titleStyle: CSSProperties = {
    fontSize: '18px',
    fontWeight: '600',
    color: 'var(--ccc-text-primary)',
    margin: 0,
  };

  const closeButtonStyle: CSSProperties = {
    background: 'none',
    border: 'none',
    color: '#999',
    cursor: 'pointer',
    fontSize: '24px',
    padding: '0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  const messageStyle: CSSProperties = {
    color: 'var(--ccc-text-secondary)',
    fontSize: '14px',
    lineHeight: '1.6',
    marginBottom: '24px',
    whiteSpace: 'pre-wrap',
  };

  const buttonsStyle: CSSProperties = {
    display: 'flex',
    gap: '12px',
    justifyContent: 'flex-end',
  };

  const baseButtonStyle: CSSProperties = {
    padding: '10px 20px',
    borderRadius: '8px',
    border: 'none',
    fontWeight: '600',
    cursor: isLoading ? 'not-allowed' : 'pointer',
    transition: 'all 0.2s ease',
    opacity: isLoading ? 0.7 : 1,
  };

  const cancelButtonStyle: CSSProperties = {
    ...baseButtonStyle,
    backgroundColor: 'var(--ccc-bg-surface)',
    color: 'var(--ccc-text-primary)',
    border: '1px solid var(--ccc-border-medium)',
  };

  const confirmButtonStyle: CSSProperties = {
    ...baseButtonStyle,
    backgroundColor: isDangerous ? '#dc3545' : '#7c3aed',
    color: '#fff',
  };

  return (
    <div style={containerStyle} onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div style={dialogStyle}>
        <div style={headerStyle}>
          <h2 style={titleStyle}>{title}</h2>
          <button
            onClick={onCancel}
            disabled={isLoading}
            style={closeButtonStyle}
            aria-label="Close dialog"
          >
            <X size={20} />
          </button>
        </div>

        <p style={messageStyle}>{message}</p>

        <div style={buttonsStyle}>
          <button
            onClick={onCancel}
            disabled={isLoading}
            style={cancelButtonStyle}
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            style={confirmButtonStyle}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
