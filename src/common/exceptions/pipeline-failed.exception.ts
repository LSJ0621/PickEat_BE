import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode } from '@/common/constants/error-codes';

export class PipelineFailedException extends HttpException {
  constructor(
    stepName: string,
    cause?: unknown,
    public readonly errorCode: ErrorCode = ErrorCode.INTERNAL_SERVER_ERROR,
  ) {
    super(
      {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        error: 'Pipeline Failed',
        message: `${stepName} 단계에서 실패했습니다.`,
        step: stepName,
        errorCode,
      },
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
    if (cause instanceof Error) {
      this.stack = cause.stack;
    }
  }
}
