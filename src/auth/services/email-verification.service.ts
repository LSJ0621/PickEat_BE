import { MailerService } from '@nestjs-modules/mailer';
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { randomInt } from 'crypto';
import { Repository } from 'typeorm';
import { EMAIL_VERIFICATION } from '../../common/constants/business.constants';
import { TEST_MODE } from '../../common/constants/test-mode.constants';
import { isTestMode } from '../../common/utils/test-mode.util';
import { EmailPurpose } from '../dto/send-email-code.dto';
import { EmailVerification } from '../entities/email-verification.entity';

@Injectable()
export class EmailVerificationService {
  private readonly logger = new Logger(EmailVerificationService.name);
  private readonly dailySendLimit = 5;

  constructor(
    @InjectRepository(EmailVerification)
    private readonly emailVerificationRepository: Repository<EmailVerification>,
    private readonly mailerService: MailerService,
    private readonly config: ConfigService,
  ) {
    this.ensureMailConfig();
  }

  generateCode(length = 6): string {
    const max = 10 ** length;
    const code = randomInt(0, max);
    return code.toString().padStart(length, '0');
  }

  async sendCode(
    email: string,
    purpose: EmailPurpose = EmailPurpose.SIGNUP,
  ): Promise<{ remainCount: number; message: string }> {
    this.ensureMailConfig();
    const normalizedPurpose = this.normalizePurpose(purpose);
    const isResetPassword = normalizedPurpose === EmailPurpose.RESET_PASSWORD;
    const isReRegister = normalizedPurpose === EmailPurpose.RE_REGISTER;
    let purposeLabel = '회원가입';
    let subject = '[PickEat] 이메일 인증 코드';
    if (isResetPassword) {
      purposeLabel = '비밀번호 재설정';
      subject = '[PickEat] 비밀번호 재설정 인증 코드';
    } else if (isReRegister) {
      purposeLabel = '재가입';
      subject = '[PickEat] 재가입 인증 코드';
    }
    const description = `PickEat ${purposeLabel}을 위한 인증번호입니다.`;
    const footer = `이 이메일은 PickEat ${purposeLabel} 요청으로 인해 발송되었습니다.`;
    const now = new Date();
    const latest = await this.getLatest(email, normalizedPurpose);
    const isSamePurposeDay =
      latest &&
      this.isSameDay(now, latest.lastSentAt ?? latest.createdAt ?? now);

    this.ensureNotCompletedToday(latest, now, normalizedPurpose);
    this.ensureNotBlocked(latest, now);

    if (latest && isSamePurposeDay) {
      this.ensureResendAllowed(latest, now);
    }

    const code = this.generateCode();
    const codeHash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(
      now.getTime() + EMAIL_VERIFICATION.CODE_EXPIRES_MS,
    );
    const nextSendCount = latest && isSamePurposeDay ? latest.sendCount + 1 : 1;
    if (nextSendCount > this.dailySendLimit) {
      throw new BadRequestException('하루 최대 발송 횟수를 초과했습니다');
    }
    const remainCount = Math.max(this.dailySendLimit - nextSendCount, 0);

    if (latest && isSamePurposeDay) {
      await this.updateExistingRecord(
        latest,
        codeHash,
        expiresAt,
        now,
        nextSendCount,
      );
    } else {
      await this.createNewRecord(
        email,
        normalizedPurpose,
        codeHash,
        expiresAt,
        now,
        nextSendCount,
      );
    }

    await this.mailerService.sendMail({
      to: email,
      subject,
      template: 'email-verification',
      context: {
        verificationCode: code,
        purposeLabel,
        description,
        footer,
      },
    });

    return {
      remainCount,
      message: `인증번호가 발송되었습니다. 남은 재발송 횟수는 ${remainCount}회입니다.`,
    };
  }

  async verifyCode(
    email: string,
    code: string,
    purpose: EmailPurpose = EmailPurpose.SIGNUP,
  ): Promise<boolean> {
    // 테스트 모드에서 테스트 코드 사용 시 바이패스
    if (isTestMode() && code === TEST_MODE.EMAIL_VERIFICATION_CODE) {
      this.logger.debug(`[TEST MODE] Email verification bypass for ${email}`);
      const normalizedPurpose = this.normalizePurpose(purpose);
      const latest = await this.getLatest(email, normalizedPurpose);
      if (latest) {
        const now = new Date();
        latest.used = true;
        latest.usedAt = now;
        latest.status = 'USED';
        await this.emailVerificationRepository.save(latest);
      }
      return true;
    }

    const normalizedPurpose = this.normalizePurpose(purpose);
    const now = new Date();
    const latest = await this.getLatest(email, normalizedPurpose);

    this.ensureNotBlocked(latest, now);

    if (!latest) {
      throw new BadRequestException('코드가 유효하지 않습니다');
    }

    this.ensureUsableStatus(latest);
    if (latest.expiresAt.getTime() <= now.getTime()) {
      await this.markAsExpired(latest);
      throw new BadRequestException('코드가 만료되었습니다');
    }

    const isValid = await bcrypt.compare(code, latest.codeHash);
    if (!isValid) {
      await this.handleFailedAttempt(latest, now);
    }

    latest.used = true;
    latest.usedAt = now;
    latest.status = 'USED';
    await this.emailVerificationRepository.save(latest);
    return true;
  }

  async isEmailVerified(
    email: string,
    purpose: EmailPurpose = EmailPurpose.SIGNUP,
  ): Promise<boolean> {
    const normalizedPurpose = this.normalizePurpose(purpose);
    const latest = await this.getLatest(email, normalizedPurpose);
    return latest?.status === 'USED';
  }

  async clearVerification(
    email: string,
    purpose: EmailPurpose = EmailPurpose.SIGNUP,
  ): Promise<void> {
    const normalizedPurpose = this.normalizePurpose(purpose);
    await this.emailVerificationRepository.delete({
      email,
      purpose: normalizedPurpose,
    });
  }

  async expireVerification(
    email: string,
    purpose: EmailPurpose = EmailPurpose.SIGNUP,
  ): Promise<void> {
    const normalizedPurpose = this.normalizePurpose(purpose);
    const latest = await this.getLatest(email, normalizedPurpose);
    if (!latest) {
      return;
    }
    latest.status = 'INVALIDATED';
    latest.expiresAt = new Date();
    await this.emailVerificationRepository.save(latest);
  }

  private normalizePurpose(purpose?: EmailPurpose): EmailPurpose {
    return purpose ?? EmailPurpose.SIGNUP;
  }

  private ensureMailConfig() {
    const emailHost = this.config.get<string>('EMAIL_HOST');
    const emailPort = this.config.get<number>('EMAIL_PORT');
    const emailSecure = this.config.get<string>('EMAIL_SECURE');
    const emailAddress = this.config.get<string>('EMAIL_ADDRESS');
    const emailPassword = this.config.get<string>('EMAIL_PASSWORD');
    if (
      !emailHost ||
      !emailPort ||
      !emailSecure ||
      !emailAddress ||
      !emailPassword
    ) {
      this.logger.error('이메일 환경변수가 설정되지 않았습니다.');
      throw new InternalServerErrorException(
        '메일 설정이 완료되지 않았습니다. 관리자에게 문의하세요.',
      );
    }
  }

  private ensureNotBlocked(record: EmailVerification | null, now: Date) {
    if (!record) {
      return;
    }
    const referenceDate = record.updatedAt ?? record.createdAt;
    if (
      record.failCount >= 5 &&
      referenceDate &&
      this.isSameDay(now, referenceDate)
    ) {
      throw new BadRequestException(
        '5회 실패로 인해 다음날까지 회원가입이 불가능합니다',
      );
    }
  }

  private ensureResendAllowed(record: EmailVerification, now: Date) {
    const baseDate = record.lastSentAt ?? record.createdAt;
    if (
      baseDate &&
      now.getTime() - baseDate.getTime() < EMAIL_VERIFICATION.RESEND_LIMIT_MS
    ) {
      throw new BadRequestException(
        '인증코드를 너무 자주 요청하고 있습니다. 잠시 후 다시 시도해주세요.',
      );
    }

    if (
      baseDate &&
      this.isSameDay(now, baseDate) &&
      record.sendCount >= this.dailySendLimit
    ) {
      throw new BadRequestException('하루 최대 발송 횟수를 초과했습니다');
    }
  }

  private async getLatest(
    email: string,
    purpose: EmailPurpose,
  ): Promise<EmailVerification | null> {
    return this.emailVerificationRepository.findOne({
      where: { email, purpose },
      order: { createdAt: 'DESC' },
    });
  }

  private async updateExistingRecord(
    record: EmailVerification,
    codeHash: string,
    expiresAt: Date,
    now: Date,
    nextSendCount: number,
  ) {
    record.codeHash = codeHash;
    record.expiresAt = expiresAt;
    record.used = false;
    record.usedAt = null;
    record.status = 'ACTIVE';
    record.lastSentAt = now;
    record.sendCount = nextSendCount;
    await this.emailVerificationRepository.save(record);
  }

  private async createNewRecord(
    email: string,
    purpose: EmailPurpose,
    codeHash: string,
    expiresAt: Date,
    now: Date,
    nextSendCount: number,
  ) {
    const newRecord = this.emailVerificationRepository.create({
      email,
      purpose,
      codeHash,
      expiresAt,
      used: false,
      usedAt: null,
      status: 'ACTIVE',
      sendCount: nextSendCount,
      lastSentAt: now,
      failCount: 0,
    });
    await this.emailVerificationRepository.save(newRecord);
  }

  private ensureUsableStatus(record: EmailVerification) {
    if (record.status === 'INVALIDATED') {
      throw new BadRequestException('이미 사용이 완료된 코드입니다');
    }
    if (record.status === 'EXPIRED') {
      throw new BadRequestException('코드가 만료되었습니다');
    }
    if (record.status === 'USED') {
      throw new BadRequestException('이미 사용된 코드입니다');
    }
  }

  private async markAsExpired(record: EmailVerification) {
    record.status = 'EXPIRED';
    record.expiresAt = new Date();
    await this.emailVerificationRepository.save(record);
  }

  private ensureNotCompletedToday(
    record: EmailVerification | null,
    now: Date,
    purpose: EmailPurpose,
  ) {
    if (
      !record ||
      record.status !== 'INVALIDATED' ||
      !this.isSameDay(now, record.updatedAt ?? record.createdAt)
    ) {
      return;
    }

    const message =
      purpose === EmailPurpose.RESET_PASSWORD
        ? '이미 비밀번호 재설정을 완료했습니다. 내일 다시 시도해주세요.'
        : purpose === EmailPurpose.RE_REGISTER
          ? '이미 재가입을 완료했습니다. 내일 다시 시도해주세요.'
          : '이미 이메일 인증이 완료되었습니다. 잠시 후 다시 시도해주세요.';
    throw new BadRequestException(message);
  }

  private async handleFailedAttempt(record: EmailVerification, now: Date) {
    if (this.isSameDay(now, record.updatedAt ?? record.createdAt)) {
      record.failCount += 1;
    } else {
      record.failCount = 1;
    }
    await this.emailVerificationRepository.save(record);

    if (
      record.failCount >= 5 &&
      this.isSameDay(now, record.updatedAt ?? record.createdAt)
    ) {
      throw new BadRequestException(
        '5회 실패로 인해 다음날까지 회원가입이 불가능합니다',
      );
    }

    throw new BadRequestException('코드가 유효하지 않습니다');
  }

  private isSameDay(now: Date, target?: Date | null): boolean {
    if (!target) {
      return false;
    }
    return now.toDateString() === target.toDateString();
  }
}
