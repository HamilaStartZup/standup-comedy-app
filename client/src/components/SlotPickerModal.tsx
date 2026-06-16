import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import type { IVenueTimeRestrictions } from '../types/venue';

interface SlotPickerModalProps {
  open: boolean;
  onClose: () => void;
  pricingType: 'heure' | 'demi_journee';
  selectedDate: Date;
  timeRestrictions?: IVenueTimeRestrictions;
  blockedSlots: { startTime: string; endTime: string }[];
  minStartHour: number;
  minDuration?: number;
  maxDuration?: number;
  onSelect: (slot: { startTime: string; endTime: string; label: 'matin' | 'aprem' | null }) => void;
  initialSelection?: { startTime: string; endTime: string };
}

const toMin = (t: string) => { const [h, m] = (t || '0:0').split(':').map(Number); return h * 60 + m; };
const overlaps = (aStart: string, aEnd: string, bStart: string, bEnd: string) =>
  toMin(aEnd) > toMin(bStart) && toMin(bEnd) > toMin(aStart);

const pad = (n: number) => String(n).padStart(2, '0');
const hhmm = (minutes: number) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;

const SlotPickerModal: React.FC<SlotPickerModalProps> = ({
  open,
  onClose,
  pricingType,
  timeRestrictions,
  blockedSlots,
  minStartHour,
  minDuration,
  maxDuration,
  onSelect,
  initialSelection,
}) => {
  const slots = useMemo(() => {
    if (pricingType !== 'heure') return [];
    const openMin = timeRestrictions?.openTime ? toMin(timeRestrictions.openTime) : 0;
    const closeMin = timeRestrictions?.closeTime ? toMin(timeRestrictions.closeTime) : 24 * 60;
    const result: { start: string; end: string; disabled: boolean }[] = [];
    for (let m = openMin; m + 60 <= closeMin; m += 60) {
      const start = hhmm(m);
      const end = hhmm(m + 60);
      const tooEarly = Math.floor(m / 60) < minStartHour;
      const blocked = blockedSlots.some(s => overlaps(start, end, s.startTime, s.endTime));
      result.push({ start, end, disabled: tooEarly || blocked });
    }
    return result;
  }, [pricingType, timeRestrictions, blockedSlots, minStartHour]);

  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open || pricingType !== 'heure') return;
    if (initialSelection?.startTime && initialSelection?.endTime) {
      const selStart = toMin(initialSelection.startTime);
      const selEnd = toMin(initialSelection.endTime);
      setSelected(new Set(
        slots
          .filter(s => !s.disabled && toMin(s.start) >= selStart && toMin(s.end) <= selEnd)
          .map(s => s.start)
      ));
    } else {
      setSelected(new Set());
    }
  }, [open]); // intentionally omits slots/initialSelection to only reset on open/close

  if (!open) return null;

  const overlayStyle: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.6)',
    backdropFilter: 'blur(4px)',
    zIndex: 9999,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '72px 16px 16px',
  };

  const dialogStyle: React.CSSProperties = {
    background: 'var(--ccc-bg-elevated)',
    border: '1px solid var(--ccc-border-subtle)',
    boxShadow: '0 12px 40px rgba(15, 23, 42, 0.12)',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 420,
    maxHeight: 'calc(100vh - 100px)',
    display: 'flex',
    flexDirection: 'column',
  };

  const closeBtnStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px',
    background: 'var(--ccc-accent-gradient)',
    color: '#fff',
    border: 'none',
    borderRadius: 10,
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 700,
  };

  // ── mode heure : multi-sélection ──────────────────────────────────────────
  if (pricingType === 'heure') {
    const hasAvailable = slots.some(s => !s.disabled);
    const selectedArr = slots.filter(s => selected.has(s.start));
    const canConfirm = selectedArr.length >= (minDuration ?? 1);

    const durConstraints = [
      minDuration && minDuration > 1 ? `min ${minDuration}h` : '',
      maxDuration ? `max ${maxDuration}h` : '',
    ].filter(Boolean).join(' · ');

    const summary = selectedArr.length > 0
      ? `${selectedArr[0].start} – ${selectedArr[selectedArr.length - 1].end} · ${selectedArr.length}h`
      : '';

    const toggle = (start: string) => {
      setSelected(prev => {
        const clickedIdx = slots.findIndex(s => s.start === start);

        if (prev.size === 0) return new Set([start]);

        const orderedSelected = slots.filter(s => prev.has(s.start)).map(s => s.start);
        const firstIdx = slots.findIndex(s => s.start === orderedSelected[0]);
        const lastIdx = slots.findIndex(s => s.start === orderedSelected[orderedSelected.length - 1]);

        if (prev.has(start)) {
          // Clic sur une extrémité → rétrécir
          if (start === orderedSelected[0] || start === orderedSelected[orderedSelected.length - 1]) {
            const next = new Set(prev);
            next.delete(start);
            return next;
          }
          // Clic au milieu → recommencer avec ce seul créneau
          return new Set([start]);
        }

        // Clic hors sélection → étendre la plage jusqu'au créneau cliqué (fill)
        const rangeStart = Math.min(firstIdx, clickedIdx);
        const rangeEnd = Math.max(lastIdx, clickedIdx);
        const rangeSlots = slots.slice(rangeStart, rangeEnd + 1);

        // Si un créneau bloqué ou dépassement de durée max → recommencer avec ce seul créneau
        if (rangeSlots.some(s => s.disabled)) return new Set([start]);
        if (maxDuration && rangeSlots.length > maxDuration) return new Set([start]);

        return new Set(rangeSlots.map(s => s.start));
      });
    };

    const confirm = () => {
      if (!canConfirm) return;
      onSelect({
        startTime: selectedArr[0].start,
        endTime: selectedArr[selectedArr.length - 1].end,
        label: null,
      });
      onClose();
    };

    return createPortal(
      <div role="dialog" aria-modal style={overlayStyle} onClick={onClose}>
        <div style={dialogStyle} onClick={(e) => e.stopPropagation()}>
          <p style={{ margin: '0 0 2px 0', fontSize: 16, fontWeight: 700, color: 'var(--ccc-text-primary)' }}>Choisir un créneau</p>
          <p style={{ margin: '0 0 8px 0', fontSize: 12, color: 'var(--ccc-text-muted)' }}>Sélectionnez un ou plusieurs créneaux d'1h</p>
          {durConstraints && (
            <p style={{ margin: '0 0 12px 0', fontSize: 12, color: '#f59e0b', fontWeight: 600 }}>{durConstraints}</p>
          )}

          <div style={{ overflowY: 'auto', flex: 1, marginBottom: 8 }}>
          {!hasAvailable ? (
            <p style={{ color: '#f97316', fontSize: 13, margin: '0 0 12px' }}>
              Aucun créneau disponible pour cette date.
            </p>
          ) : (
            slots.map(({ start, end, disabled }) => {
              const isSel = selected.has(start);
              return (
                <button
                  key={start}
                  type="button"
                  disabled={disabled}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    borderRadius: 10,
                    border: isSel ? '1px solid var(--ccc-accent)' : '1px solid var(--ccc-border-medium)',
                    background: isSel ? 'var(--ccc-accent-soft)' : 'var(--ccc-bg-surface)',
                    color: disabled ? 'var(--ccc-text-faint)' : isSel ? 'var(--ccc-accent)' : 'var(--ccc-text-primary)',
                    fontSize: 14,
                    textAlign: 'left',
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    marginBottom: 8,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    opacity: disabled ? 0.35 : 1,
                    fontWeight: isSel ? 600 : 400,
                  }}
                  onClick={() => !disabled && toggle(start)}
                >
                  <span>{start} – {end}</span>
                  {isSel && <span style={{ fontSize: 12 }}>✓</span>}
                </button>
              );
            })
          )}
          </div>

          {summary && (
            <div style={{ margin: '4px 0 8px', padding: '10px 14px', background: canConfirm ? 'rgba(34,197,94,0.08)' : 'rgba(245,158,11,0.08)', border: `1px solid ${canConfirm ? 'rgba(34,197,94,0.25)' : 'rgba(245,158,11,0.35)'}`, borderRadius: 8, fontSize: 13, color: canConfirm ? '#4ade80' : '#fbbf24', fontWeight: 600 }}>
              {summary}
              {!canConfirm && minDuration && selectedArr.length < minDuration && (
                <span style={{ fontWeight: 400, marginLeft: 8 }}>— sélectionnez encore {minDuration - selectedArr.length}h</span>
              )}
            </div>
          )}

          <button
            type="button"
            disabled={!canConfirm}
            style={{
              width: '100%',
              padding: '12px',
              background: canConfirm
                ? 'linear-gradient(135deg, #22c55e 0%, #10b981 100%)'
                : 'rgba(34,197,94,0.2)',
              color: canConfirm ? '#fff' : '#6b7280',
              border: 'none',
              borderRadius: 10,
              cursor: canConfirm ? 'pointer' : 'not-allowed',
              fontSize: 14,
              fontWeight: 700,
              marginBottom: 8,
            }}
            onClick={confirm}
          >
            Confirmer la sélection
          </button>
          <button type="button" style={closeBtnStyle} onClick={onClose}>Annuler</button>
        </div>
      </div>,
      document.body
    );
  }

  // ── mode demi_journee ─────────────────────────────────────────────────────
  const mS = timeRestrictions?.matinStart || '09:00';
  const mE = timeRestrictions?.matinEnd || '13:00';
  const aS = timeRestrictions?.apremStart || '14:00';
  const aE = timeRestrictions?.apremEnd || '18:00';
  const matinOn = timeRestrictions?.matinEnabled !== false;
  const apremOn = timeRestrictions?.apremEnabled !== false;

  const matinBlocked = blockedSlots.some(s => overlaps(s.startTime, s.endTime, mS, mE));
  const apremBlocked = blockedSlots.some(s => overlaps(s.startTime, s.endTime, aS, aE));
  const hasAvailable = (matinOn && !matinBlocked) || (apremOn && !apremBlocked);

  const cardStyle = (active: boolean, disabled: boolean): React.CSSProperties => ({
    padding: '16px',
    borderRadius: 10,
    border: active ? '1px solid var(--ccc-accent)' : '1px solid var(--ccc-border-medium)',
    background: active ? 'var(--ccc-accent-soft)' : 'var(--ccc-bg-surface)',
    color: disabled ? 'var(--ccc-text-faint)' : active ? 'var(--ccc-accent)' : 'var(--ccc-text-primary)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.4 : 1,
    marginBottom: 10,
    textAlign: 'left',
    width: '100%',
    fontWeight: active ? 700 : 400,
    fontSize: 14,
  });

  return createPortal(
    <div role="dialog" aria-modal style={overlayStyle} onClick={onClose}>
      <div style={dialogStyle} onClick={(e) => e.stopPropagation()}>
        <p style={{ margin: '0 0 16px 0', fontSize: 16, fontWeight: 700, color: 'var(--ccc-text-primary)' }}>Choisir un créneau</p>
        {!hasAvailable ? (
          <p style={{ color: '#f97316', fontSize: 13, margin: '0 0 12px' }}>
            Aucun créneau disponible pour cette date.
          </p>
        ) : (
          <>
            {matinOn && (
              <button
                type="button"
                disabled={matinBlocked}
                style={cardStyle(
                  initialSelection?.startTime === mS && initialSelection?.endTime === mE,
                  matinBlocked,
                )}
                onClick={() => { if (!matinBlocked) { onSelect({ startTime: mS, endTime: mE, label: 'matin' }); onClose(); } }}
              >
                <div style={{ fontWeight: 700, marginBottom: 4 }}>Matin</div>
                <div style={{ fontSize: 12, color: matinBlocked ? 'var(--ccc-text-faint)' : 'var(--ccc-text-muted)' }}>{mS} – {mE}{matinBlocked ? ' — indisponible' : ''}</div>
              </button>
            )}
            {apremOn && (
              <button
                type="button"
                disabled={apremBlocked}
                style={cardStyle(
                  initialSelection?.startTime === aS && initialSelection?.endTime === aE,
                  apremBlocked,
                )}
                onClick={() => { if (!apremBlocked) { onSelect({ startTime: aS, endTime: aE, label: 'aprem' }); onClose(); } }}
              >
                <div style={{ fontWeight: 700, marginBottom: 4 }}>Après-midi</div>
                <div style={{ fontSize: 12, color: apremBlocked ? 'var(--ccc-text-faint)' : 'var(--ccc-text-muted)' }}>{aS} – {aE}{apremBlocked ? ' — indisponible' : ''}</div>
              </button>
            )}
          </>
        )}
        <button type="button" style={closeBtnStyle} onClick={onClose}>Fermer</button>
      </div>
    </div>,
    document.body
  );
};

export default SlotPickerModal;
