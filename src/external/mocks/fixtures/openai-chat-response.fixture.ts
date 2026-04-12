/**
 * OpenAI Chat/Responses API fixture responses
 *
 * TwoStageMenuService, OpenAiPlacesService 등 실제 서비스를 E2E 테스트에서
 * 사용할 때, OpenAI SDK의 chat.completions.create / responses.create 호출에
 * 대한 fixture 응답을 제공합니다.
 */

// ============================================
// Stage 1: Validation Response (Gpt4oMiniValidationService)
// ============================================
export const mockValidationResponse = {
  id: 'chatcmpl-mock-validation',
  object: 'chat.completion',
  created: 1677652288,
  model: 'gpt-4o-mini',
  choices: [
    {
      index: 0,
      message: {
        role: 'assistant',
        content: JSON.stringify({
          isValid: true,
          invalidReason: '',
          intent: 'specific_dish',
          constraints: { budget: 'medium', dietary: [], urgency: 'normal' },
          suggestedCategories: ['한식'],
        }),
      },
      finish_reason: 'stop',
    },
  ],
  usage: { prompt_tokens: 50, completion_tokens: 30, total_tokens: 80 },
};

// ============================================
// Stage 2: Menu Recommendation Response (Gpt51MenuService / GptWebSearchMenuService)
// ============================================
export const mockMenuRecommendationResponse = {
  id: 'chatcmpl-mock-recommendation',
  object: 'chat.completion',
  created: 1677652288,
  model: 'gpt-5.1',
  choices: [
    {
      index: 0,
      message: {
        role: 'assistant',
        content: JSON.stringify({
          intro: '추운 날씨에는 따뜻한 국물 요리가 몸을 녹이고 속을 편안하게 해줍니다. 오늘은 든든하면서도 소화가 잘 되는 찌개류를 추천드립니다.',
          recommendations: [
            { condition: '얼큰하게 속을 풀고 싶다면', menu: '김치찌개' },
            { condition: '구수한 맛을 원한다면', menu: '된장찌개' },
            { condition: '부드럽고 가벼운 걸 원한다면', menu: '순두부찌개' },
          ],
          closing: '따뜻하게 드시고 좋은 하루 보내세요.',
        }),
      },
      finish_reason: 'stop',
    },
  ],
  usage: { prompt_tokens: 200, completion_tokens: 150, total_tokens: 350 },
};

// ============================================
// Places Recommendation Response (OpenAiPlacesService)
// ============================================
export const mockPlacesRecommendationResponse = {
  id: 'chatcmpl-mock-places',
  object: 'chat.completion',
  created: 1677652288,
  model: 'gpt-4o-mini',
  choices: [
    {
      index: 0,
      message: {
        role: 'assistant',
        content: JSON.stringify({
          recommendations: [
            {
              placeId: 'ChIJN1t_tDeuEmsRUsoyG83frY4',
              name: '맛있는 한식당',
              reason: '리뷰가 좋고 위치가 편리합니다.',
              reasonTags: [],
            },
          ],
        }),
      },
      finish_reason: 'stop',
    },
  ],
  usage: { prompt_tokens: 120, completion_tokens: 80, total_tokens: 200 },
};

// ============================================
// Web Search Summary Response (WebSearchSummaryService - Responses API)
// ============================================
export const mockWebSearchSummaryResponse = {
  output_text: JSON.stringify({
    localTrends: ['김치찌개', '된장찌개'],
    demographicFavorites: ['비빔밥'],
    seasonalItems: ['냉면'],
    confidence: 'medium',
    summary: '강남구 지역에서 인기 있는 한식 메뉴입니다.',
  }),
  usage: { input_tokens: 100, output_tokens: 50 },
};

// ============================================
// Mock OpenAI SDK Factory
// ============================================

/**
 * json_schema.name 기반으로 적절한 fixture 응답을 반환하는 mock chat SDK
 */
export function createMockOpenAIChatSDK() {
  const mockCreate = async (params: Record<string, unknown>) => {
    const responseFormat = params?.response_format as
      | Record<string, unknown>
      | undefined;
    const jsonSchema = responseFormat?.json_schema as
      | Record<string, unknown>
      | undefined;
    const schemaName = jsonSchema?.name as string | undefined;

    switch (schemaName) {
      case 'menu_validation':
        return mockValidationResponse;
      case 'google_places_recommendations':
        return mockPlacesRecommendationResponse;
      default:
        return mockMenuRecommendationResponse;
    }
  };

  return {
    chat: {
      completions: {
        create: mockCreate,
      },
    },
  };
}

/**
 * chat.completions.create + responses.create 모두 지원하는 mock SDK
 * (WebSearchSummaryService는 responses.create 사용)
 */
export function createMockOpenAIWithResponsesSDK() {
  const chatSDK = createMockOpenAIChatSDK();
  return {
    ...chatSDK,
    responses: {
      create: async () => mockWebSearchSummaryResponse,
    },
  };
}
