import { useState } from 'react';
import { upgradeToOrganizer } from '../services/api';
import { useAlert } from '../hooks/useAlert';
import Modal from './Modal';
import { VENUE_TYPES } from '../types/venue';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function UpgradeToOrganizerForm({ isOpen, onClose, onSuccess }: Props) {
  const { showSuccess, showError } = useAlert();
  const [loading, setLoading] = useState(false);

  const [companyName, setCompanyName] = useState('');
  const [description, setDescription] = useState('');
  const [website, setWebsite] = useState('');
  const [selectedVenueTypes, setSelectedVenueTypes] = useState<string[]>([]);
  const [eventFrequency, setEventFrequency] = useState('monthly');
  const [postalCode, setPostalCode] = useState('');

  // Reset form on modal close
  const resetForm = () => {
    setCompanyName('');
    setDescription('');
    setWebsite('');
    setSelectedVenueTypes([]);
    setEventFrequency('monthly');
    setPostalCode('');
  };

  // Close and reset
  const handleClose = () => {
    resetForm();
    onClose();
  };

  const toggleVenueType = (type: string) => {
    setSelectedVenueTypes(prev =>
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    );
  };

  const handleSubmit = async () => {
    if (!postalCode.trim()) return showError('Le code postal est requis');
    setLoading(true);
    try {
      await upgradeToOrganizer({
        companyName,
        description,
        website,
        venueTypes: selectedVenueTypes,
        eventFrequency,
        postalCode: postalCode.trim(),
      });
      showSuccess('Compte converti en organisateur !');
      resetForm();
      onSuccess();
    } catch (err: any) {
      showError(err?.response?.data?.message || 'Erreur lors de la conversion.');
    } finally {
      setLoading(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 14px',
    background: '#0d0f1a',
    border: '1px solid #2a2d3e',
    borderRadius: '8px',
    color: '#fff',
    fontSize: '14px',
    boxSizing: 'border-box',
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} closeOnOverlayClick={false}>
      <h2 style={{ margin: '0 0 8px', fontSize: '20px' }}>Devenir Organisateur</h2>
      <p style={{ color: '#8b8fa8', fontSize: '14px', margin: '0 0 24px' }}>
        Complétez votre profil organisateur
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div>
          <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', color: '#8b8fa8' }}>
            Nom de société
          </label>
          <input style={inputStyle} type="text" value={companyName}
            onChange={e => setCompanyName(e.target.value)} placeholder="Ma Société" />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', color: '#8b8fa8' }}>
            Code postal <span style={{ color: '#e85d75' }}>*</span>
          </label>
          <input style={inputStyle} type="text" value={postalCode}
            onChange={e => setPostalCode(e.target.value)} placeholder="75001" />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', color: '#8b8fa8' }}>
            Description
          </label>
          <textarea style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' }}
            value={description} onChange={e => setDescription(e.target.value)}
            placeholder="Présentez votre activité..." />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', color: '#8b8fa8' }}>
            Site web
          </label>
          <input style={inputStyle} type="url" value={website}
            onChange={e => setWebsite(e.target.value)} placeholder="https://..." />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', color: '#8b8fa8' }}>
            Types de salles
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {VENUE_TYPES.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => toggleVenueType(value)}
                style={{
                  padding: '6px 12px', borderRadius: '20px', fontSize: '13px', cursor: 'pointer',
                  border: '1px solid',
                  borderColor: selectedVenueTypes.includes(value) ? '#e85d75' : '#2a2d3e',
                  background: selectedVenueTypes.includes(value) ? 'rgba(232,93,117,0.15)' : 'transparent',
                  color: selectedVenueTypes.includes(value) ? '#e85d75' : '#8b8fa8',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', color: '#8b8fa8' }}>
            Fréquence d'événements
          </label>
          <select style={inputStyle} value={eventFrequency}
            onChange={e => setEventFrequency(e.target.value)}>
            <option value="weekly">Hebdomadaire</option>
            <option value="monthly">Mensuel</option>
            <option value="occasional">Occasionnel</option>
          </select>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '12px', marginTop: '24px', justifyContent: 'flex-end' }}>
        <button
          onClick={handleClose}
          style={{
            padding: '10px 20px', background: 'transparent', border: '1px solid #2a2d3e',
            borderRadius: '8px', color: '#8b8fa8', cursor: 'pointer',
          }}
        >
          Annuler
        </button>
        <button
          onClick={handleSubmit}
          disabled={loading}
          style={{
            padding: '10px 20px', background: '#e85d75', border: 'none',
            borderRadius: '8px', color: '#fff', cursor: 'pointer',
          }}
        >
          {loading ? 'Conversion...' : 'Devenir Organisateur'}
        </button>
      </div>
    </Modal>
  );
}
