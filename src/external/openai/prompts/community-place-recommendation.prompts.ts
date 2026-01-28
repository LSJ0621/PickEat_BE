import { CommunityPlaceCandidate } from '../../../menu/interface/community-places.interface';

/**
 * Community Place based restaurant recommendation prompts
 */

/**
 * System prompt (Korean): Define AI role and rules
 */
export const COMMUNITY_PLACES_SYSTEM_PROMPT_KO = [
  '역할: 커뮤니티 등록 가게 추천 AI',
  '출력: JSON만',
  '',
  '규칙:',
  '- 후보 목록에서만 선택, 최대 5곳',
  '- 검색 쿼리(메뉴 이름)와 무관한 가게 제외',
  '- 관련 가게가 없으면 빈 배열 반환',
  '- 후보의 id를 그대로 userPlaceId로 사용',
  '- menuTypes와 category를 판단 기준으로 우선 사용',
  '- description에 추가 정보가 있으면 참고',
  '- 거리가 가까울수록 가산점 부여',
  '- matchReason: 50-150자, 존댓말 사용',
  '- matchScore: 0-100 (100이 가장 적합)',
  '- menuTypes가 메뉴 이름과 관련성 높을수록 높은 점수',
  '',
  '<language_rule>',
  '- RESPONSE_LANGUAGE 필드가 있으면 절대적 우선순위',
  '- 없으면 검색 쿼리의 언어 감지',
  '- 결정된 언어로 응답',
  '- 한국어 -> 한국어 응답 (matchReason 필드)',
  '- 영어 -> 영어 응답 (matchReason 필드)',
  '</language_rule>',
].join('\n');

/**
 * System prompt (English): Define AI role and rules
 */
export const COMMUNITY_PLACES_SYSTEM_PROMPT_EN = [
  'Role: Community place recommendation AI',
  'Output: JSON only',
  '',
  'Rules:',
  '- Select only from candidate list, maximum 5 places',
  '- Exclude stores unrelated to search query (menu name)',
  '- Return empty array if no relevant stores',
  '- Use candidate id as-is for userPlaceId',
  '- Use menuTypes and category as primary judgment criteria',
  '- Refer to description if additional information available',
  '- Give bonus points for closer distance',
  '- matchReason: 50-150 characters, polite language',
  '- matchScore: 0-100 (100 being most suitable)',
  '- Higher relevance between menuTypes and menu name yields higher score',
  '',
  '<language_rule>',
  '- RESPONSE_LANGUAGE field takes absolute priority if present',
  '- If absent, detect the language of the search query',
  '- Respond in the determined language',
  '- Korean -> Korean response (matchReason field)',
  '- English -> English response (matchReason field)',
  '</language_rule>',
].join('\n');

/**
 * Get Community Places system prompt based on language
 * @param language - Language code ('ko' | 'en')
 * @returns System prompt in the specified language
 * @default 'ko' - Korean is the default language
 */
export function getCommunityPlacesSystemPrompt(
  language: 'ko' | 'en' = 'ko',
): string {
  return language === 'en'
    ? COMMUNITY_PLACES_SYSTEM_PROMPT_EN
    : COMMUNITY_PLACES_SYSTEM_PROMPT_KO;
}

/**
 * @deprecated Use getCommunityPlacesSystemPrompt() instead
 * Maintained for backward compatibility
 */
export const COMMUNITY_PLACES_SYSTEM_PROMPT = COMMUNITY_PLACES_SYSTEM_PROMPT_KO;

/**
 * Generate user prompt
 * @param query User's menu search text (e.g., "짬뽕", "Sushi")
 * @param candidates Candidate place list from community database
 * @param language Optional language override for response ('ko' | 'en')
 */
export function buildCommunityPlacesUserPrompt(
  query: string,
  candidates: CommunityPlaceCandidate[],
  language?: 'ko' | 'en',
): string {
  const lines: string[] = [];

  if (language) {
    const langLabel = language === 'ko' ? 'Korean' : 'English';
    lines.push(`RESPONSE_LANGUAGE: ${langLabel}`);
    lines.push('');
  }

  lines.push(
    `Search query (menu name): ${query}`,
    '',
    '[Candidate list]',
    'id, name, address, menuTypes, category, description, distance (meters)',
    JSON.stringify(candidates),
    '',
    '[Request]',
    'Recommend up to 5 places related to the menu name.',
    'Prioritize places where menuTypes match the query.',
    'Consider category relevance and distance.',
    'Return empty array if none are relevant.',
    'Provide matchScore (0-100) and matchReason for each.',
  );

  return lines.join('\n');
}

/**
 * Get Community Places recommendations JSON schema based on language
 * @param language - Language code ('ko' | 'en')
 * @returns JSON schema for Community Places recommendations with language-specific descriptions
 * @default 'ko' - Korean is the default language
 */
export function getCommunityPlacesRecommendationsJsonSchema(
  language: 'ko' | 'en' = 'ko',
) {
  const descriptions = {
    ko: {
      userPlaceId: 'UserPlace ID (후보의 id를 그대로 사용)',
      name: '가게 이름',
      address: '가게 주소',
      matchReason: '추천 이유 (50-150자, 존댓말)',
      matchScore: '매칭 점수 (0-100, 100이 가장 적합)',
      recommendations: '추천 가게 (최대 5개, 관련 없으면 빈 배열)',
    },
    en: {
      userPlaceId: 'UserPlace ID (use candidate id as-is)',
      name: 'Place name',
      address: 'Place address',
      matchReason: 'Match reason (50-150 characters, polite language)',
      matchScore: 'Match score (0-100, 100 being most suitable)',
      recommendations:
        'Recommended places (max 5, empty array if none relevant)',
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
            userPlaceId: {
              type: 'number',
              description: desc.userPlaceId,
            },
            name: {
              type: 'string',
              description: desc.name,
            },
            address: {
              type: 'string',
              description: desc.address,
            },
            matchReason: {
              type: 'string',
              description: desc.matchReason,
              minLength: 50,
              maxLength: 150,
            },
            matchScore: {
              type: 'number',
              description: desc.matchScore,
              minimum: 0,
              maximum: 100,
            },
          },
          required: [
            'userPlaceId',
            'name',
            'address',
            'matchReason',
            'matchScore',
          ],
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

/**
 * @deprecated Use getCommunityPlacesRecommendationsJsonSchema() instead
 * Maintained for backward compatibility
 */
export const COMMUNITY_PLACES_RECOMMENDATIONS_JSON_SCHEMA =
  getCommunityPlacesRecommendationsJsonSchema('ko');
