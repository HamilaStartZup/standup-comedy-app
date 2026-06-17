import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import VenueCard from '../components/VenueCard';
import Navbar from '../components/Navbar';
import VenuesTabs from '../components/VenuesTabs';
import type { IVenue } from '../types/venue';
import { VENUE_TYPES } from '../types/venue';
import { useVenues } from '../hooks/useVenues';
import VenueCardSkeleton from '../components/skeletons/VenueCardSkeleton';
import Pagination from '../components/Pagination';
import {
  FRENCH_REGIONS,
  FRENCH_DEPARTMENTS,
  DEPARTMENTS_ORDER,
} from '../utils/geographicMatching';
import { primaryButtonStyle } from '../styles/theme';

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
  const [page, setPage] = useState(1);

  const { data: venuesResponse, isLoading, error, refetch } = useVenues({
    city: activeFilters.city || undefined,
    venueType: activeFilters.venueType || undefined,
    minCapacity: activeFilters.minCapacity ? parseInt(activeFilters.minCapacity) : undefined,
    region: activeFilters.region || undefined,
    department: activeFilters.department || undefined,
    page,
    limit: 20,
  });

  const data: IVenue[] = venuesResponse?.venues ?? [];
  const totalPages = venuesResponse?.pagination?.totalPages ?? 1;

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
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
    setPage(1);
    setFilters(EMPTY_FILTERS);
    setActiveFilters(EMPTY_FILTERS);
    setSearchParams({}, { replace: true });
  };

  // Derived: departments to show in the dept selector
  const availableDepartments = filters.region
    ? (FRENCH_REGIONS[filters.region] ?? [])
    : DEPARTMENTS_ORDER;

  const inputStyle: React.CSSProperties = {
    background: 'var(--ccc-bg-elevated)',
    border: '1px solid var(--ccc-border-medium)',
    borderRadius: 12,
    padding: '12px 16px',
    color: 'var(--ccc-text-primary)',
    fontSize: 14,
    outline: 'none',
    flex: 1,
    minWidth: 140,
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--ccc-bg-gradient)', color: 'var(--ccc-text-primary)', padding: '20px', paddingBottom: 60 }}>
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
          <h1 className="venues-page-title ccc-page-title" style={{ margin: '0 0 8px 0' }}>
            Salles
          </h1>
          <p style={{ margin: '0 0 20px 0', fontSize: '1.1em', color: 'var(--ccc-text-muted)' }}>
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
            background: 'var(--ccc-bg-elevated)',
            border: '1px solid var(--ccc-border-subtle)',
            boxShadow: '0 4px 24px rgba(15, 23, 42, 0.08)',
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
              <option key={t.value} value={t.value} style={{ background: 'var(--ccc-option-bg)' }}>
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
            <option value="" style={{ background: 'var(--ccc-option-bg)' }}>Toutes les régions</option>
            {REGION_OPTIONS.filter(Boolean).map((r) => (
              <option key={r} value={r} style={{ background: 'var(--ccc-option-bg)' }}>
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
            <option value="" style={{ background: 'var(--ccc-option-bg)' }}>Tous les départements</option>
            {availableDepartments.map((code) => (
              <option key={code} value={code} style={{ background: 'var(--ccc-option-bg)' }}>
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
            style={{ ...primaryButtonStyle, whiteSpace: 'nowrap' }}
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
                color: 'var(--ccc-text-muted)',
                border: '1px solid var(--ccc-border-medium)',
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
            <p style={{ color: 'var(--ccc-error)', fontSize: 15, marginBottom: 16 }}>Impossible de charger les salles.</p>
            <button
              onClick={() => refetch()}
              style={{
                padding: '10px 24px',
                borderRadius: 8,
                border: 'none',
                background: 'var(--ccc-accent-gradient)',
                color: 'white',
                fontSize: 14,
                fontWeight: 'bold',
                cursor: 'pointer',
              }}
            >
              Réessayer
            </button>
          </div>
        ) : !data || data.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '64px 24px',
              background: 'var(--ccc-bg-elevated)',
              border: '1px solid var(--ccc-border-subtle)',
              borderRadius: 20,
            }}
          >
            <div style={{ fontSize: 56, marginBottom: 16 }}>🏛️</div>
            <h3 style={{ color: 'var(--ccc-text-primary)', fontSize: 20, marginBottom: 8 }}>Aucune salle disponible</h3>
            <p style={{ color: 'var(--ccc-text-muted)', fontSize: 15, marginBottom: 24 }}>
              {activeFilters.city || activeFilters.venueType || activeFilters.minCapacity || activeFilters.region || activeFilters.department
                ? "Essayez d'autres critères de recherche."
                : "Aucune salle n'a encore été ajoutée."}
            </p>
            {(activeFilters.city || activeFilters.venueType || activeFilters.minCapacity || activeFilters.region || activeFilters.department) && (
              <button
                onClick={handleReset}
                style={{
                  padding: '10px 24px',
                  background: 'rgba(124, 58, 237,0.15)',
                  color: 'var(--ccc-accent)',
                  border: '1px solid rgba(124, 58, 237,0.4)',
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
            <p style={{ color: 'var(--ccc-text-muted)', fontSize: 14, marginBottom: 24 }}>
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
            <Pagination
              page={page}
              totalPages={totalPages}
              onChange={setPage}
              disabled={isLoading}
            />
          </>
        )}
      </div>
    </div>
  );
};

export default VenuesPage;
