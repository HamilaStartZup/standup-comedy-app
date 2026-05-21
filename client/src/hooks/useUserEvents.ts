import { useQuery, keepPreviousData, type UseQueryResult } from '@tanstack/react-query';
import api from '../services/api';
import { useAuth } from './useAuth';
import type { IEvent } from '../types/event';
import type { PaginationMeta } from '../types/pagination';

interface UseUserEventsOptions {
  dateFrom?: string;
  limit?: number;
  page?: number;
}

export interface UserEventsResult {
  events: IEvent[];
  pagination: PaginationMeta | null;
}

export function useUserEvents(options: UseUserEventsOptions = {}): UseQueryResult<UserEventsResult, Error> {
  const { user } = useAuth();
  const { dateFrom, limit, page } = options;

  return useQuery<UserEventsResult, Error>({
    queryKey: ['events', user?._id, dateFrom ?? null, limit ?? null, page ?? null],
    queryFn: async () => {
      if (!user?._id) throw new Error('Authentification manquante');
      const params = new URLSearchParams();
      if (user.role === 'ORGANIZER') params.set('organizerId', user._id);
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (limit !== undefined) params.set('limit', String(limit));
      if (page !== undefined) params.set('page', String(page));
      const qs = params.toString();
      const res = await api.get(`/events${qs ? `?${qs}` : ''}`);

      const data = res.data;
      if (Array.isArray(data)) {
        return { events: data, pagination: null };
      }
      if (Array.isArray(data?.events)) {
        return { events: data.events, pagination: data.pagination ?? null };
      }
      return { events: [], pagination: null };
    },
    enabled: !!user?._id,
    placeholderData: keepPreviousData,
  });
}
