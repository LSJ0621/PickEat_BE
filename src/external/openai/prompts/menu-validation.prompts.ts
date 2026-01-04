/**
 * Stage 1: 메뉴 요청 검증 및 의도 분류 프롬프트
 * GPT-4o-mini를 사용하여 빠르고 저렴하게 요청 유효성 검증
 */

export const VALIDATION_SYSTEM_PROMPT = [
  '당신은 음식 요청 분석 전문가입니다.',
  '사용자의 요청이 음식/메뉴 선택과 관련이 있는지 빠르게 판단하고, 요청 의도를 분류합니다.',
  '',
  '<역할>',
  '- 음식/메뉴 추천 요청인지 검증 (스팸, 무관한 요청 필터링)',
  '- 요청의 의도를 분류 (선호도 기반, 기분 기반, 장소 기반, 혼합)',
  '- 제약사항 추출 (예산, 식이 제한, 긴급도)',
  '- 대략적인 음식 카테고리 제안',
  '</역할>',
  '',
  '<판단_기준>',
  '1. isValid: true',
  '   - 음식, 메뉴, 식당 선택과 관련된 요청',
  '   - 예: "오늘 점심 뭐 먹을까", "매운 음식 추천해줘", "회식 장소 추천"',
  '   - invalidReason은 빈 문자열("")로 설정',
  '',
  '2. isValid: false',
  '   - 음식과 무관한 요청 (날씨, 뉴스, 일반 대화 등)',
  '   - 스팸성 요청',
  '   - 의미 없는 텍스트',
  '   - invalidReason에 거부 사유를 명확히 작성',
  '</판단_기준>',
  '',
  '<의도_분류>',
  '- preference: 선호도 기반 ("한식 좋아해", "매운 거 먹고 싶어")',
  '- mood: 기분/상황 기반 ("속 편한 음식", "기분 전환하고 싶어")',
  '- location: 장소 기반 ("회식", "데이트", "혼밥")',
  '- mixed: 복합적 요청',
  '</의도_분류>',
  '',
  '<제약사항_추출>',
  '- budget: 예산 언급 시 low/medium/high 중 판단, 언급 없으면 medium으로 설정',
  '- dietary: 식이 제한 (채식, 알레르기, 종교적 제약 등), 없으면 빈 배열 []',
  '- urgency: 긴급도 (빨리 먹어야 함 = quick, 일반 = normal), 언급 없으면 normal로 설정',
  '</제약사항_추출>',
  '',
  '<카테고리_제안>',
  '- 요청에서 유추 가능한 대략적 음식 카테고리 제안',
  '- 예: ["한식", "일식", "양식"], ["국물요리", "면요리"] 등',
  '- 최대 3개까지, 유추 불가능하면 빈 배열 []',
  '</카테고리_제안>',
  '',
  '<중요: 모든 필드 필수>',
  '- 모든 응답 필드는 반드시 포함되어야 합니다',
  '- isValid=true일 때: invalidReason은 빈 문자열(""), 나머지 필드는 적절히 설정',
  '- isValid=false일 때: invalidReason에 거부 사유 작성, 나머지 필드는 기본값으로 설정',
  '  (intent="preference", constraints={budget:"medium", dietary:[], urgency:"normal"}, suggestedCategories=[])',
  '</중요: 모든 필드 필수>',
].join('\n');

export function buildValidationUserPrompt(
  userPrompt: string,
  likes: string[],
  dislikes: string[],
): string {
  return [
    'USER_REQUEST:',
    userPrompt,
    '---',
    'USER_PREFERENCES (참고용):',
    `선호: ${likes?.length ? likes.join(', ') : '없음'}`,
    `비선호: ${dislikes?.length ? dislikes.join(', ') : '없음'}`,
  ].join('\n');
}

export const VALIDATION_JSON_SCHEMA = {
  type: 'object',
  properties: {
    isValid: {
      type: 'boolean',
      description: '음식 관련 요청이면 true, 아니면 false',
    },
    invalidReason: {
      type: 'string',
      description:
        'isValid=false일 때 거부 사유 (isValid=true일 경우 빈 문자열)',
    },
    intent: {
      type: 'string',
      enum: ['preference', 'mood', 'location', 'mixed'],
      description: '요청 의도 분류',
    },
    constraints: {
      type: 'object',
      properties: {
        budget: {
          type: 'string',
          enum: ['low', 'medium', 'high'],
          description: '예산 수준',
        },
        dietary: {
          type: 'array',
          items: { type: 'string' },
          description: '식이 제한 사항',
        },
        urgency: {
          type: 'string',
          enum: ['quick', 'normal'],
          description: '긴급도',
        },
      },
      required: ['budget', 'dietary', 'urgency'],
      additionalProperties: false,
    },
    suggestedCategories: {
      type: 'array',
      items: { type: 'string' },
      maxItems: 3,
      description: '제안 음식 카테고리 (최대 3개)',
    },
  },
  required: [
    'isValid',
    'invalidReason',
    'intent',
    'constraints',
    'suggestedCategories',
  ],
  additionalProperties: false,
} as const;
