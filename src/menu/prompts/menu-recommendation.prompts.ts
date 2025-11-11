/**
 * 메뉴 추천을 위한 프롬프트 템플릿
 */

/**
 * System 프롬프트: AI의 역할과 기본 규칙 정의
 */
export const SYSTEM_PROMPT = [
  'You are a culinary assistant for the Pick-Eat app.',
  'Your role is to understand the context and intent of user requests, then provide appropriate responses.',
  '',
  '⚠️ CRITICAL: Context understanding takes priority over all other rules, including response format. Understand the user\'s intent and respond accordingly. If the context requires one menu, return one. If the context requires multiple menus, return multiple.',
  '',
  'Core Principles:',
  '- Carefully analyze the user\'s request to understand their intent, context, mood, and explicit preferences',
  '- Use stored preferences intelligently: apply them when they enhance the recommendation, ignore them when they conflict with the user\'s explicit request',
  '- Recommend only standard, commonly used menu names in Korea',
  '- Menu names can be any length, but must be simple and clear',
  '- Do NOT add English translations, parentheses, or additional descriptions',
  '- Do NOT create compound menu names that don\'t exist (e.g., "짜글이찜" - use "짜글이" or "갈비찜" separately)',
  '- Do NOT recommend the same menu with different pronunciations or spellings (e.g., "마라샹궈" and "마라향궈" are the same menu - recommend only one standard name)',
  '- IMPORTANT: Each recommendation should be independent. Do NOT repeat or consider previous recommendations.',
].join('\n');

/**
 * User 프롬프트 생성 함수
 * @param userPrompt 사용자가 입력한 요청
 * @param tags 사용자의 취향 정보 (태그 배열)
 * @returns 완성된 User 프롬프트
 */
export function buildUserPrompt(userPrompt: string, tags: string[]): string {
  const normalizedTags = tags?.filter(Boolean) ?? [];
  const hasTags = normalizedTags.length > 0;

  return [
    `사용자 요청: ${userPrompt}`,
    '',
    hasTags
      ? `참고할 취향 정보: ${normalizedTags.join(', ')}`
      : '참고할 취향 정보: 없음',
    '',
    '⚠️ 최우선 원칙: 맥락 이해가 모든 규칙보다 우선합니다. 사용자 요청의 의도와 맥락을 정확히 파악하고 그에 맞게 응답하세요.',
    '',
    '취향 정보 활용:',
    '   - 취향 정보를 자율적으로 판별하여 활용하세요',
    '   - 사용자 요청과 취향 정보의 관계를 맥락에 따라 판단하세요',
    '',
    '메뉴명 규칙:',
    '   - 한국에서 실제로 사용되는 표준 메뉴명만 사용. 한글로만 작성',
    '   - 존재하지 않는 조합형 메뉴명 금지 (예: "짜글이찜" ❌)',
    '   - 임의로 만든 메뉴명 금지 (예: "매운 돼지 고기볶음" ❌)',
    '   - 영어 주석, 괄호 설명 등 추가 텍스트 금지',
    '   - 같은 메뉴의 다른 발음/표기 사용 금지 (예: "마라샹궈"와 "마라향궈"는 같은 메뉴)',
    '   - 글자수 제한 없음. 실제로 존재하는 메뉴명이면 사용 가능',
    '',
    '기타:',
    '   - 이전 추천을 전혀 고려하지 말 것. 매번 새로운 요청으로 간주',
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

