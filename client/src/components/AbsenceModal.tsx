import { useState, type CSSProperties } from 'react';
import Modal from './Modal';

interface AbsenceModalProps {
  isOpen: boolean;
  onClose: () => void;
  comedianName: string;
  eventTitle: string;
  isAlreadyAbsent: boolean;
  onMarkAbsent: (reason: string) => void;
  onCancelAbsence: () => void;
  existingReason: string;
}

function AbsenceModal({ 
  isOpen, 
  onClose, 
  comedianName, 
  eventTitle, 
  isAlreadyAbsent, 
  onMarkAbsent, 
  onCancelAbsence,
  existingReason
}: AbsenceModalProps) {
  const [reason, setReason] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      if (isAlreadyAbsent) {
        await onCancelAbsence();
      } else {
        await onMarkAbsent(reason);
      }
      // Le parent gère la fermeture de la modal et les alertes de succès
      setReason('');
    } catch (error) {
      // Le parent gère les alertes d'erreur, la modal reste ouverte pour permettre de réessayer
      console.error("Erreur lors de la gestion de l'absence:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const modalContentStyle: CSSProperties = { padding: '20px' };
  const titleStyle: CSSProperties = {
    fontSize: '1.5em',
    color: '#ff4b2b',
    marginBottom: '20px',
    textAlign: 'center',
  };
  const infoStyle: CSSProperties = {
    backgroundColor: 'var(--ccc-bg-surface)',
    padding: '15px',
    borderRadius: '8px',
    marginBottom: '20px',
    border: '1px solid var(--ccc-border-medium)',
  };
  const labelStyle: CSSProperties = {
    display: 'block',
    color: 'var(--ccc-text-primary)',
    fontWeight: 'bold',
    marginBottom: '8px',
  };
  const valueStyle: CSSProperties = {
    color: '#ff4b2b',
    fontSize: '1.1em',
  };
  const textareaStyle: CSSProperties = {
    width: '100%',
    minHeight: '100px',
    padding: '12px',
    borderRadius: '8px',
    border: '1px solid var(--ccc-border-medium)',
    backgroundColor: 'var(--ccc-bg-surface)',
    color: 'var(--ccc-text-primary)',
    fontSize: '14px',
    resize: 'vertical',
    outline: 'none',
    marginBottom: '20px',
  };
  const buttonContainerStyle: CSSProperties = {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
    marginTop: '20px',
  };
  const buttonBaseStyle: CSSProperties = {
    padding: '12px 24px',
    borderRadius: '8px',
    border: 'none',
    fontWeight: 'bold',
    cursor: 'pointer',
    fontSize: '14px',
    transition: 'all 0.3s ease',
  };
  const cancelButtonStyle: CSSProperties = {
    ...buttonBaseStyle,
    backgroundColor: 'var(--ccc-bg-surface)',
    color: 'var(--ccc-text-primary)',
    border: '1px solid var(--ccc-border-medium)',
  };
  const submitButtonStyle: CSSProperties = {
    ...buttonBaseStyle,
    backgroundColor: isAlreadyAbsent ? 'var(--ccc-btn-success-bg)' : 'var(--ccc-btn-danger-bg)',
    color: 'var(--ccc-text-on-accent)',
  };
  const disabledButtonStyle: CSSProperties = {
    ...submitButtonStyle,
    backgroundColor: 'var(--ccc-text-faint)',
    cursor: 'not-allowed',
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Gestion de l'absence">
      <div style={modalContentStyle}>
        <h2 style={titleStyle}>
          {isAlreadyAbsent ? '🟢 Annuler l\'absence' : '🚫 Marquer comme absent'}
        </h2>

        <div style={infoStyle}>
          <div style={{ marginBottom: '10px' }}>
            <span style={labelStyle}>Humoriste:</span>
            <span style={valueStyle}>{comedianName}</span>
          </div>
          <div>
            <span style={labelStyle}>Évènement:</span>
            <span style={valueStyle}>{eventTitle}</span>
          </div>
        </div>

        {isAlreadyAbsent ? (
          <div style={{
            backgroundColor: 'rgba(40, 167, 69, 0.1)',
            border: '1px solid rgba(40, 167, 69, 0.3)',
            borderRadius: '8px',
            padding: '15px',
            marginBottom: '20px',
            color: 'var(--ccc-success)',
            textAlign: 'center',
          }}>
            ✅ Ce participant est actuellement marqué comme absent.<br />
            {existingReason && (
              <>
                <span style={{ fontWeight: 'bold' }}>Motif : </span>
                {existingReason}
                <br />
              </>
            )}
            Voulez-vous annuler cette absence ?
          </div>
        ) : (
          <>
            <label style={labelStyle}>
              Commentaire (optionnel):
            </label>
            <textarea
              style={textareaStyle}
              value={reason}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setReason(e.target.value)}
              placeholder="Précisez la raison de l'absence (ex: maladie, urgence personnelle, etc.)"
              maxLength={500}
            />
            <div style={{ 
              color: 'var(--ccc-text-muted)',
              fontSize: '12px',
              textAlign: 'right',
              marginTop: '-15px',
              marginBottom: '15px' 
            }}>
              {reason.length}/500 caractères
            </div>
          </>
        )}

        <div style={buttonContainerStyle}>
          <button
            style={cancelButtonStyle}
            onClick={onClose}
            disabled={isSubmitting}
          >
            Annuler
          </button>
          <button
            style={isSubmitting ? disabledButtonStyle : submitButtonStyle}
            onClick={handleSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting 
              ? '⏳ Traitement...' 
              : isAlreadyAbsent 
                ? '✅ Marquer présent' 
                : '🚫 Confirmer l\'absence'
            }
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default AbsenceModal;
