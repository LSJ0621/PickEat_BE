/**
 * E2E 테스트용 Mock 응답 데이터
 * test/mocks/external-clients.mock.ts의 데이터를 재활용
 */

// ============================================
// Google Places API Mock Responses
// ============================================
export const mockGooglePlacesResponses = {
  searchSuccess: {
    places: [
      {
        id: 'ChIJN1t_tDeuEmsRUsoyG83frY4',
        displayName: { text: '맛있는 한식당', languageCode: 'ko' },
        formattedAddress: '서울특별시 강남구 테헤란로 123',
        rating: 4.5,
        userRatingCount: 100,
        location: { latitude: 37.5012345, longitude: 127.0398765 },
        photos: [{ name: 'places/mock-photo-1' }],
      },
      {
        id: 'ChIJN2t_tDeuEmsRUsoyG83frY5',
        displayName: { text: '맛있는 중식당', languageCode: 'ko' },
        formattedAddress: '서울특별시 강남구 역삼로 456',
        rating: 4.3,
        userRatingCount: 80,
        location: { latitude: 37.5023456, longitude: 127.0409876 },
        photos: [{ name: 'places/mock-photo-2' }],
      },
    ],
  },
  placeDetailsSuccess: {
    id: 'ChIJN1t_tDeuEmsRUsoyG83frY4',
    displayName: { text: '맛있는 한식당', languageCode: 'ko' },
    formattedAddress: '서울특별시 강남구 테헤란로 123',
    rating: 4.5,
    userRatingCount: 100,
    location: { latitude: 37.5012345, longitude: 127.0398765 },
    reviews: [
      {
        text: { text: '맛있어요! 강추합니다.', languageCode: 'ko' },
        rating: 5,
        publishTime: '2024-01-01T00:00:00Z',
      },
    ],
    photos: [{ name: 'places/mock-photo-1' }],
    regularOpeningHours: {
      openNow: true,
      weekdayDescriptions: [
        '월요일: 11:00 ~ 22:00',
        '화요일: 11:00 ~ 22:00',
        '수요일: 11:00 ~ 22:00',
        '목요일: 11:00 ~ 22:00',
        '금요일: 11:00 ~ 22:00',
        '토요일: 11:00 ~ 22:00',
        '일요일: 휴무',
      ],
    },
  },
  photoUri: 'https://mock-google-photos.example.com/photo123.jpg',
};

// ============================================
// Google CSE (Custom Search) Mock Responses
// ============================================
export const mockGoogleCseResponses = {
  searchSuccess: [
    {
      title: '강남 맛집 리뷰 - 맛있는 한식당',
      url: 'https://blog.example.com/gangnam-restaurant-1',
      snippet: '서울 강남구에서 가장 맛있는 한식당을 소개합니다...',
      thumbnailUrl: 'https://example.com/thumb1.jpg',
      source: 'Example Blog',
    },
    {
      title: '역삼동 점심 추천 - 중식 맛집',
      url: 'https://blog.example.com/yeoksam-restaurant-2',
      snippet: '역삼동에서 점심 먹기 좋은 중식당을 추천해드립니다...',
      thumbnailUrl: 'https://example.com/thumb2.jpg',
      source: 'Food Blog',
    },
  ],
};

// ============================================
// Kakao Local API Mock Responses
// ============================================
export const mockKakaoLocalResponses = {
  addressSearchSuccess: {
    meta: {
      total_count: 1,
      pageable_count: 1,
      is_end: true,
    },
    addresses: [
      {
        address: '서울특별시 강남구 역삼동',
        roadAddress: '서울특별시 강남구 테헤란로 123',
        postalCode: '06234',
        latitude: '37.5012345',
        longitude: '127.0398765',
      },
    ],
  },
};

// ============================================
// Naver Search API Mock Responses
// ============================================
export const mockNaverSearchResponses = {
  localSearchSuccess: [
    {
      title: '<b>맛있는</b> 한식당',
      link: 'https://example.com/restaurant1',
      category: '음식점>한식',
      description: '정통 한식 전문점입니다.',
      telephone: '02-1234-5678',
      address: '서울특별시 강남구 역삼동 123-45',
      roadAddress: '서울특별시 강남구 테헤란로 123',
      mapx: '1270398765',
      mapy: '375012345',
    },
    {
      title: '<b>맛있는</b> 중식당',
      link: 'https://example.com/restaurant2',
      category: '음식점>중식',
      description: '정통 중식 전문점입니다.',
      telephone: '02-2345-6789',
      address: '서울특별시 강남구 역삼동 234-56',
      roadAddress: '서울특별시 강남구 역삼로 456',
      mapx: '1270409876',
      mapy: '375023456',
    },
  ],
};

// ============================================
// Naver Map API Mock Responses
// ============================================
export const mockNaverMapResponses = {
  reverseGeocodeSuccess: [
    {
      name: 'legalcode',
      code: {
        id: '1168010600',
        type: 'L',
        mappingId: '09680106',
      },
      region: {
        area0: { name: 'kr', coords: { center: { x: 0, y: 0 } } },
        area1: {
          name: '서울특별시',
          coords: { center: { x: 127.0398765, y: 37.5012345 } },
        },
        area2: {
          name: '강남구',
          coords: { center: { x: 127.0398765, y: 37.5012345 } },
        },
        area3: {
          name: '역삼동',
          coords: { center: { x: 127.0398765, y: 37.5012345 } },
        },
        area4: { name: '', coords: { center: { x: 0, y: 0 } } },
      },
    },
  ],
};

// ============================================
// OpenAI API Mock Responses
// ============================================
export const mockOpenAIResponses = {
  menuRecommendationSuccess: {
    id: 'chatcmpl-mock-123',
    object: 'chat.completion',
    created: 1677652288,
    model: 'gpt-4o-mini',
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: JSON.stringify({
            menus: [
              {
                name: '김치찌개',
                category: '한식',
                reason: '추운 날씨에 딱 맞는 따뜻한 국물 요리입니다.',
              },
              {
                name: '된장찌개',
                category: '한식',
                reason: '건강에 좋은 전통 한식입니다.',
              },
              {
                name: '순두부찌개',
                category: '한식',
                reason: '부드럽고 담백한 맛이 일품입니다.',
              },
            ],
          }),
        },
        finish_reason: 'stop',
      },
    ],
    usage: {
      prompt_tokens: 100,
      completion_tokens: 150,
      total_tokens: 250,
    },
  },
  menuValidationSuccess: {
    id: 'chatcmpl-mock-456',
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
            category: '한식',
            suggestions: [],
          }),
        },
        finish_reason: 'stop',
      },
    ],
    usage: {
      prompt_tokens: 50,
      completion_tokens: 30,
      total_tokens: 80,
    },
  },
  preferenceAnalysisSuccess: {
    id: 'chatcmpl-mock-789',
    object: 'chat.completion',
    created: 1677652288,
    model: 'gpt-4o-mini',
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: JSON.stringify({
            likes: ['한식', '국물 요리', '매운 음식'],
            dislikes: ['느끼한 음식'],
            analysis: '사용자는 한식을 선호하며 특히 국물 요리를 좋아합니다.',
          }),
        },
        finish_reason: 'stop',
      },
    ],
    usage: {
      prompt_tokens: 80,
      completion_tokens: 60,
      total_tokens: 140,
    },
  },
  placesRecommendationSuccess: {
    id: 'chatcmpl-mock-101',
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
                reason: '리뷰가 좋고 위치가 편리합니다.',
                score: 4.5,
              },
            ],
          }),
        },
        finish_reason: 'stop',
      },
    ],
    usage: {
      prompt_tokens: 120,
      completion_tokens: 80,
      total_tokens: 200,
    },
  },
};

// ============================================
// AWS S3 Mock Responses
// ============================================
export const mockS3Responses = {
  uploadSuccess: 'https://mock-s3.example.com/bug-reports/mock-image-123.jpg',
};

// ============================================
// Discord Webhook Mock (void response)
// ============================================
export const mockDiscordResponses = {
  sendSuccess: undefined, // void
};
