/**
 * placeId 정규화 유틸리티
 * - DB 저장: places/ prefix 제거
 */

/**
 * placeId에서 places/ prefix를 제거하여 정규화
 * DB 저장 시 사용
 */
export function normalizePlaceIdForStorage(placeId: string): string {
  if (!placeId) return placeId;
  return placeId.startsWith('places/')
    ? placeId.replace(/^places\//, '')
    : placeId;
}
