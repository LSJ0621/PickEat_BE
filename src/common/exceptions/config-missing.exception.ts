import { HttpException, HttpStatus } from '@nestjs/common';

export class ConfigMissingException extends HttpException {
  constructor(configKeys: string | string[]) {
    const keys = Array.isArray(configKeys) ? configKeys.join(', ') : configKeys;
    super(
      {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        error: 'Configuration Error',
        message: `필수 환경변수가 설정되지 않았습니다: ${keys}`,
      },
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}
