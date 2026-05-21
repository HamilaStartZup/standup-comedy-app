export interface PaginationParams {
  page: number;
  limit: number;
  skip: number;
  isPaginated: boolean;
}

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
    return { page: 1, limit: 0, skip: 0, isPaginated: false };
  }

  const page = Math.max(1, parseInt(String(query.page ?? 1), 10) || 1);
  const rawLimit = parseInt(String(query.limit ?? defaultLimit), 10) || defaultLimit;
  const limit = Math.min(Math.max(1, rawLimit), maxLimit);

  return { page, limit, skip: (page - 1) * limit, isPaginated: true };
}

export function buildPaginationResult(params: PaginationParams, total: number): PaginationResult {
  const limit = params.isPaginated ? params.limit : total;
  const totalPages = limit > 0 ? Math.ceil(total / limit) : 1;
  return {
    page: params.page,
    limit,
    total,
    totalPages,
    hasMore: params.page < totalPages,
  };
}