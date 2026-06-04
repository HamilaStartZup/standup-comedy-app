import React, { useState, useMemo, useEffect } from 'react';
import StyledDayPicker from './StyledDayPicker';
import SlotPickerModal from './SlotPickerModal';
import { useNavigate } from 'react-router-dom';
import { createBooking, createBookingBatch, getTakenSlots, getBookedDates, getFullDates } from '../services/api';
import { SuccessMessages, ErrorMessages, getErrorMessage } from '../services/systemMessages';
import { useAlert } from '../hooks/useAlert';
import { PRICING_TYPE_LABELS_DISPLAY } from '../types/venue';
import type { IVenueTimeRestrictions, IVenueBlockedDate, IExtraFee } from '../types/venue';
import { generateRecurringDates } from '../utils/recurrenceDates';

type RecurrenceType = 'daily' | 'weekly' | 'monthly';
const WEEKDAY_LABELS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

type PricingType = 'heure' | 'demi_journee' | 'journee' | 'soiree' | 'forfait' | 'pourcentage_billetterie' | 'gratuit';

type PricingBadgeConfig = {
  timeLabel: string;
  extraNote?: string;
  priceLabel?: (price: number) => string;
  variant?: 'success';
};

const PRICING_BADGES: Partial<Record<PricingType, PricingBadgeConfig>> = {
  journee: {
    timeLabel: 'Journée complète (00h00 à minuit)',
    priceLabel: (p) => `Prix : ${p.toLocaleString('fr-FR')} €`,
  },
  soiree: {
    timeLabel: 'Soirée (à partir de 18h00, jusqu\'à minuit)',
    priceLabel: (p) => `Prix : ${p.toLocaleString('fr-FR')} €`,
  },
  forfait: {
    timeLabel: 'Forfait — journée complète (00h00 à minuit)',
    priceLabel: (p) => `Prix forfait : ${p.toLocaleString('fr-FR')} €`,
  },
  gratuit: {
    timeLabel: 'Réservation gratuite — journée complète (00h00 à minuit)',
    variant: 'success',
  },
  pourcentage_billetterie: {
    timeLabel: 'Journée complète (00h00 à minuit)',
    extraNote: 'Paiement via reversement billetterie, à régler directement avec le propriétaire',
    priceLabel: (p) => `${p}% des recettes billetterie`,
  },
};

interface VenueBookingFormProps {
  venueId: string;
  venueName: string;
  blockedDates?: IVenueBlockedDate[];
  onBookingCreated?: () => void;
  pricingType?: PricingType;
  pricePerEvent?: number;
  deposit?: number;
  extraFees?: IExtraFee[];
  currency?: string;
  bookingMode?: 'manual' | 'automatic';
  minBookingDelay?: number;
  minDuration?: number;
  maxDuration?: number;
  acceptedEventTypes?: string[];
  cancellationConditions?: string;
  houseRules?: string;
  timeRestrictions?: IVenueTimeRestrictions;
  disabledWeekdays?: number[];
}

const toMin = (t: string) => { const [h, m] = (t || '0:0').split(':').map(Number); return h * 60 + m; };
const overlaps = (aStart: string, aEnd: string, bStart: string, bEnd: string) =>
  toMin(aEnd) > toMin(bStart) && toMin(bEnd) > toMin(aStart);
const parseLocalDate = (s: string) => { const [y, mo, d] = s.split('-').map(Number); return new Date(y, mo - 1, d); };
const toDateStr = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const FULL_DAY_TYPES = ['journee', 'soiree', 'forfait', 'gratuit', 'pourcentage_billetterie'];

interface PriceBreakdownData {
  base: number;
  hours: number | null;
  depositAmount: number;
  extraFeesList: IExtraFee[];
  extraFeesTotal: number;
  total: number;
}

const PriceBreakdown: React.FC<{ breakdown: PriceBreakdownData; currency: string }> = ({ breakdown, currency }) => {
  const { base, hours, depositAmount, extraFeesList, extraFeesTotal, total } = breakdown;
  const hasExtras = depositAmount > 0 || extraFeesTotal > 0;

  if (!hasExtras) {
    return (
      <span style={{
        display: 'inline-block', padding: '6px 14px',
        background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)',
        borderRadius: 8, fontSize: 13, color: '#6ee7b7', fontWeight: 600,
      }}>
        {hours !== null
          ? `Prix estimé : ${total.toLocaleString('fr-FR')} ${currency} (${hours} h × ${base / hours} ${currency}/h)`
          : `Prix : ${total.toLocaleString('fr-FR')} ${currency}`}
      </span>
    );
  }

  return (
    <div style={{
      background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: 10, padding: '12px 14px', fontSize: 13,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, color: '#ccc' }}>
        <span>{hours !== null ? `Location (${hours} h × ${base / hours} ${currency}/h)` : 'Location'}</span>
        <span style={{ fontWeight: 600 }}>{base.toLocaleString('fr-FR')} {currency}</span>
      </div>
      {depositAmount > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, color: '#ccc' }}>
          <span>Caution</span>
          <span style={{ fontWeight: 600 }}>{depositAmount.toLocaleString('fr-FR')} {currency}</span>
        </div>
      )}
      {extraFeesList.map((fee, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, color: '#ccc' }}>
          <span>{fee.description || 'Frais supplémentaire'}</span>
          <span style={{ fontWeight: 600 }}>{(fee.amount ?? 0).toLocaleString('fr-FR')} {currency}</span>
        </div>
      ))}
      <div style={{
        display: 'flex', justifyContent: 'space-between', paddingTop: 8,
        marginTop: 4, borderTop: '1px solid rgba(255,255,255,0.12)',
      }}>
        <span style={{ color: '#fff', fontWeight: 700 }}>Total à payer</span>
        <span style={{ color: '#ff416c', fontWeight: 800, fontSize: 15 }}>{total.toLocaleString('fr-FR')} {currency}</span>
      </div>
    </div>
  );
};

const VenueBookingForm: React.FC<VenueBookingFormProps> = ({
  venueId,
  venueName,
  blockedDates = [],
  onBookingCreated,
  pricingType,
  pricePerEvent,
  deposit,
  extraFees,
  currency = 'EUR',
  minBookingDelay = 0,
  minDuration,
  maxDuration,
  timeRestrictions,
  disabledWeekdays = [],
}) => {
  const { showSuccess, showError } = useAlert();
  const navigate = useNavigate();
  const [bookingMode, setBookingMode] = useState<'unique' | 'recurring'>('unique');
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [formData, setFormData] = useState({ startTime: '', endTime: '', message: '' });
  const [demiJourneeSlot, setDemiJourneeSlot] = useState<'matin' | 'aprem' | ''>('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [takenSlots, setTakenSlots] = useState<{ startTime: string; endTime: string }[]>([]);
  const [bookedCalendarDates, setBookedCalendarDates] = useState<Date[]>([]);
  const [isSlotModalOpen, setIsSlotModalOpen] = useState(false);
  const [fullBookedDates, setFullBookedDates] = useState<Set<string>>(new Set());

  // Mode récurrent
  const [recurrenceType, setRecurrenceType] = useState<RecurrenceType>('weekly');
  const [recurrenceStartDate, setRecurrenceStartDate] = useState('');
  const [recurrenceEndDate, setRecurrenceEndDate] = useState('');
  const [recurrenceWeeklyDays, setRecurrenceWeeklyDays] = useState<number[]>([]);
  const [batchUnavailable, setBatchUnavailable] = useState<{ date: string; reason: string }[]>([]);
  const [batchCreatedCount, setBatchCreatedCount] = useState<number | null>(null);

  const recurringDates = useMemo(() => {
    if (bookingMode !== 'recurring' || !recurrenceStartDate || !recurrenceEndDate) return [];
    return generateRecurringDates({
      type: recurrenceType,
      startDate: recurrenceStartDate,
      endDate: recurrenceEndDate,
      weeklyDays: recurrenceWeeklyDays,
    });
  }, [bookingMode, recurrenceType, recurrenceStartDate, recurrenceEndDate, recurrenceWeeklyDays]);

  const isFullDayPricing = FULL_DAY_TYPES.includes(pricingType || '');

  const recurringModalDate = useMemo(() => {
    if (recurrenceStartDate) return parseLocalDate(recurrenceStartDate);
    return new Date();
  }, [recurrenceStartDate]);

  useEffect(() => {
    if (!isFullDayPricing) return;
    getBookedDates(venueId)
      .then(dates => setBookedCalendarDates(dates.map(parseLocalDate)))
      .catch(() => setBookedCalendarDates([]));
  }, [venueId, isFullDayPricing]);

  useEffect(() => {
    if (isFullDayPricing || (pricingType && pricingType !== 'heure')) return;
    getFullDates(venueId)
      .then(dates => setFullBookedDates(new Set(dates)))
      .catch(() => setFullBookedDates(new Set()));
  }, [venueId, isFullDayPricing, pricingType]);

  useEffect(() => {
    if (!selectedDate) {
      setTakenSlots([]);
      return;
    }
    const dateStr = toDateStr(selectedDate);
    getTakenSlots(venueId, dateStr)
      .then(setTakenSlots)
      .catch((err) => {
        console.error('Impossible de charger les créneaux pris:', err);
        setTakenSlots([]);
      });
  }, [selectedDate, venueId]);

  const partialBlockedSlots = useMemo(() => {
    if (!selectedDate) return [];
    const dateStr = toDateStr(selectedDate);
    return blockedDates
      .filter(b => b.startTime && b.endTime && b.date.startsWith(dateStr))
      .map(b => ({ startTime: b.startTime!, endTime: b.endTime! }));
  }, [blockedDates, selectedDate]);

  const allBlockedSlots = useMemo(() => [...takenSlots, ...partialBlockedSlots], [takenSlots, partialBlockedSlots]);

  const demiJourneeMap = useMemo(() => {
    if (pricingType !== 'demi_journee') return null;
    const mS = timeRestrictions?.matinStart || '09:00';
    const mE = timeRestrictions?.matinEnd   || '13:00';
    const aS = timeRestrictions?.apremStart || '14:00';
    const aE = timeRestrictions?.apremEnd   || '18:00';
    const matinOn = timeRestrictions?.matinEnabled !== false;
    const apremOn = timeRestrictions?.apremEnabled !== false;
    const map: Record<string, { matin: boolean; aprem: boolean }> = {};
    blockedDates.forEach(b => {
      const key = b.date.split('T')[0];
      if (!map[key]) map[key] = { matin: false, aprem: false };
      if (!b.startTime || !b.endTime) { map[key].matin = true; map[key].aprem = true; return; }
      if (matinOn && overlaps(b.startTime, b.endTime, mS, mE)) map[key].matin = true;
      if (apremOn && overlaps(b.startTime, b.endTime, aS, aE)) map[key].aprem = true;
    });
    return { map, matinOn, apremOn };
  }, [blockedDates, pricingType, timeRestrictions]);

  const fullDayBlockedDates = useMemo(() => {
    if (demiJourneeMap) {
      const { map, matinOn, apremOn } = demiJourneeMap;
      return Object.entries(map)
        .filter(([_, v]) => {
          if (matinOn && apremOn) return v.matin && v.aprem;
          return matinOn ? v.matin : apremOn ? v.aprem : true;
        })
        .map(([key]) => parseLocalDate(key));
    }
    return blockedDates.filter(b => !b.startTime || !b.endTime).map(b => parseLocalDate(b.date.split('T')[0]));
  }, [blockedDates, demiJourneeMap]);

  const noAvailableSlotsDates = useMemo(() => {
    const fullDayBlockedKeys = new Set(fullDayBlockedDates.map(d => toDateStr(d)));
    const noSlotsSet = new Set<string>(fullBookedDates);

    // Pour tarifs journée/soiree/forfait: les dates réservées n'ont pas de créneau
    if (isFullDayPricing) {
      bookedCalendarDates.forEach(d => {
        const key = toDateStr(d);
        if (!fullDayBlockedKeys.has(key)) noSlotsSet.add(key);
      });
      return Array.from(noSlotsSet).map(parseLocalDate);
    }

    // Pour tarifs heure/demi-journée: vérifier les créneaux disponibles
    if (!pricingType || pricingType === 'heure') {
      const openMin = timeRestrictions?.openTime ? toMin(timeRestrictions.openTime) : 0;
      const closeMin = timeRestrictions?.closeTime ? toMin(timeRestrictions.closeTime) : 24 * 60;

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      for (let i = 0; i < 365; i++) {
        const checkDate = new Date(today);
        checkDate.setDate(checkDate.getDate() + i);
        const dateStr = toDateStr(checkDate);

        // Skip if fully blocked by owner
        if (fullDayBlockedKeys.has(dateStr)) continue;

        // Check if this date has any available slots
        let hasAvailable = false;
        const checkMinStartHour = i === 0 ? new Date().getHours() + 1 : 0;

        for (let m = openMin; m + 60 <= closeMin; m += 60) {
          const h = Math.floor(m / 60).toString().padStart(2, '0');
          const start = `${h}:00`;
          const endH = Math.floor((m + 60) / 60).toString().padStart(2, '0');
          const end = `${endH}:00`;
          const tooEarly = Math.floor(m / 60) < checkMinStartHour;
          const blocked = blockedDates.some(b => {
            const bDate = b.date.split('T')[0];
            if (bDate !== dateStr) return false;
            if (!b.startTime || !b.endTime) return true;
            return overlaps(start, end, b.startTime, b.endTime);
          });

          if (!tooEarly && !blocked) {
            hasAvailable = true;
            break;
          }
        }

        if (!hasAvailable) noSlotsSet.add(dateStr);
      }

      return Array.from(noSlotsSet).map(parseLocalDate);
    }

    if (pricingType === 'demi_journee') {
      blockedDates.forEach(b => {
        if (b.startTime && b.endTime) return;
        const key = b.date.split('T')[0];
        if (!fullDayBlockedKeys.has(key)) noSlotsSet.add(key);
      });

      return Array.from(noSlotsSet).map(parseLocalDate);
    }

    return [];
  }, [fullDayBlockedDates, bookedCalendarDates, pricingType, timeRestrictions, blockedDates, isFullDayPricing, fullBookedDates]);

  const isToday = useMemo(() => {
    if (!selectedDate) return false;
    const now = new Date();
    return selectedDate.getFullYear() === now.getFullYear() &&
      selectedDate.getMonth() === now.getMonth() &&
      selectedDate.getDate() === now.getDate();
  }, [selectedDate]);

  const minStartHour = useMemo(() => {
    if (!isToday) return 0;
    return new Date().getHours() + 1;
  }, [isToday]);

  const availableSlotsCount = useMemo(() => {
    if (!selectedDate) return null;
    if (pricingType === 'heure' || !pricingType) {
      const openMin = timeRestrictions?.openTime ? toMin(timeRestrictions.openTime) : 0;
      const closeMin = timeRestrictions?.closeTime ? toMin(timeRestrictions.closeTime) : 24 * 60;
      let count = 0;
      for (let m = openMin; m + 60 <= closeMin; m += 60) {
        const h = Math.floor(m / 60).toString().padStart(2, '0');
        const start = `${h}:00`;
        const endH = Math.floor((m + 60) / 60).toString().padStart(2, '0');
        const end = `${endH}:00`;
        const tooEarly = Math.floor(m / 60) < minStartHour;
        const blocked = allBlockedSlots.some(s => overlaps(start, end, s.startTime, s.endTime));
        if (!tooEarly && !blocked) count++;
      }
      return count;
    }
    if (pricingType === 'demi_journee') {
      const matinOn = timeRestrictions?.matinEnabled !== false;
      const apremOn = timeRestrictions?.apremEnabled !== false;
      const mS = timeRestrictions?.matinStart || '09:00';
      const mE = timeRestrictions?.matinEnd || '13:00';
      const aS = timeRestrictions?.apremStart || '14:00';
      const aE = timeRestrictions?.apremEnd || '18:00';
      const matinBlocked = allBlockedSlots.some(s => overlaps(s.startTime, s.endTime, mS, mE));
      const apremBlocked = allBlockedSlots.some(s => overlaps(s.startTime, s.endTime, aS, aE));
      let count = 0;
      if (matinOn && !matinBlocked) count++;
      if (apremOn && !apremBlocked) count++;
      return count;
    }
    return null;
  }, [selectedDate, pricingType, timeRestrictions, allBlockedSlots, minStartHour]);

  const hasAvailableSlots = availableSlotsCount === null || availableSlotsCount > 0;

  const selectedDateHasNoSlots = useMemo(() => {
    if (!selectedDate) return false;
    if (pricingType === 'heure' || pricingType === 'demi_journee' || !pricingType) {
      return !hasAvailableSlots;
    }
    const key = toDateStr(selectedDate);
    return noAvailableSlotsDates.some(d => toDateStr(d) === key);
  }, [selectedDate, pricingType, hasAvailableSlots, noAvailableSlotsDates]);

  const canSubmit = !selectedDate || !selectedDateHasNoSlots;

  // Récapitulatif des coûts
  const priceBreakdown = useMemo(() => {
    if (pricePerEvent === undefined) return null;
    if (pricingType === 'gratuit' || pricingType === 'pourcentage_billetterie') return null;

    const depositAmount = deposit ?? 0;
    const extraFeesList = (extraFees ?? []).filter(f => (f.amount ?? 0) > 0);
    const extraFeesTotal = extraFeesList.reduce((sum, f) => sum + (f.amount ?? 0), 0);

    if (pricingType === 'heure' || !pricingType) {
      if (!formData.startTime || !formData.endTime) return null;
      const hours = Math.ceil(Math.max(1, (toMin(formData.endTime) - toMin(formData.startTime)) / 60));
      const base = hours * pricePerEvent;
      return { base, hours, depositAmount, extraFeesList, extraFeesTotal, total: base + depositAmount + extraFeesTotal };
    }

    // Tarification fixe (demi_journee, journee, soiree, forfait)
    return { base: pricePerEvent, hours: null, depositAmount, extraFeesList, extraFeesTotal, total: pricePerEvent + depositAmount + extraFeesTotal };
  }, [pricingType, formData.startTime, formData.endTime, pricePerEvent, deposit, extraFees]);

  // Date minimale de réservation selon le délai imposé par le propriétaire
  const minSelectableDate = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    if (minBookingDelay > 0) d.setDate(d.getDate() + minBookingDelay);
    return d;
  }, [minBookingDelay]);

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!selectedDate) newErrors.date = 'La date est requise.';

    if (!pricingType || pricingType === 'heure') {
      if (!formData.startTime) newErrors.startTime = "L'heure de début est requise.";
      if (!formData.endTime) newErrors.endTime = "L'heure de fin est requise.";
      if (formData.startTime && formData.endTime && formData.startTime >= formData.endTime) {
        newErrors.endTime = "L'heure de fin doit être après l'heure de début.";
      }
    } else if (pricingType === 'demi_journee') {
      if (!demiJourneeSlot) newErrors.slot = 'Veuillez sélectionner un créneau.';
    }

    return newErrors;
  };

  const resolveTimeSlot = (): { startTime?: string; endTime?: string } => {
    if (!pricingType || pricingType === 'heure') {
      return { startTime: formData.startTime || undefined, endTime: formData.endTime || undefined };
    }
    if (pricingType === 'demi_journee') {
      return {
        startTime: demiJourneeSlot === 'matin'
          ? (timeRestrictions?.matinStart || '09:00')
          : (timeRestrictions?.apremStart || '14:00'),
        endTime: demiJourneeSlot === 'matin'
          ? (timeRestrictions?.matinEnd || '13:00')
          : (timeRestrictions?.apremEnd || '18:00'),
      };
    }
    return {};
  };

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (bookingMode === 'recurring') {
      if (recurringDates.length === 0) {
        setErrors({ recurrence: 'Aucune date générée. Vérifiez les dates et le motif de récurrence.' });
        return;
      }
      const recurringErrors: Record<string, string> = {};
      if (!pricingType || pricingType === 'heure') {
        if (!formData.startTime) recurringErrors.startTime = "L'heure de début est requise.";
        if (!formData.endTime) recurringErrors.endTime = "L'heure de fin est requise.";
        if (formData.startTime && formData.endTime && formData.startTime >= formData.endTime) {
          recurringErrors.endTime = "L'heure de fin doit être après l'heure de début.";
        }
      } else if (pricingType === 'demi_journee') {
        if (!demiJourneeSlot) recurringErrors.slot = 'Veuillez sélectionner un créneau.';
      }
      if (Object.keys(recurringErrors).length > 0) {
        setErrors(recurringErrors);
        return;
      }
      setErrors({});
      setIsSubmitting(true);
      const { startTime, endTime } = resolveTimeSlot();
      try {
        const result = await createBookingBatch(venueId, {
          dates: recurringDates,
          ...(startTime && { startTime }),
          ...(endTime && { endTime }),
          message: formData.message || undefined,
        });
        setBatchCreatedCount(result.created.length);
        setBatchUnavailable(result.unavailable);
        if (result.created.length > 0) {
          showSuccess(`${result.created.length} réservation(s) créée(s) sur ${recurringDates.length} demandée(s).`);
          onBookingCreated?.();
        }
        if (result.unavailable.length === 0) {
          navigate('/my-bookings');
        }
      } catch (err) {
        showError(getErrorMessage(err, ErrorMessages.BOOKING_CREATE_FAILED));
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    setErrors({});
    setIsSubmitting(true);

    const { startTime, endTime } = resolveTimeSlot();

    try {
      const requestedDate = toDateStr(selectedDate!);
      await createBooking(venueId, {
        requestedDate,
        ...(startTime && { startTime }),
        ...(endTime && { endTime }),
        message: formData.message || undefined,
      });
      showSuccess(SuccessMessages.BOOKING_CREATED);
      setSelectedDate(undefined);
      setFormData({ startTime: '', endTime: '', message: '' });
      setDemiJourneeSlot('');
      onBookingCreated?.();
      navigate('/my-bookings');
    } catch (err) {
      showError(getErrorMessage(err, ErrorMessages.BOOKING_CREATE_FAILED));
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: 'rgba(0,0,0,0.4)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 10,
    padding: '10px 14px',
    color: '#fff',
    fontSize: 14,
    outline: 'none',
    boxSizing: 'border-box',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 12,
    fontWeight: 600,
    color: '#aaa',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  };

  const errorStyle: React.CSSProperties = { color: '#ef4444', fontSize: 12, marginTop: 4 };

  const infoBadgeStyle: React.CSSProperties = {
    display: 'inline-block',
    padding: '8px 14px',
    background: 'rgba(59,130,246,0.12)',
    border: '1px solid rgba(59,130,246,0.3)',
    borderRadius: 8,
    fontSize: 13,
    color: '#93c5fd',
    marginBottom: 16,
    lineHeight: 1.5,
  };

  const infoBadgeSuccessStyle: React.CSSProperties = {
    ...infoBadgeStyle,
    background: 'rgba(16,185,129,0.1)',
    border: '1px solid rgba(16,185,129,0.3)',
    color: '#6ee7b7',
  };

  const showHourSelectors = !pricingType || pricingType === 'heure';
  const showDemiJournee = pricingType === 'demi_journee';

  return (
    <div
      style={{
        background: 'rgba(0,0,0,0.3)',
        border: '1px solid rgba(255,65,108,0.3)',
        borderRadius: 16,
        padding: 24,
        boxShadow: '0 4px 24px rgba(255,65,108,0.1)',
      }}
    >
      <style>{`
        @media (max-width: 480px) {
          .booking-time-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      <h3 style={{ margin: '0 0 4px 0', fontSize: 18, fontWeight: 700, color: '#fff' }}>
        Réserver cette salle
      </h3>
      <p style={{ margin: '0 0 16px 0', fontSize: 13, color: '#888' }}>{venueName}</p>

      {/* Sélecteur de mode */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {(['unique', 'recurring'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => { setBookingMode(m); setErrors({}); setBatchCreatedCount(null); setBatchUnavailable([]); }}
            style={{
              flex: 1, padding: '9px 0', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700,
              background: bookingMode === m ? 'linear-gradient(135deg,#ff416c,#ff4b2b)' : 'rgba(255,255,255,0.06)',
              color: bookingMode === m ? '#fff' : '#aaa',
            }}
          >
            {m === 'unique' ? 'Réservation unique' : 'Série récurrente'}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit}>
        {/* ── Mode récurrent ── */}
        {bookingMode === 'recurring' && (
          <div>
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Motif de récurrence</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {(['daily', 'weekly', 'monthly'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setRecurrenceType(t)}
                    style={{
                      flex: 1, padding: '8px 4px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)',
                      cursor: 'pointer', fontSize: 12, fontWeight: 600,
                      background: recurrenceType === t ? 'rgba(255,65,108,0.18)' : 'rgba(0,0,0,0.3)',
                      color: recurrenceType === t ? '#ff8fa3' : '#aaa',
                    }}
                  >
                    {t === 'daily' ? 'Quotidien' : t === 'weekly' ? 'Hebdo' : 'Mensuel'}
                  </button>
                ))}
              </div>
            </div>

            {recurrenceType === 'weekly' && (
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>Jours de la semaine</label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {WEEKDAY_LABELS.map((label, idx) => {
                    const active = recurrenceWeeklyDays.includes(idx);
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setRecurrenceWeeklyDays(
                          active ? recurrenceWeeklyDays.filter((d) => d !== idx) : [...recurrenceWeeklyDays, idx]
                        )}
                        style={{
                          padding: '5px 10px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.12)',
                          cursor: 'pointer', fontSize: 12, fontWeight: 600,
                          background: active ? 'rgba(255,65,108,0.18)' : 'rgba(0,0,0,0.3)',
                          color: active ? '#ff8fa3' : '#aaa',
                        }}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
              <div>
                <label style={labelStyle}>Date de début</label>
                <input
                  type="date"
                  value={recurrenceStartDate}
                  min={new Date().toISOString().split('T')[0]}
                  onChange={(e) => setRecurrenceStartDate(e.target.value)}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Date de fin</label>
                <input
                  type="date"
                  value={recurrenceEndDate}
                  min={recurrenceStartDate || new Date().toISOString().split('T')[0]}
                  onChange={(e) => setRecurrenceEndDate(e.target.value)}
                  style={inputStyle}
                />
              </div>
            </div>

            {/* Créneau en mode récurrent */}
            {showHourSelectors && (
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>Créneau</label>
                <button
                  type="button"
                  onClick={() => setIsSlotModalOpen(true)}
                  style={{ ...inputStyle, cursor: 'pointer', textAlign: 'left', display: 'block', width: '100%' }}
                >
                  {formData.startTime ? `${formData.startTime} – ${formData.endTime}` : 'Choisir un créneau…'}
                </button>
                {errors.startTime && <p style={errorStyle}>{errors.startTime}</p>}
                <SlotPickerModal
                  open={isSlotModalOpen}
                  onClose={() => setIsSlotModalOpen(false)}
                  pricingType="heure"
                  selectedDate={recurringModalDate}
                  timeRestrictions={timeRestrictions}
                  blockedSlots={[]}
                  minStartHour={0}
                  minDuration={minDuration}
                  maxDuration={maxDuration}
                  onSelect={({ startTime, endTime }) => setFormData((p) => ({ ...p, startTime, endTime }))}
                  initialSelection={formData.startTime ? { startTime: formData.startTime, endTime: formData.endTime } : undefined}
                />
              </div>
            )}

            {showDemiJournee && timeRestrictions?.matinEnabled === false && timeRestrictions?.apremEnabled === false && (
              <div style={{ marginBottom: 14, padding: '10px 14px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, fontSize: 13, color: '#fca5a5' }}>
                Aucun créneau demi-journée n'est disponible pour cette salle.
              </div>
            )}

            {showDemiJournee && !(timeRestrictions?.matinEnabled === false && timeRestrictions?.apremEnabled === false) && (
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>Créneau</label>
                <button
                  type="button"
                  onClick={() => setIsSlotModalOpen(true)}
                  style={{ ...inputStyle, cursor: 'pointer', textAlign: 'left', display: 'block', width: '100%' }}
                >
                  {demiJourneeSlot
                    ? demiJourneeSlot === 'matin'
                      ? `Matin (${timeRestrictions?.matinStart || '09:00'} – ${timeRestrictions?.matinEnd || '13:00'})`
                      : `Après-midi (${timeRestrictions?.apremStart || '14:00'} – ${timeRestrictions?.apremEnd || '18:00'})`
                    : 'Choisir un créneau…'}
                </button>
                {errors.slot && <p style={errorStyle}>{errors.slot}</p>}
                <SlotPickerModal
                  open={isSlotModalOpen}
                  onClose={() => setIsSlotModalOpen(false)}
                  pricingType="demi_journee"
                  selectedDate={recurringModalDate}
                  timeRestrictions={timeRestrictions}
                  blockedSlots={[]}
                  minStartHour={0}
                  onSelect={({ startTime, endTime, label }) => {
                    setFormData((p) => ({ ...p, startTime, endTime }));
                    if (label) setDemiJourneeSlot(label);
                  }}
                  initialSelection={formData.startTime ? { startTime: formData.startTime, endTime: formData.endTime } : undefined}
                />
              </div>
            )}

            {pricingType && PRICING_BADGES[pricingType] && (() => {
              const config = PRICING_BADGES[pricingType]!;
              const hasOpenClose = timeRestrictions?.openTime && timeRestrictions?.closeTime;
              const dynamicLabel =
                pricingType === 'soiree'
                  ? `Soirée (${timeRestrictions?.soireeStart || '18:00'} – ${timeRestrictions?.soireeEnd || '23:59'})`
                  : hasOpenClose
                    ? `Disponible de ${timeRestrictions!.openTime} à ${timeRestrictions!.closeTime}`
                    : config.timeLabel;
              return (
                <div style={{ marginBottom: 14 }}>
                  <p style={{ margin: '0 0 6px 0', fontSize: 12, color: '#888' }}>
                    Mode de tarification : <strong style={{ color: '#ccc' }}>{PRICING_TYPE_LABELS_DISPLAY[pricingType]}</strong>
                  </p>
                  <span style={config.variant === 'success' ? infoBadgeSuccessStyle : infoBadgeStyle}>
                    {dynamicLabel}
                    {config.extraNote && ` — ${config.extraNote}`}
                  </span>
                </div>
              );
            })()}

            {priceBreakdown && (
              <div style={{ marginBottom: 14 }}>
                <p style={{ margin: '0 0 6px 0', fontSize: 12, color: '#888' }}>
                  Mode de tarification : <strong style={{ color: '#ccc' }}>{PRICING_TYPE_LABELS_DISPLAY[pricingType as PricingType] || 'À l\'heure'}</strong>
                  {recurringDates.length > 0 && <span style={{ marginLeft: 8, color: '#666' }}>— par réservation</span>}
                </p>
                <PriceBreakdown breakdown={priceBreakdown} currency={currency} />
                {recurringDates.length > 0 && (
                  <div style={{ marginTop: 8, padding: '8px 14px', background: 'rgba(255,65,108,0.08)', border: '1px solid rgba(255,65,108,0.2)', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 13, color: '#ccc' }}>
                      Total estimé ({recurringDates.length} réservation{recurringDates.length > 1 ? 's' : ''})
                    </span>
                    <span style={{ fontSize: 15, fontWeight: 800, color: '#ff8fa3' }}>
                      {(priceBreakdown.total * recurringDates.length).toLocaleString('fr-FR')} {currency}
                    </span>
                  </div>
                )}
              </div>
            )}

            {recurringDates.length > 0 && (
              <div style={{ marginBottom: 14, padding: '10px 14px', background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 8, fontSize: 13, color: '#93c5fd' }}>
                <strong>{recurringDates.length} date(s) sélectionnée(s)</strong>
                {recurringDates.length <= 10 && (
                  <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {recurringDates.map((d) => (
                      <span key={d} style={{ background: 'rgba(59,130,246,0.15)', borderRadius: 4, padding: '2px 8px', fontSize: 11 }}>{d}</span>
                    ))}
                  </div>
                )}
                {recurringDates.length > 10 && (
                  <span style={{ fontSize: 11, color: '#64a4e4', marginLeft: 8 }}>({recurringDates.slice(0, 5).join(', ')}…)</span>
                )}
              </div>
            )}

            {batchUnavailable.length > 0 && (
              <div style={{ marginBottom: 14, padding: '10px 14px', background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.3)', borderRadius: 8, fontSize: 12, color: '#fdba74' }}>
                <strong>{batchUnavailable.length} date(s) non disponible(s) :</strong>
                <ul style={{ margin: '6px 0 0 0', paddingLeft: 16 }}>
                  {batchUnavailable.map(({ date, reason }) => (
                    <li key={date}>{date} — {reason}</li>
                  ))}
                </ul>
              </div>
            )}

            {batchCreatedCount !== null && batchCreatedCount > 0 && (
              <div style={{ marginBottom: 14, padding: '10px 14px', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: 8, fontSize: 13, color: '#6ee7b7' }}>
                {batchCreatedCount} réservation(s) soumise(s) avec succès.
              </div>
            )}

            {errors.recurrence && <p style={errorStyle}>{errors.recurrence}</p>}
          </div>
        )}

        {/* ── Mode unique ── */}
        {bookingMode === 'unique' && (<>
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Date souhaitée</label>
          <div
            style={{
              background: 'rgba(0,0,0,0.3)',
              border: errors.date
                ? '1px solid #ef4444'
                : '1px solid rgba(255,255,255,0.1)',
              borderRadius: 10,
              padding: '8px 4px',
            }}
          >
            <StyledDayPicker
              mode="single"
              selected={selectedDate}
              onSelect={(date) => {
                setSelectedDate(date);
                setFormData((p) => ({ ...p, startTime: '', endTime: '' }));
                setDemiJourneeSlot('');
              }}
              disabled={[{ before: minSelectableDate }, ...fullDayBlockedDates, ...(disabledWeekdays.length > 0 ? [{ dayOfWeek: disabledWeekdays }] : [])]}
              modifiers={{
                noAvailableSlots: noAvailableSlotsDates,
              }}
              modifiersClassNames={{
                noAvailableSlots: 'rdp-day_noAvailableSlots',
              }}
              showOutsideDays={false}
            />
          </div>
          {errors.date && <p style={errorStyle}>{errors.date}</p>}
        </div>

        {selectedDate && selectedDateHasNoSlots && (
          <div style={{ marginBottom: 16, padding: '10px 14px', background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.3)', borderRadius: 8, fontSize: 13, color: '#fdba74' }}>
            Aucun créneau disponible pour cette date.
          </div>
        )}

        {/* Bouton Créneau — pour 'heure' ou type absent */}
        {showHourSelectors && (
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Créneau</label>
            <button
              type="button"
              disabled={!selectedDate}
              onClick={() => setIsSlotModalOpen(true)}
              style={{ ...inputStyle, cursor: selectedDate ? 'pointer' : 'not-allowed', textAlign: 'left', display: 'block', width: '100%', opacity: selectedDate ? 1 : 0.5 }}
            >
              {formData.startTime ? `${formData.startTime} – ${formData.endTime}` : 'Choisir un créneau…'}
            </button>
            {errors.startTime && <p style={errorStyle}>{errors.startTime}</p>}
            {selectedDate && (
              <SlotPickerModal
                open={isSlotModalOpen}
                onClose={() => setIsSlotModalOpen(false)}
                pricingType="heure"
                selectedDate={selectedDate}
                timeRestrictions={timeRestrictions}
                blockedSlots={allBlockedSlots}
                minStartHour={minStartHour}
                minDuration={minDuration}
                maxDuration={maxDuration}
                onSelect={({ startTime, endTime }) => setFormData((p) => ({ ...p, startTime, endTime }))}
                initialSelection={formData.startTime ? { startTime: formData.startTime, endTime: formData.endTime } : undefined}
              />
            )}
          </div>
        )}

        {/* Récapitulatif des coûts pour le type 'heure' */}
        {showHourSelectors && priceBreakdown && (
          <div style={{ marginBottom: 16 }}>
            <p style={{ margin: '0 0 8px 0', fontSize: 12, color: '#888' }}>
              Mode de tarification : <strong style={{ color: '#ccc' }}>{PRICING_TYPE_LABELS_DISPLAY[pricingType as PricingType] || 'À l\'heure'}</strong>
            </p>
            <PriceBreakdown breakdown={priceBreakdown} currency={currency} />
          </div>
        )}

        {/* Bouton Créneau — pour 'demi_journee' */}
        {showDemiJournee && timeRestrictions?.matinEnabled === false && timeRestrictions?.apremEnabled === false && (
          <div style={{ marginBottom: 16, padding: '10px 14px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, fontSize: 13, color: '#fca5a5' }}>
            Aucun créneau demi-journée n'est disponible pour cette salle.
          </div>
        )}

        {showDemiJournee && !(timeRestrictions?.matinEnabled === false && timeRestrictions?.apremEnabled === false) && (
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Créneau</label>
            <button
              type="button"
              disabled={!selectedDate}
              onClick={() => setIsSlotModalOpen(true)}
              style={{ ...inputStyle, cursor: selectedDate ? 'pointer' : 'not-allowed', textAlign: 'left', display: 'block', width: '100%', opacity: selectedDate ? 1 : 0.5 }}
            >
              {demiJourneeSlot
                ? demiJourneeSlot === 'matin'
                  ? `Matin (${timeRestrictions?.matinStart || '09:00'} – ${timeRestrictions?.matinEnd || '13:00'})`
                  : `Après-midi (${timeRestrictions?.apremStart || '14:00'} – ${timeRestrictions?.apremEnd || '18:00'})`
                : 'Choisir un créneau…'}
            </button>
            {errors.slot && <p style={errorStyle}>{errors.slot}</p>}
            {selectedDate && (
              <SlotPickerModal
                open={isSlotModalOpen}
                onClose={() => setIsSlotModalOpen(false)}
                pricingType="demi_journee"
                selectedDate={selectedDate}
                timeRestrictions={timeRestrictions}
                blockedSlots={allBlockedSlots}
                minStartHour={0}
                onSelect={({ startTime, endTime, label }) => {
                  setFormData((p) => ({ ...p, startTime, endTime }));
                  if (label) setDemiJourneeSlot(label);
                }}
                initialSelection={formData.startTime ? { startTime: formData.startTime, endTime: formData.endTime } : undefined}
              />
            )}
            {priceBreakdown && (
              <>
                <p style={{ margin: '8px 0 8px 0', fontSize: 12, color: '#888' }}>
                  Mode de tarification : <strong style={{ color: '#ccc' }}>{PRICING_TYPE_LABELS_DISPLAY['demi_journee']}</strong>
                </p>
                <PriceBreakdown breakdown={priceBreakdown} currency={currency} />
              </>
            )}
          </div>
        )}

        {/* Badges info pour journee / soiree / forfait / gratuit / pourcentage_billetterie */}
        {pricingType && PRICING_BADGES[pricingType] && (() => {
          const config = PRICING_BADGES[pricingType]!;
          const hasOpenClose = timeRestrictions?.openTime && timeRestrictions?.closeTime;
          const dynamicLabel =
            pricingType === 'soiree'
              ? `Soirée (${timeRestrictions?.soireeStart || '18:00'} – ${timeRestrictions?.soireeEnd || '23:59'})`
              : hasOpenClose
                ? `Disponible de ${timeRestrictions!.openTime} à ${timeRestrictions!.closeTime}`
                : config.timeLabel;
          return (
            <div style={{ marginBottom: 16 }}>
              <p style={{ margin: '0 0 6px 0', fontSize: 12, color: '#888' }}>
                Mode de tarification : <strong style={{ color: '#ccc' }}>{PRICING_TYPE_LABELS_DISPLAY[pricingType]}</strong>
              </p>
              <span style={config.variant === 'success' ? infoBadgeSuccessStyle : infoBadgeStyle}>
                {dynamicLabel}
                {config.extraNote && ` — ${config.extraNote}`}
              </span>
              {priceBreakdown && (
                <div style={{ marginTop: 8 }}>
                  <PriceBreakdown breakdown={priceBreakdown} currency={currency} />
                </div>
              )}
            </div>
          );
        })()}
        </>)}

        <div style={{ marginBottom: 20 }}>
          <label style={labelStyle}>Message (optionnel)</label>
          <textarea
            value={formData.message}
            onChange={(e) => setFormData((p) => ({ ...p, message: e.target.value }))}
            placeholder="Décrivez votre événement, vos besoins..."
            rows={3}
            style={{ ...inputStyle, resize: 'vertical' }}
          />
        </div>

        {canSubmit && (
          <button
            type="submit"
            disabled={isSubmitting}
            style={{
              width: '100%',
              padding: '14px',
              background: isSubmitting
                ? 'rgba(255,65,108,0.5)'
                : 'linear-gradient(135deg, #ff416c 0%, #ff4b2b 100%)',
              color: '#fff',
              border: 'none',
              borderRadius: 10,
              fontSize: 15,
              fontWeight: 700,
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
            }}
          >
            {isSubmitting
            ? 'Envoi en cours...'
            : bookingMode === 'recurring'
              ? `Envoyer ${recurringDates.length > 0 ? recurringDates.length + ' demande(s)' : 'la série'}`
              : 'Envoyer la demande'
          }
          </button>
        )}

      </form>
    </div>
  );
};

export default VenueBookingForm;