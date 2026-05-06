import React, { type CSSProperties, useState, useEffect, useRef } from 'react';
import { useAlert } from '../hooks/useAlert';
import type { IUserData } from '../types/user';
import Modal from './Modal';
import api from '../services/api';
import { FRENCH_REGIONS, FRENCH_DEPARTMENTS, DEPARTMENTS_ORDER } from '../utils/geographicMatching';
import { getErrorMessage, ErrorMessages, SuccessMessages, WarningMessages } from '../services/systemMessages';

interface EditComedianProfileFormProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: IUserData;
  onSaveSuccess: () => void;
  scrollToField?: string;
}

function EditComedianProfileForm({ isOpen, onClose, currentUser, onSaveSuccess, scrollToField }: EditComedianProfileFormProps) {
  const { showSuccess, showError, showWarning } = useAlert();
  const [formData, setFormData] = useState<IUserData>(currentUser);
  const [loading, setLoading] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(currentUser?.avatarUrl || null);
  const [avatarRemoved, setAvatarRemoved] = useState(false);
  const [avatarChanged, setAvatarChanged] = useState(false); // Track if avatar was actually changed

  // États pour l'auto-complétion des villes
  const [citySearchQuery, setCitySearchQuery] = useState<Record<number, string>>({});
  const [citySuggestions, setCitySuggestions] = useState<Record<number, Array<{ city: string; postcode: string }>>>({});
  const [showCityDropdown, setShowCityDropdown] = useState<Record<number, boolean>>({});
  const searchTimeoutRef = useRef<Record<number, NodeJS.Timeout>>({});

  useEffect(() => {
    setFormData(currentUser);
    setPreviewImage(currentUser?.avatarUrl || null);
    setAvatarRemoved(false);
    setAvatarChanged(false);
  }, [currentUser]);

    useEffect(() => {
    if (isOpen && scrollToField) {
      setTimeout(() => {
        const el =
          document.querySelector<HTMLElement>(`[name="${scrollToField}"]`) ??
          document.getElementById(scrollToField);
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    }
  }, [isOpen, scrollToField]);

  const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif'];

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Vérifier la taille du fichier (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        showWarning(WarningMessages.IMAGE_TOO_LARGE);
        return;
      }

      // Formats acceptés: JPG, PNG, GIF uniquement
      if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
        showWarning('Formats acceptés: JPG, PNG, GIF (max 5MB).');
        return;
      }

      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        setPreviewImage(base64String);
        setFormData(prev => ({ ...prev, avatarUrl: base64String }));
        setAvatarRemoved(false);
        setAvatarChanged(true); // Mark avatar as changed
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveAvatar = () => {
    setPreviewImage(null);
    setFormData(prev => ({ ...prev, avatarUrl: null }));
    setAvatarRemoved(true);
    setAvatarChanged(true); // Mark avatar as changed (removed)
  };

  const searchCities = async (query: string, index: number) => {
    if (query.length < 2) {
      setCitySuggestions(prev => ({ ...prev, [index]: [] }));
      setShowCityDropdown(prev => ({ ...prev, [index]: false }));
      return;
    }

    try {
      const response = await fetch(
        `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(query)}&type=municipality&limit=10`
      );
      const data = await response.json();

      if (data.features && data.features.length > 0) {
        const cities = data.features.map((f: any) => ({
          city: f.properties.city,
          postcode: f.properties.postcode,
        }));
        // Dédupliquer par ville + code postal pour garder les villes homonymes dans différents départements
        const uniqueCities = Array.from(
          new Map(cities.map((c: { city: string; postcode: string }) => [c.city + c.postcode, c])).values()
        ) as Array<{ city: string; postcode: string }>;
        setCitySuggestions(prev => {
          const newSuggestions = { ...prev, [index]: uniqueCities };
          return newSuggestions as Record<number, Array<{ city: string; postcode: string }>>;
        });
        setShowCityDropdown(prev => ({ ...prev, [index]: true }));
      } else {
        setCitySuggestions(prev => ({ ...prev, [index]: [] }));
      }
    } catch (err) {
      console.error('Erreur lors de la recherche de villes:', err);
      setCitySuggestions(prev => ({ ...prev, [index]: [] }));
    }
  };

  const handleCitySearch = (e: React.ChangeEvent<HTMLInputElement>, index: number) => {
    const query = e.target.value;
    setCitySearchQuery(prev => ({ ...prev, [index]: query }));

    // Annuler la recherche précédente
    if (searchTimeoutRef.current[index]) {
      clearTimeout(searchTimeoutRef.current[index]);
    }

    // Débounce de 300ms
    searchTimeoutRef.current[index] = setTimeout(() => {
      searchCities(query, index);
    }, 300);
  };

  const selectCity = (index: number, city: string) => {
    const updatedZones = [...(formData.profile?.mobilityZone || [])];
    updatedZones[index] = { ...updatedZones[index], value: city };
    setFormData(prev => ({
      ...prev,
      profile: {
        ...prev.profile,
        mobilityZone: updatedZones,
      },
    }));
    setCitySearchQuery(prev => ({ ...prev, [index]: city }));
    setShowCityDropdown(prev => ({ ...prev, [index]: false }));
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    if (name.includes('.')) {
      const [parent, child] = name.split('.');
      setFormData(prev => ({
        ...prev,
        [parent]: {
          ...(prev as any)[parent],
          [child]: value,
        },
      }));
    } else if (name === 'experience') {
        setFormData(prev => ({ ...prev, profile: { ...prev.profile, experience: Number(value) } }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      // Traitement silencieux des zones de mobilité pour Paris
      const processedMobilityZone = formData.profile?.mobilityZone ? [...formData.profile.mobilityZone] : undefined;
      
      if (processedMobilityZone) {
        const hasParisCity = processedMobilityZone.some(z => z.type === 'ville' && z.value === 'Paris');
        const hasParisDept = processedMobilityZone.some(z => z.type === 'departement' && z.value === '75');

        if (hasParisCity && !hasParisDept) {
          processedMobilityZone.push({ type: 'departement', value: '75' });
        } else if (hasParisDept && !hasParisCity) {
          processedMobilityZone.push({ type: 'ville', value: 'Paris' });
        }
      }

      // Send only the fields that are specific to the comedian's profile update
      const comedianProfileData: any = {
        firstName: formData.firstName,
        lastName: formData.lastName,
        email: formData.email,
        city: formData.city,
        phone: formData.phone,
        address: formData.address,
        gender: formData.gender,
        profile: {
            bio: formData.profile?.bio,
            experience: formData.profile?.experience ? Number(formData.profile.experience) : undefined,
            numberOfScenes: formData.profile?.numberOfScenes || undefined,
            comedyStyle: formData.profile?.comedyStyle || undefined,
            performanceLanguages: formData.profile?.performanceLanguages || undefined,
            mobilityZone: processedMobilityZone,
            socialLinks: {
              youtube: formData.profile?.socialLinks?.youtube || undefined,
              instagram: formData.profile?.socialLinks?.instagram || undefined,
              facebook: formData.profile?.socialLinks?.facebook || undefined,
            }
        }
      };

      // Only include avatarUrl if it was actually changed (new upload or removed)
      // This avoids sending ~1MB of base64 data on every profile save
      if (avatarChanged) {
        comedianProfileData.avatarUrl = avatarRemoved ? null : formData.avatarUrl;
      }

      await api.put(`/profile/${currentUser._id}`, comedianProfileData);
      showSuccess(SuccessMessages.PROFILE_UPDATED);
      onSaveSuccess();
    } catch (err: any) {
      console.error('Erreur lors de la mise à jour du profil:', err.response?.data || err.message);
      showError(getErrorMessage(err, ErrorMessages.PROFILE_UPDATE_FAILED));
    } finally {
      setLoading(false);
    }
  };

  const inputStyle: CSSProperties = {
    width: '100%',
    padding: '10px',
    marginBottom: '15px',
    borderRadius: '5px',
    border: '1px solid #444',
    backgroundColor: '#333',
    color: '#fff',
  };

  const buttonStyle: CSSProperties = {
    padding: '10px 20px',
    borderRadius: '8px',
    border: 'none',
    background: 'linear-gradient(to right, #ff416c, #ff4b2b)',
    color: 'white',
    fontSize: '1em',
    fontWeight: 'bold',
    cursor: 'pointer',
    transition: 'background 0.3s ease',
    marginRight: '10px',
  };

  const cancelButtonClass: CSSProperties = {
    ...buttonStyle,
    backgroundColor: '#6c757d',
    backgroundImage: 'none',
  };

  const labelStyle: CSSProperties = {
    display: 'block',
    marginBottom: '5px',
    fontWeight: 'bold',
    color: '#ff4b2b',
    fontSize: '0.9em',
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <h2 style={{ color: '#ff416c', marginBottom: '20px' }}>Modifier le Profil Humoriste</h2>
      <form onSubmit={handleSubmit}>
        <label style={labelStyle}>Photo de profil</label>
        <div style={{ marginBottom: '15px' }}>
          {previewImage && (
            <div style={{ marginBottom: '10px', textAlign: 'center' }}>
              <img 
                src={previewImage} 
                alt="Aperçu" 
                style={{ 
                  width: '100px', 
                  height: '100px', 
                  borderRadius: '50%', 
                  objectFit: 'cover',
                  border: '2px solid #ff416c'
                }} 
              />
            </div>
          )}
          {(previewImage || (!previewImage && !avatarRemoved && currentUser?.avatarUrl)) && (
            <button
              type="button"
              onClick={handleRemoveAvatar}
              style={{
                marginBottom: '10px',
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                backgroundColor: 'rgba(220, 53, 69, 0.15)',
                color: '#ffb3b3',
                cursor: 'pointer',
              }}
            >
              Supprimer la photo
            </button>
          )}
          <input
            type="file"
            accept=".jpg,.jpeg,.png,.gif,image/jpeg,image/png,image/gif"
            onChange={handleImageChange}
            style={{
              width: '100%',
              padding: '8px',
              borderRadius: '5px',
              border: '1px solid #444',
              backgroundColor: '#333',
              color: '#fff',
              cursor: 'pointer'
            }}
          />
          <p style={{ fontSize: '0.85em', color: '#aaa', marginTop: '5px' }}>
            Formats acceptés: JPG, PNG, GIF (max 5MB)
          </p>
        </div>
        
        <label style={labelStyle}>Prénom *</label>
        <input
          type="text"
          name="firstName"
          value={formData.firstName}
          onChange={handleChange}
          placeholder="Entrez votre prénom"
          style={inputStyle}
          required
        />
        
        <label style={labelStyle}>Nom *</label>
        <input
          type="text"
          name="lastName"
          value={formData.lastName}
          onChange={handleChange}
          placeholder="Entrez votre nom"
          style={inputStyle}
          required
        />
        
        <label style={labelStyle}>Email *</label>
        <input
          type="email"
          name="email"
          value={formData.email}
          onChange={handleChange}
          placeholder="Entrez votre email"
          style={inputStyle}
          required
        />
        
        <label style={labelStyle}>Ville</label>
        <input
          type="text"
          name="city"
          value={formData.city || ''}
          onChange={handleChange}
          placeholder="Entrez votre ville"
          style={inputStyle}
        />
        
        <label style={labelStyle}>Téléphone</label>
        <input
          type="text"
          name="phone"
          value={formData.phone || ''}
          onChange={handleChange}
          placeholder="Entrez votre numéro de téléphone"
          style={inputStyle}
        />
        
        <label style={labelStyle}>Genre</label>
        <select
          name="gender"
          value={formData.gender || ''}
          onChange={handleChange}
          style={inputStyle}
        >
          <option value="">Sélectionnez votre genre</option>
          <option value="femme">Femme</option>
          <option value="homme">Homme</option>
        </select>
        
        <label style={labelStyle}>Adresse</label>
        <input
          type="text"
          name="address"
          value={formData.address || ''}
          onChange={handleChange}
          placeholder="Entrez votre adresse complète"
          style={inputStyle}
        />
        
        <label style={labelStyle}>Bio</label>
        <textarea
          name="profile.bio"
          value={formData.profile?.bio || ''}
          onChange={handleChange}
          placeholder="Décrivez votre style d'humour et votre parcours..."
          rows={5}
          style={inputStyle}
        ></textarea>
        
        <label style={labelStyle}>Années d'expérience</label>
        <input
          type="number"
          name="profile.experience"
          value={formData.profile?.experience || ''}
          onChange={handleChange}
          placeholder="Nombre d'années d'expérience"
          style={inputStyle}
        />
        
        <label style={labelStyle}>Nombre de scènes jouées *</label>
        <select
          name="profile.numberOfScenes"
          value={formData.profile?.numberOfScenes || ''}
          onChange={handleChange}
          style={inputStyle}
        >
          <option value="">Sélectionnez votre niveau</option>
          <option value="0-50">0-50 scènes (Débutant)</option>
          <option value="50-200">50-200 scènes (Expérimenté)</option>
          <option value="200+">200+ scènes (Pro)</option>
        </select>
        
        
        <label id="section-comedy-style" style={labelStyle}>Style de comédie</label>
        <div style={{ marginBottom: '15px' }}>
          {[
            { value: 'stand-up', label: 'Stand up (solo en interaction avec le public)' },
            { value: 'improvisation', label: 'Improvisation (création spontanée à partir d\'un contexte)' },
            { value: 'plateau', label: 'Plateau (plusieurs artistes se succèdent lors d\'une soirée)' },
            { value: 'sketch', label: 'Sketch (une scène courte pré écrite)' }
          ].map(style => (
            <label key={style.value} style={{ display: 'flex', alignItems: 'flex-start', marginBottom: '8px', color: '#fff', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={formData.profile?.comedyStyle?.includes(style.value as any) || false}
                onChange={(e) => {
                  const currentStyles = formData.profile?.comedyStyle || [];
                  if (e.target.checked) {
                    setFormData(prev => ({
                      ...prev,
                      profile: {
                        ...prev.profile,
                        comedyStyle: [...currentStyles, style.value as any],
                      },
                    }));
                  } else {
                    setFormData(prev => ({
                      ...prev,
                      profile: {
                        ...prev.profile,
                        comedyStyle: currentStyles.filter(s => s !== style.value),
                      },
                    }));
                  }
                }}
                style={{ marginRight: '10px', width: '18px', height: '18px', minWidth: '18px', minHeight: '18px', flexShrink: 0 }}
              />
              <span>{style.label}</span>
            </label>
          ))}
        </div>
        
        <label id="section-languages" style={labelStyle}>Langues</label>
        <div style={{ marginBottom: '15px' }}>
          {[
            { value: 'francais', label: 'Français' },
            { value: 'arabe', label: 'Arabe' },
            { value: 'anglais', label: 'Anglais' },
            { value: 'italien', label: 'Italien' },
            { value: 'espagnol', label: 'Espagnol' }
          ].map(lang => (
            <label key={lang.value} style={{ display: 'flex', alignItems: 'flex-start', marginBottom: '8px', color: '#fff', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={formData.profile?.performanceLanguages?.includes(lang.value as any) || false}
                onChange={(e) => {
                  const currentLanguages = formData.profile?.performanceLanguages || [];
                  if (e.target.checked) {
                    setFormData(prev => ({
                      ...prev,
                      profile: {
                        ...prev.profile,
                        performanceLanguages: [...currentLanguages, lang.value as any],
                      },
                    }));
                  } else {
                    setFormData(prev => ({
                      ...prev,
                      profile: {
                        ...prev.profile,
                        performanceLanguages: currentLanguages.filter(l => l !== lang.value),
                      },
                    }));
                  }
                }}
                style={{ marginRight: '10px', width: '18px', height: '18px', minWidth: '18px', minHeight: '18px', flexShrink: 0, cursor: 'pointer'}}
              />
              <span>{lang.label}</span>
            </label>
          ))}
        </div>
        
        <h3 id="section-mobility" style={{ color: '#ff4b2b', marginTop: '20px', marginBottom: '15px', fontSize: '1.1em' }}>Zone de mobilité</h3>
        <p style={{ fontSize: '0.85em', color: '#aaa', marginBottom: '15px' }}>
          Indiquez les villes, départements ou régions où vous êtes disponible pour des événements.
        </p>
        <div style={{ marginBottom: '20px' }}>
          {(formData.profile?.mobilityZone || []).map((zone, index) => (
            <div key={index} style={{
              marginBottom: '10px',
              padding: '10px',
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              borderRadius: '5px',
            }}>
              {/* Ligne 1 : type + supprimer */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '8px' }}>
                <select
                  value={zone.type}
                  onChange={(e) => {
                    const updatedZones = [...(formData.profile?.mobilityZone || [])];
                    updatedZones[index] = { ...updatedZones[index], type: e.target.value as 'ville' | 'departement' | 'region', value: '' };
                    setFormData(prev => ({
                      ...prev,
                      profile: {
                        ...prev.profile,
                        mobilityZone: updatedZones,
                      },
                    }));
                    setCitySearchQuery(prev => ({ ...prev, [index]: '' }));
                    setShowCityDropdown(prev => ({ ...prev, [index]: false }));
                  }}
                  style={{
                    ...inputStyle,
                    marginBottom: 0,
                    flex: 1,
                  }}
                >
                  <option value="ville">Ville</option>
                  <option value="departement">Département</option>
                  <option value="region">Région</option>
                </select>
                <button
                  type="button"
                  onClick={() => {
                    const updatedZones = (formData.profile?.mobilityZone || []).filter((_, i) => i !== index);
                    setFormData(prev => ({
                      ...prev,
                      profile: {
                        ...prev.profile,
                        mobilityZone: updatedZones,
                      },
                    }));
                    setCitySearchQuery(prev => {
                      const newQuery = { ...prev };
                      delete newQuery[index];
                      return newQuery;
                    });
                  }}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '5px',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    backgroundColor: 'rgba(220, 53, 69, 0.15)',
                    color: '#ffb3b3',
                    cursor: 'pointer',
                    fontSize: '0.9em',
                    flexShrink: 0,
                  }}
                >
                  Supprimer
                </button>
              </div>
              {/* Ligne 2 : champ valeur pleine largeur */}
              <div style={{ position: 'relative' }}>
                {zone.type === 'region' && (
                  <select
                    value={zone.value}
                    onChange={(e) => {
                      const updatedZones = [...(formData.profile?.mobilityZone || [])];
                      updatedZones[index] = { ...updatedZones[index], value: e.target.value };
                      setFormData(prev => ({
                        ...prev,
                        profile: {
                          ...prev.profile,
                          mobilityZone: updatedZones,
                        },
                      }));
                    }}
                    style={{
                      ...inputStyle,
                      marginBottom: 0,
                      width: '100%',
                    }}
                  >
                    <option value="">Sélectionnez une région</option>
                    {Object.keys(FRENCH_REGIONS).map(region => (
                      <option key={region} value={region}>{region}</option>
                    ))}
                  </select>
                )}

                {zone.type === 'departement' && (
                  <select
                    value={zone.value}
                    onChange={(e) => {
                      const updatedZones = [...(formData.profile?.mobilityZone || [])];
                      updatedZones[index] = { ...updatedZones[index], value: e.target.value };
                      setFormData(prev => ({
                        ...prev,
                        profile: {
                          ...prev.profile,
                          mobilityZone: updatedZones,
                        },
                      }));
                    }}
                    style={{
                      ...inputStyle,
                      marginBottom: 0,
                      width: '100%',
                    }}
                  >
                    <option value="">Sélectionnez un département</option>
                    {DEPARTMENTS_ORDER.map(code => (
                      <option key={code} value={code}>{code} - {FRENCH_DEPARTMENTS[code]}</option>
                    ))}
                  </select>
                )}

                {zone.type === 'ville' && (
                  <>
                    <input
                      type="text"
                      value={citySearchQuery[index] ?? zone.value}
                      onChange={(e) => handleCitySearch(e, index)}
                      onFocus={() => {
                        if ((citySearchQuery[index] ?? zone.value).length >= 2) {
                          setShowCityDropdown(prev => ({ ...prev, [index]: true }));
                        }
                      }}
                      placeholder="Rechercher une ville..."
                      style={{
                        ...inputStyle,
                        marginBottom: 0,
                        width: '100%',
                      }}
                    />
                    {showCityDropdown[index] && citySuggestions[index]?.length > 0 && (
                      <div
                        style={{
                          position: 'absolute',
                          top: '100%',
                          left: 0,
                          right: 0,
                          backgroundColor: '#2a2a2a',
                          border: '1px solid #444',
                          borderRadius: '4px',
                          maxHeight: '200px',
                          overflowY: 'auto',
                          zIndex: 1000,
                          marginTop: '4px',
                        }}
                      >
                        {citySuggestions[index].map((suggestion, i) => (
                          <div
                            key={i}
                            onClick={() => selectCity(index, suggestion.city)}
                            style={{
                              padding: '10px',
                              cursor: 'pointer',
                              borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                              color: '#fff',
                            }}
                            onMouseEnter={(e) => {
                              (e.currentTarget as HTMLDivElement).style.backgroundColor = 'rgba(255, 65, 108, 0.2)';
                            }}
                            onMouseLeave={(e) => {
                              (e.currentTarget as HTMLDivElement).style.backgroundColor = 'transparent';
                            }}
                          >
                            <div>{suggestion.city}</div>
                            <div style={{ fontSize: '0.8em', color: '#aaa' }}>{suggestion.postcode}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={() => {
              setFormData(prev => ({
                ...prev,
                profile: {
                  ...prev.profile,
                  mobilityZone: [
                    ...(prev.profile?.mobilityZone || []),
                    { type: 'ville' as const, value: '' }
                  ],
                },
              }));
            }}
            style={{
              padding: '10px 15px',
              borderRadius: '5px',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              backgroundColor: 'rgba(255, 65, 108, 0.15)',
              color: '#ff416c',
              cursor: 'pointer',
              fontSize: '0.9em',
              fontWeight: 'bold',
            }}
          >
            + Ajouter une zone
          </button>
        </div>
        
        <h3 style={{ color: '#ff4b2b', marginTop: '20px', marginBottom: '15px', fontSize: '1.1em' }}>Réseaux sociaux</h3>
        
        <label style={labelStyle}>Lien YouTube</label>
        <input
          type="url"
          name="profile.socialLinks.youtube"
          value={formData.profile?.socialLinks?.youtube || ''}
          onChange={(e) => {
            setFormData(prev => ({
              ...prev,
              profile: {
                ...prev.profile,
                socialLinks: {
                  ...prev.profile?.socialLinks,
                  youtube: e.target.value,
                },
              },
            }));
          }}
          placeholder="https://www.youtube.com/@votre-chaine"
          style={inputStyle}
        />
        
        <label style={labelStyle}>Lien Instagram</label>
        <input
          type="url"
          name="profile.socialLinks.instagram"
          value={formData.profile?.socialLinks?.instagram || ''}
          onChange={(e) => {
            setFormData(prev => ({
              ...prev,
              profile: {
                ...prev.profile,
                socialLinks: {
                  ...prev.profile?.socialLinks,
                  instagram: e.target.value,
                },
              },
            }));
          }}
          placeholder="https://www.instagram.com/votre-compte"
          style={inputStyle}
        />
        
        <label style={labelStyle}>Lien Facebook</label>
        <input
          type="url"
          name="profile.socialLinks.facebook"
          value={formData.profile?.socialLinks?.facebook || ''}
          onChange={(e) => {
            setFormData(prev => ({
              ...prev,
              profile: {
                ...prev.profile,
                socialLinks: {
                  ...prev.profile?.socialLinks,
                  facebook: e.target.value,
                },
              },
            }));
          }}
          placeholder="https://www.facebook.com/votre-page"
          style={inputStyle}
        />
        <button type="submit" style={buttonStyle} disabled={loading}>
          {loading ? 'Sauvegarde...' : 'Sauvegarder'}
        </button>
        <button type="button" style={cancelButtonClass} onClick={onClose} disabled={loading}>
          Annuler
        </button>
      </form>
    </Modal>
  );
}

export default EditComedianProfileForm; 