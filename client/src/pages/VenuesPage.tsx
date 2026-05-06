import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import VenueCard from '../components/VenueCard';
import Navbar from '../components/Navbar';
import VenuesTabs from '../components/VenuesTabs';
import { VENUE_TYPES } from '../types/venue';
import { useVenues } from '../hooks/useVenues';
import VenueCardSkeleton from '../components/skeletons/VenueCardSkeleton';
import {
  FRENCH_REGIONS,
  FRENCH_DEPARTMENTS,
  DEPARTMENTS_ORDER,
} from '../utils/geographicMatching';

const VENUE_TYPES_WITH_ALL = [
  { value: '', label: 'Tous les types' },
  ...VENUE_TYPES,
];

const REGION_OPTIONS = ['', ...Object.keys(FRENCH_REGIONS).sort()];

const EMPTY_FILTERS = { city: '', venueType: '', minCapacity: '', region: '', department: '' };

const VenuesPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  const filtersFromUrl = {
    city: searchParams.get('city') ?? '',
    venueType: searchParams.get('venueType') ?? '',
    minCapacity: searchParams.get('minCapacity') ?? '',
    region: searchParams.get('region') ?? '',
    department: searchParams.get('department') ?? '',
  };

  const [filters, setFilters] = useState(filtersFromUrl);
  const [activeFilters, setActiveFilters] = useState(filtersFromUrl);

  const { data: venuesResponse, isLoading, error } = useVenues({
    city: activeFilters.city || undefined,
    venueType: activeFilters.venueType || undefined,
    minCapacity: activeFilters.minCapacity ? parseInt(activeFilters.minCapacity) : undefined,
    region: activeFilters.region || undefined,
    department: activeFilters.department || undefined,
  });

  const data = venuesResponse?.venues;

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setActiveFilters({ ...filters });
    const params: Record<string, string> = {};
    if (filters.city) params.city = filters.city;
    if (filters.venueType) params.venueType = filters.venueType;
    if (filters.minCapacity) params.minCapacity = filters.minCapacity;
    if (filters.region) params.region = filters.region;
    if (filters.department) params.department = filters.department;
    setSearchParams(params, { replace: true });
  };

  const handleReset = () => {
    setFilters(EMPTY_FILTERS);
    setActiveFilters(EMPTY_FILTERS);
    setSearchParams({}, { replace: true });
  };

  // Derived: departments to show in the dept selector
  const availableDepartments = filters.region
    ? (FRENCH_REGIONS[filters.region] ?? [])
    : DEPARTMENTS_ORDER;

  const inputStyle: React.CSSProperties = {
    background: 'rgba(0,0,0,0.4)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 12,
    padding: '12px 16px',
    color: '#fff',
    fontSize: 14,
    outline: 'none',
    flex: 1,
    minWidth: 140,
  };

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(to bottom right, #1a1a2e, #331f41)', paddingBottom: 60, padding: '20px' }}>
      <style>{`
        @media (max-width: 640px) {
          .venues-page-title { font-size: 1.8em !important; }
          .venues-search-form { flex-direction: column; }
          .venues-search-form input,
          .venues-search-form select { min-width: 0 !important; width: 100%; }
          .venues-search-form button { width: 100%; }
        }
      `}</style>
      <Navbar />

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '40px 24px' }}>
        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <h1 className="venues-page-title" style={{ margin: '0 0 8px 0', fontSize: '2.5em', fontWeight: 800, color: '#ff416c' }}>
            Salles
          </h1>
          <p style={{ margin: '0 0 20px 0', fontSize: '1.1em', color: '#aaa' }}>
            Réservez des salles pour vos soirées stand-up, spectacles et événements.
          </p>

        </div>

        <VenuesTabs />

        {/* Barre de recherche */}
        <form
          className="venues-search-form"
          onSubmit={handleSearch}
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 12,
            background: 'rgba(0,0,0,0.3)',
            border: '1px solid rgba(255,65,108,0.2)',
            borderRadius: 16,
            padding: 16,
            marginBottom: 32,
          }}
        >
          <input
            type="text"
            placeholder="🏙️ Ville"
            value={filters.city}
            onChange={(e) => setFilters((p) => ({ ...p, city: e.target.value }))}
            style={inputStyle}
          />
          <select
            value={filters.venueType}
            onChange={(e) => setFilters((p) => ({ ...p, venueType: e.target.value }))}
            style={inputStyle}
          >
            {VENUE_TYPES_WITH_ALL.map((t) => (
              <option key={t.value} value={t.value} style={{ background: '#1a1a2e' }}>
                {t.label}
              </option>
            ))}
          </select>

          {/* Région */}
          <select
            value={filters.region}
            onChange={(e) => {
              const newRegion = e.target.value;
              setFilters((p) => ({ ...p, region: newRegion, department: '' }));
            }}
            style={inputStyle}
          >
            <option value="" style={{ background: '#1a1a2e' }}>Toutes les régions</option>
            {REGION_OPTIONS.filter(Boolean).map((r) => (
              <option key={r} value={r} style={{ background: '#1a1a2e' }}>
                {r}
              </option>
            ))}
          </select>

          {/* Département */}
          <select
            value={filters.department}
            onChange={(e) => setFilters((p) => ({ ...p, department: e.target.value }))}
            style={inputStyle}
          >
            <option value="" style={{ background: '#1a1a2e' }}>Tous les départements</option>
            {availableDepartments.map((code) => (
              <option key={code} value={code} style={{ background: '#1a1a2e' }}>
                {code} — {FRENCH_DEPARTMENTS[code] ?? code}
              </option>
            ))}
          </select>

          <input
            type="number"
            placeholder="👥 Capacité min."
            value={filters.minCapacity}
            onChange={(e) => setFilters((p) => ({ ...p, minCapacity: e.target.value }))}
            min={1}
            style={{ ...inputStyle, maxWidth: 160 }}
          />
          <button
            type="submit"
            style={{
              padding: '12px 28px',
              background: 'linear-gradient(135deg, #ff416c 0%, #ff4b2b 100%)',
              color: '#fff',
              border: 'none',
              borderRadius: 12,
              fontWeight: 700,
              fontSize: 14,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            Rechercher
          </button>
          {(activeFilters.city || activeFilters.venueType || activeFilters.minCapacity || activeFilters.region || activeFilters.department) && (
            <button
              type="button"
              onClick={handleReset}
              style={{
                padding: '12px 20px',
                background: 'transparent',
                color: '#888',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 12,
                cursor: 'pointer',
                fontSize: 14,
              }}
            >
              Réinitialiser
            </button>
          )}
        </form>

        {/* Contenu */}
        {isLoading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 24 }}>
            {Array.from({ length: 6 }).map((_, i) => <VenueCardSkeleton key={i} />)}
          </div>
        ) : error ? (
          <div style={{ textAlign: 'center', padding: 60 }}>
            <p style={{ color: '#ef4444', fontSize: 15 }}>Impossible de charger les salles.</p>
          </div>
        ) : !data || data.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '64px 24px',
              background: 'rgba(0,0,0,0.3)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 20,
            }}
          >
            <div style={{ fontSize: 56, marginBottom: 16 }}>🏛️</div>
            <h3 style={{ color: '#fff', fontSize: 20, marginBottom: 8 }}>Aucune salle disponible</h3>
            <p style={{ color: '#888', fontSize: 15, marginBottom: 24 }}>
              {activeFilters.city || activeFilters.venueType || activeFilters.minCapacity || activeFilters.region || activeFilters.department
                ? "Essayez d'autres critères de recherche."
                : "Aucune salle n'a encore été ajoutée."}
            </p>
            {(activeFilters.city || activeFilters.venueType || activeFilters.minCapacity || activeFilters.region || activeFilters.department) && (
              <button
                onClick={handleReset}
                style={{
                  padding: '10px 24px',
                  background: 'rgba(255,65,108,0.15)',
                  color: '#ff416c',
                  border: '1px solid rgba(255,65,108,0.4)',
                  borderRadius: 10,
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                Réinitialiser les filtres
              </button>
            )}
          </div>
        ) : (
          <>
            <p style={{ color: '#888', fontSize: 14, marginBottom: 24 }}>
              {data.length} salle{data.length > 1 ? 's' : ''} disponible{data.length > 1 ? 's' : ''}
            </p>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: 24,
              }}
            >
              {data.map((venue) => (
                <VenueCard key={venue._id} venue={venue} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default VenuesPage;
