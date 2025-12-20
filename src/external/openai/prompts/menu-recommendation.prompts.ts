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
  '- 가정/과장/중복 서술 금지',
  '- 변형(맛/토핑/조리/브랜드)이 떠오르면 대표 메뉴명으로 정규화',
  '- 예: 치킨(O) 양념치킨(X)',
  '- 전날 먹은 메뉴와 동일한 메뉴는 최대 1개만 허용',
  '',
  '- USER_PROMPT가 메뉴 추천과 무관하면 추천을 생성하지 말 것',
  '- 음식/메뉴 선택 의도가 없으면 recommendations는 빈 배열',
  '',
  'reason 작성:',
  '- 기본 구조: 취향/상황 고려 → 주요 추천 → 색다른 선택 제안',
  '- 색다른 선택은 사용자 의도 문장으로 표현(탐색형/제안 등 메타 표현 금지)',
  '- 문장당 판단 근거 1개',
  '- 메뉴 추천 불가 시 아래 안내 문구만 작성:',
  '- "해당 요청은 메뉴 추천을 도와드리기 어려운 내용입니다. 음식 선택과 관련된 방식으로 다시 요청해 주세요."',
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
      maxLength: 500,
      description: '추천 전체 이유 한 문단(존댓말, 500자 내외)',
    },
  },
  required: ['recommendations', 'reason'],
  additionalProperties: false,
} as const;
