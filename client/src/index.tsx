import React, { lazy, Suspense, useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import './index.css';
import './tailwind.css';
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { AlertProvider } from './contexts/AlertContext'
// import type { IUserData } from './types/user.ts'
import { SSEProvider } from './components/SSEProvider'

const Dashboard = lazy(() => import('./pages/Dashboard'))
const LoginPage = lazy(() => import('./pages/LoginPage'))
const Organisateur = lazy(() => import('./pages/LoginOrganisateur'))
const RegisterPage = lazy(() => import('./pages/RegisterPage'))
const RegisterSpectatorPage = lazy(() => import('./pages/RegisterSpectatorPage'))
const RegisterOrganizerPage = lazy(() => import('./pages/RegisterOrganizerPage'))
const MyEventsPage = lazy(() => import('./pages/MyEventsPage'))
const OrganizerProfilePage = lazy(() => import('./pages/OrganizerProfilePage'))
const ApplicationsPage = lazy(() => import('./pages/ApplicationsPage'))
const ComedianProfilePage = lazy(() => import('./pages/ComedianProfilePage'))
const ComedianDashboardPage = lazy(() => import('./pages/ComedianDashboardPage'))
const DirectoryPage = lazy(() => import('./pages/DirectoryPage'))
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage'))
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'))
const PasswordResetManagementPage = lazy(() => import('./pages/PasswordResetManagementPage'))
const PresenceAlertsPage = lazy(() => import('./pages/PresenceAlertsPage'))
const LateCancellationAlertsPage = lazy(() => import('./pages/LateCancellationAlertsPage'))
const ComedianReportsPage = lazy(() => import('./pages/ComedianReportsPage'))
const ProspectionPage = lazy(() => import('./pages/ProspectionPage'))
import LandingPage from './pages/LandingPage'
const OAuthCallback = lazy(() => import('./pages/OAuthCallback'))
const CalendarPage = lazy(() => import('./pages/CalendarPage'))
const SpectatorHomePage = lazy(() => import('./pages/SpectatorHomePage'))
const SpectatorEventsPage = lazy(() => import('./pages/SpectatorEventsPage'))
const SpectatorRateEventPage = lazy(() => import('./pages/SpectatorRateEventPage'))
const SpectatorProfilePage = lazy(() => import('./pages/SpectatorProfilePage'))
const LegalMentionsPage = lazy(() => import('./pages/LegalMentionsPage'))
const PrivacyPolicyPage = lazy(() => import('./pages/PrivacyPolicyPage'))
const TermsOfServicePage = lazy(() => import('./pages/TermsOfServicePage'))
const AboutPage = lazy(() => import('./pages/AboutPage'))
const AccountDeletionPage = lazy(() => import('./pages/AccountDeletionPage'))
const VenuesPage = lazy(() => import('./pages/VenuesPage'))
const VenueDetailPage = lazy(() => import('./pages/VenueDetailPage'))
const CreateVenuePage = lazy(() => import('./pages/CreateVenuePage'))
const MyVenuesPage = lazy(() => import('./pages/MyVenuesPage'))
const MyBookingsPage = lazy(() => import('./pages/MyBookingsPage'))
const MyInvoicesPage = lazy(() => import('./pages/MyInvoicesPage'))
const MesSallesPage = lazy(() => import('./pages/MesSallesPage'))
const LieuProfilePage = lazy(() => import('./pages/LieuProfilePage'))
const AidesHumourPage = lazy(() => import('./pages/AidesHumourPage'))
const AidesHumourAccueilPage = lazy(() => import('./pages/AidesHumourAccueilPage'))

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

const VenueAccessRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isLoading } = useAuth();
  if (isLoading) return null;
  if (user?.role !== 'ORGANIZER' && user?.role !== 'LIEU' && user?.role !== 'COMEDIAN') {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
};

const VenueOwnerRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isLoading } = useAuth();
  if (isLoading) return null;
  if (user?.role !== 'LIEU') return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
};

const RequireAuth: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isLoading } = useAuth();
  if (isLoading) return null;
  if (!user) {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
};

const ScrollToTop: React.FC = () => {
  const location = useLocation();
  useEffect(() => {
    const { pathname, hash } = location;
    if (hash && hash.length > 1) {
      const id = decodeURIComponent(hash.slice(1));
      requestAnimationFrame(() => {
        const el = document.getElementById(id);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        else window.scrollTo(0, 0);
      });
      return;
    }
    window.scrollTo(0, 0);
  }, [location.pathname, location.hash]);
  return null;
};

const LIEU_ALLOWED_PATHS = ['/my-venues-management', '/my-bookings', '/my-invoices', '/venues/new', '/dashboard', '/profile/lieu', '/aides', '/aides/accueil'];
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
      <Suspense fallback={
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
          <div style={{ width: 32, height: 32, border: '3px solid #e5e7eb', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        </div>
      }>
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
      <Route path="/prospection" element={<ProspectionPage />} />
      <Route path="/admin/password-resets" element={<PasswordResetManagementPage />} />
      <Route path="/admin/presence-alerts" element={<PresenceAlertsPage />} />
      <Route path="/admin/late-cancellations" element={<LateCancellationAlertsPage />} />
      <Route path="/admin/comedian-reports" element={<ComedianReportsPage />} />
      
<Route path="/calendar" element={<RequireAuth><CalendarPage/></RequireAuth>} />
      <Route path="/mentions-legales" element={<LegalMentionsPage />} />
      <Route path="/politique-confidentialite" element={<PrivacyPolicyPage />} />
      <Route path="/cgu" element={<TermsOfServicePage />} />
      <Route path="/a-propos" element={<AboutPage />} />
      <Route path="/suppression-compte" element={<AccountDeletionPage />} />
      <Route path="/venues" element={<VenueAccessRoute><VenuesPage /></VenueAccessRoute>} />
      <Route path="/venues/new" element={<VenueOwnerRoute><CreateVenuePage /></VenueOwnerRoute>} />
      <Route path="/venues/:venueId" element={<VenueAccessRoute><VenueDetailPage /></VenueAccessRoute>} />
      <Route path="/my-venues" element={<VenueOwnerRoute><MyVenuesPage /></VenueOwnerRoute>} />
      <Route path="/my-bookings" element={<VenueAccessRoute><MyBookingsPage /></VenueAccessRoute>} />
      <Route path="/my-invoices" element={<VenueAccessRoute><MyInvoicesPage /></VenueAccessRoute>} />
      <Route path="/my-venues-management" element={<VenueOwnerRoute><MesSallesPage /></VenueOwnerRoute>} />
      <Route path="/profile/lieu" element={<VenueOwnerRoute><LieuProfilePage /></VenueOwnerRoute>} />
      <Route path="/aides" element={<AidesHumourPage />} />
      <Route path="/aides/accueil" element={<AidesHumourAccueilPage />} />
    </Routes>
      </Suspense>
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
  // Attendre la fin de l'initialisation avant de prendre des décisions de routing
  if (isLoading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        background: 'var(--ccc-bg-gradient)',
      }}>
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-red-500"></div>
      </div>
    );
  }

  if (user?.role === 'ORGANIZER') {
    return <Dashboard />
  } else if (user?.role === 'COMEDIAN') {
    return <ComedianDashboardPage />
  } else if (user?.role === 'SUPER_ADMIN') {
    return <Dashboard /> // Pour l'instant, même interface que l'organisateur
  } else if (user?.role === 'SPECTATOR') {
    return <Navigate to="/spectateur" replace />
  } else if (user?.role === 'LIEU') {
    return <Navigate to="/my-venues-management" replace />
  }

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
