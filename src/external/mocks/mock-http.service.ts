import { Logger } from '@nestjs/common';
import { of } from 'rxjs';
import { AxiosResponse } from 'axios';
import { GOOGLE_PLACES_CONFIG, GOOGLE_CSE_CONFIG } from '../google/google.constants';
import { mockGooglePlacesResponses, mockGoogleCseResponses } from './fixtures';

const logger = new Logger('MockHttpService');

/**
 * URL 패턴 기반 Mock HTTP 응답 생성기
 *
 * 실제 Client 클래스의 HttpService 의존성을 대체합니다.
 * Client의 파싱/에러처리/재시도 로직은 그대로 실행되고,
 * HTTP 호출만 fixture 데이터를 반환합니다.
 */
function createAxiosResponse<T>(data: T, status = 200): AxiosResponse<T> {
  return {
    data,
    status,
    statusText: 'OK',
    headers: {},
    config: { headers: {} } as AxiosResponse['config'],
  };
}

/**
 * POST 요청 URL 기반 fixture 응답 매핑
 */
function handlePost(url: string, _body?: unknown): AxiosResponse {
  const placesBaseUrl = GOOGLE_PLACES_CONFIG.BASE_URL;

  // Google Places Autocomplete
  if (url.includes(GOOGLE_PLACES_CONFIG.ENDPOINTS.AUTOCOMPLETE)) {
    logger.debug(`[MOCK HTTP] POST Places Autocomplete`);
    return createAxiosResponse({
      suggestions: [
        {
          placePrediction: {
            placeId: 'mock-place-id-1',
            text: { text: 'Mock Address 1' },
            structuredFormat: {
              mainText: { text: 'Mock Address 1' },
              secondaryText: { text: 'Seoul, South Korea' },
            },
          },
        },
        {
          placePrediction: {
            placeId: 'mock-place-id-2',
            text: { text: 'Mock Address 2' },
            structuredFormat: {
              mainText: { text: 'Mock Address 2' },
              secondaryText: { text: 'Busan, South Korea' },
            },
          },
        },
      ],
    });
  }

  // Google Places Text Search
  if (url.includes(GOOGLE_PLACES_CONFIG.ENDPOINTS.SEARCH_TEXT)) {
    logger.debug(`[MOCK HTTP] POST Places SearchText`);
    return createAxiosResponse(mockGooglePlacesResponses.searchSuccess);
  }

  // Discord Webhook
  if (url.includes('discord.com/api/webhooks')) {
    logger.debug(`[MOCK HTTP] POST Discord Webhook`);
    return createAxiosResponse(undefined, 204);
  }

  // Google OAuth Token (won't normally be called due to isTestMode())
  if (url.includes('oauth2.googleapis.com/token')) {
    logger.debug(`[MOCK HTTP] POST Google OAuth Token`);
    return createAxiosResponse({
      access_token: 'test-google-valid-token',
      expires_in: 3600,
      token_type: 'bearer',
    });
  }

  // Kakao OAuth Token (won't normally be called due to isTestMode())
  if (url.includes('kauth.kakao.com/oauth/token')) {
    logger.debug(`[MOCK HTTP] POST Kakao OAuth Token`);
    return createAxiosResponse({
      access_token: 'test-kakao-valid-token',
      token_type: 'bearer',
      expires_in: 3600,
    });
  }

  // Default fallback
  logger.warn(`[MOCK HTTP] Unhandled POST: ${url}`);
  return createAxiosResponse({}, 200);
}

/**
 * GET 요청 URL 기반 fixture 응답 매핑
 */
function handleGet(url: string): AxiosResponse {
  const placesBaseUrl = GOOGLE_PLACES_CONFIG.BASE_URL;

  // Google Places Details (GET /places/{placeId})
  if (url.startsWith(placesBaseUrl) && url.includes('/places/') && !url.includes('/media')) {
    logger.debug(`[MOCK HTTP] GET Places Details`);
    return createAxiosResponse(mockGooglePlacesResponses.placeDetailsSuccess);
  }

  // Google Places Photo URI (GET /{photoName}/media)
  if (url.startsWith(placesBaseUrl) && url.includes('/media')) {
    logger.debug(`[MOCK HTTP] GET Places Photo URI`);
    return createAxiosResponse({ photoUri: mockGooglePlacesResponses.photoUri });
  }

  // Google CSE Search
  if (url.includes(GOOGLE_CSE_CONFIG.BASE_URL) || url.includes('googleapis.com/customsearch')) {
    logger.debug(`[MOCK HTTP] GET Google CSE`);
    return createAxiosResponse({
      items: mockGoogleCseResponses.searchSuccess.map((blog) => ({
        title: blog.title,
        link: blog.url,
        snippet: blog.snippet,
        displayLink: blog.source,
        pagemap: {
          cse_thumbnail: blog.thumbnailUrl
            ? [{ src: blog.thumbnailUrl }]
            : undefined,
          metatags: [{ 'og:site_name': blog.source }],
        },
      })),
    });
  }

  // Google OAuth UserInfo (won't normally be called due to isTestMode())
  if (url.includes('openidconnect.googleapis.com/v1/userinfo')) {
    logger.debug(`[MOCK HTTP] GET Google OAuth UserInfo`);
    return createAxiosResponse({
      sub: 'google-test-valid-id',
      email: 'oauth-google@test-oauth.example.com',
      email_verified: true,
      name: '구글테스트',
    });
  }

  // Kakao UserInfo (won't normally be called due to isTestMode())
  if (url.includes('kapi.kakao.com/v2/user/me')) {
    logger.debug(`[MOCK HTTP] GET Kakao UserInfo`);
    return createAxiosResponse({
      id: 123456789,
      kakao_account: {
        email: 'oauth-kakao@test-oauth.example.com',
        profile: { nickname: '카카오테스트' },
      },
      properties: { nickname: '카카오테스트' },
    });
  }

  // Default fallback
  logger.warn(`[MOCK HTTP] Unhandled GET: ${url}`);
  return createAxiosResponse({}, 200);
}

/**
 * Mock HttpService
 *
 * URL 패턴에 따라 fixture 응답을 Observable로 반환합니다.
 * 실제 HTTP 호출 없이 Client 프로덕션 코드가 실행됩니다.
 */
export class MockHttpService {
  get<T = unknown>(url: string, _config?: unknown) {
    return of(handleGet(url) as AxiosResponse<T>);
  }

  post<T = unknown>(url: string, body?: unknown, _config?: unknown) {
    return of(handlePost(url, body) as AxiosResponse<T>);
  }

  put<T = unknown>(url: string, _body?: unknown, _config?: unknown) {
    logger.warn(`[MOCK HTTP] Unhandled PUT: ${url}`);
    return of(createAxiosResponse({}) as AxiosResponse<T>);
  }

  delete<T = unknown>(url: string, _config?: unknown) {
    logger.warn(`[MOCK HTTP] Unhandled DELETE: ${url}`);
    return of(createAxiosResponse({}) as AxiosResponse<T>);
  }
}
