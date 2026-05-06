import React, { useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import './index.css';
import Dashboard from './pages/Dashboard'
import LoginPage from './pages/LoginPage'
import Organisateur from './pages/LoginOrganisateur'
import RegisterPage from './pages/RegisterPage'
import RegisterSpectatorPage from './pages/RegisterSpectatorPage'
import RegisterOrganizerPage from './pages/RegisterOrganizerPage'
import MyEventsPage from './pages/MyEventsPage'
import OrganizerProfilePage from './pages/OrganizerProfilePage'
import ApplicationsPage from './pages/ApplicationsPage'
import ComedianProfilePage from './pages/ComedianProfilePage'
import ComedianDashboardPage from './pages/ComedianDashboardPage'
import DirectoryPage from './pages/DirectoryPage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import PasswordResetManagementPage from './pages/PasswordResetManagementPage'
import PresenceAlertsPage from './pages/PresenceAlertsPage'
import LateCancellationAlertsPage from './pages/LateCancellationAlertsPage'
import ComedianReportsPage from './pages/ComedianReportsPage'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { AlertProvider } from './contexts/AlertContext'
// import type { IUserData } from './types/user.ts'
import LandingPage from './pages/LandingPage'
import OAuthCallback from './pages/OAuthCallback'
import { SSEProvider } from './components/SSEProvider'
import CalendarPage from './pages/CalendarPage';
import SpectatorHomePage from './pages/SpectatorHomePage';
import SpectatorEventsPage from './pages/SpectatorEventsPage';
import SpectatorRateEventPage from './pages/SpectatorRateEventPage';
import SpectatorProfilePage from './pages/SpectatorProfilePage';
import LegalMentionsPage from './pages/LegalMentionsPage';
import PrivacyPolicyPage from './pages/PrivacyPolicyPage';
import TermsOfServicePage from './pages/TermsOfServicePage';
import AboutPage from './pages/AboutPage';
import VenuesPage from './pages/VenuesPage';
import VenueDetailPage from './pages/VenueDetailPage';
import CreateVenuePage from './pages/CreateVenuePage';
import MyVenuesPage from './pages/MyVenuesPage';
import MyBookingsPage from './pages/MyBookingsPage';
import MesSallesPage from './pages/MesSallesPage';
import LieuProfilePage from './pages/LieuProfilePage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 2 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

const RedirectSpectatorEvents: React.FC = () => {
  const { search } = useLocation();
  return <Navigate to={`/spectateur/events${search}`} replace />;
};

const VenueOwnerRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isLoading } = useAuth();
  if (isLoading) return null;
  if (user?.role !== 'ORGANIZER' && user?.role !== 'LIEU') return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
};

const ScrollToTop: React.FC = () => {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
};

const LIEU_ALLOWED_PATHS = ['/my-venues-management', '/my-bookings', '/venues/new', '/dashboard', '/profile/lieu'];
const PUBLIC_PATHS = ['/', '/login', '/register', '/organisateur', '/forgot-password',
  '/reset-password', '/auth/callback', '/mentions-legales', '/politique-confidentialite',
  '/cgu', '/a-propos'];

const LieuRedirectGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isLoading } = useAuth();
  const location = useLocation();
  if (isLoading || !user || user.role !== 'LIEU') return <>{children}</>;

  const path = location.pathname;
  const isPublic = PUBLIC_PATHS.some(p => p === '/' ? path === '/' : path.startsWith(p));
  if (isPublic) return <>{children}</>;

  const isAllowed = LIEU_ALLOWED_PATHS.includes(path)
    || /^\/venues\/[a-f0-9]{24}$/.test(path);
  if (!isAllowed) return <Navigate to="/my-venues-management" replace />;
  return <>{children}</>;
};

const AppRouter: React.FC = () => {
  return (
    <LieuRedirectGuard>
      <ScrollToTop />
      <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/organisateur" element={<Organisateur />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/register/spectateur" element={<RegisterSpectatorPage />} />
      <Route path="/register/organisateur" element={<RegisterOrganizerPage />} />
      <Route path="/register/lieu" element={<Navigate to="/register?role=LIEU" replace />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/auth/callback" element={<OAuthCallback />} />
      <Route path="/dashboard" element={<DashboardRouter />} />
      <Route path="/spectateur" element={<SpectatorHomePage />} />
      <Route path="/spectateur/events" element={<SpectatorEventsPage />} />
      <Route path="/spectateur/events/rate/:eventId" element={<SpectatorRateEventPage />} />
      <Route path="/spectator/events" element={<RedirectSpectatorEvents />} />
      <Route path="/spectateur/profile" element={<SpectatorProfilePage />} />
      <Route path="/events" element={<MyEventsPage />} />
      <Route path="/profile/organizer" element={<OrganizerProfilePage />} />
      <Route path="/applications" element={<ApplicationsPage />} />
      <Route path="/profile/comedian/:id" element={<ComedianProfilePage />} />
      <Route path="/profile/comedian" element={<ComedianProfilePage />} />
      <Route path="/directory" element={<DirectoryPage />} />
      <Route path="/admin/password-resets" element={<PasswordResetManagementPage />} />
      <Route path="/admin/presence-alerts" element={<PresenceAlertsPage />} />
      <Route path="/admin/late-cancellations" element={<LateCancellationAlertsPage />} />
      <Route path="/admin/comedian-reports" element={<ComedianReportsPage />} />
      
<Route path="/calendar" element={<CalendarPage/>} />
      <Route path="/mentions-legales" element={<LegalMentionsPage />} />
      <Route path="/politique-confidentialite" element={<PrivacyPolicyPage />} />
      <Route path="/cgu" element={<TermsOfServicePage />} />
      <Route path="/a-propos" element={<AboutPage />} />
      <Route path="/venues" element={<VenueOwnerRoute><VenuesPage /></VenueOwnerRoute>} />
      <Route path="/venues/new" element={<VenueOwnerRoute><CreateVenuePage /></VenueOwnerRoute>} />
      <Route path="/venues/:venueId" element={<VenueOwnerRoute><VenueDetailPage /></VenueOwnerRoute>} />
      <Route path="/my-venues" element={<VenueOwnerRoute><MyVenuesPage /></VenueOwnerRoute>} />
      <Route path="/my-bookings" element={<VenueOwnerRoute><MyBookingsPage /></VenueOwnerRoute>} />
      <Route path="/my-venues-management" element={<VenueOwnerRoute><MesSallesPage /></VenueOwnerRoute>} />
      <Route path="/profile/lieu" element={<VenueOwnerRoute><LieuProfilePage /></VenueOwnerRoute>} />
    </Routes>
    </LieuRedirectGuard>
  );
};

// const HomeRedirect = ({ token, user }: { token: string | null; user: IUserData | null }) => {
//   if (!token) {
//     return <Navigate to="/login" replace />
//   }

//   if (user?.role === 'ORGANIZER') {
//     return <Navigate to="/dashboard" replace />
//   } else if (user?.role === 'COMEDIAN') {
//     return <Navigate to="/comedian-dashboard" replace />
//   } else if (user?.role === 'SUPER_ADMIN') {
//     return <Navigate to="/dashboard" replace />
//   }

//   return <Navigate to="/login" replace />
// };

const DashboardRouter = () => {
  const { user, isLoading } = useAuth()
  console.log("🏠 DashboardRouter - Utilisateur:", user?.email, "Rôle:", user?.role, "Loading:", isLoading);

  // Attendre la fin de l'initialisation avant de prendre des décisions de routing
  if (isLoading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        background: 'linear-gradient(to bottom right, #1a1a2e, #331f41)',
      }}>
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-red-500"></div>
      </div>
    );
  }

  if (user?.role === 'ORGANIZER') {
    console.log("📊 Chargement dashboard ORGANIZER");
    return <Dashboard />
  } else if (user?.role === 'COMEDIAN') {
    console.log("🎭 Chargement dashboard COMEDIAN");
    return <ComedianDashboardPage />
  } else if (user?.role === 'SUPER_ADMIN') {
    console.log("🔥 Chargement dashboard SUPER_ADMIN");
    return <Dashboard /> // Pour l'instant, même interface que l'organisateur
  } else if (user?.role === 'SPECTATOR') {
    return <Navigate to="/spectateur" replace />
  } else if (user?.role === 'LIEU') {
    return <Navigate to="/my-venues-management" replace />
  }

  console.log("❌ Aucun rôle reconnu, redirection vers login");
  return <Navigate to="/login" replace />
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <Router>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AlertProvider>
          <SSEProvider>
            <AppRouter />
          </SSEProvider>
        </AlertProvider>
      </AuthProvider>
    </QueryClientProvider>
  </Router>,
)
