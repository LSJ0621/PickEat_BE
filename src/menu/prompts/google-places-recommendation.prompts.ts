/**
 * Google Places 기반 식당 추천 프롬프트
 */

/**
 * System 프롬프트: AI의 역할과 규칙 정의
 */
export const GOOGLE_PLACES_SYSTEM_PROMPT = [
  'Pick-Eat 식당 추천 AI. 후보 중 최대 3곳 추천.',
  '',
  '규칙:',
  '- JSON만 응답. 후보(candidates) 중에서만 선택.',
  '- 검색어(메뉴)와 관련 없는 가게 제외. 가게명/리뷰/평점으로 관련성 판단.',
  '- 관련 가게가 없으면 빈 배열([]) 반환 가능.',
  '- 각 추천: placeId, name, reason (100~300자, 존댓말, 가게 특징+리뷰 기반).',
  '- 최대 3개, 관련 가게 적으면 1~2개도 가능.',
].join('\n');

/**
 * User 프롬프트 생성
 * @param query 사용자가 검색한 텍스트 (예: "덕소 마라탕")
 * @param candidates Google Places에서 가져온 후보 식당 리스트
 */
export function buildGooglePlacesUserPrompt(
  query: string,
  candidates: any[],
): string {
  const serialized = JSON.stringify(candidates, null, 2);

  return [
    `사용자 검색어: ${query}`,
    '',
    '아래는 Google Places Text Search로 가져온 후보 식당 리스트야.',
    '각 항목은 다음 정보를 포함할 수 있어:',
    '- id: Google Place ID (예: places/...)',
    '- name: 식당 이름',
    '- rating: 평점 (0~5)',
    '- userRatingCount: 리뷰 수',
    '- priceLevel: 가격대',
    '- reviews: 주요 리뷰 목록 (각 리뷰는 rating, originalText, relativePublishTimeDescription만 포함)',
    '',
    '이 후보들 중에서 사용자에게 가장 잘 맞는 식당을 최대 3곳까지 골라줘.',
    '**중요: 사용자의 검색어(메뉴)와 관련이 없는 가게는 반드시 제외해야 해.** 가게 이름, 리뷰 내용을 분석해서 실제로 해당 메뉴를 판매하는 식당인지 확인하고, 관련성이 높은 가게만 추천해.',
    '관련 없는 가게만 있으면 빈 배열([])을 반환해도 됨.',
    '가능하면 서로 너무 비슷하지 않은 조합으로 추천해.',
    '',
    '후보 리스트 (candidates):',
    serialized,
  ].join('\n');
}

/**
 * JSON Schema for Structured Outputs (장소 추천 응답 스키마)
 */
export const GOOGLE_PLACES_RECOMMENDATIONS_JSON_SCHEMA = {
  type: 'object',
  properties: {
    recommendations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          placeId: {
            type: 'string',
            description:
              'Google Place ID (예: places/ChIJAQ83WKq2fDURTPLBRn_lRjY)',
          },
          name: {
            type: 'string',
            description: '식당 이름',
          },
          reason: {
            type: 'string',
            description:
              '이 사용자의 검색어/상황을 고려했을 때 이 식당을 추천하는 구체적인 이유 (한국어, 100~300자, 경어체)',
            minLength: 100,
            maxLength: 300,
          },
        },
        required: ['placeId', 'name', 'reason'],
        additionalProperties: false,
      },
      minItems: 0,
      maxItems: 5,
      description:
        '사용자에게 추천할 식당 리스트 (최대 3개). 후보 리스트 중에서만 선택해야 함. 관련 가게가 없으면 빈 배열도 가능.',
    },
  },
  required: ['recommendations'],
  additionalProperties: false,
} as const;
