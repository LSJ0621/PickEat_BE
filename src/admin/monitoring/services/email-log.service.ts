import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EmailLog } from '../entities/email-log.entity';
import { EmailPurpose } from '../monitoring.constants';

@Injectable()
export class EmailLogService {
  private readonly logger = new Logger(EmailLogService.name);

  constructor(
    @InjectRepository(EmailLog)
    private readonly emailLogRepository: Repository<EmailLog>,
  ) {}

  /**
   * 이메일 발송 성공 로그를 저장합니다.
   * @param recipient 수신자 이메일 (마스킹 처리됨)
   * @param purpose 이메일 발송 목적
   * @returns 생성된 이메일 로그 엔티티
   */
  async logSuccess(
    recipient: string,
    purpose: EmailPurpose,
  ): Promise<EmailLog> {
    const maskedRecipient = this.maskEmail(recipient);
    const log = this.emailLogRepository.create({
      recipient: maskedRecipient,
      purpose,
      success: true,
      errorMessage: null,
    });

    const savedLog = await this.emailLogRepository.save(log);
    this.logger.debug(
      `Email sent successfully: recipient=${maskedRecipient}, purpose=${purpose}`,
    );

    return savedLog;
  }

  /**
   * 이메일 발송 실패 로그를 저장합니다.
   * @param recipient 수신자 이메일 (마스킹 처리됨)
   * @param purpose 이메일 발송 목적
   * @param errorMessage 에러 메시지
   * @returns 생성된 이메일 로그 엔티티
   */
  async logFailure(
    recipient: string,
    purpose: EmailPurpose,
    errorMessage: string,
  ): Promise<EmailLog> {
    const maskedRecipient = this.maskEmail(recipient);
    const log = this.emailLogRepository.create({
      recipient: maskedRecipient,
      purpose,
      success: false,
      errorMessage,
    });

    const savedLog = await this.emailLogRepository.save(log);
    this.logger.warn(
      `Email failed: recipient=${maskedRecipient}, purpose=${purpose}, error=${errorMessage}`,
    );

    return savedLog;
  }

  /**
   * 이메일 주소를 마스킹 처리합니다.
   * 예: test@example.com -> t***@example.com
   * @param email 원본 이메일 주소
   * @returns 마스킹된 이메일 주소
   */
  maskEmail(email: string): string {
    if (!email || !email.includes('@')) {
      return '***';
    }

    const [localPart, domain] = email.split('@');

    if (localPart.length <= 1) {
      return `*@${domain}`;
    }

    const visibleChars = Math.min(Math.ceil(localPart.length / 3), 3);
    const maskedLocalPart =
      localPart.slice(0, visibleChars) +
      '*'.repeat(Math.max(localPart.length - visibleChars, 3));

    return `${maskedLocalPart}@${domain}`;
  }
}
