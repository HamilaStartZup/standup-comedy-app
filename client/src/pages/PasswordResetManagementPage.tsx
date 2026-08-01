import { useState, useEffect, type CSSProperties } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import api from '../services/api';

interface PasswordResetRequest {
  id: string;
  userId: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    role: string;
  };
  email: string;
  requestedAt: string;
  expiresAt: string;
  requestedBy?: {
    firstName: string;
    lastName: string;
  };
  // Renseigné dès qu'un admin a envoyé le lien de réinitialisation (marqueur « traité »).
  completedBy?: {
    firstName: string;
    lastName: string;
  } | null;
  status: string;
}

function PasswordResetManagementPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState('');
  const [resettingUserId, setResettingUserId] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    if (user?.role !== 'SUPER_ADMIN') {
      navigate('/dashboard');
      return;
    }
  }, [user, navigate]);

  // Récupérer les demandes avec React Query
  const { data: requestsData, isLoading: loading, isError: isRequestsError, refetch: refetchRequests } = useQuery({
    queryKey: ['password-reset-requests'],
    queryFn: async () => {
      const response = await api.get('/auth/admin/password-reset-requests');
      return response.data;
    },
    enabled: !!user && user.role === 'SUPER_ADMIN',
  });

  const requests: PasswordResetRequest[] = requestsData?.requests || [];

  const handleSendResetLink = async (userId: string) => {
    setResettingUserId(userId);
    setError('');

    try {
      await api.post('/auth/admin/reset-password', { userId });
      setSuccessMessage('Lien de réinitialisation envoyé à l\'utilisateur !');
      // Invalider la query pour recharger les demandes
      queryClient.invalidateQueries({ queryKey: ['password-reset-requests'] });
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors de la réinitialisation');
    } finally {
      setResettingUserId(null);
    }
  };

  const mainContainerStyle: CSSProperties = {
    minHeight: '100vh',
    color: 'var(--ccc-text-primary)',
    padding: '20px',
    background: 'var(--ccc-bg-gradient)',
  };

  const cardStyle: CSSProperties = {
    backgroundColor: 'var(--ccc-bg-elevated)',
    border: '1px solid var(--ccc-border-subtle)',
    boxShadow: '0 4px 24px rgba(15, 23, 42, 0.08)',
    padding: '20px',
    borderRadius: '15px',
    marginBottom: '20px',
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
    margin: '5px',
  };

  if (user?.role !== 'SUPER_ADMIN') {
    return null;
  }

  return (
    <div style={mainContainerStyle}>
      <Navbar />
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        <h1 className="ccc-page-title" style={{ marginBottom: '30px', textAlign: 'center' }}>
          🔐 Gestion des Réinitialisations de Mot de Passe
        </h1>

        {successMessage && (
          <div style={{
            ...cardStyle,
            backgroundColor: 'rgba(40, 167, 69, 0.2)',
            border: '1px solid rgba(40, 167, 69, 0.4)',
            color: 'var(--ccc-success)',
            marginBottom: '20px',
          }}>
            ✅ {successMessage}
          </div>
        )}

        {error && (
          <div style={{
            ...cardStyle,
            backgroundColor: 'rgba(220, 53, 69, 0.2)',
            border: '1px solid rgba(220, 53, 69, 0.4)',
            color: 'var(--ccc-error)',
            marginBottom: '20px',
          }}>
            ⚠️ {error}
          </div>
        )}

        {loading ? (
          <div style={cardStyle}>
            <p>Chargement des demandes...</p>
          </div>
        ) : isRequestsError ? (
          <div style={{ ...cardStyle, textAlign: 'center' }}>
            <p style={{ color: 'var(--ccc-error)', marginBottom: 12 }}>Impossible de charger les demandes.</p>
            <button onClick={() => refetchRequests()} style={{ padding: '10px 20px', background: 'var(--ccc-accent-gradient)', color: 'var(--ccc-text-on-accent)', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>Réessayer</button>
          </div>
        ) : requests.length === 0 ? (
          <div style={cardStyle}>
            <p style={{ textAlign: 'center', fontSize: '1.2em' }}>
              Aucune demande de réinitialisation en attente
            </p>
          </div>
        ) : (
          <>
            <div style={cardStyle}>
              <h2 style={{ marginBottom: '15px' }}>
                📋 Demandes en attente ({requests.length})
              </h2>
              {requests.map((request) => (
                <div
                  key={request.id}
                  style={{
                    ...cardStyle,
                    marginBottom: '15px',
                    border: '2px solid var(--ccc-accent)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
                    <div>
                      <p style={{ fontSize: '1.1em', fontWeight: 'bold', marginBottom: '10px' }}>
                        👤 {request.userId?.firstName} {request.userId?.lastName}
                      </p>
                      <p style={{ color: 'var(--ccc-text-muted)', marginBottom: '5px' }}>
                        📧 {request.email}
                      </p>
                      <p style={{ color: 'var(--ccc-text-muted)', marginBottom: '5px' }}>
                        🎭 Rôle: {request.userId?.role}
                      </p>
                      <p style={{ color: 'var(--ccc-text-muted)', marginBottom: '5px' }}>
                        📅 Demandé le: {new Date(request.requestedAt).toLocaleString('fr-FR')}
                      </p>
                      <p style={{ color: 'var(--ccc-text-muted)' }}>
                        ⏰ Expire le: {new Date(request.expiresAt).toLocaleString('fr-FR')}
                      </p>
                    </div>
                    <div style={{ minWidth: '250px' }}>
                      {request.completedBy && (
                        <p style={{ color: 'var(--ccc-success, #16a34a)', fontSize: '0.9em', marginBottom: '8px' }}>
                          ✉️ Lien envoyé — en attente que l'utilisateur choisisse son mot de passe
                        </p>
                      )}
                      <button
                        onClick={() => handleSendResetLink(request.userId.id)}
                        style={buttonStyle}
                        disabled={resettingUserId === request.userId.id}
                      >
                        {resettingUserId === request.userId.id
                          ? 'Envoi...'
                          : request.completedBy
                            ? 'Renvoyer le lien'
                            : 'Envoyer un lien de réinitialisation'}
                      </button>
                      {request.completedBy && (
                        <p style={{ color: 'var(--ccc-text-muted)', fontSize: '0.8em', marginTop: '6px' }}>
                          Un renvoi invalide le lien précédent.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default PasswordResetManagementPage;

