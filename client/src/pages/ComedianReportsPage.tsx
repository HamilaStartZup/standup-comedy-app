import { type CSSProperties, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Navbar from '../components/Navbar';
import { useAuth } from '../hooks/useAuth';
import { useAlert } from '../hooks/useAlert';
import { useNavigate } from 'react-router-dom';
import api, { updateComedianReport } from '../services/api';
import { getErrorMessage, ErrorMessages, SuccessMessages } from '../services/systemMessages';

interface ComedianReport {
  _id: string;
  comedian: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
    role: string;
  };
  reporter: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
    role: string;
  };
  reason: 'troll' | 'fake_account' | 'inappropriate_content' | 'spam' | 'other';
  description?: string;
  status: 'pending' | 'validated' | 'rejected';
  reviewedBy?: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  reviewedAt?: string;
  createdAt: string;
  updatedAt: string;
}

const ComedianReportsPage = () => {
  const { user } = useAuth();
  const { showSuccess, showError } = useAlert();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedReport, setSelectedReport] = useState<ComedianReport | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newStatus, setNewStatus] = useState<string>('');

  const isSuperAdmin = (user as any)?.role === 'SUPER_ADMIN';

  // Récupérer les signalements avec React Query
  const { data: reportsData, isLoading, error, refetch } = useQuery({
    queryKey: ['comedian-reports', statusFilter],
    queryFn: async () => {
      const query = statusFilter !== 'all' ? `?status=${statusFilter}` : '';
      const response = await api.get(`/comedian-reports${query}`);
      return response.data;
    },
    enabled: !!user && isSuperAdmin,
  });

  const reports: ComedianReport[] = reportsData?.reports || [];
  const reportsCount = reportsData?.count || 0;

  const reasonLabels: Record<string, string> = {
    troll: 'Troll / Comportement inapproprié',
    fake_account: 'Faux compte',
    inappropriate_content: 'Contenu inapproprié',
    spam: 'Spam / Publicité non autorisée',
    other: 'Autre'
  };

  const statusLabels: Record<string, string> = {
    pending: 'En attente',
    validated: 'Demande de signalement validé',
    rejected: 'Demande de signalement rejeté'
  };

  const statusColors: Record<string, string> = {
    pending: '#ffc107',
    validated: '#28a745',
    rejected: '#dc3545'
  };

  const handleOpenModal = (report: ComedianReport) => {
    setSelectedReport(report);
    setNewStatus(report.status);
    setIsModalOpen(true);
  };

  const handleUpdateReport = async () => {
    if (!selectedReport) return;

    try {
      await updateComedianReport(selectedReport._id, newStatus);
      showSuccess(SuccessMessages.REPORT_UPDATED);
      setIsModalOpen(false);
      setSelectedReport(null);
      await refetch();
      queryClient.invalidateQueries({ queryKey: ['comedian-reports'] });
    } catch (error: any) {
      console.error('Erreur lors de la mise à jour:', error.response?.status);
      showError(getErrorMessage(error, ErrorMessages.REPORT_UPDATE_FAILED));
    }
  };

  // Styles
  const mainContainerStyle: CSSProperties = {
    minHeight: '100vh',
    color: '#ffffff',
    padding: '20px',
    background: 'linear-gradient(to bottom right, #1a1a2e, #331f41)',
  };

  const pageHeaderStyle: CSSProperties = {
    maxWidth: '1200px',
    margin: '0 auto 30px auto',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '20px',
  };

  const titleStyle: CSSProperties = {
    fontSize: '2.5em',
    color: '#ff416c',
    margin: 0,
  };

  const contentStyle: CSSProperties = {
    maxWidth: '1200px',
    margin: '0 auto',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: '8px',
    padding: '20px',
    boxShadow: '0 4px 8px rgba(0, 0, 0, 0.3)',
  };

  const filterStyle: CSSProperties = {
    display: 'flex',
    gap: '10px',
    marginBottom: '20px',
    flexWrap: 'wrap',
    alignItems: 'center',
  };

  const reportCardStyle: CSSProperties = {
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    borderRadius: '12px',
    padding: '20px',
    marginBottom: '15px',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    cursor: 'pointer',
    transition: 'transform 0.2s ease, box-shadow 0.2s ease',
  };

  const emptyStateStyle: CSSProperties = {
    textAlign: 'center',
    color: '#aaa',
    fontSize: '1.2em',
    padding: '40px',
  };

  if (!isSuperAdmin) {
    return (
      <div style={mainContainerStyle}>
        <Navbar />
        <div style={contentStyle}>
          <p style={{ color: '#dc3545', fontSize: '1.2em' }}>
            Accès refusé. Seuls les super-admins peuvent accéder à cette page.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={mainContainerStyle}>
      <Navbar />
      <div style={{ marginTop: '80px' }}>
        <div style={pageHeaderStyle}>
          <div>
            <h1 style={titleStyle}>Signalements d'Humoristes</h1>
            <p style={{ color: '#aaa', fontSize: '1.1em' }}>
              Gérer les signalements effectués par les organisateurs
            </p>
          </div>
        </div>

        <div style={contentStyle}>
          <div style={filterStyle}>
            <label style={{ color: '#fff', fontWeight: 'bold' }}>Filtrer par statut:</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid #555',
                background: '#222',
                color: '#fff',
                fontSize: '14px'
              }}
            >
              <option value="all">Tous</option>
              <option value="pending">En attente</option>
              <option value="validated">Demande de signalement validé</option>
              <option value="rejected">Demande de signalement rejeté</option>
            </select>
            <span style={{ color: '#aaa', marginLeft: 'auto' }}>
              {reportsCount} signalement(s)
            </span>
          </div>

          {isLoading && (
            <p style={{ textAlign: 'center', color: '#aaa' }}>Chargement des signalements...</p>
          )}

          {error && (
            <p style={{ textAlign: 'center', color: '#dc3545' }}>
              Erreur: {(error as any).response?.data?.message || (error as any).message}
            </p>
          )}

          {!isLoading && !error && reportsCount === 0 && (
            <div style={emptyStateStyle}>
              <p>✅ Aucun signalement {statusFilter !== 'all' ? `avec le statut "${statusLabels[statusFilter]}"` : ''}</p>
            </div>
          )}

          {!isLoading && !error && reportsCount > 0 && (
            <>
              {reports.map((report) => (
                <div
                  key={report._id}
                  style={reportCardStyle}
                  onClick={() => handleOpenModal(report)}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 6px 15px rgba(0, 0, 0, 0.6)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '15px' }}>
                    <div style={{ flex: 1, minWidth: '250px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                        <h3 style={{ color: '#ff4b2b', margin: 0, fontSize: '1.2em' }}>
                          {report.comedian.firstName} {report.comedian.lastName}
                        </h3>
                        <span
                          style={{
                            padding: '4px 12px',
                            borderRadius: '999px',
                            fontSize: '0.85em',
                            fontWeight: 'bold',
                            backgroundColor: `${statusColors[report.status]}33`,
                            color: statusColors[report.status],
                            border: `1px solid ${statusColors[report.status]}66`
                          }}
                        >
                          {statusLabels[report.status]}
                        </span>
                      </div>
                      <p style={{ color: '#aaa', fontSize: '0.9em', margin: '5px 0' }}>
                        Signalé par: {report.reporter.firstName} {report.reporter.lastName}
                      </p>
                      <p style={{ color: '#ccc', margin: '5px 0' }}>
                        <strong>Raison:</strong> {reasonLabels[report.reason]}
                      </p>
                      {report.description && (
                        <p style={{ color: '#aaa', fontSize: '0.9em', marginTop: '10px', fontStyle: 'italic' }}>
                          "{report.description}"
                        </p>
                      )}
                    </div>
                    <div style={{ textAlign: 'right', color: '#aaa', fontSize: '0.85em' }}>
                      <div>Créé le {new Date(report.createdAt).toLocaleDateString('fr-FR')}</div>
                      {report.reviewedAt && (
                        <div style={{ marginTop: '5px' }}>
                          Examiné le {new Date(report.reviewedAt).toLocaleDateString('fr-FR')}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      {/* Modal de gestion du signalement */}
      {isModalOpen && selectedReport && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            background: 'rgba(0, 0, 0, 0.7)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}
          onClick={() => setIsModalOpen(false)}
        >
          <div
            style={{
              background: '#1a1a2e',
              padding: '30px',
              borderRadius: '12px',
              maxWidth: '600px',
              width: '100%',
              maxHeight: '90vh',
              overflow: 'auto',
              border: '1px solid rgba(255, 255, 255, 0.1)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ color: '#ff4b2b', marginBottom: '20px' }}>Gérer le signalement</h2>

            <div style={{ marginBottom: '20px' }}>
              <p style={{ color: '#fff', marginBottom: '5px' }}>
                <strong>Humoriste:</strong> {selectedReport.comedian.firstName} {selectedReport.comedian.lastName}
              </p>
              <p style={{ color: '#aaa', fontSize: '0.9em', marginBottom: '5px' }}>
                {selectedReport.comedian.email}
              </p>
              <p style={{ color: '#fff', marginBottom: '5px' }}>
                <strong>Signalé par:</strong> {selectedReport.reporter.firstName} {selectedReport.reporter.lastName}
              </p>
              <p style={{ color: '#fff', marginBottom: '5px' }}>
                <strong>Raison:</strong> {reasonLabels[selectedReport.reason]}
              </p>
              {selectedReport.description && (
                <div style={{ marginTop: '10px', padding: '10px', background: 'rgba(0, 0, 0, 0.3)', borderRadius: '6px' }}>
                  <p style={{ color: '#aaa', fontSize: '0.9em', margin: 0 }}>
                    <strong>Description:</strong> {selectedReport.description}
                  </p>
                </div>
              )}
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', color: '#fff', marginBottom: '10px', fontWeight: 'bold' }}>
                Statut *
              </label>
              <select
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px',
                  borderRadius: '6px',
                  border: '1px solid #555',
                  background: '#222',
                  color: '#fff',
                  fontSize: '14px'
                }}
              >
                {Object.entries(statusLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setIsModalOpen(false)}
                style={{
                  padding: '10px 20px',
                  borderRadius: '6px',
                  border: '1px solid #555',
                  background: '#333',
                  color: '#fff',
                  fontWeight: 'bold',
                  cursor: 'pointer'
                }}
              >
                Annuler
              </button>
              <button
                onClick={handleUpdateReport}
                style={{
                  padding: '10px 20px',
                  borderRadius: '6px',
                  border: 'none',
                  background: 'linear-gradient(to right, #28a745, #218838)',
                  color: 'white',
                  fontWeight: 'bold',
                  cursor: 'pointer'
                }}
              >
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ComedianReportsPage;

