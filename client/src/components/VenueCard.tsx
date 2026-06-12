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
        background: 'var(--ccc-bg-elevated)',
        border: '1px solid var(--ccc-border-subtle)',
        borderRadius: 16,
        overflow: 'hidden',
        cursor: 'pointer',
        transition: 'transform 0.2s ease, box-shadow 0.2s ease',
        transform: hovered ? 'translateY(-4px)' : 'none',
        boxShadow: hovered
          ? '0 8px 32px rgba(15, 23, 42, 0.12)'
          : '0 4px 24px rgba(15, 23, 42, 0.08)',
      }}
    >
      {/* Photo */}
      <div style={{ position: 'relative', width: '100%', paddingTop: '56.25%' }}>
        {coverPhoto ? (
          <img
            src={coverPhoto}
            alt={venue.name}
            loading="lazy"
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
              background: 'var(--ccc-bg-surface)',
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
            background: venue.isActive ? 'rgba(124, 58, 237,0.9)' : 'rgba(128,128,128,0.9)',
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
            color: 'var(--ccc-text-primary)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {venue.name}
        </h3>
        <p style={{ margin: '0 0 12px 0', fontSize: 13, color: 'var(--ccc-text-muted)' }}>
          📍 {venue.city}
        </p>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: 'var(--ccc-text-secondary)' }}>
            👥 {venue.capacity} places
          </span>
          <span
            style={{
              fontSize: 15,
              fontWeight: 700,
              color: '#7c3aed',
            }}
          >
            {venue.pricePerEvent.toLocaleString('fr-FR')} €
            <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--ccc-text-muted)' }}>{getPricingLabel(venue.pricingType)}</span>
          </span>
        </div>
      </div>
    </div>
  );
};

export default React.memo(VenueCard);
