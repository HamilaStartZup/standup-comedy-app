import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { X } from 'lucide-react';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  /** Si la callback retourne une Promise, les boutons sont désactivés jusqu'à sa résolution (anti double-submit). */
  onConfirm: () => void | Promise<void>;
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
  const [pending, setPending] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const busy = isLoading || pending;

  // Réinitialise l'état pending et place le focus dans la modale à l'ouverture
  useEffect(() => {
    if (!isOpen) {
      setPending(false);
      return;
    }
    confirmRef.current?.focus();
  }, [isOpen]);

  // Escape pour annuler + focus trap (Tab cyclique dans la modale)
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) {
        e.stopPropagation();
        onCancel();
        return;
      }
      if (e.key === 'Tab') {
        const focusables = dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled])');
        if (!focusables || focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, busy, onCancel]);

  if (!isOpen) return null;

  const handleConfirm = () => {
    if (busy) return;
    const result = onConfirm();
    if (result instanceof Promise) {
      setPending(true);
      result.finally(() => setPending(false));
    }
  };

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
    color: 'var(--ccc-text-muted)',
    cursor: busy ? 'not-allowed' : 'pointer',
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
    cursor: busy ? 'not-allowed' : 'pointer',
    transition: 'all 0.2s ease',
    opacity: busy ? 0.7 : 1,
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
    <div style={containerStyle} onClick={(e) => e.target === e.currentTarget && !busy && onCancel()}>
      <div ref={dialogRef} style={dialogStyle} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div style={headerStyle}>
          <h2 id={titleId} style={titleStyle}>{title}</h2>
          <button
            onClick={onCancel}
            disabled={busy}
            style={closeButtonStyle}
            aria-label="Fermer la fenêtre"
          >
            <X size={20} />
          </button>
        </div>

        <p style={messageStyle}>{message}</p>

        <div style={buttonsStyle}>
          <button
            onClick={onCancel}
            disabled={busy}
            style={cancelButtonStyle}
          >
            {cancelText}
          </button>
          <button
            ref={confirmRef}
            onClick={handleConfirm}
            disabled={busy}
            style={confirmButtonStyle}
            aria-busy={busy}
          >
            {busy ? 'Veuillez patienter…' : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
