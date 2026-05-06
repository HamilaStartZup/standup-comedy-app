import React, { type CSSProperties, useState, useEffect, useRef } from 'react';
import { useAlert } from '../hooks/useAlert';
import { usePostalCodeValidation } from '../hooks/usePostalCodeValidation';
import type { IEvent } from '../types/event';
import api, { uploadEventImage } from '../services/api';
import { getErrorMessage, ErrorMessages, SuccessMessages, WarningMessages } from '../services/systemMessages';

interface EditEventFormProps {
  onClose: () => void;
  onEventUpdated: () => void;
  eventToEdit: IEvent;
}

function EditEventForm({ onClose, onEventUpdated, eventToEdit }: EditEventFormProps) {
  const { showSuccess, showError, showWarning } = useAlert();
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    city: '',
    postalCode: '',
    address: '',
    country: '',
    date: '',
    venue: '',
    venueType: '',
    maxSpectators: '',
    startTime: '',
    endTime: '',
    minExperience: '',
    maxPerformers: '',
    requiredExperienceLevel: 'all' as 'all' | '0-50' | '50-200' | '200+',
    status: 'published',
    imageUrl: '',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<{[key: string]: string}>({});
  const [uploadingEventImage, setUploadingEventImage] = useState(false);

  // États pour l'auto-complétion
  const isAutoFillingRef = useRef(false);
  const addressSearchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [addressSuggestions, setAddressSuggestions] = useState<Array<{ label: string; city: string; postalCode: string }>>([]);
  const [citySuggestions, setCitySuggestions] = useState<Array<{ city: string; postcode: string }>>([]);
  const [showCityDropdown, setShowCityDropdown] = useState(false);

  // Hook de validation du code postal
  const { isValidating: isValidatingPostalCode, error: postalCodeError, cities, validatePostalCode, clearError: clearPostalCodeError } = usePostalCodeValidation({
    postalCode: formData.postalCode,
    onCityAutoFill: (city) => {
      // TOUJOURS remplacer la ville, même si déjà remplie
      isAutoFillingRef.current = true;
      setFormData(prev => ({ ...prev, city }));
      setTimeout(() => { isAutoFillingRef.current = false; }, 100);
      setShowCityDropdown(false);
    },
    onMultipleCities: (cityOptions) => {
      setCitySuggestions(cityOptions);
      setShowCityDropdown(true);
    }
  });

  useEffect(() => {
    if (eventToEdit) {
      const eventDate = new Date(eventToEdit.date);
      const formattedDate = `${eventDate.getDate().toString().padStart(2, '0')}/${(eventDate.getMonth() + 1).toString().padStart(2, '0')}/${eventDate.getFullYear()}`;

      setFormData({
        title: eventToEdit.title,
        description: eventToEdit.description,
        city: eventToEdit.location.city,
        postalCode: eventToEdit.location.postalCode || '',
        address: eventToEdit.location.address,
        country: eventToEdit.location.country,
        date: formattedDate,
        venue: eventToEdit.location.venue || '',
        venueType: eventToEdit.location.venueType || '',
        maxSpectators: eventToEdit.maxSpectators != null ? String(eventToEdit.maxSpectators) : '',
        startTime: eventToEdit.startTime || '',
        endTime: eventToEdit.endTime || '',
        minExperience: eventToEdit.requirements.minExperience.toString(),
        maxPerformers: eventToEdit.requirements.maxPerformers?.toString() || '',
        requiredExperienceLevel: eventToEdit.requirements.requiredExperienceLevel || 'all',
        status: eventToEdit.status,
        imageUrl: eventToEdit.imageUrl || '',
      });
    }
  }, [eventToEdit]);

  // Auto-validate when postal code reaches 5 digits
  useEffect(() => {
    const trimmedPostalCode = formData.postalCode.trim();

    // Only validate if we have exactly 5 digits and not already validating
    if (trimmedPostalCode.length === 5 && /^\d{5}$/.test(trimmedPostalCode) && !isValidatingPostalCode) {
      validatePostalCode();
    }
  }, [formData.postalCode]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (addressSearchTimeoutRef.current) {
        clearTimeout(addressSearchTimeoutRef.current);
      }
    };
  }, []);

  // Fonction pour rechercher un code postal par ville
  const searchPostalCodeByCity = async (city: string): Promise<{ city: string; postalCode: string } | null> => {
    if (!city || city.length < 2) return null;

    try {
      const response = await fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(city)}&limit=1&type=municipality`);
      const data = await response.json();

      if (data.features && data.features.length > 0) {
        const feature = data.features[0];
        const foundCity = feature.properties.city || feature.properties.name;
        const code = feature.properties.postcode;
        // Vérifier que la ville correspond bien
        if (foundCity.toLowerCase().includes(city.toLowerCase()) || city.toLowerCase().includes(foundCity.toLowerCase())) {
          return { city: foundCity, postalCode: code };
        }
      }
    } catch (error) {
      console.error('Erreur lors de la recherche par ville:', error);
    }
    return null;
  };

  // Fonction pour rechercher ville et code postal par adresse
  const searchLocationByAddress = async (address: string): Promise<Array<{ label: string; city: string; postalCode: string }>> => {
    if (!address || address.length < 5) return [];

    try {
      const response = await fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(address)}&limit=5`);
      const data = await response.json();

      if (data.features && data.features.length > 0) {
        return data.features.map((feature: any) => ({
          label: feature.properties.label,
          city: feature.properties.city || feature.properties.name,
          postalCode: feature.properties.postcode
        }));
      }
    } catch (error) {
      console.error('Erreur lors de la recherche par adresse:', error);
    }
    return [];
  };

  const handleCitySelect = (city: string) => {
    isAutoFillingRef.current = true;
    setFormData(prev => ({ ...prev, city }));
    setTimeout(() => { isAutoFillingRef.current = false; }, 100);
    setShowCityDropdown(false);
    setCitySuggestions([]);
  };

  const handleSelectAddressSuggestion = (suggestion: { label: string; city: string; postalCode: string }) => {
    isAutoFillingRef.current = true;
    setFormData(prev => ({
      ...prev,
      address: suggestion.label,
      city: suggestion.city,
      postalCode: suggestion.postalCode
    }));
    setAddressSuggestions([]);
    setTimeout(() => {
      isAutoFillingRef.current = false;
    }, 100);
  };

  const ALLOWED_EVENT_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif'];
  const handleEventImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      showWarning('Fichier trop volumineux. Formats acceptés: JPG, PNG, GIF (max 5MB).');
      return;
    }
    if (!ALLOWED_EVENT_IMAGE_TYPES.includes(file.type)) {
      showWarning('Formats acceptés: JPG, PNG, GIF (max 5MB).');
      return;
    }
    setUploadingEventImage(true);
    try {
      const { imageUrl } = await uploadEventImage(file);
      setFormData(prev => ({ ...prev, imageUrl }));
    } catch (err: any) {
      showWarning(err?.response?.data?.message || 'Erreur lors de l\'upload.');
    } finally {
      setUploadingEventImage(false);
      e.target.value = '';
    }
  };
  const handleRemoveEventImage = () => {
    setFormData(prev => ({ ...prev, imageUrl: '' }));
  };

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { id, value } = e.target;

    // Ne pas auto-remplir si c'est déjà en cours d'auto-remplissage
    if (isAutoFillingRef.current) {
      setFormData(prev => ({
        ...prev,
        [id]: value
      }));
      return;
    }

    setFormData(prev => ({
      ...prev,
      [id]: value
    }));

    // Clear error when user starts typing
    if (errors[id]) {
      setErrors(prev => ({
        ...prev,
        [id]: ''
      }));
    }

    // Clear postal code validation error when user types
    if (id === 'postalCode') {
      clearPostalCodeError();
    }

    // Auto-complétion pour la ville
    if (id === 'city' && value.length >= 3) {
      // Annuler le timeout précédent
      if (addressSearchTimeoutRef.current) {
        clearTimeout(addressSearchTimeoutRef.current);
      }

      // Attendre 800ms après la dernière frappe (plus long car recherche par texte)
      addressSearchTimeoutRef.current = setTimeout(async () => {
        const result = await searchPostalCodeByCity(value);
        if (result) {
          isAutoFillingRef.current = true;
          setFormData(prev => {
            // Ne remplir que si le code postal est vide
            if (!prev.postalCode || prev.postalCode.length < 5) {
              return {
                ...prev,
                postalCode: result.postalCode,
                city: result.city // Utiliser la ville normalisée de l'API
              };
            }
            // Même si le code postal existe, on peut normaliser la ville
            return {
              ...prev,
              city: result.city
            };
          });
          setTimeout(() => {
            isAutoFillingRef.current = false;
          }, 100);
        }
      }, 800);
    }

    // Auto-complétion pour l'adresse
    if (id === 'address' && value.length >= 5) {
      // Annuler le timeout précédent
      if (addressSearchTimeoutRef.current) {
        clearTimeout(addressSearchTimeoutRef.current);
      }

      // Attendre 800ms après la dernière frappe
      addressSearchTimeoutRef.current = setTimeout(async () => {
        const results = await searchLocationByAddress(value);
        setAddressSuggestions(results);
      }, 800);
    } else if (id === 'address' && value.length < 5) {
      setAddressSuggestions([]);
    }
  };

  const validateForm = async () => {
    const newErrors: {[key: string]: string} = {};
    
    // Validation du titre
    if (!formData.title.trim()) {
      newErrors.title = 'Le titre est requis';
    } else if (formData.title.trim().length < 3) {
      newErrors.title = 'Le titre doit contenir au moins 3 caractères';
    }
    
    // Validation de la description
    if (!formData.description.trim()) {
      newErrors.description = 'La description est requise';
    } else if (formData.description.trim().length < 10) {
      newErrors.description = 'La description doit contenir au moins 10 caractères';
    }
    
    // Validation du lieu/bar
    if (!formData.venue.trim()) {
      newErrors.venue = 'Le lieu (nom de la salle) est requis';
    } else if (formData.venue.trim().length < 2) {
      newErrors.venue = 'Le nom de la salle doit contenir au moins 2 caractères';
    }
    
    // Validation de la ville
    if (!formData.city.trim()) {
      newErrors.city = 'La ville est requise';
    } else if (formData.city.trim().length < 2) {
      newErrors.city = 'Le nom de la ville doit contenir au moins 2 caractères';
    }

    // Validation du code postal avec API
    if (!formData.postalCode.trim()) {
      // Le code postal peut être optionnel si adresse et ville sont complètes
      if (!formData.address.trim() || !formData.city.trim()) {
        newErrors.postalCode = 'Le code postal est requis';
      }
    } else {
      // Si un code postal est fourni, on le valide
      const isValid = await validatePostalCode();
      if (!isValid && postalCodeError) {
        newErrors.postalCode = postalCodeError;
      }
    }

    // Validation de l'adresse
    if (!formData.address.trim()) {
      newErrors.address = 'L\'adresse est requise';
    } else if (formData.address.trim().length < 5) {
      newErrors.address = 'L\'adresse doit contenir au moins 5 caractères';
    }

    // Validation du pays
    if (!formData.country.trim()) {
      newErrors.country = 'Le pays est requis';
    } else if (formData.country.trim().length < 2) {
      newErrors.country = 'Le nom du pays doit contenir au moins 2 caractères';
    }
    
    // Validation de la date
    if (!formData.date) {
      newErrors.date = 'La date est requise';
    } else {
      const dateRegex = /^\d{2}\/\d{2}\/\d{4}$/;
      if (!dateRegex.test(formData.date)) {
        newErrors.date = 'Format de date invalide (JJ/MM/AAAA)';
      } else {
        const [day, month, year] = formData.date.split('/').map(Number);
        const selectedDate = new Date(year, month - 1, day);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        if (isNaN(selectedDate.getTime())) {
          newErrors.date = 'Date invalide';
        } else if (selectedDate < today) {
          newErrors.date = 'La date ne peut pas être dans le passé';
        }
      }
    }
    
    // Validation de l'heure de début
    if (!formData.startTime) {
      newErrors.startTime = 'L\'heure de début est requise';
    } else {
      const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
      if (!timeRegex.test(formData.startTime)) {
        newErrors.startTime = 'Format d\'heure invalide (HH:MM)';
      }
    }
    
    // Validation de l'heure de fin
    if (!formData.endTime) {
      newErrors.endTime = 'L\'heure de fin est requise';
    } else {
      const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
      if (!timeRegex.test(formData.endTime)) {
        newErrors.endTime = 'Format d\'heure invalide (HH:MM)';
      } else if (formData.startTime && formData.endTime) {
        const startTime = new Date(`2000-01-01T${formData.startTime}`);
        const endTime = new Date(`2000-01-01T${formData.endTime}`);
        if (endTime <= startTime) {
          newErrors.endTime = 'L\'heure de fin doit être après l\'heure de début';
        }
      }
    }
    
    // Validation de l'expérience minimale
    if (!formData.minExperience) {
      newErrors.minExperience = 'L\'expérience minimale est requise';
    } else {
      const experience = parseInt(formData.minExperience);
      if (isNaN(experience) || experience < 0) {
        newErrors.minExperience = 'L\'expérience doit être un nombre positif';
      }
    }
    
    // Validation du nombre maximum de comédiens
    if (!formData.maxPerformers) {
      newErrors.maxPerformers = 'Le nombre maximum de comédiens est requis';
    } else {
      const maxPerformers = parseInt(formData.maxPerformers);
      if (isNaN(maxPerformers) || maxPerformers < 1) {
        newErrors.maxPerformers = 'Le nombre doit être au moins 1';
      }
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const isValid = await validateForm();
    if (!isValid) {
      return;
    }

    // Validation de l'ID de l'évènement
    if (!eventToEdit || !eventToEdit._id) {
      console.error('❌ [EditEventForm] Évènement invalide - pas d\'ID', { eventToEdit });
      showError(ErrorMessages.EVENT_MISSING_ID);
      return;
    }

    console.log('🔍 [EditEventForm] Validation avant envoi', {
      eventId: eventToEdit._id,
      eventTitle: eventToEdit.title,
      eventOrganizer: eventToEdit.organizer,
    });

    setIsSubmitting(true);

    try {
      const [day, month, year] = formData.date.split('/').map(Number);
      const eventDate = new Date(year, month - 1, day);

      // Calculate duration in minutes
      const parseTime = (timeStr: string) => {
        if (!timeStr) return 0;
        const [hours, minutes] = timeStr.split(':').map(Number);
        return hours * 60 + minutes;
      };
      const startMinutes = parseTime(formData.startTime);
      const endMinutes = parseTime(formData.endTime);
      let durationInMinutes = 0;
      if (endMinutes >= startMinutes) {
        durationInMinutes = endMinutes - startMinutes;
      } else {
        durationInMinutes = (24 * 60 - startMinutes) + endMinutes;
      }

      // Extraire le code postal depuis l'adresse s'il n'est pas déjà présent
      let postalCode = formData.postalCode;
      if (!postalCode && formData.address) {
        const postalCodeMatch = formData.address.match(/\b(\d{5})\b/);
        if (postalCodeMatch) {
          postalCode = postalCodeMatch[1];
        }
      }

      // Calculer le département à partir du code postal
      let department: string | undefined = undefined;
      if (postalCode) {
        // Corse
        const numericCode = parseInt(postalCode, 10);
        if (numericCode >= 20000 && numericCode <= 20199) {
          department = '2A';
        } else if (numericCode >= 20200 && numericCode <= 20999) {
          department = '2B';
        } else if (postalCode.startsWith('97')) {
          // Outre-mer
          department = postalCode.substring(0, 3);
        } else {
          // Métropole
          department = postalCode.substring(0, 2);
        }
      }

      const eventData = {
        title: formData.title,
        description: formData.description,
        date: eventDate.toISOString(),
        location: {
          venue: formData.venue,
          venueType: formData.venueType || undefined,
          address: formData.address,
          city: formData.city,
          postalCode: postalCode || undefined,
          department: department,
          country: formData.country,
        },
        maxSpectators: formData.maxSpectators?.trim() ? parseInt(formData.maxSpectators, 10) : undefined,
        requirements: {
          minExperience: Number(formData.minExperience),
          maxPerformers: Number(formData.maxPerformers),
          duration: durationInMinutes,
          requiredExperienceLevel: formData.requiredExperienceLevel,
        },
        startTime: formData.startTime,
        imageUrl: formData.imageUrl?.trim() || undefined,
        endTime: formData.endTime,
      };

      console.log('🛠️ [EditEventForm] Envoi de la mise à jour évènement', {
        eventId: eventToEdit._id,
        eventIdType: typeof eventToEdit._id,
        eventIdLength: eventToEdit._id?.length,
        url: `/events/${eventToEdit._id}`,
        payload: eventData,
      });

      const response = await api.put(`/events/${eventToEdit._id}`, eventData);
      console.log('✅ [EditEventForm] Réponse serveur:', response.data);
      showSuccess(SuccessMessages.EVENT_UPDATED);
      onEventUpdated();
    } catch (error: any) {
      console.error('❌ [EditEventForm] Erreur lors de la mise à jour de l\'évènement:', {
        status: error.response?.status,
        statusText: error.response?.statusText,
        message: error.response?.data?.message || error.message,
        data: error.response?.data,
        eventId: eventToEdit._id,
        url: error.config?.url,
      });

      const errorMessage = getErrorMessage(error, ErrorMessages.EVENT_UPDATE_FAILED);
      showError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const formContainerStyle: CSSProperties = {
    maxWidth: '1000px',
    margin: '40px auto',
    padding: '30px',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: '8px',
    boxShadow: '0 4px 8px rgba(0, 0, 0, 0.3)',
    color: '#ffffff',
  };

  const formTitleStyle: CSSProperties = {
    fontSize: '2em',
    color: '#ff416c',
    marginBottom: '20px',
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
    opacity: isSubmitting ? 0.7 : 1,
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

  return (
    <div style={formContainerStyle}>
      <h2 style={formTitleStyle}>Modifier l'évènement</h2>
      <form onSubmit={handleSubmit}>
        <div style={inputGroupStyle}>
          <label htmlFor="title" style={labelStyle}>Titre de l'évènement *</label>
          <input 
            type="text" 
            id="title" 
            style={{
              ...inputStyle,
              borderColor: errors.title ? '#ef4444' : '#555'
            }} 
            value={formData.title} 
            onChange={handleChange} 
            placeholder="Ex: Soirée Stand-Up Comedy"
          />
          {errors.title && (
            <p style={{ color: '#ef4444', fontSize: '12px', margin: '4px 0 0' }}>
              {errors.title}
            </p>
          )}
        </div>

        <div style={inputGroupStyle}>
          <label htmlFor="description" style={labelStyle}>Description *</label>
          <textarea 
            id="description" 
            style={{
              ...textAreaStyle,
              borderColor: errors.description ? '#ef4444' : '#555'
            }} 
            value={formData.description} 
            onChange={handleChange} 
            placeholder="Décrivez votre évènement en détail..."
          />
          {errors.description && (
            <p style={{ color: '#ef4444', fontSize: '12px', margin: '4px 0 0' }}>
              {errors.description}
            </p>
          )}
        </div>

        <div style={inputGroupStyle}>
          <label style={labelStyle}>Photo de l'événement</label>
          {formData.imageUrl && (
            <div style={{ marginBottom: '10px' }}>
              <img
                src={formData.imageUrl}
                alt="Aperçu"
                style={{
                  maxWidth: '100%',
                  maxHeight: 160,
                  objectFit: 'cover',
                  borderRadius: 8,
                  border: '1px solid #555',
                }}
              />
              <button
                type="button"
                onClick={handleRemoveEventImage}
                style={{
                  marginTop: '8px',
                  padding: '8px 12px',
                  borderRadius: 6,
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  background: 'rgba(220, 53, 69, 0.15)',
                  color: '#ffb3b3',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                }}
              >
                Supprimer la photo
              </button>
            </div>
          )}
          <input
            type="file"
            accept=".jpg,.jpeg,.png,.gif,image/jpeg,image/png,image/gif"
            onChange={handleEventImageChange}
            disabled={uploadingEventImage}
            style={{
              ...inputStyle,
              cursor: uploadingEventImage ? 'wait' : 'pointer',
            }}
          />
          <p style={{ color: '#888', fontSize: '12px', margin: '4px 0 0' }}>
            Formats acceptés: JPG, PNG, GIF (max 5MB)
          </p>
        </div>

        <div style={twoColumnLayout}>
          <div style={{ ...inputGroupStyle, position: 'relative' }}>
            <label htmlFor="city" style={labelStyle}>Ville *</label>
            <input
              type="text"
              id="city"
              style={{
                ...inputStyle,
                borderColor: errors.city ? '#ef4444' : '#555'
              }}
              value={formData.city}
              onChange={handleChange}
              placeholder="Ex: Paris"
            />
            {errors.city && (
              <p style={{ color: '#ef4444', fontSize: '12px', margin: '4px 0 0' }}>
                {errors.city}
              </p>
            )}
          </div>
          <div style={{ ...inputGroupStyle, position: 'relative' }}>
            <label htmlFor="postalCode" style={labelStyle}>
              Code postal * {isValidatingPostalCode && <span style={{ fontSize: '12px', color: '#888' }}>(validation...)</span>}
            </label>
            <input
              type="text"
              id="postalCode"
              style={{
                ...inputStyle,
                borderColor: (errors.postalCode || postalCodeError) ? '#ef4444' : '#555'
              }}
              value={formData.postalCode}
              onChange={handleChange}
              onBlur={validatePostalCode}
              placeholder="Ex: 75001"
              maxLength={5}
              disabled={isValidatingPostalCode}
            />
            {(errors.postalCode || postalCodeError) && (
              <p style={{ color: '#ef4444', fontSize: '12px', margin: '4px 0 0' }}>
                {errors.postalCode || postalCodeError}
              </p>
            )}

            {/* Dropdown de sélection de ville si plusieurs options */}
            {showCityDropdown && citySuggestions.length > 0 && (
              <div style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                backgroundColor: '#2a2a2a',
                border: '1px solid #444',
                borderRadius: '4px',
                marginTop: '4px',
                maxHeight: '200px',
                overflowY: 'auto',
                zIndex: 1000,
                boxShadow: '0 4px 6px rgba(0, 0, 0, 0.3)'
              }}>
                <div style={{ padding: '8px', color: '#888', fontSize: '12px', borderBottom: '1px solid #444' }}>
                  Plusieurs villes possibles pour ce code postal :
                </div>
                {citySuggestions.map((option, index) => (
                  <div
                    key={index}
                    onClick={() => handleCitySelect(option.city)}
                    style={{
                      padding: '12px',
                      cursor: 'pointer',
                      borderBottom: index < citySuggestions.length - 1 ? '1px solid #333' : 'none',
                      color: '#ccc',
                      transition: 'background-color 0.2s'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#333'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    {option.city} ({option.postcode})
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div style={twoColumnLayout}>
          <div style={inputGroupStyle}>
            <label htmlFor="address" style={labelStyle}>Adresse *</label>
            <input 
              type="text" 
              id="address" 
              style={{
                ...inputStyle,
                borderColor: errors.address ? '#ef4444' : '#555'
              }} 
              value={formData.address} 
              onChange={handleChange} 
              placeholder="Ex: 123 rue de la Comédie"
            />
            {errors.address && (
              <p style={{ color: '#ef4444', fontSize: '12px', margin: '4px 0 0' }}>
                {errors.address}
              </p>
            )}
          </div>
          <div style={inputGroupStyle}>
            <label htmlFor="country" style={labelStyle}>Pays *</label>
            <input 
              type="text" 
              id="country" 
              style={{
                ...inputStyle,
                borderColor: errors.country ? '#ef4444' : '#555'
              }} 
              value={formData.country} 
              onChange={handleChange} 
              placeholder="Ex: France"
            />
            {errors.country && (
              <p style={{ color: '#ef4444', fontSize: '12px', margin: '4px 0 0' }}>
                {errors.country}
              </p>
            )}
          </div>
        </div>

        <div style={twoColumnLayout}>
          <div style={inputGroupStyle}>
            <label htmlFor="date" style={labelStyle}>Date *</label>
            <input 
              type="text" 
              id="date" 
              style={{
                ...inputStyle,
                borderColor: errors.date ? '#ef4444' : '#555'
              }} 
              placeholder="JJ/MM/AAAA" 
              value={formData.date} 
              onChange={handleChange} 
            />
            {errors.date && (
              <p style={{ color: '#ef4444', fontSize: '12px', margin: '4px 0 0' }}>
                {errors.date}
              </p>
            )}
          </div>
          <div style={inputGroupStyle}>
            <label htmlFor="venue" style={labelStyle}>Lieu (nom de la salle) *</label>
            <input 
              type="text" 
              id="venue" 
              style={{
                ...inputStyle,
                borderColor: errors.venue ? '#ef4444' : '#555'
              }} 
              value={formData.venue} 
              onChange={handleChange} 
              placeholder="Ex: Le Comedy Club"
            />
            {errors.venue && (
              <p style={{ color: '#ef4444', fontSize: '12px', margin: '4px 0 0' }}>
                {errors.venue}
              </p>
            )}
          </div>
          <div style={inputGroupStyle}>
            <label htmlFor="venueType" style={labelStyle}>Type de lieu</label>
            <select
              id="venueType"
              style={{ ...inputStyle, borderColor: errors.venueType ? '#ef4444' : '#555' }}
              value={formData.venueType}
              onChange={handleChange}
            >
              <option value="">-- Sélectionnez --</option>
              <option value="theatre">Théâtre</option>
              <option value="salle_polyvalente">Salle polyvalente</option>
              <option value="cafe">Café</option>
              <option value="restaurant">Restaurant</option>
              <option value="autre">Autre</option>
            </select>
          </div>
          <div style={inputGroupStyle}>
            <label htmlFor="maxSpectators" style={labelStyle}>Nombre de places pour spectateur</label>
            <input
              type="number"
              id="maxSpectators"
              min={1}
              max={10000}
              placeholder="Optionnel"
              style={{
                ...inputStyle,
                borderColor: errors.maxSpectators ? '#ef4444' : '#555'
              }}
              value={formData.maxSpectators}
              onChange={handleChange}
            />
            {errors.maxSpectators && (
              <p style={{ color: '#ef4444', fontSize: '12px', margin: '4px 0 0' }}>{errors.maxSpectators}</p>
            )}
          </div>
        </div>

        <div style={twoColumnLayout}>
          <div style={inputGroupStyle}>
            <label htmlFor="startTime" style={labelStyle}>Heure de début *</label>
            <input 
              type="text" 
              id="startTime" 
              style={{
                ...inputStyle,
                borderColor: errors.startTime ? '#ef4444' : '#555'
              }} 
              placeholder="HH:MM" 
              value={formData.startTime} 
              onChange={handleChange} 
            />
            {errors.startTime && (
              <p style={{ color: '#ef4444', fontSize: '12px', margin: '4px 0 0' }}>
                {errors.startTime}
              </p>
            )}
          </div>
          <div style={inputGroupStyle}>
            <label htmlFor="endTime" style={labelStyle}>Heure de fin *</label>
            <input 
              type="text" 
              id="endTime" 
              style={{
                ...inputStyle,
                borderColor: errors.endTime ? '#ef4444' : '#555'
              }} 
              placeholder="HH:MM" 
              value={formData.endTime} 
              onChange={handleChange} 
            />
            {errors.endTime && (
              <p style={{ color: '#ef4444', fontSize: '12px', margin: '4px 0 0' }}>
                {errors.endTime}
              </p>
            )}
          </div>
        </div>

        <div style={twoColumnLayout}>
          <div style={inputGroupStyle}>
            <label htmlFor="minExperience" style={labelStyle}>Expérience minimale (années) *</label>
            <input 
              type="number" 
              id="minExperience" 
              style={{
                ...inputStyle,
                borderColor: errors.minExperience ? '#ef4444' : '#555'
              }} 
              value={formData.minExperience} 
              onChange={handleChange} 
              placeholder="Ex: 2"
              min="0"
            />
            {errors.minExperience && (
              <p style={{ color: '#ef4444', fontSize: '12px', margin: '4px 0 0' }}>
                {errors.minExperience}
              </p>
            )}
          </div>
          <div style={inputGroupStyle}>
            <label htmlFor="maxPerformers" style={labelStyle}>Nombre maximum de comédiens *</label>
            <input 
              type="number" 
              id="maxPerformers" 
              style={{
                ...inputStyle,
                borderColor: errors.maxPerformers ? '#ef4444' : '#555'
              }} 
              value={formData.maxPerformers} 
              onChange={handleChange} 
              placeholder="Ex: 5"
              min="1"
            />
            {errors.maxPerformers && (
              <p style={{ color: '#ef4444', fontSize: '12px', margin: '4px 0 0' }}>
                {errors.maxPerformers}
              </p>
            )}
          </div>
        </div>

        <div style={inputGroupStyle}>
          <label htmlFor="requiredExperienceLevel" style={labelStyle}>Niveau d'expérience requis</label>
          <select
            id="requiredExperienceLevel"
            value={formData.requiredExperienceLevel}
            onChange={handleChange}
            style={{
              ...inputStyle,
              borderColor: errors.requiredExperienceLevel ? '#ef4444' : '#555'
            }}
          >
            <option value="all">Tous les niveaux</option>
            <option value="0-50">Débutant (0-50 scènes)</option>
            <option value="50-200">Expérimenté (50-200 scènes)</option>
            <option value="200+">Pro (200+ scènes)</option>
          </select>
          {errors.requiredExperienceLevel && (
            <p style={{ color: '#ef4444', fontSize: '12px', margin: '4px 0 0' }}>
              {errors.requiredExperienceLevel}
            </p>
          )}
        </div>

        <div style={buttonContainerStyle}>
          <button type="submit" style={primaryButtonStyle} disabled={isSubmitting}>
            {isSubmitting ? 'Modification...' : 'Sauvegarder'}
          </button>
          <button type="button" onClick={onClose} style={secondaryButtonStyle} disabled={isSubmitting}>
            Annuler
          </button>
        </div>
      </form>
    </div>
  );
}

export default EditEventForm;