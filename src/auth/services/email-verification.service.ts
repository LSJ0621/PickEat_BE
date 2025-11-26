import { MailerService } from '@nestjs-modules/mailer';
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { randomInt } from 'crypto';
import { Repository } from 'typeorm';
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
  ): Promise<void> {
    this.ensureMailConfig();
    const normalizedPurpose = this.normalizePurpose(purpose);
    const now = new Date();
    const latest = await this.getLatest(email, normalizedPurpose);

    this.ensureNotBlocked(latest, now);

    if (
      latest &&
      this.isSameDay(now, latest.lastSentAt ?? latest.createdAt ?? now)
    ) {
      this.ensureResendAllowed(latest, now);
    }

    const code = this.generateCode();
    const codeHash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(now.getTime() + 3 * 60 * 1000);

    if (
      latest &&
      this.isSameDay(now, latest.lastSentAt ?? latest.createdAt ?? now)
    ) {
      await this.updateExistingRecord(latest, codeHash, expiresAt, now);
    } else {
      await this.createNewRecord(email, normalizedPurpose, codeHash, expiresAt, now);
    }

    await this.mailerService.sendMail({
      to: email,
      subject: '[PickEat] 이메일 인증 코드',
      template: 'email-verification',
      context: {
        verificationCode: code,
      },
    });
  }

  async verifyCode(
    email: string,
    code: string,
    purpose: EmailPurpose = EmailPurpose.SIGNUP,
  ): Promise<boolean> {
    const normalizedPurpose = this.normalizePurpose(purpose);
    const now = new Date();
    const latest = await this.getLatest(email, normalizedPurpose);

    this.ensureNotBlocked(latest, now);

    if (!latest) {
      throw new BadRequestException('코드가 유효하지 않습니다');
    }

    if (latest.used) {
      throw new BadRequestException('이미 사용된 코드입니다');
    }

    if (latest.expiresAt.getTime() <= now.getTime()) {
      throw new BadRequestException('코드가 만료되었습니다');
    }

    const isValid = await bcrypt.compare(code, latest.codeHash);
    if (!isValid) {
      await this.handleFailedAttempt(latest, now);
    }

    latest.used = true;
    latest.usedAt = now;
    await this.emailVerificationRepository.save(latest);
    return true;
  }

  async isEmailVerified(
    email: string,
    purpose: EmailPurpose = EmailPurpose.SIGNUP,
  ): Promise<boolean> {
    const normalizedPurpose = this.normalizePurpose(purpose);
    const latest = await this.getLatest(email, normalizedPurpose);
    return latest?.used === true;
  }

  private normalizePurpose(purpose?: EmailPurpose): EmailPurpose {
    return purpose ?? EmailPurpose.SIGNUP;
  }

  private ensureMailConfig() {
    const { EMAIL_HOST, EMAIL_PORT, EMAIL_SECURE, EMAIL_ADDRESS, EMAIL_PASSWORD } =
      process.env;
    if (!EMAIL_HOST || !EMAIL_PORT || !EMAIL_SECURE || !EMAIL_ADDRESS || !EMAIL_PASSWORD) {
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
      now.getTime() - baseDate.getTime() < 30 * 1000
    ) {
      throw new BadRequestException(
        '인증코드를 너무 자주 요청하고 있습니다. 잠시 후 다시 시도해주세요.',
      );
    }

    if (
      baseDate &&
      this.isSameDay(now, baseDate) &&
      record.sendCount > this.dailySendLimit
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
  ) {
    record.codeHash = codeHash;
    record.expiresAt = expiresAt;
    record.used = false;
    record.usedAt = null;
    record.lastSentAt = now;
    record.sendCount += 1;
    await this.emailVerificationRepository.save(record);
  }

  private async createNewRecord(
    email: string,
    purpose: EmailPurpose,
    codeHash: string,
    expiresAt: Date,
    now: Date,
  ) {
    const newRecord = this.emailVerificationRepository.create({
      email,
      purpose,
      codeHash,
      expiresAt,
      used: false,
      usedAt: null,
      sendCount: 1,
      lastSentAt: now,
      failCount: 0,
    });
    await this.emailVerificationRepository.save(newRecord);
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
