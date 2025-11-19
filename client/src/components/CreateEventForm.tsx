import React, { type CSSProperties, useState, useRef, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { X, ChevronDown, MapPin, Calendar, Users } from 'lucide-react';
import api from '../services/api';

interface CreateEventFormProps {
  onClose: () => void;
  onEventCreated: () => void;
}

function CreateEventForm({ onClose, onEventCreated }: CreateEventFormProps) {
  const { user, token } = useAuth();
  const [isMobile, setIsMobile] = useState(false);

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

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    city: '',
    postalCode: '',
    address: '',
    country: '',
    date: new Date().toISOString().split('T')[0],
    venue: '',
    startTime: '',
    endTime: '',
    minExperience: '',
    maxComedians: '',
    status: 'PUBLISHED',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [openStartTimeDropdown, setOpenStartTimeDropdown] = useState(false);
  const [openEndTimeDropdown, setOpenEndTimeDropdown] = useState(false);
  const startTimeRef = useRef<HTMLDivElement>(null);
  const endTimeRef = useRef<HTMLDivElement>(null);

  // ✅ Typage corrigé pour setTimeout
  const addressSearchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isAutoFillingRef = useRef(false);

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

  const searchCityByPostalCode = async (postalCode: string): Promise<{ city: string; postalCode: string } | null> => {
    if (!postalCode || postalCode.length < 5) return null;

    try {
      const response = await fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(postalCode)}&limit=5`);
      const data = await response.json();
      if (data.features && data.features.length > 0) {
        const feature = data.features.find((f: any) => f.properties.postcode === postalCode) || data.features[0];
        const city = feature.properties.city || feature.properties.name;
        const code = feature.properties.postcode;
        if (code === postalCode) return { city, postalCode: code };
      }
    } catch (error) {
      console.error('Erreur recherche code postal:', error);
    }
    return null;
  };

  const searchPostalCodeByCity = async (city: string): Promise<{ city: string; postalCode: string } | null> => {
    if (!city || city.length < 2) return null;

    try {
      const response = await fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(city)}&limit=1&type=municipality`);
      const data = await response.json();
      if (data.features && data.features.length > 0) {
        const feature = data.features[0];
        const foundCity = feature.properties.city || feature.properties.name;
        const code = feature.properties.postcode;
        if (foundCity.toLowerCase().includes(city.toLowerCase()) || city.toLowerCase().includes(foundCity.toLowerCase())) {
          return { city: foundCity, postalCode: code };
        }
      }
    } catch (error) {
      console.error('Erreur recherche ville:', error);
    }
    return null;
  };

  const searchLocationByAddress = async (address: string): Promise<{ city: string; postalCode: string; address: string } | null> => {
    if (!address || address.length < 5) return null;

    try {
      const response = await fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(address)}&limit=1`);
      const data = await response.json();
      if (data.features && data.features.length > 0) {
        const feature = data.features[0];
        const city = feature.properties.city || feature.properties.name;
        const code = feature.properties.postcode;
        const fullAddress = feature.properties.label;
        return { city, postalCode: code, address: fullAddress };
      }
    } catch (error) {
      console.error('Erreur recherche adresse:', error);
    }
    return null;
  };

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { id, value } = e.target;

    if (isAutoFillingRef.current) {
      setFormData(prev => ({ ...prev, [id]: value }));
      return;
    }

    setFormData(prev => ({ ...prev, [id]: value }));

    if (errors[id]) {
      setErrors(prev => ({ ...prev, [id]: '' }));
    }

    // ✅ Auto-complétion code postal
    if (id === 'postalCode' && /^\d{5}$/.test(value)) {
      if (addressSearchTimeoutRef.current) clearTimeout(addressSearchTimeoutRef.current);
      addressSearchTimeoutRef.current = setTimeout(async () => {
        const result = await searchCityByPostalCode(value);
        if (result) {
          isAutoFillingRef.current = true;
          setFormData(prev => (!prev.city || prev.city.length < 2 ? { ...prev, city: result.city } : prev));
          setTimeout(() => { isAutoFillingRef.current = false; }, 100);
        }
      }, 500);
    }

    // ✅ Auto-complétion ville
    if (id === 'city' && value.length >= 3) {
      if (addressSearchTimeoutRef.current) clearTimeout(addressSearchTimeoutRef.current);
      addressSearchTimeoutRef.current = setTimeout(async () => {
        const result = await searchPostalCodeByCity(value);
        if (result) {
          isAutoFillingRef.current = true;
          setFormData(prev => ({
            ...prev,
            postalCode: (!prev.postalCode || prev.postalCode.length < 5) ? result.postalCode : prev.postalCode,
            city: result.city
          }));
          setTimeout(() => { isAutoFillingRef.current = false; }, 100);
        }
      }, 800);
    }

    // ✅ Auto-complétion adresse
    if (id === 'address' && value.length >= 5) {
      if (addressSearchTimeoutRef.current) clearTimeout(addressSearchTimeoutRef.current);
      addressSearchTimeoutRef.current = setTimeout(async () => {
        const result = await searchLocationByAddress(value);
        if (result) {
          isAutoFillingRef.current = true;
          setFormData(prev => ({
            ...prev,
            address: result.address,
            city: prev.city && prev.city.length >= 2 ? prev.city : result.city,
            postalCode: prev.postalCode && prev.postalCode.length >= 5 ? prev.postalCode : result.postalCode
          }));
          setTimeout(() => { isAutoFillingRef.current = false; }, 100);
        }
      }, 800);
    }
  };

  // Le reste du code (handleSubmit, styles, dropdowns, etc.) reste inchangé.

  return (
    <div style={{}}>
      {/* Ton JSX reste inchangé */}
    </div>
  );
}

export default CreateEventForm;
