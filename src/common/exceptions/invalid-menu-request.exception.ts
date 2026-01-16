import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode } from '@/common/constants/error-codes';

/**
 * 메뉴 추천과 무관한 요청에 대한 커스텀 예외 클래스
 * 사용자에게 친화적인 에러 메시지를 제공합니다.
 */
export class InvalidMenuRequestException extends HttpException {
  constructor(
    message?: string,
    public readonly errorCode: ErrorCode = ErrorCode.VALIDATION_ERROR,
  ) {
    const defaultMessage = `죄송합니다. 메뉴 추천과 관련 없는 요청입니다.
음식 선택이나 식사와 관련된 내용으로 다시 요청해 주세요.`;

    super(
      {
        statusCode: HttpStatus.BAD_REQUEST,
        message: message || defaultMessage,
        errorCode,
      },
      HttpStatus.BAD_REQUEST,
    );
  }
}
