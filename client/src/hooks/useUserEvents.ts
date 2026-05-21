import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import api from '../services/api';
import { useAuth } from './useAuth';
import type { IEvent } from '../types/event';

interface UseUserEventsOptions {
  dateFrom?: string;
  limit?: number;
  page?: number;
}

export function useUserEvents(options: UseUserEventsOptions = {}): UseQueryResult<IEvent[], Error> {
  const { user } = useAuth();
  const { dateFrom, limit, page } = options;

  return useQuery<IEvent[], Error>({
    queryKey: ['events', user?._id, dateFrom ?? null, limit ?? null, page ?? null],
    queryFn: async () => {
      if (!user?._id) throw new Error('Authentification manquante');
      const params = new URLSearchParams();
      if (user.role === 'ORGANIZER') params.set('organizerId', user._id);
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (limit) params.set('limit', String(limit));
      if (page) params.set('page', String(page));
      const qs = params.toString();
      const res = await api.get(`/events${qs ? `?${qs}` : ''}`);

      let list: IEvent[] = [];
      const data = res.data;
      if (Array.isArray(data)) list = data;
      else if (Array.isArray(data?.events)) list = data.events;
      else if (typeof data === 'string') {
        try {
          const parsed = JSON.parse(data);
          list = Array.isArray(parsed) ? parsed : [];
        } catch {
          // ignore parse error, return empty list
        }
      }
      return list;
    },
    enabled: !!user?._id,
  });
}
