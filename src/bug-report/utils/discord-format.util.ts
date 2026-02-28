/**
 * 텍스트를 지정된 최대 길이로 잘라내고 말줄임표를 추가합니다.
 * @param text 원본 텍스트
 * @param maxLength 최대 길이
 * @returns 잘린 텍스트 (필요시 '...' 추가)
 */
export function truncateText(text: string, maxLength: number): string {
  if (!text || text.length === 0 || text.length <= maxLength) {
    return text || '';
  }
  return text.substring(0, maxLength) + '...';
}
