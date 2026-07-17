import { useQuery } from '@tanstack/react-query';
import { myInvoices } from '../services/api';
import type { IInvoiceSnapshot } from '../types/venue';

export function useMyInvoices(options?: { enabled?: boolean }) {
  return useQuery<IInvoiceSnapshot[]>({
    queryKey: ['my-invoices'],
    queryFn: myInvoices,
    enabled: options?.enabled !== false,
  });
}
