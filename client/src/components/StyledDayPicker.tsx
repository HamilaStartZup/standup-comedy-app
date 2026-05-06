import { DayPicker } from 'react-day-picker';
import type { DayPickerProps } from 'react-day-picker';
import { fr } from 'date-fns/locale';
import 'react-day-picker/src/style.css';

const rdpCss = `
  .rdp {
    --rdp-cell-size: 38px;
    --rdp-accent-color: #ff416c;
    --rdp-background-color: rgba(255,65,108,0.15);
    --rdp-accent-color-dark: #ff416c;
    --rdp-background-color-dark: rgba(255,65,108,0.15);
    --rdp-outline: 2px solid #ff416c;
    --rdp-outline-selected: 2px solid #ff416c;
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
  .rdp-button:hover:not([disabled]) { background: rgba(255,65,108,0.25); color: #fff; }
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
    border-radius: 10px;
    transition: background 150ms ease, color 150ms ease, transform 150ms ease;
  }
  .rdp-day:hover:not(.rdp-day_selected):not([disabled]) {
    background: rgba(255,65,108,0.22);
    color: #fff;
    transform: translateY(-1px);
  }
  .rdp-day_selected {
    background: linear-gradient(135deg, #ff416c 0%, #ff4b2b 100%) !important;
    color: #fff !important;
    border-radius: 12px;
    box-shadow: 0 0 0 3px rgba(255,65,108,0.18);
  }
  .rdp-day_today {
    box-shadow: inset 0 0 0 1px rgba(255,255,255,0.35);
  }
  .rdp-day_disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .rdp-day_fullyBlocked {
    color: #ef4444 !important;
    opacity: 1 !important;
    cursor: not-allowed;
    position: relative;
  }
  .rdp-day_fullyBlocked::before,
  .rdp-day_fullyBlocked::after {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    width: 65%;
    height: 2px;
    background: rgba(239, 68, 68, 0.75);
    border-radius: 1px;
    pointer-events: none;
  }
  .rdp-day_fullyBlocked::before {
    transform: translate(-50%, -50%) rotate(45deg);
  }
  .rdp-day_fullyBlocked::after {
    transform: translate(-50%, -50%) rotate(-45deg);
  }
  .rdp-day_bookedDay {
    color: #3b82f6 !important;
    opacity: 1 !important;
    cursor: not-allowed;
  }
  .rdp-day_partiallyBlocked {
    color: #f97316 !important;
    position: relative;
  }
  .rdp-day_partiallyBlocked::after {
    content: '';
    position: absolute;
    bottom: 2px;
    left: 50%;
    transform: translateX(-50%);
    width: 4px;
    height: 4px;
    background: #f97316;
    border-radius: 50%;
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
