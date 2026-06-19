import React, { useState, type CSSProperties } from 'react';
import api from '../services/api';
import { useAlert } from '../hooks/useAlert';

const ExportDataSection: React.FC = () => {
  const [isExporting, setIsExporting] = useState(false);
  const { showSuccess, showError } = useAlert();

  const handleExportData = async () => {
    try {
      setIsExporting(true);

      // Appeler l'API d'export
      const response = await api.get('/profile/me/export', {
        responseType: 'blob',
      });

      // Créer un lien de téléchargement
      const blob = new Blob([JSON.stringify(JSON.parse(await response.data.text()), null, 2)], {
        type: 'application/json',
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;

      // Générer le nom du fichier
      const date = new Date().toISOString().split('T')[0];
      link.download = `mes-donnees-connect-comedy-club-${date}.json`;

      // Déclencher le téléchargement
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      showSuccess('Vos données ont été exportées avec succès !');

    } catch (err: any) {
      console.error('Erreur lors de l\'export des données:', err);
      showError(err.response?.data?.message || 'Une erreur est survenue lors de l\'export');
    } finally {
      setIsExporting(false);
    }
  };

  const cardStyle: CSSProperties = {
    backgroundColor: 'var(--ccc-bg-elevated)',
    borderRadius: '16px',
    padding: '24px',
    border: '1px solid var(--ccc-border-medium)',
    borderLeft: '4px solid var(--ccc-accent)',
  };

  const titleStyle: CSSProperties = {
    fontSize: '1.2em',
    color: 'var(--ccc-text-primary)',
    marginBottom: '16px',
    display: 'flex',
    alignItems: 'center',
    fontWeight: 600,
  };

  const infoBoxStyle: CSSProperties = {
    padding: '14px 16px',
    borderRadius: '8px',
    background: 'var(--ccc-bg-surface)',
    borderLeft: '3px solid var(--ccc-accent)',
    marginBottom: '16px',
  };

  const dataListStyle: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '10px',
    marginBottom: '16px',
  };

  const dataItemStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 12px',
    background: 'var(--ccc-bg-surface)',
    borderRadius: '8px',
    color: 'var(--ccc-text-muted)',
    fontSize: '0.85em',
  };

  const buttonStyle: CSSProperties = {
    padding: '12px 22px',
    borderRadius: '8px',
    border: 'none',
    fontWeight: 'bold',
    cursor: isExporting ? 'not-allowed' : 'pointer',
    opacity: isExporting ? 0.6 : 1,
    transition: 'all 0.3s ease',
    background: 'var(--ccc-accent-gradient)',
    color: 'var(--ccc-text-on-accent)',
  };

  return (
    <div style={cardStyle}>
      <h2 style={titleStyle}>
        <i className="fas fa-download" style={{ marginRight: '10px' }}></i>
        Exporter mes données
      </h2>

      <div style={infoBoxStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <i className="fas fa-shield-alt" style={{ color: 'var(--ccc-accent)' }}></i>
          <span style={{ color: 'var(--ccc-accent)', fontWeight: 'bold' }}>
            Droit à la portabilité (RGPD - Article 20)
          </span>
        </div>
        <p style={{ color: 'var(--ccc-text-muted)', fontSize: '0.9em', margin: 0 }}>
          Téléchargez une copie de toutes vos données personnelles dans un format lisible (JSON).
        </p>
      </div>

      <p style={{ color: 'var(--ccc-text-secondary)', fontSize: '0.85em', marginBottom: '10px' }}>
        Le fichier contiendra :
      </p>

      <div style={dataListStyle}>
        <div style={dataItemStyle}>
          <i className="fas fa-user" style={{ color: 'var(--ccc-accent)' }}></i>
          Profil
        </div>
        <div style={dataItemStyle}>
          <i className="fas fa-file-alt" style={{ color: 'var(--ccc-accent)' }}></i>
          Candidatures / Événements
        </div>
        <div style={dataItemStyle}>
          <i className="fas fa-cog" style={{ color: 'var(--ccc-accent)' }}></i>
          Préférences
        </div>
        <div style={dataItemStyle}>
          <i className="fas fa-bell" style={{ color: 'var(--ccc-accent)' }}></i>
          Notifications
        </div>
      </div>

      <button
        onClick={handleExportData}
        disabled={isExporting}
        style={buttonStyle}
      >
        {isExporting ? (
          <>
            <i className="fas fa-spinner fa-spin" style={{ marginRight: '8px' }}></i>
            Export en cours...
          </>
        ) : (
          <>
            <i className="fas fa-cloud-download-alt" style={{ marginRight: '8px' }}></i>
            Télécharger mes données
          </>
        )}
      </button>
    </div>
  );
};

export default ExportDataSection;
