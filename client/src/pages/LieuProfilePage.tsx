import { type CSSProperties, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { useAuth } from '../hooks/useAuth';
import type { IUserData } from '../types/user';
import EditLieuProfileForm from '../components/EditLieuProfileForm';
import EmailPreferences from '../components/EmailPreferences';
import DeleteAccountSection from '../components/DeleteAccountSection';
import ExportDataSection from '../components/ExportDataSection';
import UpgradeToOrganizerForm from '../components/UpgradeToOrganizerForm';
import Modal from '../components/Modal';
import { switchToOrganizer } from '../services/api';
import { useAlert } from '../hooks/useAlert';

const ACCENT = '#e85d75';
const ACCENT_GRADIENT = 'linear-gradient(135deg, #e85d75, #c13057)';
const CARD_BG = '#1a1d27';
const BORDER = '#2a2d3a';
const SEPARATOR = '#22253a';
const LABEL_COLOR = '#777';
const VALUE_COLOR = '#e0e0e0';

function LieuProfilePage() {
  const { user: authUser, refreshUser } = useAuth();
  const navigate = useNavigate();
  const { showSuccess, showError } = useAlert();
  const [user, setUser] = useState<IUserData | null>(authUser);
  const [isEditing, setIsEditing] = useState(false);
  const [isUpgrading, setIsUpgrading] = useState(false);
  const [isSwitchingToOrganizer, setIsSwitchingToOrganizer] = useState(false);
  const [isSwitchConfirmOpen, setIsSwitchConfirmOpen] = useState(false);
  const [scrollToField, setScrollToField] = useState<string | undefined>(undefined);
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

  const canQuickSwitchToOrganizer = !!user?.canSwitchToLieu && !!user?.organizerProfile;

  const performSwitchToOrganizer = async () => {
    setIsSwitchingToOrganizer(true);
    try {
      await switchToOrganizer();
      await refreshUser();
      showSuccess('Passage au compte Organisateur effectué');
      navigate('/dashboard');
    } catch (error: any) {
      showError(error?.response?.data?.message || 'Impossible de basculer vers le compte Organisateur');
    } finally {
      setIsSwitchingToOrganizer(false);
    }
  };

  const handleSwitchToOrganizer = async () => {
    setIsSwitchConfirmOpen(false);
    await performSwitchToOrganizer();
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

  const infoFields = [
    { key: 'firstName', label: 'Prénom', value: user?.firstName || 'Non défini', fieldId: 'firstName' },
    { key: 'lastName', label: 'Nom', value: user?.lastName || 'Non défini', fieldId: 'lastName' },
    { key: 'email', label: 'Email', value: user?.email || 'Non défini', isEmail: true, fieldId: 'email' },
    { key: 'phone', label: 'Téléphone', value: user?.phone || 'Non défini', fieldId: 'phone' },
    { key: 'city', label: 'Ville', value: user?.city || 'Non défini', fieldId: 'city' },
    { key: 'address', label: 'Adresse', value: user?.address || 'Non défini', fieldId: 'address' },
  ];

  return (
    <div style={mainContainerStyle}>
      <Navbar />
      <div style={wrapperStyle}>
        {/* Header Card */}
        <div style={{ ...headerCardStyle, flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={avatarStyle}>
              {!user?.avatarUrl && (user ? `${user.firstName[0]}${user.lastName[0]}`.toUpperCase() : 'LI')}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 20, color: '#fff', marginBottom: 6 }}>
                {user ? `${user.firstName} ${user.lastName}` : '—'}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={badgeStyle}>LIEU</span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', justifyContent: isMobile ? 'space-between' : 'flex-end' }}>
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
            <button
              type="button"
              onClick={canQuickSwitchToOrganizer ? () => setIsSwitchConfirmOpen(true) : () => setIsUpgrading(true)}
              disabled={isUpgrading || isSwitchingToOrganizer}
              style={{
                padding: '10px 20px',
                background: '#e85d75',
                border: 'none',
                borderRadius: '8px',
                color: '#fff',
                cursor: (isUpgrading || isSwitchingToOrganizer) ? 'not-allowed' : 'pointer',
                fontWeight: 600,
                fontSize: '14px',
                opacity: (isUpgrading || isSwitchingToOrganizer) ? 0.7 : 1,
              }}
            >
              {canQuickSwitchToOrganizer
                ? (isSwitchingToOrganizer ? 'Switch en cours...' : 'Switcher vers organisateur')
                : 'Devenir Organisateur'}
            </button>
          </div>
        </div>

        {isEditing && user ? (
          <EditLieuProfileForm
            isOpen={isEditing}
            onClose={() => setIsEditing(false)}
            currentUser={user}
            onSaveSuccess={handleSaveSuccess}
            scrollToField={scrollToField}
          />
        ) : (
          <>
            {/* Informations */}
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
                            e.currentTarget.style.color = '#666';
                          }}
                        >
                          Modifier
                        </button>
                      </div>
                    ) : (
                      <div style={rowStyle}>
                        <div style={labelValueGroupStyle}>
                          <span style={labelStyle}>{field.label}</span>
                          <span style={{ ...valueStyle, color: field.isEmail ? ACCENT : VALUE_COLOR }}>
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
                              e.currentTarget.style.color = '#666';
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

            {/* Paramètres et confidentialité */}
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
          </>
        )}
      </div>
      <UpgradeToOrganizerForm
        isOpen={isUpgrading}
        onClose={() => setIsUpgrading(false)}
        onSuccess={async () => {
          setIsUpgrading(false);
          try {
            await refreshUser();
          } finally {
            navigate('/dashboard');
          }
        }}
      />
      <Modal isOpen={isSwitchConfirmOpen} onClose={() => setIsSwitchConfirmOpen(false)}>
        <h3 style={{ margin: '0 0 8px', color: '#fff', fontSize: '20px' }}>
          Switcher vers organisateur
        </h3>
        <p style={{ margin: '0 0 20px', color: '#8b8fa8', fontSize: '14px', lineHeight: 1.5 }}>
          Voulez-vous basculer vers votre compte organisateur maintenant ?
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button
            type="button"
            onClick={() => setIsSwitchConfirmOpen(false)}
            disabled={isSwitchingToOrganizer}
            style={{
              padding: '10px 18px',
              borderRadius: '8px',
              border: `1px solid ${BORDER}`,
              background: 'transparent',
              color: '#8b8fa8',
              cursor: isSwitchingToOrganizer ? 'not-allowed' : 'pointer',
            }}
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={handleSwitchToOrganizer}
            disabled={isSwitchingToOrganizer}
            style={{
              padding: '10px 18px',
              borderRadius: '8px',
              border: 'none',
              background: ACCENT,
              color: '#fff',
              fontWeight: 600,
              cursor: isSwitchingToOrganizer ? 'not-allowed' : 'pointer',
              opacity: isSwitchingToOrganizer ? 0.7 : 1,
            }}
          >
            {isSwitchingToOrganizer ? 'Switch en cours...' : 'Confirmer'}
          </button>
        </div>
      </Modal>
    </div>
  );
}

export default LieuProfilePage;
