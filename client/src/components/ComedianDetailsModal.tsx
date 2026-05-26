import { type CSSProperties, useState, useEffect } from 'react';
import Modal from './Modal';
import type { IUserData } from '../types/user';
import api from '../services/api';

interface ComedianDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  comedian: IUserData | null;
}

interface Absence {
  _id: string;
  event: {
    _id: string;
    title: string;
    date: string;
    location: string;
  };
  organizer: {
    _id: string;
    firstName: string;
    lastName: string;
  };
  reason?: string;
  markedAt: string;
}

function ComedianDetailsModal({ isOpen, onClose, comedian }: ComedianDetailsModalProps) {
  const [applicationStats, setApplicationStats] = useState<{
    total: number;
    accepted: number;
    rejected: number;
    pending: number;
  } | null>(null);
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingAbsences, setLoadingAbsences] = useState(false);

  // Stats fraîches récupérées côté API pour refléter la réalité au moment de l'ouverture
  type ComedianStats = {
    totalEvents?: number;
    absences?: number;
    [key: string]: any;
  };
  const [freshComedianStats, setFreshComedianStats] = useState<ComedianStats | null>(null);

  // Récupérer les vraies statistiques des candidatures ET les stats fraîches de l'humoriste
  useEffect(() => {
    if (isOpen && comedian?._id) {
      setLoading(true);
      const fetchData = async () => {
        try {
          // 1. Récupérer les stats fraîches de l'humoriste depuis l'API
          console.log('🔄 Récupération des stats fraîches pour:', comedian._id);
          const userResponse = await api.get(`/auth/users`);
          
          const userData = userResponse.data;
          const users = Array.isArray(userData) ? userData : (userData.users || []);
          const freshComedian = users.find((u: any) => u.id === comedian._id);
          
          if (freshComedian) {
            console.log('✅ Stats fraîches récupérées:', freshComedian.stats);
            setFreshComedianStats(freshComedian.stats);
          }
        } catch (error) {
          console.error('❌ Erreur lors de la récupération des stats fraîches:', error);
        }
        
        try {
          console.log('🔍 DEBUT DEBUG - Récupération des candidatures pour:', {
            comedianId: comedian._id,
            comedianName: `${comedian.firstName} ${comedian.lastName}`
          });

          // Pour un super admin, récupérer toutes les candidatures et filtrer côté client
          const response = await api.get('/applications');
          
          const allApplications = Array.isArray(response.data) ? response.data : (Array.isArray((response.data as any)?.applications) ? (response.data as any).applications : []);
          console.log('📊 Toutes les applications reçues:', allApplications);
          console.log('📊 Nombre total d\'applications:', allApplications.length);
          
          // Filtrer les candidatures pour ce humoriste spécifique
          const applications = allApplications.filter((app: any) => {
            const appComedianId = app.comedian?._id || app.comedian;
            console.log(`   Comparaison: ${appComedianId} === ${comedian._id} ?`, appComedianId === comedian._id);
            return appComedianId === comedian._id;
          });
          
          console.log('📊 Applications filtrées pour ce humoriste:', applications);
          console.log('📊 Nombre d\'applications pour ce humoriste:', applications.length);
          
          // Debug chaque application du humoriste
          applications.forEach((app: any, index: number) => {
            console.log(`   Application ${index + 1}:`, {
              id: app._id,
              status: app.status,
              comedianId: app.comedian?._id || app.comedian,
              eventTitle: app.event?.title
            });
          });
          
          const stats = {
            total: applications.length,
            accepted: applications.filter((app: any) => app.status === 'ACCEPTED').length,
            rejected: applications.filter((app: any) => app.status === 'REJECTED').length,
            pending: applications.filter((app: any) => app.status === 'PENDING').length
          };
          
          console.log('📈 Statistiques calculées:', stats);
          setApplicationStats(stats);
        } catch (error: any) {
          console.error('❌ Erreur lors de la récupération des statistiques:', error);
          console.error('❌ Détails de l\'erreur:', error.response?.data);
          setApplicationStats(null);
        } finally {
          setLoading(false);
        }
      };

      fetchData();
    }
  }, [isOpen, comedian?._id]);

  // Récupérer les absences du humoriste
  useEffect(() => {
    if (isOpen && comedian?._id) {
      setLoadingAbsences(true);
      const fetchAbsences = async () => {
        try {
          console.log('🔍 Récupération des absences pour:', {
            comedianId: comedian._id,
            comedianName: `${comedian.firstName} ${comedian.lastName}`
          });

          const response = await api.get(`/absences/comedian/${comedian._id}`);
          
          console.log('📊 Absences reçues:', response.data);
          setAbsences(response.data);
        } catch (error: any) {
          console.error('❌ Erreur lors de la récupération des absences:', error);
          console.error('❌ Détails de l\'erreur:', error.response?.data);
          setAbsences([]);
        } finally {
          setLoadingAbsences(false);
        }
      };

      fetchAbsences();
    }
  }, [isOpen, comedian?._id]);

  if (!comedian) return null;

  const sectionTitleStyle: CSSProperties = {
    fontSize: '1.3em',
    color: '#ff416c',
    marginTop: '20px',
    marginBottom: '15px',
    borderBottom: '2px solid #ff416c',
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
    backgroundColor: '#28a745',
    color: '#ffffff',
    fontSize: '0.9em',
    fontWeight: 'bold',
    marginTop: '5px'
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Profil Humoriste">
      <div>
        <h2 style={{ fontSize: '2em', color: '#ff4b2b', marginBottom: '10px', textAlign: 'center' }}>
          {comedian.firstName} {comedian.lastName}
        </h2>
        
        {/* Informations personnelles */}
        <h3 style={sectionTitleStyle}>📋 Informations personnelles</h3>
        
        <div style={infoRowStyle}>
          <span style={infoLabelStyle}>Nom complet:</span>
          <span style={infoValueStyle}>{comedian.firstName} {comedian.lastName}</span>
        </div>
        
        <div style={infoRowStyle}>
          <span style={infoLabelStyle}>Email:</span>
          <span style={infoValueStyle}>{comedian.email}</span>
        </div>
        
        {comedian.phone && (
          <div style={infoRowStyle}>
            <span style={infoLabelStyle}>Téléphone:</span>
            <span style={infoValueStyle}>{comedian.phone}</span>
          </div>
        )}
        
        <div style={infoRowStyle}>
          <span style={infoLabelStyle}>Statut:</span>
          <span style={badgeStyle}>Humoriste vérifié</span>
        </div>

        {/* Profil Humoriste */}
        {comedian.profile && (
          <>
            <h3 style={sectionTitleStyle}>🎭 Profil Humoriste</h3>
            
            {comedian.profile.bio && (
              <div style={infoRowStyle}>
                <span style={infoLabelStyle}>Biographie:</span>
                <span style={infoValueStyle}>{comedian.profile.bio}</span>
              </div>
            )}
            
            {comedian.profile.experience !== undefined && (
              <div style={infoRowStyle}>
                <span style={infoLabelStyle}>Expérience:</span>
                <span style={infoValueStyle}>
                  {comedian.profile.experience} {comedian.profile.experience === 1 ? 'an' : 'ans'} sur scène
                </span>
              </div>
            )}
            
            {comedian.profile.numberOfScenes && (
              <div style={infoRowStyle}>
                <span style={infoLabelStyle}>Niveau d'expérience:</span>
                <span style={infoValueStyle}>
                  {(() => {
                    const scenes = comedian.profile.numberOfScenes;
                    if (scenes === '0-50') return '0-50 scènes (Débutant)';
                    if (scenes === '50-200') return '50-200 scènes (Expérimenté)';
                    if (scenes === '200+') return '200+ scènes (Pro)';
                    return 'Non spécifié';
                  })()}
                </span>
              </div>
            )}
            
            {comedian.profile.comedyStyle && comedian.profile.comedyStyle.length > 0 && (
              <div style={infoRowStyle}>
                <span style={infoLabelStyle}>Style de comédie:</span>
                <span style={infoValueStyle}>
                  {comedian.profile.comedyStyle.map(style => {
                    const labels: Record<string, string> = {
                      'stand-up': 'Stand up (solo en interaction avec le public)',
                      'improvisation': 'Improvisation (création spontanée à partir d\'un contexte)',
                      'plateau': 'Plateau (plusieurs artistes se succèdent lors d\'une soirée)',
                      'sketch': 'Sketch (une scène courte pré écrite)'
                    };
                    return labels[style] || style;
                  }).join(', ')}
                </span>
              </div>
            )}
            
            {comedian.profile.performanceLanguages && comedian.profile.performanceLanguages.length > 0 && (
              <div style={infoRowStyle}>
                <span style={infoLabelStyle}>Langues:</span>
                <span style={infoValueStyle}>
                  {comedian.profile.performanceLanguages.map(lang => {
                    const labels: Record<string, string> = {
                      'francais': 'Français',
                      'arabe': 'Arabe',
                      'anglais': 'Anglais',
                      'italien': 'Italien',
                      'espagnol': 'Espagnol'
                    };
                    return labels[lang] || lang;
                  }).join(', ')}
                </span>
              </div>
            )}
            
            {/* Informations additionnelles si disponibles */}
            {comedian.phone && (
              <div style={infoRowStyle}>
                <span style={infoLabelStyle}>Téléphone (profil):</span>
                <span style={infoValueStyle}>{comedian.phone}</span>
              </div>
            )}
            
            {comedian.city && (
              <div style={infoRowStyle}>
                <span style={infoLabelStyle}>Ville:</span>
                <span style={infoValueStyle}>{comedian.city}</span>
              </div>
            )}
            
            {comedian.address && (
              <div style={infoRowStyle}>
                <span style={infoLabelStyle}>Adresse:</span>
                <span style={infoValueStyle}>{comedian.address}</span>
              </div>
            )}
            
            {/* Réseaux sociaux */}
            {(comedian.profile?.socialLinks?.youtube || comedian.profile?.socialLinks?.instagram || comedian.profile?.socialLinks?.facebook) && (
              <div style={{ marginTop: '15px', paddingTop: '15px', borderTop: '1px solid rgba(255, 255, 255, 0.1)' }}>
                <h4 style={{ color: '#ff416c', marginBottom: '10px', fontSize: '1em' }}>📱 Réseaux sociaux</h4>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                  {comedian.profile?.socialLinks?.youtube && (
                    <a 
                      href={comedian.profile.socialLinks.youtube} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      style={{ 
                        color: '#ff416c', 
                        textDecoration: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px',
                        padding: '5px 10px',
                        backgroundColor: 'rgba(255, 65, 108, 0.1)',
                        borderRadius: '5px'
                      }}
                    >
                      <span>📺</span> YouTube
                    </a>
                  )}
                  {comedian.profile?.socialLinks?.instagram && (
                    <a 
                      href={comedian.profile.socialLinks.instagram} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      style={{ 
                        color: '#ff416c', 
                        textDecoration: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px',
                        padding: '5px 10px',
                        backgroundColor: 'rgba(255, 65, 108, 0.1)',
                        borderRadius: '5px'
                      }}
                    >
                      <span>📷</span> Instagram
                    </a>
                  )}
                  {comedian.profile?.socialLinks?.facebook && (
                    <a 
                      href={comedian.profile.socialLinks.facebook} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      style={{ 
                        color: '#ff416c', 
                        textDecoration: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px',
                        padding: '5px 10px',
                        backgroundColor: 'rgba(255, 65, 108, 0.1)',
                        borderRadius: '5px'
                      }}
                    >
                      <span>👤</span> Facebook
                    </a>
                  )}
                </div>
              </div>
            )}
          </>
        )}
        
        {/* Statistiques du humoriste */}
        {comedian.stats && (
          <>
            <h3 style={sectionTitleStyle}>📊 Statistiques de performance</h3>
            
            {/* Section Candidatures */}
                         <div style={{ 
               backgroundColor: 'rgba(255, 255, 255, 0.05)', 
               padding: '15px', 
               borderRadius: '8px', 
               marginBottom: '15px',
               border: '1px solid rgba(255, 255, 255, 0.1)'
             }}>
               <h4 style={{ color: '#ff416c', marginBottom: '10px', fontSize: '1.1em' }}>🎯 Candidatures</h4>
               
               {loading && (
                 <div style={{ textAlign: 'center', color: '#aaa', padding: '10px' }}>
                   Chargement des statistiques...
                 </div>
               )}
               
               {!loading && applicationStats && (
                 <>
                   <div style={infoRowStyle}>
                     <span style={infoLabelStyle}>📤 Envoyées:</span>
                     <span style={infoValueStyle}>{applicationStats.total}</span>
                   </div>
                   
                   <div style={infoRowStyle}>
                     <span style={infoLabelStyle}>✅ Acceptées:</span>
                     <span style={{ ...infoValueStyle, color: '#28a745', fontWeight: 'bold' }}>
                       {applicationStats.accepted}
                     </span>
                   </div>
                   
                   <div style={infoRowStyle}>
                     <span style={infoLabelStyle}>❌ Refusées:</span>
                     <span style={{ ...infoValueStyle, color: '#dc3545', fontWeight: 'bold' }}>
                       {applicationStats.rejected}
                     </span>
                   </div>
                   
                   <div style={infoRowStyle}>
                     <span style={infoLabelStyle}>⏳ En attente:</span>
                     <span style={{ ...infoValueStyle, color: '#ffc107', fontWeight: 'bold' }}>
                       {applicationStats.pending}
                     </span>
                   </div>
                   
                   {/* Taux de réussite */}
                   {applicationStats.total > 0 && (
                     <div style={infoRowStyle}>
                       <span style={infoLabelStyle}>📈 Taux de réussite:</span>
                       <span style={{ ...infoValueStyle, color: '#17a2b8', fontWeight: 'bold' }}>
                         {Math.round((applicationStats.accepted / applicationStats.total) * 100)}%
                       </span>
                     </div>
                   )}
                 </>
               )}
               
               {!loading && !applicationStats && (
                 <div style={{ textAlign: 'center', color: '#ffc107', padding: '10px' }}>
                   ⚠️ Impossible de charger les statistiques des candidatures
                 </div>
               )}
               
               {/* Fallback avec les anciennes données si l'API échoue */}
               {!loading && !applicationStats && comedian.stats?.applicationsSent !== undefined && (
                 <>
                   <div style={infoRowStyle}>
                     <span style={infoLabelStyle}>📤 Envoyées (approx.):</span>
                     <span style={infoValueStyle}>{comedian.stats.applicationsSent}</span>
                   </div>
                   
                   {comedian.stats.applicationsAccepted !== undefined && (
                     <div style={infoRowStyle}>
                       <span style={infoLabelStyle}>✅ Acceptées (approx.):</span>
                       <span style={{ ...infoValueStyle, color: '#28a745', fontWeight: 'bold' }}>
                         {comedian.stats.applicationsAccepted}
                       </span>
                     </div>
                   )}
                 </>
               )}
             </div>
            
            {/* Section Évènements */}
            <div style={{ 
              backgroundColor: 'rgba(255, 255, 255, 0.05)', 
              padding: '15px', 
              borderRadius: '8px', 
              marginBottom: '15px',
              border: '1px solid rgba(255, 255, 255, 0.1)'
            }}>
              <h4 style={{ color: '#ff416c', marginBottom: '10px', fontSize: '1.1em' }}>🎭 Évènements</h4>
              
              {((freshComedianStats?.totalEvents !== undefined) || (comedian.stats.totalEvents !== undefined)) && (
                <div style={infoRowStyle}>
                  <span style={infoLabelStyle}>🎪 Participations:</span>
                  <span style={{ ...infoValueStyle, color: '#28a745', fontWeight: 'bold' }}>
                    {(freshComedianStats?.totalEvents || comedian.stats.totalEvents || 0)} évènement{(freshComedianStats?.totalEvents || comedian.stats.totalEvents || 0) > 1 ? 's' : ''}
                  </span>
                </div>
              )}
              
              <div style={infoRowStyle}>
                <span style={infoLabelStyle}>🚫 Absences:</span>
                <span style={{ ...infoValueStyle, color: '#dc3545', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 6 }}>
                  {comedian.stats?.absences || 0} évènement{(comedian.stats?.absences || 0) > 1 ? 's' : ''}
                  {absences.length > 0 && absences[0].reason && (
                    <span
                      title={`Dernière raison d'absence : ${absences[0].reason}`}
                      style={{
                        marginLeft: 6,
                        cursor: 'pointer',
                        color: '#ffc107',
                        fontWeight: 'bold',
                        fontSize: '1.1em'
                      }}
                    >
                      +
                    </span>
                  )}
                </span>
              </div>

              <div style={infoRowStyle}>
                <span style={infoLabelStyle}>⏰ Annulations tardives:</span>
                <span style={{
                  ...infoValueStyle,
                  color: (comedian.stats?.lateCancellations || 0) >= 3 ? '#dc3545' :
                         (comedian.stats?.lateCancellations || 0) >= 2 ? '#ffc107' : '#28a745',
                  fontWeight: 'bold'
                }}>
                  {comedian.stats?.lateCancellations || 0}
                  {(comedian.stats?.lateCancellations || 0) >= 2 && (
                    <span
                      title={(comedian.stats?.lateCancellations || 0) >= 3
                        ? 'Attention: Cet humoriste a un historique eleve d\'annulations tardives'
                        : 'Cet humoriste a quelques annulations tardives'}
                      style={{ marginLeft: 6, cursor: 'pointer' }}
                    >
                      ⚠️
                    </span>
                  )}
                </span>
              </div>

              {/* Détails des absences avec messages */}
              {loadingAbsences ? (
                <div style={{ textAlign: 'center', color: '#aaa', padding: '10px', fontSize: '12px' }}>
                  Chargement des détails des absences...
                </div>
              ) : absences.length > 0 ? (
                <div style={{ 
                  marginTop: '15px',
                  padding: '10px',
                  backgroundColor: 'rgba(220, 53, 69, 0.1)',
                  borderRadius: '6px',
                  border: '1px solid rgba(220, 53, 69, 0.3)'
                }}>
                  <h5 style={{ 
                    color: '#dc3545', 
                    fontSize: '0.9em', 
                    marginBottom: '8px',
                    fontWeight: 'bold'
                  }}>
                    📋 Détails des absences:
                  </h5>
                  {absences.map((absence) => (
                    <div key={absence._id} style={{
                      marginBottom: '10px',
                      padding: '8px',
                      backgroundColor: 'rgba(0, 0, 0, 0.2)',
                      borderRadius: '4px',
                      borderLeft: '3px solid #dc3545'
                    }}>
                      <div style={{ fontSize: '0.85em', color: '#ff6b6b', marginBottom: '4px' }}>
                        <strong>Évènement:</strong> {absence.event.title}
                      </div>
                      <div style={{ fontSize: '0.8em', color: '#aaa', marginBottom: '4px' }}>
                        <strong>Date:</strong> {new Date(absence.event.date).toLocaleDateString('fr-FR')}
                      </div>
                      <div style={{ fontSize: '0.8em', color: '#aaa', marginBottom: '4px' }}>
                        <strong>Lieu:</strong> {(() => {
                          const location = absence.event.location;
                          if (typeof location === 'object' && location !== null) {
                            const locationObj = location as any;
                            const venue = locationObj.venue || '';
                            const address = locationObj.address || '';
                            const city = locationObj.city || '';
                            return `${venue}${venue && address ? ', ' : ''}${address}${(venue || address) && city ? ', ' : ''}${city}`.trim();
                          }
                          return location || 'Lieu non spécifié';
                        })()}
                      </div>
                      <div style={{ fontSize: '0.8em', color: '#aaa', marginBottom: '4px' }}>
                        <strong>Marqué par:</strong> {absence.organizer.firstName} {absence.organizer.lastName}
                      </div>
                      <div style={{ fontSize: '0.8em', color: '#aaa', marginBottom: '4px' }}>
                        <strong>Date du marquage:</strong> {new Date(absence.markedAt).toLocaleDateString('fr-FR')}
                      </div>
                      {absence.reason && (
                        <div style={{
                          marginTop: '6px',
                          padding: '6px',
                          backgroundColor: 'rgba(255, 255, 255, 0.1)',
                          borderRadius: '4px',
                          border: '1px solid rgba(255, 255, 255, 0.2)'
                        }}>
                          <div style={{ fontSize: '0.8em', color: '#ffc107', marginBottom: '2px', fontWeight: 'bold' }}>
                            💬 Raison de l'absence:
                          </div>
                          <div style={{ fontSize: '0.8em', color: '#ffffff', fontStyle: 'italic' }}>
                            "{absence.reason}"
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : comedian.stats?.absences && comedian.stats.absences > 0 ? (
                null
              ) : null}
              
              {comedian.stats.averageRating !== undefined && (
                <div style={infoRowStyle}>
                  <span style={infoLabelStyle}>⭐ Note moyenne:</span>
                  <span style={{ ...infoValueStyle, color: '#ffc107', fontWeight: 'bold' }}>
                    {comedian.stats.averageRating}/5 ⭐
                  </span>
                </div>
              )}
              
              {/* Taux de participation */}
              {((freshComedianStats?.totalEvents !== undefined) || (comedian.stats.totalEvents !== undefined) || (comedian.stats?.absences !== undefined)) && (
                <div style={infoRowStyle}>
                  <span style={infoLabelStyle}>📊 Taux de participation:</span>
                  <span style={{ ...infoValueStyle, color: '#17a2b8', fontWeight: 'bold' }}>
                    {(() => {
                      const participations = freshComedianStats?.totalEvents || comedian.stats.totalEvents || 0;
                      const absences = freshComedianStats?.absences || comedian.stats?.absences || 0;
                      const total = participations + absences;
                      // Si aucune participation ni absence, retourner 0%
                      return total > 0 ? Math.round((participations / total) * 100) : 0;
                    })()}%
                  </span>
                </div>
              )}
            </div>
            
            {/* Autres statistiques */}
            {comedian.stats.viralScore !== undefined && (
              <div style={infoRowStyle}>
                <span style={infoLabelStyle}>🚀 Score viral:</span>
                <span style={{ ...infoValueStyle, color: '#e83e8c', fontWeight: 'bold' }}>
                  {comedian.stats.viralScore}
                </span>
              </div>
            )}
          </>
        )}
        
        {/* Message s'il n'y a pas de profil */}
        {!comedian.profile && (
          <div style={{ 
            padding: '20px', 
            backgroundColor: 'rgba(255, 193, 7, 0.1)', 
            borderRadius: '8px', 
            border: '1px solid #ffc107',
            marginTop: '20px'
          }}>
            <p style={{ color: '#ffc107', margin: 0, textAlign: 'center' }}>
              ⚠️ Ce humoriste n'a pas encore complété son profil professionnel.
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}

export default ComedianDetailsModal;
