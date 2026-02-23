import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { randomInt } from 'crypto';
import { Repository } from 'typeorm';
import { EMAIL_VERIFICATION } from '@/common/constants/business.constants';
import { ErrorCode } from '@/common/constants/error-codes';
import { MessageCode } from '@/common/constants/message-codes';
import { TEST_MODE } from '@/common/constants/test-mode.constants';
import { isTestMode } from '@/common/utils/test-mode.util';
import { EMAIL_CONTENT } from '../constants/email-content.constants';
import { EmailPurpose } from '../dto/send-email-code.dto';
import { EmailVerification } from '../entities/email-verification.entity';
import { UserService } from '@/user/user.service';
import { EmailNotificationService } from './email-notification.service';

@Injectable()
export class EmailVerificationService {
  private readonly logger = new Logger(EmailVerificationService.name);
  private readonly dailySendLimit = 5;

  constructor(
    @InjectRepository(EmailVerification)
    private readonly emailVerificationRepository: Repository<EmailVerification>,
    private readonly userService: UserService,
    private readonly emailNotificationService: EmailNotificationService,
  ) {
    this.emailNotificationService.ensureMailConfig();
  }

  generateCode(length = 6): string {
    const max = 10 ** length;
    const code = randomInt(0, max);
    return code.toString().padStart(length, '0');
  }

  async sendCode(
    email: string,
    purpose: EmailPurpose = EmailPurpose.SIGNUP,
    lang?: 'ko' | 'en',
  ): Promise<{
    remainCount: number;
    messageCode: MessageCode;
  }> {
    const normalizedPurpose = this.normalizePurpose(purpose);

    // User lookup and language selection
    let selectedLang = lang || 'ko';
    if (!lang) {
      const user = await this.userService.findByEmailWithSelect(email, [
        'preferredLanguage',
      ]);
      if (user?.preferredLanguage) {
        selectedLang = user.preferredLanguage;
      }
    }

    const emailContent = EMAIL_CONTENT[selectedLang];
    const localizedContent = {
      emailTitle: emailContent.verification.emailTitle[normalizedPurpose],
      pageTitle: emailContent.verification.pageTitle,
      purposeLabel: emailContent.verification.purposeLabel[normalizedPurpose],
      description: emailContent.verification.description[normalizedPurpose],
      inputPrompt: emailContent.verification.inputPrompt,
      validityMessage: emailContent.verification.validityMessage,
      securityMessage: emailContent.verification.securityMessage,
      ignoreMessage: emailContent.verification.ignoreMessage,
      footer: emailContent.verification.footer[normalizedPurpose],
    };
    const now = new Date();
    const latest = await this.getLatest(email, normalizedPurpose);
    const isSamePurposeDay =
      latest &&
      this.isSameDay(now, latest.lastSentAt ?? latest.createdAt ?? now);

    this.ensureNotCompletedToday(latest, now, normalizedPurpose, selectedLang);
    this.ensureNotBlocked(latest, now, selectedLang);

    if (latest && isSamePurposeDay) {
      this.ensureResendAllowed(latest, now, selectedLang);
    }

    const code = this.generateCode();
    const codeHash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(
      now.getTime() + EMAIL_VERIFICATION.CODE_EXPIRES_MS,
    );
    const nextSendCount = latest && isSamePurposeDay ? latest.sendCount + 1 : 1;
    if (nextSendCount > this.dailySendLimit) {
      throw new BadRequestException({
        errorCode: ErrorCode.AUTH_DAILY_SEND_LIMIT_EXCEEDED,
      });
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

    // 테스트 모드에서는 실제 이메일 발송 건너뛰기
    if (isTestMode()) {
      this.logger.debug(
        `[TEST MODE] Skipping email send to ${email}, code: ${code}`,
      );
      return {
        remainCount,
        messageCode: MessageCode.AUTH_VERIFICATION_CODE_SENT,
      };
    }

    await this.emailNotificationService.sendVerificationEmail(
      email,
      code,
      localizedContent,
      selectedLang,
    );

    return {
      remainCount,
      messageCode: MessageCode.AUTH_VERIFICATION_CODE_SENT,
    };
  }

  async verifyCode(
    email: string,
    code: string,
    purpose: EmailPurpose = EmailPurpose.SIGNUP,
    lang?: string,
  ): Promise<void> {
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
      return;
    }

    const normalizedPurpose = this.normalizePurpose(purpose);
    const now = new Date();
    const latest = await this.getLatest(email, normalizedPurpose);

    this.ensureNotBlocked(latest, now, lang);

    if (!latest) {
      throw new BadRequestException({
        errorCode: ErrorCode.AUTH_VERIFICATION_CODE_INVALID,
      });
    }

    this.ensureUsableStatus(latest, lang);
    if (latest.expiresAt.getTime() <= now.getTime()) {
      await this.markAsExpired(latest);
      throw new BadRequestException({
        errorCode: ErrorCode.AUTH_VERIFICATION_CODE_EXPIRED,
      });
    }

    const isValid = await bcrypt.compare(code, latest.codeHash);
    if (!isValid) {
      await this.handleFailedAttempt(latest, now, lang);
    }

    latest.used = true;
    latest.usedAt = now;
    latest.status = 'USED';
    await this.emailVerificationRepository.save(latest);
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
    await this.emailVerificationRepository.softDelete({
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

  /**
   * Delegate: Send welcome email
   */
  async sendWelcomeEmail(
    userId: string,
    language?: 'ko' | 'en',
  ): Promise<void> {
    return this.emailNotificationService.sendWelcomeEmail(userId, language);
  }

  /**
   * Delegate: Send account deactivation notification email
   */
  async sendAccountDeactivationEmail(
    email: string,
    reason: string,
    deactivatedAt: Date,
    language?: 'ko' | 'en',
  ): Promise<void> {
    return this.emailNotificationService.sendAccountDeactivationEmail(
      email,
      reason,
      deactivatedAt,
      language,
    );
  }

  private normalizePurpose(purpose?: EmailPurpose): EmailPurpose {
    return purpose ?? EmailPurpose.SIGNUP;
  }

  private ensureNotBlocked(
    record: EmailVerification | null,
    now: Date,
    _lang?: string,
  ) {
    if (!record) {
      return;
    }
    const referenceDate = record.updatedAt ?? record.createdAt;
    if (
      record.failCount >= 5 &&
      referenceDate &&
      this.isSameDay(now, referenceDate)
    ) {
      throw new BadRequestException({
        errorCode: ErrorCode.AUTH_VERIFICATION_BLOCKED,
      });
    }
  }

  private ensureResendAllowed(
    record: EmailVerification,
    now: Date,
    _lang?: string,
  ) {
    const baseDate = record.lastSentAt ?? record.createdAt;
    if (
      baseDate &&
      now.getTime() - baseDate.getTime() < EMAIL_VERIFICATION.RESEND_LIMIT_MS
    ) {
      throw new BadRequestException({
        errorCode: ErrorCode.AUTH_VERIFICATION_TOO_MANY_REQUESTS,
      });
    }

    if (
      baseDate &&
      this.isSameDay(now, baseDate) &&
      record.sendCount >= this.dailySendLimit
    ) {
      throw new BadRequestException({
        errorCode: ErrorCode.AUTH_DAILY_SEND_LIMIT_EXCEEDED,
      });
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

  private ensureUsableStatus(record: EmailVerification, _lang?: string) {
    if (record.status === 'INVALIDATED') {
      throw new BadRequestException({
        errorCode: ErrorCode.AUTH_VERIFICATION_CODE_INVALIDATED,
      });
    }
    if (record.status === 'EXPIRED') {
      throw new BadRequestException({
        errorCode: ErrorCode.AUTH_VERIFICATION_CODE_EXPIRED,
      });
    }
    if (record.status === 'USED') {
      throw new BadRequestException({
        errorCode: ErrorCode.AUTH_VERIFICATION_CODE_USED,
      });
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
    _purpose: EmailPurpose,
    _lang?: string,
  ) {
    if (
      !record ||
      record.status !== 'INVALIDATED' ||
      !this.isSameDay(now, record.updatedAt ?? record.createdAt)
    ) {
      return;
    }

    throw new BadRequestException({
      errorCode: ErrorCode.AUTH_ALREADY_COMPLETED_TODAY,
    });
  }

  private async handleFailedAttempt(
    record: EmailVerification,
    now: Date,
    _lang?: string,
  ) {
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
      throw new BadRequestException({
        errorCode: ErrorCode.AUTH_VERIFICATION_BLOCKED,
      });
    }

    throw new BadRequestException({
      errorCode: ErrorCode.AUTH_VERIFICATION_CODE_INVALID,
    });
  }

  private isSameDay(now: Date, target?: Date | null): boolean {
    if (!target) return false;
    return (
      now.getUTCFullYear() === target.getUTCFullYear() &&
      now.getUTCMonth() === target.getUTCMonth() &&
      now.getUTCDate() === target.getUTCDate()
    );
  }
}
