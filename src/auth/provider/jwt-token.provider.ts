import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class JwtTokenProvider {
  private readonly refreshTokenSecret =
    process.env.JWT_REFRESH_SECRET ?? 'refreshSecret';

  constructor(private readonly jwtService: JwtService) {}

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
