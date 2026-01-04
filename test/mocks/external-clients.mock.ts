import { of, throwError } from 'rxjs';
import { AxiosResponse, AxiosError } from 'axios';

/**
 * Mock HttpService from @nestjs/axios
 * Returns RxJS observables for get/post/put/delete/patch methods
 */
export function createMockHttpService() {
  return {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
    patch: jest.fn(),
    head: jest.fn(),
    request: jest.fn(),
    axiosRef: {} as any,
  };
}

/**
 * Creates a successful Axios response for mocking
 */
export function createAxiosResponse<T>(
  data: T,
  status: number = 200,
): AxiosResponse<T> {
  return {
    data,
    status,
    statusText: 'OK',
    headers: {},
    config: {} as any,
  };
}

/**
 * Creates an Axios error for mocking error scenarios
 */
export function createAxiosError(
  status: number,
  message: string = 'Request failed',
  data?: any,
): AxiosError {
  const error = new Error(message) as AxiosError;
  error.isAxiosError = true;
  error.config = {} as any;
  error.toJSON = () => ({});
  error.name = 'AxiosError';
  error.response = {
    data: data || { error: message },
    status,
    statusText: message,
    headers: {},
    config: {} as any,
  };
  return error;
}

/**
 * Mock responses for Google OAuth API
 */
export const mockGoogleOAuthResponses = {
  tokenSuccess: {
    access_token: 'google_access_token_12345',
    expires_in: 3599,
    token_type: 'Bearer',
    scope: 'openid email profile',
    id_token: 'google_id_token_12345',
  },
  userProfileSuccess: {
    sub: '123456789',
    email: 'test@gmail.com',
    email_verified: true,
    name: 'Test User',
    picture: 'https://example.com/photo.jpg',
    given_name: 'Test',
    family_name: 'User',
  },
};

/**
 * Mock responses for Google Places API
 */
export const mockGooglePlacesResponses = {
  searchSuccess: {
    places: [
      {
        id: 'ChIJN1t_tDeuEmsRUsoyG83frY4',
        displayName: { text: '맛있는 식당', languageCode: 'ko' },
        formattedAddress: '서울특별시 강남구 테헤란로 123',
        rating: 4.5,
        userRatingCount: 100,
        location: { latitude: 37.5012345, longitude: 127.0398765 },
      },
    ],
  },
  placeDetailsSuccess: {
    id: 'ChIJN1t_tDeuEmsRUsoyG83frY4',
    displayName: { text: '맛있는 식당', languageCode: 'ko' },
    formattedAddress: '서울특별시 강남구 테헤란로 123',
    rating: 4.5,
    userRatingCount: 100,
    location: { latitude: 37.5012345, longitude: 127.0398765 },
    reviews: [
      {
        text: { text: '맛있어요!', languageCode: 'ko' },
        rating: 5,
        publishTime: '2024-01-01T00:00:00Z',
      },
    ],
  },
  photoUriSuccess: {
    photoUri: 'https://lh3.googleusercontent.com/photo123',
  },
};

/**
 * Mock responses for Google CSE (Custom Search Engine)
 */
export const mockGoogleCseResponses = {
  searchSuccess: {
    items: [
      {
        title: '맛집 블로그 포스트',
        link: 'https://blog.example.com/post1',
        snippet: '서울 강남구 최고의 맛집 추천',
        displayLink: 'blog.example.com',
        pagemap: {
          cse_thumbnail: [{ src: 'https://example.com/thumb.jpg' }],
          metatags: [
            {
              'og:site_name': 'Example Blog',
              'og:image': 'https://example.com/image.jpg',
            },
          ],
        },
      },
    ],
  },
};

/**
 * Mock responses for Kakao OAuth API
 */
export const mockKakaoOAuthResponses = {
  tokenSuccess: {
    access_token: 'kakao_access_token_12345',
    token_type: 'bearer',
    refresh_token: 'kakao_refresh_token_12345',
    expires_in: 21599,
    scope: 'account_email profile_nickname',
    refresh_token_expires_in: 5183999,
  },
  userInfoSuccess: {
    id: 123456789,
    kakao_account: {
      email: 'test@kakao.com',
      profile: {
        nickname: 'Test User',
      },
    },
  },
};

/**
 * Mock responses for Kakao Local API
 */
export const mockKakaoLocalResponses = {
  addressSearchSuccess: {
    documents: [
      {
        address_name: '서울특별시 강남구 역삼동',
        address_type: 'REGION',
        address: {
          address_name: '서울특별시 강남구 역삼동',
          region_1depth_name: '서울특별시',
          region_2depth_name: '강남구',
          region_3depth_name: '역삼동',
        },
        road_address: {
          address_name: '서울특별시 강남구 테헤란로 123',
          region_1depth_name: '서울특별시',
          region_2depth_name: '강남구',
          region_3depth_name: '역삼동',
          road_name: '테헤란로',
          zone_no: '06234',
        },
        x: '127.0398765',
        y: '37.5012345',
      },
    ],
    meta: {
      total_count: 1,
      pageable_count: 1,
      is_end: true,
    },
  },
};

/**
 * Mock responses for Naver Search API
 */
export const mockNaverSearchResponses = {
  localSearchSuccess: {
    lastBuildDate: '2024-01-01',
    total: 10,
    start: 1,
    display: 5,
    items: [
      {
        title: '<b>맛있는</b> 식당',
        link: 'https://example.com',
        category: '음식점>한식',
        description: '맛있는 한식 전문점',
        telephone: '02-1234-5678',
        address: '서울특별시 강남구 역삼동 123-45',
        roadAddress: '서울특별시 강남구 테헤란로 123',
        mapx: '1270398765',
        mapy: '375012345',
      },
    ],
  },
};

/**
 * Mock responses for Naver Map API
 */
export const mockNaverMapResponses = {
  reverseGeocodeSuccess: {
    status: { code: 0, name: 'ok', message: 'done' },
    results: [
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
  },
};

/**
 * Mock responses for OpenAI API
 */
export const mockOpenAIResponses = {
  chatCompletionSuccess: {
    id: 'chatcmpl-123',
    object: 'chat.completion',
    created: 1677652288,
    model: 'gpt-4',
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: JSON.stringify({
            recommendations: ['김치찌개', '된장찌개', '순두부찌개'],
            reason: '한식을 좋아하시는 것 같아 추천드립니다.',
          }),
        },
        finish_reason: 'stop',
      },
    ],
    usage: {
      prompt_tokens: 9,
      completion_tokens: 12,
      total_tokens: 21,
    },
  },
  menuValidationSuccess: {
    id: 'chatcmpl-456',
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
            suggestions: [],
          }),
        },
        finish_reason: 'stop',
      },
    ],
    usage: {
      prompt_tokens: 5,
      completion_tokens: 8,
      total_tokens: 13,
    },
  },
};

/**
 * Mock responses for AWS S3
 */
export const mockS3Responses = {
  uploadSuccess: {
    $metadata: {
      httpStatusCode: 200,
      requestId: 'request-id-123',
    },
    ETag: '"etag-123"',
    Location: 'https://s3.amazonaws.com/bucket/file.jpg',
    Key: 'bug-reports/file.jpg',
    Bucket: 'pick-eat-bucket',
  },
  deleteSuccess: {
    $metadata: {
      httpStatusCode: 204,
      requestId: 'request-id-456',
    },
  },
};

/**
 * Mock responses for Discord Webhook
 */
export const mockDiscordWebhookResponses = {
  sendSuccess: {
    statusCode: 204,
    message: 'Message sent successfully',
  },
};

/**
 * Mock Google OAuth Client
 */
export function createMockGoogleOAuthClient() {
  return {
    getAccessToken: jest.fn(),
    getUserProfile: jest.fn(),
  };
}

/**
 * Mock Google Places Client
 */
export function createMockGooglePlacesClient() {
  return {
    searchPlaces: jest.fn(),
    getPlaceDetails: jest.fn(),
  };
}

/**
 * Mock Kakao OAuth Client
 */
export function createMockKakaoOAuthClient() {
  return {
    getAccessToken: jest.fn(),
    getUserProfile: jest.fn(),
  };
}

/**
 * Mock Kakao Local Client
 */
export function createMockKakaoLocalClient() {
  return {
    searchAddress: jest.fn(),
  };
}

/**
 * Mock Naver Search Client
 */
export function createMockNaverSearchClient() {
  return {
    searchLocal: jest.fn(),
  };
}

/**
 * Mock Naver Map Client
 */
export function createMockNaverMapClient() {
  return {
    reverseGeocode: jest.fn(),
  };
}

/**
 * Mock S3 Client
 */
export function createMockS3Client() {
  return {
    uploadFile: jest.fn(),
    uploadBugReportImage: jest.fn(),
    deleteFile: jest.fn(),
  };
}

/**
 * Mock Discord Webhook Client
 */
export function createMockDiscordWebhookClient() {
  return {
    sendMessage: jest.fn(),
  };
}

/**
 * Mock PrometheusService
 */
export function createMockPrometheusService() {
  return {
    getRegistry: jest.fn(),
    incrementAiRequest: jest.fn(),
    incrementAiTokens: jest.fn(),
    recordAiSuccess: jest.fn(),
    recordAiError: jest.fn(),
    recordAiTokensOnly: jest.fn(),
    recordAiDuration: jest.fn(),
    recordHttpMetrics: jest.fn(),
    setDbUp: jest.fn(),
    incrementDbQueryError: jest.fn(),
    recordExternalApi: jest.fn(),
  };
}

/**
 * Mock ConfigService
 */
export function createMockConfigService(config: Record<string, any> = {}) {
  return {
    get: jest.fn((key: string, defaultValue?: any) => {
      return config[key] ?? defaultValue;
    }),
    getOrThrow: jest.fn((key: string) => {
      if (!(key in config)) {
        throw new Error(`Configuration key "${key}" does not exist`);
      }
      return config[key];
    }),
  };
}

/**
 * Mock Logger
 */
export function createMockLogger() {
  return {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    verbose: jest.fn(),
  };
}
