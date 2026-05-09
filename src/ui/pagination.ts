export interface PaginatedResult<T> {
  items: T[];
  page: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export function paginate<T>(
  allItems: T[],
  page: number,
  perPage: number = 10
): PaginatedResult<T> {
  const totalPages = Math.max(1, Math.ceil(allItems.length / perPage));
  const clampedPage = Math.max(1, Math.min(page, totalPages));
  const start = (clampedPage - 1) * perPage;
  const items = allItems.slice(start, start + perPage);

  return {
    items,
    page: clampedPage,
    totalPages,
    hasNext: clampedPage < totalPages,
    hasPrev: clampedPage > 1,
  };
}
