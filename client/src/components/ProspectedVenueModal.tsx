import React, { useEffect, useState } from 'react';
import {
  VENUE_TYPE_OPTIONS,
  type IProspectedVenue,
  type ProspectedVenueInput,
  type ProspectedVenueType,
} from '../types/prospection';

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--ccc-text-secondary)',
  marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 10,
  border: '1px solid var(--ccc-border-medium)',
  background: 'var(--ccc-bg-surface)',
  color: 'var(--ccc-text-primary)',
  fontSize: 14,
};

const emptyForm: ProspectedVenueInput = {
  name: '',
  type: 'autre',
  email: '',
  phone: '',
  street: '',
  city: '',
  postalCode: '',
  departement: '',
  website: '',
};

function venueToForm(venue: IProspectedVenue): ProspectedVenueInput {
  return {
    name: venue.name,
    type: venue.type,
    email: venue.email ?? '',
    phone: venue.phone ?? '',
    street: venue.address.street ?? '',
    city: venue.address.city ?? '',
    postalCode: venue.address.postalCode ?? '',
    departement: venue.address.departement ?? '',
    website: venue.website ?? '',
  };
}

interface ProspectedVenueModalProps {
  open: boolean;
  venue: IProspectedVenue | null;
  departments: Record<string, string>;
  saving: boolean;
  onClose: () => void;
  onSave: (payload: ProspectedVenueInput) => void;
}

const ProspectedVenueModal: React.FC<ProspectedVenueModalProps> = ({
  open,
  venue,
  departments,
  saving,
  onClose,
  onSave,
}) => {
  const [form, setForm] = useState<ProspectedVenueInput>(emptyForm);

  useEffect(() => {
    if (!open) return;
    setForm(venue ? venueToForm(venue) : emptyForm);
  }, [open, venue]);

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(form);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 560,
          maxHeight: '90vh',
          overflowY: 'auto',
          background: 'var(--ccc-bg-elevated)',
          borderRadius: 16,
          border: '1px solid var(--ccc-border-subtle)',
          padding: 24,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ margin: '0 0 20px', fontSize: 20 }}>
          {venue ? 'Modifier le lieu' : 'Ajouter un lieu'}
        </h2>

        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 14 }}>
          <div>
            <label style={labelStyle}>Nom *</label>
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Type *</label>
            <select
              required
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value as ProspectedVenueType })}
              style={inputStyle}
            >
              {VENUE_TYPE_OPTIONS.map(({ value, label }) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Téléphone</label>
              <input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                style={inputStyle}
              />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Adresse</label>
            <input
              value={form.street}
              onChange={(e) => setForm({ ...form, street: e.target.value })}
              style={inputStyle}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Ville</label>
              <input
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Code postal</label>
              <input
                value={form.postalCode}
                onChange={(e) => setForm({ ...form, postalCode: e.target.value })}
                style={inputStyle}
              />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Département</label>
            <select
              value={form.departement ?? ''}
              onChange={(e) => setForm({ ...form, departement: e.target.value })}
              style={inputStyle}
            >
              <option value="">Auto (depuis code postal)</option>
              {Object.entries(departments).map(([code, name]) => (
                <option key={code} value={code}>{code} — {name}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={labelStyle}>Site web</label>
            <input
              value={form.website}
              onChange={(e) => setForm({ ...form, website: e.target.value })}
              style={inputStyle}
              placeholder="https://..."
            />
          </div>

          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 8 }}>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              style={{
                padding: '10px 18px',
                borderRadius: 10,
                border: '1px solid var(--ccc-border-medium)',
                background: 'transparent',
                cursor: saving ? 'not-allowed' : 'pointer',
              }}
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={saving}
              style={{
                padding: '10px 18px',
                borderRadius: 10,
                border: 'none',
                background: '#7c3aed',
                color: '#fff',
                fontWeight: 700,
                cursor: saving ? 'not-allowed' : 'pointer',
                opacity: saving ? 0.7 : 1,
              }}
            >
              {saving ? 'Enregistrement…' : venue ? 'Enregistrer' : 'Ajouter'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ProspectedVenueModal;
