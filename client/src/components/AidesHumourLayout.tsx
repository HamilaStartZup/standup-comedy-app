import Navbar from './Navbar';
import Footer from '../landing-aides/components/Footer';
import '../landing-aides/styles/aides-humour.css';

export default function AidesHumourLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="ah-page"
      style={{
        minHeight: '100vh',
        width: '100%',
        padding: '20px',
        paddingBottom: 60,
        boxSizing: 'border-box',
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
