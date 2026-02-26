/**
 * 메뉴명 정규화 - 괄호 제거 및 중복 제거
 *
 * Note: Normalization is character-based (detects Korean/English from menu names)
 * rather than language parameter-based for more robust handling of mixed contexts.
 *
 * @param menuNames - 원본 메뉴명 배열
 * @returns 정규화된 메뉴명 배열
 */
export function normalizeMenuNames(menuNames: string[]): string[] {
  return (
    menuNames
      .map((name) => {
        // "/" 또는 "," 포함된 경우 첫 번째 메뉴만 추출
        const separators = ['/', ','];
        for (const sep of separators) {
          if (name.includes(sep)) {
            name = name.split(sep)[0].trim();
            break; // 첫 번째 구분자만 처리
          }
        }

        // 괄호와 그 내용 제거
        let normalized = name.replace(/\([^)]*\)/g, '').trim();
        // 연속된 공백 정리
        normalized = normalized.replace(/\s+/g, ' ').trim();

        const koreanMatch = normalized.match(/^[가-힣\s]+$/);
        const englishMatch = normalized.match(/^[a-zA-Z\s]+$/);

        if (koreanMatch) {
          return normalized.replace(/\s+/g, '');
        } else if (englishMatch) {
          return normalized.toLowerCase();
        }
        // 혼합된 경우 그대로 반환
        return normalized;
      })
      .filter((name): name is string => name !== null && name.length > 0)
      // 중복 제거
      .filter((name, index, array) => array.indexOf(name) === index)
  );
}

/**
 * 텍스트에서 URL 및 마크다운 링크 제거
 *
 * OpenAI 웹 검색 결과에 포함된 citation을 제거하기 위해 사용.
 * citation_rules (menu-recommendation.prompts.ts)에서 금지했으나,
 * GPT가 규칙을 어길 경우 후처리로 제거.
 *
 * - 마크다운 링크 [텍스트](URL) → 텍스트만 남김
 * - 순수 URL (http/https) 완전 제거
 *
 * @param text - 원본 텍스트
 * @returns URL이 제거된 텍스트
 *
 * @example
 * removeUrlsFromText('[맛집](https://example.com) 추천') // → '맛집 추천'
 * removeUrlsFromText('https://example.com 참고') // → '참고'
 */
export function removeUrlsFromText(text: string): string {
  // 1. 마크다운 링크 [텍스트](URL) → 텍스트만 남김
  // 대괄호 내부에 중첩된 대괄호가 없는 패턴 사용
  let result = text.replace(/\[([^[\]]+)\]\([^)]+\)/g, '$1');

  // 2. 순수 URL 패턴 제거 (http/https)
  // URL 뒤에 오는 구두점(마침표, 쉼표 등)은 제거하지 않도록 처리
  result = result.replace(/https?:\/\/[^\s)>\],]+/g, '');

  // 3. 연속된 공백 정리
  return result.replace(/\s+/g, ' ').trim();
}
