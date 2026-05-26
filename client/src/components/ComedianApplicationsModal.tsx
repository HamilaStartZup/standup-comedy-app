import { type CSSProperties, useState, useEffect } from 'react';
import Modal from './Modal';
import api from '../services/api';

interface ComedianApplicationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  comedian: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
}

interface Application {
  _id: string;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED' | 'WITHDRAWN' | 'CANCELLED_BY_PLATFORM';
  message?: string;
  organizerMessage?: string;
  createdAt: string;
  event: {
    _id: string;
    title: string;
    date: string;
    location: {
      city: string;
      address: string;
      venue?: string;
    };
    organizer: {
      firstName: string;
      lastName: string;
      email: string;
    };
  };
  performanceDetails?: {
    duration: number;
    description: string;
  };
}

function ComedianApplicationsModal({ isOpen, onClose, comedian }: ComedianApplicationsModalProps) {
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    if (isOpen && comedian?.id) {
      fetchApplications();
    }
  }, [isOpen, comedian?.id]);

  const fetchApplications = async () => {
    if (!comedian?.id) return;
    
    setLoading(true);
    try {
      console.log('🔍 Récupération des candidatures pour:', comedian.firstName, comedian.lastName);
      
      const response = await api.get('/applications');
      
      const allApplications = Array.isArray(response.data) ? response.data : (Array.isArray((response.data as any)?.applications) ? (response.data as any).applications : []);
      console.log('📊 Toutes les applications:', allApplications);
      
      // Filtrer pour ce humoriste spécifique
      const comedianApplications = allApplications.filter((app: any) => {
        const appComedianId = app.comedian?._id || app.comedian;
        return appComedianId === comedian.id;
      });
      
      console.log('📊 Applications du humoriste:', comedianApplications);
      setApplications(comedianApplications);
    } catch (error) {
      console.error('❌ Erreur lors de la récupération des candidatures:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'ACCEPTED': return 'Acceptée';
      case 'REJECTED': return 'Refusée';
      case 'PENDING': return 'En attente';
      case 'EXPIRED': return 'Expirée';
      case 'WITHDRAWN': return 'Retirée';
      case 'CANCELLED_BY_PLATFORM': return 'Annulée par la plateforme';
      default: return status;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACCEPTED': return '#28a745';
      case 'REJECTED': return '#dc3545';
      case 'PENDING': return '#ffc107';
      case 'EXPIRED': return '#6c757d';
      case 'WITHDRAWN': return '#6c757d';
      case 'CANCELLED_BY_PLATFORM': return '#6c757d';
      default: return '#6c757d';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'ACCEPTED': return '✅';
      case 'REJECTED': return '❌';
      case 'PENDING': return '⏳';
      case 'EXPIRED': return '⏰';
      case 'WITHDRAWN': return '↩';
      case 'CANCELLED_BY_PLATFORM': return '🚫';
      default: return '❓';
    }
  };

  const filteredApplications = applications.filter(app => {
    if (filter === 'all') return true;
    return app.status === filter;
  });

  const stats = {
    total: applications.length,
    accepted: applications.filter(app => app.status === 'ACCEPTED').length,
    rejected: applications.filter(app => app.status === 'REJECTED').length,
    pending: applications.filter(app => app.status === 'PENDING').length,
    expired: applications.filter(app => app.status === 'EXPIRED').length,
  };

  // Styles
  const headerStyle: CSSProperties = {
    textAlign: 'center',
    marginBottom: '20px',
    paddingBottom: '15px',
    borderBottom: '2px solid #ff416c'
  };

  const statsContainerStyle: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(5, 1fr)',
    gap: '10px',
    marginBottom: '20px'
  };

  const statCardStyle: CSSProperties = {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    padding: '10px',
    borderRadius: '8px',
    textAlign: 'center'
  };

  const filterContainerStyle: CSSProperties = {
    display: 'flex',
    gap: '10px',
    marginBottom: '20px',
    justifyContent: 'center',
    flexWrap: 'wrap'
  };

  const filterButtonStyle = (isActive: boolean): CSSProperties => ({
    padding: '8px 16px',
    borderRadius: '20px',
    border: 'none',
    backgroundColor: isActive ? '#ff416c' : 'rgba(255, 255, 255, 0.2)',
    color: '#ffffff',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 'bold'
  });

  const applicationCardStyle: CSSProperties = {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: '8px',
    padding: '15px',
    marginBottom: '15px',
    border: '1px solid rgba(255, 255, 255, 0.1)'
  };

  const emptyStateStyle: CSSProperties = {
    textAlign: 'center',
    padding: '40px 20px',
    color: '#aaa'
  };

  if (!comedian) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Candidatures de l'humoriste">
      <div>
        {/* En-tête */}
        <div style={headerStyle}>
          <h2 style={{ fontSize: '1.8em', color: '#ff4b2b', margin: '0 0 10px 0' }}>
            {comedian.firstName} {comedian.lastName}
          </h2>
          <p style={{ color: '#aaa', margin: 0 }}>{comedian.email}</p>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#aaa' }}>
            Chargement des candidatures...
          </div>
        ) : (
          <>
            {/* Statistiques */}
            <div style={statsContainerStyle}>
              <div style={statCardStyle}>
                <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#ffffff' }}>{stats.total}</div>
                <div style={{ fontSize: '12px', color: '#aaa' }}>Total</div>
              </div>
              <div style={statCardStyle}>
                <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#28a745' }}>{stats.accepted}</div>
                <div style={{ fontSize: '12px', color: '#aaa' }}>Acceptées</div>
              </div>
              <div style={statCardStyle}>
                <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#dc3545' }}>{stats.rejected}</div>
                <div style={{ fontSize: '12px', color: '#aaa' }}>Refusées</div>
              </div>
              <div style={statCardStyle}>
                <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#ffc107' }}>{stats.pending}</div>
                <div style={{ fontSize: '12px', color: '#aaa' }}>En attente</div>
              </div>
              <div style={statCardStyle}>
                <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#6c757d' }}>{stats.expired}</div>
                <div style={{ fontSize: '12px', color: '#aaa' }}>Expirées</div>
              </div>
            </div>

            {/* Filtres */}
            <div style={filterContainerStyle}>
              <button 
                style={filterButtonStyle(filter === 'all')}
                onClick={() => setFilter('all')}
              >
                Toutes ({stats.total})
              </button>
              <button 
                style={filterButtonStyle(filter === 'ACCEPTED')}
                onClick={() => setFilter('ACCEPTED')}
              >
                ✅ Acceptées ({stats.accepted})
              </button>
              <button 
                style={filterButtonStyle(filter === 'REJECTED')}
                onClick={() => setFilter('REJECTED')}
              >
                ❌ Refusées ({stats.rejected})
              </button>
              <button
                style={filterButtonStyle(filter === 'PENDING')}
                onClick={() => setFilter('PENDING')}
              >
                ⏳ En attente ({stats.pending})
              </button>
              <button
                style={filterButtonStyle(filter === 'EXPIRED')}
                onClick={() => setFilter('EXPIRED')}
              >
                ⏰ Expirées ({stats.expired})
              </button>
            </div>

            {/* Liste des candidatures */}
            <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
              {filteredApplications.length > 0 ? (
                filteredApplications.map((app) => (
                  <div key={app._id} style={applicationCardStyle}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                      <h4 style={{ margin: 0, color: '#ff4b2b', fontSize: '16px' }}>
                        {app.event.title}
                      </h4>
                      <span style={{
                        padding: '4px 12px',
                        borderRadius: '15px',
                        backgroundColor: getStatusColor(app.status),
                        color: '#ffffff',
                        fontSize: '12px',
                        fontWeight: 'bold'
                      }}>
                        {getStatusIcon(app.status)} {getStatusLabel(app.status)}
                      </span>
                    </div>
                    
                    <div style={{ fontSize: '14px', color: '#ccc', marginBottom: '8px' }}>
                      📅 {new Date(app.event.date).toLocaleDateString('fr-FR')} • 
                      📍 {app.event.location.city}
                    </div>
                    
                    <div style={{ fontSize: '14px', color: '#ccc', marginBottom: '8px' }}>
                      👤 Organisateur: {app.event.organizer.firstName} {app.event.organizer.lastName}
                    </div>

                    {app.performanceDetails && (
                      <div style={{ fontSize: '13px', color: '#aaa', marginBottom: '8px' }}>
                        ⏱️ Durée proposée: {app.performanceDetails.duration}min
                      </div>
                    )}

                    {app.message && (
                      <div style={{ 
                        backgroundColor: 'rgba(255, 255, 255, 0.05)', 
                        padding: '8px', 
                        borderRadius: '4px',
                        marginTop: '8px',
                        fontSize: '13px',
                        color: '#ddd'
                      }}>
                        💬 Message: {app.message}
                      </div>
                    )}

                    {app.organizerMessage && (
                      <div style={{ 
                        backgroundColor: 'rgba(255, 107, 46, 0.1)', 
                        padding: '8px', 
                        borderRadius: '4px',
                        marginTop: '8px',
                        fontSize: '13px',
                        color: '#ff6b2e'
                      }}>
                        📝 Réponse organisateur: {app.organizerMessage}
                      </div>
                    )}

                    <div style={{ fontSize: '11px', color: '#888', marginTop: '8px' }}>
                      Candidature envoyée le {new Date(app.createdAt).toLocaleDateString('fr-FR')}
                    </div>
                  </div>
                ))
              ) : (
                <div style={emptyStateStyle}>
                  <div style={{ fontSize: '48px', marginBottom: '15px' }}>📋</div>
                  <h3 style={{ color: '#ffffff', margin: '0 0 10px 0' }}>
                    {filter === 'all' ? 'Aucune candidature' : `Aucune candidature ${getStatusLabel(filter).toLowerCase()}`}
                  </h3>
                  <p style={{ color: '#aaa', margin: 0 }}>
                    {filter === 'all' 
                      ? 'Cet humoriste n\'a encore envoyé aucune candidature.'
                      : 'Aucune candidature ne correspond à ce filtre.'
                    }
                  </p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

export default ComedianApplicationsModal; 