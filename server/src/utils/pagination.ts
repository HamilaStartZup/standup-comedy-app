export class PaginationValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PaginationValidationError';
  }
}

export type PaginationParams =
  | { isPaginated: true; page: number; limit: number; skip: number }
  | { isPaginated: false };

export interface PaginationResult {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
}

export function parsePagination(
  query: Record<string, unknown>,
  defaultLimit = 20,
  maxLimit = 100,
): PaginationParams {
  const hasPage = query.page !== undefined;
  const hasLimit = query.limit !== undefined;

  if (!hasPage && !hasLimit) {
    return { isPaginated: false };
  }

  if (hasPage && isNaN(parseInt(String(query.page), 10))) {
    throw new PaginationValidationError('page doit être un entier valide');
  }
  if (hasLimit && isNaN(parseInt(String(query.limit), 10))) {
    throw new PaginationValidationError('limit doit être un entier valide');
  }

  const page = Math.min(1000, Math.max(1, parseInt(String(query.page ?? 1), 10)));
  const rawLimit = parseInt(String(query.limit ?? defaultLimit), 10);
  const limit = Math.min(Math.max(1, rawLimit), maxLimit);

  return { isPaginated: true, page, limit, skip: (page - 1) * limit };
}

export function parsePaginationWithDefaults(
  query: Record<string, unknown>,
  defaultLimit = 20,
  maxLimit = 100,
): { page: number; limit: number; skip: number } {
  if (query.page !== undefined && isNaN(parseInt(String(query.page), 10))) {
    throw new PaginationValidationError('page doit être un entier valide');
  }
  if (query.limit !== undefined && isNaN(parseInt(String(query.limit), 10))) {
    throw new PaginationValidationError('limit doit être un entier valide');
  }

  const page = Math.min(1000, Math.max(1, parseInt(String(query.page ?? 1), 10) || 1));
  const rawLimit = parseInt(String(query.limit ?? defaultLimit), 10) || defaultLimit;
  const limit = Math.min(Math.max(1, rawLimit), maxLimit);

  return { page, limit, skip: (page - 1) * limit };
}

export function buildPaginationResult(
  params: { page: number; limit: number },
  total: number,
): PaginationResult {
  const { page, limit } = params;
  const totalPages = limit > 0 ? Math.ceil(total / limit) : 1;
  return { page, limit, total, totalPages, hasMore: page < totalPages };
}
