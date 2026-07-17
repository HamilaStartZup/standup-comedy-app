import React from 'react';
import Navbar from '../components/Navbar';
import { useMyInvoices } from '../hooks/useMyInvoices';
import { formatInvoiceMoney } from '../utils/venueInvoice';
import type { IInvoiceSnapshot } from '../types/venue';

const STATUS_LABELS: Record<IInvoiceSnapshot['paymentStatus'], string> = {
  paid: 'Payée',
  refund_pending: 'Remboursement en cours',
  refunded: 'Remboursée',
};

const joinName = (first?: string, last?: string): string => [first, last].filter(Boolean).join(' ');

const MyInvoicesPage: React.FC = () => {
  const { data: invoices, isLoading } = useMyInvoices();

  return (
    <div>
      <Navbar />
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>
        <h1 style={{ fontSize: 22, marginBottom: 16 }}>Mes factures</h1>

        {isLoading && <p>Chargement…</p>}
        {!isLoading && (invoices?.length ?? 0) === 0 && <p>Aucune facture pour le moment.</p>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {invoices?.map((invoice: IInvoiceSnapshot) => (
            <div
              key={invoice.booking}
              style={{
                border: '1px solid var(--ccc-border-light)',
                borderRadius: 12,
                padding: 16,
                background: 'var(--ccc-bg-elevated)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <strong>{invoice.invoiceNumber}</strong>
                  <span style={{ marginLeft: 10, color: 'var(--ccc-text-muted)', fontSize: 13 }}>
                    {new Date(invoice.issuedAt).toLocaleDateString('fr-FR')}
                  </span>
                </div>
                <span style={{ fontSize: 13 }}>{STATUS_LABELS[invoice.paymentStatus]}</span>
              </div>
              <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--ccc-text-secondary)' }}>
                {invoice.seller.venueName}
                {joinName(invoice.seller.ownerFirstName, invoice.seller.ownerLastName) &&
                  ` (${joinName(invoice.seller.ownerFirstName, invoice.seller.ownerLastName)})`}
                {' — '}
                {joinName(invoice.buyer.firstName, invoice.buyer.lastName)}
              </p>
              <p style={{ margin: '8px 0 0', fontWeight: 700 }}>
                {formatInvoiceMoney(invoice.subtotal, invoice.currency)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default MyInvoicesPage;
