import React, { useState } from 'react';
import type { IVenueBooking } from '../types/venue';
import { canShowGroupInvoice, canShowInvoice } from '../utils/venueInvoice';
import VenueBookingInvoiceModal from './VenueBookingInvoiceModal';

interface BookingInvoiceButtonProps {
  bookings: IVenueBooking[];
  isSeries?: boolean;
  label?: string;
  onClick?: (e: React.MouseEvent) => void;
  compact?: boolean;
}

const buttonStyle: React.CSSProperties = {
  padding: '8px 16px',
  background: 'var(--ccc-bg-elevated)',
  color: '#2563eb',
  border: '1px solid #93c5fd',
  borderRadius: 8,
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 600,
};

const BookingInvoiceButton: React.FC<BookingInvoiceButtonProps> = ({
  bookings,
  isSeries = false,
  label = 'Facture',
  onClick,
  compact = false,
}) => {
  const [open, setOpen] = useState(false);
  const visible = bookings.length > 1 ? canShowGroupInvoice(bookings) : bookings[0] && canShowInvoice(bookings[0]);

  if (!visible) return null;

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          onClick?.(e);
          setOpen(true);
        }}
        style={{
          ...buttonStyle,
          ...(compact ? { padding: '6px 12px', fontSize: 12 } : {}),
        }}
      >
        🧾 {label}
      </button>
      {open && (
        <VenueBookingInvoiceModal
          bookings={bookings}
          isSeries={isSeries}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
};

export default BookingInvoiceButton;
