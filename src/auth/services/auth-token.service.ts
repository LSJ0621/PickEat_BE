import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { SocialLogin } from '../../user/entities/social-login.entity';
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
    @InjectRepository(SocialLogin)
    private readonly socialLoginRepository: Repository<SocialLogin>,
    private readonly config: ConfigService,
  ) {
    this.refreshTokenSecret = this.config.get<string>('JWT_REFRESH_SECRET', '');
  }

  async issueTokens(entity: AuthEntity): Promise<{ token: string; refreshToken: string }> {
    const token = this.jwtTokenProvider.createToken(entity.email, entity.role.toString());
    const refreshToken = this.jwtTokenProvider.createRefreshToken(
      entity.email,
      entity.role.toString(),
    );
    await this.persistRefreshToken(entity, refreshToken);
    return { token, refreshToken };
  }

  async persistRefreshToken(entity: AuthEntity, refreshToken: string | null): Promise<void> {
    entity.refreshToken = refreshToken ? await bcrypt.hash(refreshToken, 10) : null;
    if (entity instanceof User) {
      await this.userRepository.save(entity);
    } else {
      await this.socialLoginRepository.save(entity);
    }
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
      const socialLogin = user
        ? null
        : await this.userService.findSocialLoginByEmail(payload.email);

      if (!user && !socialLogin) {
        throw new UnauthorizedException('사용자를 찾을 수 없습니다.');
      }

      const storedRefreshToken = user?.refreshToken || socialLogin?.refreshToken;
      if (!storedRefreshToken) {
        throw new UnauthorizedException('유효하지 않은 refresh token입니다.');
      }

      const isTokenValid = await bcrypt.compare(refreshToken, storedRefreshToken);
      if (!isTokenValid) {
        throw new UnauthorizedException('유효하지 않은 refresh token입니다.');
      }

      const targetUser = user || socialLogin;
      if (!targetUser) {
        throw new UnauthorizedException('사용자를 찾을 수 없습니다.');
      }

      const newAccessToken = this.jwtTokenProvider.createToken(
        targetUser.email,
        targetUser.role.toString(),
      );
      const newRefreshToken = this.jwtTokenProvider.createRefreshToken(
        targetUser.email,
        targetUser.role.toString(),
      );
      await this.persistRefreshToken(targetUser, newRefreshToken);

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
      const entity =
        (await this.userService.findByEmail(payload.email)) ??
        (await this.userService.findSocialLoginByEmail(payload.email));
      if (entity && entity.refreshToken) {
        const isTokenValid = await bcrypt.compare(refreshToken, entity.refreshToken);
        if (isTokenValid) {
          await this.persistRefreshToken(entity, null);
        }
      }
    } catch (error) {
      if (error instanceof Error) {
        this.logger.warn(`로그아웃 refresh token 검증 실패: ${error.message}`);
      }
    }
  }
}

