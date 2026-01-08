/**
 * 환경 변수 설정 검증 실패 시 발생하는 예외
 *
 * 필수 환경 변수가 누락되었거나 잘못된 값이 설정된 경우 애플리케이션 시작 시점에 발생합니다.
 */
export class ConfigValidationException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigValidationException';

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ConfigValidationException);
    }
  }
}
