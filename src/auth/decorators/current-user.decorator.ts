import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { ErrorCode } from '@/common/constants/error-codes';

export interface AuthUserPayload {
  sub: number;
  email: string;
  role: string;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUserPayload => {
    const request = ctx.switchToHttp().getRequest<{ user?: AuthUserPayload }>();
    if (!request.user || !request.user.sub || !request.user.email) {
      throw new UnauthorizedException({
        errorCode: ErrorCode.AUTH_INVALID_PAYLOAD,
      });
    }
    return request.user;
  },
);
