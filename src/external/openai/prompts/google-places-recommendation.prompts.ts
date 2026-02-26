import { PlaceCandidate } from '@/menu/interfaces/openai-places.interface';

/**
 * Google Places based restaurant recommendation prompts
 */

/**
 * System prompt (Korean): Define AI role and rules
 */
export const GOOGLE_PLACES_SYSTEM_PROMPT_KO = [
  '역할: Pick-Eat 레스토랑 추천 AI',
  '출력: JSON만',
  '',
  '규칙:',
  '- 후보 목록에서만 선택, 최대 3곳',
  '- 검색 쿼리와 무관한 가게 제외',
  '- 관련 가게가 없으면 빈 배열 반환',
  '- 후보의 id를 그대로 placeId로 사용',
  '- 가게 이름보다 리뷰를 판단 기준으로 사용',
  '- 리뷰에 명시적으로 언급된 경우에만 메뉴 제공 인정',
  '- reason: 150-200자, 존댓말, 핵심 강점 위주 간결하게',
  '- reasonTags: 가게의 핵심 특징 키워드 2-3개 (예: ["매운맛 강추", "양 많음"])',
  '- 리뷰에서 반복적으로 언급되는 맛/품질/양/재방문 기반 추천 이유 작성',
  '',
  '<language_rule>',
  '- RESPONSE_LANGUAGE 필드가 있으면 절대적 우선순위',
  '- 없으면 검색 쿼리의 언어 감지',
  '- 결정된 언어로 응답',
  '- 한국어 -> 한국어 응답 (reason 필드)',
  '- 영어 -> 영어 응답 (reason 필드)',
  '</language_rule>',
].join('\n');

/**
 * System prompt (English): Define AI role and rules
 */
export const GOOGLE_PLACES_SYSTEM_PROMPT_EN = [
  'Role: Pick-Eat restaurant recommendation AI',
  'Output: JSON only',
  '',
  'Rules:',
  '- Select only from candidate list, maximum 3 places',
  '- Exclude stores unrelated to search query',
  '- Return empty array if no relevant stores',
  '- Use candidate id as-is for placeId',
  '- Use reviews rather than store name as judgment criteria',
  '- Only acknowledge menu availability if explicitly mentioned in reviews',
  '- reason: 150-200 characters, polite language, focus on key strengths concisely',
  '- reasonTags: 2-3 keyword tags highlighting key features (e.g., ["spicy flavor", "large portions"])',
  '- Base reasoning on repeatedly mentioned taste/quality/portion/revisit in reviews',
  '',
  '<language_rule>',
  '- RESPONSE_LANGUAGE field takes absolute priority if present',
  '- If absent, detect the language of the search query',
  '- Respond in the determined language',
  '- Korean -> Korean response (reason field)',
  '- English -> English response (reason field)',
  '</language_rule>',
].join('\n');

/**
 * Get Google Places system prompt based on language
 * @param language - Language code ('ko' | 'en')
 * @returns System prompt in the specified language
 * @default 'ko' - Korean is the default language
 */
export function getGooglePlacesSystemPrompt(
  language: 'ko' | 'en' = 'ko',
): string {
  return language === 'en'
    ? GOOGLE_PLACES_SYSTEM_PROMPT_EN
    : GOOGLE_PLACES_SYSTEM_PROMPT_KO;
}

/**
 * Generate user prompt
 * @param query User's search text (e.g., "Malatang near Deokso")
 * @param candidates Candidate restaurant list from Google Places
 * @param language Optional language override for response ('ko' | 'en')
 */
export function buildGooglePlacesUserPrompt(
  query: string,
  candidates: PlaceCandidate[],
  language?: 'ko' | 'en',
): string {
  const lines: string[] = [];

  if (language) {
    const langLabel = language === 'ko' ? 'Korean' : 'English';
    lines.push(`RESPONSE_LANGUAGE: ${langLabel}`);
    lines.push('');
  }

  lines.push(
    `Search query: ${query}`,
    '',
    '[Candidate list]',
    'id, name, rating, userRatingCount, priceLevel, reviews',
    JSON.stringify(candidates),
    '',
    '[Request]',
    'Recommend up to 3 restaurants related to the search query.',
    'Do not make judgments if there are no reviews.',
    'Return empty array if none are relevant.',
    'Consider variety in combinations.',
  );

  return lines.join('\n');
}

/**
 * Get Google Places recommendations JSON schema based on language
 * @param language - Language code ('ko' | 'en')
 * @returns JSON schema for Google Places recommendations with language-specific descriptions
 * @default 'ko' - Korean is the default language
 */
export function getGooglePlacesRecommendationsJsonSchema(
  language: 'ko' | 'en' = 'ko',
) {
  const descriptions = {
    ko: {
      placeId: 'Google Place ID (후보의 id를 그대로 사용)',
      name: '레스토랑 이름',
      reason: '추천 이유 (150-200자, 존댓말)',
      reasonTags: '핵심 특징 키워드 태그 (2-3개)',
      recommendations: '추천 레스토랑 (최대 3개, 관련 없으면 빈 배열)',
    },
    en: {
      placeId: 'Google Place ID (use candidate id as-is)',
      name: 'Restaurant name',
      reason: 'Recommendation reason (150-200 characters, polite language)',
      reasonTags: 'Key feature keyword tags (2-3)',
      recommendations:
        'Recommended restaurants (max 3, empty array if none relevant)',
    },
  };

  const desc = descriptions[language];

  return {
    type: 'object',
    properties: {
      recommendations: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            placeId: {
              type: 'string',
              description: desc.placeId,
            },
            name: {
              type: 'string',
              description: desc.name,
            },
            reason: {
              type: 'string',
              description: desc.reason,
              minLength: 150,
              maxLength: 200,
            },
            reasonTags: {
              type: 'array',
              items: { type: 'string', maxLength: 10 },
              minItems: 2,
              maxItems: 3,
              description: desc.reasonTags,
            },
          },
          required: ['placeId', 'name', 'reason', 'reasonTags'],
          additionalProperties: false,
        },
        minItems: 0,
        maxItems: 5,
        description: desc.recommendations,
      },
    },
    required: ['recommendations'],
    additionalProperties: false,
  } as const;
}
