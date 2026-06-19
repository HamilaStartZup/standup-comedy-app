import { useState, useEffect, type CSSProperties } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import api from '../services/api';

function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const navigate = useNavigate();
  
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [passwordValidation, setPasswordValidation] = useState({
    length: false,
    isValid: false
  });

  useEffect(() => {
    if (!token) {
      setError('Token de réinitialisation manquant');
    }
  }, [token]);

  const validatePassword = (pwd: string) => {
    const length = pwd.length >= 8;
    setPasswordValidation({
      length,
      isValid: length
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');

    if (!token) {
      setError('Token de réinitialisation manquant');
      return;
    }

    if (!passwordValidation.isValid) {
      setError('Le mot de passe doit contenir au moins 8 caractères');
      return;
    }

    if (password !== confirmPassword) {
      setError('Les mots de passe ne correspondent pas');
      return;
    }

    setLoading(true);

    try {
      await api.post('/auth/reset-password', { token, password });
      setMessage('Mot de passe réinitialisé avec succès ! Redirection...');
      setTimeout(() => {
        navigate('/login');
      }, 2000);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Une erreur est survenue');
    } finally {
      setLoading(false);
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
    width: 'calc(100% - 20px)',
    padding: '12px 10px',
    margin: '10px 0',
    borderRadius: '8px',
    border: '1px solid var(--ccc-border-medium)',
    backgroundColor: 'var(--ccc-bg-elevated)',
    color: 'var(--ccc-text-primary)',
    fontSize: '1em',
    outline: 'none',
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
    cursor: loading ? 'not-allowed' : 'pointer',
    opacity: loading ? 0.6 : 1,
  };

  const linkStyle: CSSProperties = {
    color: 'var(--ccc-accent)',
    textDecoration: 'none',
    fontWeight: 'bold',
  };

  if (!token) {
    return (
      <div style={pageStyle}>
        <div style={containerStyle}>
          <div style={{ fontSize: '3em', marginBottom: '20px' }}>❌</div>
          <h2>Token invalide</h2>
          <p style={{ color: 'var(--ccc-text-muted)', marginBottom: '20px' }}>
            Le lien de réinitialisation est invalide ou expiré.
          </p>
          <Link to="/forgot-password" style={linkStyle}>
            Demander un nouveau lien
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      <div style={containerStyle}>
        <div style={{ fontSize: '3em', marginBottom: '20px' }}>🔐</div>
        <h2>Réinitialiser votre mot de passe</h2>
        <p style={{ color: 'var(--ccc-text-muted)', marginBottom: '20px' }}>
          Entrez votre nouveau mot de passe
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column' }}>
          <input
            type="password"
            placeholder="Nouveau mot de passe"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              validatePassword(e.target.value);
            }}
            style={inputStyle}
            required
            disabled={loading}
          />

          <input
            type="password"
            placeholder="Confirmer le mot de passe"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            style={inputStyle}
            required
            disabled={loading}
          />

          {password && (
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

          {error && (
            <div style={{
              color: 'var(--ccc-error)',
              marginBottom: '10px',
              fontSize: '0.9em',
              padding: '10px',
              backgroundColor: 'rgba(220, 53, 69, 0.15)',
              borderRadius: '5px',
              border: '1px solid rgba(220, 53, 69, 0.4)',
            }}>
              ⚠️ {error}
            </div>
          )}

          {message && (
            <div style={{
              color: 'var(--ccc-success)',
              marginBottom: '10px',
              fontSize: '0.9em',
              padding: '10px',
              backgroundColor: 'rgba(40, 167, 69, 0.15)',
              borderRadius: '5px',
              border: '1px solid rgba(40, 167, 69, 0.4)',
            }}>
              ✅ {message}
            </div>
          )}

          <button type="submit" style={buttonStyle} disabled={loading || !passwordValidation.isValid}>
            {loading ? 'Réinitialisation...' : 'Réinitialiser le mot de passe'}
          </button>
        </form>

        <p>
          <Link to="/login" style={linkStyle}>Retour à la connexion</Link>
        </p>
      </div>
    </div>
  );
}

export default ResetPasswordPage;

