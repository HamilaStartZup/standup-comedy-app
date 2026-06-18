import { type CSSProperties, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Navbar from '../components/Navbar';
import { useAuth } from '../hooks/useAuth';
import { useAlert } from '../hooks/useAlert';
import { useNavigate } from 'react-router-dom';
import api, { acknowledgePresenceAlert, triggerPresenceCheck } from '../services/api';
import { getErrorMessage, ErrorMessages, ConfirmMessages } from '../services/systemMessages';
import ConfirmDialog from '../components/ConfirmDialog';


interface PresenceAlert {
  _id: string;
  comedian: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  presenceScore: number;
  totalEvents: number;
  absences: number;
  alertSentAt: string;
  acknowledgedAt?: string;
  acknowledgedBy?: {
    _id: string;
    firstName: string;
    lastName: string;
  };
  isActive: boolean;
}

const PresenceAlertsPage = () => {
  const { user } = useAuth();
  const { showSuccess, showError } = useAlert();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isProcessing, setIsProcessing] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => Promise<void> | void;
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });

  const isSuperAdmin = (user as any)?.role === 'SUPER_ADMIN';

  // Récupérer les alertes avec React Query
  const { data: alertsData, isLoading, error, refetch } = useQuery({
    queryKey: ['presence-alerts'],
    queryFn: async () => {
      const response = await api.get('/presence-alerts');
      return response.data;
    },
    enabled: !!user && isSuperAdmin,
  });

  const alerts: PresenceAlert[] = alertsData?.alerts || [];
  const alertsCount = alertsData?.count || 0;

  // Fonction pour marquer une alerte comme prise en compte
  const handleAcknowledge = async (alertId: string) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Confirmer',
      message: ConfirmMessages.PRESENCE_ALERT_ACKNOWLEDGE,
      onConfirm: async () => {
        try {
          await acknowledgePresenceAlert(alertId);
          await refetch();
          queryClient.invalidateQueries({ queryKey: ['presence-alerts'] });
          setConfirmDialog({ ...confirmDialog, isOpen: false });
        } catch (error: any) {
          console.error('Erreur lors de la prise en compte de l\'alerte:', error.response?.status);
          showError(getErrorMessage(error, 'Impossible de mettre à jour l\'alerte'));
        }
      },
    });
  };

  // Fonction pour déclencher manuellement la vérification
  const handleTriggerCheck = async () => {
    setIsProcessing(true);
    try {
      const result = await triggerPresenceCheck();
      showSuccess(`Vérification terminée ! ${result.alertsCreated || 0} nouvelle(s) alerte(s) créée(s).`);
      await refetch();
    } catch (error: any) {
      console.error('Erreur lors de la vérification:', error.response?.status);
      showError(getErrorMessage(error, 'Impossible d\'effectuer la vérification'));
    } finally {
      setIsProcessing(false);
    }
  };

  // Styles
  const mainContainerStyle: CSSProperties = {
    minHeight: '100vh',
    color: 'var(--ccc-text-primary)',
    padding: '20px',
    background: 'var(--ccc-bg-gradient)',
  };

  const pageHeaderStyle: CSSProperties = {
    maxWidth: '1200px',
    margin: '0 auto 30px auto',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '20px',
  };

  const titleStyle: CSSProperties = {
    fontSize: '2.5em',
    color: 'var(--ccc-accent)',
    fontWeight: 700,
    letterSpacing: '-0.02em',
    margin: 0,
  };

  const contentStyle: CSSProperties = {
    maxWidth: '1200px',
    margin: '0 auto',
    backgroundColor: 'var(--ccc-bg-elevated)',
    border: '1px solid var(--ccc-border-subtle)',
    boxShadow: '0 4px 24px rgba(15, 23, 42, 0.08)',
    borderRadius: '8px',
    padding: '20px',
  };

  const alertCardStyle: CSSProperties = {
    backgroundColor: 'var(--ccc-bg-elevated)',
    border: '1px solid var(--ccc-border-subtle)',
    boxShadow: '0 4px 24px rgba(15, 23, 42, 0.08)',
    borderRadius: '12px',
    padding: '20px',
    marginBottom: '15px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  };

  const alertHeaderStyle: CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '10px',
  };

  const comedianNameStyle: CSSProperties = {
    fontSize: '1.3em',
    fontWeight: 'bold',
    color: '#ff4b2b',
  };

  const scoreStyle = (score: number): CSSProperties => ({
    fontSize: '1.5em',
    fontWeight: 'bold',
    color: score < 30 ? 'var(--ccc-error)' : score < 50 ? 'var(--ccc-warning)' : 'var(--ccc-success)',
    padding: '8px 16px',
    borderRadius: '8px',
    backgroundColor: score < 30 ? 'rgba(220, 53, 69, 0.2)' : score < 50 ? 'rgba(255, 193, 7, 0.2)' : 'rgba(40, 167, 69, 0.2)',
  });

  const infoRowStyle: CSSProperties = {
    display: 'flex',
    gap: '20px',
    flexWrap: 'wrap',
    fontSize: '0.95em',
    color: 'var(--ccc-text-subtle)',
  };

  const buttonStyle: CSSProperties = {
    padding: '10px 20px',
    borderRadius: '8px',
    border: 'none',
    background: 'var(--ccc-accent-gradient)',
    color: 'white',
    fontSize: '1em',
    fontWeight: 'bold',
    cursor: 'pointer',
    transition: 'background 0.3s ease',
  };

  const acknowledgeButtonStyle: CSSProperties = {
    ...buttonStyle,
    background: 'linear-gradient(to right, var(--ccc-success), #059669)',
    padding: '8px 16px',
    fontSize: '0.9em',
  };

  const emptyStateStyle: CSSProperties = {
    textAlign: 'center',
    color: 'var(--ccc-text-subtle)',
    fontSize: '1.2em',
    padding: '40px',
  };

  if (!isSuperAdmin) {
    return (
      <div style={mainContainerStyle}>
        <Navbar />
        <div style={contentStyle}>
          <p style={{ color: 'var(--ccc-error)', fontSize: '1.2em' }}>
            Accès refusé. Seuls les super-admins peuvent accéder à cette page.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={mainContainerStyle}>
      <Navbar />
      <div style={{ marginTop: '80px' }}>
        <div style={pageHeaderStyle}>
          <div>
            <h1 style={titleStyle}>Alertes de Présence</h1>
            <p style={{ color: 'var(--ccc-text-subtle)', fontSize: '1.1em' }}>
              Humoristes avec un score de présence inférieur à 75%
            </p>
          </div>
          <button
            onClick={handleTriggerCheck}
            disabled={isProcessing}
            style={buttonStyle}
          >
            {isProcessing ? 'Vérification...' : '🔄 Vérifier maintenant'}
          </button>
        </div>

        <div style={contentStyle}>
          {isLoading && (
            <p style={{ textAlign: 'center', color: 'var(--ccc-text-subtle)' }}>Chargement des alertes...</p>
          )}

          {error && (
            <p style={{ textAlign: 'center', color: 'var(--ccc-error)' }}>
              Erreur: {(error as any).response?.data?.message || (error as any).message}
            </p>
          )}

          {!isLoading && !error && alertsCount === 0 && (
            <div style={emptyStateStyle}>
              <p>✅ Aucune alerte active</p>
              <p style={{ fontSize: '0.9em', marginTop: '10px' }}>
                Tous les humoristes ont un score de présence supérieur ou égal à 75%
              </p>
            </div>
          )}

          {!isLoading && !error && alertsCount > 0 && (
            <>
              <div style={{ marginBottom: '20px', color: 'var(--ccc-warning)', fontSize: '1.1em', fontWeight: 'bold' }}>
                {alertsCount} alerte(s) active(s)
              </div>
              {alerts.map((alert) => (
                <div key={alert._id} style={alertCardStyle}>
                  <div style={alertHeaderStyle}>
                    <div>
                      <div style={comedianNameStyle}>
                        {alert.comedian.firstName} {alert.comedian.lastName}
                      </div>
                      <div style={{ color: 'var(--ccc-text-subtle)', fontSize: '0.9em', marginTop: '4px' }}>
                        {alert.comedian.email}
                      </div>
                    </div>
                    <div style={scoreStyle(alert.presenceScore)}>
                      {alert.presenceScore}%
                    </div>
                  </div>

                  <div style={infoRowStyle}>
                    <div>
                      <strong>Évènements présents:</strong> {alert.totalEvents}
                    </div>
                    <div>
                      <strong>Absences:</strong> {alert.absences}
                    </div>
                    <div>
                      <strong>Total participations:</strong> {alert.totalEvents + alert.absences}
                    </div>
                  </div>

                  <div style={infoRowStyle}>
                    <div>
                      <strong>Alerte créée:</strong> {new Date(alert.alertSentAt).toLocaleDateString('fr-FR', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </div>
                    {alert.acknowledgedAt && (
                      <div>
                        <strong>Prise en compte:</strong> {new Date(alert.acknowledgedAt).toLocaleDateString('fr-FR', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                        {alert.acknowledgedBy && (
                          <span> par {alert.acknowledgedBy.firstName} {alert.acknowledgedBy.lastName}</span>
                        )}
                      </div>
                    )}
                  </div>

                  {!alert.acknowledgedAt && (
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
                      <button
                        onClick={() => handleAcknowledge(alert._id)}
                        style={acknowledgeButtonStyle}
                      >
                        ✓ Marquer comme prise en compte
                      </button>
                    </div>
                  )}

                  <div style={{ marginTop: '10px' }}>
                    <button
                      onClick={() => navigate(`/profile/comedian/${alert.comedian._id}`)}
                      style={{
                        ...buttonStyle,
                        background: 'linear-gradient(to right, #17a2b8, #138496)',
                        padding: '8px 16px',
                        fontSize: '0.9em',
                      }}
                    >
                      👤 Voir le profil
                    </button>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog({ ...confirmDialog, isOpen: false })}
        confirmText="Confirmer"
        cancelText="Annuler"
      />
    </div>
  );
};

export default PresenceAlertsPage;

