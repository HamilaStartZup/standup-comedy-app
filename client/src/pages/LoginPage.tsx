import { useState, useEffect, type CSSProperties } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { translateOAuthError } from '../services/oauth';
import { useAlert } from '../contexts/AlertContext';

interface PendingDeletionInfo {
  deactivatedAt: string;
  daysRemaining: number;
  deletionDate: string;
}

function LoginPage() {
  const { loginMutation, loginWithKeycloak, isOAuthEnabled, isOAuthLoading } = useAuth();
  const { showError } = useAlert();

  const [loginData, setLoginData] = useState({
    email: '',
    password: '',
  });
  const [passwordError, setPasswordError] = useState('');
  const [passwordValidation, setPasswordValidation] = useState({
    length: false,
    isValid: false
  });

  // États pour la réactivation de compte
  const [pendingDeletion, setPendingDeletion] = useState<PendingDeletionInfo | null>(null);
  const [isReactivating, setIsReactivating] = useState(false);
  const [reactivationSuccess, setReactivationSuccess] = useState(false);

  // Initialiser la validation au chargement
  useEffect(() => {
    validatePassword(loginData.password);
  }, []);

  const validatePassword = (password: string) => {
    const length = password.length >= 8;
    const isValid = length;

    setPasswordValidation({
      length,
      isValid
    });
  };

  const handleSubmitLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    setPendingDeletion(null);

    // Vérifier la validation du mot de passe
    if (!passwordValidation.isValid) {
      setPasswordError('Vous ne respectez pas les 8 caractères minimum !');
      return;
    }

    loginMutation.mutate(loginData, {
      onError: (error) => {
        const axiosError = error as {
          response?: {
            data?: {
              message?: string;
              code?: string;
              canReactivate?: boolean;
              deactivatedAt?: string;
              daysRemaining?: number;
              deletionDate?: string;
            }
          };
          message?: string
        };

        const responseData = axiosError?.response?.data;

        // Vérifier si c'est un compte en attente de suppression
        if (responseData?.code === 'ACCOUNT_PENDING_DELETION' && responseData?.canReactivate) {
          setPendingDeletion({
            deactivatedAt: responseData.deactivatedAt!,
            daysRemaining: responseData.daysRemaining!,
            deletionDate: responseData.deletionDate!
          });
          return;
        }

        const errorMessage = responseData?.message || axiosError?.message || 'Une erreur est survenue lors de la connexion';
        showError(errorMessage);

        // Vider seulement le mot de passe, garder l'email
        setLoginData(prev => ({
          ...prev,
          password: ''
        }));
      }
    });
  };

  const handleReactivateAccount = async () => {
    setIsReactivating(true);

    try {
      await api.post('/auth/reactivate', loginData);

      // Afficher le succès et rediriger vers le login
      setReactivationSuccess(true);

      // Rediriger vers la page de login après un court délai
      setTimeout(() => {
        setPendingDeletion(null);
        setReactivationSuccess(false);
        setLoginData(prev => ({ ...prev, password: '' }));
      }, 2000);
    } catch (error: any) {
      const errorMessage = error?.response?.data?.message || 'Erreur lors de la réactivation du compte';
      showError(errorMessage);
      setPendingDeletion(null);
    } finally {
      setIsReactivating(false);
    }
  };

  const handleCancelReactivation = () => {
    setPendingDeletion(null);
    setLoginData(prev => ({ ...prev, password: '' }));
  };

  const handleChangeLogin = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;

    // Validation en temps réel du mot de passe
    if (name === 'password') {
      validatePassword(value);
    }

    setLoginData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleKeycloakLogin = async (provider?: string) => {
    try {
      await loginWithKeycloak(provider);
    } catch (error: any) {
      const apiMessage = error?.response?.data?.message;
      showError(translateOAuthError(apiMessage || error.message));
    }
  };

  const pageStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100vh',
    background: 'var(--ccc-bg-gradient)',
    color: 'var(--ccc-text-primary)',
    fontFamily: 'Arial, sans-serif',
    textAlign: 'center',
  };

  const containerStyle: CSSProperties = {
    backgroundColor: 'var(--ccc-bg-elevated)',
    border: '1px solid var(--ccc-border-subtle)',
    padding: '40px',
    borderRadius: '15px',
    boxShadow: '0 4px 24px rgba(15, 23, 42, 0.08)',
    maxWidth: '400px',
    width: '90%',
  };

  const inputStyle: CSSProperties = {
    width: '100%',
    padding: '12px 10px',
    margin: '10px 0',
    borderRadius: '8px',
    border: '1px solid var(--ccc-border-medium)',
    backgroundColor: 'var(--ccc-bg-elevated)',
    color: 'var(--ccc-text-primary)',
    fontSize: '1em',
    outline: 'none',
    boxSizing: 'border-box',
  };

  const buttonStyle: CSSProperties = {
    width: '100%',
    padding: '15px',
    margin: '20px 0',
    borderRadius: '8px',
    border: 'none',
    background: 'var(--ccc-accent-gradient)',
    color: 'white',
    fontSize: '1.2em',
    fontWeight: 'bold',
    cursor: 'pointer',
    transition: 'background 0.3s ease',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  const linkStyle: CSSProperties = {
    color: 'var(--ccc-accent)',
    textDecoration: 'none',
    fontWeight: 'bold',
    marginTop: '10px',
  };

  const iconStyle: CSSProperties = {
    fontSize: '3em',
    marginBottom: '20px',
  };

  // Affichage du modal de réactivation
  if (pendingDeletion) {
    const deletionDate = new Date(pendingDeletion.deletionDate);

    return (
      <div style={pageStyle}>
        <div style={containerStyle}>
          <div style={iconStyle}>⚠️</div>
          <h2>Compte en cours de suppression</h2>

          <div style={{
            padding: '15px',
            borderRadius: '12px',
            background: 'rgba(255, 193, 7, 0.15)',
            border: '1px solid rgba(255, 193, 7, 0.4)',
            marginBottom: '20px',
            textAlign: 'left'
          }}>
            <p style={{ color: 'var(--ccc-warning)', fontWeight: 'bold', marginBottom: '10px' }}>
              Votre compte sera supprimé le :
            </p>
            <p style={{ color: 'var(--ccc-text-primary)', fontSize: '1.1em', fontWeight: 'bold', marginBottom: '10px' }}>
              {deletionDate.toLocaleDateString('fr-FR', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              })}
            </p>
            <p style={{ color: 'var(--ccc-text-muted)', fontSize: '0.9em' }}>
              Il vous reste <strong style={{ color: 'var(--ccc-text-primary)' }}>{pendingDeletion.daysRemaining} jour(s)</strong> pour récupérer votre compte.
            </p>
          </div>

          {reactivationSuccess ? (
            <div style={{
              padding: '15px',
              borderRadius: '12px',
              background: 'rgba(40, 167, 69, 0.15)',
              border: '1px solid rgba(40, 167, 69, 0.4)',
              marginBottom: '20px',
            }}>
              <p style={{ color: 'var(--ccc-success)', fontWeight: 'bold' }}>
                ✅ Compte réactivé avec succès !
              </p>
              <p style={{ color: 'var(--ccc-text-muted)', fontSize: '0.9em' }}>
                Vous pouvez maintenant vous connecter.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button
                onClick={handleReactivateAccount}
                disabled={isReactivating}
                style={{
                  ...buttonStyle,
                  margin: 0,
                  background: 'linear-gradient(135deg, var(--ccc-success), #20c997)',
                  opacity: isReactivating ? 0.7 : 1,
                  cursor: isReactivating ? 'not-allowed' : 'pointer',
                }}
              >
                {isReactivating ? 'Réactivation...' : '✅ Réactiver mon compte'}
              </button>

              <button
                onClick={handleCancelReactivation}
                disabled={isReactivating}
                style={{
                  ...buttonStyle,
                  margin: 0,
                  background: 'transparent',
                  border: '1px solid var(--ccc-border-medium)',
                  color: 'var(--ccc-text-muted)',
                }}
              >
                Annuler
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      <div style={containerStyle}>
        <div style={iconStyle}>🎤</div>
        <h2>Bon retour ! 👋</h2>
        <p>Connecte-toi pour accéder à ton tableau de bord</p>

        <form onSubmit={handleSubmitLogin} style={{ display: 'flex', flexDirection: 'column' }}>
          <input
            type="email"
            name="email"
            placeholder="Email"
            value={loginData.email}
            onChange={handleChangeLogin}
            style={inputStyle}
            required
          />
          <input
            type="password"
            name="password"
            placeholder="Mot de passe"
            value={loginData.password}
            onChange={handleChangeLogin}
            style={inputStyle}
            required
          />

          {/* Message d'erreur du mot de passe */}
          {passwordError && (
            <div style={{
              color: 'var(--ccc-error)',
              marginBottom: '10px',
              fontSize: '0.9em',
              textAlign: 'left',
              padding: '8px',
              backgroundColor: 'rgba(220, 53, 69, 0.1)',
              borderRadius: '5px',
              border: '1px solid rgba(220, 53, 69, 0.3)'
            }}>
              {passwordError}
            </div>
          )}

          {/* Indicateur de validation du mot de passe */}
          {loginData.password && (
            <div style={{
              marginBottom: '15px',
              padding: '8px',
              backgroundColor: 'var(--ccc-bg-surface)',
              borderRadius: '5px',
              fontSize: '0.8em',
              textAlign: 'left'
            }}>
              <div style={{
                color: passwordValidation.length ? 'var(--ccc-success)' : 'var(--ccc-error)',
                display: 'flex',
                alignItems: 'center',
                gap: '5px'
              }}>
                {passwordValidation.length ? '✓' : '✗'} Au moins 8 caractères
              </div>
            </div>
          )}
          <button type="submit" style={buttonStyle} disabled={loginMutation.isPending}>
            {loginMutation.isPending ? 'Connexion en cours...' : <>Se connecter <span style={{ marginLeft: '10px' }}>🚀</span></>}
          </button>
        </form>

        {/* Social Login Buttons (via Keycloak Identity Providers) */}
        {isOAuthEnabled && (
          <>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              margin: '25px 0 20px',
              gap: '15px',
            }}>
              <div style={{ flex: 1, height: '1px', background: 'linear-gradient(to right, transparent, var(--ccc-border-medium))' }} />
              <span style={{ color: 'var(--ccc-text-muted)', fontSize: '0.85em', whiteSpace: 'nowrap' }}>ou continuer avec</span>
              <div style={{ flex: 1, height: '1px', background: 'linear-gradient(to left, transparent, var(--ccc-border-medium))' }} />
            </div>

            {/* Bouton principal - Google */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '12px' }}>
              <button
                type="button"
                onClick={() => handleKeycloakLogin('google')}
                disabled={isOAuthLoading}
                style={{
                  width: '100%',
                  padding: '14px 20px',
                  borderRadius: '10px',
                  border: 'none',
                  backgroundColor: 'var(--ccc-bg-elevated)',
                  color: '#3c4043',
                  fontSize: '0.95em',
                  fontWeight: '600',
                  cursor: isOAuthLoading ? 'not-allowed' : 'pointer',
                  opacity: isOAuthLoading ? 0.7 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '12px',
                  transition: 'all 0.2s ease',
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
                }}
                onMouseEnter={(e) => {
                  if (!isOAuthLoading) {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.2)';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.15)';
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Continuer avec Google
              </button>

            </div>

            {/* Boutons secondaires - GitHub, Microsoft, Apple */}
            {/* <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
              ...
            </div> */}
          </>
        )}
        <p style={{ marginTop: '15px', marginBottom: '10px' }}>
          <Link
            to="/forgot-password"
            style={{ ...linkStyle, fontSize: '0.9em', display: 'block' }}
          >
            Mot de passe oublié ?
          </Link>
        </p>

        <p>Pas encore de compte ? <Link to="/#roles" style={linkStyle}>Inscris-toi</Link></p>
      </div>
    </div>
  );
}

export default LoginPage;
