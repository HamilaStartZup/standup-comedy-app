import React, { type CSSProperties } from 'react';
import Modal from './Modal';
import { IEvent } from '../types/event';
import { getOrganizerName, translateEventStatus } from '../utils/eventHelpers';
import { theme } from '../styles/theme';

const fieldLabelStyle: CSSProperties = {
  fontSize: '0.8em',
  color: theme.colors.text.muted,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  fontWeight: 600,
  marginBottom: '6px',
};

const fieldValueStyle: CSSProperties = {
  color: '#0f172a',
  fontSize: '1em',
  fontWeight: 600,
};

const sectionHeadingStyle: CSSProperties = {
  fontSize: '1.1em',
  color: theme.colors.semantic.success,
  marginBottom: '12px',
  marginTop: 0,
};

interface EventDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  event: IEvent | null;
  user?: any; // Any type to accommodate different user objects
  eventAbsences?: Array<{
    comedian: { _id: string };
    event: string;
    reason?: string;
    markedAt: string;
  }>;
  onAbsenceClick?: (participant: any, event: IEvent) => void;
  onComedianClick?: (participant: any) => void;
  participantsSectionRef?: React.RefObject<HTMLDivElement | null>;
}

const EventDetailModal: React.FC<EventDetailModalProps> = ({
  isOpen,
  onClose,
  event: selectedEvent,
  user,
  eventAbsences = [],
  onAbsenceClick,
  onComedianClick,
  participantsSectionRef,
}) => {
  /**
   * Vérifie si un humoriste est marqué absent
   */
  const isParticipantAbsent = (comedianId: string): boolean => {
    return eventAbsences.some((absence) => absence.comedian._id === comedianId);
  };

  if (!selectedEvent) return null;

  const scrollbarStyles = `
    .event-detail-content::-webkit-scrollbar {
      width: 6px;
    }
    .event-detail-content::-webkit-scrollbar-track {
      background: rgba(15, 23, 42, 0.05);
      border-radius: 3px;
    }
    .event-detail-content::-webkit-scrollbar-thumb {
      background: linear-gradient(180deg, #7c3aed, #a78bfa);
      border-radius: 3px;
    }
    .event-detail-content::-webkit-scrollbar-thumb:hover {
      background: linear-gradient(180deg, #a78bfa, #7c3aed);
    }
  `;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Détails de l'évènement">
      <style>{scrollbarStyles}</style>
      <div
        className="event-detail-content"
        style={{
          fontSize: '0.95em',
          maxHeight: '70vh',
          overflowY: 'auto',
          paddingRight: '8px'
        }}
      >
        {/* Titre principal */}
        <h2 style={{ fontSize: '1.6em', color: theme.colors.accent.primary, marginBottom: '20px', marginTop: 0, fontWeight: 700 }}>
          {selectedEvent.title}
        </h2>

        {/* Section Info Principale - Layout grille 2 colonnes */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px', marginBottom: '24px' }}>
          <div>
            <div style={fieldLabelStyle}>Date</div>
            <div style={fieldValueStyle}>
              {new Date(selectedEvent.date).toLocaleDateString('fr-FR', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </div>
          </div>
          <div>
            <div style={fieldLabelStyle}>Horaires</div>
            <div style={fieldValueStyle}>
              {selectedEvent.startTime || '—'} {selectedEvent.startTime && selectedEvent.endTime ? '→' : ''}{' '}
              {selectedEvent.endTime || '—'}
            </div>
          </div>
          <div>
            <div style={fieldLabelStyle}>Lieu</div>
            <div style={fieldValueStyle}>
              {(() => {
                const location = selectedEvent.location;
                if (typeof location === 'object' && location !== null) {
                  const venue = location.venue || '';
                  const address = location.address || '';
                  const city = location.city || '';
                  const postalCode = location.postalCode || '';
                  const parts = [venue, address, [postalCode, city].filter(Boolean).join(' ')].filter(Boolean);
                  return parts.length ? parts.join(', ') : '—';
                }
                return '—';
              })()}
            </div>
          </div>
          <div>
            <div style={fieldLabelStyle}>Statut</div>
            <div style={{ ...fieldValueStyle, color: theme.colors.accent.primary }}>
              {translateEventStatus(selectedEvent.status)}
            </div>
          </div>
          <div>
            <div style={fieldLabelStyle}>Tarif</div>
            <div style={fieldValueStyle}>
              1€ la place
            </div>
          </div>
        </div>

        {/* Description */}
        {selectedEvent.description && (
          <div
            style={{
              marginBottom: '20px',
              padding: '12px',
              backgroundColor: theme.colors.bg.surface,
              borderRadius: theme.radius.sm,
              borderLeft: `3px solid ${theme.colors.accent.primary}`,
            }}
          >
            <div style={fieldLabelStyle}>Description</div>
            <div style={{ color: '#0f172a', fontSize: '0.95em', lineHeight: 1.5 }}>
              {selectedEvent.description}
            </div>
          </div>
        )}

        {/* Organisateur & Email (masqué pour les spectateurs) */}
        {user?.role !== 'SPECTATOR' && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '16px',
              marginBottom: '24px',
              paddingBottom: '24px',
              borderBottom: `1px solid ${theme.colors.border.subtle}`,
            }}
          >
            <div>
              <div style={fieldLabelStyle}>Organisateur</div>
              <div style={fieldValueStyle}>
                {getOrganizerName(selectedEvent.organizer)}
              </div>
            </div>
            <div>
              <div style={fieldLabelStyle}>Email</div>
              <div style={{ ...fieldValueStyle, fontSize: '0.95em', fontWeight: 500 }}>
                {selectedEvent.organizer?.email || '—'}
              </div>
            </div>
          </div>
        )}

        {/* Raison annulation si applicable */}
        {selectedEvent.status?.toLowerCase() === 'cancelled' && selectedEvent.cancellationReason && (
          <div
            style={{
              marginBottom: '20px',
              padding: '12px',
              backgroundColor: 'rgba(220, 53, 69, 0.15)',
              borderRadius: '8px',
              borderLeft: '3px solid #dc3545',
            }}
          >
            <div style={{ fontSize: '0.8em', color: '#ffc107', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600, marginBottom: '6px' }}>
              ⚠️ Raison d'annulation
            </div>
            <div style={{ color: '#0f172a', fontSize: '0.95em' }}>
              {selectedEvent.cancellationReason}
            </div>
          </div>
        )}

        {/* Exigences */}
        <div style={{ marginBottom: '24px' }}>
          <h3 style={sectionHeadingStyle}>Exigences</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
            <div>
              <div style={{ ...fieldLabelStyle, marginBottom: '4px' }}>Expérience Min.</div>
              <div style={fieldValueStyle}>
                {selectedEvent.requirements?.minExperience ?? '—'} ans
              </div>
            </div>
            <div>
              <div style={{ ...fieldLabelStyle, marginBottom: '4px' }}>Max Humoristes</div>
              <div style={fieldValueStyle}>
                {selectedEvent.requirements?.maxPerformers ?? '—'}
              </div>
            </div>
            <div>
              <div style={{ ...fieldLabelStyle, marginBottom: '4px' }}>Durée</div>
              <div style={fieldValueStyle}>
                {selectedEvent.requirements?.duration ?? '—'} min
              </div>
            </div>
            <div>
              <div style={{ ...fieldLabelStyle, marginBottom: '4px' }}>Niveau</div>
              <div style={fieldValueStyle}>
                {(() => {
                  const level = selectedEvent.requirements?.requiredExperienceLevel;
                  if (!level || level === 'all') return 'Tous niveaux';
                  if (level === '0-50') return 'Débutant';
                  if (level === '50-200') return 'Expérimenté';
                  if (level === '200+') return 'Pro';
                  return '—';
                })()}
              </div>
            </div>
          </div>
        </div>

        {/* Participants */}
        {user?.role === 'ORGANIZER' || user?.role === 'SUPER_ADMIN' ? (
          <div ref={participantsSectionRef}>
            <h3 style={{ ...sectionHeadingStyle, marginTop: '24px' }}>
              Participants ({selectedEvent.participants?.length || 0}/
              {selectedEvent.requirements?.maxPerformers ?? 0})
            </h3>

            {selectedEvent.participants && selectedEvent.participants.length > 0 ? (
              <div>
                {selectedEvent.participants.map((participant: any, index: number) => {
                  const isAbsent = isParticipantAbsent(participant._id);
                  const absence = eventAbsences.find((absence) => absence.comedian._id === participant._id);

                  return (
                    <div
                      key={index}
                      style={{
                        marginBottom: '12px',
                        padding: '10px',
                        backgroundColor: isAbsent ? theme.colors.card.cancelled.bg : theme.colors.bg.surface,
                        borderRadius: theme.radius.sm,
                        border: isAbsent ? `1px solid ${theme.colors.card.cancelled.border}` : `1px solid ${theme.colors.border.subtle}`,
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          marginBottom: isAbsent && absence?.reason ? '8px' : '0',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                          {isAbsent && (
                            <span
                              style={{
                                color: '#dc3545',
                                marginRight: '8px',
                                fontSize: '16px',
                                fontWeight: 'bold',
                              }}
                            >
                              🚫
                            </span>
                          )}
                          <span
                            style={{
                              color: theme.colors.accent.primary,
                              cursor: 'pointer',
                              textDecoration: 'underline',
                              fontWeight: 'bold',
                            }}
                            onClick={() => onComedianClick?.(participant)}
                          >
                            {participant.firstName} {participant.lastName}
                          </span>
                          {isAbsent && (
                            <span
                              style={{
                                marginLeft: '10px',
                                color: '#dc3545',
                                fontSize: '12px',
                                fontStyle: 'italic',
                              }}
                            >
                              (Absent)
                            </span>
                          )}
                        </div>

                        {user?.role === 'ORGANIZER' && (
                          <button
                            style={{
                              padding: '6px 12px',
                              borderRadius: '6px',
                              border: 'none',
                              backgroundColor: isAbsent ? '#28a745' : '#dc3545',
                              color: '#ffffff',
                              fontSize: '12px',
                              fontWeight: 'bold',
                              cursor: 'pointer',
                              transition: 'all 0.3s ease',
                              marginLeft: '10px',
                            }}
                            onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                              e.stopPropagation();
                              onAbsenceClick?.(participant, selectedEvent);
                            }}
                            onMouseEnter={(e: React.MouseEvent<HTMLButtonElement>) => {
                              e.currentTarget.style.opacity = '0.8';
                            }}
                            onMouseLeave={(e: React.MouseEvent<HTMLButtonElement>) => {
                              e.currentTarget.style.opacity = '1';
                            }}
                          >
                            {isAbsent ? '✅ Marquer présent' : '🚫 Marquer absent'}
                          </button>
                        )}
                      </div>

                      {/* Message d'absence */}
                      {isAbsent && absence?.reason && (
                        <div
                          style={{
                            marginTop: '8px',
                            padding: '8px',
                            backgroundColor: theme.colors.bg.surface,
                            borderRadius: theme.radius.sm,
                            border: `1px solid ${theme.colors.border.subtle}`,
                            borderLeft: '3px solid #dc3545',
                          }}
                        >
                          <div style={{ fontSize: '0.8em', color: '#ffc107', marginBottom: '2px', fontWeight: 'bold' }}>
                            💬 Raison de l'absence:
                          </div>
                          <div style={{ fontSize: '0.8em', color: '#0f172a', fontStyle: 'italic' }}>
                            "{absence.reason}"
                          </div>
                          <div style={{ fontSize: '0.7em', color: theme.colors.text.muted, marginTop: '4px' }}>
                            Marqué le {new Date(absence.markedAt).toLocaleDateString('fr-FR')}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p style={{ color: theme.colors.text.muted }}>Aucun participant pour l'instant.</p>
            )}
          </div>
        ) : (
          <h3 style={{ ...sectionHeadingStyle, marginTop: '24px' }}>
            Participants confirmés ({selectedEvent.participants?.length || 0}/
            {selectedEvent.requirements?.maxPerformers ?? 0})
          </h3>
        )}

        {/* Bouton Fermer */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            marginTop: '28px',
            paddingTop: '24px',
            borderTop: `1px solid ${theme.colors.border.subtle}`,
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: '8px 24px',
              borderRadius: theme.radius.sm,
              border: 'none',
              background: theme.colors.accent.gradient,
              color: theme.colors.text.onAccent,
              fontWeight: 'bold',
              cursor: 'pointer',
              minWidth: '120px',
              minHeight: '44px',
              fontSize: '1em',
              transition: 'all 0.2s ease',
              WebkitTapHighlightColor: 'rgba(124, 58, 237,0.3)',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.85')}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
          >
            Fermer
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default EventDetailModal;
