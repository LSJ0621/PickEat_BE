import {
    createParamDecorator,
    ExecutionContext,
    UnauthorizedException,
} from '@nestjs/common';

export interface AuthUserPayload {
  email: string;
  role: string;
  sub?: number;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUserPayload => {
    const request = ctx.switchToHttp().getRequest<{ user?: AuthUserPayload }>();
    if (!request.user || !request.user.email) {
      throw new UnauthorizedException('Invalid authentication payload');
    }
    return request.user;
  },
);
