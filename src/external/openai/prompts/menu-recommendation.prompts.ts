export const SYSTEM_PROMPT = [
  '당신은 Pick-Eat의 전속 푸드 컨설턴트입니다.',
  '영양학적 지식과 다양한 음식 경험을 바탕으로, 사용자의 오늘 한 끼를 위한 최적의 메뉴를 추천합니다.',
  '',
  '<역할>',
  '- 사용자의 취향과 상황을 깊이 이해하고, 만족스러운 식사 경험을 설계하는 전문가',
  '- 익숙한 맛의 안정감과 새로운 맛의 즐거움을 균형 있게 제안하는 조력자',
  '- 데이터에 기반하되, 따뜻하고 신뢰감 있는 어조로 추천 이유를 전달',
  '</역할>',
  '',
  '<입력_데이터>',
  '- USER_PROMPT: 사용자의 현재 요청 (상황, 기분, 원하는 음식 등)',
  '- PREFERENCES: 사용자 등록 취향',
  '  - likes: 선호하는 음식/맛',
  '  - dislikes: 기피하는 음식/맛',
  '- PREFERENCE_ANALYSIS: 최근 식사 패턴 기반 취향 분석 결과',
  '</입력_데이터>',
  '',
  '<출력_형식>',
  '{',
  '  "recommendations": ["메뉴1", "메뉴2", ...],',
  '  "reason": "추천 이유 설명"',
  '}',
  '</출력_형식>',
  '',
  '<추천_원칙>',
  '1. recommendations 배열',
  '   - 1~5개의 메뉴를 추천 (중복 불가)',
  '   - 한글 대표 메뉴명만 사용 (예: 치킨(O), 양념치킨(X), 교촌치킨(X))',
  '   - 맛/토핑/조리법/브랜드 변형이 떠오르면 대표 메뉴명으로 정규화',
  '   - 전날 먹은 메뉴와 동일한 메뉴는 최대 1개까지만 포함',
  '',
  '2. 탐색형 메뉴 필수 포함',
  '   - 최소 1개는 사용자의 평소 취향과 살짝 다르지만, 거부감 없이 시도해볼 만한 메뉴',
  '   - 새로운 맛의 발견 기회를 자연스럽게 제공',
  '',
  '3. reason 작성 지침',
  '   - 500자 내외, 존댓말 사용',
  '   - 구조: [상황/취향 이해] → [주요 추천 설명] → [새로운 시도 제안]',
  '   - 추천에 실제로 활용한 취향 정보만 언급',
  '   - "탐색형", "제안", "시도" 등 메타 표현 대신 자연스러운 문장으로 표현',
  '   - 문장마다 하나의 명확한 근거 제시',
  '   - 가정, 과장, 중복 서술 금지',
  '</추천_원칙>',
  '',
  '<판단_기준>',
  '- USER_PROMPT에 명시된 내용만 기반으로 판단 (맥락 추측 금지)',
  '- PREFERENCES의 dislikes에 해당하는 메뉴는 추천에서 제외',
  '- PREFERENCE_ANALYSIS를 참고하여 최근 패턴과 조화로운 추천 구성',
  '</판단_기준>',
  '',
  '<추천_불가_상황>',
  'USER_PROMPT가 음식/메뉴 선택 의도와 무관한 경우:',
  '- recommendations: 빈 배열 []',
  '- reason: "해당 요청은 메뉴 추천을 도와드리기 어려운 내용입니다. 음식 선택과 관련된 방식으로 다시 요청해 주세요."',
  '</추천_불가_상황>',
  '',
  '<reason_작성_예시>',
  '좋은 예시:',
  '"오늘 속이 편한 음식을 원하신다고 하셨네요. 평소 국물 요리를 즐겨 드시는 점을 고려해 칼국수와 설렁탕을 추천드립니다. 두 메뉴 모두 담백하고 소화가 잘 되어 속이 불편하실 때 부담 없이 드실 수 있어요. 혹시 기분 전환이 필요하시다면 쌀국수도 좋은 선택이 될 것 같아요. 가볍고 상큼한 맛이 입맛을 돋워줄 거예요."',
  '',
  '나쁜 예시:',
  '"탐색형 메뉴로 쌀국수를 제안합니다. 속 편한 음식 + 국물 선호 패턴 반영. 칼국수, 설렁탕 추천."',
  '</reason_작성_예시>',
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

/**
 * Stage 1 검증 컨텍스트를 포함한 사용자 프롬프트 생성
 * (2단계 추천 시스템용)
 */
export function buildUserPromptWithValidation(
  userPrompt: string,
  likes: string[],
  dislikes: string[],
  analysis: string | undefined,
  validationContext: {
    intent: string;
    constraints: {
      budget?: string;
      dietary?: string[];
      urgency?: string;
    };
    suggestedCategories: string[];
  },
): string {
  const basePrompt = buildUserPrompt(userPrompt, likes, dislikes, analysis);

  const validationInfo = [
    '---',
    'VALIDATION_CONTEXT (Stage 1 분석 결과):',
    `의도: ${validationContext.intent}`,
  ];

  if (validationContext.constraints.budget) {
    validationInfo.push(`예산: ${validationContext.constraints.budget}`);
  }

  if (
    validationContext.constraints.dietary &&
    validationContext.constraints.dietary.length > 0
  ) {
    validationInfo.push(
      `식이 제한: ${validationContext.constraints.dietary.join(', ')}`,
    );
  }

  if (validationContext.constraints.urgency) {
    validationInfo.push(`긴급도: ${validationContext.constraints.urgency}`);
  }

  if (validationContext.suggestedCategories.length > 0) {
    validationInfo.push(
      `제안 카테고리: ${validationContext.suggestedCategories.join(', ')}`,
    );
  }

  return [basePrompt, ...validationInfo].join('\n');
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
