import { useQuery } from '@tanstack/react-query';
import { listVenues } from '../services/api';

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

export function useVenues(filters?: VenueFilters) {
  return useQuery({
    queryKey: ['venues', filters],
    queryFn: () => listVenues(filters),
  });
}
