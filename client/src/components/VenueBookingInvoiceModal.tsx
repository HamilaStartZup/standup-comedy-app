import React, { useRef } from 'react';
import type { IVenueBooking } from '../types/venue';
import {
  formatClientName,
  formatGroupInvoiceNumber,
  formatInvoiceNumber,
  formatPricingLabel,
  formatVenueAddress,
  getBookingLineAmount,
  getInvoiceBookings,
  getInvoiceTotal,
  getPaymentStatusLabel,
} from '../utils/venueInvoice';

interface VenueBookingInvoiceModalProps {
  bookings: IVenueBooking[];
  isSeries: boolean;
  onClose: () => void;
}

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
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #ddd; padding: 10px; text-align: left; font-size: 13px; }
            th { background: #f3f4f6; }
            .muted { color: #64748b; font-size: 13px; }
            .total { font-size: 16px; font-weight: 700; margin-top: 16px; }
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
          background: '#fff',
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
            background: '#fff',
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
                background: 'linear-gradient(135deg, #ff416c, #ff4b2b)',
                color: '#fff',
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
          <p className="muted" style={{ margin: '0 0 20px', fontSize: 13, color: '#64748b' }}>
            Facture {isSeries ? 'de série' : ''} · {invoiceNumber}
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
            <div>
              <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#64748b' }}>
                Prestataire (salle)
              </p>
              <p style={{ margin: 0, fontWeight: 700 }}>{venue?.name ?? '—'}</p>
              {venue?.companyName && <p style={{ margin: '4px 0 0', fontSize: 13 }}>{venue.companyName}</p>}
              <p style={{ margin: '4px 0 0', fontSize: 13, color: '#475569' }}>{formatVenueAddress(venue)}</p>
              {venue?.siret && <p style={{ margin: '4px 0 0', fontSize: 13 }}>SIRET : {venue.siret}</p>}
              {venue?.contactEmail && <p style={{ margin: '4px 0 0', fontSize: 13 }}>{venue.contactEmail}</p>}
            </div>
            <div>
              <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#64748b' }}>
                Client
              </p>
              <p style={{ margin: 0, fontWeight: 700 }}>{formatClientName(requester)}</p>
              {requester?.organizerProfile?.companyName && (
                <p style={{ margin: '4px 0 0', fontSize: 13 }}>{requester.organizerProfile.companyName}</p>
              )}
              {requester?.email && <p style={{ margin: '4px 0 0', fontSize: 13 }}>{requester.email}</p>}
            </div>
          </div>

          <p style={{ margin: '0 0 16px', fontSize: 13, color: '#475569' }}>
            Date d&apos;émission :{' '}
            {invoiceDate
              ? new Date(invoiceDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
              : '—'}
            {' · '}
            Tarification : {formatPricingLabel(venue?.pricingType)}
          </p>

          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ border: '1px solid #e5e7eb', padding: 10, textAlign: 'left', background: '#f9fafb', fontSize: 12 }}>
                  Date
                </th>
                <th style={{ border: '1px solid #e5e7eb', padding: 10, textAlign: 'left', background: '#f9fafb', fontSize: 12 }}>
                  Créneau
                </th>
                <th style={{ border: '1px solid #e5e7eb', padding: 10, textAlign: 'left', background: '#f9fafb', fontSize: 12 }}>
                  Statut paiement
                </th>
                <th style={{ border: '1px solid #e5e7eb', padding: 10, textAlign: 'right', background: '#f9fafb', fontSize: 12 }}>
                  Montant
                </th>
              </tr>
            </thead>
            <tbody>
              {lines.map((b) => (
                <tr key={b._id}>
                  <td style={{ border: '1px solid #e5e7eb', padding: 10, fontSize: 13 }}>
                    {new Date(b.requestedDate).toLocaleDateString('fr-FR', {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </td>
                  <td style={{ border: '1px solid #e5e7eb', padding: 10, fontSize: 13 }}>
                    {b.startTime} – {b.endTime}
                  </td>
                  <td style={{ border: '1px solid #e5e7eb', padding: 10, fontSize: 13 }}>
                    {getPaymentStatusLabel(b)}
                    {b.paidAt && (
                      <span style={{ display: 'block', fontSize: 11, color: '#64748b' }}>
                        {new Date(b.paidAt).toLocaleDateString('fr-FR')}
                      </span>
                    )}
                  </td>
                  <td style={{ border: '1px solid #e5e7eb', padding: 10, fontSize: 13, textAlign: 'right' }}>
                    {getBookingLineAmount(b).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} {currency}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <p className="total" style={{ marginTop: 20, fontSize: 17, fontWeight: 700, textAlign: 'right' }}>
            Total TTC : {total.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} {currency}
          </p>

          {lines.some((b) => b.paymentStatus === 'refunded') && (
            <p style={{ marginTop: 12, fontSize: 12, color: '#b45309' }}>
              Certaines lignes ont fait l&apos;objet d&apos;un remboursement.
            </p>
          )}

          <p style={{ marginTop: 24, fontSize: 11, color: '#94a3b8' }}>
            Document généré par Connect Comedy Club à titre de justificatif de réservation.
            {isSeries ? ` Série de ${lines.length} date(s).` : ''}
          </p>
        </div>
      </div>
    </div>
  );
};

export default VenueBookingInvoiceModal;
