import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

const VenuesTabs: React.FC = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { user } = useAuth();

  const isActive = (path: string) => pathname.startsWith(path);

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '10px 22px',
    background: active ? 'rgba(255,65,108,0.15)' : 'transparent',
    color: active ? '#ff416c' : '#aaa',
    border: active ? '1px solid rgba(255,65,108,0.35)' : '1px solid transparent',
    borderRadius: 24,
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: active ? 700 : 400,
    transition: 'all 0.15s',
    whiteSpace: 'nowrap' as const,
  });

  return (
    <div
      style={{
        display: 'flex',
        gap: 8,
        flexWrap: 'wrap',
        marginBottom: 32,
        padding: '6px 0',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        paddingBottom: 16,
      }}
    >
      <button style={tabStyle(isActive('/venues') && !isActive('/venues/new'))} onClick={() => navigate('/venues')}>
        🏛️ Salles
      </button>
      {user && (
        <button style={tabStyle(isActive('/my-bookings'))} onClick={() => navigate('/my-bookings')}>
          📋 Mes réservations
        </button>
      )}
      {(user?.role === 'ORGANIZER' || user?.role === 'LIEU') && (
        <button style={tabStyle(isActive('/my-venues'))} onClick={() => navigate('/my-venues')}>
          🏢 Mes salles
        </button>
      )}
    </div>
  );
};

export default VenuesTabs;
