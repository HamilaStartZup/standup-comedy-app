import { type CSSProperties, useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import NotificationDropdown from './NotificationDropdown';

function Navbar() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Fermer le menu mobile quand on change de page
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  // Empêcher le scroll en arrière-plan quand le menu est ouvert
  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isMobileMenuOpen]);

  const navLinkBaseStyle: CSSProperties = {
    margin: '0 15px',
    textDecoration: 'none',
    color: '#ffffff',
    fontWeight: 'bold',
  };

  const activeLinkStyle: CSSProperties = {
    borderBottom: '2px solid #ff416c',
    paddingBottom: '2px',
  };

  const rightLinkStyle: CSSProperties = {
    margin: '0 10px',
    textDecoration: 'none',
    color: '#ff416c',
    fontWeight: 'bold',
    border: 'none',
    background: 'none',
    cursor: 'pointer',
  };

  const userNameStyle: CSSProperties = {
    marginRight: '10px',
    color: '#ffffff',
    fontWeight: 'bold',
  };

  // Styles selon le rôle - uniquement texte et icône, pas de couleurs
  const getRoleStyles = () => {
    if (user?.role === 'ORGANIZER') {
      return {
        navbarBg: 'rgba(0, 0, 0, 0.4)',
        badgeBg: 'transparent',
        badgeColor: '#ffffff',
        badgeIcon: '🎯',
        badgeText: 'Organisateur',
        avatarGradient: 'rgba(128, 128, 128, 0.6)',
      };
    } else if (user?.role === 'COMEDIAN') {
      return {
        navbarBg: 'rgba(0, 0, 0, 0.4)',
        badgeBg: 'transparent',
        badgeColor: '#ffffff',
        badgeIcon: '🎭',
        badgeText: 'Humoriste',
        avatarGradient: 'rgba(128, 128, 128, 0.6)',
      };
    } else if (user?.role === 'SUPER_ADMIN') {
      return {
        navbarBg: 'rgba(0, 0, 0, 0.4)',
        badgeBg: 'transparent',
        badgeColor: '#ffffff',
        badgeIcon: '👑',
        badgeText: 'Super Admin',
        avatarGradient: 'rgba(128, 128, 128, 0.6)',
      };
    } else if (user?.role === 'SPECTATOR') {
      return {
        navbarBg: 'rgba(0, 0, 0, 0.4)',
        badgeBg: 'transparent',
        badgeColor: '#ffffff',
        badgeIcon: '👥',
        badgeText: 'Spectateur',
        avatarGradient: 'rgba(128, 128, 128, 0.6)',
      };
    } else if (user?.role === 'LIEU') {
      return {
        navbarBg: 'rgba(0, 0, 0, 0.4)',
        badgeBg: 'transparent',
        badgeColor: '#ffffff',
        badgeIcon: '🏛️',
        badgeText: 'Lieu',
        avatarGradient: 'rgba(128, 128, 128, 0.6)',
      };
    }
    return {
      navbarBg: 'rgba(0, 0, 0, 0.4)',
      badgeBg: 'transparent',
      badgeColor: '#ffffff',
      badgeIcon: '👤',
      badgeText: 'Invité',
      avatarGradient: 'rgba(128, 128, 128, 0.6)',
    };
  };

  const roleStyles = getRoleStyles();

  // Navigation items pour le menu mobile
  const getNavigationItems = () => {
    // LIEU : Mes Salles, Profil
    if (user?.role === 'LIEU') {
      return [
        { to: '/my-venues-management', label: 'Mes Salles', icon: '🏠', show: true },
        { to: '/profile/lieu', label: 'Profil', icon: '👤', show: true },
      ];
    }

    // Spectateur : uniquement Accueil et Évènements
    if (user?.role === 'SPECTATOR') {
      return [
        { to: '/spectateur', label: 'Accueil', icon: '🏠', show: true },
        { to: '/spectateur/events', label: 'Mes évènements', icon: '📅', show: true },
        { to: '/spectateur/profile', label: 'Profil', icon: '👤', show: true },
      ];
    }

    const items = [
      {
        to: "/dashboard",
        label: "Accueil",
        icon: "🏠",
        show: true
      },
      {
        to: "/events",
        label: user?.role === 'ORGANIZER' ? 'Mes Évènements' : 'Évènements',
        icon: "📅",
        show: true
      },
      {
        to: "/calendar",
        label: "Calendrier",
        icon: "🗓️",
        show: true
      }
    ];

    if (user?.role !== 'SUPER_ADMIN') {
      items.push({
        to: "/applications",
        label: "Candidatures",
        icon: "📝",
        show: true
      });
    }

    if (user?.role === 'SUPER_ADMIN') {
      items.push({
        to: "/directory",
        label: "Répertoire",
        icon: "👥",
        show: true
      });
    }

    items.push({
      to: "/venues",
      label: "Salles",
      icon: "🏛️",
      show: user?.role === 'ORGANIZER' || (user?.role as string) === 'LIEU'
    });

    if (user?.role === 'ORGANIZER') {
      items.push({
        to: "/profile/organizer",
        label: "Profil",
        icon: "👤",
        show: true
      });
    }

    if (user?.role === 'COMEDIAN') {
      items.push({
        to: "/profile/comedian",
        label: "Profil",
        icon: "👤",
        show: true
      });
    }

    return items.filter(item => item.show);
  };

  const navigationItems = getNavigationItems();

  return (
    <>
      {/* Navigation principale */}
      <nav style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '10px 20px',
        background: roleStyles.navbarBg,
        color: '#ffffff',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.6)',
        position: 'sticky',
        top: 0,
        zIndex: 1000,
        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
      }}>
        {/* Menu Desktop - Masqué sur mobile */}
        <div style={{ display: 'flex', alignItems: 'center' }} id="desktop-nav">
          <h2 style={{ margin: '0', color: '#ff4b2b' }}>Connect Comedy Club</h2>
<div style={{ marginLeft: '30px' }}>
            {user?.role === 'SPECTATOR' ? (
              <>
                <Link to="/spectateur" style={{ ...navLinkBaseStyle, ...(location.pathname === '/spectateur' ? activeLinkStyle : {}) }}>Accueil</Link>
                <Link to="/spectateur/events" style={{ ...navLinkBaseStyle, ...(location.pathname === '/spectateur/events' ? activeLinkStyle : {}) }}>Mes'événements</Link>
                <Link to="/spectateur/profile" style={{ ...navLinkBaseStyle, ...(location.pathname === '/spectateur/profile' ? activeLinkStyle : {}) }}>Profil</Link>
              </>
            ) : user?.role === 'LIEU' ? (
              <>
                <Link to="/my-venues-management" style={{ ...navLinkBaseStyle, ...(location.pathname === '/my-venues-management' ? activeLinkStyle : {}) }}>Mes Salles</Link>
                <Link to="/profile/lieu" style={{ ...navLinkBaseStyle, ...(location.pathname === '/profile/lieu' ? activeLinkStyle : {}) }}>Profil</Link>
              </>
            ) : (
              <>
            <Link to="/dashboard" style={{ ...navLinkBaseStyle, ...(location.pathname === '/dashboard' ? activeLinkStyle : {}) }}>Accueil</Link>
            <Link to="/events" style={{ ...navLinkBaseStyle, ...(location.pathname === '/events' ? activeLinkStyle : {}) }}>
              {user?.role === 'ORGANIZER' ? 'Mes Évènements' : 'Évènements'}
            </Link>
            <Link to="/calendar" style={{ ...navLinkBaseStyle, ...(location.pathname === '/calendar' ? activeLinkStyle : {}) }}>
              Calendrier
            </Link>
            {user?.role !== 'SUPER_ADMIN' && (
              <Link to="/applications" style={{ ...navLinkBaseStyle, ...(location.pathname === '/applications' ? activeLinkStyle : {}) }}>Candidatures</Link>
            )}
            {user?.role === 'SUPER_ADMIN' && (
              <Link to="/directory" style={{ ...navLinkBaseStyle, ...(location.pathname === '/directory' ? activeLinkStyle : {}) }}>Répertoire</Link>
            )}
            {user?.role === 'ORGANIZER' && (
              <Link to="/venues" style={{ ...navLinkBaseStyle, ...(location.pathname.startsWith('/venues') || location.pathname === '/my-venues' || location.pathname === '/my-bookings' ? activeLinkStyle : {}) }}>Salles</Link>
            )}
            {user?.role === 'ORGANIZER' && (
              <Link to="/profile/organizer" style={{ ...navLinkBaseStyle, ...(location.pathname === '/profile/organizer' ? activeLinkStyle : {}) }}>Profil</Link>
            )}
            {user?.role === 'COMEDIAN' && (
              <Link to="/profile/comedian" style={{ ...navLinkBaseStyle, ...(location.pathname === '/profile/comedian' ? activeLinkStyle : {}) }}>Profil</Link>
            )}
              </>
            )}
          </div>
        </div>

        {/* Header Mobile - Masqué sur desktop */}
        <div style={{ display: 'flex', alignItems: 'center', width: '100%' }} id="mobile-nav">
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            style={{
              background: 'none',
              border: 'none',
              color: '#ffffff',
              fontSize: '1.5rem',
              cursor: 'pointer',
              padding: '8px',
              minWidth: '44px',
              minHeight: '44px',
            }}
          >
            {isMobileMenuOpen ? '✕' : '☰'}
          </button>
          
          <h2 style={{ 
            margin: '0 0 0 15px', 
            color: '#ff4b2b', 
            fontSize: '1.2rem',
            flexGrow: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}>
            Connect Comedy Club
          </h2>
          
        </div>

        {/* Info utilisateur Desktop - Masqué sur mobile */}
        <div id="desktop-user" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
          {/* Ligne du rôle et nom */}
          {user && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 12px',
              borderRadius: '20px',
              background: roleStyles.badgeBg,
              color: roleStyles.badgeColor,
              fontSize: '0.85rem',
              fontWeight: 'bold',
              border: '1px solid rgba(255, 255, 255, 0.2)',
            }}>
              <span style={{ fontSize: '1rem' }}>{roleStyles.badgeIcon}</span>
              <span>{roleStyles.badgeText}</span>
              <span style={{ color: '#aaa', margin: '0 4px' }}>|</span>
              <span style={{ color: '#ffffff' }}>{`${user.firstName} ${user.lastName}`}</span>
            </div>
          )}
          {/* Ligne avec cloche et déconnexion */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {/* Badge de notifications pour les organisateurs et humoristes */}
            {(user?.role === 'ORGANIZER' || user?.role === 'COMEDIAN' || user?.role === 'SPECTATOR' || user?.role === 'LIEU') && <NotificationDropdown />}
            {!user && <span style={userNameStyle}>Invité</span>}
            <button onClick={logout} style={rightLinkStyle}>Déconnexion</button>
          </div>
        </div>
      </nav>

      {/* Menu Mobile Overlay */}
      {isMobileMenuOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 99999,
        }}>
          {/* Arrière-plan */}
          <div 
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
            }}
            onClick={() => setIsMobileMenuOpen(false)}
          />
          
          {/* Sidebar Menu */}
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '280px',
            maxWidth: '85vw',
            height: '100%',
            backgroundColor: '#ffffff',
            boxShadow: '2px 0 10px rgba(0, 0, 0, 0.3)',
            display: 'flex',
            flexDirection: 'column',
          }}>
            {/* En-tête du menu */}
            <div style={{
              background: '#f8f9fa',
              color: '#333',
              padding: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '1.5rem' }}>{roleStyles.badgeIcon}</span>
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 'bold' }}>Menu Navigation</h3>
              </div>
              <button
                onClick={() => setIsMobileMenuOpen(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#333',
                  fontSize: '1.5rem',
                  cursor: 'pointer',
                  padding: '4px',
                }}
              >
                ✕
              </button>
            </div>

            {/* Info utilisateur */}
            <div style={{
              padding: '20px',
              borderBottom: '1px solid #e0e0e0',
              backgroundColor: '#f8f9fa',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                background: user?.avatarUrl ? 'transparent' : roleStyles.avatarGradient,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
                fontSize: '1.2rem',
                fontWeight: 'bold',
                boxShadow: '0 2px 6px rgba(0, 0, 0, 0.2)',
                overflow: 'hidden',
              }}
            >
              {user?.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={`${user.firstName} ${user.lastName}`}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                  }}
                />
              ) : (
                <>
                  {user?.firstName?.[0]}
                  {user?.lastName?.[0]}
                </>
              )}
            </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ 
                    margin: 0, 
                    fontWeight: 'bold', 
                    color: '#333',
                    fontSize: '0.9rem',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                    {user?.firstName} {user?.lastName}
                  </p>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    marginTop: '4px',
                  }}>
                    <div style={{
                      padding: '2px 8px',
                      borderRadius: '12px',
                      background: 'transparent',
                      color: '#666',
                      fontSize: '0.75rem',
                      fontWeight: 'bold',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      border: '1px solid #ddd',
                    }}>
                      <span>{roleStyles.badgeIcon}</span>
                      <span>{roleStyles.badgeText}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Navigation */}
            <nav style={{ flex: 1, padding: '10px 0', overflowY: 'auto' }}>
              {navigationItems.map((item) => {
                const isActive = location.pathname === item.to;
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    onClick={() => setIsMobileMenuOpen(false)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '16px 20px',
                      textDecoration: 'none',
                      color: isActive ? '#ff416c' : '#333',
                      backgroundColor: isActive ? '#fff5f5' : 'transparent',
                      borderLeft: isActive ? '4px solid #ff416c' : '4px solid transparent',
                      fontWeight: isActive ? 'bold' : 'normal',
                    }}
                  >
                    <span style={{ fontSize: '1.2rem' }}>{item.icon}</span>
                    <span style={{ fontSize: '1rem' }}>{item.label}</span>
                  </Link>
                );
              })}
              
              {/* Badge de notifications pour les organisateurs, humoristes et spectateurs dans le menu mobile */}
              {(user?.role === 'ORGANIZER' || user?.role === 'COMEDIAN' || user?.role === 'SPECTATOR' || user?.role === 'LIEU') && (
                <div style={{
                  padding: '16px 20px',
                  borderTop: '1px solid #e0e0e0',
                  borderBottom: '1px solid #e0e0e0',
                  backgroundColor: '#f8f9fa',
                }}>
                  <NotificationDropdown />
                </div>
              )}
            </nav>

            {/* Bouton Déconnexion */}
            <div style={{ padding: '20px', borderTop: '1px solid #e0e0e0' }}>
              <button
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  logout();
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  width: '100%',
                  padding: '16px',
                  background: 'linear-gradient(135deg, #dc3545, #c82333)',
                  border: 'none',
                  borderRadius: '8px',
                  color: '#ffffff',
                  fontSize: '1rem',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                }}
              >
                <span style={{ fontSize: '1.2rem' }}>🚪</span>
                <span>Déconnexion</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CSS Responsive Simple */}
      <style>{`
        @media (min-width: 768px) {
          #mobile-nav { display: none !important; }
          #desktop-nav { display: flex !important; }
          #desktop-user { display: block !important; }
        }
        @media (max-width: 767px) {
          #desktop-nav { display: none !important; }
          #desktop-user { display: none !important; }
          #mobile-nav { display: flex !important; }
        }
      `}</style>
    </>
  );
}

export default Navbar; 