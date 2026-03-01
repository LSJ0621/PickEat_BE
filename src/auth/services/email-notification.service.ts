import { MailerService } from '@nestjs-modules/mailer';
import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ErrorCode } from '@/common/constants/error-codes';
import { isTestMode } from '@/common/utils/test-mode.util';
import { EMAIL_CONTENT } from '../constants/email-content.constants';
import { UserService } from '@/user/user.service';

@Injectable()
export class EmailNotificationService {
  private readonly logger = new Logger(EmailNotificationService.name);

  constructor(
    private readonly userService: UserService,
    private readonly mailerService: MailerService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Validate that all required email configuration values are present
   */
  ensureMailConfig(): void {
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
      throw new InternalServerErrorException({
        errorCode: ErrorCode.AUTH_EMAIL_CONFIG_ERROR,
      });
    }
  }

  /**
   * Get a template name for the given prefix and language
   */
  private getTemplateName(prefix: string, lang: string): string {
    const supportedLangs = ['ko', 'en'];
    const selectedLang = supportedLangs.includes(lang) ? lang : 'ko';
    return `${prefix}-${selectedLang}`;
  }

  /**
   * Get the verification email template name based on language
   */
  getVerificationTemplateName(lang: string): string {
    return this.getTemplateName('email-verification', lang);
  }

  /**
   * Send verification email with code
   */
  async sendVerificationEmail(
    email: string,
    code: string,
    localizedContent: Record<string, string>,
    lang: string,
  ): Promise<void> {
    try {
      await this.mailerService.sendMail({
        to: email,
        subject: localizedContent.emailTitle,
        template: this.getVerificationTemplateName(lang),
        context: {
          ...localizedContent,
          verificationCode: code,
          lang,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Failed to send verification email to ${email}: ${message}`,
      );
      throw new InternalServerErrorException({
        errorCode: ErrorCode.AUTH_EMAIL_CONFIG_ERROR,
      });
    }
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
      const user = await this.userService.findByIdWithSelect(
        parseInt(userId, 10),
        ['email', 'name', 'preferredLanguage'],
      );

      if (!user) {
        this.logger.warn(`User with ID ${userId} not found for welcome email`);
        return;
      }

      const selectedLang = language || user.preferredLanguage || 'ko';
      const content = EMAIL_CONTENT[selectedLang]?.welcome;
      const userName = user.name || user.email.split('@')[0];
      const loginLink =
        this.config.get<string>('FRONTEND_URL') || 'https://pickeat.com';

      if (isTestMode()) {
        this.logger.debug(
          `[TEST MODE] Skipping welcome email to ${user.email} in ${selectedLang}`,
        );
        return;
      }

      await this.mailerService.sendMail({
        to: user.email,
        subject: content.emailTitle,
        template: this.getTemplateName('welcome', selectedLang),
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
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Failed to send welcome email to user ${userId}: ${message}`,
      );
      // Don't throw - welcome email failure should not block signup
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
      let selectedLang = language || 'ko';
      if (!language) {
        const user = await this.userService.findByEmailWithSelect(email, [
          'preferredLanguage',
        ]);
        if (user?.preferredLanguage) {
          selectedLang = user.preferredLanguage;
        }
      }

      const content = EMAIL_CONTENT[selectedLang]?.deactivation;
      const userName = email.split('@')[0];

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

      if (isTestMode()) {
        this.logger.debug(
          `[TEST MODE] Skipping deactivation email to ${email} in ${selectedLang}`,
        );
        return;
      }

      await this.mailerService.sendMail({
        to: email,
        subject: content.emailTitle,
        template: this.getTemplateName('account-deactivation', selectedLang),
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
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Failed to send deactivation email to ${email}: ${message}`,
      );
      // Don't throw - deactivation email failure should not block deactivation
    }
  }
}
