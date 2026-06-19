import { type CSSProperties, useState, useEffect } from 'react';
import Navbar from '../components/Navbar';
import { useAuth } from '../hooks/useAuth';
import type { IUserData } from '../types/user';
import EditOrganizerProfileForm from '../components/EditOrganizerProfileForm';
import EmailPreferences from '../components/EmailPreferences';
import DeleteAccountSection from '../components/DeleteAccountSection';
import ExportDataSection from '../components/ExportDataSection';
const ACCENT = 'var(--ccc-accent)';
const ACCENT_GRADIENT = 'var(--ccc-accent-gradient)';
const CARD_BG = 'var(--ccc-bg-elevated)';
const BORDER = 'var(--ccc-border-subtle)';
const SEPARATOR = 'var(--ccc-border-subtle)';
const LABEL_COLOR = 'var(--ccc-text-muted)';
const VALUE_COLOR = 'var(--ccc-text-secondary)';

function OrganizerProfilePage() {
  const { user: authUser, refreshUser } = useAuth();
  const [user, setUser] = useState<IUserData | null>(authUser);
  const [isEditing, setIsEditing] = useState(false);
  const [scrollToField, setScrollToField] = useState<string | undefined>(undefined);
  const [activeTab, setActiveTab] = useState<'info' | 'profil'>('info');
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    setUser(authUser);
  }, [authUser]);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleSaveSuccess = () => {
    refreshUser();
    setIsEditing(false);
  };

  const mainContainerStyle: CSSProperties = {
    minHeight: '100vh',
    color: 'var(--ccc-text-primary)',
    padding: '20px',
    background: 'var(--ccc-bg-gradient)',
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
    boxShadow: '0 4px 24px rgba(15, 23, 42, 0.08)',
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
    boxShadow: '0 4px 24px rgba(15, 23, 42, 0.08)',
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
    color: active ? 'var(--ccc-text-on-accent)' : 'var(--ccc-text-muted)',
  });

  const contentCardStyle: CSSProperties = {
    background: CARD_BG,
    borderRadius: 16,
    padding: 24,
    border: `1px solid ${BORDER}`,
    boxShadow: '0 4px 24px rgba(15, 23, 42, 0.08)',
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
    boxShadow: '0 4px 24px rgba(15, 23, 42, 0.08)',
    borderRadius: 12,
    padding: '12px 20px',
    color: 'var(--ccc-text-muted)',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.15s',
  };

  const infoFields = [
    { key: 'firstName', label: 'Prénom', value: user?.firstName || 'Non défini', fieldId: 'firstName' },
    { key: 'lastName', label: 'Nom', value: user?.lastName || 'Non défini', fieldId: 'lastName' },
    { key: 'email', label: 'Email', value: user?.email || 'Non défini', isEmail: true, fieldId: 'email' },
    { key: 'phone', label: 'Téléphone', value: user?.organizerProfile?.phone || 'Non défini', fieldId: 'organizerProfile.phone' },
    { key: 'city', label: 'Ville', value: user?.city || 'Non défini', fieldId: 'city' },
    { key: 'address', label: 'Adresse', value: user?.address || 'Non défini', fieldId: 'address' },
    { key: 'gender', label: 'Genre', value: user?.gender === 'femme' ? 'Femme' : user?.gender === 'homme' ? 'Homme' : 'Non défini', fieldId: 'gender' },
  ];

  const profilFields = [
    { label: "Nom de l'entreprise", value: user?.organizerProfile?.companyName || 'Non défini', fieldId: 'organizerProfile.companyName' },
    { label: 'Ville', value: user?.organizerProfile?.location?.city || 'Non défini', fieldId: 'organizerProfile.location.city' },
    { label: 'Code postal', value: user?.organizerProfile?.location?.postalCode || 'Non défini', fieldId: 'organizerProfile.location.postalCode' },
    { label: 'Adresse', value: user?.organizerProfile?.location?.address || 'Non défini', fieldId: 'organizerProfile.location.address' },
    { label: 'Description', value: user?.organizerProfile?.description || 'Non spécifié', fieldId: 'organizerProfile.description' },
    { label: 'Site web', value: user?.organizerProfile?.website || 'Non spécifié', fieldId: 'organizerProfile.website' },
    { label: 'Types de lieux', value: user?.organizerProfile?.venueTypes?.join(', ') || 'Non spécifié', fieldId: 'organizerProfile.venueTypes' },
    {
      label: 'Fréquence des évènements',
      value:
        user?.organizerProfile?.eventFrequency === 'weekly'
          ? 'Hebdomadaire'
          : user?.organizerProfile?.eventFrequency === 'monthly'
            ? 'Mensuel'
            : user?.organizerProfile?.eventFrequency === 'occasional'
              ? 'Occasionnel'
              : 'Non spécifié',
      fieldId: 'organizerProfile.eventFrequency',
    },
  ];

  return (
    <div style={mainContainerStyle}>
      <Navbar />
      <div style={wrapperStyle}>
        {/* Header Card */}
        <div style={{ ...headerCardStyle, flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={avatarStyle}>
              {!user?.avatarUrl && (user ? `${user.firstName[0]}${user.lastName[0]}`.toUpperCase() : 'DA')}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 20, color: 'var(--ccc-text-primary)', marginBottom: 6 }}>
                {user ? `${user.firstName} ${user.lastName}` : '—'}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={badgeStyle}>ORGANISATEUR</span>
                <span style={{ color: 'var(--ccc-text-muted)', fontSize: 14 }}>
                  {user?.organizerProfile?.companyName || '—'}
                </span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', justifyContent: isMobile ? 'space-between' : 'flex-end' }}>
            <div style={statBoxStyle}>
              <div style={{ color: ACCENT, fontSize: 26, fontWeight: 700 }}>
                {user?.stats?.totalEvents ?? 0}
              </div>
              <div style={{ color: 'var(--ccc-text-muted)', fontSize: 12, marginTop: 2 }}>Évènements créés</div>
            </div>
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
                e.currentTarget.style.color = 'var(--ccc-text-muted)';
              }}
            >
              Modifier
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div style={tabsContainerStyle}>
          {[
            { id: 'info' as const, label: 'Informations personnelles' },
            { id: 'profil' as const, label: 'Profil Organisateur' },
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

        {isEditing && user ? (
          <EditOrganizerProfileForm
            isOpen={isEditing}
            onClose={() => setIsEditing(false)}
            currentUser={user}
            onSaveSuccess={handleSaveSuccess}
            scrollToField={scrollToField}
          />
        ) : (
          <>
            {/* Tab: Informations personnelles */}
            {activeTab === 'info' && (
              <div style={contentCardStyle}>
                <div style={sectionBarStyle}>
                  <div style={{ width: 28, height: 2, background: ACCENT, borderRadius: 2 }} />
                  <span style={sectionTitleStyle}>INFORMATIONS PERSONNELLES</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                  {infoFields.map((field, i) => (
                    <div key={field.key}>
                      {isMobile ? (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', gap: 12 }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1, minWidth: 0 }}>
                            <span style={{ ...labelStyle, minWidth: 'auto' }}>{field.label}</span>
                            <span style={{ ...valueStyle, color: field.isEmail ? ACCENT : VALUE_COLOR, whiteSpace: 'normal' }}>
                              {field.value}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => { setScrollToField(field.fieldId); setIsEditing(true); }}
                            style={{ ...modifierButtonStyle, padding: '5px 12px', flexShrink: 0 }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.borderColor = ACCENT;
                              e.currentTarget.style.color = ACCENT;
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.borderColor = BORDER;
                              e.currentTarget.style.color = 'var(--ccc-text-muted)';
                            }}
                          >
                            Modifier
                          </button>
                        </div>
                      ) : (
                        <div style={rowStyle}>
                          <div style={labelValueGroupStyle}>
                            <span style={labelStyle}>{field.label}</span>
                            <span
                              style={{
                                ...valueStyle,
                                color: field.isEmail ? ACCENT : VALUE_COLOR,
                              }}
                            >
                              {field.value}
                            </span>
                          </div>
                          <div style={{ flexShrink: 0 }}>
                            <button
                              type="button"
                              onClick={() => { setScrollToField(field.fieldId); setIsEditing(true); }}
                              style={modifierButtonStyle}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.borderColor = ACCENT;
                                e.currentTarget.style.color = ACCENT;
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.borderColor = BORDER;
                                e.currentTarget.style.color = 'var(--ccc-text-muted)';
                              }}
                            >
                              Modifier
                            </button>
                          </div>
                        </div>
                      )}
                      {i < infoFields.length - 1 && (
                        <div style={{ height: 1, background: SEPARATOR }} />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Tab: Profil Organisateur */}
            {activeTab === 'profil' && (
              <div style={contentCardStyle}>
                <div style={sectionBarStyle}>
                  <div style={{ width: 28, height: 2, background: ACCENT, borderRadius: 2 }} />
                  <span style={sectionTitleStyle}>PROFIL ORGANISATEUR</span>
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
                          <button
                            type="button"
                            onClick={() => { setScrollToField(field.fieldId); setIsEditing(true); }}
                            style={{ ...modifierButtonStyle, padding: '5px 12px', flexShrink: 0 }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.borderColor = ACCENT;
                              e.currentTarget.style.color = ACCENT;
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.borderColor = BORDER;
                              e.currentTarget.style.color = 'var(--ccc-text-muted)';
                            }}
                          >
                            Modifier
                          </button>
                        </div>
                      ) : (
                        <div style={rowStyle}>
                          <div style={labelValueGroupStyle}>
                            <span style={labelStyle}>{field.label}</span>
                            <span style={valueStyle}>{field.value}</span>
                          </div>
                          <div style={{ flexShrink: 0 }}>
                            <button
                              type="button"
                              onClick={() => { setScrollToField(field.fieldId); setIsEditing(true); }}
                              style={modifierButtonStyle}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.borderColor = ACCENT;
                                e.currentTarget.style.color = ACCENT;
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.borderColor = BORDER;
                                e.currentTarget.style.color = 'var(--ccc-text-muted)';
                              }}
                            >
                              Modifier
                            </button>
                          </div>
                        </div>
                      )}
                      {i < profilFields.length - 1 && (
                        <div style={{ height: 1, background: SEPARATOR }} />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Paramètres et confidentialité */}
            <div
              style={{
                marginTop: 32,
                paddingTop: 32,
                borderTop: `1px solid ${BORDER}`,
              }}
            >
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
          </>
        )}
      </div>

    </div>
  );
}

export default OrganizerProfilePage;
