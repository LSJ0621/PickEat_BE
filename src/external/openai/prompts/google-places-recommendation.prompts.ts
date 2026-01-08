import { PlaceCandidate } from '../../../menu/interface/openai-places.interface';

/**
 * Google Places 기반 식당 추천 프롬프트
 */

/**
 * System 프롬프트: AI의 역할과 규칙 정의
 */
export const GOOGLE_PLACES_SYSTEM_PROMPT = [
  '역할: Pick-Eat 식당 추천 AI',
  '출력: JSON만',
  '',
  '규칙:',
  '- 후보 리스트에서만 선택, 최대 3곳',
  '- 검색어와 무관한 가게 제외',
  '- 관련 가게 없으면 빈 배열',
  '- placeId는 후보 id 그대로 사용',
  '- 가게명보다 리뷰를 판단 기준으로 사용',
  '- 메뉴 판매 여부는 리뷰에 명시된 경우만 인정',
  '- reason: 100~300자, 존댓말',
  '- 리뷰에서 반복 언급된 맛/품질/양/재방문을 근거로 작성',
].join('\n');

/**
 * User 프롬프트 생성
 * @param query 사용자가 검색한 텍스트 (예: "덕소 마라탕")
 * @param candidates Google Places에서 가져온 후보 식당 리스트
 */
export function buildGooglePlacesUserPrompt(
  query: string,
  candidates: PlaceCandidate[],
): string {
  return [
    `검색어: ${query}`,
    '',
    '[후보 리스트]',
    'id, name, rating, userRatingCount, priceLevel, reviews',
    JSON.stringify(candidates),
    '',
    '[요청]',
    '검색어와 관련된 식당만 최대 3곳 추천.',
    '리뷰가 없는 경우 판단하지 말 것.',
    '관련 없으면 빈 배열.',
    '조합 다양성 고려.',
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
            description: 'Google Place ID (후보 id 그대로)',
          },
          name: {
            type: 'string',
            description: '식당 이름',
          },
          reason: {
            type: 'string',
            description: '추천 이유 (100~300자, 존댓말)',
            minLength: 100,
            maxLength: 300,
          },
        },
        required: ['placeId', 'name', 'reason'],
        additionalProperties: false,
      },
      minItems: 0,
      maxItems: 5,
      description: '추천 식당 (최대 3개, 관련 없으면 빈 배열 가능)',
    },
  },
  required: ['recommendations'],
  additionalProperties: false,
} as const;
