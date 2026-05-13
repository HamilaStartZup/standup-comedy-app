import Navbar from './Navbar';
import Header from '../landing-aides/components/Header';
import Footer from '../landing-aides/components/Footer';
import '../landing-aides/styles/aides-humour.css';

export default function AidesHumourLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="ah-page">
      <Navbar />
      <Header />
      <main className="w-full">{children}</main>
      <Footer />
    </div>
  );
}
