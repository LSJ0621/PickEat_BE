import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

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

  createToken(email: string, role: string): string {
    const payload = { email, role };
    return this.jwtService.sign(payload); // secret, expiresIn은 JwtModule에서 설정
  }

  createRefreshToken(email: string, role: string): string {
    const payload = { email, role, type: 'refresh' };
    return this.jwtService.sign(payload, {
      expiresIn: '7d',
      secret: this.refreshTokenSecret,
    }); // refresh token은 7일 유효
  }
}
