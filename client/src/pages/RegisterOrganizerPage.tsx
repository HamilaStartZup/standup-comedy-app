import { useState, useEffect, type CSSProperties } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useAlert } from '../hooks/useAlert';
import { Link } from 'react-router-dom';
import { getSignupErrorMessage } from '../services/systemMessages';
import { loginWithKeycloak, translateOAuthError } from '../services/oauth';
import { warmupAuthServer } from '../services/authApi';
import { useRegisterSubmitGuard, SLOW_CONNECTION_MESSAGE } from '../hooks/useRegisterSubmitGuard';
import { useOAuthPendingRegistration } from '../hooks/useOAuthPendingRegistration';
import { isValidPhoneNumber, PHONE_VALIDATION_MESSAGE } from '../utils/phoneValidation';
import api from '../services/api';

function RegisterOrganizerPage() {
  const { registerMutation, isOAuthEnabled } = useAuth();
  const { showError } = useAlert();
  const { runSubmit, slowConnection, isLocked } = useRegisterSubmitGuard();

  useOAuthPendingRegistration('ORGANIZER', (pending) => {
    setPendingCode(pending.pendingCode);
    setOauthData((p) => ({
      ...p,
      firstName: pending.firstName || '',
      lastName: pending.lastName || '',
    }));
    setOauthModal(true);
  });

  const [oauthModal, setOauthModal] = useState(false);
  const [pendingCode, setPendingCode] = useState('');
  const [oauthData, setOauthData] = useState({ firstName: '', lastName: '', city: '' });
  const [oauthErrors, setOauthErrors] = useState<{ [key: string]: string }>({});
  const [oauthTerms, setOauthTerms] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);

  const [formData, setFormData] = useState({
    lastName: '',
    firstName: '',
    email: '',
    phone: '',
    city: '',
    password: '',
    confirmPassword: '',
  });
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [passwordValidation, setPasswordValidation] = useState({
    length: false,
    uppercase: false,
    number: false,
    isValid: false,
  });

  useEffect(() => {
    validatePassword(formData.password);
  }, []);

  const validateForm = () => {
    const newErrors: { [key: string]: string } = {};
    if (!formData.email.trim()) {
      newErrors.email = "L'email est requis";
    } else {
      const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
      if (!emailRegex.test(formData.email.trim())) newErrors.email = "Format d'email invalide";
    }
    if (!formData.phone.trim()) {
      newErrors.phone = "Le numéro de téléphone est requis";
    } else if (!isValidPhoneNumber(formData.phone)) {
      newErrors.phone = PHONE_VALIDATION_MESSAGE;
    }
    if (!formData.password.trim()) {
      newErrors.password = 'Le mot de passe est requis';
    } else if (!passwordValidation.isValid) {
      newErrors.password = 'Le mot de passe ne respecte pas les critères de sécurité';
    }
    if (!formData.confirmPassword.trim()) {
      newErrors.confirmPassword = 'La confirmation du mot de passe est requise';
    } else if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Les mots de passe ne correspondent pas';
    }
    if (!formData.firstName.trim()) {
      newErrors.firstName = 'Le prénom est requis';
    } else if (formData.firstName.trim().length < 2) {
      newErrors.firstName = 'Le prénom doit contenir au moins 2 caractères';
    }
    if (!formData.lastName.trim()) {
      newErrors.lastName = 'Le nom est requis';
    } else if (formData.lastName.trim().length < 2) {
      newErrors.lastName = 'Le nom doit contenir au moins 2 caractères';
    }
    if (!acceptTerms) {
      newErrors.acceptTerms = 'Vous devez accepter les CGU et la politique de confidentialité';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSocialRegister = async (provider: 'google') => {
    try {
      const result = await loginWithKeycloak(provider, 'ORGANIZER');
      if (result.pendingRegistration) {
        setPendingCode(result.pendingCode!);
        setOauthData(p => ({ ...p, firstName: result.firstName || '', lastName: result.lastName || '' }));
        setOauthModal(true);
        return;
      }
      if (!result.pendingRegistration) {
        window.location.href = '/dashboard';
      }
    } catch (error: any) {
      showError(translateOAuthError(error.message));
    }
  };

  const handleOAuthModalSubmit = async () => {
    const errs: { [key: string]: string } = {};
    if (!oauthData.firstName.trim() || oauthData.firstName.trim().length < 2) errs.firstName = 'Le prénom est requis (min. 2 caractères)';
    if (!oauthData.lastName.trim() || oauthData.lastName.trim().length < 2) errs.lastName = 'Le nom est requis (min. 2 caractères)';
    if (!oauthTerms) errs.terms = 'Vous devez accepter les CGU et la politique de confidentialité';
    setOauthErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setOauthLoading(true);
    try {
      const response = await api.post('/auth/oauth/complete-registration', {
        pendingCode,
        firstName: oauthData.firstName.trim(),
        lastName: oauthData.lastName.trim(),
        ...(oauthData.city.trim() && { city: oauthData.city.trim() }),
        consent: { termsAccepted: true, privacyAccepted: true, isAdult: true },
      });
      window.location.href = '/dashboard';
    } catch (error: any) {
      showError("Erreur lors de la création du compte. Veuillez réessayer.");
    } finally {
      setOauthLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLocked || registerMutation.isPending) return;
    if (!validateForm()) return;

    await runSubmit(async () => {
      try {
        await warmupAuthServer();

        await registerMutation.mutateAsync({
          email: formData.email.trim(),
          phone: formData.phone.trim() || '',
          password: formData.password,
          firstName: formData.firstName.trim(),
          lastName: formData.lastName.trim(),
          city: formData.city.trim() || '',
          role: 'ORGANIZER' as const,
          consent: {
            termsAccepted: acceptTerms,
            privacyAccepted: acceptTerms,
            isAdult: true,
          },
        });
      } catch (error: unknown) {
        showError(getSignupErrorMessage(error));
      }
    });
  };

  const validatePassword = (password: string) => {
    const length = password.length >= 8;
    const uppercase = /[A-Z]/.test(password);
    const number = /[0-9]/.test(password);
    setPasswordValidation({
      length,
      uppercase,
      number,
      isValid: length && uppercase && number,
    });
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: '' }));
    if (name === 'password') validatePassword(value);
    setFormData((prev) => ({ ...prev, [name]: value }));
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
    padding: 40,
    borderRadius: 15,
    boxShadow: '0 4px 24px rgba(15, 23, 42, 0.08)',
    maxWidth: 500,
    width: '90%',
  };
  const inputStyle: CSSProperties = {
    width: 'calc(100% - 20px)',
    padding: '12px 10px',
    margin: '10px 0',
    borderRadius: 8,
    border: '1px solid var(--ccc-border-medium)',
    backgroundColor: 'var(--ccc-bg-elevated)',
    color: 'var(--ccc-text-primary)',
    fontSize: '1em',
    outline: 'none',
  };
  const errorStyle: CSSProperties = {
    color: 'var(--ccc-error)',
    fontSize: '0.85em',
    marginTop: 4,
    marginBottom: 8,
    textAlign: 'left',
  };
  const buttonStyle: CSSProperties = {
    width: '100%',
    padding: 15,
    margin: '20px 0',
    borderRadius: 8,
    border: 'none',
    background: 'var(--ccc-accent-gradient)',
    color: 'white',
    fontSize: '1.2em',
    fontWeight: 'bold',
    cursor: 'pointer',
    opacity: registerMutation.isPending ? 0.7 : 1,
  };

  const socialButtonBaseStyle: CSSProperties = {
    width: '100%',
    padding: '14px 20px',
    marginBottom: '10px',
    borderRadius: '10px',
    border: 'none',
    fontSize: '0.95em',
    fontWeight: '600',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    transition: 'all 0.2s ease',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
  };

  return (
    <div style={pageStyle}>
      <div style={containerStyle}>
        <h2>Inscription Organisateur</h2>
        <p>Créez votre compte pour gérer vos plateaux et événements</p>

        {isOAuthEnabled && (
          <>
            <button
              type="button"
              onClick={() => handleSocialRegister('google')}
              style={{ ...socialButtonBaseStyle, backgroundColor: 'var(--ccc-bg-elevated)', color: '#3c4043' }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continuer avec Google
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '10px 0 20px', color: 'var(--ccc-text-muted)', fontSize: '0.9em' }}>
              <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--ccc-border-subtle)' }} />
              ou
              <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--ccc-border-subtle)' }} />
            </div>
          </>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column' }}>
          <div>
            <input
              type="text"
              name="lastName"
              placeholder="Nom *"
              value={formData.lastName}
              onChange={handleChange}
              style={{ ...inputStyle, borderColor: errors.lastName ? 'var(--ccc-error)' : 'var(--ccc-border-medium)' }}
            />
            {errors.lastName && <div style={errorStyle}>{errors.lastName}</div>}
          </div>
          <div>
            <input
              type="text"
              name="firstName"
              placeholder="Prénom *"
              value={formData.firstName}
              onChange={handleChange}
              style={{ ...inputStyle, borderColor: errors.firstName ? 'var(--ccc-error)' : 'var(--ccc-border-medium)' }}
            />
            {errors.firstName && <div style={errorStyle}>{errors.firstName}</div>}
          </div>
          <div>
            <input
              type="text"
              name="city"
              placeholder="Ville (optionnel)"
              value={formData.city}
              onChange={handleChange}
              style={inputStyle}
            />
          </div>
          <div>
            <input
              type="email"
              name="email"
              placeholder="E-mail *"
              value={formData.email}
              onChange={handleChange}
              style={{ ...inputStyle, borderColor: errors.email ? 'var(--ccc-error)' : 'var(--ccc-border-medium)' }}
            />
            {errors.email && <div style={errorStyle}>{errors.email}</div>}
          </div>
          <div style={{ position: 'relative' }}>
            <input
              type="password"
              name="password"
              placeholder="Mot de passe *"
              value={formData.password}
              onChange={handleChange}
              onFocus={() => setPasswordFocused(true)}
              onBlur={() => setPasswordFocused(false)}
              style={{ ...inputStyle, borderColor: errors.password ? 'var(--ccc-error)' : 'var(--ccc-border-medium)' }}
            />
            {errors.password && <div style={errorStyle}>{errors.password}</div>}
            {passwordFocused && (
              <div style={{
                padding: '8px 12px',
                backgroundColor: 'var(--ccc-bg-surface)',
                borderRadius: '8px',
                fontSize: '0.8em',
                marginTop: '4px',
                border: '1px solid var(--ccc-border-subtle)',
              }}>
                <div style={{ color: passwordValidation.length ? 'var(--ccc-success)' : 'var(--ccc-error)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                  {passwordValidation.length ? '✓' : '✗'} 8 caractères min.
                </div>
                <div style={{ color: passwordValidation.uppercase ? 'var(--ccc-success)' : 'var(--ccc-error)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                  {passwordValidation.uppercase ? '✓' : '✗'} 1 majuscule
                </div>
                <div style={{ color: passwordValidation.number ? 'var(--ccc-success)' : 'var(--ccc-error)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {passwordValidation.number ? '✓' : '✗'} 1 chiffre
                </div>
              </div>
            )}
          </div>
          <div>
            <input
              type="password"
              name="confirmPassword"
              placeholder="Confirmer le mot de passe *"
              value={formData.confirmPassword}
              onChange={handleChange}
              style={{ ...inputStyle, borderColor: errors.confirmPassword ? 'var(--ccc-error)' : 'var(--ccc-border-medium)' }}
            />
            {errors.confirmPassword && <div style={errorStyle}>{errors.confirmPassword}</div>}
          </div>
          <div>
            <input
              type="tel"
              name="phone"
              placeholder="Téléphone * (ex. 06… ou +224…)"
              value={formData.phone}
              onChange={handleChange}
              style={{ ...inputStyle, borderColor: errors.phone ? 'var(--ccc-error)' : 'var(--ccc-border-medium)' }}
            />
            {errors.phone && <div style={errorStyle}>{errors.phone}</div>}
          </div>
          <div style={{ textAlign: 'left', marginBottom: 15 }}>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={acceptTerms}
                onChange={(e) => setAcceptTerms(e.target.checked)}
                style={{ marginTop: 4 }}
              />
              <span>
                J'accepte les <Link to="/cgu" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--ccc-accent)' }}>CGU</Link> et la <Link to="/politique-confidentialite" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--ccc-accent)' }}>politique de confidentialité</Link> *
              </span>
            </label>
            {errors.acceptTerms && <div style={errorStyle}>{errors.acceptTerms}</div>}
          </div>
          {slowConnection && (
            <p style={{ margin: '0 0 12px', fontSize: '0.9em', color: 'var(--ccc-text-secondary)', textAlign: 'left' }}>
              {SLOW_CONNECTION_MESSAGE}
            </p>
          )}

          <button type="submit" disabled={registerMutation.isPending || isLocked} style={buttonStyle}>
            {registerMutation.isPending || isLocked ? 'Inscription en cours…' : 'Créer mon compte organisateur'}
          </button>
        </form>

        <p style={{ marginTop: 20, fontSize: '0.9em' }}>
          Déjà un compte ? <Link to="/organisateur" style={{ color: 'var(--ccc-accent)', fontWeight: 'bold' }}>Se connecter</Link>
        </p>
      </div>

      {oauthModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: 'var(--ccc-bg-elevated)', border: '1px solid var(--ccc-border-subtle)', borderRadius: 15, padding: 32, maxWidth: 480, width: '90%', color: 'var(--ccc-text-primary)', boxShadow: '0 4px 24px rgba(15, 23, 42, 0.08)' }}>
            <h3 style={{ margin: '0 0 8px', fontSize: '1.3em', color: 'var(--ccc-accent)' }}>Finalise ton inscription</h3>
            <p style={{ margin: '0 0 20px', color: 'var(--ccc-text-muted)', fontSize: '0.9em' }}>Quelques infos pour compléter ton profil d'organisateur</p>

            <div>
              <input
                type="text"
                placeholder="Prénom *"
                value={oauthData.firstName}
                onChange={(e) => { setOauthData(p => ({ ...p, firstName: e.target.value })); setOauthErrors(p => ({ ...p, firstName: '' })); }}
                style={{ ...inputStyle, borderColor: oauthErrors.firstName ? 'var(--ccc-error)' : 'var(--ccc-border-medium)' }}
              />
              {oauthErrors.firstName && <div style={errorStyle}>{oauthErrors.firstName}</div>}
            </div>

            <div>
              <input
                type="text"
                placeholder="Nom *"
                value={oauthData.lastName}
                onChange={(e) => { setOauthData(p => ({ ...p, lastName: e.target.value })); setOauthErrors(p => ({ ...p, lastName: '' })); }}
                style={{ ...inputStyle, borderColor: oauthErrors.lastName ? 'var(--ccc-error)' : 'var(--ccc-border-medium)' }}
              />
              {oauthErrors.lastName && <div style={errorStyle}>{oauthErrors.lastName}</div>}
            </div>

            <div>
              <input
                type="text"
                placeholder="Ville (optionnel)"
                value={oauthData.city}
                onChange={(e) => setOauthData(p => ({ ...p, city: e.target.value }))}
                style={inputStyle}
              />
            </div>

            <div style={{ margin: '15px 0' }}>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer', fontSize: '0.9em', textAlign: 'left' }}>
                <input
                  type="checkbox"
                  checked={oauthTerms}
                  onChange={(e) => { setOauthTerms(e.target.checked); setOauthErrors(p => ({ ...p, terms: '' })); }}
                  style={{ marginTop: 3, width: 16, height: 16 }}
                />
                <span style={{ color: 'var(--ccc-text-secondary)' }}>
                  J'accepte les <Link to="/cgu" target="_blank" style={{ color: 'var(--ccc-accent)', fontWeight: 'bold' }}>CGU</Link> et la <Link to="/politique-confidentialite" target="_blank" style={{ color: 'var(--ccc-accent)', fontWeight: 'bold' }}>politique de confidentialité</Link> *
                </span>
              </label>
              {oauthErrors.terms && <div style={errorStyle}>{oauthErrors.terms}</div>}
            </div>

            <button
              onClick={handleOAuthModalSubmit}
              disabled={oauthLoading}
              style={{ ...buttonStyle, margin: '8px 0 0', opacity: oauthLoading ? 0.7 : 1 }}
            >
              {oauthLoading ? 'Enregistrement...' : 'Créer mon compte organisateur'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default RegisterOrganizerPage;
