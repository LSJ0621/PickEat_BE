// src/auth/services/auth-password.service.ts
import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AUTH_TIMING } from '@/common/constants/business.constants';
import { ErrorCode } from '@/common/constants/error-codes';
import { MessageCode } from '@/common/constants/message-codes';
import { User } from '@/user/entities/user.entity';
import { UserService } from '@/user/user.service';
import { ResetPasswordDto } from '../dto/reset-password.dto';
import { EmailPurpose } from '../dto/send-email-code.dto';
import { EmailVerificationService } from './email-verification.service';

@Injectable()
export class AuthPasswordService {
  private readonly logger = new Logger(AuthPasswordService.name);

  constructor(
    private readonly userService: UserService,
    private readonly emailVerificationService: EmailVerificationService,
  ) {}

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

  // ========== Private Helpers ==========

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
}
