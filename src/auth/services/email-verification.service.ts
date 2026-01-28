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
import { ErrorCode } from '@/common/constants/error-codes';
import { MessageCode } from '@/common/constants/message-codes';
import { TEST_MODE } from '../../common/constants/test-mode.constants';
import { isTestMode } from '../../common/utils/test-mode.util';
import { EMAIL_CONTENT } from '../constants/email-content.constants';
import { EmailPurpose } from '../dto/send-email-code.dto';
import { EmailVerification } from '../entities/email-verification.entity';
import { User } from '../../user/entities/user.entity';

@Injectable()
export class EmailVerificationService {
  private readonly logger = new Logger(EmailVerificationService.name);
  private readonly dailySendLimit = 5;

  constructor(
    @InjectRepository(EmailVerification)
    private readonly emailVerificationRepository: Repository<EmailVerification>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
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
    lang?: 'ko' | 'en',
  ): Promise<{
    remainCount: number;
    messageCode: MessageCode;
  }> {
    this.ensureMailConfig();
    const normalizedPurpose = this.normalizePurpose(purpose);

    // User lookup and language selection
    let selectedLang = lang || 'ko';
    if (!lang) {
      const user = await this.userRepository.findOne({
        where: { email },
        select: ['preferredLanguage'],
      });
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

    await this.mailerService.sendMail({
      to: email,
      subject: localizedContent.emailTitle,
      template: this.getTemplateName(selectedLang),
      context: {
        ...localizedContent,
        verificationCode: code,
        lang: selectedLang,
      },
    });

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
    // 테스트 모드에서는 이메일 설정 검증 건너뛰기
    if (isTestMode()) {
      this.logger.debug('[TEST MODE] Skipping email config validation');
      return;
    }

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
      this.logger.error('Email configuration is missing');
      throw new InternalServerErrorException('Email configuration error');
    }
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
    if (!target) {
      return false;
    }
    return now.toDateString() === target.toDateString();
  }

  private getTemplateName(lang: string): string {
    const supportedLangs = ['ko', 'en'];
    const selectedLang = supportedLangs.includes(lang) ? lang : 'ko';
    return `email-verification-${selectedLang}`;
  }

  /**
   * Send welcome email to newly registered user
   * @param userId - User ID for fetching user data
   * @param language - Preferred language ('ko' | 'en')
   */
  async sendWelcomeEmail(
    userId: string,
    language?: 'ko' | 'en',
  ): Promise<void> {
    try {
      // Fetch user data
      const user = await this.userRepository.findOne({
        where: { id: parseInt(userId, 10) },
        select: ['email', 'name', 'preferredLanguage'],
      });

      if (!user) {
        this.logger.warn(`User with ID ${userId} not found for welcome email`);
        return;
      }

      // Determine language
      const selectedLang = language || user.preferredLanguage || 'ko';

      // Build localized content
      const content = EMAIL_CONTENT[selectedLang]?.welcome;
      const userName = user.name || user.email.split('@')[0];
      const loginLink =
        this.config.get<string>('FRONTEND_URL') || 'https://pickeat.com';

      // Test mode check
      if (isTestMode()) {
        this.logger.debug(
          `[TEST MODE] Skipping welcome email to ${user.email} in ${selectedLang}`,
        );
        return;
      }

      // Send email
      await this.mailerService.sendMail({
        to: user.email,
        subject: content.emailTitle,
        template: this.getWelcomeTemplateName(selectedLang),
        context: {
          lang: selectedLang,
          pageTitle: content.pageTitle,
          emailTitle: content.emailTitle,
          userName,
          description: content.description,
          featuresTitle: content.featuresTitle,
          loginLink,
          ctaText: content.ctaText,
          footer: content.footer,
        },
      });

      this.logger.log(`Welcome email sent to ${user.email} in ${selectedLang}`);
    } catch (error) {
      this.logger.error(
        `Failed to send welcome email to user ${userId}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Send account deactivation notification email
   * @param email - User email address
   * @param reason - Deactivation reason (HTML-safe)
   * @param deactivatedAt - Deactivation timestamp
   * @param language - Preferred language ('ko' | 'en')
   */
  async sendAccountDeactivationEmail(
    email: string,
    reason: string,
    deactivatedAt: Date,
    language?: 'ko' | 'en',
  ): Promise<void> {
    try {
      // Determine language
      let selectedLang = language || 'ko';
      if (!language) {
        const user = await this.userRepository.findOne({
          where: { email },
          select: ['preferredLanguage'],
        });
        if (user?.preferredLanguage) {
          selectedLang = user.preferredLanguage;
        }
      }

      // Build localized content
      const content = EMAIL_CONTENT[selectedLang]?.deactivation;
      const userName = email.split('@')[0];

      // Format timestamp
      const formattedDate = deactivatedAt.toLocaleString(
        selectedLang === 'ko' ? 'ko-KR' : 'en-US',
        {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        },
      );

      // Test mode check
      if (isTestMode()) {
        this.logger.debug(
          `[TEST MODE] Skipping deactivation email to ${email} in ${selectedLang}`,
        );
        return;
      }

      // Send email
      await this.mailerService.sendMail({
        to: email,
        subject: content.emailTitle,
        template: this.getAccountDeactivationTemplateName(selectedLang),
        context: {
          lang: selectedLang,
          pageTitle: content.pageTitle,
          emailTitle: content.emailTitle,
          userName,
          description: content.description,
          reason,
          deactivatedAt: formattedDate,
          supportEmail: content.supportEmail,
          dataRetentionDays: content.dataRetentionDays,
          footer: content.footer,
        },
      });

      this.logger.log(`Deactivation email sent to ${email} in ${selectedLang}`);
    } catch (error) {
      this.logger.error(
        `Failed to send deactivation email to ${email}: ${error.message}`,
      );
      throw error;
    }
  }

  private getWelcomeTemplateName(lang: string): string {
    const supportedLangs = ['ko', 'en'];
    const selectedLang = supportedLangs.includes(lang) ? lang : 'ko';
    return `welcome-${selectedLang}`;
  }

  private getAccountDeactivationTemplateName(lang: string): string {
    const supportedLangs = ['ko', 'en'];
    const selectedLang = supportedLangs.includes(lang) ? lang : 'ko';
    return `account-deactivation-${selectedLang}`;
  }
}
