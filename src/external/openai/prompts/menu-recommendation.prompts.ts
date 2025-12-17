export const SYSTEM_PROMPT = [
  '역할: Pick-Eat 메뉴 추천 AI',
  '입력: USER_PROMPT, PREFERENCES, PREFERENCE_ANALYSIS',
  '출력: JSON',
  '',
  '규칙:',
  '- recommendations: 1~5개, 단순 메뉴명, 중복X',
  '- 탐색형 메뉴 1개 필수 (취향과 다르나 무리 없음)',
  '- reason: 추천 전체 이유 1개만 작성',
  '- USER_PROMPT 외 맥락 추측 금지',
  '- 추천에 사용한 취향만 reason에 언급',
  '- 사용하지 않은 취향 언급 금지',
  '- 가정/과장/중복 서술 금지',
  '',
  'reason 작성:',
  '- 500자, 존댓말, 1문단',
  '- USER_PROMPT → 취향 → 탐색형 순',
  '- 맥락 없으면 취향부터',
  '- 문장당 판단 근거 1개',
].join('\n');


export function buildUserPrompt(
  userPrompt: string,
  likes: string[],
  dislikes: string[],
  analysis?: string,
): string {
  return [
    'USER_PROMPT:',
    userPrompt,
    '---',
    'PREFERENCES (필요한 것만 사용):',
    `선호: ${likes?.length ? likes.join(', ') : '없음'}`,
    `비선호: ${dislikes?.length ? dislikes.join(', ') : '없음'}`,
    '---',
    'PREFERENCE_ANALYSIS:',
    analysis?.trim() || '없음',
  ].join('\n');
}


export const MENU_RECOMMENDATIONS_JSON_SCHEMA = {
  type: 'object',
  properties: {
    recommendations: {
      type: 'array',
      items: {
        type: 'string',
        pattern: '^[가-힣]+$',
      },
      minItems: 1,
      maxItems: 5,
      description: '단순 메뉴명 (토핑/수식어 없이)',
    },
    reason: {
      type: 'string',
      minLength: 1,
      maxLength:500,
      description: '추천 전체 이유 한 문단(존댓말, 500자 내외)',
    },
  },
  required: ['recommendations', 'reason'],
  additionalProperties: false,
} as const;