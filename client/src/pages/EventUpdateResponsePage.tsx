import { useState, type CSSProperties } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, XCircle, AlertCircle, ArrowRight } from 'lucide-react';
import api from '../services/api';

type Action = 'keep' | 'withdraw';

/**
 * Page de confirmation ouverte depuis le lien email « Rester inscrit / Me retirer »
 * (mise à jour d'évènement). Le retrait n'est appliqué qu'après un clic explicite qui
 * déclenche un POST : un prefetch GET du lien email (scanner de messagerie) n'a donc
 * aucun effet de bord. Style aligné sur ConfirmDialog / tokens --ccc de l'app.
 */
function EventUpdateResponsePage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const action = searchParams.get('action') as Action | null;

  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<'withdrawn' | 'kept' | null>(null);
  const [error, setError] = useState('');

  const isWithdraw = action === 'withdraw';
  const isKeep = action === 'keep';
  const validRequest = !!token && (isWithdraw || isKeep);

  const handleConfirm = async () => {
    setError('');
    setLoading(true);
    try {
      const response = await api.post('/applications/respond-update', { token, action });
      setDone(response.data?.status === 'withdrawn' ? 'withdrawn' : 'kept');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Ce lien est invalide ou expiré.');
    } finally {
      setLoading(false);
    }
  };

  const pageStyle: CSSProperties = {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100vh',
    background: 'var(--ccc-bg-gradient)',
    color: 'var(--ccc-text-primary)',
    fontFamily: 'inherit',
    padding: '20px',
  };

  const cardStyle: CSSProperties = {
    backgroundColor: 'var(--ccc-bg-elevated)',
    border: '1px solid var(--ccc-border-subtle)',
    borderRadius: '16px',
    padding: '32px',
    boxShadow: 'var(--ccc-shadow-sm)',
    maxWidth: '440px',
    width: '100%',
    textAlign: 'center',
  };

  const iconBadgeStyle = (tone: 'accent' | 'danger' | 'success' | 'muted'): CSSProperties => {
    const map = {
      accent: { bg: 'var(--ccc-accent-soft)', fg: 'var(--ccc-accent)' },
      danger: { bg: 'rgba(239, 68, 68, 0.12)', fg: 'var(--ccc-error)' },
      success: { bg: 'rgba(16, 185, 129, 0.12)', fg: 'var(--ccc-success)' },
      muted: { bg: 'var(--ccc-bg-surface)', fg: 'var(--ccc-text-muted)' },
    }[tone];
    return {
      width: '64px',
      height: '64px',
      borderRadius: '50%',
      background: map.bg,
      color: map.fg,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      margin: '0 auto 20px',
    };
  };

  const titleStyle: CSSProperties = {
    fontSize: '20px',
    fontWeight: 700,
    color: 'var(--ccc-text-primary)',
    margin: '0 0 8px',
  };

  const messageStyle: CSSProperties = {
    fontSize: '15px',
    lineHeight: 1.6,
    color: 'var(--ccc-text-secondary)',
    margin: '0 0 24px',
  };

  const baseButtonStyle: CSSProperties = {
    width: '100%',
    padding: '13px 20px',
    borderRadius: '10px',
    border: 'none',
    fontSize: '15px',
    fontWeight: 600,
    cursor: loading ? 'not-allowed' : 'pointer',
    transition: 'all 0.2s ease',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    textDecoration: 'none',
    boxSizing: 'border-box',
  };

  const primaryButtonStyle: CSSProperties = {
    ...baseButtonStyle,
    background: isWithdraw ? 'var(--ccc-error)' : 'var(--ccc-accent)',
    color: 'var(--ccc-text-on-accent)',
    opacity: loading ? 0.7 : 1,
  };

  const secondaryButtonStyle: CSSProperties = {
    ...baseButtonStyle,
    background: 'var(--ccc-bg-surface)',
    color: 'var(--ccc-text-primary)',
    border: '1px solid var(--ccc-border-medium)',
    marginTop: '10px',
  };

  const errorBoxStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    justifyContent: 'center',
    color: 'var(--ccc-error)',
    fontSize: '14px',
    padding: '12px',
    marginBottom: '16px',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderRadius: '10px',
    border: '1px solid rgba(239, 68, 68, 0.3)',
  };

  if (!validRequest) {
    return (
      <div style={pageStyle}>
        <div style={cardStyle}>
          <div style={iconBadgeStyle('muted')}><XCircle size={32} /></div>
          <h1 style={titleStyle}>Lien invalide</h1>
          <p style={messageStyle}>Ce lien de réponse est invalide ou incomplet.</p>
          <Link to="/applications" style={primaryButtonStyle}>
            Voir mes candidatures <ArrowRight size={18} />
          </Link>
        </div>
      </div>
    );
  }

  if (done) {
    const withdrawn = done === 'withdrawn';
    return (
      <div style={pageStyle}>
        <div style={cardStyle}>
          <div style={iconBadgeStyle(withdrawn ? 'danger' : 'success')}>
            {withdrawn ? <AlertTriangle size={32} /> : <CheckCircle2 size={32} />}
          </div>
          <h1 style={titleStyle}>{withdrawn ? 'Vous vous êtes retiré' : 'Vous restez inscrit'}</h1>
          <p style={messageStyle}>
            {withdrawn
              ? 'Votre retrait de cet évènement a bien été enregistré.'
              : 'Votre participation à cet évènement est confirmée.'}
          </p>
          <Link to="/applications" style={primaryButtonStyle}>
            Voir mes candidatures <ArrowRight size={18} />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <div style={iconBadgeStyle(isWithdraw ? 'danger' : 'accent')}>
          {isWithdraw ? <AlertTriangle size={32} /> : <CheckCircle2 size={32} />}
        </div>
        <h1 style={titleStyle}>{isWithdraw ? 'Confirmer votre retrait' : 'Confirmer votre participation'}</h1>
        <p style={messageStyle}>
          {isWithdraw
            ? 'Voulez-vous vraiment vous retirer de cet évènement ? Cette action est définitive : vous ne pourrez pas vous réinscrire.'
            : 'Confirmez que vous souhaitez rester inscrit à cet évènement mis à jour.'}
        </p>

        {error && (
          <div style={errorBoxStyle}>
            <AlertCircle size={18} /> {error}
          </div>
        )}

        <button type="button" style={primaryButtonStyle} disabled={loading} onClick={handleConfirm}>
          {loading ? 'Traitement…' : isWithdraw ? 'Oui, me retirer' : 'Oui, rester inscrit'}
        </button>
        <Link to="/applications" style={secondaryButtonStyle}>Annuler</Link>
      </div>
    </div>
  );
}

export default EventUpdateResponsePage;
