/**
 * Google Places 기반 식당 추천 프롬프트
 */

/**
 * System 프롬프트: AI의 역할과 규칙 정의
 */
export const GOOGLE_PLACES_SYSTEM_PROMPT = [
  '너는 Pick-Eat 앱을 위한 **식당 추천 전문 AI**야.',
  '백엔드에서 이미 Google Places Text Search로 후보 식당 리스트를 수집했고,',
  '너에게는 그 후보들 중에서 **사용자에게 가장 잘 맞는 식당 3곳 이내**를 고르는 일을 맡길 거야.',
  '',
  '중요 규칙:',
  '- 반드시 JSON 형식으로만 응답해야 해. JSON 밖에 다른 텍스트를 쓰지 마.',
  '- 추천 대상은 이미 전달된 후보 목록(candidates) 뿐이고, 그 외 새로운 식당을 만들어내면 안 돼.',
  '- 각 추천에는 placeId, name, reason 을 포함해야 해.',
  '- reason 은 반드시 공손한 한국어 경어체(예: "~합니다", "~드립니다")로 작성해야 해.',
  '- reason 은 100자 이상, 300자 이내로, 해당 가게의 특징·장점과 Google 리뷰에서 유추할 수 있는 분위기나 만족도를 한 문장 또는 두 문장 정도의 서술형으로 정리해.',
  '- 최대 3곳까지만 추천하고, 후보가 적으면 1~2개만 추천해도 괜찮아.',
].join('\n');

/**
 * User 프롬프트 생성
 * @param query 사용자가 검색한 텍스트 (예: "덕소 마라탕")
 * @param candidates Google Places에서 가져온 후보 식당 리스트 (이미 businessStatus=OPERATIONAL 만 포함되었다고 가정)
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
    '- address: 주소',
    '- location: { latitude, longitude }',
    '- rating: 평점 (0~5)',
    '- userRatingCount: 리뷰 수',
    '- priceLevel / priceRange: 가격대',
    '- businessStatus: 영업 상태 (이미 OPERATIONAL 인 것만 포함됨)',
    '- reviews: 주요 리뷰 목록',
    '- reviewSummary: 리뷰 요약 정보 (있을 수도, 없을 수도 있음)',
    '',
    '이 후보들 중에서 사용자에게 가장 잘 맞는 식당을 최대 3곳까지 골라줘.',
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
      minItems: 2,
      maxItems: 5,
      description:
        '사용자에게 추천할 식당 리스트 (최대 3개). 후보 리스트 중에서만 선택해야 함.',
    },
  },
  required: ['recommendations'],
  additionalProperties: false,
} as const;


