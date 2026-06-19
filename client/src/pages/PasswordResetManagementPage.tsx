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
  status: string;
}

function PasswordResetManagementPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [resetting, setResetting] = useState(false);
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

  const handleResetPassword = async (userId: string) => {
    if (!newPassword || newPassword.length < 8) {
      setError('Le mot de passe doit contenir au moins 8 caractères');
      return;
    }

    setResetting(true);
    setError('');

    try {
      await api.post('/auth/admin/reset-password', {
        userId,
        newPassword
      });
      setSuccessMessage('Mot de passe réinitialisé avec succès !');
      setSelectedUserId(null);
      setNewPassword('');
      // Invalider la query pour recharger les demandes
      queryClient.invalidateQueries({ queryKey: ['password-reset-requests'] });
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors de la réinitialisation');
    } finally {
      setResetting(false);
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

  const inputStyle: CSSProperties = {
    padding: '10px',
    borderRadius: '8px',
    border: '1px solid var(--ccc-border-medium)',
    backgroundColor: 'var(--ccc-bg-elevated)',
    color: 'var(--ccc-text-primary)',
    fontSize: '1em',
    width: '100%',
    marginBottom: '10px',
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
                      {selectedUserId === request.userId.id ? (
                        <div>
                          <input
                            type="password"
                            placeholder="Nouveau mot de passe (min 8 caractères)"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            style={inputStyle}
                            minLength={8}
                          />
                          <div style={{ display: 'flex', gap: '10px' }}>
                            <button
                              onClick={() => handleResetPassword(request.userId.id)}
                              style={buttonStyle}
                              disabled={resetting || newPassword.length < 8}
                            >
                              {resetting ? 'Réinitialisation...' : 'Confirmer'}
                            </button>
                            <button
                              onClick={() => {
                                setSelectedUserId(null);
                                setNewPassword('');
                              }}
                              style={{ ...buttonStyle, background: 'var(--ccc-btn-secondary-bg)', color: 'var(--ccc-text-secondary)' }}
                            >
                              Annuler
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => setSelectedUserId(request.userId.id)}
                          style={buttonStyle}
                        >
                          Réinitialiser le mot de passe
                        </button>
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

