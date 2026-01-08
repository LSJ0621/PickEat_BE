import { Response } from 'supertest';

/**
 * Helper function to safely extract cookies from response headers
 * supertest may return set-cookie as string, string[], or undefined
 */
function getCookiesArray(
  cookieHeader: string | string[] | undefined,
): string[] {
  if (Array.isArray(cookieHeader)) {
    return cookieHeader;
  }
  if (typeof cookieHeader === 'string') {
    return [cookieHeader];
  }
  return [];
}

/**
 * E2E 테스트용 assertion helper 클래스
 * 일관된 응답 검증 패턴을 제공합니다.
 */
export class E2EAssertions {
  /**
   * 에러 응답을 검증합니다.
   * @param response - supertest Response 객체
   * @param expectedStatus - 기대하는 HTTP 상태 코드
   * @param messagePattern - 에러 메시지 패턴 (선택적)
   * @example
   * E2EAssertions.expectErrorResponse(response, 400, 'validation');
   */
  static expectErrorResponse(
    response: Response,
    expectedStatus: number,
    messagePattern?: string | RegExp,
  ): void {
    expect(response.status).toBe(expectedStatus);
    expect(response.body).toHaveProperty('statusCode', expectedStatus);
    expect(response.body).toHaveProperty('message');

    if (messagePattern) {
      if (typeof messagePattern === 'string') {
        expect(response.body.message).toContain(messagePattern);
      } else {
        expect(response.body.message).toMatch(messagePattern);
      }
    }
  }

  /**
   * 페이지네이션 응답을 검증합니다.
   * @param response - supertest Response 객체
   * @param expectedKeys - 각 아이템에 기대하는 키 목록 (선택적)
   * @example
   * E2EAssertions.expectPaginatedResponse(response, ['id', 'name']);
   */
  static expectPaginatedResponse(
    response: Response,
    expectedKeys?: string[],
  ): void {
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('items');
    expect(response.body).toHaveProperty('pageInfo');
    expect(Array.isArray(response.body.items)).toBe(true);
    expect(response.body.pageInfo).toHaveProperty('totalCount');
    expect(response.body.pageInfo).toHaveProperty('page');
    expect(response.body.pageInfo).toHaveProperty('limit');

    if (expectedKeys && response.body.items.length > 0) {
      expectedKeys.forEach((key) => {
        expect(response.body.items[0]).toHaveProperty(key);
      });
    }
  }

  /**
   * 생성 성공 응답(201)을 검증합니다.
   * @param response - supertest Response 객체
   * @param expectedKeys - 응답 body에 기대하는 키 목록 (선택적)
   * @example
   * E2EAssertions.expectCreatedResponse(response, ['id', 'createdAt']);
   */
  static expectCreatedResponse(
    response: Response,
    expectedKeys?: string[],
  ): void {
    expect(response.status).toBe(201);

    if (expectedKeys) {
      expectedKeys.forEach((key) => {
        expect(response.body).toHaveProperty(key);
      });
    }
  }

  /**
   * refresh token 쿠키가 설정되었는지 검증합니다.
   * @param response - supertest Response 객체
   * @example
   * E2EAssertions.expectRefreshTokenCookie(response);
   */
  static expectRefreshTokenCookie(response: Response): void {
    const cookies = getCookiesArray(response.headers['set-cookie']);
    expect(cookies.length).toBeGreaterThan(0);
    expect(cookies.some((cookie) => cookie.includes('refreshToken'))).toBe(
      true,
    );
  }

  /**
   * 성공 응답(200)을 검증합니다.
   * @param response - supertest Response 객체
   * @param expectedKeys - 응답 body에 기대하는 키 목록 (선택적)
   */
  static expectSuccessResponse(
    response: Response,
    expectedKeys?: string[],
  ): void {
    expect(response.status).toBe(200);

    if (expectedKeys) {
      expectedKeys.forEach((key) => {
        expect(response.body).toHaveProperty(key);
      });
    }
  }
}
