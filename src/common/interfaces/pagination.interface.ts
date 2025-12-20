/**
 * Pagination 정보 인터페이스
 */
export interface PageInfo {
  page: number;
  limit: number;
  totalCount: number;
  hasNext: boolean;
}

/**
 * Pagination 결과 인터페이스
 */
export interface PaginatedResponse<T> {
  items: T[];
  pageInfo: PageInfo;
}
