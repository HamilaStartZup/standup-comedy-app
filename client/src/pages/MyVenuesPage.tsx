import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import VenueCard from '../components/VenueCard';
import Navbar from '../components/Navbar';
import VenuesTabs from '../components/VenuesTabs';
import { useMyVenues } from '../hooks/useMyVenues';
import MyVenueCardSkeleton from '../components/skeletons/MyVenueCardSkeleton';

const MyVenuesPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const { data: venuesResponse, isLoading, error } = useMyVenues(user?._id);
  const myVenues = venuesResponse?.venues ?? [];

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(to bottom right, #1a1a2e, #331f41)', paddingBottom: 60, padding: '20px' }}>
      <style>{`
        @media (max-width: 640px) {
          .my-venues-header h1 { font-size: 1.8em !important; }
          .my-venues-add-btn { width: 100%; }
        }
      `}</style>
      <Navbar />

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '40px 24px' }}>
        {/* Header */}
        <div className="my-venues-header" style={{ marginBottom: 24 }}>
          <h1 style={{ margin: '0 0 8px 0', fontSize: '2.5em', fontWeight: 800, color: '#ff416c' }}>
            Salles
          </h1>
          <p style={{ margin: 0, fontSize: '1.1em', color: '#aaa' }}>
            Gérez vos salles et les demandes de réservation.
          </p>
        </div>

        <VenuesTabs />

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 24 }}>
          <button
            className="my-venues-add-btn"
            onClick={() => navigate('/venues/new')}
            style={{
              padding: '12px 28px',
              background: 'linear-gradient(135deg, #ff416c 0%, #ff4b2b 100%)',
              color: '#fff',
              border: 'none',
              borderRadius: 12,
              fontWeight: 700,
              fontSize: 15,
              cursor: 'pointer',
              boxShadow: '0 4px 16px rgba(255,65,108,0.3)',
            }}
          >
            + Ajouter une salle
          </button>
        </div>

        {isLoading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 24 }}>
            {Array.from({ length: 3 }).map((_, i) => <MyVenueCardSkeleton key={i} />)}
          </div>
        ) : error ? (
          <div style={{ textAlign: 'center', padding: 60 }}>
            <p style={{ color: '#ef4444' }}>Impossible de charger vos salles.</p>
          </div>
        ) : myVenues.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '64px 24px',
              border: '1px dashed rgba(255,255,255,0.1)',
              borderRadius: 20,
            }}
          >
            <div style={{ fontSize: 60, marginBottom: 20 }}>🏛️</div>
            <h3 style={{ color: '#fff', fontSize: 22, marginBottom: 10 }}>Aucune salle pour le moment</h3>
            <p style={{ color: '#888', fontSize: 15, marginBottom: 28, maxWidth: 400, margin: '0 auto 28px' }}>
              Ajoutez votre première salle pour commencer à recevoir des demandes de réservation.
            </p>
            <button
              onClick={() => navigate('/venues/new')}
              style={{
                padding: '14px 32px',
                background: 'linear-gradient(135deg, #ff416c 0%, #ff4b2b 100%)',
                color: '#fff',
                border: 'none',
                borderRadius: 12,
                fontWeight: 700,
                fontSize: 15,
                cursor: 'pointer',
              }}
            >
              Ajouter ma première salle
            </button>
          </div>
        ) : (
          <>
            <p style={{ color: '#888', fontSize: 14, marginBottom: 24 }}>
              {myVenues.length} salle{myVenues.length > 1 ? 's' : ''}
            </p>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: 24,
              }}
            >
              {myVenues.map((venue) => (
                <VenueCard key={venue._id} venue={venue} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default MyVenuesPage;
