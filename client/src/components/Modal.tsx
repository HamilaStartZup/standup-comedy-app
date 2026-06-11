import React, { type CSSProperties } from 'react';
import { theme } from '../styles/theme';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
  /** Si false, la modale ne se ferme qu'au clic sur la croix ou le bouton Annuler (pas au clic sur l'overlay). Défaut: true */
  closeOnOverlayClick?: boolean;
  /** Si true, l'overlay est plus transparent pour laisser voir la plateforme en arrière-plan. Défaut: false */
  transparentOverlay?: boolean;
}

function Modal({ isOpen, onClose, children, closeOnOverlayClick = true, transparentOverlay = false }: ModalProps) {
  if (!isOpen) return null;

  const handleOverlayClick = () => {
    if (closeOnOverlayClick) onClose();
  };

  const overlayStyle: CSSProperties = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: transparentOverlay ? 'rgba(15, 23, 42, 0.2)' : theme.colors.bg.overlay,
    backdropFilter: 'blur(4px)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  };

  const modalStyle: CSSProperties = {
    background: theme.colors.bg.elevated,
    padding: '25px',
    borderRadius: theme.radius.md,
    minWidth: 'auto',
    maxWidth: '600px',
    width: '100%',
    boxShadow: theme.shadow.dropdown,
    position: 'relative',
    color: theme.colors.text.primary,
    border: `1px solid ${theme.colors.border.subtle}`,
    maxHeight: '85vh',
    overflowY: 'auto',
    overflowX: 'hidden',
    scrollbarWidth: 'none' as any,
    msOverflowStyle: 'none' as any,
  };

  const closeButtonStyle: CSSProperties = {
    position: 'absolute',
    top: '15px',
    right: '15px',
    background: 'none',
    border: 'none',
    fontSize: '1.5em',
    cursor: 'pointer',
    color: theme.colors.text.muted,
  };

  return (
    <div style={overlayStyle} onClick={handleOverlayClick}>
      <style>{`
        .modal-content::-webkit-scrollbar {
          display: none;
        }
      `}</style>
      <div className="modal-content" style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} style={closeButtonStyle}>&times;</button>
        {children}
      </div>
    </div>
  );
}

export default Modal;
