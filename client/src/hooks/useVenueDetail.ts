import { useQuery } from '@tanstack/react-query';
import { getVenue, listBlockedDates } from '../services/api';
import type { IVenue, IVenueBlockedDate } from '../types/venue';

interface UseVenueDetailResult {
  venue: IVenue | undefined;
  isVenueLoading: boolean;
  isVenueError: boolean;
  blockedDates: IVenueBlockedDate[];
  isBlockedDatesLoading: boolean;
  isBlockedDatesError: boolean;
}

export function useVenueDetail(venueId: string | undefined): UseVenueDetailResult {
  const venueQuery = useQuery({
    queryKey: ['venue', venueId],
    queryFn: () => getVenue(venueId!),
    enabled: !!venueId,
  });

  const blockedDatesQuery = useQuery({
    queryKey: ['blocked-dates', venueId],
    queryFn: () => listBlockedDates(venueId!),
    enabled: !!venueId,
  });

  return {
    venue: venueQuery.data,
    isVenueLoading: venueQuery.isLoading,
    isVenueError: venueQuery.isError,
    blockedDates: blockedDatesQuery.data ?? [],
    isBlockedDatesLoading: blockedDatesQuery.isLoading,
    isBlockedDatesError: blockedDatesQuery.isError,
  };
}
