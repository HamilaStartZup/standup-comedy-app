import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { IVenue } from '../types/venue';
import { VENUE_TYPE_LABELS, getPricingLabel } from '../types/venue';

interface VenueCardProps {
  venue: IVenue;
}

const VenueCard: React.FC<VenueCardProps> = ({ venue }) => {
  const navigate = useNavigate();
  const [hovered, setHovered] = useState(false);

  const coverPhoto = venue.photos?.[0];

  return (
    <div
      onClick={() => navigate(`/venues/${venue._id}`)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: '#1a1a2e',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 16,
        overflow: 'hidden',
        cursor: 'pointer',
        transition: 'transform 0.2s ease, box-shadow 0.2s ease',
        transform: hovered ? 'translateY(-4px)' : 'none',
        boxShadow: hovered
          ? '0 8px 32px rgba(255,65,108,0.25)'
          : '0 2px 8px rgba(0,0,0,0.3)',
      }}
    >
      {/* Photo */}
      <div style={{ position: 'relative', width: '100%', paddingTop: '56.25%' }}>
        {coverPhoto ? (
          <img
            src={coverPhoto}
            alt={venue.name}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
          />
        ) : (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              background: 'linear-gradient(135deg, #1a1a2e 0%, #2a1a3e 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span style={{ fontSize: 40 }}>🏛️</span>
          </div>
        )}
        {/* Gradient overlay */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: '40%',
            background: 'linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 100%)',
          }}
        />
        {/* Badge type */}
        <span
          style={{
            position: 'absolute',
            top: 12,
            left: 12,
            background: venue.isActive ? 'rgba(255,65,108,0.9)' : 'rgba(128,128,128,0.9)',
            color: '#fff',
            fontSize: 11,
            fontWeight: 700,
            padding: '4px 10px',
            borderRadius: 20,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          {venue.isActive ? VENUE_TYPE_LABELS[venue.venueType] || venue.venueType : 'Désactivée'}
        </span>
      </div>

      {/* Infos */}
      <div style={{ padding: '16px' }}>
        <h3
          style={{
            margin: '0 0 4px 0',
            fontSize: 17,
            fontWeight: 700,
            color: '#fff',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {venue.name}
        </h3>
        <p style={{ margin: '0 0 12px 0', fontSize: 13, color: '#aaa' }}>
          📍 {venue.city}
        </p>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: '#bbb' }}>
            👥 {venue.capacity} places
          </span>
          <span
            style={{
              fontSize: 15,
              fontWeight: 700,
              color: '#ff416c',
            }}
          >
            {venue.pricePerEvent.toLocaleString('fr-FR')} €
            <span style={{ fontSize: 11, fontWeight: 400, color: '#888' }}>{getPricingLabel(venue.pricingType)}</span>
          </span>
        </div>
      </div>
    </div>
  );
};

export default VenueCard;
