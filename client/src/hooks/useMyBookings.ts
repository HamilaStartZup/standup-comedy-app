import { useQuery } from '@tanstack/react-query';
import { myBookings } from '../services/api';
import type { IVenueBooking } from '../types/venue';

export function useMyBookings(options?: { enabled?: boolean }) {
  return useQuery<IVenueBooking[]>({
    queryKey: ['my-bookings'],
    queryFn: myBookings,
    enabled: options?.enabled !== false,
  });
}
