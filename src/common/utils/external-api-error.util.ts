import { Logger } from '@nestjs/common';

/**
 * Axios 에러 응답 형태 (타입 가드용)
 */
interface AxiosErrorResponse {
  response?: { status?: number; data?: unknown };
}

/**
 * OAuth 에러 로깅
 *
 * Google OAuth, Kakao OAuth 등 소셜 로그인 클라이언트에서 공통으로 사용합니다.
 * 에러 타입, 메시지, HTTP 상태 코드, 응답 데이터를 포함하여 로깅합니다.
 *
 * @param logger - NestJS Logger 인스턴스
 * @param provider - OAuth 제공자 이름 (예: 'Google', 'Kakao')
 * @param error - 발생한 에러 (unknown 타입)
 * @param context - 에러 발생 컨텍스트 (예: '토큰 발급', '프로필 조회')
 */
export function logOAuthError(
  logger: Logger,
  provider: string,
  error: unknown,
  context: string,
): void {
  logger.error(`=== ${provider} OAuth ${context} 에러 ===`);

  if (error instanceof Error) {
    logger.error(`에러 타입: ${error.name}`);
    logger.error(`에러 메시지: ${error.message}`);
  } else {
    logger.error(`에러 메시지: ${String(error)}`);
  }

  if (typeof error === 'object' && error !== null && 'response' in error) {
    const axiosError = error as AxiosErrorResponse;
    if (axiosError.response) {
      logger.error(`응답 상태 코드: ${axiosError.response.status}`);
      logger.error(`응답 데이터: ${JSON.stringify(axiosError.response.data)}`);
    }
  }
}
