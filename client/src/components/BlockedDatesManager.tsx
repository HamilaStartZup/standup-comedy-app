import React, { useState, useMemo } from 'react';
import StyledDayPicker from './StyledDayPicker';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { listBlockedDates, blockDate, unblockDate } from '../services/api';
import { SuccessMessages, ErrorMessages, getErrorMessage } from '../services/systemMessages';
import { useAlert } from '../hooks/useAlert';
import type { IVenueBlockedDate, IVenueTimeRestrictions } from '../types/venue';

interface BlockedDatesManagerProps {
  venueId: string;
  pricingType?: string;
  timeRestrictions?: IVenueTimeRestrictions;
}

const hourOptions = Array.from({ length: 24 }, (_, i) => {
  const h = i.toString().padStart(2, '0');
  return { value: `${h}:00`, label: `${h}h00` };
});

const toDateStr = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const FULL_DAY_TYPES = ['journee', 'soiree', 'forfait', 'gratuit', 'pourcentage_billetterie'];

const BlockedDatesManager: React.FC<BlockedDatesManagerProps> = ({ venueId, pricingType, timeRestrictions }) => {
  const isFullDayPricing = FULL_DAY_TYPES.includes(pricingType || '');
  const { showSuccess, showError } = useAlert();
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [showCalendar, setShowCalendar] = useState(false);
  const [form, setForm] = useState({ startTime: '', endTime: '', reason: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery<IVenueBlockedDate[]>({
    queryKey: ['blocked-dates', venueId],
    queryFn: () => listBlockedDates(venueId),
  });

  const minDate = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!selectedDate) errs.date = 'La date est requise.';
    if (form.startTime && form.endTime && form.startTime >= form.endTime) {
      errs.endTime = "L'heure de fin doit être après l'heure de début.";
    }
    return errs;
  };

  const handleBlock = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    setErrors({});
    setIsSubmitting(true);
    try {
      await blockDate(venueId, {
        date: toDateStr(selectedDate!),
        startTime: form.startTime || undefined,
        endTime: form.endTime || undefined,
        reason: form.reason || undefined,
      });
      showSuccess(SuccessMessages.DATE_BLOCKED);
      queryClient.invalidateQueries({ queryKey: ['blocked-dates', venueId] });
      setSelectedDate(undefined);
      setForm({ startTime: '', endTime: '', reason: '' });
      setShowCalendar(false);
    } catch (err) {
      showError(getErrorMessage(err, ErrorMessages.DATE_BLOCK_FAILED));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUnblock = async (blockedDateId: string) => {
    setDeletingId(blockedDateId);
    try {
      await unblockDate(venueId, blockedDateId);
      showSuccess(SuccessMessages.DATE_UNBLOCKED);
      queryClient.invalidateQueries({ queryKey: ['blocked-dates', venueId] });
    } catch (err) {
      showError(getErrorMessage(err, ErrorMessages.DATE_UNBLOCK_FAILED));
    } finally {
      setDeletingId(null);
    }
  };

  const inputStyle: React.CSSProperties = {
    background: 'rgba(0,0,0,0.4)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 10,
    padding: '10px 14px',
    color: '#fff',
    fontSize: 14,
    outline: 'none',
    width: '100%',
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

  const selectStyle: React.CSSProperties = {
    ...inputStyle,
    cursor: 'pointer',
    appearance: 'none',
  };

  return (
    <div>
      <style>{`
        @media (max-width: 600px) {
          .blocked-dates-grid { grid-template-columns: 1fr !important; }
          .blocked-date-row { flex-direction: column; align-items: flex-start !important; gap: 10px; }
          .blocked-date-row button { align-self: flex-start; }
        }
      `}</style>

      {/* Formulaire d'ajout */}
      <div
        style={{
          background: 'rgba(0,0,0,0.3)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 16,
          padding: 24,
          marginBottom: 24,
        }}
      >
        <h4 style={{ margin: '0 0 20px 0', fontSize: 16, fontWeight: 700, color: '#fff' }}>
          Bloquer une date
        </h4>
        <form onSubmit={handleBlock}>
          {/* Sélecteur de date */}
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Date *</label>
            <button
              type="button"
              onClick={() => setShowCalendar((v) => !v)}
              style={{
                ...inputStyle,
                textAlign: 'left',
                cursor: 'pointer',
                color: selectedDate ? '#fff' : '#666',
                border: errors.date
                  ? '1px solid #ef4444'
                  : '1px solid rgba(255,255,255,0.12)',
              }}
            >
              {selectedDate
                ? selectedDate.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
                : 'Choisir une date…'}
            </button>
            {errors.date && <p style={{ color: '#ef4444', fontSize: 12, margin: '4px 0 0' }}>{errors.date}</p>}

            {showCalendar && (
              <div
                style={{
                  marginTop: 8,
                  background: 'rgba(20,10,30,0.95)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 12,
                  padding: '8px 4px',
                  display: 'inline-block',
                }}
              >
                <StyledDayPicker
                  mode="single"
                  selected={selectedDate}
                  onSelect={(date) => {
                    setSelectedDate(date);
                    setShowCalendar(false);
                  }}
                  disabled={[{ before: minDate }]}
                  showOutsideDays={false}
                />
              </div>
            )}
          </div>

          {/* Note pour les types journée entière */}
          {isFullDayPricing && (
            <p style={{ fontSize: 12, color: '#aaa', marginBottom: 12, padding: '8px 12px', background: 'rgba(255,255,255,0.04)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.07)' }}>
              Ce type de tarification réserve la journée entière. Seul un blocage sans heure s'applique.
            </p>
          )}

          {/* Raccourcis demi-journée */}
          {pricingType === 'demi_journee' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: '#aaa', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Raccourcis :
              </span>
              {timeRestrictions?.matinEnabled !== false && (
                <button
                  type="button"
                  onClick={() => setForm(p => ({
                    ...p,
                    startTime: timeRestrictions?.matinStart || '09:00',
                    endTime:   timeRestrictions?.matinEnd   || '13:00',
                  }))}
                  style={{
                    padding: '5px 12px',
                    background: 'rgba(255,65,108,0.12)',
                    color: '#ff416c',
                    border: '1px solid rgba(255,65,108,0.3)',
                    borderRadius: 8,
                    cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  Matin ({timeRestrictions?.matinStart || '09:00'}–{timeRestrictions?.matinEnd || '13:00'})
                </button>
              )}
              {timeRestrictions?.apremEnabled !== false && (
                <button
                  type="button"
                  onClick={() => setForm(p => ({
                    ...p,
                    startTime: timeRestrictions?.apremStart || '14:00',
                    endTime:   timeRestrictions?.apremEnd   || '18:00',
                  }))}
                  style={{
                    padding: '5px 12px',
                    background: 'rgba(255,65,108,0.12)',
                    color: '#ff416c',
                    border: '1px solid rgba(255,65,108,0.3)',
                    borderRadius: 8,
                    cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  Après-midi ({timeRestrictions?.apremStart || '14:00'}–{timeRestrictions?.apremEnd || '18:00'})
                </button>
              )}
            </div>
          )}

          {/* Sélecteurs d'heures — masqués pour les types journée entière */}
          {!isFullDayPricing && (
            <div className="blocked-dates-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={labelStyle}>Heure début (optionnel)</label>
                <select
                  value={form.startTime}
                  onChange={(e) => setForm((p) => ({ ...p, startTime: e.target.value, endTime: '' }))}
                  style={selectStyle}
                >
                  <option value="" style={{ background: '#1a1a1a' }}>--</option>
                  {hourOptions.map((opt) => (
                    <option key={opt.value} value={opt.value} style={{ background: '#1a1a1a' }}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Heure fin (optionnel)</label>
                <select
                  value={form.endTime}
                  onChange={(e) => setForm((p) => ({ ...p, endTime: e.target.value }))}
                  style={selectStyle}
                  disabled={!form.startTime}
                >
                  <option value="" style={{ background: '#1a1a1a' }}>--</option>
                  {hourOptions.filter((opt) => !form.startTime || opt.value > form.startTime).map((opt) => (
                    <option key={opt.value} value={opt.value} style={{ background: '#1a1a1a' }}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                {errors.endTime && <p style={{ color: '#ef4444', fontSize: 12, margin: '4px 0 0' }}>{errors.endTime}</p>}
              </div>
            </div>
          )}

          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Raison (optionnel)</label>
            <input
              type="text"
              value={form.reason}
              onChange={(e) => setForm((p) => ({ ...p, reason: e.target.value }))}
              placeholder="Maintenance, événement privé..."
              style={inputStyle}
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            style={{
              padding: '10px 24px',
              background: isSubmitting
                ? 'rgba(255,65,108,0.4)'
                : 'linear-gradient(135deg, #ff416c 0%, #ff4b2b 100%)',
              color: '#fff',
              border: 'none',
              borderRadius: 10,
              fontWeight: 700,
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              fontSize: 14,
            }}
          >
            {isSubmitting ? 'Ajout...' : 'Bloquer cette date'}
          </button>
        </form>
      </div>

      {/* Liste des dates bloquées */}
      <div>
        <h4 style={{ margin: '0 0 16px 0', fontSize: 15, fontWeight: 700, color: '#fff' }}>
          Dates bloquées ({isLoading ? '...' : (data?.length || 0)})
        </h4>
        {error ? (
          <p style={{ color: '#ef4444', fontSize: 14, textAlign: 'center', padding: 24 }}>
            Impossible de charger les dates bloquées.
          </p>
        ) : !isLoading && (!data || data.length === 0) ? (
          <p style={{ color: '#888', fontSize: 14, textAlign: 'center', padding: 24 }}>
            Aucune date bloquée.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {(data || []).map((blocked) => (
              <div
                key={blocked._id}
                className="blocked-date-row"
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: 'rgba(0,0,0,0.3)',
                  border: '1px solid rgba(255,255,255,0.07)',
                  borderRadius: 12,
                  padding: '12px 16px',
                }}
              >
                <div>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#fff' }}>
                    {new Date(blocked.date).toLocaleDateString('fr-FR', {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                    {blocked.startTime && blocked.endTime && (
                      <span style={{ color: '#aaa', fontWeight: 400 }}>
                        {' '}· {blocked.startTime} – {blocked.endTime}
                      </span>
                    )}
                  </p>
                  {blocked.reason && (
                    <p style={{ margin: '2px 0 0', fontSize: 12, color: '#888' }}>{blocked.reason}</p>
                  )}
                </div>
                <button
                  onClick={() => handleUnblock(blocked._id)}
                  disabled={deletingId === blocked._id}
                  style={{
                    padding: '6px 14px',
                    background: 'rgba(239,68,68,0.15)',
                    color: '#ef4444',
                    border: '1px solid rgba(239,68,68,0.3)',
                    borderRadius: 8,
                    cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  {deletingId === blocked._id ? '...' : 'Débloquer'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default BlockedDatesManager;
