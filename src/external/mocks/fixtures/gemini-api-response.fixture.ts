/**
 * Gemini API Mock 응답 (SDK generateContent 레벨)
 *
 * 실제 GeminiClient의 파싱 로직을 실행하기 위해
 * SDK가 반환하는 형태의 raw response를 제공합니다.
 *
 * GeminiClient가 처리하는 로직:
 * 1. usageMetadata 로깅
 * 2. groundingChunks에서 placeId 추출 (Maps chunk)
 * 3. googleMapsWidgetContextToken 추출
 * 4. JSON 텍스트 파싱 (extractJsonFromText)
 * 5. placeId 매칭 (이름 기반)
 * 6. 중복 placeId 제거
 */
export const mockGeminiApiResponse = {
  text: JSON.stringify({
    restaurants: [
      {
        nameKo: '테스트 맛집 1',
        nameEn: 'Test Restaurant 1',
        nameLocal: null,
        reason:
          '신선한 재료와 정성스러운 조리로 많은 손님들에게 사랑받는 곳입니다. 특히 점심 시간대에 인기가 많으며 가성비가 좋습니다.',
        reasonTags: ['신선한 재료', '가성비', '점심 추천'],
        addressKo: '서울특별시 강남구 테헤란로 123',
        addressEn: '123 Teheran-ro, Gangnam-gu, Seoul',
        addressLocal: null,
        latitude: 37.5012,
        longitude: 127.0396,
      },
      {
        nameKo: '테스트 맛집 2',
        nameEn: 'Test Restaurant 2',
        nameLocal: null,
        reason:
          '분위기 좋고 서비스가 친절한 곳으로 유명합니다. 메뉴가 다양하고 맛도 훌륭하여 재방문율이 높습니다.',
        reasonTags: ['친절한 서비스', '다양한 메뉴', '재방문 높음'],
        addressKo: '서울특별시 강남구 역삼동 456',
        addressEn: '456 Yeoksam-dong, Gangnam-gu, Seoul',
        addressLocal: null,
        latitude: 37.5005,
        longitude: 127.0365,
      },
      {
        nameKo: '테스트 맛집 3',
        nameEn: 'Test Restaurant 3',
        nameLocal: null,
        reason:
          '오랜 전통을 자랑하는 맛집으로 현지인들에게 특히 인기가 많습니다. 가격도 합리적이며 양도 푸짐합니다.',
        reasonTags: ['오랜 전통', '현지인 맛집', '푸짐한 양'],
        addressKo: '서울특별시 강남구 삼성동 789',
        addressEn: '789 Samsung-dong, Gangnam-gu, Seoul',
        addressLocal: null,
        latitude: 37.5088,
        longitude: 127.0632,
      },
    ],
  }),
  usageMetadata: {
    promptTokenCount: 150,
    candidatesTokenCount: 300,
    totalTokenCount: 450,
  },
  candidates: [
    {
      content: {
        parts: [
          {
            text: null, // text is provided at top-level via response.text
          },
        ],
      },
      finishReason: 'STOP',
      groundingMetadata: {
        groundingChunks: [
          {
            maps: {
              title: '테스트 맛집 1',
              placeId: 'places/ChIJN1t_tDeuEmsRUsoyG83frY4',
            },
          },
          {
            maps: {
              title: '테스트 맛집 2',
              placeId: 'places/ChIJLwPMoJymQTURkgM1Y27Tk9Y',
            },
          },
          // No chunk for 맛집 3 → placeId will be null after matching
        ],
        googleMapsWidgetContextToken: 'mock_widget_token_123',
      },
    },
  ],
};
