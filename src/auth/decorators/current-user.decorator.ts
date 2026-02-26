import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';

export interface AuthUserPayload {
  sub: number;
  email: string;
  role: string;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUserPayload => {
    const request = ctx.switchToHttp().getRequest<{ user?: AuthUserPayload }>();
    if (!request.user || !request.user.sub || !request.user.email) {
      throw new UnauthorizedException('Invalid authentication payload');
    }
    return request.user;
  },
);
