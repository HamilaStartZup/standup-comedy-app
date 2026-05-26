export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
}

export interface Paginated<T> {
  data: T[];
  pagination: PaginationMeta;
}

export type PaginatedResponse<K extends string, T> = { [P in K]: T[] } & { pagination: PaginationMeta };