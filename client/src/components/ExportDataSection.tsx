import React, { useState, type CSSProperties } from 'react';
import api from '../services/api';

const ExportDataSection: React.FC = () => {
  const [isExporting, setIsExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExportData = async () => {
    try {
      setIsExporting(true);
      setError(null);
      setExportSuccess(false);

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

      setExportSuccess(true);

      // Masquer le message de succès après 5 secondes
      setTimeout(() => setExportSuccess(false), 5000);

    } catch (err: any) {
      console.error('Erreur lors de l\'export des données:', err);
      setError(err.response?.data?.message || 'Une erreur est survenue lors de l\'export');
    } finally {
      setIsExporting(false);
    }
  };

  const cardStyle: CSSProperties = {
    backgroundColor: '#1a1d27',
    borderRadius: '16px',
    padding: '24px',
    border: '1px solid #2a2d3a',
    borderLeft: '4px solid #667eea',
  };

  const titleStyle: CSSProperties = {
    fontSize: '1.2em',
    color: '#fff',
    marginBottom: '16px',
    display: 'flex',
    alignItems: 'center',
    fontWeight: 600,
  };

  const infoBoxStyle: CSSProperties = {
    padding: '14px 16px',
    borderRadius: '8px',
    background: 'rgba(255, 255, 255, 0.04)',
    borderLeft: '3px solid #667eea',
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
    background: 'rgba(255, 255, 255, 0.03)',
    borderRadius: '8px',
    color: '#888',
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
    background: 'linear-gradient(to right, #667eea, #764ba2)',
    color: '#fff',
  };

  return (
    <div style={cardStyle}>
      <h2 style={titleStyle}>
        <i className="fas fa-download" style={{ marginRight: '10px' }}></i>
        Exporter mes données
      </h2>

      <div style={infoBoxStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <i className="fas fa-shield-alt" style={{ color: '#667eea' }}></i>
          <span style={{ color: '#667eea', fontWeight: 'bold' }}>
            Droit à la portabilité (RGPD - Article 20)
          </span>
        </div>
        <p style={{ color: '#aaa', fontSize: '0.9em', margin: 0 }}>
          Téléchargez une copie de toutes vos données personnelles dans un format lisible (JSON).
        </p>
      </div>

      <p style={{ color: '#ccc', fontSize: '0.85em', marginBottom: '10px' }}>
        Le fichier contiendra :
      </p>

      <div style={dataListStyle}>
        <div style={dataItemStyle}>
          <i className="fas fa-user" style={{ color: '#667eea' }}></i>
          Profil
        </div>
        <div style={dataItemStyle}>
          <i className="fas fa-file-alt" style={{ color: '#667eea' }}></i>
          Candidatures / Événements
        </div>
        <div style={dataItemStyle}>
          <i className="fas fa-cog" style={{ color: '#667eea' }}></i>
          Préférences
        </div>
        <div style={dataItemStyle}>
          <i className="fas fa-bell" style={{ color: '#667eea' }}></i>
          Notifications
        </div>
      </div>

      {exportSuccess && (
        <div
          style={{
            padding: '12px 15px',
            borderRadius: '6px',
            background: 'rgba(255, 255, 255, 0.05)',
            borderLeft: '3px solid #28a745',
            marginBottom: '15px',
          }}
        >
          <p style={{ color: '#28a745', fontWeight: 'bold', margin: 0 }}>
            <i className="fas fa-check-circle" style={{ marginRight: '8px' }}></i>
            Vos données ont été exportées avec succès !
          </p>
        </div>
      )}

      {error && (
        <div
          style={{
            padding: '12px 15px',
            borderRadius: '6px',
            background: 'rgba(255, 255, 255, 0.05)',
            borderLeft: '3px solid #dc3545',
            marginBottom: '15px',
          }}
        >
          <p style={{ color: '#dc3545', fontSize: '0.9em', margin: 0 }}>
            <i className="fas fa-times-circle" style={{ marginRight: '8px' }}></i>
            {error}
          </p>
        </div>
      )}

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
