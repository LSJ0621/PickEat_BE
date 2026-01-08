import { HttpException, HttpStatus } from '@nestjs/common';

export class ExternalApiException extends HttpException {
  public readonly originalError?: Error;

  constructor(
    public readonly provider: string,
    error?: unknown,
    message?: string,
  ) {
    // Convert unknown error to Error if possible
    const errorObj = error instanceof Error ? error : undefined;

    super(
      {
        statusCode: HttpStatus.BAD_GATEWAY,
        error: 'External API Error',
        message: message || `${provider} API 호출 중 오류가 발생했습니다.`,
        provider,
      },
      HttpStatus.BAD_GATEWAY,
    );

    this.originalError = errorObj;
  }
}
