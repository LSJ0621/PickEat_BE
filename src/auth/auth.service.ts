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
import { Repository } from 'typeorm';
import { AUTH_TIMING } from '../common/constants/business.constants';
import { ErrorCode } from '@/common/constants/error-codes';
import { MessageCode } from '@/common/constants/message-codes';
import { UserAddress } from '../user/entities/user-address.entity';
import { User } from '../user/entities/user.entity';
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
    private readonly emailVerificationService: EmailVerificationService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
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

  async validateUser(email: string, password: string): Promise<User | null> {
    const user = await this.userRepository.findOne({
      where: { email },
      withDeleted: true,
    });

    if (!user) {
      return null;
    }

    if (user.deletedAt) {
      return null;
    }

    if (user.isDeactivated) {
      return null;
    }

    if (!user.password) {
      return null;
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return null;
    }

    return user;
  }

  async login(loginDto: LoginDto): Promise<AuthResult> {
    const user = await this.validateUser(loginDto.email, loginDto.password);

    if (!user) {
      // 비활성화된 유저인지 확인하여 적절한 에러 메시지 제공
      const existingUser = await this.userRepository.findOne({
        where: { email: loginDto.email },
        withDeleted: true,
      });

      if (existingUser?.isDeactivated) {
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

  // ========== 비밀번호 관련 ==========

  async sendResetPasswordCode(
    email: string,
    lang?: 'ko' | 'en',
  ): Promise<{ remainCount: number; messageCode: MessageCode }> {
    await this.ensureRegularUserAccount(email);
    return this.emailVerificationService.sendCode(
      email,
      EmailPurpose.RESET_PASSWORD,
      lang,
    );
  }

  async verifyResetPasswordCode(email: string, code: string): Promise<void> {
    await this.ensureRegularUserAccount(email);
    await this.emailVerificationService.verifyCode(
      email,
      code,
      EmailPurpose.RESET_PASSWORD,
    );
  }

  async resetPassword(resetPasswordDto: ResetPasswordDto): Promise<void> {
    const isEmailVerified = await this.emailVerificationService.isEmailVerified(
      resetPasswordDto.email,
      EmailPurpose.RESET_PASSWORD,
    );
    if (!isEmailVerified) {
      throw new BadRequestException({
        errorCode: ErrorCode.AUTH_EMAIL_NOT_VERIFIED,
      });
    }

    const user = await this.ensureRegularUserAccount(resetPasswordDto.email);
    this.ensurePasswordChangeAllowed(user);
    const hashedPassword = await bcrypt.hash(resetPasswordDto.newPassword, 10);
    await this.userService.updatePassword(user, hashedPassword);
    await this.userService.markEmailVerified(resetPasswordDto.email);
    await this.emailVerificationService.expireVerification(
      resetPasswordDto.email,
      EmailPurpose.RESET_PASSWORD,
    );
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

    await this.userRepository.update(
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

    await this.emailVerificationService.expireVerification(
      reRegisterDto.email,
      EmailPurpose.RE_REGISTER,
    );

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

    const defaultAddress =
      await this.userService.getEntityDefaultAddress(entity);
    const addressResponse = this.buildAddressResponse(entity, defaultAddress);

    return {
      email: entity.email,
      name: this.nullableString(entity.name),
      ...addressResponse,
    };
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

  private ensurePasswordChangeAllowed(user: User): void {
    if (!user.lastPasswordChangedAt) {
      return;
    }

    const now = Date.now();
    const lastChanged = new Date(user.lastPasswordChangedAt).getTime();

    if (now - lastChanged < AUTH_TIMING.ONE_DAY_MS) {
      throw new HttpException(
        {
          errorCode: ErrorCode.AUTH_PASSWORD_CHANGE_LIMIT,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async ensureRegularUserAccount(email: string): Promise<User> {
    const user = await this.userService.findByEmail(email);
    if (!user) {
      throw new BadRequestException({
        errorCode: ErrorCode.AUTH_EMAIL_NOT_REGISTERED,
      });
    }

    if (!user.password) {
      throw new BadRequestException({
        errorCode: ErrorCode.AUTH_SOCIAL_LOGIN_ACCOUNT,
      });
    }

    return user;
  }

  private nullableString(value: string | null | undefined): string | null {
    return value ?? null;
  }

  private nullableNumber(value: number | null | undefined): number | null {
    return value ?? null;
  }
}
