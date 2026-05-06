import { useQuery } from '@tanstack/react-query';
import { listVenueBookings } from '../services/api';
import type { IVenueBooking } from '../types/venue';

export function useVenueBookings(venueId: string | undefined) {
  return useQuery<IVenueBooking[]>({
    queryKey: ['venue-bookings', venueId],
    queryFn: () => listVenueBookings(venueId!),
    enabled: !!venueId,
  });
}
