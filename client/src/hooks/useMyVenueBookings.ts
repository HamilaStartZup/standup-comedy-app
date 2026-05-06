import { useQuery } from '@tanstack/react-query';
import { getMyVenueBookings } from '../services/api';
import type { IVenueBooking } from '../types/venue';

export function useMyVenueBookings(venueId: string, enabled = true) {
  return useQuery<IVenueBooking[]>({
    queryKey: ['my-venue-bookings', venueId],
    queryFn: () => getMyVenueBookings(venueId),
    enabled: enabled && !!venueId,
  });
}
