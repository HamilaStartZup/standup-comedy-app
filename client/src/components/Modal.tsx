import React, { type CSSProperties } from 'react';

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
    backgroundColor: transparentOverlay ? 'rgba(0, 0, 0, 0.25)' : 'rgba(0, 0, 0, 0.7)',
    backdropFilter: 'blur(4px)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  };

  const modalStyle: CSSProperties = {
    background: 'linear-gradient(to bottom right, #1a1a2e, #331f41)',
    padding: '25px',
    borderRadius: '12px',
    minWidth: 'auto',
    maxWidth: '600px',
    width: '100%',
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
    position: 'relative',
    color: '#ffffff',
    border: '1px solid rgba(255, 255, 255, 0.1)',
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
    color: '#ffffff',
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