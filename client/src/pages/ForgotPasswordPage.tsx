import { useState, type CSSProperties } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../services/api';

function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    try {
      const response = await api.post('/auth/forgot-password', { email });
      setMessage(response.data.message || 'Votre demande de réinitialisation a été enregistrée. Un administrateur va traiter votre demande sous peu.');
      setTimeout(() => {
        navigate('/login');
      }, 3000);
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
    width: '100%',
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
    transition: 'background 0.3s ease',
  };

  const linkStyle: CSSProperties = {
    color: 'var(--ccc-accent)',
    textDecoration: 'none',
    fontWeight: 'bold',
    marginTop: '10px',
  };

  return (
    <div style={pageStyle}>
      <div style={containerStyle}>
        <div style={{ fontSize: '3em', marginBottom: '20px' }}>🔐</div>
        <h2>Mot de passe oublié ?</h2>
        <p style={{ color: 'var(--ccc-text-muted)', marginBottom: '20px' }}>
          Entrez votre adresse email et nous vous enverrons un lien pour réinitialiser votre mot de passe.
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column' }}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={inputStyle}
            required
            disabled={loading}
          />

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

          <button type="submit" style={buttonStyle} disabled={loading}>
            {loading ? 'Envoi en cours...' : 'Envoyer le lien de réinitialisation'}
          </button>
        </form>

        <p>
          <Link to="/login" style={linkStyle}>Retour à la connexion</Link>
        </p>
      </div>
    </div>
  );
}

export default ForgotPasswordPage;

