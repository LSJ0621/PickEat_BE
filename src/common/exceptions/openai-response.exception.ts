import { HttpException, HttpStatus } from '@nestjs/common';

export class OpenAIResponseException extends HttpException {
  constructor(
    public readonly reason: string,
    public readonly rawResponse?: unknown,
  ) {
    super(
      {
        statusCode: HttpStatus.BAD_GATEWAY,
        error: 'AI Response Error',
        message: `AI 응답 처리 중 오류가 발생했습니다: ${reason}`,
      },
      HttpStatus.BAD_GATEWAY,
    );
  }
}
