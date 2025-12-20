import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { User } from '../../user/entities/user.entity';
import { UserService } from '../../user/user.service';
import { AuthEntity } from '../interfaces/auth.interface';
import { JwtTokenProvider } from '../provider/jwt-token.provider';

@Injectable()
export class AuthTokenService {
  private readonly logger = new Logger(AuthTokenService.name);
  private readonly refreshTokenSecret: string;

  constructor(
    private readonly jwtService: JwtService,
    private readonly jwtTokenProvider: JwtTokenProvider,
    private readonly userService: UserService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly config: ConfigService,
  ) {
    this.refreshTokenSecret = this.config.get<string>('JWT_REFRESH_SECRET', '');
  }

  async issueTokens(
    entity: AuthEntity,
  ): Promise<{ token: string; refreshToken: string }> {
    const token = this.jwtTokenProvider.createToken(
      entity.email,
      entity.role.toString(),
    );
    const refreshToken = this.jwtTokenProvider.createRefreshToken(
      entity.email,
      entity.role.toString(),
    );
    await this.persistRefreshToken(entity, refreshToken);
    return { token, refreshToken };
  }

  async persistRefreshToken(
    entity: AuthEntity,
    refreshToken: string | null,
  ): Promise<void> {
    entity.refreshToken = refreshToken
      ? await bcrypt.hash(refreshToken, 10)
      : null;
    await this.userRepository.save(entity);
  }

  async refreshAccessToken(
    refreshToken: string,
  ): Promise<{ token: string; refreshToken: string }> {
    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: this.refreshTokenSecret,
      });

      if (payload.type !== 'refresh') {
        throw new UnauthorizedException('유효하지 않은 refresh token입니다.');
      }

      const user = await this.userService.findByEmail(payload.email);

      if (!user) {
        throw new UnauthorizedException('사용자를 찾을 수 없습니다.');
      }

      if (!user.refreshToken) {
        throw new UnauthorizedException('유효하지 않은 refresh token입니다.');
      }

      const isTokenValid = await bcrypt.compare(
        refreshToken,
        user.refreshToken,
      );
      if (!isTokenValid) {
        throw new UnauthorizedException('유효하지 않은 refresh token입니다.');
      }

      const newAccessToken = this.jwtTokenProvider.createToken(
        user.email,
        user.role.toString(),
      );
      const newRefreshToken = this.jwtTokenProvider.createRefreshToken(
        user.email,
        user.role.toString(),
      );
      await this.persistRefreshToken(user, newRefreshToken);

      return { token: newAccessToken, refreshToken: newRefreshToken };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      if (error instanceof Error && error.message === 'jwt expired') {
        this.logger.warn('Refresh token 만료');
      }
      throw new UnauthorizedException('유효하지 않은 refresh token입니다.');
    }
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) {
      return;
    }
    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: this.refreshTokenSecret,
      });
      const user = await this.userService.findByEmail(payload.email);
      if (user && user.refreshToken) {
        const isTokenValid = await bcrypt.compare(
          refreshToken,
          user.refreshToken,
        );
        if (isTokenValid) {
          await this.persistRefreshToken(user, null);
        }
      }
    } catch (error) {
      if (error instanceof Error) {
        this.logger.warn(`로그아웃 refresh token 검증 실패: ${error.message}`);
      }
    }
  }
}
