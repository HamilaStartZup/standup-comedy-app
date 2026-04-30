import React from 'react';
import type { IVenueBooking } from '../types/venue';
import BookingStatusBadge, { STATUS_CONFIG } from './BookingStatusBadge';

interface Props {
  bookings: IVenueBooking[];
}

const VenueBookingHistory: React.FC<Props> = ({ bookings }) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {bookings.map((b) => {
        const color = STATUS_CONFIG[b.status]?.color ?? '#aaa';
        const date = new Date(b.requestedDate).toLocaleDateString('fr-FR', {
          weekday: 'short', day: 'numeric', month: 'long', year: 'numeric',
        });
        return (
          <div
            key={b._id}
            style={{
              background: '#1e1e3a',
              borderRadius: 8,
              padding: '12px 14px',
              borderLeft: `3px solid ${color}`,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13, color: '#fff' }}>{date}</div>
                {b.startTime && b.endTime && (
                  <div style={{ fontSize: 12, color: '#aaa', marginTop: 2 }}>
                    {b.startTime} – {b.endTime}
                  </div>
                )}
              </div>
              <BookingStatusBadge status={b.status} />
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default VenueBookingHistory;
