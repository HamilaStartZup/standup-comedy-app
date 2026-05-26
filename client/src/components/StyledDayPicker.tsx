import { DayPicker } from 'react-day-picker';
import type { DayPickerProps } from 'react-day-picker';
import { fr } from 'date-fns/locale';
import 'react-day-picker/src/style.css';

const rdpCss = `
  .rdp {
    --rdp-cell-size: 38px;
    --rdp-accent-color: rgba(255,255,255,0.85);
    --rdp-accent-background-color: rgba(255,255,255,0.12);
    --rdp-selected-border: 2px solid rgba(255,255,255,0.6);
    --rdp-today-color: #fff;
    --rdp-day-height: 38px;
    --rdp-day-width: 38px;
    --rdp-day_button-height: 36px;
    --rdp-day_button-width: 36px;
    margin: 0;
    font-size: 13px;
    color: #fff;
  }
  .rdp-months { justify-content: center; }
  .rdp-month { width: 100%; }
  .rdp-table { width: 100%; border-collapse: separate; border-spacing: 0; }
  .rdp-caption {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.85rem 1rem;
    background: rgba(255,65,108,0.18);
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 14px;
    margin-bottom: 10px;
  }
  .rdp-caption_label {
    color: #fff;
    font-weight: 700;
    font-size: 14px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    margin-left: 0.25rem;
  }
  .rdp-nav_button {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    color: #fff;
    background: rgba(255,255,255,0.08);
    border: 1px solid rgba(255,255,255,0.1);
  }
  .rdp-button:hover:not([disabled]) { background: rgba(249,115,22,0.25); color: #fff; }
  .rdp-weekday {
    color: rgba(255, 255, 255, 0.75) !important;
    opacity: 1 !important;
    font-size: 12px !important;
    font-weight: 600 !important;
    text-transform: uppercase !important;
    letter-spacing: 0.06em !important;
  }
  .rdp-day {
    color: #ffffff;
    font-weight: 700;
  }
  .rdp-day_button {
    border-radius: 10px !important;
    transition: background 150ms ease, color 150ms ease, transform 150ms ease;
  }
  .rdp-day_button:hover:not(:disabled) {
    background: rgba(249,115,22,0.22) !important;
    color: #fff;
    transform: translateY(-1px);
  }
  .rdp-selected .rdp-day_button {
    background: rgba(255,255,255,0.12) !important;
    border: 2px solid rgba(255,255,255,0.6) !important;
    color: #fff !important;
  }
  .rdp-today .rdp-day_button {
    box-shadow: inset 0 0 0 2px rgba(255,255,255,0.5);
    color: #fff;
  }
  .rdp-today:not(.rdp-selected) .rdp-day_button {
    border: 2px solid rgba(255,255,255,0.35) !important;
  }
  .rdp-disabled .rdp-day_button {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .rdp-day_noAvailableSlots .rdp-day_button {
    color: #f97316 !important;
    opacity: 1 !important;
  }
  .rdp-day_outside { opacity: 0.3; }
`;

const StyledDayPicker = ({ locale = fr, ...props }: DayPickerProps) => (
  <>
    <style>{rdpCss}</style>
    <DayPicker locale={locale} {...(props as any)} />
  </>
);

export default StyledDayPicker;
