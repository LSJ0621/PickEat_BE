import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { type Request } from 'express';
import { Strategy } from 'passport-jwt';
import { AuthUserPayload } from '../decorators/current-user.decorator';

type JwtExtractor = (request: Request) => string | null;

export const bearerTokenExtractor: JwtExtractor = (request: Request) => {
  const authorizationHeader = request.headers.authorization as
    | string
    | string[]
    | undefined;
  if (!authorizationHeader) {
    return null;
  }
  const headerValue = Array.isArray(authorizationHeader)
    ? authorizationHeader[0]
    : authorizationHeader;
  if (!headerValue || typeof headerValue !== 'string') {
    return null;
  }
  const matches = headerValue.match(/^Bearer\s+(.+)$/i);
  return matches?.[1] ?? null;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly config: ConfigService) {
    // passport strategies expose an untyped constructor; suppress the lint warning for this call.
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    super({
      jwtFromRequest: bearerTokenExtractor,
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  validate(payload: AuthUserPayload): AuthUserPayload {
    // email과 role만 검증 (JWT 서명 검증은 이미 완료됨)
    if (!payload.email || !payload.role) {
      throw new UnauthorizedException('Invalid token: missing email or role');
    }

    return payload;
  }
}
