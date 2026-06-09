import { type CSSProperties, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Navbar from '../components/Navbar';
import { useAuth } from '../hooks/useAuth';
import { useAlert } from '../hooks/useAlert';
import { useUserEvents } from '../hooks/useUserEvents';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { getErrorMessage, WarningMessages } from '../services/systemMessages';
import { pageTitleStyle } from '../styles/theme';

interface EventStats {
  totalEvents: number;
  upcomingIncompleteEvents: number;
  fullEvents: number;
  cancelledEvents?: number;
  pendingApplications: number;
  acceptedApplications: number;
  rejectedApplications: number;
  organizerCount?: number;
  comedianCount?: number;
}

const Dashboard = () => {
  const { user } = useAuth();
  const { showSuccess, showError, showWarning } = useAlert();
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const navigate = useNavigate();
  const isSuperAdmin = (user as any)?.role === 'SUPER_ADMIN';

  // Préchauffe le cache des événements du mois courant + futurs pour un affichage instantané sur /calendar
  const startOfMonth = useMemo(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString(),
    []
  );
  useUserEvents({ dateFrom: startOfMonth });

  // Récupérer les statistiques avec React Query
  const { data: eventStats, isLoading: loading, error: statsError, refetch: refetchStats } = useQuery({
    queryKey: ['events', 'stats'],
    queryFn: async () => {
      // Auth is handled via HttpOnly cookie — no need to check localStorage
      const response = await api.get('/events/stats');
      return response.data as EventStats;
    },
    enabled: !!user,
  });

  const error = statsError ? (statsError as any).message || "Erreur lors du chargement des statistiques." : null;

  // Récupérer les demandes de réinitialisation de mot de passe avec React Query (Super Admin uniquement)
  const { data: passwordResetData } = useQuery({
    queryKey: ['password-reset-requests'],
    queryFn: async () => {
      const response = await api.get('/auth/admin/password-reset-requests');
      return response.data;
    },
    enabled: !!user && isSuperAdmin,
  });

  const passwordResetCount = passwordResetData?.count || 0;

  // Récupérer les alertes de présence avec React Query (Super Admin uniquement)
  const { data: presenceAlertsData } = useQuery({
    queryKey: ['presence-alerts'],
    queryFn: async () => {
      const response = await api.get('/presence-alerts');
      return response.data;
    },
    enabled: !!user && isSuperAdmin,
  });

  const presenceAlertsCount = presenceAlertsData?.count || 0;
  // Alertes non marquées : affichées dans "Notifications importantes" ; les marquées restent sur la page Alertes de Présence tant que score < 75%
  const presenceAlertsUnacknowledged = (presenceAlertsData?.alerts || []).filter((a: any) => !a.acknowledgedAt);
  const presenceAlertsUnacknowledgedCount = presenceAlertsUnacknowledged.length;

  // Récupérer les signalements d'humoristes avec React Query (Super Admin uniquement)
  const { data: comedianReportsData } = useQuery({
    queryKey: ['comedian-reports', 'pending'],
    queryFn: async () => {
      const response = await api.get('/comedian-reports?status=pending');
      return response.data;
    },
    enabled: !!user && isSuperAdmin,
  });

  const pendingReportsCount = comedianReportsData?.count || 0;
  const presenceAlerts = presenceAlertsData?.alerts || [];
  const comedianReports = comedianReportsData?.reports || [];

  // Recuperer les alertes d'annulations tardives avec React Query (Super Admin uniquement)
  const { data: lateCancellationAlertsData } = useQuery({
    queryKey: ['late-cancellation-alerts'],
    queryFn: async () => {
      const response = await api.get('/late-cancellation-alerts?isActive=true');
      return response.data;
    },
    enabled: !!user && isSuperAdmin,
  });

  const lateCancellationAlertsCount = lateCancellationAlertsData?.total || 0;
  const lateCancellationAlerts = lateCancellationAlertsData?.alerts || [];

  // Fonction pour traiter les évènements terminés (Super Admin uniquement)
  const handleProcessCompletedEvents = async () => {
    if (!user || (user as any)?.role !== 'SUPER_ADMIN') {
      showWarning(WarningMessages.ADMIN_ONLY);
      return;
    }

    setIsProcessing(true);
    try {
      const response = await api.post('/events/process-completed-events', {});

      const result = response.data;
      showSuccess(`Traitement terminé ! ${result.participationsAdded} participation(s) ajoutée(s).`);

      // Recharger les statistiques après traitement
      await refetchStats();
    } catch (error: any) {
      console.error('Erreur lors du traitement:', error.response?.status, error.response?.data);
      const serverError = error?.response?.data?.error;
      const msg = typeof serverError === 'string' ? serverError : getErrorMessage(error, 'Impossible de traiter les événements');
      showError(msg);
    } finally {
      setIsProcessing(false);
    }
  };

  // Styles de base pour le conteneur principal
  const mainContainerStyle: CSSProperties = {
    minHeight: '100vh',
    color: 'var(--ccc-text-primary)',
    padding: '20px',
    background: 'var(--ccc-bg-gradient)',
  };

  // Styles pour l'en-tête du tableau de bord
  const dashboardHeaderStyle: CSSProperties = {
    ...pageTitleStyle,
    textAlign: 'center',
    marginBottom: '40px',
  };

  const DASHBOARD_CARD_HEIGHT = '320px';

  // Styles pour la grille des cartes
  const cardsGridStyle: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
    gridAutoRows: DASHBOARD_CARD_HEIGHT,
    gap: '30px',
    maxWidth: '1400px',
    margin: '0 auto',
    alignItems: 'stretch',
  };

  // Style de base pour toutes les cartes
  const cardStyle: CSSProperties = {
    backgroundColor: 'var(--ccc-bg-elevated)',
    border: '1px solid var(--ccc-border-subtle)',
    boxShadow: '0 4px 24px rgba(15, 23, 42, 0.08)',
    borderRadius: '20px',
    padding: '30px',
    transition: 'all 0.3s ease',
    position: 'relative',
    overflow: 'hidden',
    height: DASHBOARD_CARD_HEIGHT,
    boxSizing: 'border-box',
  };

  const cardTitleStyle: CSSProperties = {
    fontSize: '1.1rem',
    color: 'var(--ccc-text-muted)',
    marginBottom: '10px',
    fontWeight: '500',
  };

  const cardValueStyle: CSSProperties = {
    fontSize: '2.5rem',
    fontWeight: 'bold',
    color: 'var(--ccc-text-primary)',
    marginBottom: '5px',
  };

  const cardIconStyle: CSSProperties = {
    fontSize: '3rem',
    opacity: 0.7,
  };

  const superAdminCardLayoutStyle: CSSProperties = {
    display: 'grid',
    gridTemplateRows: '1fr 1fr 1fr',
    textAlign: 'center',
    height: '100%',
    width: '100%',
    minHeight: 0,
  };

  const cardRowTopStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    padding: '0 4px',
    minHeight: 0,
    overflow: 'hidden',
  };

  const cardRowCenterStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    minHeight: 0,
    overflow: 'hidden',
  };

  const cardRowBottomStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'column',
    width: '100%',
    fontSize: '1rem',
    color: '#000000',
    textAlign: 'center',
    minHeight: 0,
    overflow: 'hidden',
  };

  const superAdminCardTitleStyle: CSSProperties = {
    fontSize: '1.3rem',
    color: '#000000',
    margin: 0,
    fontWeight: 600,
    letterSpacing: '0.5px',
    lineHeight: 1.3,
  };

  const superAdminCardValueStyle: CSSProperties = {
    fontSize: '3.2rem',
    fontWeight: 700,
    color: '#000000',
    margin: 0,
    lineHeight: 1,
  };

  const superAdminCardIconStyle: CSSProperties = {
    fontSize: '3.5rem',
    opacity: 0.85,
    alignSelf: 'center',
  };

  // Styles de cartes avec lueur/clignotement (vert/orange/rouge)
  const glowingCardGreenStyle: CSSProperties = {
    border: '1px solid rgba(34, 197, 94, 0.6)',
    boxShadow: '0 0 0 rgba(34, 197, 94, 0)',
    animation: 'glowGreen 1.8s ease-in-out infinite',
  };

  const glowingCardOrangeStyle: CSSProperties = {
    border: '1px solid rgba(245, 158, 11, 0.6)',
    boxShadow: '0 0 0 rgba(245, 158, 11, 0)',
    animation: 'glowOrange 1.8s ease-in-out infinite',
  };

  const glowingCardRedStyle: CSSProperties = {
    border: '1px solid rgba(239, 68, 68, 0.6)',
    boxShadow: '0 0 0 rgba(239, 68, 68, 0)',
    animation: 'glowRed 1.8s ease-in-out infinite',
  };

  const openExternalEvents = () => {
    window.location.href = 'standup-comedy-app.netlify.app/events';
  };

  const renderCard = (
    title: string,
    value: number,
    icon: string,
    options?: { style?: CSSProperties; onClick?: () => void; variant?: 'superAdmin' | 'default' }
  ) => {
    const isSuperAdminVariant = options?.variant === 'superAdmin';
    return (
      <div
        style={{
          ...cardStyle,
          ...(isSuperAdminVariant ? superAdminCardLayoutStyle : {}),
          ...(options?.style ?? {}),
          cursor: options?.onClick ? 'pointer' : 'default'
        }}
        onClick={options?.onClick}
      >
        {isSuperAdminVariant ? (
          <>
            <div style={cardRowTopStyle}>
              <p style={superAdminCardTitleStyle}>{title}</p>
            </div>
            <div style={cardRowCenterStyle}>
              <p style={superAdminCardValueStyle}>{value}</p>
            </div>
            <div style={cardRowBottomStyle}>
              <span style={superAdminCardIconStyle}>{icon}</span>
            </div>
          </>
        ) : (
          <>
            <p style={cardTitleStyle}>{title}</p>
            <p style={cardValueStyle}>{value}</p>
            <span style={cardIconStyle}>{icon}</span>
          </>
        )}
      </div>
    );
  };

  if (!user || loading) {
    return (
      <div style={mainContainerStyle}>
        <Navbar />
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: 'calc(100vh - 60px)' // Adjust based on navbar height
        }}>
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-red-500"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={mainContainerStyle}>
        <Navbar />
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: 'calc(100vh - 60px)',
          color: '#dc3545'
        }}>
          <p>Erreur lors du chargement des statistiques: {error}</p>
        </div>
      </div>
    );
  }

  // Calcul des statistiques des humoristes postulants
  const totalHumoristApplicants = (eventStats?.acceptedApplications || 0) + (eventStats?.rejectedApplications || 0);
  const acceptedPercentage = totalHumoristApplicants > 0 ? (((eventStats?.acceptedApplications || 0) / totalHumoristApplicants) * 100).toFixed(1) : 0;
  const rejectedPercentage = totalHumoristApplicants > 0 ? (((eventStats?.rejectedApplications || 0) / totalHumoristApplicants) * 100).toFixed(1) : 0;

  // Déterminer le titre selon le rôle de l'utilisateur
  const dashboardTitle = (user as any)?.role === 'SUPER_ADMIN' 
    ? 'Tableau de bord Super Administrateur' 
    : 'Tableau de bord de l\'organisateur';

  return (
    <>
      <div style={mainContainerStyle}>
      <Navbar />
      <div style={{ marginTop: '80px' }}>
        <h1 style={dashboardHeaderStyle}>{dashboardTitle}</h1>
        
        {/* Section Notifications pour Super Admin (uniquement alertes non marquées) */}
        {isSuperAdmin && (presenceAlertsUnacknowledgedCount > 0 || pendingReportsCount > 0) && (
          <div style={{
            maxWidth: '1200px',
            margin: '0 auto 30px auto',
            padding: '20px',
            backgroundColor: 'rgba(220, 53, 69, 0.15)',
            borderRadius: '12px',
            border: '2px solid rgba(220, 53, 69, 0.3)',
            boxShadow: '0 4px 12px rgba(220, 53, 69, 0.2)'
          }}>
            <h2 style={{
              color: '#7c3aed',
              fontSize: '1.5em',
              marginBottom: '20px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}>
              🔔 Notifications importantes
            </h2>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              {/* Notifications pour les alertes de présence (non marquées uniquement) */}
              {presenceAlertsUnacknowledgedCount > 0 && presenceAlertsUnacknowledged.slice(0, 3).map((alert: any) => (
                <div
                  key={alert._id}
                  onClick={() => navigate('/admin/presence-alerts')}
                  style={{
                    padding: '15px',
                    backgroundColor: 'rgba(0, 0, 0, 0.3)',
                    borderRadius: '8px',
                    border: '1px solid rgba(255, 193, 7, 0.3)',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '10px'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
                    e.currentTarget.style.transform = 'translateX(5px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.3)';
                    e.currentTarget.style.transform = 'translateX(0)';
                  }}
                >
                  <div style={{ flex: 1, minWidth: '250px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '5px' }}>
                      <span style={{ fontSize: '1.3em' }}>⚠️</span>
                      <strong style={{ color: '#ffc107', fontSize: '1.1em' }}>
                        Alerte de présence
                      </strong>
                    </div>
                    <p style={{ color: '#fff', margin: '5px 0', fontSize: '0.95em' }}>
                      <strong>{alert.comedian?.firstName} {alert.comedian?.lastName}</strong> a un score de présence de <strong style={{ color: '#ffc107' }}>{alert.presenceScore}%</strong>
                    </p>
                    <p style={{ color: '#aaa', fontSize: '0.85em', margin: 0 }}>
                      {alert.totalEvents} présences • {alert.absences} absences
                    </p>
                  </div>
                  <div style={{
                    padding: '8px 16px',
                    borderRadius: '6px',
                    backgroundColor: 'rgba(255, 193, 7, 0.2)',
                    color: '#ffc107',
                    fontWeight: 'bold',
                    fontSize: '0.9em',
                    whiteSpace: 'nowrap'
                  }}>
                    Vérifier →
                  </div>
                </div>
              ))}
              
              {/* Notifications pour les signalements */}
              {pendingReportsCount > 0 && comedianReports.slice(0, 3).map((report: any) => (
                <div
                  key={report._id}
                  onClick={() => navigate('/admin/comedian-reports')}
                  style={{
                    padding: '15px',
                    backgroundColor: 'rgba(0, 0, 0, 0.3)',
                    borderRadius: '8px',
                    border: '1px solid rgba(220, 53, 69, 0.3)',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '10px'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
                    e.currentTarget.style.transform = 'translateX(5px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.3)';
                    e.currentTarget.style.transform = 'translateX(0)';
                  }}
                >
                  <div style={{ flex: 1, minWidth: '250px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '5px' }}>
                      <span style={{ fontSize: '1.3em' }}>🚫</span>
                      <strong style={{ color: '#dc3545', fontSize: '1.1em' }}>
                        Compte signalé
                      </strong>
                    </div>
                    <p style={{ color: '#fff', margin: '5px 0', fontSize: '0.95em' }}>
                      <strong>{report.comedian?.firstName} {report.comedian?.lastName}</strong> signalé par <strong>{report.reporter?.firstName} {report.reporter?.lastName}</strong>
                    </p>
                    <p style={{ color: '#aaa', fontSize: '0.85em', margin: '5px 0' }}>
                      Raison: <strong style={{ color: '#ffc107' }}>
                        {report.reason === 'troll' ? 'Troll / Comportement inapproprié' :
                         report.reason === 'fake_account' ? 'Faux compte' :
                         report.reason === 'inappropriate_content' ? 'Contenu inapproprié' :
                         report.reason === 'spam' ? 'Spam / Publicité non autorisée' :
                         'Autre'}
                      </strong>
                    </p>
                    {report.description && (
                      <p style={{ color: '#aaa', fontSize: '0.85em', margin: '5px 0', fontStyle: 'italic' }}>
                        "{report.description.substring(0, 100)}{report.description.length > 100 ? '...' : ''}"
                      </p>
                    )}
                  </div>
                  <div style={{
                    padding: '8px 16px',
                    borderRadius: '6px',
                    backgroundColor: 'rgba(220, 53, 69, 0.2)',
                    color: '#dc3545',
                    fontWeight: 'bold',
                    fontSize: '0.9em',
                    whiteSpace: 'nowrap'
                  }}>
                    Examiner →
                  </div>
                </div>
              ))}
              
              {/* Lien vers toutes les notifications */}
              {(presenceAlertsUnacknowledgedCount > 3 || pendingReportsCount > 3) && (
                <div style={{
                  textAlign: 'center',
                  padding: '10px',
                  marginTop: '10px'
                }}>
                  <button
                    onClick={() => {
                      // Naviguer vers la page avec le plus de notifications
                      if (presenceAlertsUnacknowledgedCount >= pendingReportsCount) {
                        navigate('/admin/presence-alerts');
                      } else {
                        navigate('/admin/comedian-reports');
                      }
                    }}
                    style={{
                      padding: '10px 20px',
                      borderRadius: '8px',
                      border: '1px solid rgba(255, 255, 255, 0.3)',
                      background: 'rgba(124, 58, 237, 0.2)',
                      color: '#7c3aed',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      fontSize: '0.95em',
                      transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(124, 58, 237, 0.3)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(124, 58, 237, 0.2)';
                    }}
                  >
                    Voir toutes les notifications ({presenceAlertsUnacknowledgedCount + pendingReportsCount})
                  </button>
                </div>
              )}
              
              {/* Liens rapides vers les pages de gestion */}
              <div style={{
                display: 'flex',
                gap: '10px',
                marginTop: '15px',
                flexWrap: 'wrap'
              }}>
                {presenceAlertsUnacknowledgedCount > 0 && (
                  <button
                    onClick={() => navigate('/admin/presence-alerts')}
                    style={{
                      padding: '8px 16px',
                      borderRadius: '6px',
                      border: '1px solid rgba(255, 193, 7, 0.3)',
                      background: 'rgba(255, 193, 7, 0.1)',
                      color: '#ffc107',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      fontSize: '0.85em',
                      transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(255, 193, 7, 0.2)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(255, 193, 7, 0.1)';
                    }}
                  >
                    Voir toutes les alertes de présence ({presenceAlertsUnacknowledgedCount})
                  </button>
                )}
                {pendingReportsCount > 0 && (
                  <button
                    onClick={() => navigate('/admin/comedian-reports')}
                    style={{
                      padding: '8px 16px',
                      borderRadius: '6px',
                      border: '1px solid rgba(220, 53, 69, 0.3)',
                      background: 'rgba(220, 53, 69, 0.1)',
                      color: '#dc3545',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      fontSize: '0.85em',
                      transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(220, 53, 69, 0.2)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(220, 53, 69, 0.1)';
                    }}
                  >
                    Voir tous les signalements ({pendingReportsCount})
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
        
        <div style={cardsGridStyle}>
          {isSuperAdmin ? (
            <>
              {renderCard('Évènements complets', eventStats?.fullEvents || 0, '✅', {
                style: glowingCardGreenStyle,
                variant: 'superAdmin',
                onClick: () => navigate('/events?tab=full')
              })}
              {renderCard('Prochains évènements (non complets)', eventStats?.upcomingIncompleteEvents || 0, '✨', {
                style: glowingCardRedStyle,
                variant: 'superAdmin',
                onClick: () => navigate('/events?tab=upcoming')
              })}
              {renderCard('Évènements annulés', eventStats?.cancelledEvents || 0, '🛑', {
                style: glowingCardOrangeStyle,
                variant: 'superAdmin',
                onClick: () => navigate('/events?tab=cancelled')
              })}
              {renderCard('Évènements créés', eventStats?.totalEvents || 0, '🎪', {
                variant: 'superAdmin',
                onClick: () => navigate('/events')
              })}
              {renderCard("Nombre d'organisateurs", eventStats?.organizerCount || 0, '🏢', {
                variant: 'superAdmin'
              })}
              {renderCard("Nombre d'humoristes", eventStats?.comedianCount || 0, '🎤', {
                variant: 'superAdmin'
              })}
              {renderCard('Réinitialisations en attente', passwordResetCount, '🔐', {
                style: passwordResetCount > 0 ? glowingCardOrangeStyle : {},
                variant: 'superAdmin',
                onClick: () => navigate('/admin/password-resets')
              })}
              {renderCard('Alertes présence (< 75%)', presenceAlertsCount, '⚠️', {
                style: presenceAlertsCount > 0 ? glowingCardOrangeStyle : {},
                variant: 'superAdmin',
                onClick: () => navigate('/admin/presence-alerts')
              })}
              {renderCard('Signalements humoristes', pendingReportsCount, '🚫', {
                style: pendingReportsCount > 0 ? glowingCardOrangeStyle : {},
                variant: 'superAdmin',
                onClick: () => navigate('/admin/comedian-reports')
              })}
              {renderCard('Annulations tardives', lateCancellationAlertsCount, '⏰', {
                style: lateCancellationAlertsCount > 0 ? glowingCardOrangeStyle : {},
                variant: 'superAdmin',
                onClick: () => navigate('/admin/late-cancellations')
              })}
            </>
          ) : (
            <>
              {renderCard('Évènements complets', eventStats?.fullEvents || 0, '✅', {
                style: glowingCardGreenStyle,
                variant: 'superAdmin',
                onClick: () => navigate('/events?tab=full')
              })}
              {renderCard('Candidatures en attente', eventStats?.pendingApplications || 0, '⏳', {
                style: glowingCardOrangeStyle,
                variant: 'superAdmin',
                onClick: () => navigate('/applications?status=PENDING')
              })}
              {renderCard('Prochains évènements (non complets)', eventStats?.upcomingIncompleteEvents || 0, '✨', {
                style: glowingCardRedStyle,
                variant: 'superAdmin',
                onClick: () => navigate('/events?tab=upcoming')
              })}
              <div 
                style={{ 
                  ...cardStyle,
                  ...superAdminCardLayoutStyle,
                  cursor: 'pointer'
                }} 
                onClick={() => navigate('/applications')}
              >
                <div style={cardRowTopStyle}>
                  <p style={superAdminCardTitleStyle}>Humoristes postulants</p>
                </div>
                <div style={cardRowCenterStyle}>
                  <p style={superAdminCardValueStyle}>{totalHumoristApplicants}</p>
                </div>
                <div style={cardRowBottomStyle}>
                  <div>✅ Acceptées: {eventStats?.acceptedApplications || 0} ({acceptedPercentage}%)</div>
                  <div>❌ Refusées: {eventStats?.rejectedApplications || 0} ({rejectedPercentage}%)</div>
                </div>
              </div>
              {renderCard('Évènements créés', eventStats?.totalEvents || 0, '🎪', {
                variant: 'superAdmin',
                onClick: () => navigate('/events')
              })}
              {renderCard('Évènements annulés', eventStats?.cancelledEvents || 0, '🛑', {
                variant: 'superAdmin',
                onClick: () => navigate('/events?tab=cancelled')
              })}
              {/* Card Salles — ORGANIZER uniquement */}
              <div
                style={{
                  ...cardStyle,
                  ...superAdminCardLayoutStyle,
                  cursor: 'pointer',
                  background: 'linear-gradient(135deg, rgba(124, 58, 237,0.15), rgba(255,75,43,0.1))',
                  border: '1px solid rgba(124, 58, 237,0.3)',
                }}
                onClick={() => navigate('/my-venues')}
              >
                <div style={cardRowTopStyle}>
                  <p style={superAdminCardTitleStyle}>Mes salles</p>
                </div>
                <div style={cardRowCenterStyle}>
                  <p style={{ ...superAdminCardValueStyle, fontSize: '1.1rem' }}>
                    Louer & gérer
                  </p>
                </div>
                <div style={cardRowBottomStyle}>
                  <p style={{ fontSize: '0.85rem', color: '#333333', lineHeight: 1.4, textAlign: 'center', margin: '0 0 8px' }}>
                    Mettez vos salles en location et gérez les demandes de réservation.
                  </p>
                  <span style={superAdminCardIconStyle}>🏢</span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Carte de traitement automatique pour Super Admin uniquement */}
        {(user as any)?.role === 'SUPER_ADMIN' && (
            <div style={{
              ...cardStyle,
              background: 'linear-gradient(135deg, rgba(147, 51, 234, 0.2), rgba(219, 39, 119, 0.2))',
              border: '1px solid rgba(147, 51, 234, 0.3)',
              textAlign: 'center',
              cursor: 'pointer'
            }}>
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '15px'
              }}>
                <span style={{
                  fontSize: '3rem',
                  opacity: 0.8,
                  animation: isProcessing ? 'spin 1s linear infinite' : 'none'
                }}>
                  🔄
                </span>
                <div>
                  <p style={{
                    fontSize: '1.2rem',
                    fontWeight: 'bold',
                    color: '#ffffff',
                    marginBottom: '10px'
                  }}>
                    Traitement automatique
                  </p>
                  <p style={{
                    fontSize: '0.9rem',
                    color: '#B0B0B0',
                    marginBottom: '20px',
                    lineHeight: 1.4
                  }}>
                    Mettre à jour les participations pour les évènements terminés
                  </p>
                </div>
                <button
                  onClick={handleProcessCompletedEvents}
                  disabled={isProcessing}
                  style={{
                    padding: '12px 24px',
                    background: isProcessing 
                      ? 'linear-gradient(135deg, #6b7280, #9ca3af)' 
                      : 'linear-gradient(135deg, #8b5cf6, #ec4899)',
                    border: 'none',
                    borderRadius: '10px',
                    color: '#ffffff',
                    fontWeight: 'bold',
                    fontSize: '0.9rem',
                    cursor: isProcessing ? 'not-allowed' : 'pointer',
                    transition: 'all 0.3s ease',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  <span style={{
                    fontSize: '1rem',
                    animation: isProcessing ? 'spin 1s linear infinite' : 'none'
                  }}>
                    🔄
                  </span>
                  {isProcessing ? 'Traitement...' : 'Traiter les évènements'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <style>
        {`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
          @keyframes glowGreen {
            0%, 100% { box-shadow: 0 0 0 rgba(34, 197, 94, 0); }
            50% { box-shadow: 0 0 24px 6px rgba(34, 197, 94, 0.5); }
          }
          @keyframes glowOrange {
            0%, 100% { box-shadow: 0 0 0 rgba(245, 158, 11, 0); }
            50% { box-shadow: 0 0 24px 6px rgba(245, 158, 11, 0.5); }
          }
          @keyframes glowRed {
            0%, 100% { box-shadow: 0 0 0 rgba(239, 68, 68, 0); }
            50% { box-shadow: 0 0 24px 6px rgba(239, 68, 68, 0.5); }
          }
        `}
      </style>
    </>
  );
};

export default Dashboard; 