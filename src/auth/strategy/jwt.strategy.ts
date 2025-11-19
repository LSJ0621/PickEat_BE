import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { type Request } from 'express';
import { Strategy } from 'passport-jwt';
import { AuthUserPayload } from '../decorators/current-user.decorator';

type JwtExtractor = (request: Request) => string | null;

const bearerTokenExtractor: JwtExtractor = (request: Request) => {
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
  constructor() {
    // passport strategies expose an untyped constructor; suppress the lint warning for this call.
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    super({
      jwtFromRequest: bearerTokenExtractor,
      ignoreExpiration: false,
      secretOrKey: 'secret',
    });
  }

  validate(payload: AuthUserPayload): AuthUserPayload {
    return payload;
  }
}
