import { HttpException, HttpStatus } from '@nestjs/common';

export class ExternalApiException extends HttpException {
  constructor(
    public readonly provider: string,
    public readonly originalError?: Error,
    message?: string,
  ) {
    super(
      {
        statusCode: HttpStatus.BAD_GATEWAY,
        error: 'External API Error',
        message: message || `${provider} API 호출 중 오류가 발생했습니다.`,
        provider,
      },
      HttpStatus.BAD_GATEWAY,
    );
  }
}

