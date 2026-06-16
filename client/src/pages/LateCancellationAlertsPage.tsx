import { type CSSProperties, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Navbar from '../components/Navbar';
import { useAuth } from '../hooks/useAuth';
import { useAlert } from '../hooks/useAlert';
import { useNavigate } from 'react-router-dom';
import { getLateCancellationAlerts, acknowledgeLateCancellationAlert } from '../services/api';
import { getErrorMessage, ConfirmMessages } from '../services/systemMessages';
import ConfirmDialog from '../components/ConfirmDialog';
import { pageTitleStyle } from '../styles/theme';

interface LateCancellationAlert {
  _id: string;
  comedian: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  event: {
    _id: string;
    title: string;
    date: string;
    location?: {
      city?: string;
      address?: string;
    };
  };
  hoursBeforeEvent: number;
  totalLateCancellations: number;
  cancellationDate: string;
  alertSentAt: string;
  acknowledgedAt?: string;
  acknowledgedBy?: {
    _id: string;
    firstName: string;
    lastName: string;
  };
  isActive: boolean;
}

const LateCancellationAlertsPage = () => {
  const { user } = useAuth();
  const { showSuccess, showError } = useAlert();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showAll, setShowAll] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => Promise<void> | void;
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });

  const isSuperAdmin = (user as any)?.role === 'SUPER_ADMIN';

  // Recuperer les alertes avec React Query
  const { data: alertsData, isLoading, error, refetch } = useQuery({
    queryKey: ['late-cancellation-alerts', showAll],
    queryFn: async () => {
      return await getLateCancellationAlerts(showAll ? undefined : true);
    },
    enabled: !!user && isSuperAdmin,
  });

  const alerts: LateCancellationAlert[] = alertsData?.alerts || [];
  const alertsCount = alertsData?.total || 0;

  // Fonction pour marquer une alerte comme prise en compte
  const handleAcknowledge = async (alertId: string) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Confirmer',
      message: 'Voulez-vous marquer cette alerte comme prise en compte ?',
      onConfirm: async () => {
        try {
          await acknowledgeLateCancellationAlert(alertId);
          await refetch();
          queryClient.invalidateQueries({ queryKey: ['late-cancellation-alerts'] });
          showSuccess('Alerte marquee comme prise en compte');
          setConfirmDialog({ ...confirmDialog, isOpen: false });
        } catch (error: any) {
          console.error('Erreur lors de la prise en compte de l\'alerte:', error.response?.status);
          showError(getErrorMessage(error, 'Impossible de mettre a jour l\'alerte'));
        }
      },
    });
  };

  // Calculer la severite en fonction du nombre d'annulations
  const getSeverity = (total: number): { label: string; color: string; bgColor: string } => {
    if (total >= 3) {
      return { label: 'ELEVEE', color: '#dc3545', bgColor: 'rgba(220, 53, 69, 0.2)' };
    } else if (total >= 2) {
      return { label: 'MOYENNE', color: '#ffc107', bgColor: 'rgba(255, 193, 7, 0.2)' };
    }
    return { label: 'NORMALE', color: '#28a745', bgColor: 'rgba(40, 167, 69, 0.2)' };
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
    ...pageTitleStyle,
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
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: '10px',
  };

  const comedianNameStyle: CSSProperties = {
    fontSize: '1.3em',
    fontWeight: 'bold',
    color: '#ff4b2b',
  };

  const eventTitleStyle: CSSProperties = {
    fontSize: '1.1em',
    color: '#17a2b8',
    marginTop: '4px',
  };

  const infoRowStyle: CSSProperties = {
    display: 'flex',
    gap: '20px',
    flexWrap: 'wrap',
    fontSize: '0.95em',
    color: 'var(--ccc-text-muted)',
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
    background: 'linear-gradient(to right, #28a745, #218838)',
    padding: '8px 16px',
    fontSize: '0.9em',
  };

  const toggleButtonStyle: CSSProperties = {
    ...buttonStyle,
    background: showAll
      ? 'linear-gradient(to right, #6c757d, #5a6268)'
      : 'linear-gradient(to right, #17a2b8, #138496)',
    padding: '8px 16px',
    fontSize: '0.9em',
  };

  const emptyStateStyle: CSSProperties = {
    textAlign: 'center',
    color: 'var(--ccc-text-muted)',
    fontSize: '1.2em',
    padding: '40px',
  };

  const severityBadgeStyle = (severity: { color: string; bgColor: string }): CSSProperties => ({
    fontSize: '0.9em',
    fontWeight: 'bold',
    color: severity.color,
    padding: '6px 12px',
    borderRadius: '6px',
    backgroundColor: severity.bgColor,
    display: 'inline-block',
  });

  const hoursWarningStyle: CSSProperties = {
    fontSize: '1.2em',
    fontWeight: 'bold',
    color: '#dc3545',
    padding: '8px 16px',
    borderRadius: '8px',
    backgroundColor: 'rgba(220, 53, 69, 0.2)',
  };

  if (!isSuperAdmin) {
    return (
      <div style={mainContainerStyle}>
        <Navbar />
        <div style={contentStyle}>
          <p style={{ color: '#dc3545', fontSize: '1.2em' }}>
            Acces refuse. Seuls les super-admins peuvent acceder a cette page.
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
            <h1 style={titleStyle}>Alertes Annulations Tardives</h1>
            <p style={{ color: 'var(--ccc-text-muted)', fontSize: '1.1em' }}>
              Desistements moins de 72h avant l'evenement
            </p>
          </div>
          <button
            onClick={() => setShowAll(!showAll)}
            style={toggleButtonStyle}
          >
            {showAll ? 'Actives uniquement' : 'Voir tout l\'historique'}
          </button>
        </div>

        <div style={contentStyle}>
          {isLoading && (
            <p style={{ textAlign: 'center', color: 'var(--ccc-text-muted)' }}>Chargement des alertes...</p>
          )}

          {error && (
            <p style={{ textAlign: 'center', color: '#dc3545' }}>
              Erreur: {(error as any).response?.data?.message || (error as any).message}
            </p>
          )}

          {!isLoading && !error && alertsCount === 0 && (
            <div style={emptyStateStyle}>
              <p>{showAll ? 'Aucune alerte dans l\'historique' : 'Aucune alerte active'}</p>
              <p style={{ fontSize: '0.9em', marginTop: '10px' }}>
                {showAll
                  ? 'Aucun desistement tardif n\'a ete enregistre'
                  : 'Toutes les alertes ont ete prises en compte'}
              </p>
            </div>
          )}

          {!isLoading && !error && alertsCount > 0 && (
            <>
              <div style={{ marginBottom: '20px', color: '#ffc107', fontSize: '1.1em', fontWeight: 'bold' }}>
                {alertsCount} alerte(s) {showAll ? 'au total' : 'active(s)'}
              </div>
              {alerts.map((alert) => {
                const severity = getSeverity(alert.totalLateCancellations);
                return (
                  <div
                    key={alert._id}
                    style={{
                      ...alertCardStyle,
                      borderLeft: `4px solid ${severity.color}`,
                    }}
                  >
                    <div style={alertHeaderStyle}>
                      <div style={{ flex: 1 }}>
                        <div style={comedianNameStyle}>
                          {alert.comedian.firstName} {alert.comedian.lastName}
                        </div>
                        <div style={{ color: 'var(--ccc-text-muted)', fontSize: '0.9em', marginTop: '4px' }}>
                          {alert.comedian.email}
                        </div>
                        <div style={eventTitleStyle}>
                          Evenement: "{alert.event.title}"
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
                        <div style={severityBadgeStyle(severity)}>
                          Severite: {severity.label}
                        </div>
                        <div style={hoursWarningStyle}>
                          {alert.hoursBeforeEvent.toFixed(0)}h avant
                        </div>
                      </div>
                    </div>

                    <div style={infoRowStyle}>
                      <div>
                        <strong>Total annulations tardives:</strong>{' '}
                        <span style={{ color: severity.color, fontWeight: 'bold' }}>
                          {alert.totalLateCancellations}
                        </span>
                      </div>
                      <div>
                        <strong>Date evenement:</strong>{' '}
                        {new Date(alert.event.date).toLocaleDateString('fr-FR', {
                          weekday: 'long',
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric'
                        })}
                      </div>
                      {alert.event.location?.city && (
                        <div>
                          <strong>Lieu:</strong> {alert.event.location.city}
                        </div>
                      )}
                    </div>

                    <div style={infoRowStyle}>
                      <div>
                        <strong>Desistement le:</strong>{' '}
                        {new Date(alert.cancellationDate).toLocaleDateString('fr-FR', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </div>
                      {alert.acknowledgedAt && (
                        <div style={{ color: '#28a745' }}>
                          <strong>Prise en compte:</strong>{' '}
                          {new Date(alert.acknowledgedAt).toLocaleDateString('fr-FR', {
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

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px', flexWrap: 'wrap', gap: '10px' }}>
                      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                        <button
                          onClick={() => navigate(`/profile/comedian/${alert.comedian._id}`)}
                          style={{
                            ...buttonStyle,
                            background: 'linear-gradient(to right, #17a2b8, #138496)',
                            padding: '8px 16px',
                            fontSize: '0.9em',
                          }}
                        >
                          Voir le profil
                        </button>
                        <button
                          onClick={() => navigate(`/events/${alert.event._id}`)}
                          style={{
                            ...buttonStyle,
                            background: 'linear-gradient(to right, #6f42c1, #5a32a3)',
                            padding: '8px 16px',
                            fontSize: '0.9em',
                          }}
                        >
                          Voir l'evenement
                        </button>
                      </div>
                      {!alert.acknowledgedAt && (
                        <button
                          onClick={() => handleAcknowledge(alert._id)}
                          style={acknowledgeButtonStyle}
                        >
                          Marquer comme prise en compte
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
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

export default LateCancellationAlertsPage;
