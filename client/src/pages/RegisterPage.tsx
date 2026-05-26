import { useState, useEffect, type CSSProperties } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useAlert } from '../hooks/useAlert';
import { Link, useSearchParams } from 'react-router-dom';
import { getErrorMessage, ErrorMessages } from '../services/systemMessages';
import { loginWithKeycloak, translateOAuthError } from '../services/oauth';
import api from '../services/api';

function RegisterPage() {
  const { registerMutation } = useAuth();
  const { showError } = useAlert();
  const [searchParams] = useSearchParams();
  const urlRole = searchParams.get('role')?.toUpperCase();
  const isLieuRole = urlRole === 'LIEU';

  const [oauthModal, setOauthModal] = useState(false);
  const [pendingCode, setPendingCode] = useState('');
  const [oauthData, setOauthData] = useState({ firstName: '', lastName: '', phone: '', bio: '', experience: '' });
  const [oauthErrors, setOauthErrors] = useState<{ [key: string]: string }>({});
  const [oauthTerms, setOauthTerms] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);

  const [formData, setFormData] = useState({
    email: '',
    phone: '',
    password: '',
    firstName: '',
    lastName: '',
    role: isLieuRole ? 'LIEU' as const : 'COMEDIAN' as const,
    profile: {
      bio: '',
      experience: '',
    },
    city: '',
    confirmPassword: '',
  });

  const [errors, setErrors] = useState<{[key: string]: string}>({});
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [passwordValidation, setPasswordValidation] = useState({
    length: false,
    uppercase: false,
    number: false,
    isValid: false
  });

  // Initialiser la validation au chargement
  useEffect(() => {
    validatePassword(formData.password);
  }, []);

  const validateForm = () => {
    const newErrors: {[key: string]: string} = {};

    // Validation de l'email
    if (!formData.email.trim()) {
      newErrors.email = 'L\'email est requis';
    } else {
      // Validation stricte de l'email
      const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
      if (!emailRegex.test(formData.email.trim())) {
        newErrors.email = 'Format d\'email invalide (ex: nom@domaine.com)';
      } else {
        // Vérification supplémentaire pour les emails évidents invalides
        const invalidPatterns = [
          /^[^@]*$/, // Pas de @
          /@$/, // @ à la fin
          /^@/, // @ au début
          /\.$/, // Point à la fin
          /^\./, // Point au début
          /\.{2,}/, // Points multiples
          /@{2,}/, // @ multiples
          /[^a-zA-Z0-9.!#$%&'*+/=?^_`{|}~@-]/, // Caractères non autorisés
        ];

        if (invalidPatterns.some(pattern => pattern.test(formData.email.trim()))) {
          newErrors.email = 'Format d\'email invalide (ex: nom@domaine.com)';
        }
      }
    }

    // Validation du téléphone français et belge (mobiles + fixes) - obligatoire pour tous
    if (!formData.phone.trim()) {
      newErrors.phone = 'Le numéro de téléphone est requis';
    } else if (formData.phone.trim()) {
      // Nettoyer le numéro (supprimer espaces, tirets, parenthèses, +)
      const cleanPhone = formData.phone.replace(/[\s\-\(\)\+]/g, '');

      // Validation pour numéros français
      const frenchPhoneRegex = /^(0[1-9])[0-9]{8}$/;

      // Validation pour numéros belges
      const belgianPhoneRegex = /^(0[1-9][0-9]{7,8})$/;

      if (!frenchPhoneRegex.test(cleanPhone) && !belgianPhoneRegex.test(cleanPhone)) {
        newErrors.phone = 'Numéro de téléphone invalide (format français: 0XXXXXXXXX, format belge: 0XXXXXXXX ou 0XXXXXXXXX)';
      }
    }

    // Validation du mot de passe
    if (!formData.password.trim()) {
      newErrors.password = 'Le mot de passe est requis';
    } else if (!passwordValidation.isValid) {
      newErrors.password = 'Le mot de passe ne respecte pas les critères de sécurité';
    }

    // Validation de la confirmation du mot de passe
    if (!formData.confirmPassword.trim()) {
      newErrors.confirmPassword = 'La confirmation du mot de passe est requise';
    } else if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Les mots de passe ne correspondent pas';
    }

    // Validation du prénom
    if (!formData.firstName.trim()) {
      newErrors.firstName = 'Le prénom est requis';
    } else if (formData.firstName.trim().length < 2) {
      newErrors.firstName = 'Le prénom doit contenir au moins 2 caractères';
    } else if (!/^[a-zA-ZÀ-ÿ\s'-]+$/.test(formData.firstName.trim())) {
      newErrors.firstName = 'Le prénom ne peut contenir que des lettres, espaces, apostrophes et tirets';
    }

    // Validation du nom
    if (!formData.lastName.trim()) {
      newErrors.lastName = 'Le nom est requis';
    } else if (formData.lastName.trim().length < 2) {
      newErrors.lastName = 'Le nom doit contenir au moins 2 caractères';
    } else if (!/^[a-zA-ZÀ-ÿ\s'-]+$/.test(formData.lastName.trim())) {
      newErrors.lastName = 'Le nom ne peut contenir que des lettres, espaces, apostrophes et tirets';
    }

    // Validation de la biographie (uniquement pour COMEDIAN)
    if (!isLieuRole) {
      if (!formData.profile.bio.trim()) {
        newErrors.bio = 'La biographie est requise';
      } else if (formData.profile.bio.trim().length < 10) {
        newErrors.bio = 'La biographie doit contenir au moins 10 caractères';
      } else if (formData.profile.bio.trim().length > 500) {
        newErrors.bio = 'La biographie ne peut pas dépasser 500 caractères';
      }

      // Validation de l'expérience (uniquement pour COMEDIAN)
      if (!formData.profile.experience) {
        newErrors.experience = 'L\'expérience est requise';
      } else {
        const experience = parseInt(formData.profile.experience);
        if (isNaN(experience) || experience < 0) {
          newErrors.experience = 'L\'expérience doit être un nombre positif';
        } else if (experience > 50) {
          newErrors.experience = 'L\'expérience ne peut pas dépasser 50 ans';
        }
      }
    }

    // Validation du consentement CGU/RGPD
    if (!acceptTerms) {
      newErrors.acceptTerms = 'Vous devez accepter les CGU et la politique de confidentialité';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSocialRegister = async (provider: 'google') => {
    try {
      const result = await loginWithKeycloak(provider, 'COMEDIAN');
      if (result.pendingRegistration) {
        setPendingCode(result.pendingCode!);
        setOauthData(p => ({ ...p, firstName: result.firstName || '', lastName: result.lastName || '' }));
        setOauthModal(true);
        return;
      }
      // Utilisateur déjà existant (connexion) — cookie HttpOnly posé par le serveur
      if (!result.pendingRegistration) {
        const profile = await api.get('/profile/me');

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
    if (oauthData.phone.trim()) {
      const clean = oauthData.phone.replace(/[\s\-\(\)\+]/g, '');
      if (!/^(0[1-9])[0-9]{8}$/.test(clean) && !/^(0[1-9][0-9]{7,8})$/.test(clean)) {
        errs.phone = 'Numéro invalide (format français ou belge)';
      }
    }
    if (!oauthData.bio.trim()) {
      errs.bio = 'La biographie est requise';
    } else if (oauthData.bio.trim().length < 10) {
      errs.bio = 'La biographie doit contenir au moins 10 caractères';
    } else if (oauthData.bio.trim().length > 500) {
      errs.bio = 'La biographie ne peut pas dépasser 500 caractères';
    }
    if (!oauthData.experience) {
      errs.experience = "L'expérience est requise";
    } else {
      const exp = parseInt(oauthData.experience);
      if (isNaN(exp) || exp < 0) errs.experience = "L'expérience doit être un nombre positif";
      else if (exp > 50) errs.experience = "L'expérience ne peut pas dépasser 50 ans";
    }
    if (!oauthTerms) errs.terms = 'Vous devez accepter les CGU et la politique de confidentialité';
    setOauthErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setOauthLoading(true);
    try {
      const response = await api.post('/auth/oauth/complete-registration', {
        pendingCode,
        firstName: oauthData.firstName.trim(),
        lastName: oauthData.lastName.trim(),
        ...(oauthData.phone.trim() && { phone: oauthData.phone.trim() }),
        bio: oauthData.bio.trim(),
        experience: parseInt(oauthData.experience),
        consent: { termsAccepted: true, privacyAccepted: true, isAdult: true },
      });
      const { token, user } = response.data;

      window.location.href = '/dashboard';
    } catch (error: any) {
      showError("Erreur lors de la création du compte. Veuillez réessayer.");
    } finally {
      setOauthLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    try {
      // Préparer les données pour l'API (sans confirmPassword uniquement)
      const { confirmPassword, ...registerData } = formData;

      // Pour LIEU, ne pas envoyer profile ni champs inutiles
      const { profile: _profile, ...baseData } = registerData;

      const dataToSend: Record<string, unknown> = {
        ...baseData,
        consent: {
          termsAccepted: acceptTerms,
          privacyAccepted: acceptTerms,
          isAdult: true,
        }
      };

      if (!isLieuRole) {
        dataToSend.profile = {
          ..._profile,
          experience: parseInt(_profile.experience) || 0
        };
      }

      // Envoyer les données avec profile et consentement au backend
      await registerMutation.mutateAsync(dataToSend);
      // La redirection est gérée dans AuthContext
    } catch (error: any) {
      showError(getErrorMessage(error, ErrorMessages.SIGNUP_FAILED));
    }
  };

  const validatePassword = (password: string) => {
    const length = password.length >= 8;
    const uppercase = /[A-Z]/.test(password);
    const number = /[0-9]/.test(password);
    const isValid = length && uppercase && number;

    setPasswordValidation({
      length,
      uppercase,
      number,
      isValid
    });
  };

  const handleChangeRegister = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;

    // Clear error when user starts typing
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: ''
      }));
    }

    // Validation en temps réel du mot de passe
    if (name === 'password') {
      validatePassword(value);
    }
    if (name === 'bio' || name === 'experience') {
      setFormData(prev => ({
        ...prev,
        profile: {
          ...prev.profile,
          [name]: value
        }
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: value
      }));
    }
  };

  const pageStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100vh',
    backgroundColor: '#1a1a2e',
    backgroundImage: 'linear-gradient(to bottom right, #1a1a2e, #331f41)',
    color: '#ffffff',
    fontFamily: 'Arial, sans-serif',
    textAlign: 'center',
  };

  const containerStyle: CSSProperties = {
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    padding: '40px',
    borderRadius: '15px',
    boxShadow: '0 8px 30px rgba(0, 0, 0, 0.5)',
    maxWidth: '500px',
    width: '90%',
  };

  const inputStyle: CSSProperties = {
    width: 'calc(100% - 20px)',
    padding: '12px 10px',
    margin: '10px 0',
    borderRadius: '8px',
    border: '1px solid #444',
    backgroundColor: '#2c2c4d',
    color: '#ffffff',
    fontSize: '1em',
    outline: 'none',
  };

  const buttonStyle: CSSProperties = {
    width: '100%',
    padding: '15px',
    margin: '20px 0',
    borderRadius: '8px',
    border: 'none',
    background: 'linear-gradient(to right, #28a745, #218838)',
    color: 'white',
    fontSize: '1.2em',
    fontWeight: 'bold',
    cursor: 'pointer',
    transition: 'background 0.3s ease',
    opacity: registerMutation.isPending ? 0.7 : 1,
  };

  const linkStyle: CSSProperties = {
    color: '#28a745',
    textDecoration: 'none',
    fontWeight: 'bold',
    marginTop: '10px',
  };

  const errorStyle: CSSProperties = {
    color: '#ef4444',
    fontSize: '0.85em',
    marginTop: '4px',
    marginBottom: '8px',
    textAlign: 'left',
  };

  const socialButtonBaseStyle: CSSProperties = {
    width: '100%',
    padding: '12px',
    marginBottom: '10px',
    borderRadius: '8px',
    border: 'none',
    fontSize: '1em',
    fontWeight: 'bold',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
  };

  const separatorStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    margin: '10px 0 20px',
    color: 'rgba(255,255,255,0.4)',
    fontSize: '0.9em',
  };

  return (
    <div style={pageStyle}>
      <div style={containerStyle}>
        <h2>Inscris-toi !</h2>
        <p>Crée ton compte pour rejoindre la communauté</p>

        {/* Boutons inscription sociale */}
        <button
          type="button"
          onClick={() => handleSocialRegister('google')}
          style={{ ...socialButtonBaseStyle, backgroundColor: '#ffffff', color: '#3c4043' }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Continuer avec Google
        </button>

        <div style={separatorStyle}>
          <div style={{ flex: 1, height: '1px', backgroundColor: 'rgba(255,255,255,0.2)' }} />
          ou
          <div style={{ flex: 1, height: '1px', backgroundColor: 'rgba(255,255,255,0.2)' }} />
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column' }}>
          {/* Prénom */}
          <div>
            <input type="text" name="firstName" placeholder="Prénom *" value={formData.firstName} onChange={handleChangeRegister}
              style={{ ...inputStyle, borderColor: errors.firstName ? '#ef4444' : '#444' }} />
            {errors.firstName && <div style={errorStyle}>{errors.firstName}</div>}
          </div>

          {/* Nom */}
          <div>
            <input type="text" name="lastName" placeholder="Nom *" value={formData.lastName} onChange={handleChangeRegister}
              style={{ ...inputStyle, borderColor: errors.lastName ? '#ef4444' : '#444' }} />
            {errors.lastName && <div style={errorStyle}>{errors.lastName}</div>}
          </div>

          {/* Email */}
          <div>
            <input type="email" name="email" placeholder="Email *" value={formData.email} onChange={handleChangeRegister}
              style={{ ...inputStyle, borderColor: errors.email ? '#ef4444' : '#444' }} />
            {errors.email && <div style={errorStyle}>{errors.email}</div>}
          </div>

          {/* Téléphone - obligatoire pour tous */}
          <div>
            <input
              type="tel"
              name="phone"
              placeholder="Téléphone *"
              value={formData.phone}
              onChange={handleChangeRegister}
              style={{ ...inputStyle, borderColor: errors.phone ? '#ef4444' : '#444' }}
            />
            {errors.phone && <div style={errorStyle}>{errors.phone}</div>}
          </div>

          {/* Mot de passe */}
          <div style={{ position: 'relative' }}>
            <input type="password" name="password" placeholder="Mot de passe *" value={formData.password} onChange={handleChangeRegister}
              onFocus={() => setPasswordFocused(true)} onBlur={() => setPasswordFocused(false)}
              style={{ ...inputStyle, borderColor: errors.password ? '#ef4444' : '#444' }} />
            {errors.password && <div style={errorStyle}>{errors.password}</div>}

            {/* Critères de sécurité — visible uniquement au focus */}
            {passwordFocused && (
              <div style={{
                padding: '8px 12px',
                backgroundColor: 'rgba(0, 0, 0, 0.5)',
                borderRadius: '8px',
                fontSize: '0.8em',
                marginTop: '4px',
                border: '1px solid rgba(255,255,255,0.1)',
              }}>
                <div style={{ color: passwordValidation.length ? '#28a745' : '#dc3545', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                  {passwordValidation.length ? '✓' : '✗'} 8 caractères min.
                </div>
                <div style={{ color: passwordValidation.uppercase ? '#28a745' : '#dc3545', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                  {passwordValidation.uppercase ? '✓' : '✗'} 1 majuscule
                </div>
                <div style={{ color: passwordValidation.number ? '#28a745' : '#dc3545', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {passwordValidation.number ? '✓' : '✗'} 1 chiffre
                </div>
              </div>
            )}
          </div>

          {/* Confirmation du mot de passe */}
          <div>
            <input type="password" name="confirmPassword" placeholder="Confirme ton mot de passe *" value={formData.confirmPassword} onChange={handleChangeRegister}
              style={{ ...inputStyle, borderColor: errors.confirmPassword ? '#ef4444' : '#444' }} />
            {errors.confirmPassword && <div style={errorStyle}>{errors.confirmPassword}</div>}
          </div>

          {/* Biographie - uniquement pour COMEDIAN */}
          {!isLieuRole && (
            <div>
              <textarea name="bio" placeholder="Biographie * (10-500 caractères)" value={formData.profile.bio} onChange={handleChangeRegister}
                style={{ ...inputStyle, minHeight: '80px', borderColor: errors.bio ? '#ef4444' : '#444' }} />
              {errors.bio && <div style={errorStyle}>{errors.bio}</div>}
            </div>
          )}

          {/* Expérience - uniquement pour COMEDIAN */}
          {!isLieuRole && (
            <div>
              <input type="number" name="experience" placeholder="Expérience (années) *" value={formData.profile.experience} onChange={handleChangeRegister}
                min="0" max="50" style={{ ...inputStyle, borderColor: errors.experience ? '#ef4444' : '#444' }} />
              {errors.experience && <div style={errorStyle}>{errors.experience}</div>}
            </div>
          )}

          {/* Consentement CGU/RGPD */}
          <div style={{ marginTop: '15px', marginBottom: '10px' }}>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '0.9em', textAlign: 'left', cursor: 'pointer' }}>
              <input type="checkbox" checked={acceptTerms} onChange={(e) => setAcceptTerms(e.target.checked)}
                style={{ marginTop: '4px', width: '18px', height: '18px', cursor: 'pointer' }} />
              <span style={{ color: 'rgba(255, 255, 255, 0.85)' }}>
                J'accepte les <Link to="/cgu" style={linkStyle}>CGU</Link> et la{' '}
                <Link to="/politique-confidentialite" style={linkStyle}>politique de confidentialité</Link> *
              </span>
            </label>
            {errors.acceptTerms && <div style={errorStyle}>{errors.acceptTerms}</div>}
          </div>

          <button type="submit" style={buttonStyle} disabled={registerMutation.isPending}>
            {registerMutation.isPending ? "Création du compte..." : "S'inscrire"}
          </button>
        </form>

        <p>Déjà un compte ? <Link to="/login" style={linkStyle}>Connecte-toi</Link></p>
      </div>

      {oauthModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: '#1e1e3a', border: '1px solid #444', borderRadius: 15, padding: 32, maxWidth: 480, width: '90%', color: '#fff', boxShadow: '0 8px 40px rgba(0,0,0,0.6)' }}>
            <h3 style={{ margin: '0 0 8px', fontSize: '1.3em' }}>Finalise ton inscription</h3>
            <p style={{ margin: '0 0 20px', color: 'rgba(255,255,255,0.65)', fontSize: '0.9em' }}>Quelques infos supplémentaires pour ton profil d'humoriste</p>

            <div>
              <input
                type="text"
                placeholder="Prénom *"
                value={oauthData.firstName}
                onChange={(e) => { setOauthData(p => ({ ...p, firstName: e.target.value })); setOauthErrors(p => ({ ...p, firstName: '' })); }}
                style={{ ...inputStyle, borderColor: oauthErrors.firstName ? '#ef4444' : '#444' }}
              />
              {oauthErrors.firstName && <div style={errorStyle}>{oauthErrors.firstName}</div>}
            </div>

            <div>
              <input
                type="text"
                placeholder="Nom *"
                value={oauthData.lastName}
                onChange={(e) => { setOauthData(p => ({ ...p, lastName: e.target.value })); setOauthErrors(p => ({ ...p, lastName: '' })); }}
                style={{ ...inputStyle, borderColor: oauthErrors.lastName ? '#ef4444' : '#444' }}
              />
              {oauthErrors.lastName && <div style={errorStyle}>{oauthErrors.lastName}</div>}
            </div>

            <div>
              <input
                type="tel"
                placeholder="Téléphone (optionnel)"
                value={oauthData.phone}
                onChange={(e) => { setOauthData(p => ({ ...p, phone: e.target.value })); setOauthErrors(p => ({ ...p, phone: '' })); }}
                style={{ ...inputStyle, borderColor: oauthErrors.phone ? '#ef4444' : '#444' }}
              />
              {oauthErrors.phone && <div style={errorStyle}>{oauthErrors.phone}</div>}
            </div>

            <div>
              <textarea
                placeholder="Biographie * (10-500 caractères)"
                value={oauthData.bio}
                onChange={(e) => { setOauthData(p => ({ ...p, bio: e.target.value })); setOauthErrors(p => ({ ...p, bio: '' })); }}
                style={{ ...inputStyle, minHeight: 80, borderColor: oauthErrors.bio ? '#ef4444' : '#444', resize: 'vertical' } as CSSProperties}
              />
              {oauthErrors.bio && <div style={errorStyle}>{oauthErrors.bio}</div>}
            </div>

            <div>
              <input
                type="number"
                placeholder="Expérience (années) *"
                value={oauthData.experience}
                onChange={(e) => { setOauthData(p => ({ ...p, experience: e.target.value })); setOauthErrors(p => ({ ...p, experience: '' })); }}
                min="0" max="50"
                style={{ ...inputStyle, borderColor: oauthErrors.experience ? '#ef4444' : '#444' }}
              />
              {oauthErrors.experience && <div style={errorStyle}>{oauthErrors.experience}</div>}
            </div>

            <div style={{ margin: '15px 0' }}>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer', fontSize: '0.9em', textAlign: 'left' }}>
                <input
                  type="checkbox"
                  checked={oauthTerms}
                  onChange={(e) => { setOauthTerms(e.target.checked); setOauthErrors(p => ({ ...p, terms: '' })); }}
                  style={{ marginTop: 3, width: 16, height: 16 }}
                />
                <span style={{ color: 'rgba(255,255,255,0.85)' }}>
                  J'accepte les <Link to="/cgu" target="_blank" style={linkStyle}>CGU</Link> et la <Link to="/politique-confidentialite" target="_blank" style={linkStyle}>politique de confidentialité</Link> *
                </span>
              </label>
              {oauthErrors.terms && <div style={errorStyle}>{oauthErrors.terms}</div>}
            </div>

            <button
              onClick={handleOAuthModalSubmit}
              disabled={oauthLoading}
              style={{ ...buttonStyle, margin: '8px 0 0', opacity: oauthLoading ? 0.7 : 1 }}
            >
              {oauthLoading ? 'Enregistrement...' : 'Créer mon compte humoriste'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default RegisterPage;
