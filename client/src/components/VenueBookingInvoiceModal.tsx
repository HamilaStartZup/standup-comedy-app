import React, { useRef } from 'react';
import type { IVenueBooking } from '../types/venue';
import {
  formatClientName,
  formatGroupInvoiceNumber,
  formatInvoiceMoney,
  formatInvoiceNumber,
  formatPricingLabel,
  formatVenueAddress,
  getBookingPriceBreakdown,
  getInvoiceBookings,
  getInvoiceTotal,
  getPaymentStatusLabel,
} from '../utils/venueInvoice';

interface VenueBookingInvoiceModalProps {
  bookings: IVenueBooking[];
  isSeries: boolean;
  onClose: () => void;
}

const cellBorder = '1px solid #e5e7eb';
const thStyle: React.CSSProperties = {
  border: cellBorder,
  padding: 10,
  textAlign: 'left',
  background: 'var(--ccc-bg-surface)',
  fontSize: 12,
  fontWeight: 600,
};

const VenueBookingInvoiceModal: React.FC<VenueBookingInvoiceModalProps> = ({
  bookings,
  isSeries,
  onClose,
}) => {
  const printRef = useRef<HTMLDivElement>(null);
  const lines = getInvoiceBookings(bookings);
  if (lines.length === 0) return null;

  const first = lines[0];
  const venue = first.venue;
  const requester = first.requester;
  const total = getInvoiceTotal(lines);
  const currency = venue?.currency ?? 'EUR';
  const invoiceNumber = isSeries && first.bookingGroupId
    ? formatGroupInvoiceNumber(first.bookingGroupId)
    : formatInvoiceNumber(first._id);
  const invoiceDate = lines
    .map((b) => b.paidAt ?? b.updatedAt ?? b.createdAt)
    .filter(Boolean)
    .sort()
    .reverse()[0];

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;
    const win = window.open('', '_blank', 'noopener,noreferrer');
    if (!win) return;
    win.document.write(`
      <!DOCTYPE html>
      <html lang="fr">
        <head>
          <meta charset="utf-8" />
          <title>Facture ${invoiceNumber}</title>
          <style>
            body { font-family: system-ui, -apple-system, sans-serif; color: #111; margin: 32px; }
            h1 { font-size: 22px; margin: 0 0 4px; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid var(--ccc-border-light); padding: 8px 10px; font-size: 13px; }
            th { background: #f3f4f6; text-align: left; }
            .booking-block { margin-bottom: 16px; }
            .detail-row td { background: #fafafa; color: var(--ccc-text-secondary); font-size: 12px; }
            .detail-row td:last-child { text-align: right; }
            .subtotal-row td { font-weight: 600; background: #f3f4f6; }
            .subtotal-row td:last-child { text-align: right; }
            .total { font-size: 16px; font-weight: 700; margin-top: 16px; text-align: right; }
            .muted { color: var(--ccc-text-muted); font-size: 13px; }
            @media print { body { margin: 16px; } }
          </style>
        </head>
        <body>${content.innerHTML}</body>
      </html>
    `);
    win.document.close();
    win.focus();
    win.print();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1100,
        background: 'rgba(0,0,0,0.75)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--ccc-bg-elevated)',
          borderRadius: 16,
          maxWidth: 720,
          width: '100%',
          maxHeight: '90vh',
          overflow: 'auto',
          boxShadow: '0 24px 64px rgba(0,0,0,0.35)',
        }}
      >
        <div
          className="no-print"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '16px 20px',
            borderBottom: '1px solid #e5e7eb',
            position: 'sticky',
            top: 0,
            background: 'var(--ccc-bg-elevated)',
            zIndex: 1,
          }}
        >
          <h2 style={{ margin: 0, fontSize: 18, color: '#1a1a1a' }}>
            {isSeries ? 'Facture — série' : 'Facture'}
          </h2>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              onClick={handlePrint}
              style={{
                padding: '8px 16px',
                background: 'var(--ccc-accent-gradient)',
                color: 'var(--ccc-text-on-accent)',
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer',
                fontWeight: 700,
                fontSize: 13,
              }}
            >
              Imprimer
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '8px 16px',
                background: '#f3f4f6',
                color: '#374151',
                border: '1px solid #e5e7eb',
                borderRadius: 8,
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              Fermer
            </button>
          </div>
        </div>

        <div ref={printRef} style={{ padding: 24, color: '#111' }}>
          <h1 style={{ margin: '0 0 4px', fontSize: 22 }}>Connect Comedy Club</h1>
          <p className="muted" style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--ccc-text-muted)' }}>
            Facture {isSeries ? 'de série' : ''} · {invoiceNumber}
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
            <div>
              <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ccc-text-muted)' }}>
                Prestataire (salle)
              </p>
              <p style={{ margin: 0, fontWeight: 700 }}>{venue?.name ?? '—'}</p>
              {venue?.companyName && <p style={{ margin: '4px 0 0', fontSize: 13 }}>{venue.companyName}</p>}
              <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--ccc-text-secondary)' }}>{formatVenueAddress(venue)}</p>
              {venue?.siret && <p style={{ margin: '4px 0 0', fontSize: 13 }}>SIRET : {venue.siret}</p>}
              {venue?.contactEmail && <p style={{ margin: '4px 0 0', fontSize: 13 }}>{venue.contactEmail}</p>}
            </div>
            <div>
              <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ccc-text-muted)' }}>
                Client
              </p>
              <p style={{ margin: 0, fontWeight: 700 }}>{formatClientName(requester)}</p>
              {requester?.organizerProfile?.companyName && (
                <p style={{ margin: '4px 0 0', fontSize: 13 }}>{requester.organizerProfile.companyName}</p>
              )}
              {requester?.email && <p style={{ margin: '4px 0 0', fontSize: 13 }}>{requester.email}</p>}
            </div>
          </div>

          <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--ccc-text-secondary)' }}>
            Date d&apos;émission :{' '}
            {invoiceDate
              ? new Date(invoiceDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
              : '—'}
            {' · '}
            Tarification : {formatPricingLabel(venue?.pricingType)}
          </p>

          {lines.map((b) => {
            const breakdown = getBookingPriceBreakdown(b);
            const dateLabel = new Date(b.requestedDate).toLocaleDateString('fr-FR', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            });

            return (
              <div key={b._id} className="booking-block" style={{ marginBottom: 20 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Date & créneau</th>
                      <th style={{ ...thStyle, width: '35%' }}>Statut paiement</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style={{ border: cellBorder, padding: 10, fontSize: 13, fontWeight: 600 }}>
                        {dateLabel}
                        <span style={{ display: 'block', fontWeight: 500, color: 'var(--ccc-text-muted)', marginTop: 4 }}>
                          {b.startTime} – {b.endTime}
                        </span>
                      </td>
                      <td style={{ border: cellBorder, padding: 10, fontSize: 13 }}>
                        {getPaymentStatusLabel(b)}
                        {b.paidAt && (
                          <span style={{ display: 'block', fontSize: 11, color: 'var(--ccc-text-muted)', marginTop: 4 }}>
                            {new Date(b.paidAt).toLocaleDateString('fr-FR')}
                          </span>
                        )}
                      </td>
                    </tr>
                    {breakdown && breakdown.lines.length > 0 && (
                      <>
                        <tr>
                          <td colSpan={2} style={{ border: cellBorder, padding: '8px 10px', background: '#f9fafb', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ccc-text-muted)' }}>
                            Détail du montant
                          </td>
                        </tr>
                        {breakdown.lines.map((line, idx) => (
                          <tr key={idx} className="detail-row">
                            <td style={{ border: cellBorder, padding: '8px 10px 8px 20px', fontSize: 12, color: 'var(--ccc-text-secondary)' }}>
                              {line.label}
                              {line.note && (
                                <span style={{ display: 'block', fontSize: 10, color: 'var(--ccc-text-faint)', fontStyle: 'italic', marginTop: 2 }}>
                                  {line.note}
                                </span>
                              )}
                            </td>
                            <td style={{ border: cellBorder, padding: '8px 10px', fontSize: 12, textAlign: 'right', color: 'var(--ccc-text-secondary)' }}>
                              {formatInvoiceMoney(line.amount, currency)}
                            </td>
                          </tr>
                        ))}
                        <tr className="subtotal-row">
                          <td style={{ border: cellBorder, padding: 10, fontSize: 13, fontWeight: 600 }}>
                            Sous-total
                          </td>
                          <td style={{ border: cellBorder, padding: 10, fontSize: 13, fontWeight: 700, textAlign: 'right' }}>
                            {formatInvoiceMoney(breakdown.subtotal, currency)}
                          </td>
                        </tr>
                      </>
                    )}
                  </tbody>
                </table>
              </div>
            );
          })}

          <p className="total" style={{ marginTop: 8, fontSize: 17, fontWeight: 700, textAlign: 'right', paddingTop: 12, borderTop: '2px solid #e5e7eb' }}>
            Total TTC : {formatInvoiceMoney(total, currency)}
          </p>

          {lines.some((b) => b.paymentStatus === 'refunded') && (
            <p style={{ marginTop: 12, fontSize: 12, color: 'var(--ccc-card-pending-text)' }}>
              Certaines lignes ont fait l&apos;objet d&apos;un remboursement.
            </p>
          )}

          <p style={{ marginTop: 24, fontSize: 11, color: 'var(--ccc-text-faint)' }}>
            Document généré par Connect Comedy Club à titre de justificatif de réservation.
            {isSeries ? ` Série de ${lines.length} date(s).` : ''}
          </p>
        </div>
      </div>
    </div>
  );
};

export default VenueBookingInvoiceModal;
