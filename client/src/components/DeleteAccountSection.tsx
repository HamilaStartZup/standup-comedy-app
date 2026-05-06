import React, { useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../hooks/useAuth';

interface DeletionResponse {
  message: string;
  deactivatedAt: string;
  deletionDate: string;
  gracePeriodDays: number;
  info: string;
}

const DeleteAccountSection: React.FC = () => {
  const navigate = useNavigate();
  const { logout, user } = useAuth();
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [deletionInfo, setDeletionInfo] = useState<DeletionResponse | null>(null);
  const [confirmEmail, setConfirmEmail] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDeleteAccount = async () => {
    if (confirmEmail !== user?.email) {
      setError('L\'email saisi ne correspond pas à votre email');
      return;
    }

    try {
      setIsDeleting(true);
      setError(null);

      const response = await api.delete<DeletionResponse>('/profile/me');

      // Afficher le message de succès avec les détails
      setDeletionInfo(response.data);
      setShowSuccess(true);
      setShowConfirmation(false);

    } catch (err: any) {
      console.error('Erreur lors de la demande de suppression:', err);
      setError(err.response?.data?.message || 'Une erreur est survenue lors de la demande de suppression');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleLogoutAndRedirect = () => {
    logout();
    navigate('/', { state: { accountPendingDeletion: true } });
  };

  const cardStyle: CSSProperties = {
    backgroundColor: '#1a1d27',
    borderRadius: '16px',
    padding: '24px',
    border: '1px solid #2a2d3a',
    borderLeft: '4px solid #dc3545',
  };

  const titleStyle: CSSProperties = {
    fontSize: '1.2em',
    color: '#fff',
    marginBottom: '16px',
    display: 'flex',
    alignItems: 'center',
    fontWeight: 600,
  };

  const warningBoxStyle: CSSProperties = {
    padding: '14px 16px',
    borderRadius: '8px',
    background: 'rgba(255, 255, 255, 0.04)',
    borderLeft: '3px solid #dc3545',
    marginBottom: '16px',
  };

  const infoBoxStyle: CSSProperties = {
    padding: '14px 16px',
    borderRadius: '8px',
    background: 'rgba(255, 255, 255, 0.04)',
    borderLeft: '3px solid #ffc107',
    marginBottom: '16px',
  };

  const successBoxStyle: CSSProperties = {
    padding: '14px 16px',
    borderRadius: '8px',
    background: 'rgba(255, 255, 255, 0.04)',
    borderLeft: '3px solid #28a745',
    marginBottom: '16px',
  };

  const buttonStyle: CSSProperties = {
    padding: '12px 22px',
    borderRadius: '8px',
    border: 'none',
    fontWeight: 'bold',
    cursor: isDeleting ? 'not-allowed' : 'pointer',
    opacity: isDeleting ? 0.6 : 1,
    transition: 'all 0.3s ease',
  };

  const inputStyle: CSSProperties = {
    width: '100%',
    padding: '10px 14px',
    borderRadius: '6px',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    background: 'rgba(0, 0, 0, 0.3)',
    color: '#fff',
    fontSize: '0.95em',
    marginBottom: '15px',
    boxSizing: 'border-box',
  };

  // Affichage après succès de la demande
  if (showSuccess && deletionInfo) {
    const deletionDate = new Date(deletionInfo.deletionDate);

    return (
      <div style={cardStyle}>
        <h2 style={{ ...titleStyle, color: '#ffc107' }}>
          <i className="fas fa-clock" style={{ marginRight: '10px' }}></i>
          Demande de suppression enregistrée
        </h2>

        <div style={successBoxStyle}>
          <p style={{ color: '#28a745', fontWeight: 'bold', marginBottom: '8px' }}>
            <i className="fas fa-check-circle" style={{ marginRight: '8px' }}></i>
            Votre demande a été prise en compte
          </p>
          <p style={{ color: '#aaa', fontSize: '0.9em', marginBottom: '8px' }}>
            Votre compte sera définitivement supprimé le :
          </p>
          <p style={{ color: '#fff', fontSize: '1.1em', fontWeight: 'bold', margin: 0 }}>
            {deletionDate.toLocaleDateString('fr-FR', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            })}
          </p>
        </div>

        <div style={infoBoxStyle}>
          <p style={{ color: '#ffc107', fontWeight: 'bold', marginBottom: '8px' }}>
            <i className="fas fa-lightbulb" style={{ marginRight: '8px' }}></i>
            Vous pouvez annuler cette demande
          </p>
          <p style={{ color: '#aaa', fontSize: '0.9em', margin: 0 }}>
            Si vous changez d'avis, reconnectez-vous simplement à votre compte dans les 30 prochains jours.
            Votre compte sera automatiquement réactivé.
          </p>
        </div>

        <button
          onClick={handleLogoutAndRedirect}
          style={{
            ...buttonStyle,
            background: 'linear-gradient(135deg, #e85d75, #c13057)',
            color: '#fff',
          }}
        >
          <i className="fas fa-sign-out-alt" style={{ marginRight: '8px' }}></i>
          Compris, me déconnecter
        </button>
      </div>
    );
  }

  return (
    <div style={cardStyle}>
      <h2 style={titleStyle}>
        <i className="fas fa-trash-alt" style={{ marginRight: '10px' }}></i>
        Supprimer mon compte
      </h2>

      {!showConfirmation ? (
        <>
          <div style={infoBoxStyle}>
            <p style={{ color: '#ffc107', fontWeight: 'bold', marginBottom: '8px' }}>
              <i className="fas fa-shield-alt" style={{ marginRight: '8px' }}></i>
              Protection de 30 jours
            </p>
            <p style={{ color: '#aaa', fontSize: '0.9em', margin: 0 }}>
              Comme Facebook et Google, nous offrons un délai de grâce de <strong style={{ color: '#fff' }}>30 jours</strong>.
              Pendant cette période, vous pouvez récupérer votre compte en vous reconnectant.
            </p>
          </div>

          <div style={warningBoxStyle}>
            <p style={{ color: '#dc3545', fontWeight: 'bold', marginBottom: '8px' }}>
              <i className="fas fa-exclamation-triangle" style={{ marginRight: '8px' }}></i>
              Après 30 jours, vos données seront définitivement supprimées :
            </p>
            <ul style={{ color: '#aaa', fontSize: '0.9em', paddingLeft: '20px', margin: 0 }}>
              <li>Toutes vos données personnelles</li>
              <li>Vos candidatures et participations</li>
              <li>Vos événements (si organisateur)</li>
              <li>Vos notifications et préférences</li>
            </ul>
          </div>

          <p style={{ color: '#888', fontSize: '0.85em', marginBottom: '15px' }}>
            <i className="fas fa-balance-scale" style={{ marginRight: '6px', color: '#667eea' }}></i>
            Conformément au RGPD (Article 17 - Droit à l'effacement), vous pouvez demander la suppression
            de toutes vos données personnelles.
          </p>

          <button
            onClick={() => setShowConfirmation(true)}
            style={{
              ...buttonStyle,
              background: 'transparent',
              border: '1px solid #dc3545',
              color: '#dc3545',
            }}
          >
            <i className="fas fa-user-times" style={{ marginRight: '8px' }}></i>
            Demander la suppression de mon compte
          </button>
        </>
      ) : (
        <>
          <div style={warningBoxStyle}>
            <p style={{ color: '#dc3545', fontWeight: 'bold', marginBottom: '8px' }}>
              <i className="fas fa-exclamation-circle" style={{ marginRight: '8px' }}></i>
              Confirmation de la demande
            </p>
            <p style={{ color: '#aaa', fontSize: '0.9em', margin: 0 }}>
              Pour confirmer, veuillez saisir votre adresse email :
              <br />
              <strong style={{ color: '#fff' }}>{user?.email}</strong>
            </p>
          </div>

          <input
            type="email"
            placeholder="Saisissez votre email pour confirmer"
            value={confirmEmail}
            onChange={(e) => setConfirmEmail(e.target.value)}
            style={inputStyle}
            disabled={isDeleting}
          />

          {error && (
            <div
              style={{
                marginBottom: '15px',
                padding: '12px 15px',
                background: 'rgba(255, 255, 255, 0.05)',
                borderRadius: '6px',
                borderLeft: '3px solid #dc3545',
              }}
            >
              <p style={{ color: '#dc3545', fontSize: '0.9em', margin: 0 }}>
                <i className="fas fa-times-circle" style={{ marginRight: '8px' }}></i>
                {error}
              </p>
            </div>
          )}

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button
              onClick={() => {
                setShowConfirmation(false);
                setConfirmEmail('');
                setError(null);
              }}
              disabled={isDeleting}
              style={{
                ...buttonStyle,
                background: 'rgba(255, 255, 255, 0.1)',
                color: '#fff',
              }}
            >
              <i className="fas fa-arrow-left" style={{ marginRight: '8px' }}></i>
              Annuler
            </button>
            <button
              onClick={handleDeleteAccount}
              disabled={isDeleting || confirmEmail !== user?.email}
              style={{
                ...buttonStyle,
                background: confirmEmail === user?.email ? '#dc3545' : 'rgba(220, 53, 69, 0.3)',
                color: '#fff',
                cursor: confirmEmail === user?.email && !isDeleting ? 'pointer' : 'not-allowed',
              }}
            >
              {isDeleting ? (
                <>
                  <i className="fas fa-spinner fa-spin" style={{ marginRight: '8px' }}></i>
                  Traitement en cours...
                </>
              ) : (
                <>
                  <i className="fas fa-trash" style={{ marginRight: '8px' }}></i>
                  Confirmer la suppression
                </>
              )}
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default DeleteAccountSection;
