import { useQuery } from '@tanstack/react-query';
import { myBookings } from '../services/api';
import type { IVenueBooking } from '../types/venue';

export function useMyBookings() {
  return useQuery<IVenueBooking[]>({
    queryKey: ['my-bookings'],
    queryFn: myBookings,
  });
}
