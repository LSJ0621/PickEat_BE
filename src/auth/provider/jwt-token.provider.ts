import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class JwtTokenProvider {
  constructor(private readonly jwtService: JwtService) {}

  createToken(email: string, role: string): string {
    const payload = { email, role };
    return this.jwtService.sign(payload); // secret, expiresIn은 JwtModule에서 설정
  }
}
