import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { RedisCacheService } from '@/common/cache/cache.service';
import { ErrorCode } from '@/common/constants/error-codes';
import { UserService } from '@/user/user.service';
import { AuthEntity } from '../interfaces/auth.interface';
import { JwtTokenProvider } from '../provider/jwt-token.provider';

@Injectable()
export class AuthTokenService {
  private readonly logger = new Logger(AuthTokenService.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly jwtTokenProvider: JwtTokenProvider,
    private readonly userService: UserService,
    private readonly cacheService: RedisCacheService,
    private readonly config: ConfigService,
  ) {}

  async issueTokens(entity: AuthEntity): Promise<{ token: string }> {
    const token = this.jwtTokenProvider.createToken(
      entity.id,
      entity.email,
      entity.role.toString(),
    );
    const refreshToken = this.jwtTokenProvider.createRefreshToken(
      entity.email,
      entity.role.toString(),
    );
    await this.storeRefreshToken(entity.id, refreshToken);
    return { token };
  }

  async storeRefreshToken(userId: number, token: string | null): Promise<void> {
    if (token) {
      await this.cacheService.setRefreshToken(userId, token);
    } else {
      await this.cacheService.deleteRefreshToken(userId);
    }
  }

  async refreshAccessToken(
    expiredAccessToken: string,
  ): Promise<{ token: string }> {
    // 1. 만료된 access token에서 userId 추출 (서명 검증, 만료 무시)
    const accessTokenSecret = this.config.getOrThrow<string>('JWT_SECRET');
    let payload: { sub: number; email: string; role: string };
    try {
      payload = this.jwtService.verify(expiredAccessToken, {
        secret: accessTokenSecret,
        ignoreExpiration: true,
      });
    } catch {
      throw new UnauthorizedException({
        errorCode: ErrorCode.AUTH_INVALID_REFRESH_TOKEN,
      });
    }

    const userId = payload.sub;

    // 2. Redis에서 refresh token 조회
    const storedRefreshToken = await this.cacheService.getRefreshToken(userId);
    if (!storedRefreshToken) {
      throw new UnauthorizedException({
        errorCode: ErrorCode.AUTH_INVALID_REFRESH_TOKEN,
      });
    }

    // 3. 저장된 refresh token JWT 검증 (서명 + 만료)
    const refreshTokenSecret =
      this.config.getOrThrow<string>('JWT_REFRESH_SECRET');
    try {
      this.jwtService.verify(storedRefreshToken, {
        secret: refreshTokenSecret,
      });
    } catch {
      await this.cacheService.deleteRefreshToken(userId);
      throw new UnauthorizedException({
        errorCode: ErrorCode.AUTH_INVALID_REFRESH_TOKEN,
      });
    }

    // 4. 사용자 상태 확인
    const user = await this.userService.findByIdWithSelect(userId, [
      'id',
      'email',
      'role',
      'isDeactivated',
      'deletedAt',
    ]);
    if (!user || user.deletedAt) {
      await this.cacheService.deleteRefreshToken(userId);
      throw new UnauthorizedException({
        errorCode: ErrorCode.AUTH_INVALID_REFRESH_TOKEN,
      });
    }

    if (user.isDeactivated) {
      await this.cacheService.deleteRefreshToken(userId);
      throw new HttpException(
        {
          statusCode: HttpStatus.FORBIDDEN,
          error: 'USER_DEACTIVATED',
          errorCode: ErrorCode.AUTH_ACCOUNT_DEACTIVATED,
        },
        HttpStatus.FORBIDDEN,
      );
    }

    // 5. Token Rotation: 새 access token + 새 refresh token 발급
    const newAccessToken = this.jwtTokenProvider.createToken(
      user.id,
      user.email,
      user.role.toString(),
    );
    const newRefreshToken = this.jwtTokenProvider.createRefreshToken(
      user.email,
      user.role.toString(),
    );
    await this.cacheService.setRefreshToken(userId, newRefreshToken);

    return { token: newAccessToken };
  }

  async logout(userId: number): Promise<void> {
    await this.cacheService.deleteRefreshToken(userId);
  }
}
