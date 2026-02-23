import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode } from '@/common/constants/error-codes';

export class ExternalApiException extends HttpException {
  public readonly originalError?: Error;

  constructor(
    public readonly provider: string,
    error?: unknown,
    message?: string,
    public readonly errorCode: ErrorCode = ErrorCode.EXTERNAL_API_ERROR,
  ) {
    // Convert unknown error to Error if possible
    const errorObj = error instanceof Error ? error : undefined;

    super(
      {
        statusCode: HttpStatus.BAD_GATEWAY,
        error: 'External API Error',
        message: message || `${provider} API 호출 중 오류가 발생했습니다.`,
        provider,
        errorCode,
      },
      HttpStatus.BAD_GATEWAY,
    );

    this.originalError = errorObj;
  }
}
