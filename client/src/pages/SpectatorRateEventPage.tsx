import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { useAuth } from '../hooks/useAuth';
import { useAlert } from '../hooks/useAlert';
import api from '../services/api';

function StarRating({
  value,
  onChange,
  disabled,
  variant = 'dark',
}: {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  /** 'dark' = empty star light (sur fond sombre), 'light' = empty star gris (sur fond blanc) */
  variant?: 'dark' | 'light';
}) {
  const emptyColor = variant === 'light' ? 'var(--ccc-text-faint)' : 'rgba(255,255,255,0.35)';
  const filledColor = '#FFD700';
  return (
    <span style={{ display: 'inline-flex', gap: 2 }}>
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={disabled}
          onClick={() => onChange(star)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') onChange(star);
          }}
          style={{
            background: 'none',
            border: 'none',
            padding: 4,
            minWidth: 44,
            minHeight: 44,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: disabled ? 'default' : 'pointer',
            fontSize: '1.5rem',
            lineHeight: 1,
          }}
          aria-label={`${star} étoile${star > 1 ? 's' : ''}`}
        >
          <span style={{ color: value >= star ? filledColor : emptyColor }}>★</span>
        </button>
      ))}
    </span>
  );
}

interface Participant {
  _id: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string | null;
}

interface RatingFormData {
  event: { _id: string; title: string; date: string };
  participants: Participant[];
  existingRating: {
    eventRating: number;
    comedianRatings: { comedianId: string; rating: number }[];
  } | null;
}

export default function SpectatorRateEventPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showSuccess, showError } = useAlert();
  const [data, setData] = useState<RatingFormData | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [eventRating, setEventRating] = useState(0);
  const [comedianRatings, setComedianRatings] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!eventId || !user) {
      setLoading(false);
      return;
    }
    api
      .get(`/events/${eventId}/rating-form`)
      .then((res) => {
        const d = res.data as RatingFormData;
        setData(d);
        if (d.existingRating) {
          setEventRating(d.existingRating.eventRating);
          const map: Record<string, number> = {};
          (d.existingRating.comedianRatings || []).forEach((r) => {
            map[r.comedianId] = r.rating;
          });
          setComedianRatings(map);
        }
      })
      .catch((err) => {
        const msg = err?.response?.data?.message || 'Impossible de charger le formulaire';
        showError(msg);
        if (err?.response?.status === 403 || err?.response?.status === 404) {
          setTimeout(() => navigate('/spectateur/events'), 1500);
        }
      })
      .finally(() => setLoading(false));
  }, [eventId, user, navigate, showError]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventId || !data) return;
    if (eventRating < 1 || eventRating > 5) {
      showError('Veuillez noter l\'événement (1 à 5 étoiles).');
      return;
    }
    setSubmitting(true);
    const payload = {
      eventRating,
      comedianRatings: data.participants.map((p) => ({
        comedianId: p._id,
        rating: comedianRatings[p._id] || 0,
      })).filter((r) => r.rating >= 1 && r.rating <= 5),
    };
    api
      .post(`/events/${eventId}/ratings`, payload)
      .then(() => {
        showSuccess('Merci, votre notation a bien été enregistrée.');
        navigate('/spectateur/events');
      })
      .catch((err) => {
        showError(err?.response?.data?.message || 'Erreur lors de l\'enregistrement');
      })
      .finally(() => setSubmitting(false));
  };

  const pageStyle: React.CSSProperties = {
    minHeight: 'calc(100vh - 60px)',
    background: 'var(--ccc-bg-gradient)',
    color: 'var(--ccc-text-primary)',
    padding: '24px',
  };

  const containerStyle: React.CSSProperties = {
    maxWidth: 640,
    margin: '0 auto',
  };

  const cardStyle: React.CSSProperties = {
    background: 'var(--ccc-bg-elevated)',
    border: '1px solid var(--ccc-border-subtle)',
    boxShadow: '0 4px 24px rgba(15, 23, 42, 0.08)',
    borderRadius: 12,
    padding: 24,
    marginBottom: 20,
  };

  const titleStyle: React.CSSProperties = {
    marginBottom: 8,
    fontSize: '1.25rem',
    fontWeight: 600,
    color: 'var(--ccc-text-primary)',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    marginBottom: 8,
    fontSize: '0.95rem',
    color: 'var(--ccc-text-secondary)',
  };

  if (user?.role !== 'SPECTATOR') {
    return (
      <>
        <Navbar />
        <div style={pageStyle}>
          <div style={containerStyle}>
            <p style={{ color: 'var(--ccc-text-secondary)' }}>Réservé aux spectateurs.</p>
            <button type="button" onClick={() => navigate(-1)} style={{ marginTop: 16, padding: '8px 16px', borderRadius: 8 }}>
              Retour
            </button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Navbar />
      <div style={pageStyle}>
        <div style={containerStyle}>
          <button
            type="button"
            onClick={() => navigate('/spectateur/events')}
            style={{
              marginBottom: 24,
              padding: '8px 12px',
              background: 'var(--ccc-bg-elevated)',
              border: '1px solid var(--ccc-border-medium)',
              borderRadius: 8,
              color: 'var(--ccc-text-primary)',
              cursor: 'pointer',
              fontSize: '0.9rem',
            }}
          >
            ← Mes événements
          </button>

          {loading ? (
            <p style={{ color: 'var(--ccc-text-secondary)' }}>Chargement…</p>
          ) : !data ? (
            <p style={{ color: 'var(--ccc-text-secondary)' }}>Événement non disponible.</p>
          ) : (
            <form onSubmit={handleSubmit}>
              <h1 className="ccc-page-title" style={{ marginBottom: 24 }}>Noter l&apos;événement</h1>

              <div style={cardStyle}>
                <h2 style={{ ...titleStyle, color: '#FFD700' }}>{data.event.title}</h2>
                <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--ccc-text-muted)' }}>
                  {new Date(data.event.date).toLocaleDateString('fr-FR', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                </p>
              </div>

              <div style={cardStyle}>
                <h2 style={titleStyle}>Note globale de l&apos;événement</h2>
                <label style={labelStyle}>Donnez une note de 1 à 5 étoiles</label>
                <StarRating value={eventRating} onChange={setEventRating} disabled={submitting} />
              </div>

              <div style={cardStyle}>
                <h2 style={titleStyle}>
                  {data.participants.length === 1
                    ? 'Noter l\'humoriste'
                    : 'Noter les humoristes'}
                </h2>
                {data.participants.length > 0 ? (
                  <>
                    <p style={{ marginBottom: 16, fontSize: '0.9rem', color: 'var(--ccc-text-secondary)' }}>
                      Donnez une note de 1 à 5 étoiles à chaque humoriste.
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {data.participants.map((p) => (
                        <div
                          key={p._id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 16,
                            padding: 16,
                            background: 'var(--ccc-bg-elevated)',
                            borderRadius: 12,
                            border: '1px solid var(--ccc-border-medium)',
                          }}
                        >
                          <div
                            style={{
                              width: 56,
                              height: 56,
                              borderRadius: '50%',
                              flexShrink: 0,
                              backgroundImage: p.avatarUrl ? `url(${p.avatarUrl})` : undefined,
                              backgroundSize: p.avatarUrl ? 'cover' : undefined,
                              backgroundPosition: p.avatarUrl ? 'center' : undefined,
                              background: !p.avatarUrl ? 'linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%)' : undefined,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: '#fff',
                              fontWeight: 700,
                              fontSize: '1.1rem',
                            }}
                          >
                            {!p.avatarUrl && (
                              `${(p.firstName || '')[0] || ''}${(p.lastName || '')[0] || ''}`.toUpperCase() || '—'
                            )}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--ccc-text-primary)' }}>
                              {p.firstName} {p.lastName}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--ccc-text-muted)', marginTop: 2 }}>
                              HUMORISTE
                            </div>
                          </div>
                          <div style={{ flexShrink: 0 }}>
                            <StarRating
                              value={comedianRatings[p._id] || 0}
                              onChange={(v) => setComedianRatings((prev) => ({ ...prev, [p._id]: v }))}
                              disabled={submitting}
                              variant="light"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--ccc-text-muted)' }}>
                    Aucun humoriste n&apos;a été enregistré comme participant à cet événement. Vous pouvez enregistrer uniquement la note globale de l&apos;événement ci-dessus.
                  </p>
                )}
              </div>

              <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
                <button
                  type="submit"
                  disabled={submitting || eventRating < 1}
                  style={{
                    padding: '12px 24px',
                    borderRadius: 8,
                    border: 'none',
                    background: eventRating >= 1 ? '#FFD700' : 'rgba(255,215,0,0.4)',
                    color: 'var(--ccc-text-primary)',
                    fontWeight: 600,
                    cursor: submitting || eventRating < 1 ? 'not-allowed' : 'pointer',
                    fontSize: '1rem',
                  }}
                >
                  {submitting ? 'Envoi…' : 'Enregistrer ma notation'}
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/spectateur/events')}
                  style={{
                    padding: '12px 24px',
                    borderRadius: 8,
                    border: '1px solid var(--ccc-border-medium)',
                    background: 'var(--ccc-bg-elevated)',
                    color: 'var(--ccc-text-primary)',
                    cursor: 'pointer',
                    fontSize: '1rem',
                  }}
                >
                  Annuler
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </>
  );
}
