import React, { type CSSProperties, useState, useRef, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useAlert } from '../hooks/useAlert';
import { usePostalCodeValidation } from '../hooks/usePostalCodeValidation';
import { X, ChevronDown, MapPin, Calendar, Users } from 'lucide-react';
import api, { uploadEventImage } from '../services/api';
import { getErrorMessage, ErrorMessages, SuccessMessages, WarningMessages } from '../services/systemMessages';

interface CreateEventFormProps {
  onClose: () => void;
  onEventCreated: () => void;
    initialData?: {
      title?: string;
      description?: string;
      city?: string;
      postalCode?: string;
      address?: string;
      country?: string;
      date?: string;
      venue?: string;
      venueType?: string;
      maxSpectators?: number;
      startTime?: string;
      endTime?: string;
      minExperience?: number;
      maxComedians?: number;
      requiredExperienceLevel?: 'all' | '0-50' | '50-200' | '200+';
      imageUrl?: string;
    };
}

function CreateEventForm({ onClose, onEventCreated, initialData }: CreateEventFormProps) {
  const { user } = useAuth();
  const { showSuccess, showError, showWarning } = useAlert();
  const [isMobile, setIsMobile] = useState(false);

  // Fonction pour générer les créneaux de 30 minutes
  const generateTimeSlots = () => {
    const slots = [];
    for (let hour = 0; hour < 24; hour++) {
      for (let minute = 0; minute < 60; minute += 30) {
        const timeString = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
        const displayString = `${hour.toString().padStart(2, '0')}H${minute.toString().padStart(2, '0')}`;
        slots.push({ value: timeString, label: displayString });
      }
    }
    return slots;
  };

  const timeSlots = generateTimeSlots();

  // Durée pour événement unique (en minutes) — options affichées dans le select
  const DURATION_OPTIONS = [
    { value: 30, label: '30 min' },
    { value: 60, label: '1 h' },
    { value: 90, label: '1 h 30' },
    { value: 120, label: '2 h' },
    { value: 150, label: '2 h 30' },
    { value: 180, label: '3 h' },
    { value: 210, label: '3 h 30' },
    { value: 240, label: '4 h' },
  ];
  
  React.useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
  
  const [formData, setFormData] = useState({
    title: initialData?.title || '',
    description: initialData?.description || '',
    city: initialData?.city || '',
    postalCode: initialData?.postalCode || '',
    address: initialData?.address || '',
    country: initialData?.country || '',
    date: initialData?.date || new Date().toISOString().split('T')[0], // Format YYYY-MM-DD par défaut
    venue: initialData?.venue || '',
    venueType: initialData?.venueType || '',
    maxSpectators: initialData?.maxSpectators != null ? String(initialData.maxSpectators) : '',
    startTime: initialData?.startTime || '',
    endTime: initialData?.endTime || '',
    minExperience: initialData?.minExperience?.toString() || '',
    maxComedians: initialData?.maxComedians?.toString() || '',
    requiredExperienceLevel: initialData?.requiredExperienceLevel || 'all',
    status: 'PUBLISHED',
    imageUrl: initialData?.imageUrl || '',
  });

  // Type d'événement : unique ou récurrent
  const [eventType, setEventType] = useState<'unique' | 'recurring'>('unique');
  // Options de récurrence (quand événement récurrent)
  const [recurrenceStartDate, setRecurrenceStartDate] = useState(formData.date);
  const [recurrenceType, setRecurrenceType] = useState<'daily' | 'weekly' | 'monthly'>('weekly');
  const [recurrenceWeeklyDays, setRecurrenceWeeklyDays] = useState<number[]>([]); // 0=dim, 1=lun, ... 6=sam
  const [recurrenceEndDate, setRecurrenceEndDate] = useState('');
  const [recurringDates, setRecurringDates] = useState<string[]>([]);
  // Heures personnalisées par date (clé = date YYYY-MM-DD, valeur = { startTime, endTime })
  const [dateTimeOverrides, setDateTimeOverrides] = useState<Record<string, { startTime: string; endTime: string }>>({});
  /** Durée en minutes pour événement unique (0 = non sélectionné). Remplace "Heure de fin" en mode unique. */
  const [eventDurationMinutes, setEventDurationMinutes] = useState<number>(120);
  const [uploadingEventImage, setUploadingEventImage] = useState(false);

  // Formater une date en YYYY-MM-DD en heure locale (évite le décalage UTC qui affichait le jour précédent)
  const toLocalDateString = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  /** Calcule l'heure et la date de fin à partir de la date de début, l'heure de début et la durée (événement unique). */
  const computeEndFromDuration = (
    dateStr: string,
    startTimeStr: string,
    durationMinutes: number
  ): { endTime: string; endDate?: string } => {
    if (!dateStr || !startTimeStr || durationMinutes <= 0) {
      return { endTime: '' };
    }
    const start = new Date(dateStr + 'T' + startTimeStr + ':00');
    const end = new Date(start.getTime() + durationMinutes * 60 * 1000);
    const endTime = `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`;
    const endDateStr = toLocalDateString(end);
    const startDateStr = toLocalDateString(start);
    if (endDateStr !== startDateStr) {
      return { endTime, endDate: endDateStr };
    }
    return { endTime };
  };

  // Recalculer les dates récurrentes quand les options changent
  useEffect(() => {
    if (eventType !== 'recurring' || !recurrenceStartDate || !recurrenceEndDate) {
      setRecurringDates([]);
      return;
    }
    const start = new Date(recurrenceStartDate + 'T12:00:00');
    const end = new Date(recurrenceEndDate + 'T12:00:00');
    if (end < start) {
      setRecurringDates([]);
      return;
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dates: string[] = [];
    if (recurrenceType === 'daily') {
      const d = new Date(start);
      d.setHours(0, 0, 0, 0);
      while (d <= end) {
        if (d >= today) dates.push(toLocalDateString(d));
        d.setDate(d.getDate() + 1);
      }
    } else if (recurrenceType === 'weekly') {
      const days = recurrenceWeeklyDays.length > 0 ? recurrenceWeeklyDays : [start.getDay()];
      const d = new Date(start);
      d.setHours(0, 0, 0, 0);
      while (d <= end) {
        if (d >= today && days.includes(d.getDay())) dates.push(toLocalDateString(d));
        d.setDate(d.getDate() + 1);
      }
    } else if (recurrenceType === 'monthly') {
      const d = new Date(start);
      d.setHours(0, 0, 0, 0);
      const dayOfMonth = d.getDate();
      while (d <= end) {
        if (d >= today) dates.push(toLocalDateString(d));
        d.setMonth(d.getMonth() + 1);
        d.setDate(Math.min(dayOfMonth, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
      }
    }
    setRecurringDates(dates);
  }, [eventType, recurrenceStartDate, recurrenceEndDate, recurrenceType, recurrenceWeeklyDays]);

  // Réinitialiser le formulaire quand initialData change
  React.useEffect(() => {
    if (initialData) {
      setFormData({
        title: initialData.title || '',
        description: initialData.description || '',
        city: initialData.city || '',
        postalCode: initialData.postalCode || '',
        address: initialData.address || '',
        country: initialData.country || '',
        date: initialData.date || new Date().toISOString().split('T')[0],
        venue: initialData.venue || '',
        venueType: initialData.venueType || '',
        maxSpectators: initialData.maxSpectators != null ? String(initialData.maxSpectators) : '',
        startTime: initialData.startTime || '',
        endTime: initialData.endTime || '',
        minExperience: initialData.minExperience?.toString() || '',
        maxComedians: initialData.maxComedians?.toString() || '',
        requiredExperienceLevel: initialData?.requiredExperienceLevel || 'all',
        status: 'PUBLISHED',
        imageUrl: initialData.imageUrl || '',
      });
    } else {
      // Réinitialiser à vide si pas de données initiales
      setFormData({
        title: '',
        description: '',
        city: '',
        postalCode: '',
        address: '',
        country: '',
        date: new Date().toISOString().split('T')[0],
        venue: '',
        venueType: '',
        maxSpectators: '',
        startTime: '',
        endTime: '',
        minExperience: '',
        maxComedians: '',
        requiredExperienceLevel: 'all',
        status: 'PUBLISHED',
        imageUrl: '',
      });
    }
  }, [initialData]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<{[key: string]: string}>({});
  const [openStartTimeDropdown, setOpenStartTimeDropdown] = useState(false);
  const [openEndTimeDropdown, setOpenEndTimeDropdown] = useState(false);
  const startTimeRef = useRef<HTMLDivElement>(null);
  const endTimeRef = useRef<HTMLDivElement>(null);
  const addressSearchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isAutoFillingRef = useRef(false);
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

  // Auto-validate when postal code reaches 5 digits
  useEffect(() => {
    const trimmedPostalCode = formData.postalCode.trim();

    // Only validate if we have exactly 5 digits and not already validating
    if (trimmedPostalCode.length === 5 && /^\d{5}$/.test(trimmedPostalCode) && !isValidatingPostalCode) {
      validatePostalCode();
    }
  }, [formData.postalCode]);

  // Fermer les dropdowns quand on clique en dehors
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (startTimeRef.current && !startTimeRef.current.contains(event.target as Node)) {
        setOpenStartTimeDropdown(false);
      }
      if (endTimeRef.current && !endTimeRef.current.contains(event.target as Node)) {
        setOpenEndTimeDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      if (addressSearchTimeoutRef.current) {
        clearTimeout(addressSearchTimeoutRef.current);
      }
    };
  }, []);

  // Fonction pour rechercher une ville par code postal
  const searchCityByPostalCode = async (postalCode: string): Promise<{ city: string; postalCode: string } | null> => {
    if (!postalCode || postalCode.length < 5) return null;
    
    try {
      // Recherche par code postal avec l'API Adresse
      const response = await fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(postalCode)}&limit=5`);
      const data = await response.json();
      
      if (data.features && data.features.length > 0) {
        // Prendre le premier résultat qui correspond au code postal
        const feature = data.features.find((f: any) => f.properties.postcode === postalCode) || data.features[0];
        const city = feature.properties.city || feature.properties.name;
        const code = feature.properties.postcode;
        if (code === postalCode) {
          return { city, postalCode: code };
        }
      }
    } catch (error) {
      console.error('Erreur lors de la recherche par code postal:', error);
    }
    return null;
  };

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

    // Validation en temps réel pour la date et l'heure de début
    if (id === 'date' || id === 'startTime') {
      // Si la date change, valider l'heure de début si elle existe
      if (id === 'date' && formData.startTime) {
        const selectedDate = new Date(value + 'T00:00:00');
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        selectedDate.setHours(0, 0, 0, 0);
        
        if (selectedDate.getTime() === today.getTime()) {
          const now = new Date();
          const [startHours, startMinutes] = formData.startTime.split(':').map(Number);
          const eventStartDateTime = new Date();
          eventStartDateTime.setHours(startHours, startMinutes, 0, 0);
          
          // Si l'heure de début est dans le passé (avec une marge de 1 minute)
          if (eventStartDateTime.getTime() < (now.getTime() - 60000)) {
            setErrors(prev => ({
              ...prev,
              startTime: 'L\'heure de début ne peut pas être dans le passé pour aujourd\'hui. Veuillez sélectionner une heure future.'
            }));
          } else {
            // Clear error si l'heure est valide
            setErrors(prev => ({
              ...prev,
              startTime: ''
            }));
          }
        } else {
          // Clear error si la date n'est pas aujourd'hui
          setErrors(prev => ({
            ...prev,
            startTime: ''
          }));
        }
      }
      
      // Si l'heure de début change, valider immédiatement
      if (id === 'startTime' && formData.date) {
        const selectedDate = new Date(formData.date + 'T00:00:00');
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        selectedDate.setHours(0, 0, 0, 0);
        
        if (selectedDate.getTime() === today.getTime()) {
          const now = new Date();
          const [startHours, startMinutes] = value.split(':').map(Number);
          const eventStartDateTime = new Date();
          eventStartDateTime.setHours(startHours, startMinutes, 0, 0);
          
          // Si l'heure de début est dans le passé (avec une marge de 1 minute)
          if (eventStartDateTime.getTime() < (now.getTime() - 60000)) {
            setErrors(prev => ({
              ...prev,
              startTime: 'L\'heure de début ne peut pas être dans le passé pour aujourd\'hui. Veuillez sélectionner une heure future.'
            }));
          } else {
            // Clear error si l'heure est valide
            setErrors(prev => ({
              ...prev,
              startTime: ''
            }));
          }
        } else {
          // Clear error si la date n'est pas aujourd'hui
          setErrors(prev => ({
            ...prev,
            startTime: ''
          }));
        }
      }
    }
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

  const handleCitySelect = (city: string) => {
    isAutoFillingRef.current = true;
    setFormData(prev => ({ ...prev, city }));
    setTimeout(() => { isAutoFillingRef.current = false; }, 100);
    setShowCityDropdown(false);
    setCitySuggestions([]);
  };

  const handleTimeSelect = (timeValue: string, field: 'startTime' | 'endTime') => {
    setFormData(prev => ({
      ...prev,
      [field]: timeValue
    }));
    if (field === 'startTime') {
      setOpenStartTimeDropdown(false);
      
      // Valider l'heure de début si la date est aujourd'hui
      if (formData.date) {
        const selectedDate = new Date(formData.date + 'T00:00:00');
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        selectedDate.setHours(0, 0, 0, 0);
        
        if (selectedDate.getTime() === today.getTime()) {
          const now = new Date();
          const [startHours, startMinutes] = timeValue.split(':').map(Number);
          const eventStartDateTime = new Date();
          eventStartDateTime.setHours(startHours, startMinutes, 0, 0);
          
          // Si l'heure de début est dans le passé (avec une marge de 1 minute)
          if (eventStartDateTime.getTime() < (now.getTime() - 60000)) {
            setErrors(prev => ({
              ...prev,
              startTime: 'L\'heure de début ne peut pas être dans le passé pour aujourd\'hui. Veuillez sélectionner une heure future.'
            }));
          } else {
            // Clear error si l'heure est valide
            setErrors(prev => ({
              ...prev,
              startTime: ''
            }));
          }
        } else {
          // Clear error si la date n'est pas aujourd'hui
          setErrors(prev => ({
            ...prev,
            startTime: ''
          }));
        }
      }
    } else {
      setOpenEndTimeDropdown(false);
      // Clear error pour l'heure de fin
      if (errors[field]) {
        setErrors(prev => ({
          ...prev,
          [field]: ''
        }));
      }
    }
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

  // Fonction pour obtenir les créneaux horaires disponibles pour l'heure de début
  const getAvailableStartTimeSlots = () => {
    if (!formData.date) {
      return timeSlots;
    }
    
    const selectedDate = new Date(formData.date + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    selectedDate.setHours(0, 0, 0, 0);
    
    // Si la date sélectionnée est aujourd'hui, filtrer les heures passées
    if (selectedDate.getTime() === today.getTime()) {
      const now = new Date();
      // Ajouter une marge de 1 minute pour éviter les problèmes de timing
      const minTime = new Date(now.getTime() - 60000);
      return timeSlots.filter(slot => {
        const [hours, minutes] = slot.value.split(':').map(Number);
        const slotDateTime = new Date();
        slotDateTime.setHours(hours, minutes, 0, 0);
        return slotDateTime >= minTime;
      });
    }
    
    // Pour les dates futures, tous les créneaux sont disponibles
    return timeSlots;
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
    // Si c'est une duplication (initialData existe) et que l'adresse/ville sont présentes, 
    // le code postal peut être optionnel
    if (!formData.postalCode.trim()) {
      // Si c'est une duplication avec adresse et ville complètes, on permet de continuer
      if (initialData && formData.address.trim() && formData.city.trim()) {
        // Code postal optionnel pour duplication, mais on essaie quand même de le valider si fourni
      } else {
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
    
    // Validation de la date (événement unique) ou des dates de récurrence
    if (eventType === 'unique') {
      if (!formData.date) {
        newErrors.date = 'La date est requise';
      } else {
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(formData.date)) {
          newErrors.date = 'Format de date invalide. Utilisez le sélecteur de date.';
        } else {
          const selectedDate = new Date(formData.date);
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          if (isNaN(selectedDate.getTime())) {
            newErrors.date = 'Date invalide';
          } else if (selectedDate < today) {
            newErrors.date = 'La date ne peut pas être dans le passé';
          }
        }
      }
    } else {
      if (!recurrenceStartDate) {
        newErrors.recurrenceStartDate = 'La date de début est requise';
      }
      if (!recurrenceEndDate) {
        newErrors.recurrenceEndDate = 'La date de fin de récurrence est requise';
      } else if (recurrenceStartDate && recurrenceEndDate < recurrenceStartDate) {
        newErrors.recurrenceEndDate = 'La date de fin doit être après la date de début';
      }
    }
    
    // Validation de l'heure de début
    if (!formData.startTime) {
      newErrors.startTime = 'L\'heure de début est requise';
    } else {
      const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
      if (!timeRegex.test(formData.startTime)) {
        newErrors.startTime = 'Format d\'heure invalide (HH:MM)';
      } else {
        // Vérifier si l'heure de début n'est pas dans le passé (événement unique, date = aujourd'hui)
        if (eventType === 'unique' && formData.date) {
          const selectedDate = new Date(formData.date + 'T00:00:00');
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          selectedDate.setHours(0, 0, 0, 0);
          if (selectedDate.getTime() === today.getTime()) {
            const now = new Date();
            const [startHours, startMinutes] = formData.startTime.split(':').map(Number);
            const eventStartDateTime = new Date();
            eventStartDateTime.setHours(startHours, startMinutes, 0, 0);
            if (eventStartDateTime.getTime() < (now.getTime() - 60000)) {
              newErrors.startTime = 'L\'heure de début ne peut pas être dans le passé. Il est actuellement ' +
                now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) + '. Veuillez sélectionner une heure future.';
            }
          }
        }
      }
    }
    
    // Validation heure de fin / durée
    if (eventType === 'unique') {
      if (!eventDurationMinutes || eventDurationMinutes <= 0) {
        newErrors.duration = 'La durée est requise';
      }
    } else {
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
    if (!formData.maxComedians) {
      newErrors.maxComedians = 'Le nombre maximum de comédiens est requis';
    } else {
      const maxComedians = parseInt(formData.maxComedians);
      if (isNaN(maxComedians) || maxComedians < 1) {
        newErrors.maxComedians = 'Le nombre doit être au moins 1';
      }
    }
    
    setErrors(newErrors);
    const isValid = Object.keys(newErrors).length === 0;
    console.log('🔍 [CreateEventForm] validateForm terminé:', { isValid, errors: newErrors });
    return isValid;
  };

  // Jours de la semaine (0=dim, 1=lun, ... 6=sam) pour affichage "Ces jours-là"
  const WEEKDAY_LABELS: { value: number; label: string }[] = [
    { value: 1, label: 'lu' },
    { value: 2, label: 'ma' },
    { value: 3, label: 'me' },
    { value: 4, label: 'je' },
    { value: 5, label: 've' },
    { value: 6, label: 'sa' },
    { value: 0, label: 'di' },
  ];

  const toggleRecurrenceWeeklyDay = (day: number) => {
    setRecurrenceWeeklyDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort((a, b) => a - b)
    );
  };

  const setDateTimeForDate = (dateStr: string, startTime: string, endTime: string) => {
    if (!startTime || !endTime) {
      setDateTimeOverrides((prev) => {
        const next = { ...prev };
        delete next[dateStr];
        return next;
      });
    } else {
      setDateTimeOverrides((prev) => ({ ...prev, [dateStr]: { startTime, endTime } }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('🔍 [CreateEventForm] handleSubmit appelé', { initialData, formData, eventType, recurringDates });

    if (!user) {
      showWarning(WarningMessages.AUTH_REQUIRED_CREATE_EVENT);
      return;
    }

    if (eventType === 'recurring') {
      if (!recurrenceEndDate) {
        alert('Veuillez indiquer une date de fin pour la récurrence.');
        return;
      }
      if (recurringDates.length === 0) {
        alert('Aucune date générée. Vérifiez la date de début, la date de fin et les options (ex. jours de la semaine pour Hebdomadaire).');
        return;
      }
    }

    const isValid = await validateForm();
    console.log('🔍 [CreateEventForm] Validation résultat:', isValid, { errors });
    if (!isValid) {
      console.log('❌ [CreateEventForm] Validation échouée, erreurs:', errors);
      // Afficher un message d'alerte avec les erreurs
      const errorMessages = Object.values(errors).filter(msg => msg).join(', ');
      if (errorMessages) {
        showWarning(WarningMessages.FORM_VALIDATION_FAILED + errorMessages);
      }
      // Faire défiler vers la première erreur
      const firstErrorField = Object.keys(errors)[0];
      if (firstErrorField) {
        const errorElement = document.getElementById(firstErrorField);
        if (errorElement) {
          errorElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
          errorElement.focus();
        }
      }
      return;
    }

    setIsSubmitting(true);

    try {
      // Durée en minutes pour l'API (requirements.duration)
      const parseTime = (timeStr: string) => {
        if (!timeStr) return 0;
        const [hours, minutes] = timeStr.split(':').map(Number);
        return hours * 60 + minutes;
      };
      let durationInMinutes: number;
      let effectiveEndTime: string;
      let effectiveEndDate: string | undefined;
      if (eventType === 'unique') {
        durationInMinutes = eventDurationMinutes;
        const computed = computeEndFromDuration(formData.date, formData.startTime, eventDurationMinutes);
        effectiveEndTime = computed.endTime;
        effectiveEndDate = computed.endDate;
      } else {
        const startMinutes = parseTime(formData.startTime);
        const endMinutes = parseTime(formData.endTime);
        if (endMinutes >= startMinutes) {
          durationInMinutes = endMinutes - startMinutes;
        } else {
          durationInMinutes = (24 * 60 - startMinutes) + endMinutes;
        }
        effectiveEndTime = formData.endTime;
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

      const baseEventData = {
        title: formData.title,
        description: formData.description,
        location: {
          venue: formData.venue,
          venueType: formData.venueType || undefined,
          address: formData.address,
          city: formData.city,
          postalCode: postalCode || undefined,
          department: department,
          country: formData.country,
        },
        requirements: {
          minExperience: Number(formData.minExperience),
          maxPerformers: Number(formData.maxComedians),
          duration: durationInMinutes,
          requiredExperienceLevel: formData.requiredExperienceLevel,
        },
        status: formData.status,
        startTime: formData.startTime,
        endTime: effectiveEndTime,
        maxSpectators: formData.maxSpectators && formData.maxSpectators.trim() ? parseInt(formData.maxSpectators, 10) : undefined,
        imageUrl: formData.imageUrl && formData.imageUrl.trim() ? formData.imageUrl.trim() : undefined,
      };

      const config = {
        headers: {
          'Content-Type': 'application/json',
        },
      };

      let response;
      if (eventType === 'recurring' && recurringDates.length > 0) {
        const dateTimes = recurringDates
          .map((d) => {
            const override = dateTimeOverrides[d];
            const start = override?.startTime ?? formData.startTime;
            const end = override?.endTime ?? formData.endTime;
            return { date: d, startTime: start, endTime: end };
          })
          .filter((x) => x.startTime && x.endTime);
        const eventData = {
          ...baseEventData,
          isRecurring: true,
          dates: recurringDates,
          dateTimes: dateTimes.length > 0 ? dateTimes : undefined,
        };
        response = await api.post('/events', eventData);
        console.log('✅ Réponse serveur (récurrent):', response.data);
        showSuccess(`${response.data.count || recurringDates.length} événements récurrents créés avec succès !`);
      } else {
        const eventData = {
          ...baseEventData,
          date: eventType === 'unique' ? formData.date : formData.date,
          ...(eventType === 'unique' && effectiveEndDate && { endDate: effectiveEndDate }),
        };
        response = await api.post('/events', eventData);
        console.log('✅ Réponse serveur:', response.data);
        showSuccess(SuccessMessages.EVENT_CREATED);
      }

      onEventCreated();
      onClose();
    } catch (error: any) {
      console.error('Erreur lors de la création de l\'évènement:', error.response?.status);
      const status = error?.response?.status;
      const message = status === 409
        ? ErrorMessages.EVENT_DUPLICATE
        : getErrorMessage(error, ErrorMessages.EVENT_CREATE_FAILED);
      showError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const modalStyle: CSSProperties = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: isMobile ? '16px' : '24px',
    overflow: 'auto' // Permettre le scroll si nécessaire
  };

  const formStyle: CSSProperties = {
    background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
    borderRadius: '16px',
    width: '100%',
    maxWidth: isMobile ? '100%' : '800px',
    maxHeight: '90vh',
    overflow: 'auto',
    overflowX: 'hidden', // Empêcher le scroll horizontal
    boxShadow: '0 20px 40px rgba(0, 0, 0, 0.3)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    position: 'relative',
    zIndex: 1
  };

  const headerStyle: CSSProperties = {
    padding: isMobile ? '16px' : '24px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    position: isMobile ? 'sticky' : 'static',
    top: 0,
    background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
    zIndex: 1
  };

  const contentStyle: CSSProperties = {
    padding: isMobile ? '16px' : '24px',
    color: '#fff',
    background: 'linear-gradient(to bottom, #1a1a2e 0%, #16213e 40%, #331f41 100%)',
    boxShadow: '0px 4px 12px 0px rgba(0, 0, 0, 0.15), 0px 4px 12px 0px rgba(0, 0, 0, 0.15)',
  };

  const inputStyle: CSSProperties = {
    width: '100%',
    padding: isMobile ? '14px 16px' : '12px 16px',
    fontSize: isMobile ? '16px' : '14px', // 16px prevents zoom on iOS
    border: '1px solid #ddd',
    borderRadius: '8px',
    background: 'rgba(255, 255, 255, 1)',
    color: '#1a1a1a',
    marginBottom: '4px'
  };

  // Style spécifique pour les selects (compatibilité Windows)
  const selectStyle: CSSProperties = {
    ...inputStyle,
    appearance: 'none', // Supprime le style par défaut du navigateur
    WebkitAppearance: 'none', // Pour Safari/Chrome
    MozAppearance: 'none', // Pour Firefox
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%231a1a1a' d='M6 9L1 4h10z'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 12px center',
    backgroundSize: '12px',
    paddingRight: '40px', // Espace pour l'icône
    cursor: 'pointer',
    position: 'relative',
    zIndex: 1
  };
  
  const addressSuggestionListStyle: CSSProperties = {
    marginTop: '8px',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '8px',
    backgroundColor: 'rgba(0,0,0,0.4)',
    maxHeight: '180px',
    overflowY: 'auto',
    boxShadow: '0 8px 20px rgba(0,0,0,0.4)'
  };

  const addressSuggestionItemStyle: CSSProperties = {
    width: '100%',
    textAlign: 'left',
    padding: '10px 12px',
    background: 'transparent',
    border: 'none',
    color: '#fff',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px'
  };

  const buttonStyle: CSSProperties = {
    padding: isMobile ? '16px 24px' : '12px 24px',
    fontSize: isMobile ? '16px' : '14px',
    fontWeight: '600',
    borderRadius: '8px',
    border: 'none',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    width: isMobile ? '100%' : 'auto'
  };

  // Styles pour les sections
  const sectionStyle: CSSProperties = {
    marginTop: '32px',
    padding: '24px',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: '12px',
    border: '1px solid rgba(255, 255, 255, 0.1)',
  };

  const sectionTitleStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '24px',
    paddingBottom: '16px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
    color: '#fff',
    fontSize: '18px',
    fontWeight: '600',
  };

  const sectionGridStyle: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
    gap: '20px',
  };

  return (
    <div style={modalStyle}>
      <div style={formStyle}>
        {/* Header */}
        <div style={headerStyle}>
          <h2 style={{ 
            margin: 0, 
            color: '#fff', 
            fontSize: isMobile ? '20px' : '24px',
            fontWeight: '700'
          }}>
            Créer un nouvel évènement
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255, 255, 255, 0.1)',
              border: 'none',
              color: '#fff',
              padding: '8px',
              borderRadius: '8px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div style={contentStyle}>
          <form onSubmit={handleSubmit}>
            {/* Titre et Description en haut */}
            <div style={{ marginBottom: '32px' }}>
              {/* Titre */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', color: '#ccc' }}>
                  Titre de l'évènement *
                </label>
                <input
                  type="text"
                  id="title"
                  value={formData.title}
                  onChange={handleChange}
                  style={{
                    ...inputStyle,
                    borderColor: errors.title ? '#ef4444' : '#444'
                  }}
                  placeholder="Ex: Soirée Stand-Up Comedy"
                />
                {errors.title && (
                  <p style={{ color: '#ef4444', fontSize: '12px', margin: '4px 0 0' }}>
                    {errors.title}
                  </p>
                )}
              </div>

              {/* Description */}
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', color: '#ccc' }}>
                  Description *
                </label>
                <textarea
                  id="description"
                  value={formData.description}
                  onChange={handleChange}
                  style={{
                    ...inputStyle,
                    minHeight: '100px',
                    resize: 'vertical',
                    borderColor: errors.description ? '#ef4444' : '#444'
                  }}
                  placeholder="Décrivez votre évènement en détail..."
                />
                {errors.description && (
                  <p style={{ color: '#ef4444', fontSize: '12px', margin: '4px 0 0' }}>
                    {errors.description}
                  </p>
                )}
              </div>

              {/* Photo de l'événement */}
              <div style={{ marginTop: '20px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', color: '#ccc' }}>
                  Photo de l'événement
                </label>
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
                        border: '1px solid #444',
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
                    width: '100%',
                    padding: '8px',
                    borderRadius: 5,
                    border: '1px solid #444',
                    backgroundColor: '#333',
                    color: '#fff',
                    cursor: uploadingEventImage ? 'wait' : 'pointer',
                  }}
                />
                <p style={{ fontSize: '0.85em', color: '#aaa', marginTop: '5px' }}>
                  Formats acceptés: JPG, PNG, GIF (max 5MB)
                </p>
              </div>
            </div>

            {/* Section Localisation */}
            <div style={sectionStyle}>
              <div style={sectionTitleStyle}>
                <MapPin size={20} style={{ color: '#ff416c' }} />
                <span>Localisation</span>
              </div>
              <div style={sectionGridStyle}>
                {/* Lieu/Bar */}
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', color: '#ccc' }}>
                    Lieu (nom de la salle) *
                  </label>
                  <input
                    type="text"
                    id="venue"
                    value={formData.venue}
                    onChange={handleChange}
                    style={{
                      ...inputStyle,
                      borderColor: errors.venue ? '#ef4444' : '#444'
                    }}
                    placeholder="Ex: Le Comedy Club"
                  />
                  {errors.venue && (
                    <p style={{ color: '#ef4444', fontSize: '12px', margin: '4px 0 0' }}>
                      {errors.venue}
                    </p>
                  )}
                </div>

                {/* Adresse */}
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', color: '#ccc' }}>
                    Adresse *
                  </label>
                  <input
                    type="text"
                    id="address"
                    value={formData.address}
                    onChange={handleChange}
                    style={{
                      ...inputStyle,
                      borderColor: errors.address ? '#ef4444' : '#444'
                    }}
                    placeholder="Ex: 123 rue de la Comédie"
                  />
                  {errors.address && (
                    <p style={{ color: '#ef4444', fontSize: '12px', margin: '4px 0 0' }}>
                      {errors.address}
                    </p>
                  )}
                  {addressSuggestions.length > 0 && (
                    <div style={addressSuggestionListStyle}>
                      {addressSuggestions.map((suggestion, idx) => (
                        <button
                          key={`${suggestion.label}-${idx}`}
                          type="button"
                          onClick={() => handleSelectAddressSuggestion(suggestion)}
                          style={addressSuggestionItemStyle}
                          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                        >
                          <span style={{ fontWeight: 600 }}>{suggestion.label}</span>
                          <span style={{ fontSize: '0.85em', color: '#aaa' }}>
                            {suggestion.postalCode} · {suggestion.city}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Code postal */}
                <div style={{ position: 'relative' }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', color: '#ccc' }}>
                    Code postal * {isValidatingPostalCode && <span style={{ fontSize: '12px', color: '#888' }}>(validation...)</span>}
                  </label>
                  <input
                    type="text"
                    id="postalCode"
                    value={formData.postalCode}
                    onChange={handleChange}
                    onBlur={validatePostalCode}
                    style={{
                      ...inputStyle,
                      borderColor: (errors.postalCode || postalCodeError) ? '#ef4444' : '#444'
                    }}
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

                {/* Ville */}
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', color: '#ccc' }}>
                    Ville *
                  </label>
                  <input
                    type="text"
                    id="city"
                    value={formData.city}
                    onChange={handleChange}
                    style={{
                      ...inputStyle,
                      borderColor: errors.city ? '#ef4444' : '#444'
                    }}
                    placeholder="Ex: Paris"
                  />
                  {errors.city && (
                    <p style={{ color: '#ef4444', fontSize: '12px', margin: '4px 0 0' }}>
                      {errors.city}
                    </p>
                  )}
                </div>

                {/* Pays */}
                <div style={{ gridColumn: isMobile ? '1' : '1 / -1' }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', color: '#ccc' }}>
                    Pays *
                  </label>
                  <input
                    type="text"
                    id="country"
                    value={formData.country}
                    onChange={handleChange}
                    style={{
                      ...inputStyle,
                      borderColor: errors.country ? '#ef4444' : '#444'
                    }}
                    placeholder="Ex: France"
                  />
                  {errors.country && (
                    <p style={{ color: '#ef4444', fontSize: '12px', margin: '4px 0 0' }}>
                      {errors.country}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Section Informations d'évènement */}
            <div style={sectionStyle}>
              <div style={sectionTitleStyle}>
                <Calendar size={20} style={{ color: '#ff416c' }} />
                <span>Informations d'évènement</span>
              </div>
              {/* Choix : Événement unique ou récurrent — deux blocs séparés */}
              <label style={{ display: 'block', marginBottom: '12px', fontWeight: '500', color: '#ccc' }}>
                Type d'événement
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '16px',
                    backgroundColor: eventType === 'unique' ? 'rgba(255, 65, 108, 0.08)' : 'rgba(255, 255, 255, 0.02)',
                    borderRadius: '8px',
                    border: eventType === 'unique' ? '1px solid rgba(255, 65, 108, 0.4)' : '1px solid rgba(255, 255, 255, 0.1)',
                    cursor: 'pointer',
                    color: '#fff',
                    transition: 'background-color 0.2s, border-color 0.2s',
                  }}
                >
                  <input
                    type="radio"
                    name="eventType"
                    checked={eventType === 'unique'}
                    onChange={() => setEventType('unique')}
                    style={{ width: '18px', height: '18px', accentColor: '#ff416c', flexShrink: 0 }}
                  />
                  <span style={{ fontWeight: '500' }}>Événement unique</span>
                </label>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '16px',
                    backgroundColor: eventType === 'recurring' ? 'rgba(255, 65, 108, 0.08)' : 'rgba(255, 255, 255, 0.02)',
                    borderRadius: '8px',
                    border: eventType === 'recurring' ? '1px solid rgba(255, 65, 108, 0.4)' : '1px solid rgba(255, 255, 255, 0.1)',
                    cursor: 'pointer',
                    color: '#fff',
                    transition: 'background-color 0.2s, border-color 0.2s',
                  }}
                >
                  <input
                    type="radio"
                    name="eventType"
                    checked={eventType === 'recurring'}
                    onChange={() => {
                      setEventType('recurring');
                      setRecurrenceStartDate(formData.date);
                      if (!recurrenceEndDate) setRecurrenceEndDate(formData.date);
                    }}
                    style={{ width: '18px', height: '18px', accentColor: '#ff416c', flexShrink: 0 }}
                  />
                  <span style={{ fontWeight: '500' }}>Événement récurrent</span>
                </label>
              </div>

              {eventType === 'unique' ? (
                <div style={sectionGridStyle}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', color: '#ccc' }}>
                      Date *
                    </label>
                    <input
                      type="date"
                      id="date"
                      value={formData.date}
                      onChange={handleChange}
                      style={{ ...inputStyle, borderColor: errors.date ? '#ef4444' : '#444' }}
                    />
                    {errors.date && <p style={{ color: '#ef4444', fontSize: '12px', margin: '4px 0 0' }}>{errors.date}</p>}
                  </div>
                </div>
              ) : (
                /* Mode récurrent : Date de début et Fin côte à côte, puis A lieu, jours, dates générées */
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  {/* Date de début et Fin sur la même ligne */}
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '20px' }}>
                    <div>
                      <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', color: '#ccc' }}>
                        Date de début *
                      </label>
                      <input
                        type="date"
                        value={recurrenceStartDate}
                        onChange={(e) => setRecurrenceStartDate(e.target.value)}
                        style={{ ...inputStyle, borderColor: errors.recurrenceStartDate ? '#ef4444' : '#444' }}
                        min={new Date().toISOString().split('T')[0]}
                      />
                      {errors.recurrenceStartDate && (
                        <p style={{ color: '#ef4444', fontSize: '12px', margin: '4px 0 0' }}>{errors.recurrenceStartDate}</p>
                      )}
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', color: '#ccc' }}>
                        Fin
                      </label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                        <span style={{ color: '#aaa', fontSize: '14px' }}>Le</span>
                        <input
                          type="date"
                          value={recurrenceEndDate}
                          onChange={(e) => setRecurrenceEndDate(e.target.value)}
                          style={{
                            ...inputStyle,
                            flex: 1,
                            minWidth: 0,
                            marginBottom: 0,
                            borderColor: errors.recurrenceEndDate ? '#ef4444' : '#444',
                          }}
                          min={recurrenceStartDate || new Date().toISOString().split('T')[0]}
                        />
                        {errors.recurrenceEndDate && (
                          <p style={{ color: '#ef4444', fontSize: '12px', margin: '4px 0 0' }}>{errors.recurrenceEndDate}</p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', color: '#ccc' }}>
                      A lieu
                    </label>
                    <select
                      value={recurrenceType}
                      onChange={(e) => setRecurrenceType(e.target.value as 'daily' | 'weekly' | 'monthly')}
                      style={{ ...selectStyle, maxWidth: '220px' }}
                    >
                      <option value="daily">Quotidien</option>
                      <option value="weekly">Hebdomadaire</option>
                      <option value="monthly">Mensuel</option>
                    </select>
                  </div>

                  {recurrenceType === 'weekly' && (
                    <div>
                      <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', color: '#ccc' }}>
                        Ces jours-là
                      </label>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {WEEKDAY_LABELS.map(({ value, label }) => (
                          <button
                            key={value}
                            type="button"
                            onClick={() => toggleRecurrenceWeeklyDay(value)}
                            style={{
                              padding: '10px 14px',
                              borderRadius: '8px',
                              border: recurrenceWeeklyDays.includes(value) ? '1px solid #ff416c' : '1px solid #444',
                              background: recurrenceWeeklyDays.includes(value) ? 'rgba(255, 65, 108, 0.25)' : 'rgba(255, 255, 255, 0.05)',
                              color: '#fff',
                              cursor: 'pointer',
                              fontWeight: '500',
                              fontSize: '13px',
                            }}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Récap des dates générées + personnalisation des heures par date */}
                  {recurringDates.length > 0 && (
                    <div style={{ marginTop: '8px' }}>
                      <label style={{ display: 'block', marginBottom: '12px', fontWeight: '500', color: '#ccc' }}>
                        Dates générées ({recurringDates.length}) — personnaliser les heures par date (optionnel)
                      </label>
                      <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                        maxHeight: '280px',
                        overflowY: 'auto',
                        padding: '12px',
                        backgroundColor: 'rgba(0, 0, 0, 0.3)',
                        borderRadius: '8px',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                      }}>
                        {recurringDates.map((dateStr) => {
                          const override = dateTimeOverrides[dateStr];
                          const startVal = override?.startTime ?? formData.startTime;
                          const endVal = override?.endTime ?? formData.endTime;
                          return (
                            <div
                              key={dateStr}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '12px',
                                padding: '10px 12px',
                                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                                borderRadius: '6px',
                                border: '1px solid rgba(255, 255, 255, 0.1)',
                                flexWrap: 'wrap',
                              }}
                            >
                              <span style={{ color: '#fff', fontSize: '13px', minWidth: '160px' }}>
                                {new Date(dateStr).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                              </span>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: '1 1 auto' }}>
                                <select
                                  value={startVal}
                                  onChange={(e) => setDateTimeForDate(dateStr, e.target.value, endVal)}
                                  style={{ ...inputStyle, padding: '8px 10px', marginBottom: 0, minWidth: '90px' }}
                                >
                                  {timeSlots.map((s) => (
                                    <option key={s.value} value={s.value}>{s.label}</option>
                                  ))}
                                </select>
                                <span style={{ color: '#888' }}>→</span>
                                <select
                                  value={endVal}
                                  onChange={(e) => setDateTimeForDate(dateStr, startVal, e.target.value)}
                                  style={{ ...inputStyle, padding: '8px 10px', marginBottom: 0, minWidth: '90px' }}
                                >
                                  {timeSlots.map((s) => (
                                    <option key={s.value} value={s.value}>{s.label}</option>
                                  ))}
                                </select>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div style={sectionGridStyle}>

                {/* Heure de début - Dropdown personnalisé */}
                <div ref={startTimeRef} style={{ position: 'relative', zIndex: 100 }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', color: '#ccc' }}>
                    Heure de début *
                  </label>
                  <div
                    onClick={() => {
                      setOpenStartTimeDropdown(!openStartTimeDropdown);
                      setOpenEndTimeDropdown(false);
                    }}
                    style={{
                      ...selectStyle,
                      borderColor: errors.startTime ? '#ef4444' : '#444',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      cursor: 'pointer'
                    }}
                  >
                    <span style={{ color: formData.startTime ? 'rgba(0, 0, 0, 1)' : '#999' }}>
                      {formData.startTime 
                        ? timeSlots.find(slot => slot.value === formData.startTime)?.label 
                        : 'Sélectionnez une heure'}
                    </span>
                    <ChevronDown 
                      size={18} 
                      style={{ 
                        color: '#fff', 
                        transform: openStartTimeDropdown ? 'rotate(180deg)' : 'rotate(0deg)',
                        transition: 'transform 0.2s ease'
                      }} 
                    />
                  </div>
                  {openStartTimeDropdown && (
                    <div style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      right: 0,
                      marginTop: '4px',
                      backgroundColor: '#1a1a2e',
                      border: '1px solid #444',
                      borderRadius: '8px',
                      maxHeight: '200px',
                      overflowY: 'auto',
                      zIndex: 1000,
                      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)'
                    }}>
                      {getAvailableStartTimeSlots().map((slot) => (
                        <div
                          key={slot.value}
                          onClick={() => handleTimeSelect(slot.value, 'startTime')}
                          style={{
                            padding: '12px 16px',
                            cursor: 'pointer',
                            color: '#fff',
                            backgroundColor: formData.startTime === slot.value ? 'rgba(255, 65, 108, 0.3)' : 'transparent',
                            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                            transition: 'background-color 0.2s ease'
                          }}
                          onMouseEnter={(e) => {
                            if (formData.startTime !== slot.value) {
                              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (formData.startTime !== slot.value) {
                              e.currentTarget.style.backgroundColor = 'transparent';
                            }
                          }}
                        >
                          {slot.label}
                        </div>
                      ))}
                    </div>
                  )}
                  {errors.startTime && (
                    <p style={{ color: '#ef4444', fontSize: '12px', margin: '4px 0 0' }}>
                      {errors.startTime}
                    </p>
                  )}
                </div>

                {/* Événement unique : Durée — Récurrent : Heure de fin */}
                {eventType === 'unique' ? (
                  <div style={{ position: 'relative', zIndex: 99 }}>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', color: '#ccc' }}>
                      Durée *
                    </label>
                    <select
                      value={eventDurationMinutes}
                      onChange={(e) => setEventDurationMinutes(Number(e.target.value))}
                      style={{
                        ...selectStyle,
                        borderColor: errors.duration ? '#ef4444' : '#444',
                        cursor: 'pointer',
                      }}
                    >
                      {DURATION_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    {formData.date && formData.startTime && eventDurationMinutes > 0 && (() => {
                      const { endTime, endDate } = computeEndFromDuration(formData.date, formData.startTime, eventDurationMinutes);
                      const endDateObj = endDate ? new Date(endDate + 'T' + endTime + ':00') : new Date(formData.date + 'T' + endTime + ':00');
                      const label = endDate
                        ? endDateObj.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) + ' à ' + endTime.replace(':', 'h')
                        : 'à ' + endTime.replace(':', 'h');
                      return (
                        <p style={{ fontSize: '12px', color: '#aaa', marginTop: '6px' }}>
                          Fin : {label}
                        </p>
                      );
                    })()}
                    {errors.duration && (
                      <p style={{ color: '#ef4444', fontSize: '12px', margin: '4px 0 0' }}>
                        {errors.duration}
                      </p>
                    )}
                  </div>
                ) : (
                  <div ref={endTimeRef} style={{ position: 'relative', zIndex: 99 }}>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', color: '#ccc' }}>
                      Heure de fin *
                    </label>
                    <div
                      onClick={() => {
                        setOpenEndTimeDropdown(!openEndTimeDropdown);
                        setOpenStartTimeDropdown(false);
                      }}
                      style={{
                        ...selectStyle,
                        borderColor: errors.endTime ? '#ef4444' : '#444',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        cursor: 'pointer'
                      }}
                    >
                      <span style={{ color: formData.endTime ? 'rgba(0, 0, 0, 1)' : '#999' }}>
                        {formData.endTime 
                          ? timeSlots.find(slot => slot.value === formData.endTime)?.label 
                          : 'Sélectionnez une heure'}
                      </span>
                      <ChevronDown 
                        size={18} 
                        style={{ 
                          color: '#fff', 
                          transform: openEndTimeDropdown ? 'rotate(180deg)' : 'rotate(0deg)',
                          transition: 'transform 0.2s ease'
                        }} 
                      />
                    </div>
                    {openEndTimeDropdown && (
                      <div style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        marginTop: '4px',
                        backgroundColor: '#1a1a2e',
                        border: '1px solid #444',
                        borderRadius: '8px',
                        maxHeight: '200px',
                        overflowY: 'auto',
                        zIndex: 1000,
                        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)'
                      }}>
                        {timeSlots.map((slot) => (
                          <div
                            key={slot.value}
                            onClick={() => handleTimeSelect(slot.value, 'endTime')}
                            style={{
                              padding: '12px 16px',
                              cursor: 'pointer',
                              color: '#fff',
                              backgroundColor: formData.endTime === slot.value ? 'rgba(255, 65, 108, 0.3)' : 'transparent',
                              borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                              transition: 'background-color 0.2s ease'
                            }}
                            onMouseEnter={(e) => {
                              if (formData.endTime !== slot.value) {
                                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (formData.endTime !== slot.value) {
                                e.currentTarget.style.backgroundColor = 'transparent';
                              }
                            }}
                          >
                            {slot.label}
                          </div>
                        ))}
                      </div>
                    )}
                    {errors.endTime && (
                      <p style={{ color: '#ef4444', fontSize: '12px', margin: '4px 0 0' }}>
                        {errors.endTime}
                      </p>
                    )}
                  </div>
                )}

                {/* Type de lieu */}
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', color: '#ccc' }}>
                    Type de lieu
                  </label>
                  <select
                    id="venueType"
                    value={formData.venueType}
                    onChange={handleChange}
                    style={selectStyle}
                  >
                    <option value="">-- Sélectionnez --</option>
                    <option value="theatre">Théâtre</option>
                    <option value="salle_polyvalente">Salle polyvalente</option>
                    <option value="cafe">Café</option>
                    <option value="restaurant">Restaurant</option>
                    <option value="autre">Autre</option>
                  </select>
                </div>

                {/* Nombre de places pour spectateur */}
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', color: '#ccc' }}>
                    Nombre de places pour spectateur
                  </label>
                  <input
                    type="number"
                    id="maxSpectators"
                    value={formData.maxSpectators}
                    onChange={handleChange}
                    min={1}
                    max={10000}
                    placeholder="Nombre de places pour spectateur"
                    style={{
                      ...inputStyle,
                      borderColor: errors.maxSpectators ? '#ef4444' : '#444'
                    }}
                  />
                  {errors.maxSpectators && (
                    <p style={{ color: '#ef4444', fontSize: '12px', margin: '4px 0 0' }}>
                      {errors.maxSpectators}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Section Conditions */}
            <div style={sectionStyle}>
              <div style={sectionTitleStyle}>
                <Users size={20} style={{ color: '#ff416c' }} />
                <span>Conditions</span>
              </div>
              <div style={sectionGridStyle}>
                {/* Expérience minimale */}
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', color: '#ccc' }}>
                    Expérience minimale (années) *
                  </label>
                  <input
                    type="number"
                    id="minExperience"
                    value={formData.minExperience}
                    onChange={handleChange}
                    style={{
                      ...inputStyle,
                      borderColor: errors.minExperience ? '#ef4444' : '#444'
                    }}
                    placeholder="Ex: 2"
                    min="0"
                  />
                  {errors.minExperience && (
                    <p style={{ color: '#ef4444', fontSize: '12px', margin: '4px 0 0' }}>
                      {errors.minExperience}
                    </p>
                  )}
                </div>

                {/* Nombre maximum de comédiens */}
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', color: '#ccc' }}>
                    Nombre maximum de comédiens *
                  </label>
                  <input
                    type="number"
                    id="maxComedians"
                    value={formData.maxComedians}
                    onChange={handleChange}
                    style={{
                      ...inputStyle,
                      borderColor: errors.maxComedians ? '#ef4444' : '#444'
                    }}
                    placeholder="Ex: 5"
                    min="1"
                  />
                  {errors.maxComedians && (
                    <p style={{ color: '#ef4444', fontSize: '12px', margin: '4px 0 0' }}>
                      {errors.maxComedians}
                    </p>
                  )}
                </div>

                {/* Niveau d'expérience requis */}
                <div style={{ gridColumn: isMobile ? '1' : '1 / -1' }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', color: '#ccc' }}>
                    Niveau d'expérience requis
                  </label>
                  <select
                    id="requiredExperienceLevel"
                    value={formData.requiredExperienceLevel}
                    onChange={handleChange}
                    style={{
                      ...selectStyle,
                      borderColor: errors.requiredExperienceLevel ? '#ef4444' : '#444'
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
              </div>
            </div>

            {/* Boutons */}
            <div style={{ 
              marginTop: '32px',
              display: 'flex',
              flexDirection: isMobile ? 'column' : 'row',
              gap: '12px',
              justifyContent: 'flex-end'
            }}>
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                style={{
                  ...buttonStyle,
                  background: 'rgba(255, 255, 255, 0.1)',
                  color: '#fff',
                  border: '1px solid rgba(255, 255, 255, 0.2)'
                }}
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                style={{
                  ...buttonStyle,
                  background: 'linear-gradient(135deg, #ff416c 0%, #ff4b2b 100%)',
                  color: '#fff',
                  opacity: isSubmitting ? 0.7 : 1
                }}
              >
                {isSubmitting ? 'Création...' : 'Créer l\'évènement'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default CreateEventForm; 