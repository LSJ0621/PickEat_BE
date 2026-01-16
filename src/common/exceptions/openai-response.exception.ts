import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode } from '@/common/constants/error-codes';

export class OpenAIResponseException extends HttpException {
  constructor(
    public readonly reason: string,
    public readonly rawResponse?: unknown,
    public readonly errorCode: ErrorCode = ErrorCode.EXTERNAL_AI_ERROR,
  ) {
    super(
      {
        statusCode: HttpStatus.BAD_GATEWAY,
        error: 'AI Response Error',
        message: `AI 응답 처리 중 오류가 발생했습니다: ${reason}`,
        errorCode,
      },
      HttpStatus.BAD_GATEWAY,
    );
  }
}
