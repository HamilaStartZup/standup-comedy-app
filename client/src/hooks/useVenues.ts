import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { listVenues } from '../services/api';
import type { PaginatedResponse } from '../types/pagination';
import type { IVenue } from '../types/venue';

interface VenueFilters {
  city?: string;
  venueType?: string;
  minCapacity?: number;
  owner?: 'me';
  region?: string;
  department?: string;
  page?: number;
  limit?: number;
}

export function normalizeFilters(filters?: VenueFilters): VenueFilters | undefined {
  if (!filters) return undefined;
  const normalized: Record<string, unknown> = {};
  for (const key of Object.keys(filters).sort()) {
    const value = (filters as Record<string, unknown>)[key];
    if (value !== undefined) normalized[key] = value;
  }
  return normalized as VenueFilters;
}

export function useVenues(filters?: VenueFilters) {
  const normalized = normalizeFilters(filters);
  return useQuery<PaginatedResponse<'venues', IVenue>>({
    queryKey: ['venues', normalized],
    queryFn: () => listVenues(filters),
    placeholderData: keepPreviousData,
  });
}
