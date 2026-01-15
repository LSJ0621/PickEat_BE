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

  async kakaoLogin(code: string): Promise<AuthResult> {
    return this.authSocialService.kakaoLogin(code, (entity) =>
      this.buildAuthResult(entity),
    );
  }

  async kakaoLoginWithToken(accessToken: string): Promise<AuthResult> {
    return this.authSocialService.kakaoLoginWithToken(accessToken, (entity) =>
      this.buildAuthResult(entity),
    );
  }

  async googleLogin(code: string): Promise<AuthResult> {
    return this.authSocialService.googleLogin(code, (entity) =>
      this.buildAuthResult(entity),
    );
  }

  async reRegisterSocial(
    reRegisterSocialDto: ReRegisterSocialDto,
  ): Promise<{ message: string }> {
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

  async register(registerDto: RegisterDto) {
    await this.checkEmailAvailability(registerDto.email, true);

    const isEmailVerified = await this.emailVerificationService.isEmailVerified(
      registerDto.email,
      EmailPurpose.SIGNUP,
    );

    if (!isEmailVerified) {
      throw new BadRequestException('이메일 인증이 완료되지 않았습니다.');
    }

    const hashedPassword = await bcrypt.hash(registerDto.password, 10);

    await this.userService.createUser({
      email: registerDto.email,
      password: hashedPassword,
      role: 'USER',
      name: registerDto.name,
    });

    await this.userService.markEmailVerified(registerDto.email);
    await this.emailVerificationService.expireVerification(
      registerDto.email,
      EmailPurpose.SIGNUP,
    );

    return { message: '회원가입이 완료되었습니다.' };
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
            message: '계정이 비활성화되었습니다. 관리자에게 문의해주세요.',
            error: 'USER_DEACTIVATED',
          },
          HttpStatus.FORBIDDEN,
        );
      }

      throw new UnauthorizedException(
        '이메일 또는 비밀번호가 올바르지 않습니다.',
      );
    }

    return this.buildAuthResult(user);
  }

  async checkEmail(email: string) {
    return this.checkEmailAvailability(email, false);
  }

  // ========== 비밀번호 관련 ==========

  async sendResetPasswordCode(
    email: string,
  ): Promise<{ remainCount: number; message: string }> {
    await this.ensureRegularUserAccount(email);
    return this.emailVerificationService.sendCode(
      email,
      EmailPurpose.RESET_PASSWORD,
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
      throw new BadRequestException('이메일 인증이 완료되지 않았습니다.');
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

  async reRegister(reRegisterDto: ReRegisterDto): Promise<{ message: string }> {
    const deletedUser = await this.userRepository.findOne({
      where: { email: reRegisterDto.email },
      withDeleted: true,
    });

    if (!deletedUser || !deletedUser.deletedAt) {
      throw new BadRequestException('재가입할 수 있는 계정이 없습니다.');
    }

    const isEmailVerified = await this.emailVerificationService.isEmailVerified(
      reRegisterDto.email,
      EmailPurpose.RE_REGISTER,
    );

    if (!isEmailVerified) {
      throw new BadRequestException('이메일 인증이 완료되지 않았습니다.');
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
      throw new BadRequestException('재가입 처리 중 오류가 발생했습니다.');
    }

    return { message: '재가입이 완료되었습니다. 로그인해주세요.' };
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
    message: string;
    canReRegister?: boolean;
  } | void> {
    const existingUser = await this.userRepository.findOne({
      where: { email },
      withDeleted: true,
    });

    if (existingUser && !existingUser.deletedAt) {
      if (throwOnConflict) {
        throw new BadRequestException('이미 등록된 이메일입니다.');
      }
      return { available: false, message: '이미 사용 중인 이메일입니다.' };
    }

    if (existingUser && existingUser.deletedAt) {
      if (throwOnConflict) {
        throw new BadRequestException(
          '기존에 탈퇴 이력이 있습니다. 재가입을 진행해주세요.',
        );
      }
      return {
        available: false,
        canReRegister: true,
        message: '기존에 탈퇴 이력이 있습니다. 재가입하시겠습니까?',
      };
    }

    if (throwOnConflict) {
      return;
    }
    return { available: true, message: '사용 가능한 이메일입니다.' };
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
        '비밀번호는 하루에 한 번만 변경할 수 있습니다.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async ensureRegularUserAccount(email: string): Promise<User> {
    const user = await this.userService.findByEmail(email);
    if (!user) {
      throw new BadRequestException('등록되지 않은 이메일입니다.');
    }

    if (!user.password) {
      throw new BadRequestException('소셜 로그인으로 가입한 계정입니다.');
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
