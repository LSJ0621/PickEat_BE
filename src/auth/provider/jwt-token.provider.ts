import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AUTH_TIMING } from '@/common/constants/business.constants';

@Injectable()
export class JwtTokenProvider {
  private readonly refreshTokenSecret: string;

  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {
    this.refreshTokenSecret =
      this.config.getOrThrow<string>('JWT_REFRESH_SECRET');
  }

  createToken(userId: number, email: string, role: string): string {
    const jti = `${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
    const payload = { sub: userId, email, role, jti };
    return this.jwtService.sign(payload); // secret, expiresIn은 JwtModule에서 설정
  }

  createRefreshToken(email: string, role: string): string {
    // Add jti (JWT ID) with millisecond timestamp to ensure uniqueness
    // Even if called multiple times per second, each token will be unique
    const jti = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
    const payload = { email, role, type: 'refresh', jti };
    return this.jwtService.sign(payload, {
      expiresIn: AUTH_TIMING.REFRESH_TOKEN_EXPIRES,
      secret: this.refreshTokenSecret,
    });
  }
}
