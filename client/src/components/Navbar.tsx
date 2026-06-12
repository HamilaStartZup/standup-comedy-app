import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../hooks/useAuth';
import { listVenues } from '../services/api';
import { normalizeFilters } from '../hooks/useVenues';
import NotificationDropdown from './NotificationDropdown';
import { theme } from '../styles/theme';

const NAVBAR_CSS = `
  .app-navbar { --primary: #7c3aed; --text-primary: #1e293b; --text-secondary: #475569; --bg-light: rgba(15, 23, 42, 0.05); --border: rgba(15, 23, 42, 0.08); --shadow-lg: 0 10px 15px rgba(15, 23, 42, 0.1); box-sizing: border-box; }
  .app-navbar *, .app-navbar *::before, .app-navbar *::after { box-sizing: border-box; }
  .app-navbar { padding: 16px 0; padding-top: max(16px, env(safe-area-inset-top)); position: sticky; top: 0; left: 0; right: 0; background: rgba(255, 255, 255, 0.88); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); z-index: 1000; border-bottom: 1px solid var(--border); font-family: 'Sora', -apple-system, BlinkMacSystemFont, sans-serif; }
  .app-navbar .navbar-container { max-width: 1280px; margin: 0 auto; padding: 0 24px; }
  .app-navbar .header-content { display: flex; justify-content: space-between; align-items: center; gap: 12px; min-height: 48px; }
  .app-navbar .logo { display: flex; align-items: center; text-decoration: none; flex-shrink: 0; border: none; background: transparent; padding: 0; cursor: pointer; }
  .app-navbar .logo img { height: 72px; width: auto; display: block; max-width: min(200px, 40vw); object-fit: contain; }
  .app-navbar .header-nav { display: flex; gap: 24px; align-items: center; flex: 1; justify-content: center; margin: 0 16px; }
  .app-navbar .nav-link { color: var(--text-secondary); text-decoration: none; font-weight: 600; font-size: 15px; transition: color 0.2s; white-space: nowrap; }
  .app-navbar .nav-link:hover, .app-navbar .nav-link.is-active { color: var(--primary); }
  .app-navbar .header-actions { display: flex; align-items: center; gap: 12px; flex-shrink: 0; }
  .app-navbar .user-menu-btn { display: flex; align-items: center; gap: 8px; padding: 8px 14px; border-radius: 12px; background: var(--bg-light); color: var(--text-primary); font-size: 14px; font-weight: 600; border: 1px solid var(--border); cursor: pointer; font-family: inherit; max-width: 280px; }
  .app-navbar .user-menu-btn span.user-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .app-navbar .user-dropdown { position: absolute; top: calc(100% + 8px); right: 0; min-width: 220px; background: #fff; border: 1px solid var(--border); border-radius: 12px; box-shadow: var(--shadow-lg); z-index: 2000; overflow: hidden; }
  .app-navbar .user-dropdown a, .app-navbar .user-dropdown button { display: block; width: 100%; text-align: left; padding: 14px 16px; color: var(--text-primary); text-decoration: none; font-weight: 600; font-size: 15px; border: none; background: transparent; cursor: pointer; font-family: inherit; }
  .app-navbar .user-dropdown a { border-bottom: 1px solid var(--border); }
  .app-navbar .user-dropdown a:hover, .app-navbar .user-dropdown button:hover { background: var(--bg-light); color: var(--primary); }
  .app-navbar .user-dropdown button { color: var(--primary); }
  .app-navbar .user-menu-wrap { position: relative; }
  .app-navbar .mobile-header-actions { display: none; align-items: center; gap: 8px; flex-shrink: 0; }
  .app-navbar .mobile-menu-btn { display: none; align-items: center; justify-content: center; width: 44px; height: 44px; padding: 0; border: 1.5px solid var(--border); border-radius: 12px; background: white; cursor: pointer; flex-shrink: 0; -webkit-tap-highlight-color: transparent; }
  .app-navbar .mobile-menu-btn span { display: block; width: 20px; height: 2px; background: var(--text-primary); border-radius: 2px; position: relative; transition: background 0.2s; }
  .app-navbar .mobile-menu-btn span::before, .app-navbar .mobile-menu-btn span::after { content: ''; position: absolute; left: 0; width: 20px; height: 2px; background: var(--text-primary); border-radius: 2px; transition: transform 0.25s ease, top 0.25s ease; }
  .app-navbar .mobile-menu-btn span::before { top: -6px; }
  .app-navbar .mobile-menu-btn span::after { top: 6px; }
  .app-navbar .mobile-menu-btn.is-open span { background: transparent; }
  .app-navbar .mobile-menu-btn.is-open span::before { top: 0; transform: rotate(45deg); }
  .app-navbar .mobile-menu-btn.is-open span::after { top: 0; transform: rotate(-45deg); }
  .app-navbar .mobile-nav-backdrop { display: none; position: fixed; inset: 0; background: rgba(15, 23, 42, 0.4); z-index: 998; opacity: 0; pointer-events: none; transition: opacity 0.25s ease; }
  .app-navbar .mobile-nav-backdrop.is-open { opacity: 1; pointer-events: auto; }
  .app-navbar .mobile-nav { display: none; position: fixed; top: 0; left: 0; right: 0; z-index: 999; background: rgba(255, 255, 255, 0.98); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); border-bottom: 1px solid var(--border); box-shadow: var(--shadow-lg); padding: calc(72px + env(safe-area-inset-top)) 20px calc(24px + env(safe-area-inset-bottom)); flex-direction: column; gap: 4px; max-height: 100dvh; overflow-y: auto; -webkit-overflow-scrolling: touch; transform: translateY(-8px); opacity: 0; pointer-events: none; transition: transform 0.25s ease, opacity 0.25s ease; }
  .app-navbar .mobile-nav.is-open { transform: translateY(0); opacity: 1; pointer-events: auto; }
  .app-navbar .mobile-user-card { display: flex; align-items: center; gap: 12px; padding: 12px 16px; margin-bottom: 8px; background: var(--bg-light); border-radius: 12px; border: 1px solid var(--border); }
  .app-navbar .mobile-user-avatar { width: 44px; height: 44px; border-radius: 12px; background: linear-gradient(135deg, #7c3aed, #a78bfa); display: flex; align-items: center; justify-content: center; color: #fff; font-weight: 700; font-size: 14px; overflow: hidden; flex-shrink: 0; }
  .app-navbar .mobile-user-avatar img { width: 100%; height: 100%; object-fit: cover; }
  .app-navbar .mobile-user-info { min-width: 0; flex: 1; }
  .app-navbar .mobile-user-name { margin: 0; font-weight: 700; font-size: 15px; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .app-navbar .mobile-user-role { margin: 2px 0 0; font-size: 13px; color: var(--text-secondary); font-weight: 600; }
  .app-navbar .mobile-nav-link { display: flex; align-items: center; gap: 10px; padding: 14px 16px; color: var(--text-primary); text-decoration: none; font-weight: 600; font-size: 16px; border-radius: 12px; transition: background 0.2s, color 0.2s; -webkit-tap-highlight-color: transparent; border: none; background: transparent; width: 100%; text-align: left; font-family: inherit; cursor: pointer; }
  .app-navbar .mobile-nav-link:hover, .app-navbar .mobile-nav-link.is-active { background: var(--bg-light); color: var(--primary); }
  .app-navbar .mobile-nav-divider { height: 1px; background: var(--border); margin: 8px 0; }
  .app-navbar .mobile-nav-actions { display: flex; flex-direction: column; gap: 10px; margin-top: 8px; }
  .app-navbar .btn-nav { padding: 14px 20px; border-radius: 12px; border: none; cursor: pointer; font-weight: 600; font-size: 15px; text-decoration: none; display: inline-flex; align-items: center; justify-content: center; font-family: inherit; width: 100%; transition: all 0.2s; }
  .app-navbar .btn-nav-primary { background: linear-gradient(135deg, #7c3aed 0%, #a78bfa 100%); color: white; box-shadow: 0 4px 12px rgba(124, 58, 237, 0.3); }
  .app-navbar .btn-nav-secondary { background: transparent; color: var(--text-primary); border: 2px solid rgba(15, 23, 42, 0.14); }
  .app-navbar .mobile-notifications { padding: 8px 16px; }
  @media (max-width: 968px) {
    .app-navbar { padding: 10px 0; padding-top: max(10px, env(safe-area-inset-top)); }
    .app-navbar .navbar-container { padding: 0 16px; }
    .app-navbar .logo img { height: 52px; max-width: 160px; }
    .app-navbar .header-nav, .app-navbar .header-actions { display: none !important; }
    .app-navbar .mobile-header-actions, .app-navbar .mobile-menu-btn, .app-navbar .mobile-nav-backdrop, .app-navbar .mobile-nav { display: flex; }
  }
`;

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

function getHomePath(role: string | undefined): string {
  if (role === 'SPECTATOR') return '/spectateur';
  if (role === 'LIEU') return '/my-venues-management';
  return '/dashboard';
}

function getRoleBadge(role: string | undefined) {
  switch (role) {
    case 'ORGANIZER': return { icon: '🎯', text: 'Organisateur' };
    case 'COMEDIAN': return { icon: '🎭', text: 'Humoriste' };
    case 'SUPER_ADMIN': return { icon: '👑', text: 'Super Admin' };
    case 'SPECTATOR': return { icon: '👥', text: 'Spectateur' };
    case 'LIEU': return { icon: '🏛️', text: 'Lieu' };
    default: return { icon: '👤', text: 'Invité' };
  }
}

function Navbar() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const closeMobileMenu = () => setIsMobileMenuOpen(false);

  const prefetchVenues = useCallback(() => {
    const filters = { page: 1, limit: 20 };
    queryClient.prefetchQuery({
      queryKey: ['venues', normalizeFilters(filters)],
      queryFn: () => listVenues(filters),
      staleTime: 60_000,
    });
  }, [queryClient]);

  useEffect(() => {
    setIsMobileMenuOpen(false);
    setIsUserMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!isUserMenuOpen) return;
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      const el = userMenuRef.current;
      if (!el?.contains(e.target as Node)) setIsUserMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
    };
  }, [isUserMenuOpen]);

  useEffect(() => {
    if (!isMobileMenuOpen) return;
    const onEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') closeMobileMenu(); };
    window.addEventListener('keydown', onEscape);
    return () => window.removeEventListener('keydown', onEscape);
  }, [isMobileMenuOpen]);

  useEffect(() => {
    document.body.style.overflow = isMobileMenuOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isMobileMenuOpen]);

  const aidesEntryPath = '/aides/accueil';
  const isAidesNavActive = location.pathname.startsWith('/aides');
  const roleBadge = getRoleBadge(user?.role);
  const profilePath = getProfilePathForRole(user?.role);
  const homePath = getHomePath(user?.role);
  const showNotifications = user?.role === 'ORGANIZER' || user?.role === 'COMEDIAN' || user?.role === 'SPECTATOR' || user?.role === 'LIEU';

  const isLinkActive = (to: string) => {
    if (to === aidesEntryPath) return isAidesNavActive;
    if (to === '/venues') {
      return location.pathname.startsWith('/venues') || location.pathname === '/my-venues' || location.pathname === '/my-bookings';
    }
    return location.pathname === to;
  };

  const getNavigationItems = () => {
    if (user?.role === 'LIEU') {
      return [
        { to: '/my-venues-management', label: 'Mes Salles', icon: '🏠' },
        { to: aidesEntryPath, label: 'Aides', icon: '📚' },
      ];
    }
    if (user?.role === 'SPECTATOR') {
      return [
        { to: '/spectateur', label: 'Accueil', icon: '🏠' },
        { to: '/spectateur/events', label: 'Mes évènements', icon: '📅' },
        { to: aidesEntryPath, label: 'Aides', icon: '📚' },
      ];
    }

    const items = [
      { to: '/dashboard', label: 'Accueil', icon: '🏠' },
      { to: '/events', label: user?.role === 'ORGANIZER' ? 'Mes Évènements' : 'Évènements', icon: '📅' },
      { to: '/calendar', label: 'Calendrier', icon: '🗓️' },
    ];

    if (user?.role !== 'SUPER_ADMIN') {
      items.push({ to: '/applications', label: 'Candidatures', icon: '📝' });
    }
    if (user?.role === 'SUPER_ADMIN') {
      items.push({ to: '/directory', label: 'Répertoire', icon: '👥' });
    }
    if (user?.role === 'ORGANIZER' || user?.role === 'COMEDIAN') {
      items.push({ to: '/venues', label: 'Salles', icon: '🏛️' });
    }
    if (user?.role === 'ORGANIZER' || user?.role === 'COMEDIAN' || user?.role === 'SUPER_ADMIN') {
      items.push({ to: aidesEntryPath, label: 'Aides', icon: '📚' });
    }

    return items;
  };

  const navigationItems = getNavigationItems();

  const renderDesktopNavLinks = () => {
    if (user?.role === 'SPECTATOR') {
      return (
        <>
          <Link to="/spectateur" className={`nav-link${location.pathname === '/spectateur' ? ' is-active' : ''}`}>Accueil</Link>
          <Link to="/spectateur/events" className={`nav-link${location.pathname === '/spectateur/events' ? ' is-active' : ''}`}>Mes évènements</Link>
          <Link to={aidesEntryPath} className={`nav-link${isAidesNavActive ? ' is-active' : ''}`}>Aides</Link>
        </>
      );
    }
    if (user?.role === 'LIEU') {
      return (
        <>
          <Link to="/my-venues-management" className={`nav-link${location.pathname === '/my-venues-management' ? ' is-active' : ''}`}>Mes Salles</Link>
          <Link to={aidesEntryPath} className={`nav-link${isAidesNavActive ? ' is-active' : ''}`}>Aides</Link>
        </>
      );
    }
    return (
      <>
        <Link to="/dashboard" className={`nav-link${location.pathname === '/dashboard' ? ' is-active' : ''}`}>Accueil</Link>
        <Link to="/events" className={`nav-link${location.pathname === '/events' ? ' is-active' : ''}`}>
          {user?.role === 'ORGANIZER' ? 'Mes Évènements' : 'Évènements'}
        </Link>
        <Link to="/calendar" className={`nav-link${location.pathname === '/calendar' ? ' is-active' : ''}`}>Calendrier</Link>
        {user?.role !== 'SUPER_ADMIN' && (
          <Link to="/applications" className={`nav-link${location.pathname === '/applications' ? ' is-active' : ''}`}>Candidatures</Link>
        )}
        {user?.role === 'SUPER_ADMIN' && (
          <Link to="/directory" className={`nav-link${location.pathname === '/directory' ? ' is-active' : ''}`}>Répertoire</Link>
        )}
        {user?.role === 'ORGANIZER' && (
          <Link to="/venues" onMouseEnter={prefetchVenues} className={`nav-link${isLinkActive('/venues') ? ' is-active' : ''}`}>Salles</Link>
        )}
        {user?.role === 'COMEDIAN' && (
          <Link to="/venues" onMouseEnter={prefetchVenues} className={`nav-link${isLinkActive('/venues') ? ' is-active' : ''}`}>Salles</Link>
        )}
        {(user?.role === 'ORGANIZER' || user?.role === 'COMEDIAN' || user?.role === 'SUPER_ADMIN') && (
          <Link to={aidesEntryPath} className={`nav-link${isAidesNavActive ? ' is-active' : ''}`}>Aides</Link>
        )}
      </>
    );
  };

  return (
    <>
      <style>{NAVBAR_CSS}</style>
      <header className="app-navbar">
        <div className="navbar-container">
          <div className="header-content">
            <Link to={homePath} className="logo" aria-label="Accueil Connect Comedy Club">
              <img src="/logo-connect-comedy-club.png" alt="Connect Comedy Club" />
            </Link>

            <nav className="header-nav" aria-label="Navigation principale">
              {renderDesktopNavLinks()}
            </nav>

            <div className="header-actions">
              {showNotifications && <NotificationDropdown />}
              {user ? (
                <div className="user-menu-wrap" ref={userMenuRef}>
                  <button
                    type="button"
                    className="user-menu-btn"
                    onClick={() => setIsUserMenuOpen((open) => !open)}
                    aria-expanded={isUserMenuOpen}
                    aria-haspopup="menu"
                    aria-label="Menu compte utilisateur"
                  >
                    <span>{roleBadge.icon}</span>
                    <span className="user-name">{user.firstName} {user.lastName}</span>
                    <span aria-hidden style={{ fontSize: '10px', color: theme.colors.text.muted }}>▼</span>
                  </button>
                  {isUserMenuOpen && (
                    <div className="user-dropdown" role="menu">
                      {profilePath && (
                        <Link to={profilePath} role="menuitem" onClick={() => setIsUserMenuOpen(false)}>
                          Profil
                        </Link>
                      )}
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => { setIsUserMenuOpen(false); logout(); }}
                      >
                        Déconnexion
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <button type="button" className="btn-nav btn-nav-secondary" onClick={logout} style={{ width: 'auto' }}>
                  Déconnexion
                </button>
              )}
            </div>

            <div className="mobile-header-actions">
              {showNotifications && <NotificationDropdown />}
              <button
                type="button"
                className={`mobile-menu-btn${isMobileMenuOpen ? ' is-open' : ''}`}
                onClick={() => setIsMobileMenuOpen((open) => !open)}
                aria-label={isMobileMenuOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
                aria-expanded={isMobileMenuOpen}
                aria-controls="app-mobile-nav"
              >
                <span />
              </button>
            </div>
          </div>
        </div>

        <div
          className={`mobile-nav-backdrop${isMobileMenuOpen ? ' is-open' : ''}`}
          onClick={closeMobileMenu}
          aria-hidden="true"
        />

        <nav
          id="app-mobile-nav"
          className={`mobile-nav${isMobileMenuOpen ? ' is-open' : ''}`}
          aria-label="Menu mobile"
          aria-hidden={!isMobileMenuOpen}
        >
        {user && (
          <div className="mobile-user-card">
            <div className="mobile-user-avatar">
              {user.avatarUrl ? (
                <img src={user.avatarUrl} alt="" />
              ) : (
                <>{user.firstName?.[0]}{user.lastName?.[0]}</>
              )}
            </div>
            <div className="mobile-user-info">
              <p className="mobile-user-name">{user.firstName} {user.lastName}</p>
              <p className="mobile-user-role">{roleBadge.icon} {roleBadge.text}</p>
            </div>
          </div>
        )}

        {navigationItems.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className={`mobile-nav-link${isLinkActive(item.to) ? ' is-active' : ''}`}
            onClick={closeMobileMenu}
            onMouseEnter={item.to === '/venues' ? prefetchVenues : undefined}
          >
            <span aria-hidden>{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        ))}

        <div className="mobile-nav-divider" />

        <div className="mobile-nav-actions">
          {profilePath && (
            <Link to={profilePath} className="btn-nav btn-nav-secondary" onClick={closeMobileMenu}>
              Mon profil
            </Link>
          )}
          <button
            type="button"
            className="btn-nav btn-nav-primary"
            onClick={() => { closeMobileMenu(); logout(); }}
          >
            Déconnexion
          </button>
        </div>
        </nav>
      </header>
    </>
  );
}

export default Navbar;
