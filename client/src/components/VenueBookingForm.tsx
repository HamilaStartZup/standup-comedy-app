import React, { useState, useMemo, useEffect } from 'react';
import StyledDayPicker from './StyledDayPicker';
import { useNavigate } from 'react-router-dom';
import { createBooking, getTakenSlots, getBookedDates } from '../services/api';
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
          <span style={{ fontWeight: 600 }}>{fee.amount.toLocaleString('fr-FR')} {currency}</span>
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

  const isFullDayPricing = FULL_DAY_TYPES.includes(pricingType || '');

  useEffect(() => {
    if (!isFullDayPricing) return;
    getBookedDates(venueId)
      .then(dates => setBookedCalendarDates(dates.map(parseLocalDate)))
      .catch(() => setBookedCalendarDates([]));
  }, [venueId, isFullDayPricing]);

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

  const partiallyBlockedDates = useMemo(() => {
    if (!pricingType || pricingType === 'heure') {
      const fullDayKeys = new Set(
        blockedDates.filter(b => !b.startTime || !b.endTime).map(b => b.date.split('T')[0])
      );
      const partialKeys = new Set<string>();
      blockedDates.forEach(b => {
        if (!b.startTime || !b.endTime) return;
        const key = b.date.split('T')[0];
        if (!fullDayKeys.has(key)) partialKeys.add(key);
      });
      return Array.from(partialKeys).map(parseLocalDate);
    }
    if (demiJourneeMap) {
      const { map, matinOn, apremOn } = demiJourneeMap;
      if (!(matinOn && apremOn)) return [];
      return Object.entries(map)
        .filter(([_, v]) => (v.matin || v.aprem) && !(v.matin && v.aprem))
        .map(([key]) => parseLocalDate(key));
    }
    return [];
  }, [blockedDates, pricingType, demiJourneeMap]);

  // For demi_journee: which sub-slots are blocked for the currently selected date
  const blockedSlotsForDate = useMemo(() => {
    if (pricingType !== 'demi_journee' || !selectedDate) return { matin: false, aprem: false };
    const dateStr = toDateStr(selectedDate);
    const mS = timeRestrictions?.matinStart || '09:00';
    const mE = timeRestrictions?.matinEnd   || '13:00';
    const aS = timeRestrictions?.apremStart || '14:00';
    const aE = timeRestrictions?.apremEnd   || '18:00';
    let matin = false;
    let aprem = false;
    blockedDates.forEach(b => {
      if (!b.date.startsWith(dateStr)) return;
      if (!b.startTime || !b.endTime) { matin = true; aprem = true; return; }
      if (overlaps(b.startTime, b.endTime, mS, mE)) matin = true;
      if (overlaps(b.startTime, b.endTime, aS, aE)) aprem = true;
    });
    return { matin, aprem };
  }, [blockedDates, pricingType, selectedDate, timeRestrictions]);

  const isStartHourDisabled = (hour: string): boolean =>
    allBlockedSlots.some(slot => toMin(hour) >= toMin(slot.startTime) && toMin(hour) < toMin(slot.endTime));

  const isEndHourDisabled = (hour: string): boolean => {
    if (!formData.startTime) return false;
    if (allBlockedSlots.some(slot =>
      toMin(formData.startTime) < toMin(slot.endTime) && toMin(slot.startTime) < toMin(hour)
    )) return true;
    const durationH = (toMin(hour) - toMin(formData.startTime)) / 60;
    if (minDuration !== undefined && durationH < minDuration) return true;
    if (maxDuration !== undefined && durationH > maxDuration) return true;
    return false;
  };

  const hourOptions = useMemo(() => {
    return Array.from({ length: 24 }, (_, i) => {
      const h = i.toString().padStart(2, '0');
      return { value: `${h}:00`, label: `${h}h00` };
    });
  }, []);

  const filteredHourOptions = useMemo(() => {
    if (pricingType !== 'heure' || !timeRestrictions?.openTime || !timeRestrictions?.closeTime) {
      return hourOptions;
    }
    const open = toMin(timeRestrictions.openTime);
    const close = toMin(timeRestrictions.closeTime);
    return hourOptions.filter((opt) => toMin(opt.value) >= open && toMin(opt.value) < close);
  }, [pricingType, timeRestrictions, hourOptions]);

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

  // Récapitulatif des coûts
  const priceBreakdown = useMemo(() => {
    if (pricePerEvent === undefined) return null;
    if (pricingType === 'gratuit' || pricingType === 'pourcentage_billetterie') return null;

    const depositAmount = deposit ?? 0;
    const extraFeesList = (extraFees ?? []).filter(f => f.amount > 0);
    const extraFeesTotal = extraFeesList.reduce((sum, f) => sum + f.amount, 0);

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

  const priceBadgeStyle: React.CSSProperties = {
    display: 'inline-block',
    padding: '6px 14px',
    background: 'rgba(16,185,129,0.1)',
    border: '1px solid rgba(16,185,129,0.25)',
    borderRadius: 8,
    fontSize: 13,
    color: '#6ee7b7',
    marginTop: 8,
    fontWeight: 600,
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
              disabled={[{ before: minSelectableDate }, ...fullDayBlockedDates, ...bookedCalendarDates]}
              modifiers={{
                fullyBlocked: fullDayBlockedDates,
                bookedDay: bookedCalendarDates,
                partiallyBlocked: partiallyBlockedDates,
              }}
              modifiersStyles={{
                fullyBlocked: { color: '#ef4444', textDecoration: 'line-through', opacity: 1, cursor: 'not-allowed' },
                bookedDay:    { color: '#818cf8', textDecoration: 'line-through', opacity: 1, cursor: 'not-allowed' },
                partiallyBlocked: { color: '#f97316' },
              }}
              modifiersClassNames={{ partiallyBlocked: 'rdp-day_partiallyBlocked' }}
              showOutsideDays={false}
            />
          </div>
          {errors.date && <p style={errorStyle}>{errors.date}</p>}
          {(fullDayBlockedDates.length > 0 || bookedCalendarDates.length > 0 || partiallyBlockedDates.length > 0) && (
            <div style={{ fontSize: 11, marginTop: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
              {fullDayBlockedDates.length > 0 && (
                <span style={{ color: '#ef4444' }}>● Dates barrées (rouge) = bloquées par le propriétaire</span>
              )}
              {bookedCalendarDates.length > 0 && (
                <span style={{ color: '#818cf8' }}>● Dates barrées (violet) = déjà réservées</span>
              )}
              {partiallyBlockedDates.length > 0 && (
                <span style={{ color: '#f97316' }}>● Dates en orange = créneaux partiellement indisponibles</span>
              )}
            </div>
          )}
        </div>

        {/* Sélecteurs d'heures — uniquement pour 'heure' ou type absent */}
        {showHourSelectors && (
          <div className="booking-time-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>Heure de début</label>
              <select
                value={formData.startTime}
                onChange={(e) => setFormData((p) => ({ ...p, startTime: e.target.value, endTime: '' }))}
                style={{ ...inputStyle, cursor: 'pointer' }}
              >
                <option value="">--</option>
                {filteredHourOptions.filter((opt) => parseInt(opt.value) >= minStartHour).map((opt) => (
                  <option key={opt.value} value={opt.value} style={{ background: '#1a1a1a' }} disabled={isStartHourDisabled(opt.value)}>
                    {opt.label}
                  </option>
                ))}
              </select>
              {errors.startTime && <p style={errorStyle}>{errors.startTime}</p>}
            </div>
            <div>
              <label style={labelStyle}>Heure de fin</label>
              <select
                value={formData.endTime}
                onChange={(e) => setFormData((p) => ({ ...p, endTime: e.target.value }))}
                style={{ ...inputStyle, cursor: 'pointer' }}
              >
                <option value="">--</option>
                {filteredHourOptions.filter((opt) => !formData.startTime || opt.value > formData.startTime).map((opt) => (
                  <option key={opt.value} value={opt.value} style={{ background: '#1a1a1a' }} disabled={isEndHourDisabled(opt.value)}>
                    {opt.label}
                  </option>
                ))}
              </select>
              {errors.endTime && <p style={errorStyle}>{errors.endTime}</p>}
            </div>
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

        {/* Sélecteur créneau pour 'demi_journee' */}
        {showDemiJournee && timeRestrictions?.matinEnabled === false && timeRestrictions?.apremEnabled === false && (
          <div style={{ marginBottom: 16, padding: '10px 14px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, fontSize: 13, color: '#fca5a5' }}>
            Aucun créneau demi-journée n'est disponible pour cette salle.
          </div>
        )}

        {showDemiJournee && !(timeRestrictions?.matinEnabled === false && timeRestrictions?.apremEnabled === false) && (
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Créneau</label>
            <select
              value={demiJourneeSlot}
              onChange={(e) => setDemiJourneeSlot(e.target.value as 'matin' | 'aprem' | '')}
              style={{ ...inputStyle, cursor: 'pointer' }}
            >
              <option value="">-- Choisir un créneau --</option>
              {timeRestrictions?.matinEnabled !== false && (
                <option value="matin" disabled={blockedSlotsForDate.matin} style={{ background: '#1a1a1a' }}>
                  Matin ({timeRestrictions?.matinStart || '09:00'}–{timeRestrictions?.matinEnd || '13:00'}){blockedSlotsForDate.matin ? ' — indisponible' : ''}
                </option>
              )}
              {timeRestrictions?.apremEnabled !== false && (
                <option value="aprem" disabled={blockedSlotsForDate.aprem} style={{ background: '#1a1a1a' }}>
                  Après-midi ({timeRestrictions?.apremStart || '14:00'}–{timeRestrictions?.apremEnd || '18:00'}){blockedSlotsForDate.aprem ? ' — indisponible' : ''}
                </option>
              )}
            </select>
            {errors.slot && <p style={errorStyle}>{errors.slot}</p>}
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

      </form>
    </div>
  );
};

export default VenueBookingForm;
