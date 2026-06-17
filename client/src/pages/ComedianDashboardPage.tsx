import { type CSSProperties, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { useAuth } from '../hooks/useAuth';
import { useAlert } from '../hooks/useAlert';
import api from '../services/api';
import { useQuery } from '@tanstack/react-query';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { pageTitleStyle } from '../styles/theme';
import LoadingSpinner from '../components/ui/LoadingSpinner';

function ComedianDashboardPage() {
  const { user } = useAuth();
  const { showInfo } = useAlert();
  const location = useLocation();
  const navigate = useNavigate();

  // Afficher un message simple selon ?update=kept|withdrawn
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const update = params.get('update');
    if (update === 'kept') {
      showInfo("Confirmation prise en compte: vous restez inscrit à l'évènement.");
    } else if (update === 'withdrawn') {
      showInfo("Désinscription confirmée: votre candidature a été retirée.");
    }
  }, [location.search, showInfo]);

  // Récupère les candidatures de l'humoriste (auth via cookie HttpOnly)
  const { data: applications, isLoading, isError, refetch } = useQuery({
    queryKey: ['comedianApplications', user?._id],
    queryFn: async () => {
      if (!user?._id) return [];
      const res = await api.get('/applications?comedianId=' + user._id);
      const list = Array.isArray(res.data) ? res.data : (Array.isArray((res.data as any)?.applications) ? (res.data as any).applications : []);
      return list;
    },
    enabled: !!user?._id,
    staleTime: 0,
    gcTime: 10 * 60 * 1000,
  });

  // Calcule le nombre de candidatures acceptées dynamiquement
  const acceptedCount = applications ? applications.filter((app: any) => app.status === 'ACCEPTED').length : 0;
  const sentCount = applications ? applications.length : 0;

  // Calcule le nombre d'évènements acceptés à venir (date >= aujourd'hui 00:00)
  const todayMidnight = (() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  })();
  const upcomingCount = applications ? applications.filter((app: any) => {
    if (app.status !== 'ACCEPTED' || !app.event?.date) return false;
    const eventDate = new Date(app.event.date);
    return eventDate >= todayMidnight;
  }).length : 0;

  // Données pour le camembert
  const refusedCount = applications ? applications.filter((app: any) => app.status === 'REJECTED').length : 0;
  const pendingCount = applications ? applications.filter((app: any) => app.status === 'PENDING').length : 0;
  const expiredCount = applications ? applications.filter((app: any) => app.status === 'EXPIRED').length : 0;
  const pieData = [
    { name: 'Acceptées', value: acceptedCount, color: 'var(--ccc-success)' },
    { name: 'Refusées', value: refusedCount, color: 'var(--ccc-error)' },
    { name: 'En cours', value: pendingCount, color: 'var(--ccc-warning)' },
    { name: 'Expirées', value: expiredCount, color: '#6c757d' },
  ];

  const mainContainerStyle: CSSProperties = {
    minHeight: '100vh',
    color: 'var(--ccc-text-primary)',
    padding: '20px',
    background: 'var(--ccc-bg-gradient)',
  };

  const dashboardHeaderStyle: CSSProperties = {
    padding: '20px',
    maxWidth: '1200px',
    margin: '0 auto',
  };

  const titleStyle: CSSProperties = {
    ...pageTitleStyle,
    marginBottom: '20px',
  };

  const tabNavigationStyle: CSSProperties = {
    display: 'flex',
    marginBottom: '30px',
    borderBottom: '1px solid var(--ccc-border-medium)',
  };

  const tabButtonStyle: CSSProperties = {
    padding: '10px 20px',
    cursor: 'pointer',
    backgroundColor: 'transparent',
    border: 'none',
    color: 'var(--ccc-text-muted)',
    fontSize: '1.1em',
    fontWeight: 'bold',
  };

  const activeTabButtonStyle: CSSProperties = {
    ...tabButtonStyle,
    color: 'var(--ccc-accent)',
    borderBottom: '2px solid var(--ccc-accent)',
  };

  const cardsGridStyle: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: '20px',
    maxWidth: '1200px',
    margin: '0 auto',
    paddingBottom: '20px',
  };

  const cardStyle: CSSProperties = {
    backgroundColor: 'var(--ccc-bg-elevated)',
    border: '1px solid var(--ccc-border-subtle)',
    boxShadow: '0 4px 24px rgba(15, 23, 42, 0.08)',
    borderRadius: '12px',
    padding: '28px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    textAlign: 'center',
    gap: '12px',
    minHeight: '180px',
  };

  const blinkingCardStyle: CSSProperties = {
    ...cardStyle,
    animation: 'greenBlink 2s infinite',
    cursor: 'pointer',
    transition: 'transform 0.2s ease',
  };

  const cardTitleStyle: CSSProperties = {
    fontSize: '1.4em',
    color: 'var(--ccc-text-primary)',
    fontWeight: 600,
    letterSpacing: '0.5px'
  };

  const cardValueStyle: CSSProperties = {
    fontSize: '3.2em',
    fontWeight: 'bold',
    color: '#ff4b2b',
    lineHeight: 1.1
  };

  if (!user) {
    return (
      <div style={mainContainerStyle}>
        <Navbar />
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: 'calc(100vh - 60px)'
        }}>
          <LoadingSpinner message="Chargement de votre profil..." />
        </div>
      </div>
    );
  }

  // Pendant le chargement, afficher un tiret plutôt qu'un 0 trompeur
  const displayCount = (count: number) => (isLoading ? '–' : count);

  return (
    <div style={mainContainerStyle}>
      <style>
        {`
          @keyframes greenBlink {
            0%, 50% {
              box-shadow: 0 8px 30px rgba(0, 0, 0, 0.5), 0 0 20px rgba(40, 167, 69, 0.6);
              border: 2px solid rgba(40, 167, 69, 0.3);
            }
            25%, 75% {
              box-shadow: 0 8px 30px rgba(0, 0, 0, 0.5), 0 0 30px rgba(40, 167, 69, 0.9);
              border: 2px solid rgba(40, 167, 69, 0.7);
            }
          }
          @media (prefers-reduced-motion: reduce) {
            .ccc-blink-card {
              animation: none !important;
              border: 2px solid rgba(40, 167, 69, 0.5) !important;
            }
          }
        `}
      </style>
      <Navbar />
      <div style={dashboardHeaderStyle}>
        <h1 style={titleStyle}>Tableau de bord de l'Humoriste</h1>

        <div style={tabNavigationStyle}>
          <button style={activeTabButtonStyle}>Vue d'ensemble</button>
          {/* Ajoutez d'autres onglets si nécessaire */}
        </div>

        {isError && (
          <div style={{ textAlign: 'center', padding: '40px 20px' }}>
            <p style={{ color: 'var(--ccc-text-secondary)', marginBottom: 16 }}>
              Impossible de charger vos candidatures.
            </p>
            <button
              onClick={() => refetch()}
              style={{
                padding: '10px 20px',
                borderRadius: 8,
                border: 'none',
                backgroundColor: 'var(--ccc-accent)',
                color: 'var(--ccc-text-on-accent)',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Réessayer
            </button>
          </div>
        )}
        {!isError && (
        <div style={cardsGridStyle}>
          {/* Carte: Évènements à venir (SWAPPED) - Avec effet clignotant vert */}
          <div
            className="ccc-blink-card"
            style={blinkingCardStyle}
            role="button"
            tabIndex={0}
            aria-label="Voir mes évènements à venir"
            onClick={() => navigate('/events?tab=accepted')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                navigate('/events?tab=accepted');
              }
            }}
            onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
            onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
          >
            <div>
              <p style={cardTitleStyle}>Évènements à venir</p>
              <p style={cardValueStyle}>{displayCount(upcomingCount)}</p>
            </div>
            <span style={{ fontSize: '2.6em', color: '#ff4b2b' }}>✨</span>
          </div>

          {/* Carte: Candidatures Acceptées */}
          <div style={cardStyle}>
            <div>
              <p style={cardTitleStyle}>Candidatures Acceptées</p>
              <p style={cardValueStyle}>{displayCount(acceptedCount)}</p>
            </div>
            <span style={{ fontSize: '2.6em', color: 'var(--ccc-success)' }}>✅</span>
          </div>

          {/* Carte: Mes Candidatures (SWAPPED) */}
          <div style={cardStyle}>
            <div>
              <p style={cardTitleStyle}>Mes Candidatures</p>
              <p style={cardValueStyle}>{displayCount(sentCount)}</p>
            </div>
            <span style={{ fontSize: '2.6em', color: 'var(--ccc-accent)' }}>📝</span>
          </div>
        </div>
        )}
        {/* Ajout du camembert */}
        {!isError && (
        <div style={{ maxWidth: 400, margin: '40px auto 0 auto', backgroundColor: 'var(--ccc-bg-elevated)', border: '1px solid var(--ccc-border-subtle)', boxShadow: '0 4px 24px rgba(15, 23, 42, 0.08)', borderRadius: 8, padding: 24 }}>
          <h2 style={{ color: 'var(--ccc-accent)', textAlign: 'center', marginBottom: 16 }}>Répartition des Candidatures</h2>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={pieData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={80}
                label={({ value, x, y, payload }) => {
                  if (value === 0) return null;
                  return (
                    <text
                      x={x}
                      y={y}
                      fill={payload.color}
                      fontSize="20px"
                      fontWeight="bold"
                      textAnchor="middle"
                      dominantBaseline="middle"
                    >
                      {value}
                    </text>
                  );
                }}
                labelLine={false}
              >
                {pieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
        )}
      </div>
    </div>
  );
}

export default ComedianDashboardPage; 