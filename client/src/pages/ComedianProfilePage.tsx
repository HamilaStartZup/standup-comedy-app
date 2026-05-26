import { type CSSProperties, useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { useAuth } from '../hooks/useAuth';
import type { IUserData } from '../types/user';
import EditComedianProfileForm from '../components/EditComedianProfileForm';
import EmailPreferences from '../components/EmailPreferences';
import DeleteAccountSection from '../components/DeleteAccountSection';
import ExportDataSection from '../components/ExportDataSection';
import ReportComedianModal from '../components/ReportComedianModal';
import api from '../services/api';

const ACCENT = '#e85d75';
const ACCENT_GRADIENT = 'linear-gradient(135deg, #e85d75, #c13057)';
const CARD_BG = '#1a1d27';
const BORDER = '#2a2d3a';
const SEPARATOR = '#22253a';
const LABEL_COLOR = '#777';
const VALUE_COLOR = '#e0e0e0';

function ComedianProfilePage() {
  const { id } = useParams<{ id?: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { user: authUser, refreshUser } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [scrollToField, setScrollToField] = useState<string | undefined>(undefined);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'info' | 'profil'>('info');
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const isViewingOtherProfile = !!id && id !== authUser?._id;
  const isOrganizer = authUser?.role === 'ORGANIZER';
  const searchParams = new URLSearchParams(location.search);
  const fromApplications = searchParams.get('from') === 'applications';
  const applicationIdFromQuery = searchParams.get('applicationId');

  const { data: profileData, isLoading: loading } = useQuery({
    queryKey: ['profile', 'comedian', id],
    queryFn: async () => {
      const response = await api.get<IUserData>(`/profile/${id}`);
      return response.data;
    },
    enabled: !!id && id !== authUser?._id,
  });

  const user = isViewingOtherProfile ? profileData : authUser;

  const handleSaveSuccess = () => {
    refreshUser();
    setIsEditing(false);
  };

  const handleBackToApplication = () => {
    if (applicationIdFromQuery) navigate(`/applications?applicationId=${applicationIdFromQuery}`);
    else navigate('/applications');
  };

  const mainContainerStyle: CSSProperties = {
    minHeight: '100vh',
    color: '#fff',
    padding: '20px',
    background: 'linear-gradient(to bottom right, #1a1a2e, #331f41)',
  };

  const wrapperStyle: CSSProperties = {
    width: '100%',
    maxWidth: 700,
    margin: '0 auto',
    fontFamily: "'Inter', sans-serif",
  };

  const headerCardStyle: CSSProperties = {
    background: CARD_BG,
    borderRadius: 16,
    padding: 24,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    border: `1px solid ${BORDER}`,
    flexWrap: 'wrap',
    gap: 16,
  };

  const avatarStyle: CSSProperties = {
    width: 64,
    height: 64,
    borderRadius: '50%',
    background: ACCENT_GRADIENT,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 700,
    fontSize: 22,
    color: 'white',
    flexShrink: 0,
    backgroundImage: user?.avatarUrl ? `url(${user.avatarUrl})` : undefined,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
  };

  const badgeStyle: CSSProperties = {
    background: 'rgba(232,93,117,0.15)',
    color: ACCENT,
    border: '1px solid rgba(232,93,117,0.4)',
    borderRadius: 20,
    padding: '2px 10px',
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.06em',
  };

  const statBoxStyle: CSSProperties = {
    background: 'rgba(232,93,117,0.1)',
    border: '1px solid rgba(232,93,117,0.25)',
    borderRadius: 12,
    padding: '12px 20px',
    textAlign: 'center',
    minWidth: 90,
  };

  const tabsContainerStyle: CSSProperties = {
    background: CARD_BG,
    borderRadius: 50,
    padding: 4,
    display: 'flex',
    marginBottom: 16,
    border: `1px solid ${BORDER}`,
  };

  const tabButtonStyle = (active: boolean): CSSProperties => ({
    flex: 1,
    padding: '10px 16px',
    borderRadius: 50,
    border: 'none',
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: 14,
    transition: 'all 0.2s',
    background: active ? ACCENT_GRADIENT : 'transparent',
    color: active ? '#fff' : '#777',
  });

  const contentCardStyle: CSSProperties = {
    background: CARD_BG,
    borderRadius: 16,
    padding: 24,
    border: `1px solid ${BORDER}`,
    marginBottom: 16,
  };

  const sectionBarStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginBottom: 20,
  };

  const sectionTitleStyle: CSSProperties = {
    color: ACCENT,
    fontWeight: 700,
    fontSize: 12,
    letterSpacing: '0.1em',
  };

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const rowStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 0',
    gap: 12,
  };

  const labelValueGroupStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    flex: 1,
    minWidth: 0,
  };

  const labelStyle: CSSProperties = {
    color: LABEL_COLOR,
    fontSize: 13,
    fontWeight: 500,
    minWidth: 140,
    flexShrink: 0,
  };

  const valueStyle: CSSProperties = {
    color: VALUE_COLOR,
    fontSize: 14,
    fontWeight: 500,
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  };

  const modifierButtonStyle: CSSProperties = {
    background: 'transparent',
    border: `1px solid ${BORDER}`,
    borderRadius: 12,
    padding: '12px 20px',
    color: '#666',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.15s',
  };

  const dangerButtonStyle: CSSProperties = {
    ...modifierButtonStyle,
    borderColor: '#dc3545',
    color: '#dc3545',
  };

  const infoFields = [
    { label: 'Prénom', value: user?.firstName || 'Non défini', fieldName: 'firstName' },
    { label: 'Nom', value: user?.lastName || 'Non défini', fieldName: 'lastName' },
    { label: 'Email', value: user?.email || 'Non défini', isEmail: true, fieldName: 'email' },
    { label: 'Ville', value: user?.city || 'Non défini', fieldName: 'city' },
    { label: 'Téléphone', value: user?.phone || 'Non défini', fieldName: 'phone' },
    { label: 'Genre', value: user?.gender === 'femme' ? 'Femme' : user?.gender === 'homme' ? 'Homme' : 'Non défini', fieldName: 'gender' },
    { label: 'Adresse', value: user?.address || 'Non définie', fieldName: 'address' },
  ];

  const experienceLabel = (() => {
    const scenes = user?.profile?.numberOfScenes;
    if (!scenes) return 'Non spécifié';
    if (scenes === '0-50') return '0-50 scènes (Débutant)';
    if (scenes === '50-200') return '50-200 scènes (Expérimenté)';
    if (scenes === '200+') return '200+ scènes (Pro)';
    return 'Non spécifié';
  })();

  const comedyStyleLabel = user?.profile?.comedyStyle?.length
    ? user.profile.comedyStyle.map(s => {
        const labels: Record<string, string> = {
          'stand-up': 'Stand up',
          'improvisation': 'Improvisation',
          'plateau': 'Plateau',
          'sketch': 'Sketch',
        };
        return labels[s] || s;
      }).join(', ')
    : 'Non spécifié';

  const langLabel = user?.profile?.performanceLanguages?.length
    ? user.profile.performanceLanguages.map(l => {
        const labels: Record<string, string> = {
          francais: 'Français', arabe: 'Arabe', anglais: 'Anglais', italien: 'Italien', espagnol: 'Espagnol',
        };
        return labels[l] || l;
      }).join(', ')
    : 'Non spécifié';

  const mobilityLabel = user?.profile?.mobilityZone?.length
    ? user.profile.mobilityZone.map(z => `${z.type === 'ville' ? 'Ville' : z.type === 'departement' ? 'Département' : 'Région'}: ${z.value}`).join(', ')
    : 'Non spécifié';

  const profilFields = [
    { label: 'Bio', value: user?.profile?.bio || 'Non spécifié', fieldName: 'profile.bio' },
    { label: "Niveau d'expérience", value: experienceLabel, fieldName: 'profile.numberOfScenes' },
    { label: 'Style de comédie', value: comedyStyleLabel, fieldName: 'section-comedy-style' },
    { label: 'Langues', value: langLabel, fieldName: 'section-languages' },
    { label: 'Zone de mobilité', value: mobilityLabel, fieldName: 'section-mobility' },
  ];

  if (loading) {
    return (
      <div style={mainContainerStyle}>
        <Navbar />
        <div style={{ ...wrapperStyle, textAlign: 'center', padding: '40px', color: '#888' }}>
          Chargement du profil...
        </div>
      </div>
    );
  }

  return (
    <div style={mainContainerStyle}>
      <Navbar />
      <div style={wrapperStyle}>
        {/* Header Card */}
        <div style={{ ...headerCardStyle, flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flex: 1, minWidth: 0 }}>
            <div style={avatarStyle}>
              {!user?.avatarUrl && (user ? `${user.firstName[0]}${user.lastName[0]}`.toUpperCase() : '—')}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 20, color: '#fff', marginBottom: 6 }}>
                {user ? `${user.firstName} ${user.lastName}` : '—'}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={badgeStyle}>HUMORISTE</span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', justifyContent: isMobile ? 'space-between' : 'flex-end' }}>
            <div style={statBoxStyle}>
              <div style={{ color: ACCENT, fontSize: 26, fontWeight: 700 }}>
                {user?.stats?.applicationsAccepted ?? 0}
              </div>
              <div style={{ color: '#888', fontSize: 12, marginTop: 2 }}>Candidatures acceptées</div>
            </div>
            {fromApplications && (
              <button
                type="button"
                onClick={handleBackToApplication}
                style={modifierButtonStyle}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = ACCENT;
                  e.currentTarget.style.color = ACCENT;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = BORDER;
                  e.currentTarget.style.color = '#666';
                }}
              >
                ← Retour candidature
              </button>
            )}
            {isOrganizer && isViewingOtherProfile && user && (
              <button type="button" onClick={() => setIsReportModalOpen(true)} style={dangerButtonStyle}>
                🚫 Signaler
              </button>
            )}
            {!isViewingOtherProfile && (
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                style={modifierButtonStyle}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = ACCENT;
                  e.currentTarget.style.color = ACCENT;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = BORDER;
                  e.currentTarget.style.color = '#666';
                }}
              >
                Modifier
              </button>
            )}
          </div>
        </div>

        {isEditing && user ? (
          <EditComedianProfileForm
            isOpen={isEditing}
            onClose={() => setIsEditing(false)}
            currentUser={user}
            onSaveSuccess={handleSaveSuccess}
            scrollToField={scrollToField}
          />
        ) : (
          <>
            {/* Tabs (own profile only) */}
            {!isViewingOtherProfile && (
              <div style={tabsContainerStyle}>
                {[
                  { id: 'info' as const, label: 'Informations personnelles' },
                  { id: 'profil' as const, label: 'Profil Humoriste' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    style={tabButtonStyle(activeTab === tab.id)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            )}

            {/* Informations personnelles: onglet "info" (propre profil) ou première carte (profil d'un autre) */}
            {((!isViewingOtherProfile && activeTab === 'info') || isViewingOtherProfile) && (
              <div style={contentCardStyle}>
                <div style={sectionBarStyle}>
                  <div style={{ width: 28, height: 2, background: ACCENT, borderRadius: 2 }} />
                  <span style={sectionTitleStyle}>INFORMATIONS PERSONNELLES</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                  {infoFields.map((field, i) => (
                    <div key={field.label}>
                      {isMobile ? (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', gap: 12 }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1, minWidth: 0 }}>
                            <span style={{ ...labelStyle, minWidth: 'auto' }}>{field.label}</span>
                            <span style={{ ...valueStyle, color: field.isEmail ? ACCENT : VALUE_COLOR, whiteSpace: 'normal' }}>
                              {field.value}
                            </span>
                          </div>
                          {!isViewingOtherProfile && (
                            <button
                              type="button"
                              onClick={() => { setScrollToField(field.fieldName); setIsEditing(true); }}
                              style={{ ...modifierButtonStyle, padding: '5px 12px', flexShrink: 0 }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.borderColor = ACCENT;
                                e.currentTarget.style.color = ACCENT;
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.borderColor = BORDER;
                                e.currentTarget.style.color = '#666';
                              }}
                            >
                              Modifier
                            </button>
                          )}
                        </div>
                      ) : (
                        <div style={rowStyle}>
                          <div style={labelValueGroupStyle}>
                            <span style={labelStyle}>{field.label}</span>
                            <span style={{ ...valueStyle, color: field.isEmail ? ACCENT : VALUE_COLOR }}>
                              {field.value}
                            </span>
                          </div>
                          {!isViewingOtherProfile && (
                            <div style={{ flexShrink: 0 }}>
                              <button
                                type="button"
                                onClick={() => { setScrollToField(field.fieldName); setIsEditing(true); }}
                                style={modifierButtonStyle}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.borderColor = ACCENT;
                                  e.currentTarget.style.color = ACCENT;
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.borderColor = BORDER;
                                  e.currentTarget.style.color = '#666';
                                }}
                              >
                                Modifier
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                      {i < infoFields.length - 1 && <div style={{ height: 1, background: SEPARATOR }} />}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Profil Humoriste: onglet "profil" (propre profil) ou deuxième carte (profil d'un autre) */}
            {((!isViewingOtherProfile && activeTab === 'profil') || isViewingOtherProfile) && (
              <div style={contentCardStyle}>
                <div style={sectionBarStyle}>
                  <div style={{ width: 28, height: 2, background: ACCENT, borderRadius: 2 }} />
                  <span style={sectionTitleStyle}>PROFIL HUMORISTE</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                  {profilFields.map((field, i) => (
                    <div key={field.label}>
                      {isMobile ? (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', gap: 12 }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1, minWidth: 0 }}>
                            <span style={{ ...labelStyle, minWidth: 'auto' }}>{field.label}</span>
                            <span style={{ ...valueStyle, whiteSpace: 'normal' }}>{field.value}</span>
                          </div>
                          {!isViewingOtherProfile && (
                            <button
                              type="button"
                              onClick={() => { setScrollToField(field.fieldName); setIsEditing(true); }}
                              style={{ ...modifierButtonStyle, padding: '5px 12px', flexShrink: 0 }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.borderColor = ACCENT;
                                e.currentTarget.style.color = ACCENT;
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.borderColor = BORDER;
                                e.currentTarget.style.color = '#666';
                              }}
                            >
                              Modifier
                            </button>
                          )}
                        </div>
                      ) : (
                        <div style={rowStyle}>
                          <div style={labelValueGroupStyle}>
                            <span style={labelStyle}>{field.label}</span>
                            <span style={{ ...valueStyle, whiteSpace: 'normal' }}>{field.value}</span>
                          </div>
                          {!isViewingOtherProfile && (
                            <div style={{ flexShrink: 0 }}>
                              <button
                                type="button"
                                onClick={() => { setScrollToField(field.fieldName); setIsEditing(true); }}
                                style={modifierButtonStyle}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.borderColor = ACCENT;
                                  e.currentTarget.style.color = ACCENT;
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.borderColor = BORDER;
                                  e.currentTarget.style.color = '#666';
                                }}
                              >
                                Modifier
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                      {i < profilFields.length - 1 && <div style={{ height: 1, background: SEPARATOR }} />}
                    </div>
                  ))}
                </div>
                {(user?.profile?.socialLinks?.youtube || user?.profile?.socialLinks?.instagram || user?.profile?.socialLinks?.facebook) && (
                  <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${SEPARATOR}` }}>
                    <div style={{ ...sectionBarStyle, marginBottom: 12 }}>
                      <span style={sectionTitleStyle}>RÉSEAUX SOCIAUX</span>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                      {user?.profile?.socialLinks?.youtube && (
                        <a href={user.profile.socialLinks.youtube} target="_blank" rel="noopener noreferrer" style={{ color: ACCENT, textDecoration: 'none', fontSize: 14 }}>
                          📺 YouTube
                        </a>
                      )}
                      {user?.profile?.socialLinks?.instagram && (
                        <a href={user.profile.socialLinks.instagram} target="_blank" rel="noopener noreferrer" style={{ color: ACCENT, textDecoration: 'none', fontSize: 14 }}>
                          📷 Instagram
                        </a>
                      )}
                      {user?.profile?.socialLinks?.facebook && (
                        <a href={user.profile.socialLinks.facebook} target="_blank" rel="noopener noreferrer" style={{ color: ACCENT, textDecoration: 'none', fontSize: 14 }}>
                          👤 Facebook
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Paramètres et confidentialité (own profile only) */}
            {!isViewingOtherProfile && (
              <div style={{ marginTop: 32, paddingTop: 32, borderTop: `1px solid ${BORDER}` }}>
                <div style={sectionBarStyle}>
                  <div style={{ width: 28, height: 2, background: ACCENT, borderRadius: 2 }} />
                  <span style={sectionTitleStyle}>PARAMÈTRES ET CONFIDENTIALITÉ</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                  <EmailPreferences />
                  <ExportDataSection />
                  <DeleteAccountSection />
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {isOrganizer && isViewingOtherProfile && user && (
        <ReportComedianModal
          isOpen={isReportModalOpen}
          onClose={() => setIsReportModalOpen(false)}
          comedianId={user._id}
          comedianName={`${user.firstName} ${user.lastName}`}
        />
      )}
    </div>
  );
}

export default ComedianProfilePage;
