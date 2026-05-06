import { useQuery } from '@tanstack/react-query';
import { listVenues } from '../services/api';

export function useMyVenues(userId: string | undefined) {
  return useQuery({
    queryKey: ['venues', { owner: userId }],
    queryFn: () => listVenues({ owner: 'me' }),
    enabled: !!userId,
  });
}
