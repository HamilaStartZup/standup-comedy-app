import { type CSSProperties } from 'react';
import Modal from './Modal';
import type { IUserData } from '../types/user';

interface OrganizerDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  organizer: IUserData | null;
}

function OrganizerDetailsModal({ isOpen, onClose, organizer }: OrganizerDetailsModalProps) {
  if (!organizer) return null;

  const sectionTitleStyle: CSSProperties = {
    fontSize: '1.3em',
    color: '#7c3aed',
    marginTop: '20px',
    marginBottom: '15px',
    borderBottom: '2px solid #7c3aed',
    paddingBottom: '8px',
    fontWeight: 'bold'
  };

  const infoRowStyle: CSSProperties = {
    display: 'flex',
    marginBottom: '12px',
    alignItems: 'flex-start'
  };

  const infoLabelStyle: CSSProperties = {
    fontWeight: 'bold',
    color: '#ff4b2b',
    minWidth: '140px',
    marginRight: '15px'
  };

  const infoValueStyle: CSSProperties = {
    color: '#ffffff',
    flex: 1,
    wordBreak: 'break-word'
  };

  const badgeStyle: CSSProperties = {
    display: 'inline-block',
    padding: '4px 12px',
    borderRadius: '15px',
    backgroundColor: '#2196f3',
    color: '#ffffff',
    fontSize: '0.9em',
    fontWeight: 'bold',
    marginTop: '5px'
  };

  const getEventFrequencyLabel = (frequency?: string) => {
    const labels: Record<string, string> = {
      'weekly': 'Hebdomadaire',
      'monthly': 'Mensuel',
      'occasional': 'Occasionnel'
    };
    return labels[frequency || ''] || frequency || 'Non spécifié';
  };

  const getVenueTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      'bar': 'Bar',
      'restaurant': 'Restaurant',
      'theatre': 'Théâtre',
      'salle_spectacle': 'Salle de spectacle',
      'club': 'Club',
      'en_plein_air': 'En plein air',
      'autre': 'Autre'
    };
    return labels[type] || type;
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Profil Organisateur">
      <div>
        <h2 style={{ fontSize: '2em', color: '#ff4b2b', marginBottom: '10px', textAlign: 'center' }}>
          {organizer.firstName} {organizer.lastName}
        </h2>
        
        {/* Informations personnelles */}
        <h3 style={sectionTitleStyle}>📋 Informations personnelles</h3>
        
        <div style={infoRowStyle}>
          <span style={infoLabelStyle}>Nom complet:</span>
          <span style={infoValueStyle}>{organizer.firstName} {organizer.lastName}</span>
        </div>
        
        <div style={infoRowStyle}>
          <span style={infoLabelStyle}>Email:</span>
          <span style={infoValueStyle}>{organizer.email}</span>
        </div>
        
        {organizer.phone && (
          <div style={infoRowStyle}>
            <span style={infoLabelStyle}>Téléphone:</span>
            <span style={infoValueStyle}>{organizer.phone}</span>
          </div>
        )}
        
        {(organizer.city || organizer.organizerProfile?.location?.city) && (
          <div style={infoRowStyle}>
            <span style={infoLabelStyle}>Ville:</span>
            <span style={infoValueStyle}>
              {organizer.city || organizer.organizerProfile?.location?.city || 'Non renseigné'}
            </span>
          </div>
        )}
        
        {organizer.address && (
          <div style={infoRowStyle}>
            <span style={infoLabelStyle}>Adresse:</span>
            <span style={infoValueStyle}>{organizer.address}</span>
          </div>
        )}
        
        <div style={infoRowStyle}>
          <span style={infoLabelStyle}>Statut:</span>
          <span style={badgeStyle}>Organisateur vérifié</span>
        </div>

        {/* Profil Organisateur */}
        {organizer.organizerProfile && (
          <>
            <h3 style={sectionTitleStyle}>🏢 Profil Organisateur</h3>
            
            {organizer.organizerProfile.companyName && (
              <div style={infoRowStyle}>
                <span style={infoLabelStyle}>Nom de l'entreprise:</span>
                <span style={infoValueStyle}>{organizer.organizerProfile.companyName}</span>
              </div>
            )}
            
            {organizer.organizerProfile.description && (
              <div style={infoRowStyle}>
                <span style={infoLabelStyle}>Description:</span>
                <span style={infoValueStyle}>{organizer.organizerProfile.description}</span>
              </div>
            )}
            
            {organizer.organizerProfile.website && (
              <div style={infoRowStyle}>
                <span style={infoLabelStyle}>Site web:</span>
                <span style={infoValueStyle}>
                  <a 
                    href={organizer.organizerProfile.website} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    style={{ 
                      color: '#7c3aed', 
                      textDecoration: 'none',
                      wordBreak: 'break-all'
                    }}
                  >
                    {organizer.organizerProfile.website}
                  </a>
                </span>
              </div>
            )}
            
            {organizer.organizerProfile.location && (
              <>
                {organizer.organizerProfile.location.address && (
                  <div style={infoRowStyle}>
                    <span style={infoLabelStyle}>Adresse:</span>
                    <span style={infoValueStyle}>{organizer.organizerProfile.location.address}</span>
                  </div>
                )}
                
                {organizer.organizerProfile.location.postalCode && (
                  <div style={infoRowStyle}>
                    <span style={infoLabelStyle}>Code postal:</span>
                    <span style={infoValueStyle}>{organizer.organizerProfile.location.postalCode}</span>
                  </div>
                )}
                
                {organizer.organizerProfile.location.country && (
                  <div style={infoRowStyle}>
                    <span style={infoLabelStyle}>Pays:</span>
                    <span style={infoValueStyle}>{organizer.organizerProfile.location.country}</span>
                  </div>
                )}
              </>
            )}
            
            {organizer.organizerProfile.venueTypes && organizer.organizerProfile.venueTypes.length > 0 && (
              <div style={infoRowStyle}>
                <span style={infoLabelStyle}>Types de lieux:</span>
                <span style={infoValueStyle}>
                  {organizer.organizerProfile.venueTypes.map(getVenueTypeLabel).join(', ')}
                </span>
              </div>
            )}
            
            {organizer.organizerProfile.averageBudget && (
              <div style={infoRowStyle}>
                <span style={infoLabelStyle}>Budget moyen:</span>
                <span style={infoValueStyle}>
                  {organizer.organizerProfile.averageBudget.min !== undefined 
                    ? `${organizer.organizerProfile.averageBudget.min}` 
                    : 'Non spécifié'}
                  {organizer.organizerProfile.averageBudget.min !== undefined && 
                   organizer.organizerProfile.averageBudget.max !== undefined && ' - '}
                  {organizer.organizerProfile.averageBudget.max !== undefined 
                    ? `${organizer.organizerProfile.averageBudget.max}€` 
                    : organizer.organizerProfile.averageBudget.min !== undefined ? '€' : ''}
                </span>
              </div>
            )}
            
            {organizer.organizerProfile.eventFrequency && (
              <div style={infoRowStyle}>
                <span style={infoLabelStyle}>Fréquence des évènements:</span>
                <span style={infoValueStyle}>
                  {getEventFrequencyLabel(organizer.organizerProfile.eventFrequency)}
                </span>
              </div>
            )}
          </>
        )}
        
        {/* Statistiques de l'organisateur */}
        {organizer.stats && (
          <>
            <h3 style={sectionTitleStyle}>📊 Statistiques d'organisateur</h3>
            
            <div style={{ 
              backgroundColor: 'rgba(255, 255, 255, 0.05)', 
              padding: '15px', 
              borderRadius: '8px', 
              marginBottom: '15px',
              border: '1px solid rgba(255, 255, 255, 0.1)'
            }}>
              {organizer.stats.totalEvents !== undefined && (
                <div style={infoRowStyle}>
                  <span style={infoLabelStyle}>📅 Évènements organisés:</span>
                  <span style={{ ...infoValueStyle, color: '#28a745', fontWeight: 'bold' }}>
                    {organizer.stats.totalEvents} évènement{organizer.stats.totalEvents > 1 ? 's' : ''}
                  </span>
                </div>
              )}
              
              {organizer.stats.averageRating !== undefined && (
                <div style={infoRowStyle}>
                  <span style={infoLabelStyle}>⭐ Note moyenne:</span>
                  <span style={{ ...infoValueStyle, color: '#ffc107', fontWeight: 'bold' }}>
                    {organizer.stats.averageRating}/5 ⭐
                  </span>
                </div>
              )}
              
              {organizer.stats.totalRevenue !== undefined && (
                <div style={infoRowStyle}>
                  <span style={infoLabelStyle}>💰 Revenus totaux:</span>
                  <span style={{ ...infoValueStyle, color: '#17a2b8', fontWeight: 'bold' }}>
                    {organizer.stats.totalRevenue}€
                  </span>
                </div>
              )}
            </div>
          </>
        )}
        
        {/* Message s'il n'y a pas de profil */}
        {!organizer.organizerProfile && (
          <div style={{ 
            padding: '20px', 
            backgroundColor: 'rgba(255, 193, 7, 0.1)', 
            borderRadius: '8px', 
            border: '1px solid #ffc107',
            marginTop: '20px'
          }}>
            <p style={{ color: '#ffc107', margin: 0, textAlign: 'center' }}>
              ⚠️ Cet organisateur n'a pas encore complété son profil professionnel.
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}

export default OrganizerDetailsModal;

