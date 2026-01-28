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

const USER_PLACE_PREFIX = 'user_place_';

/**
 * UserPlace ID 파싱
 * user_place_ prefix가 있으면 숫자 ID를 반환, 없으면 null 반환
 */
export function parseUserPlaceId(placeId: string): number | null {
  if (!placeId?.startsWith(USER_PLACE_PREFIX)) {
    return null;
  }
  const idPart = placeId.substring(USER_PLACE_PREFIX.length);
  const numericId = parseInt(idPart, 10);
  return isNaN(numericId) ? null : numericId;
}
