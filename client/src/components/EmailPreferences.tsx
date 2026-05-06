import React, { useEffect, useState, type CSSProperties } from 'react';
import api from '../services/api';

const EmailPreferences: React.FC = () => {
  const [isSubscribed, setIsSubscribed] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    fetchSubscriptionStatus();
  }, []);

  const fetchSubscriptionStatus = async () => {
    try {
      setIsLoading(true);
      const response = await api.get('/email/subscription-status');
      setIsSubscribed(response.data.subscribed);
      setError(null);
    } catch (err) {
      console.error('Erreur lors de la récupération du statut:', err);
      setError('Impossible de charger les préférences email');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResubscribe = async () => {
    try {
      setIsUpdating(true);
      setError(null);
      setSuccessMessage(null);

      await api.post('/email/resubscribe');
      setIsSubscribed(true);
      setSuccessMessage('Vous êtes maintenant réabonné aux emails !');
    } catch (err) {
      console.error('Erreur lors de la mise à jour:', err);
      setError('Une erreur est survenue. Veuillez réessayer.');
    } finally {
      setIsUpdating(false);
    }
  };

  const cardStyle: CSSProperties = {
    backgroundColor: '#1a1d27',
    borderRadius: '16px',
    padding: '24px',
    border: '1px solid #2a2d3a',
    borderLeft: '4px solid #e85d75',
  };

  const titleStyle: CSSProperties = {
    fontSize: '1.2em',
    color: '#fff',
    marginBottom: '16px',
    display: 'flex',
    alignItems: 'center',
    fontWeight: 600,
  };

  const rowStyle: CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 0',
    borderBottom: '1px solid #22253a',
  };

  const statusBoxStyle: CSSProperties = {
    padding: '14px 16px',
    borderRadius: '8px',
    marginTop: '16px',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    background: 'rgba(255, 255, 255, 0.04)',
  };

  const buttonStyle: CSSProperties = {
    padding: '10px 20px',
    borderRadius: '8px',
    border: 'none',
    fontWeight: 'bold',
    cursor: isUpdating ? 'not-allowed' : 'pointer',
    opacity: isUpdating ? 0.6 : 1,
    transition: 'all 0.3s ease',
  };

  if (isLoading) {
    return (
      <div style={cardStyle}>
        <div style={{ color: '#aaa', textAlign: 'center', padding: '20px' }}>
          <i className="fas fa-spinner fa-spin" style={{ marginRight: '8px' }}></i>
          Chargement des préférences email...
        </div>
      </div>
    );
  }

  return (
    <div style={cardStyle}>
      <h2 style={titleStyle}>
        <i className="fas fa-envelope" style={{ marginRight: '10px' }}></i>
        Préférences Email
      </h2>

      <div style={rowStyle}>
        <div>
          <p style={{ color: '#fff', fontWeight: 'bold', marginBottom: '5px' }}>
            Notifications par email
          </p>
          <p style={{ color: '#aaa', fontSize: '0.9em' }}>
            Recevez des emails pour les nouvelles candidatures, évènements et mises à jour.
          </p>
        </div>
      </div>

      {/* Statut actuel */}
      <div
        style={{
          ...statusBoxStyle,
          borderLeft: isSubscribed
            ? '3px solid #28a745'
            : '3px solid #ffc107',
        }}
      >
        <i
          className={isSubscribed ? 'fas fa-check-circle' : 'fas fa-exclamation-triangle'}
          style={{
            fontSize: '1.3em',
            color: isSubscribed ? '#28a745' : '#ffc107',
          }}
        ></i>
        <div>
          <p
            style={{
              color: isSubscribed ? '#28a745' : '#ffc107',
              fontWeight: 'bold',
              marginBottom: '4px',
            }}
          >
            {isSubscribed ? 'Vous êtes abonné aux emails' : 'Vous êtes désabonné des emails'}
          </p>
          <p style={{ color: '#aaa', fontSize: '0.85em' }}>
            {isSubscribed
              ? 'Vous recevez toutes les notifications par email.'
              : 'Vous ne recevez plus aucune notification par email.'}
          </p>
        </div>
      </div>

      {/* Bouton de réabonnement si désabonné */}
      {!isSubscribed && (
        <div style={{ marginTop: '15px', textAlign: 'center' }}>
          <button
            onClick={handleResubscribe}
            disabled={isUpdating}
            style={{
              ...buttonStyle,
              background: 'linear-gradient(135deg, #e85d75, #c13057)',
              color: '#fff',
            }}
          >
            {isUpdating ? (
              <>
                <i className="fas fa-spinner fa-spin" style={{ marginRight: '8px' }}></i>
                Réabonnement en cours...
              </>
            ) : (
              <>
                <i className="fas fa-bell" style={{ marginRight: '8px' }}></i>
                Me réabonner aux emails
              </>
            )}
          </button>
        </div>
      )}

      {/* Message si abonné */}
      {isSubscribed && (
        <div
          style={{
            marginTop: '15px',
            padding: '10px 12px',
            background: 'rgba(255, 255, 255, 0.05)',
            borderRadius: '6px',
            borderLeft: '3px solid #888',
          }}
        >
          <p style={{ color: '#888', fontSize: '0.85em' }}>
            <i className="fas fa-lightbulb" style={{ marginRight: '8px', color: '#ffc107' }}></i>
            Pour vous désabonner, utilisez le lien "Se désabonner" présent dans vos emails.
          </p>
        </div>
      )}

      {/* Messages d'erreur ou de succès */}
      {error && (
        <div
          style={{
            marginTop: '15px',
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

      {successMessage && (
        <div
          style={{
            marginTop: '15px',
            padding: '12px 15px',
            background: 'rgba(255, 255, 255, 0.05)',
            borderRadius: '6px',
            borderLeft: '3px solid #28a745',
          }}
        >
          <p style={{ color: '#28a745', fontSize: '0.9em', margin: 0 }}>
            <i className="fas fa-check-circle" style={{ marginRight: '8px' }}></i>
            {successMessage}
          </p>
        </div>
      )}
    </div>
  );
};

export default EmailPreferences;
