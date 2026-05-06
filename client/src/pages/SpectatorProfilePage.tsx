import { useState, useEffect, type CSSProperties } from 'react';
import Navbar from '../components/Navbar';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import { useAuth } from '../hooks/useAuth';
import { useAlert } from '../hooks/useAlert';

const RADII = [5, 10, 20, 50] as const;

export default function SpectatorProfilePage() {
  const { user: authUser, token, refreshUser } = useAuth();
  const { showSuccess, showError } = useAlert();
  const queryClient = useQueryClient();

  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile', 'me', authUser?._id],
    queryFn: async () => {
      const res = await api.get('/profile/me');
      return res.data;
    },
    enabled: !!authUser?._id && authUser?.role === 'SPECTATOR',
  });

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    city: '',
    birthDate: '',
    radiusKm: 20 as number,
    dailyRecapEmail: true,
  });
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  useEffect(() => {
    if (!profile) return;
    const birth = profile.birthDate;
    const birthStr =
      typeof birth === 'string' && birth
        ? birth.split('T')[0]
        : birth instanceof Date
          ? birth.toISOString().split('T')[0]
          : '';
    setFormData({
      firstName: profile.firstName || '',
      lastName: profile.lastName || '',
      email: profile.email || '',
      phone: profile.phone || '',
      city: profile.city || '',
      birthDate: birthStr,
      radiusKm: profile.spectatorPreferences?.radiusKm != null && RADII.includes(profile.spectatorPreferences.radiusKm as (typeof RADII)[number])
        ? profile.spectatorPreferences.radiusKm
        : 20,
      dailyRecapEmail: profile.spectatorPreferences?.dailyRecapEmail ?? true,
    });
  }, [profile]);

  const validateForm = () => {
    const newErrors: { [key: string]: string } = {};
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
    if (!formData.email.trim()) {
      newErrors.email = "L'email est requis";
    } else {
      const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
      if (!emailRegex.test(formData.email.trim())) {
        newErrors.email = "Format d'email invalide";
      }
    }
    if (formData.phone.trim()) {
      const cleanPhone = formData.phone.replace(/[\s\-\(\)\+]/g, '');
      const frenchPhoneRegex = /^(0[1-9])[0-9]{8}$/;
      const belgianPhoneRegex = /^(0[1-9][0-9]{7,8})$/;
      if (!frenchPhoneRegex.test(cleanPhone) && !belgianPhoneRegex.test(cleanPhone)) {
        newErrors.phone = 'Numéro invalide (format français ou belge)';
      }
    }
    if (!formData.city.trim()) {
      newErrors.city = 'La ville est requise';
    } else if (formData.city.trim().length < 2) {
      newErrors.city = 'La ville doit contenir au moins 2 caractères';
    }
    if (formData.birthDate) {
      const birth = new Date(formData.birthDate);
      if (isNaN(birth.getTime())) {
        newErrors.birthDate = 'Date invalide';
      } else if (birth > new Date()) {
        newErrors.birthDate = 'La date doit être dans le passé';
      } else {
        const age = (new Date().getTime() - birth.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
        if (age < 18) {
          newErrors.birthDate = 'Vous devez avoir au moins 18 ans';
        }
      }
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const updateMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      if (!authUser?._id) throw new Error('Non connecté');
      await api.put(`/profile/${authUser._id}`, {
        firstName: data.firstName.trim(),
        lastName: data.lastName.trim(),
        email: data.email.trim(),
        phone: data.phone.trim() || undefined,
        city: data.city.trim(),
        birthDate: data.birthDate || undefined,
        spectatorPreferences: {
          radiusKm: data.radiusKm,
          dailyRecapEmail: data.dailyRecapEmail,
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile', 'me'] });
      queryClient.invalidateQueries({ queryKey: ['events', 'spectator', 'nearMe'] });
      refreshUser();
      showSuccess('Profil mis à jour');
    },
    onError: (e: any) => showError(e?.response?.data?.message || 'Erreur lors de la mise à jour'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    updateMutation.mutate(formData);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: '' }));
  };

  const pageStyle: CSSProperties = {
    minHeight: 'calc(100vh - 60px)',
    background: 'linear-gradient(to bottom right, #1a1a2e, #331f41)',
    color: '#fff',
    padding: 24,
  };
  const containerStyle: CSSProperties = {
    maxWidth: 560,
    margin: '0 auto',
  };
  const cardStyle: CSSProperties = {
    background: '#fff',
    color: '#1a1a2e',
    borderRadius: 12,
    padding: 24,
    marginBottom: 24,
    border: '1px solid rgba(0,0,0,0.1)',
  };
  const titleStyle: CSSProperties = {
    marginTop: 0,
    marginBottom: 8,
    fontSize: '1.5rem',
  };
  const subtitleStyle: CSSProperties = {
    marginTop: 0,
    marginBottom: 20,
    color: '#666',
    fontSize: '0.95rem',
  };
  const inputStyle: CSSProperties = {
    width: '100%',
    padding: '12px 14px',
    borderRadius: 8,
    border: '1px solid #ddd',
    fontSize: '1rem',
    marginBottom: 16,
    boxSizing: 'border-box',
  };
  const labelStyle: CSSProperties = {
    display: 'block',
    marginBottom: 6,
    fontWeight: 600,
    fontSize: '0.9rem',
  };
  const errorStyle: CSSProperties = {
    color: '#dc3545',
    fontSize: '0.85rem',
    marginTop: -10,
    marginBottom: 12,
  };
  const buttonStyle: CSSProperties = {
    padding: '12px 24px',
    borderRadius: 8,
    border: 'none',
    background: 'linear-gradient(135deg, #FF5A7E, #FF7A92)',
    color: '#fff',
    fontSize: '1rem',
    fontWeight: 600,
    cursor: 'pointer',
    marginTop: 8,
  };
  const rowStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  };

  if (!authUser || authUser?.role !== 'SPECTATOR') {
    return (
      <>
        <Navbar />
        <div style={pageStyle}>
          <div style={containerStyle}>
            <p style={{ color: 'rgba(255,255,255,0.8)' }}>Accès réservé aux spectateurs.</p>
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
          <h1 style={{ marginBottom: 8, fontSize: '1.75rem' }}>Mon profil</h1>
          <p style={{ color: 'rgba(255,255,255,0.8)', marginBottom: 24 }}>
            Modifiez les informations renseignées lors de votre inscription.
          </p>

          {isLoading ? (
            <p style={{ color: 'rgba(255,255,255,0.8)' }}>Chargement…</p>
          ) : (
            <form onSubmit={handleSubmit}>
              <div style={cardStyle}>
                <h2 style={titleStyle}>Informations personnelles</h2>
                <p style={subtitleStyle}>Nom, prénom, email, téléphone, ville, date de naissance</p>

                <label style={labelStyle}>Prénom *</label>
                <input
                  type="text"
                  name="firstName"
                  value={formData.firstName}
                  onChange={handleChange}
                  style={{ ...inputStyle, borderColor: errors.firstName ? '#dc3545' : '#ddd' }}
                  placeholder="Prénom"
                />
                {errors.firstName && <div style={errorStyle}>{errors.firstName}</div>}

                <label style={labelStyle}>Nom *</label>
                <input
                  type="text"
                  name="lastName"
                  value={formData.lastName}
                  onChange={handleChange}
                  style={{ ...inputStyle, borderColor: errors.lastName ? '#dc3545' : '#ddd' }}
                  placeholder="Nom"
                />
                {errors.lastName && <div style={errorStyle}>{errors.lastName}</div>}

                <label style={labelStyle}>Email *</label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  style={{ ...inputStyle, borderColor: errors.email ? '#dc3545' : '#ddd' }}
                  placeholder="email@exemple.com"
                />
                {errors.email && <div style={errorStyle}>{errors.email}</div>}

                <label style={labelStyle}>Téléphone (optionnel)</label>
                <input
                  type="tel"
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  style={{ ...inputStyle, borderColor: errors.phone ? '#dc3545' : '#ddd' }}
                  placeholder="0X XX XX XX XX"
                />
                {errors.phone && <div style={errorStyle}>{errors.phone}</div>}

                <label style={labelStyle}>Ville de résidence *</label>
                <input
                  type="text"
                  name="city"
                  value={formData.city}
                  onChange={handleChange}
                  style={{ ...inputStyle, borderColor: errors.city ? '#dc3545' : '#ddd' }}
                  placeholder="Ville"
                />
                {errors.city && <div style={errorStyle}>{errors.city}</div>}

                <label style={labelStyle}>Date de naissance (optionnel)</label>
                <input
                  type="date"
                  name="birthDate"
                  value={formData.birthDate}
                  onChange={handleChange}
                  max={new Date().toISOString().split('T')[0]}
                  style={{ ...inputStyle, borderColor: errors.birthDate ? '#dc3545' : '#ddd' }}
                />
                {errors.birthDate && <div style={errorStyle}>{errors.birthDate}</div>}
              </div>

              <div style={cardStyle}>
                <h2 style={titleStyle}>Préférences spectateur</h2>
                <p style={subtitleStyle}>
                  Rayon pour les événements « près de chez vous » et récapitulatif quotidien par email.
                </p>

                <label style={labelStyle}>Rayon (km)</label>
                <select
                  name="radiusKm"
                  value={formData.radiusKm}
                  onChange={(e) => setFormData((p) => ({ ...p, radiusKm: Number(e.target.value) }))}
                  style={{ ...inputStyle, cursor: 'pointer' }}
                >
                  {RADII.map((km) => (
                    <option key={km} value={km}>
                      {km} km
                    </option>
                  ))}
                </select>

                <div style={rowStyle}>
                  <input
                    type="checkbox"
                    id="dailyRecapEmail"
                    name="dailyRecapEmail"
                    checked={formData.dailyRecapEmail}
                    onChange={handleChange}
                    style={{ width: 20, height: 20 }}
                  />
                  <label htmlFor="dailyRecapEmail" style={{ ...labelStyle, marginBottom: 0 }}>
                    Recevoir le récapitulatif quotidien des événements par email (max 1/jour)
                  </label>
                </div>
              </div>

              <button type="submit" disabled={updateMutation.isPending} style={buttonStyle}>
                {updateMutation.isPending ? 'Enregistrement…' : 'Enregistrer les modifications'}
              </button>
            </form>
          )}
        </div>
      </div>
    </>
  );
}
