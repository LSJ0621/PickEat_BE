import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode } from '@/common/constants/error-codes';

export class ConfigMissingException extends HttpException {
  constructor(
    configKeys: string | string[],
    public readonly errorCode: ErrorCode = ErrorCode.CONFIG_MISSING_ERROR,
  ) {
    const keys = Array.isArray(configKeys) ? configKeys.join(', ') : configKeys;
    super(
      {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        error: 'Configuration Error',
        message: `필수 환경변수가 설정되지 않았습니다: ${keys}`,
        errorCode,
      },
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}
