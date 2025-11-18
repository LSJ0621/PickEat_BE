/**
 * 메뉴 추천을 위한 프롬프트 템플릿
 */

/**
 * System 프롬프트: AI의 역할과 기본 규칙 정의
 */
export const SYSTEM_PROMPT = [
  'You are a culinary assistant for the Pick-Eat app.',
  'Your role is to understand the context and intent of user requests, then provide appropriate menu recommendations.',
  '',
  '⚠️ CRITICAL: Keep reasoning brief and concise. Focus on quickly generating the response. Context understanding is important, but do not overthink.',
  '',
  'Core Principles:',
  '- Understand the user\'s intent and respond accordingly. If one menu is needed, return one. If multiple, return multiple.',
  '- Use stored preferences when they enhance the recommendation, ignore when they conflict',
  '- Recommend only standard, commonly used menu names in Korea',
  '- Each menu name must be a SINGLE, INDEPENDENT menu item. Do NOT combine multiple menus',
  '- Do NOT add English translations, parentheses, or additional descriptions',
  '- Do NOT create compound menu names that don\'t exist',
  '- Do NOT recommend the same menu with different pronunciations or spellings',
  '- Keep responses simple and direct. Generate the JSON response quickly without excessive reasoning.',
].join('\n');

/**
 * User 프롬프트 생성 함수
 * @param userPrompt 사용자가 입력한 요청
 * @param likes 사용자가 좋아하는 것 (태그 배열)
 * @param dislikes 사용자가 싫어하는 것 (태그 배열)
 * @returns 완성된 User 프롬프트
 */
export function buildUserPrompt(
  userPrompt: string,
  likes: string[],
  dislikes: string[],
): string {
  const normalizedLikes = likes?.filter(Boolean) ?? [];
  const normalizedDislikes = dislikes?.filter(Boolean) ?? [];
  const hasLikes = normalizedLikes.length > 0;
  const hasDislikes = normalizedDislikes.length > 0;

  const preferenceParts: string[] = [];
  if (hasLikes) {
    preferenceParts.push(`좋아하는 것: ${normalizedLikes.join(', ')}`);
  }
  if (hasDislikes) {
    preferenceParts.push(`싫어하는 것: ${normalizedDislikes.join(', ')}`);
  }

  return [
    `사용자 요청: ${userPrompt}`,
    preferenceParts.length > 0
      ? `참고할 취향 정보: ${preferenceParts.join(' | ')}`
      : '참고할 취향 정보: 없음',
  ].join('\n');
}

/**
 * JSON Schema for Structured Outputs
 * 메뉴 추천 응답의 형식을 강제하기 위한 스키마
 */
export const MENU_RECOMMENDATIONS_JSON_SCHEMA = {
  type: 'object',
  properties: {
    recommendations: {
      type: 'array',
      items: {
        type: 'string',
        pattern: '^[가-힣]+$', // 한글만 허용 (글자수 제한 없음)
      },
      minItems: 1,
      maxItems: 5,
      description: '맥락에 맞는 메뉴 응답. 사용자 요청의 맥락에 따라 하나 또는 여러 개의 메뉴를 반환 (표준 메뉴명만 사용)',
    },
  },
  required: ['recommendations'],
  additionalProperties: false,
} as const;

