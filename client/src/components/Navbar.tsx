import { type CSSProperties, useState, useEffect, useRef, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../hooks/useAuth';
import { listVenues } from '../services/api';
import { normalizeFilters } from '../hooks/useVenues';
import NotificationDropdown from './NotificationDropdown';
import { theme } from '../styles/theme';

function getProfilePathForRole(role: string | undefined): string | null {
  switch (role) {
    case 'ORGANIZER':
    case 'SUPER_ADMIN':
      return '/profile/organizer';
    case 'COMEDIAN':
      return '/profile/comedian';
    case 'SPECTATOR':
      return '/spectateur/profile';
    case 'LIEU':
      return '/profile/lieu';
    default:
      return null;
  }
}

function Navbar() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const queryClient = useQueryClient();

  const prefetchVenues = useCallback(() => {
    const filters = { page: 1, limit: 20 };
    queryClient.prefetchQuery({
      queryKey: ['venues', normalizeFilters(filters)],
      queryFn: () => listVenues(filters),
      staleTime: 60_000,
    });
  }, [queryClient]);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Fermer les menus quand on change de page
  useEffect(() => {
    setIsMobileMenuOpen(false);
    setIsUserMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!isUserMenuOpen) return;
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      const el = userMenuRef.current;
      if (!el) return;
      const target = e.target as Node;
      if (!el.contains(target)) setIsUserMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
    };
  }, [isUserMenuOpen]);

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
    color: theme.colors.text.primary,
    fontWeight: 'bold',
  };

  const activeLinkStyle: CSSProperties = {
    borderBottom: `2px solid ${theme.colors.accent.primary}`,
    paddingBottom: '2px',
  };

  const rightLinkStyle: CSSProperties = {
    margin: '0 10px',
    textDecoration: 'none',
    color: theme.colors.accent.primary,
    fontWeight: 'bold',
    border: 'none',
    background: 'none',
    cursor: 'pointer',
  };

  const userNameStyle: CSSProperties = {
    marginRight: '10px',
    color: theme.colors.text.primary,
    fontWeight: 'bold',
  };

  const sharedRoleStyles = {
    navbarBg: theme.colors.navbar.bg,
    badgeBg: theme.colors.bg.surface,
    badgeColor: theme.colors.text.primary,
    avatarGradient: theme.colors.bg.surfaceHover,
  };

  // Styles selon le rôle - uniquement texte et icône, pas de couleurs
  const getRoleStyles = () => {
    if (user?.role === 'ORGANIZER') {
      return {
        ...sharedRoleStyles,
        badgeIcon: '🎯',
        badgeText: 'Organisateur',
      };
    } else if (user?.role === 'COMEDIAN') {
      return {
        ...sharedRoleStyles,
        badgeIcon: '🎭',
        badgeText: 'Humoriste',
      };
    } else if (user?.role === 'SUPER_ADMIN') {
      return {
        ...sharedRoleStyles,
        badgeIcon: '👑',
        badgeText: 'Super Admin',
      };
    } else if (user?.role === 'SPECTATOR') {
      return {
        ...sharedRoleStyles,
        badgeIcon: '👥',
        badgeText: 'Spectateur',
      };
    } else if (user?.role === 'LIEU') {
      return {
        ...sharedRoleStyles,
        badgeIcon: '🏛️',
        badgeText: 'Lieu',
      };
    }
    return {
      ...sharedRoleStyles,
      badgeIcon: '👤',
      badgeText: 'Invité',
    };
  };

  const roleStyles = getRoleStyles();

  const aidesEntryPath = '/aides/accueil';
  const isAidesNavActive = location.pathname.startsWith('/aides');

  // Navigation items pour le menu mobile
  const getNavigationItems = () => {
    // LIEU : Mes Salles, Aides
    if (user?.role === 'LIEU') {
      return [
        { to: '/my-venues-management', label: 'Mes Salles', icon: '🏠', show: true },
        { to: aidesEntryPath, label: 'Aides', icon: '📚', show: true },
      ];
    }

    // Spectateur
    if (user?.role === 'SPECTATOR') {
      return [
        { to: '/spectateur', label: 'Accueil', icon: '🏠', show: true },
        { to: '/spectateur/events', label: 'Mes évènements', icon: '📅', show: true },
        { to: aidesEntryPath, label: 'Aides', icon: '📚', show: true },
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
      show: user?.role === 'ORGANIZER' || user?.role === 'COMEDIAN' || (user?.role as string) === 'LIEU'
    });

    if (user?.role === 'ORGANIZER') {
      items.push({
        to: aidesEntryPath,
        label: "Aides",
        icon: "📚",
        show: true
      });
    }

    if (user?.role === 'COMEDIAN') {
      items.push({
        to: aidesEntryPath,
        label: "Aides",
        icon: "📚",
        show: true
      });
    }

    if (user?.role === 'SUPER_ADMIN') {
      items.push({
        to: aidesEntryPath,
        label: "Aides",
        icon: "📚",
        show: true
      });
    }

    return items.filter(item => item.show);
  };

  const navigationItems = getNavigationItems();
  const profilePath = getProfilePathForRole(user?.role);

  return (
    <>
      {/* Navigation principale */}
      <nav style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '10px 20px',
        background: roleStyles.navbarBg,
        color: theme.colors.text.primary,
        boxShadow: theme.shadow.navbar,
        position: 'sticky',
        top: 0,
        zIndex: 1000,
        borderBottom: `1px solid ${theme.colors.navbar.border}`,
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      }}>
        {/* Menu Desktop - Masqué sur mobile */}
        <div style={{ display: 'flex', alignItems: 'center' }} id="desktop-nav">
          <h2 style={{ margin: '0', color: theme.colors.accent.primary, fontWeight: 700 }}>Connect Comedy Club</h2>
<div style={{ marginLeft: '30px' }}>
            {user?.role === 'SPECTATOR' ? (
              <>
                <Link to="/spectateur" style={{ ...navLinkBaseStyle, ...(location.pathname === '/spectateur' ? activeLinkStyle : {}) }}>Accueil</Link>
                <Link to="/spectateur/events" style={{ ...navLinkBaseStyle, ...(location.pathname === '/spectateur/events' ? activeLinkStyle : {}) }}>Mes'événements</Link>
                <Link to={aidesEntryPath} style={{ ...navLinkBaseStyle, ...(isAidesNavActive ? activeLinkStyle : {}) }}>Aides</Link>
              </>
            ) : user?.role === 'LIEU' ? (
              <>
                <Link to="/my-venues-management" style={{ ...navLinkBaseStyle, ...(location.pathname === '/my-venues-management' ? activeLinkStyle : {}) }}>Mes Salles</Link>
                <Link to={aidesEntryPath} style={{ ...navLinkBaseStyle, ...(isAidesNavActive ? activeLinkStyle : {}) }}>Aides</Link>
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
              <Link to="/venues" onMouseEnter={prefetchVenues} style={{ ...navLinkBaseStyle, ...(location.pathname.startsWith('/venues') || location.pathname === '/my-venues' || location.pathname === '/my-bookings' ? activeLinkStyle : {}) }}>Salles</Link>
            )}
            {user?.role === 'COMEDIAN' && (
              <Link to="/venues" onMouseEnter={prefetchVenues} style={{ ...navLinkBaseStyle, ...(location.pathname.startsWith('/venues') || location.pathname === '/my-bookings' ? activeLinkStyle : {}) }}>Salles</Link>
            )}
            {(user?.role === 'ORGANIZER' || user?.role === 'COMEDIAN' || user?.role === 'SUPER_ADMIN') && (
              <Link to={aidesEntryPath} style={{ ...navLinkBaseStyle, ...(isAidesNavActive ? activeLinkStyle : {}) }}>Aides</Link>
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
              color: theme.colors.text.primary,
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
            color: theme.colors.accent.primary, 
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
        <div id="desktop-user" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: '12px', position: 'relative' }}>
          {user && (
            <div ref={userMenuRef} style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => setIsUserMenuOpen((open) => !open)}
                aria-expanded={isUserMenuOpen}
                aria-haspopup="menu"
                aria-label="Menu compte utilisateur"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '6px 12px',
                  borderRadius: theme.radius.full,
                  background: roleStyles.badgeBg,
                  color: roleStyles.badgeColor,
                  fontSize: '0.85rem',
                  fontWeight: 'bold',
                  border: `1px solid ${theme.colors.border.medium}`,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                <span style={{ fontSize: '1rem' }}>{roleStyles.badgeIcon}</span>
                <span>{roleStyles.badgeText}</span>
                <span style={{ color: theme.colors.text.muted, margin: '0 4px' }}>|</span>
                <span style={{ color: theme.colors.text.primary }}>{`${user.firstName} ${user.lastName}`}</span>
                <span style={{ fontSize: '0.65rem', marginLeft: '4px', opacity: 0.85 }} aria-hidden>▼</span>
              </button>
              {isUserMenuOpen && (
                <div
                  role="menu"
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 6px)',
                    right: 0,
                    minWidth: '220px',
                    background: theme.colors.bg.elevated,
                    border: `1px solid ${theme.colors.border.subtle}`,
                    borderRadius: theme.radius.md,
                    boxShadow: theme.shadow.dropdown,
                    zIndex: 2000,
                    overflow: 'hidden',
                  }}
                >
                  {profilePath && (
                    <Link
                      to={profilePath}
                      role="menuitem"
                      onClick={() => setIsUserMenuOpen(false)}
                      style={{
                        display: 'block',
                        padding: '14px 16px',
                        color: theme.colors.text.primary,
                        textDecoration: 'none',
                        fontWeight: 'bold',
                        fontSize: '0.95rem',
                        borderBottom: `1px solid ${theme.colors.border.subtle}`,
                      }}
                    >
                      Profil
                    </Link>
                  )}
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setIsUserMenuOpen(false);
                      logout();
                    }}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      padding: '14px 16px',
                      color: theme.colors.accent.primary,
                      fontWeight: 'bold',
                      fontSize: '0.95rem',
                      border: 'none',
                      background: 'transparent',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    Déconnexion
                  </button>
                </div>
              )}
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {(user?.role === 'ORGANIZER' || user?.role === 'COMEDIAN' || user?.role === 'SPECTATOR' || user?.role === 'LIEU') && <NotificationDropdown />}
            {!user && <span style={userNameStyle}>Invité</span>}
            {!user && (
              <button type="button" onClick={logout} style={rightLinkStyle}>
                Déconnexion
              </button>
            )}
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
                      borderRadius: theme.radius.md,
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
                const isActive =
                  item.to === aidesEntryPath
                    ? isAidesNavActive
                    : location.pathname === item.to;
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
                      color: isActive ? theme.colors.accent.primary : '#333',
                      backgroundColor: isActive ? '#fff5f5' : 'transparent',
                      borderLeft: isActive ? `4px solid ${theme.colors.accent.primary}` : '4px solid transparent',
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
                  borderRadius: theme.radius.sm,
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
          #desktop-user { display: flex !important; flex-direction: row; align-items: center; justify-content: flex-end; gap: 12px; }
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