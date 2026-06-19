import { Navigate } from 'react-router-dom';
import Navbar from './Navbar';
import Footer from '../landing-aides/components/Footer';
import { useAuth } from '../hooks/useAuth';
import '../landing-aides/styles/aides-humour.css';

export default function AidesHumourLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

  if (!isLoading && user?.role === 'SUPER_ADMIN') {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div
      className="ah-page"
      style={{
        minHeight: '100vh',
        width: '100%',
        padding: '20px',
        paddingBottom: 60,
        boxSizing: 'border-box',
        background: 'var(--ccc-bg-gradient)',
        color: 'var(--ccc-text-primary)',
      }}
    >
      <Navbar />
      <main
        className="ah-page-main"
        style={{
          width: '100%',
          maxWidth: 1200,
          margin: '0 auto',
          padding: '40px 24px',
          boxSizing: 'border-box',
        }}
      >
        {children}
      </main>
      <Footer />
    </div>
  );
}
