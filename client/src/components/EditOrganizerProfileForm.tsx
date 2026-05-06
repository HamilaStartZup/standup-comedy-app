import React, { useState, type CSSProperties, useEffect } from 'react';
import type { IUserData } from '../types/user';
import api from '../services/api';
import { useAuth } from '../hooks/useAuth';
import { useAlert } from '../hooks/useAlert';
import { usePostalCodeValidation } from '../hooks/usePostalCodeValidation';
import { getErrorMessage, ErrorMessages, SuccessMessages, WarningMessages } from '../services/systemMessages';

interface EditOrganizerProfileFormProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: IUserData;
  onSaveSuccess: () => void;
  scrollToField?: string;
}

type OrganizerFormData = {
  firstName: string;
  lastName: string;
  email: string;
  city: string;
  address: string;
  gender: string;
  avatarUrl: string | null;
  organizerProfile: {
    companyName: string;
    description: string;
    website: string;
    venueTypes: string;
    eventFrequency: string;
    phone: string;
    location: {
      city: string;
      postalCode: string;
      address: string;
    };
  };
};

function EditOrganizerProfileForm({ isOpen, onClose, currentUser, onSaveSuccess, scrollToField }: EditOrganizerProfileFormProps) {
  const { isLoading } = useAuth();
  const { showSuccess, showError, showWarning } = useAlert();
  const [formData, setFormData] = useState<OrganizerFormData>({
    firstName: currentUser.firstName || '',
    lastName: currentUser.lastName || '',
    email: currentUser.email || '',
    city: currentUser.city || '',
    address: currentUser.address || '',
    gender: currentUser.gender || '',
    avatarUrl: currentUser.avatarUrl || null,
    organizerProfile: {
      companyName: currentUser.organizerProfile?.companyName || '',
      description: currentUser.organizerProfile?.description || '',
      website: currentUser.organizerProfile?.website || '',
      venueTypes: currentUser.organizerProfile?.venueTypes?.join(', ') || '',
      eventFrequency: currentUser.organizerProfile?.eventFrequency || 'monthly',
      phone: currentUser.organizerProfile?.phone || '',

      location: {
        city: currentUser.organizerProfile?.location?.city || '',
        postalCode: currentUser.organizerProfile?.location?.postalCode || '',
        address: currentUser.organizerProfile?.location?.address || '',
      },
    },
  });
  const [previewImage, setPreviewImage] = useState<string | null>(currentUser?.avatarUrl || null);
  const [avatarRemoved, setAvatarRemoved] = useState(false);
  const [avatarChanged, setAvatarChanged] = useState(false); // Track if avatar was actually changed
  const [postalCodeError, setPostalCodeError] = useState<string>('');
  const [citySuggestions, setCitySuggestions] = useState<Array<{ city: string; postcode: string }>>([]);
  const [showCityDropdown, setShowCityDropdown] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  // Hook de validation du code postal
  const { isValidating, error, cities, validatePostalCode, clearError } = usePostalCodeValidation({
    postalCode: formData.organizerProfile.location.postalCode,
    onCityAutoFill: (city) => {
      // TOUJOURS remplacer
      setFormData(prev => ({
        ...prev,
        organizerProfile: {
          ...prev.organizerProfile,
          location: { ...prev.organizerProfile.location, city }
        }
      }));
      setShowCityDropdown(false);
    },
    onMultipleCities: (cityOptions) => {
      setCitySuggestions(cityOptions);
      setShowCityDropdown(true);
    }
  });

  // Auto-validate when postal code reaches 5 digits
  useEffect(() => {
    const trimmedPostalCode = formData.organizerProfile.location.postalCode.trim();

    // Skip validation on initial load or if already validating
    if (isInitialLoad || !trimmedPostalCode || isValidating) {
      return;
    }

    // Only validate if we have exactly 5 digits
    if (trimmedPostalCode.length === 5 && /^\d{5}$/.test(trimmedPostalCode)) {
      validatePostalCode();
    }
  }, [formData.organizerProfile.location.postalCode, isInitialLoad, isValidating]);

  useEffect(() => {
    if (currentUser) {
      setFormData({
        firstName: currentUser.firstName || '',
        lastName: currentUser.lastName || '',
        email: currentUser.email || '',
        city: currentUser.city || '',
        address: currentUser.address || '',
        gender: currentUser.gender || '',
        avatarUrl: currentUser.avatarUrl || null,
        organizerProfile: {
          companyName: currentUser.organizerProfile?.companyName || '',
          description: currentUser.organizerProfile?.description || '',
          website: currentUser.organizerProfile?.website || '',
          venueTypes: currentUser.organizerProfile?.venueTypes?.join(', ') || '',
          eventFrequency: currentUser.organizerProfile?.eventFrequency || 'monthly',
          phone: currentUser.organizerProfile?.phone || '',

          location: {
            city: currentUser.organizerProfile?.location?.city || '',
            postalCode: currentUser.organizerProfile?.location?.postalCode || '',
            address: currentUser.organizerProfile?.location?.address || '',
          },
        },
      });
      setPreviewImage(currentUser.avatarUrl || null);
      setAvatarRemoved(false);
      setAvatarChanged(false);
      setIsInitialLoad(true);
    }
  }, [currentUser]);

  useEffect(() => {
    if (isOpen && scrollToField) {
      setTimeout(() => {
        const el = document.getElementById(scrollToField);
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    }
  }, [isOpen, scrollToField]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      showWarning(WarningMessages.IMAGE_TOO_LARGE);
      return;
    }
    if (!file.type.startsWith('image/')) {
      showWarning(WarningMessages.IMAGE_REQUIRED);
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
  };

  const handleRemoveAvatar = () => {
    setPreviewImage(null);
    setFormData(prev => ({ ...prev, avatarUrl: null }));
    setAvatarRemoved(true);
    setAvatarChanged(true); // Mark avatar as changed (removed)
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { id, value } = e.target;

    // Clear postal code error when user types
    if (id === 'organizerProfile.location.postalCode') {
      clearError();
      setPostalCodeError('');
      setIsInitialLoad(false); // Enable validation after first user interaction
    }

if (id.startsWith('organizerProfile.location.')) {
      const nestedField = id.split('.')[2];
      setFormData(prev => ({
        ...prev,
        organizerProfile: {
          ...prev.organizerProfile,
          location: {
            ...prev.organizerProfile.location,
            [nestedField]: value,
          },
        },
      }));
    } else if (id.startsWith('organizerProfile.')) {
      const nestedField = id.split('.')[1];
      setFormData(prev => ({
        ...prev,
        organizerProfile: {
          ...prev.organizerProfile,
          [nestedField]: value,
        },
      }));
    } else if (id === 'organizerProfile.phone') {
      setFormData(prev => ({ ...prev, organizerProfile: { ...prev.organizerProfile, phone: value } }));
    } else {
      setFormData(prev => ({
        ...prev,
        [id]: value,
      }));
    }
  };

  const handleCitySelect = (city: string) => {
    setFormData(prev => ({
      ...prev,
      organizerProfile: {
        ...prev.organizerProfile,
        location: { ...prev.organizerProfile.location, city }
      }
    }));
    setShowCityDropdown(false);
    setCitySuggestions([]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('currentUser.id:', currentUser?.id, 'currentUser._id:', currentUser?._id, 'currentUser:', currentUser);
    if (isLoading) return;
    if (!(currentUser?.id || currentUser?._id)) {
      showWarning(WarningMessages.AUTH_REQUIRED_PROFILE_EDIT);
      return;
    }

    try {
      const updatedData: any = {
        firstName: formData.firstName,
        lastName: formData.lastName,
        email: formData.email,
        city: formData.city,
        address: formData.address,
        gender: formData.gender || undefined,
        organizerProfile: {
          companyName: formData.organizerProfile.companyName,
          description: formData.organizerProfile.description,
          website: formData.organizerProfile.website,
          venueTypes: formData.organizerProfile.venueTypes.split(', ').map(type => type.trim()),
          eventFrequency: formData.organizerProfile.eventFrequency,
          phone: formData.organizerProfile.phone,

          location: {
            city: formData.organizerProfile.location.city,
            postalCode: formData.organizerProfile.location.postalCode,
            address: formData.organizerProfile.location.address,
          },
        },
      };

      // Only include avatarUrl if it was actually changed (new upload or removed)
      // This avoids sending ~1MB of base64 data on every profile save
      if (avatarChanged) {
        updatedData.avatarUrl = avatarRemoved ? null : formData.avatarUrl;
      }

      const userId = currentUser.id || currentUser._id;
      const res = await api.put(`/profile/${userId}`, updatedData);
      console.log('Profil mis à jour:', res.data);
      showSuccess(SuccessMessages.PROFILE_UPDATED);
      onSaveSuccess();
      onClose();
    } catch (error: any) {
      console.error('Erreur lors de la mise à jour du profil:', error.response?.status);
      showError(getErrorMessage(error, ErrorMessages.PROFILE_UPDATE_FAILED));
    }
  };

  if (!isOpen) return null;
  if (isLoading || !currentUser) {
    return <div style={{ color: '#fff', textAlign: 'center', marginTop: 40 }}>Chargement du profil...</div>;
  }

  const formContainerStyle: CSSProperties = {
    position: 'fixed',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    backgroundColor: '#1a1a2e',
    padding: '30px',
    borderRadius: '10px',
    boxShadow: '0 5px 15px rgba(0, 0, 0, 0.5)',
    width: '90%',
    maxWidth: '700px',
    zIndex: 2000,
    color: '#ffffff',
    maxHeight: '90vh',
    overflowY: 'auto',
    border: '1px solid rgba(255, 255, 255, 0.1)',
  };

  const overlayStyle: CSSProperties = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    zIndex: 1999,
  };

  const titleStyle: CSSProperties = {
    fontSize: '2em',
    color: '#ff416c',
    marginBottom: '20px',
    textAlign: 'center',
  };

  const inputGroupStyle: CSSProperties = {
    marginBottom: '15px',
  };

  const labelStyle: CSSProperties = {
    display: 'block',
    marginBottom: '5px',
    fontWeight: 'bold',
    color: '#ff4b2b',
  };

  const inputStyle: CSSProperties = {
    width: '100%',
    padding: '10px',
    borderRadius: '5px',
    border: '1px solid #555',
    backgroundColor: '#333',
    color: '#ffffff',
    boxSizing: 'border-box',
  };

  const textAreaStyle: CSSProperties = {
    ...inputStyle,
    minHeight: '80px',
    resize: 'vertical',
  };

  const twoColumnLayout: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '15px',
    marginBottom: '15px',
  };

  const buttonContainerStyle: CSSProperties = {
    marginTop: '30px',
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '15px',
  };

  const primaryButtonStyle: CSSProperties = {
    padding: '10px 20px',
    borderRadius: '8px',
    border: 'none',
    background: 'linear-gradient(to right, #28a745, #218838)',
    color: 'white',
    fontSize: '1em',
    fontWeight: 'bold',
    cursor: 'pointer',
    transition: 'background 0.3s ease',
  };

  const secondaryButtonStyle: CSSProperties = {
    padding: '10px 20px',
    borderRadius: '8px',
    border: 'none',
    background: 'linear-gradient(to right, #dc3545, #c82333)',
    color: 'white',
    fontSize: '1em',
    fontWeight: 'bold',
    cursor: 'pointer',
    transition: 'background 0.3s ease',
  };

  const closeButtonStyle: CSSProperties = {
    position: 'absolute',
    top: '15px',
    right: '15px',
    background: 'none',
    border: 'none',
    fontSize: '1.5em',
    cursor: 'pointer',
    color: '#ffffff',
  };

  return (
    <div style={overlayStyle}>
      <div style={formContainerStyle}>
        <button onClick={onClose} style={closeButtonStyle}>&times;</button>
        <h2 style={titleStyle}>Modifier le Profil Organisateur</h2>
        <form onSubmit={handleSubmit}>
          <h3 style={{ color: '#ff4b2b', marginBottom: '15px' }}>Photo de profil</h3>
          {previewImage && (
            <div style={{ textAlign: 'center', marginBottom: '10px' }}>
              <img
                src={previewImage}
                alt="Aperçu"
                style={{
                  width: '110px',
                  height: '110px',
                  borderRadius: '50%',
                  objectFit: 'cover',
                  border: '2px solid #ff416c',
                }}
              />
            </div>
          )}
          {(previewImage || (!previewImage && !avatarRemoved && currentUser?.avatarUrl)) && (
            <button
              type="button"
              onClick={handleRemoveAvatar}
              style={{
                marginBottom: '15px',
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
          <div style={{ marginBottom: '20px' }}>
            <input
              type="file"
              accept="image/*"
              onChange={handleImageChange}
              style={{
                width: '100%',
                padding: '8px',
                borderRadius: '5px',
                border: '1px solid #444',
                backgroundColor: '#333',
                color: '#fff',
                cursor: 'pointer',
              }}
            />
            <p style={{ fontSize: '0.85em', color: '#aaa', marginTop: '5px' }}>
              Formats acceptés: JPG, PNG, GIF (max 5MB)
            </p>
          </div>
          {/* Informations personnelles */}
          <h3 style={{ color: '#ff4b2b', marginBottom: '15px' }}>Informations personnelles</h3>
          <div style={twoColumnLayout}>
            <div style={inputGroupStyle}>
              <label htmlFor="firstName" style={labelStyle}>Prénom</label>
              <input type="text" id="firstName" style={inputStyle} value={formData.firstName} onChange={handleChange} required />
            </div>
            <div style={inputGroupStyle}>
              <label htmlFor="lastName" style={labelStyle}>Nom</label>
              <input type="text" id="lastName" style={inputStyle} value={formData.lastName} onChange={handleChange} required />
            </div>
          </div>
          <div style={inputGroupStyle}>
            <label htmlFor="email" style={labelStyle}>Email</label>
            <input type="email" id="email" style={inputStyle} value={formData.email} onChange={handleChange} required />
          </div>
          <div style={inputGroupStyle}>
            <label htmlFor="city" style={labelStyle}>Ville</label>
            <input type="text" id="city" style={inputStyle} value={formData.city} onChange={handleChange} placeholder="Paris" />
          </div>
          <div style={inputGroupStyle}>
            <label htmlFor="organizerProfile.phone" style={labelStyle}>Téléphone</label>
            <input type="tel" id="organizerProfile.phone" style={inputStyle} value={formData.organizerProfile.phone} onChange={handleChange} placeholder="06 12 34 56 78" />
          </div>
          <div style={inputGroupStyle}>
            <label htmlFor="address" style={labelStyle}>Adresse</label>
            <input type="text" id="address" style={inputStyle} value={formData.address} onChange={handleChange} placeholder="123 rue de la Comédie" />
          </div>
          <div style={inputGroupStyle}>
            <label htmlFor="gender" style={labelStyle}>Genre</label>
            <select id="gender" style={inputStyle} value={formData.gender} onChange={handleChange}>
              <option value="">Non défini</option>
              <option value="femme">Femme</option>
              <option value="homme">Homme</option>
            </select>
          </div>

          {/* Profil Organisateur */}
          <h3 style={{ color: '#ff4b2b', marginTop: '30px', marginBottom: '15px' }}>Profil Organisateur</h3>
          <div style={twoColumnLayout}>
            <div style={inputGroupStyle}>
              <label htmlFor="organizerProfile.companyName" style={labelStyle}>Nom de l'entreprise</label>
              <input type="text" id="organizerProfile.companyName" style={inputStyle} value={formData.organizerProfile.companyName} onChange={handleChange} />
            </div>
            <div style={inputGroupStyle}>
              <label htmlFor="organizerProfile.location.city" style={labelStyle}>Ville</label>
              <input
                id="organizerProfile.location.city"
                type="text"
                value={formData.organizerProfile.location.city}
                onChange={handleChange}
                style={inputStyle}
                required
              />
            </div>
          </div>
          <div style={{ ...inputGroupStyle, position: 'relative' }}>
            <label htmlFor="organizerProfile.location.postalCode" style={labelStyle}>
              Code Postal {isValidating && <span style={{ fontSize: '12px', color: '#888' }}>(validation...)</span>}
            </label>
            <input
              id="organizerProfile.location.postalCode"
              type="text"
              value={formData.organizerProfile.location.postalCode}
              onChange={handleChange}
              onBlur={validatePostalCode}
              style={{
                ...inputStyle,
                borderColor: (postalCodeError || error) ? '#ef4444' : undefined
              }}
              maxLength={5}
              disabled={isValidating}
              required
            />
            {(postalCodeError || error) && (
              <p style={{ color: '#ef4444', fontSize: '12px', marginTop: '4px' }}>
                {postalCodeError || error}
              </p>
            )}

            {/* Dropdown de sélection de ville si plusieurs options */}
            {showCityDropdown && citySuggestions.length > 0 && (
              <div style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                backgroundColor: '#fff',
                border: '1px solid #ddd',
                borderRadius: '4px',
                marginTop: '4px',
                maxHeight: '200px',
                overflowY: 'auto',
                zIndex: 1000,
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
              }}>
                <div style={{ padding: '8px', color: '#666', fontSize: '12px', borderBottom: '1px solid #eee' }}>
                  Plusieurs villes pour ce code postal :
                </div>
                {citySuggestions.map((option, index) => (
                  <div
                    key={index}
                    onClick={() => handleCitySelect(option.city)}
                    style={{
                      padding: '10px',
                      cursor: 'pointer',
                      borderBottom: index < citySuggestions.length - 1 ? '1px solid #eee' : 'none',
                      color: '#333'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f5f5f5'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    {option.city}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div style={inputGroupStyle}>
            <label htmlFor="organizerProfile.location.address" style={labelStyle}>Adresse complète</label>
            <input
              id="organizerProfile.location.address"
              type="text"
              value={formData.organizerProfile.location.address}
              onChange={handleChange}
              style={inputStyle}
              placeholder="Ex: 123 rue de la Comédie"
            />
          </div>
          <div style={inputGroupStyle}>
            <label htmlFor="organizerProfile.description" style={labelStyle}>Description</label>
            <textarea id="organizerProfile.description" style={textAreaStyle} value={formData.organizerProfile.description} onChange={handleChange}></textarea>
          </div>
          <div style={inputGroupStyle}>
            <label htmlFor="organizerProfile.website" style={labelStyle}>Site web</label>
            <input type="url" id="organizerProfile.website" style={inputStyle} value={formData.organizerProfile.website} onChange={handleChange} placeholder="https://example.com" />
          </div>
          <div style={inputGroupStyle}>
            <label htmlFor="organizerProfile.venueTypes" style={labelStyle}>Types de lieux (séparés par des virgules)</label>
            <input type="text" id="organizerProfile.venueTypes" style={inputStyle} value={formData.organizerProfile.venueTypes} onChange={handleChange} placeholder="Salle de spectacle, Bar, Théâtre" />
          </div>
          <div style={inputGroupStyle}>
            <label htmlFor="organizerProfile.eventFrequency" style={labelStyle}>Fréquence des évènements</label>
            <select id="organizerProfile.eventFrequency" style={inputStyle} value={formData.organizerProfile.eventFrequency} onChange={handleChange}>
              <option value="weekly">Hebdomadaire</option>
              <option value="monthly">Mensuel</option>
              <option value="occasional">Occasionnel</option>
            </select>
          </div>

          <div style={buttonContainerStyle}>
            <button type="submit" style={primaryButtonStyle}>Enregistrer les modifications</button>
            <button type="button" onClick={onClose} style={secondaryButtonStyle}>Annuler</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default EditOrganizerProfileForm; 