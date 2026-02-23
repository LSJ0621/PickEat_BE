// src/auth/auth.service.ts
import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { DataSource, Repository } from 'typeorm';
import { ErrorCode } from '@/common/constants/error-codes';
import { MessageCode } from '@/common/constants/message-codes';
import { UserAddress } from '../user/entities/user-address.entity';
import { User } from '../user/entities/user.entity';
import { EmailVerification } from './entities/email-verification.entity';
import { UserService } from '../user/user.service';
import { LoginDto } from './dto/login.dto';
import { ReRegisterSocialDto } from './dto/re-register-social.dto';
import { ReRegisterDto } from './dto/re-register.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { EmailPurpose } from './dto/send-email-code.dto';
import {
  AuthEntity,
  AuthProfile,
  AuthResult,
} from './interfaces/auth.interface';
import { RedisCacheService } from '@/common/cache/cache.service';
import { AuthPasswordService } from './services/auth-password.service';
import { AuthSocialService } from './services/auth-social.service';
import { AuthTokenService } from './services/auth-token.service';
import { EmailVerificationService } from './services/email-verification.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly userService: UserService,
    private readonly authTokenService: AuthTokenService,
    private readonly authSocialService: AuthSocialService,
    private readonly authPasswordService: AuthPasswordService,
    private readonly emailVerificationService: EmailVerificationService,
    private readonly cacheService: RedisCacheService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly dataSource: DataSource,
  ) {}

  // ========== 소셜 로그인 (위임) ==========

  async kakaoLogin(code: string, language?: 'ko' | 'en'): Promise<AuthResult> {
    return this.authSocialService.kakaoLogin(
      code,
      (entity) => this.buildAuthResult(entity),
      language,
    );
  }

  async kakaoLoginWithToken(
    accessToken: string,
    language?: 'ko' | 'en',
  ): Promise<AuthResult> {
    return this.authSocialService.kakaoLoginWithToken(
      accessToken,
      (entity) => this.buildAuthResult(entity),
      language,
    );
  }

  async googleLogin(code: string, language?: 'ko' | 'en'): Promise<AuthResult> {
    return this.authSocialService.googleLogin(
      code,
      (entity) => this.buildAuthResult(entity),
      language,
    );
  }

  async reRegisterSocial(
    reRegisterSocialDto: ReRegisterSocialDto,
  ): Promise<{ messageCode: MessageCode }> {
    return this.authSocialService.reRegisterSocial(reRegisterSocialDto);
  }

  async findDeletedUserByEmail(email: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { email },
      withDeleted: true,
    });
  }

  // ========== 토큰 관리 (위임) ==========

  async refreshAccessToken(
    refreshToken: string,
  ): Promise<{ token: string; refreshToken: string }> {
    return this.authTokenService.refreshAccessToken(refreshToken);
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    return this.authTokenService.logout(refreshToken);
  }

  // ========== 일반 회원가입/로그인 ==========

  async register(registerDto: RegisterDto, lang?: 'ko' | 'en') {
    await this.checkEmailAvailability(registerDto.email, true);

    const isEmailVerified = await this.emailVerificationService.isEmailVerified(
      registerDto.email,
      EmailPurpose.SIGNUP,
    );

    if (!isEmailVerified) {
      throw new BadRequestException({
        errorCode: ErrorCode.AUTH_EMAIL_NOT_VERIFIED,
      });
    }

    const hashedPassword = await bcrypt.hash(registerDto.password, 10);

    const user = await this.userService.createUser({
      email: registerDto.email,
      password: hashedPassword,
      role: 'USER',
      name: registerDto.name,
      preferredLanguage: lang || 'ko',
    });

    await this.userService.markEmailVerified(registerDto.email);
    await this.emailVerificationService.expireVerification(
      registerDto.email,
      EmailPurpose.SIGNUP,
    );

    // Send welcome email
    try {
      await this.emailVerificationService.sendWelcomeEmail(
        user.id.toString(),
        lang,
      );
    } catch (error) {
      this.logger.warn(
        `Failed to send welcome email to ${registerDto.email}: ${error.message}`,
      );
      // Don't fail registration if welcome email fails
    }

    return {
      messageCode: MessageCode.AUTH_REGISTRATION_COMPLETED,
    };
  }

  async validateUser(
    email: string,
    password: string,
  ): Promise<{
    user: User | null;
    reason:
      | 'success'
      | 'not_found'
      | 'deleted'
      | 'deactivated'
      | 'wrong_password'
      | 'no_password';
  }> {
    const user = await this.userRepository.findOne({
      where: { email },
      withDeleted: true,
    });

    if (!user) {
      return { user: null, reason: 'not_found' };
    }

    if (user.deletedAt) {
      return { user: null, reason: 'deleted' };
    }

    if (user.isDeactivated) {
      return { user: null, reason: 'deactivated' };
    }

    if (!user.password) {
      return { user: null, reason: 'no_password' };
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return { user: null, reason: 'wrong_password' };
    }

    return { user, reason: 'success' };
  }

  async login(loginDto: LoginDto): Promise<AuthResult> {
    const { user, reason } = await this.validateUser(
      loginDto.email,
      loginDto.password,
    );

    if (!user) {
      if (reason === 'deactivated') {
        throw new HttpException(
          {
            statusCode: HttpStatus.FORBIDDEN,
            error: 'USER_DEACTIVATED',
            errorCode: ErrorCode.USER_DEACTIVATED,
          },
          HttpStatus.FORBIDDEN,
        );
      }

      throw new UnauthorizedException({
        errorCode: ErrorCode.AUTH_INVALID_CREDENTIALS,
      });
    }

    return this.buildAuthResult(user);
  }

  async checkEmail(email: string) {
    return this.checkEmailAvailability(email, false);
  }

  // ========== 비밀번호 관련 (위임) ==========

  async sendResetPasswordCode(
    email: string,
    lang?: 'ko' | 'en',
  ): Promise<{ remainCount: number; messageCode: MessageCode }> {
    return this.authPasswordService.sendResetPasswordCode(email, lang);
  }

  async verifyResetPasswordCode(email: string, code: string): Promise<void> {
    return this.authPasswordService.verifyResetPasswordCode(email, code);
  }

  async resetPassword(resetPasswordDto: ResetPasswordDto): Promise<void> {
    return this.authPasswordService.resetPassword(resetPasswordDto);
  }

  // ========== 재가입 ==========

  async reRegister(
    reRegisterDto: ReRegisterDto,
  ): Promise<{ messageCode: MessageCode }> {
    const deletedUser = await this.userRepository.findOne({
      where: { email: reRegisterDto.email },
      withDeleted: true,
    });

    if (!deletedUser || !deletedUser.deletedAt) {
      throw new BadRequestException({
        errorCode: ErrorCode.AUTH_RE_REGISTER_NOT_AVAILABLE,
      });
    }

    const isEmailVerified = await this.emailVerificationService.isEmailVerified(
      reRegisterDto.email,
      EmailPurpose.RE_REGISTER,
    );

    if (!isEmailVerified) {
      throw new BadRequestException({
        errorCode: ErrorCode.AUTH_EMAIL_NOT_VERIFIED,
      });
    }

    const hashedPassword = await bcrypt.hash(reRegisterDto.password, 10);

    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(User).update(
        { email: reRegisterDto.email },
        {
          password: hashedPassword,
          name: reRegisterDto.name,
          reRegisterEmailVerified: true,
          refreshToken: null,
          deletedAt: null,
          lastPasswordChangedAt: new Date(),
        },
      );

      const verification = await manager
        .getRepository(EmailVerification)
        .findOne({
          where: {
            email: reRegisterDto.email,
            purpose: EmailPurpose.RE_REGISTER,
          },
          order: { createdAt: 'DESC' },
        });

      if (verification) {
        verification.status = 'INVALIDATED';
        verification.expiresAt = new Date();
        await manager.getRepository(EmailVerification).save(verification);
      }
    });

    const user = await this.userRepository.findOne({
      where: { email: reRegisterDto.email },
    });

    if (!user) {
      throw new BadRequestException({
        errorCode: ErrorCode.AUTH_RE_REGISTER_ERROR,
      });
    }

    return {
      messageCode: MessageCode.AUTH_RE_REGISTRATION_COMPLETED,
    };
  }

  // ========== 프로필 조회 ==========

  async getUserProfile(email: string): Promise<AuthProfile> {
    const entity = await this.userService.getAuthenticatedEntity(email);

    // 1. 캐시 조회
    const cached = await this.cacheService.getUserProfile(entity.id);
    if (cached) {
      return {
        email: cached.email,
        name: cached.name,
        address: cached.address,
        latitude: cached.latitude,
        longitude: cached.longitude,
        birthDate: cached.birthDate,
        gender: cached.gender as AuthProfile['gender'],
        preferredLanguage: cached.preferredLanguage,
      };
    }

    // 2. 캐시 MISS → DB 조회
    const defaultAddress =
      await this.userService.getEntityDefaultAddress(entity);
    const addressResponse = this.buildAddressResponse(entity, defaultAddress);

    const profile: AuthProfile = {
      email: entity.email,
      name: this.nullableString(entity.name),
      ...addressResponse,
      birthDate: entity.birthDate ?? null,
      gender: entity.gender ?? null,
      preferredLanguage: entity.preferredLanguage,
    };

    // 3. 캐시 저장 (비동기, 에러 무시)
    this.cacheService
      .setUserProfile(entity.id, profile)
      .catch((err) =>
        this.logger.warn(`프로필 캐시 저장 실패: ${err.message}`),
      );

    return profile;
  }

  // ========== Auth Result 빌드 ==========

  async buildAuthResult(entity: AuthEntity): Promise<AuthResult> {
    const { token, refreshToken } =
      await this.authTokenService.issueTokens(entity);

    const defaultAddress =
      await this.userService.getEntityDefaultAddress(entity);
    const addressResponse = this.buildAddressResponse(entity, defaultAddress);

    return {
      email: entity.email,
      token,
      refreshToken,
      ...addressResponse,
      name: this.nullableString(entity.name),
      preferences: entity.preferences ?? null,
      birthDate: entity.birthDate ?? null,
      gender: entity.gender ?? null,
      preferredLanguage: entity.preferredLanguage,
    };
  }

  // ========== Private Helper ==========

  private async checkEmailAvailability(
    email: string,
    throwOnConflict: boolean,
  ): Promise<{
    available: boolean;
    message?: string;
    canReRegister?: boolean;
    errorCode?: ErrorCode;
    messageCode?: MessageCode;
  } | void> {
    const existingUser = await this.userRepository.findOne({
      where: { email },
      withDeleted: true,
    });

    if (existingUser && !existingUser.deletedAt) {
      if (throwOnConflict) {
        throw new BadRequestException({
          errorCode: ErrorCode.AUTH_EMAIL_ALREADY_EXISTS,
        });
      }
      return {
        available: false,
        errorCode: ErrorCode.AUTH_EMAIL_IN_USE,
      };
    }

    if (existingUser && existingUser.deletedAt) {
      if (throwOnConflict) {
        throw new BadRequestException({
          errorCode: ErrorCode.AUTH_WITHDRAWAL_HISTORY_REREGISTER,
        });
      }
      return {
        available: false,
        canReRegister: true,
        errorCode: ErrorCode.AUTH_WITHDRAWAL_HISTORY_CONFIRM,
      };
    }

    if (throwOnConflict) {
      return;
    }
    return {
      available: true,
      messageCode: MessageCode.AUTH_EMAIL_AVAILABLE,
    };
  }

  private buildAddressResponse(
    entity: AuthEntity,
    defaultAddress: UserAddress | null,
  ): {
    address: string | null;
    latitude: number | null;
    longitude: number | null;
  } {
    return {
      address: defaultAddress ? defaultAddress.roadAddress : null,
      latitude: defaultAddress
        ? typeof defaultAddress.latitude === 'string'
          ? parseFloat(defaultAddress.latitude)
          : defaultAddress.latitude
        : null,
      longitude: defaultAddress
        ? typeof defaultAddress.longitude === 'string'
          ? parseFloat(defaultAddress.longitude)
          : defaultAddress.longitude
        : null,
    };
  }

  private nullableString(value: string | null | undefined): string | null {
    return value ?? null;
  }
}
