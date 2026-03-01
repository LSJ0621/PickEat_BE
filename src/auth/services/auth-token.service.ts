import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { DataSource } from 'typeorm';
import { ErrorCode } from '@/common/constants/error-codes';
import { User } from '@/user/entities/user.entity';
import { UserService } from '@/user/user.service';
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
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {
    this.refreshTokenSecret =
      this.config.getOrThrow<string>('JWT_REFRESH_SECRET');
  }

  /**
   * SHA-256 pre-hash to ensure token fits within bcrypt's 72-byte limit.
   * JWT tokens are 256+ bytes, but bcrypt only hashes first 72 bytes.
   * SHA-256 output is 64 hex characters (256 bits), safely under the limit.
   */
  private hashTokenForStorage(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  async issueTokens(
    entity: AuthEntity,
  ): Promise<{ token: string; refreshToken: string }> {
    const token = this.jwtTokenProvider.createToken(
      entity.id,
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
    const hashedToken = refreshToken
      ? await bcrypt.hash(this.hashTokenForStorage(refreshToken), 10)
      : null;

    // Use query builder with execute() to ensure immediate database update
    await this.userService.updateRefreshTokenById(entity.id, hashedToken);
  }

  async refreshAccessToken(
    refreshToken: string,
  ): Promise<{ token: string; refreshToken: string }> {
    // Use a transaction to ensure atomicity and prevent race conditions
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: this.refreshTokenSecret,
      });

      if (payload.type !== 'refresh') {
        throw new UnauthorizedException({
          errorCode: ErrorCode.AUTH_INVALID_REFRESH_TOKEN,
        });
      }

      // Fetch user with SELECT FOR UPDATE to lock the row and ensure latest data
      const user = await queryRunner.manager
        .createQueryBuilder(User, 'user')
        .setLock('pessimistic_write')
        .where('user.email = :email', { email: payload.email })
        .getOne();

      if (!user) {
        throw new UnauthorizedException({
          errorCode: ErrorCode.USER_NOT_FOUND,
        });
      }

      if (user.isDeactivated) {
        throw new HttpException(
          {
            statusCode: HttpStatus.FORBIDDEN,
            error: 'USER_DEACTIVATED',
            errorCode: ErrorCode.AUTH_ACCOUNT_DEACTIVATED,
          },
          HttpStatus.FORBIDDEN,
        );
      }

      if (!user.refreshToken) {
        throw new UnauthorizedException({
          errorCode: ErrorCode.AUTH_INVALID_REFRESH_TOKEN,
        });
      }

      const isTokenValid = await bcrypt.compare(
        this.hashTokenForStorage(refreshToken),
        user.refreshToken,
      );

      if (!isTokenValid) {
        throw new UnauthorizedException({
          errorCode: ErrorCode.AUTH_INVALID_REFRESH_TOKEN,
        });
      }

      const newAccessToken = this.jwtTokenProvider.createToken(
        user.id,
        user.email,
        user.role.toString(),
      );
      const newRefreshToken = this.jwtTokenProvider.createRefreshToken(
        user.email,
        user.role.toString(),
      );

      // Invalidate the old refresh token immediately before issuing new one
      // This ensures token rotation - old token becomes invalid
      const hashedNewToken = await bcrypt.hash(
        this.hashTokenForStorage(newRefreshToken),
        10,
      );

      // Update using the transaction's query runner
      await queryRunner.manager
        .createQueryBuilder()
        .update(User)
        .set({ refreshToken: hashedNewToken, lastActiveAt: new Date() })
        .where('id = :id', { id: user.id })
        .execute();

      // Commit the transaction
      await queryRunner.commitTransaction();

      return { token: newAccessToken, refreshToken: newRefreshToken };
    } catch (error) {
      // Rollback transaction on error
      await queryRunner.rollbackTransaction();

      if (
        error instanceof UnauthorizedException ||
        error instanceof HttpException
      ) {
        throw error;
      }
      if (error instanceof Error && error.message === 'jwt expired') {
        this.logger.warn('Refresh token 만료');
      }
      throw new UnauthorizedException({
        errorCode: ErrorCode.AUTH_INVALID_REFRESH_TOKEN,
      });
    } finally {
      // Release the query runner
      await queryRunner.release();
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
          this.hashTokenForStorage(refreshToken),
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
