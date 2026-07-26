import { type CSSProperties } from 'react';
import Modal from './Modal';
import StatusBadge from './StatusBadge';
import type { IApplication } from '../pages/ApplicationsPage';

interface ApplicationDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  application: IApplication | null;
}

function ApplicationDetailsModal({ isOpen, onClose, application }: ApplicationDetailsModalProps) {
  if (!application) return null; // Ne rien afficher si aucune application n'est fournie

  const cardDetailStyle: CSSProperties = {
    fontSize: '0.9em',
    color: 'var(--ccc-text-muted)',
    marginBottom: '5px',
  };

  const sectionTitleStyle: CSSProperties = {
    fontSize: '1.2em',
    color: 'var(--ccc-accent)',
    marginTop: '15px',
    marginBottom: '10px',
    borderBottom: '1px solid var(--ccc-border-subtle)',
    paddingBottom: '5px',
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Détails de la Candidature">
      <h2 style={{ fontSize: '1.8em', color: '#ff4b2b', marginBottom: '15px' }}>{application.event.title}</h2>
      
      <h3 style={sectionTitleStyle}>Informations Générales</h3>
      <p style={cardDetailStyle}>Statut: <StatusBadge status={application.status} style={{ marginTop: '10px' }} /></p>
      <p style={cardDetailStyle}>Date de l'évènement: {new Date(application.event.date).toLocaleDateString()}</p>
      {application.event.startTime && (
        <p style={cardDetailStyle}>Heure de l'évènement: {application.event.startTime}</p>
      )}
      {application.event.endTime && (
        <p style={cardDetailStyle}>Heure de fin: {application.event.endTime}</p>
      )}
      {application.event.location && <p style={cardDetailStyle}>Lieu: {application.event.location.address}, {application.event.location.city}</p>}
      {application.event.requirements?.duration && (
        <p style={cardDetailStyle}>Durée de l'évènement: {application.event.requirements.duration} min</p>
      )}
      {application.performanceDetails?.duration && <p style={cardDetailStyle}>Durée de prestation proposée: {application.performanceDetails.duration} min</p>}

      {/* Section Organisateur */}
      {application.event.organizer && (
        <>
          <h3 style={sectionTitleStyle}>Informations de l'Organisateur</h3>
          <p style={cardDetailStyle}>Nom: {application.event.organizer.firstName} {application.event.organizer.lastName}</p>
          <p style={cardDetailStyle}>Email: {application.event.organizer.email}</p>
        </>
      )}

      {application.performanceDetails && (
        <>
          <h3 style={sectionTitleStyle}>Détails de la Performance</h3>
          <p style={cardDetailStyle}>Description: {application.performanceDetails.description}</p>
          {application.performanceDetails.videoLink && (
            <p style={cardDetailStyle}>Lien vidéo: <a href={application.performanceDetails.videoLink} target="_blank" rel="noopener noreferrer" style={{ color: '#ff4b2b' }}>Voir la vidéo</a></p>
          )}
        </>
      )}
      
      {application.message && (
        <>
          <h3 style={sectionTitleStyle}>Message de l'Humoriste</h3>
          <p style={cardDetailStyle}>{application.message}</p>
        </>
      )}

      {application.organizerMessage && (
        <>
          <h3 style={sectionTitleStyle}>Message de l'Organisateur</h3>
          <p style={cardDetailStyle}>{application.organizerMessage}</p>
        </>
      )}
    </Modal>
  );
}

export default ApplicationDetailsModal; 