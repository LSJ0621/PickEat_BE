import { HttpException, HttpStatus } from '@nestjs/common';

export class PipelineFailedException extends HttpException {
  constructor(stepName: string, cause?: unknown) {
    super(
      {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        error: 'Pipeline Failed',
        message: `${stepName} 단계에서 실패했습니다.`,
        step: stepName,
      },
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
    if (cause instanceof Error) {
      this.stack = cause.stack;
    }
  }
}
