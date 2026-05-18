import React, { useState, useMemo, useEffect } from 'react';
import StyledDayPicker from './StyledDayPicker';
import SlotPickerModal from './SlotPickerModal';
import { useNavigate } from 'react-router-dom';
import { createBooking, getTakenSlots, getBookedDates, getFullDates } from '../services/api';
import { SuccessMessages, ErrorMessages, getErrorMessage } from '../services/systemMessages';
import { useAlert } from '../hooks/useAlert';
import { PRICING_TYPE_LABELS_DISPLAY } from '../types/venue';
import type { IVenueTimeRestrictions, IVenueBlockedDate, IExtraFee } from '../types/venue';

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
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [formData, setFormData] = useState({ startTime: '', endTime: '', message: '' });
  const [demiJourneeSlot, setDemiJourneeSlot] = useState<'matin' | 'aprem' | ''>('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [takenSlots, setTakenSlots] = useState<{ startTime: string; endTime: string }[]>([]);
  const [bookedCalendarDates, setBookedCalendarDates] = useState<Date[]>([]);
  const [isSlotModalOpen, setIsSlotModalOpen] = useState(false);
  const [fullBookedDates, setFullBookedDates] = useState<Set<string>>(new Set());

  const isFullDayPricing = FULL_DAY_TYPES.includes(pricingType || '');

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

  const canSubmit = !selectedDate
    || !(pricingType === 'heure' || pricingType === 'demi_journee' || !pricingType)
    || hasAvailableSlots;

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

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    setErrors({});
    setIsSubmitting(true);

    // Résoudre startTime / endTime selon le type de tarification.
    // Pour les types "plats" (journee, soiree, forfait, gratuit, pourcentage_billetterie),
    // on n'envoie pas les heures : le controller les normalise côté serveur à partir des
    // timeRestrictions de la salle, évitant ainsi les conflits de validation schema.
    let startTime: string | undefined;
    let endTime: string | undefined;

    if (!pricingType || pricingType === 'heure') {
      startTime = formData.startTime || undefined;
      endTime = formData.endTime || undefined;
    } else if (pricingType === 'demi_journee') {
      startTime = demiJourneeSlot === 'matin'
        ? (timeRestrictions?.matinStart || '09:00')
        : (timeRestrictions?.apremStart || '14:00');
      endTime = demiJourneeSlot === 'matin'
        ? (timeRestrictions?.matinEnd || '13:00')
        : (timeRestrictions?.apremEnd || '18:00');
    }
    // Pour journee, soiree, forfait, gratuit, pourcentage_billetterie :
    // startTime/endTime restent undefined → le controller applique les timeRestrictions.

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

      <form onSubmit={handleSubmit}>
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


        {selectedDate && !hasAvailableSlots && (pricingType === 'heure' || pricingType === 'demi_journee' || !pricingType) && (
          <div style={{ marginBottom: 16, padding: '10px 14px', background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.3)', borderRadius: 8, fontSize: 13, color: '#fdba74' }}>
            Aucun créneau disponible pour cette date.
          </div>
        )}

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
            {isSubmitting ? 'Envoi en cours...' : 'Envoyer la demande'}
          </button>
        )}

      </form>
    </div>
  );
};

export default VenueBookingForm;
