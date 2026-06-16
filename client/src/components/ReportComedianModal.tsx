import { type CSSProperties, useState, useEffect } from 'react';
import Modal from './Modal';
import { createComedianReport, checkComedianReport } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import { useAlert } from '../hooks/useAlert';
import { getErrorMessage, ErrorMessages, SuccessMessages, WarningMessages } from '../services/systemMessages';

interface ReportComedianModalProps {
  isOpen: boolean;
  onClose: () => void;
  comedianId: string;
  comedianName: string;
}

const ReportComedianModal = ({ isOpen, onClose, comedianId, comedianName }: ReportComedianModalProps) => {
  const { user, token } = useAuth();
  const { showSuccess, showError, showWarning } = useAlert();
  const [reason, setReason] = useState<'troll' | 'fake_account' | 'inappropriate_content' | 'spam' | 'other'>('troll');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasReported, setHasReported] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  const isOrganizer = user?.role === 'ORGANIZER';

  // Vérifier si l'humoriste a déjà été signalé
  useEffect(() => {
    if (isOpen && isOrganizer && comedianId && token) {
      setIsChecking(true);
      checkComedianReport(comedianId)
        .then((data) => {
          setHasReported(data.hasReported);
        })
        .catch((error) => {
          console.error('Erreur lors de la vérification:', error);
        })
        .finally(() => {
          setIsChecking(false);
        });
    }
  }, [isOpen, isOrganizer, comedianId, token]);

  const handleSubmit = async () => {
    if (!reason) {
      showWarning(WarningMessages.REPORT_REASON_REQUIRED);
      return;
    }

    if (reason === 'other' && !description.trim()) {
      showWarning(WarningMessages.REPORT_DESCRIPTION_REQUIRED);
      return;
    }

    setIsSubmitting(true);
    try {
      await createComedianReport(comedianId, reason, description || undefined);
      showSuccess(SuccessMessages.REPORT_SUBMITTED);
      setHasReported(true);
      setReason('troll');
      setDescription('');
      onClose();
    } catch (error: any) {
      console.error('Erreur lors du signalement:', error.response?.status);
      if (error.response?.status === 409) {
        showWarning(WarningMessages.ALREADY_REPORTED);
        setHasReported(true);
      } else {
        showError(getErrorMessage(error, ErrorMessages.REPORT_SUBMIT_FAILED));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const reasonLabels: Record<string, string> = {
    troll: 'Troll / Comportement inapproprié',
    fake_account: 'Faux compte',
    inappropriate_content: 'Contenu inapproprié',
    spam: 'Spam / Publicité non autorisée',
    other: 'Autre'
  };

  if (!isOrganizer) {
    return null;
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Signaler un humoriste">
      {isChecking ? (
        <p style={{ color: 'var(--ccc-text-muted)', textAlign: 'center' }}>Vérification...</p>
      ) : hasReported ? (
        <div>
          <p style={{ color: '#ffc107', marginBottom: '20px', textAlign: 'center' }}>
            ⚠️ Vous avez déjà signalé cet humoriste.
          </p>
          <button
            onClick={onClose}
            style={{
              width: '100%',
              padding: '12px',
              borderRadius: '8px',
              border: 'none',
              background: '#6c757d',
              color: 'white',
              fontWeight: 'bold',
              cursor: 'pointer'
            }}
          >
            Fermer
          </button>
        </div>
      ) : (
        <div>
          <p style={{ color: 'var(--ccc-text-muted)', marginBottom: '20px' }}>
            Vous signalez : <strong style={{ color: 'var(--ccc-text-primary)' }}>{comedianName}</strong>
          </p>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', color: '#fff', marginBottom: '10px', fontWeight: 'bold' }}>
              Raison du signalement *
            </label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value as any)}
              style={{
                width: '100%',
                padding: '10px',
                borderRadius: '6px',
                border: '1px solid var(--ccc-border-medium)',
                background: 'var(--ccc-bg-surface)',
                color: 'var(--ccc-text-primary)',
                fontSize: '14px'
              }}
            >
              {Object.entries(reasonLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', color: '#fff', marginBottom: '10px', fontWeight: 'bold' }}>
              Description (optionnel)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Décrivez le problème en détail..."
              rows={4}
              maxLength={1000}
              style={{
                width: '100%',
                padding: '10px',
                borderRadius: '6px',
                border: '1px solid var(--ccc-border-medium)',
                background: 'var(--ccc-bg-surface)',
                color: 'var(--ccc-text-primary)',
                fontSize: '14px',
                fontFamily: 'inherit',
                resize: 'vertical'
              }}
            />
            <p style={{ color: 'var(--ccc-text-muted)', fontSize: '12px', marginTop: '5px' }}>
              {description.length}/1000 caractères
            </p>
          </div>

          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <button
              onClick={onClose}
              disabled={isSubmitting}
              style={{
                padding: '10px 20px',
                borderRadius: '6px',
                border: '1px solid var(--ccc-border-medium)',
                background: 'var(--ccc-bg-surface)',
                color: 'var(--ccc-text-primary)',
                fontWeight: 'bold',
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
                opacity: isSubmitting ? 0.6 : 1
              }}
            >
              Annuler
            </button>
            <button
              onClick={handleSubmit}
              disabled={isSubmitting}
              style={{
                padding: '10px 20px',
                borderRadius: '6px',
                border: 'none',
                background: 'linear-gradient(to right, #dc3545, #c82333)',
                color: 'white',
                fontWeight: 'bold',
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
                opacity: isSubmitting ? 0.6 : 1
              }}
            >
              {isSubmitting ? 'Envoi...' : 'Signaler'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
};

export default ReportComedianModal;

