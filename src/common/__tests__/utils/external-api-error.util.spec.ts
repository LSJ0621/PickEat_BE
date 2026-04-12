import { Logger } from '@nestjs/common';
import { logOAuthError } from '../../utils/external-api-error.util';

describe('logOAuthError', () => {
  let logger: Logger;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    logger = new Logger('Test');
    errorSpy = jest.spyOn(logger, 'error').mockImplementation();
  });

  it('Error 객체의 name과 message를 로깅한다', () => {
    const error = new TypeError('invalid token');

    logOAuthError(logger, 'Google', error, '토큰 발급');

    expect(errorSpy).toHaveBeenCalledWith('=== Google OAuth 토큰 발급 에러 ===');
    expect(errorSpy).toHaveBeenCalledWith('에러 타입: TypeError');
    expect(errorSpy).toHaveBeenCalledWith('에러 메시지: invalid token');
  });

  it('Error가 아닌 값은 String으로 변환하여 로깅한다', () => {
    logOAuthError(logger, 'Kakao', 'string error', '프로필 조회');

    expect(errorSpy).toHaveBeenCalledWith('에러 메시지: string error');
  });

  it('Axios 에러의 response 상태 코드와 데이터를 로깅한다', () => {
    const axiosError = new Error('Request failed');
    (axiosError as any).response = {
      status: 401,
      data: { error: 'unauthorized' },
    };

    logOAuthError(logger, 'Google', axiosError, '토큰 갱신');

    expect(errorSpy).toHaveBeenCalledWith('응답 상태 코드: 401');
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('"error":"unauthorized"'),
    );
  });

  it('response 필드가 없는 에러는 상태 코드를 로깅하지 않는다', () => {
    const error = new Error('network error');

    logOAuthError(logger, 'Kakao', error, '로그인');

    const statusCalls = errorSpy.mock.calls.filter(
      (call: string[]) => typeof call[0] === 'string' && call[0].includes('응답 상태 코드'),
    );
    expect(statusCalls).toHaveLength(0);
  });

  it('response 객체가 있지만 null인 경우 상태 코드를 로깅하지 않는다', () => {
    const error = { response: null, message: 'fail' };

    logOAuthError(logger, 'Google', error, '인증');

    const statusCalls = errorSpy.mock.calls.filter(
      (call: string[]) => typeof call[0] === 'string' && call[0].includes('응답 상태 코드'),
    );
    expect(statusCalls).toHaveLength(0);
  });
});
