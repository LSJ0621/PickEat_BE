import { Test, TestingModule } from '@nestjs/testing';
import { InternalServerErrorException } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import { ConfigService } from '@nestjs/config';
import { EmailNotificationService } from '../../services/email-notification.service';
import { UserService } from '@/user/user.service';
import * as testModeUtil from '@/common/utils/test-mode.util';
import { UserFactory } from '../../../../test/factories/entity.factory';

jest.mock('@/common/utils/test-mode.util', () => ({
  isTestMode: jest.fn(() => false),
}));

describe('EmailNotificationService', () => {
  let service: EmailNotificationService;
  let mockMailerService: { sendMail: jest.Mock };
  let mockConfigService: { get: jest.Mock };
  let mockUserService: {
    findByIdWithSelect: jest.Mock;
    findByEmailWithSelect: jest.Mock;
  };

  const mockIsTestMode = testModeUtil.isTestMode as jest.Mock;

  beforeEach(async () => {
    mockMailerService = {
      sendMail: jest.fn().mockResolvedValue(undefined),
    };

    mockConfigService = {
      get: jest.fn(),
    };

    mockUserService = {
      findByIdWithSelect: jest.fn(),
      findByEmailWithSelect: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailNotificationService,
        { provide: MailerService, useValue: mockMailerService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: UserService, useValue: mockUserService },
      ],
    }).compile();

    service = module.get<EmailNotificationService>(EmailNotificationService);
    mockIsTestMode.mockReturnValue(false);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should create service instance when all dependencies are injected', () => {
    expect(service).toBeDefined();
  });

  // ──────────────────────────────────────────────
  // ensureMailConfig
  // ──────────────────────────────────────────────
  describe('ensureMailConfig', () => {
    it('should return without validation when test mode is active', () => {
      mockIsTestMode.mockReturnValue(true);

      expect(() => service.ensureMailConfig()).not.toThrow();
      expect(mockConfigService.get).not.toHaveBeenCalled();
    });

    it('should not throw when all required email config values are present', () => {
      mockIsTestMode.mockReturnValue(false);
      mockConfigService.get
        .mockReturnValueOnce('smtp.example.com') // EMAIL_HOST
        .mockReturnValueOnce(587)                // EMAIL_PORT
        .mockReturnValueOnce('true')             // EMAIL_SECURE
        .mockReturnValueOnce('no-reply@example.com') // EMAIL_ADDRESS
        .mockReturnValueOnce('secret');          // EMAIL_PASSWORD

      expect(() => service.ensureMailConfig()).not.toThrow();
    });

    it('should throw InternalServerErrorException when EMAIL_HOST is missing', () => {
      mockIsTestMode.mockReturnValue(false);
      mockConfigService.get
        .mockReturnValueOnce(undefined) // EMAIL_HOST missing
        .mockReturnValueOnce(587)
        .mockReturnValueOnce('true')
        .mockReturnValueOnce('no-reply@example.com')
        .mockReturnValueOnce('secret');

      expect(() => service.ensureMailConfig()).toThrow(
        InternalServerErrorException,
      );
    });

    it('should throw InternalServerErrorException when EMAIL_PASSWORD is missing', () => {
      mockIsTestMode.mockReturnValue(false);
      mockConfigService.get
        .mockReturnValueOnce('smtp.example.com')
        .mockReturnValueOnce(587)
        .mockReturnValueOnce('true')
        .mockReturnValueOnce('no-reply@example.com')
        .mockReturnValueOnce(undefined); // EMAIL_PASSWORD missing

      expect(() => service.ensureMailConfig()).toThrow(
        InternalServerErrorException,
      );
    });
  });

  // ──────────────────────────────────────────────
  // getVerificationTemplateName
  // ──────────────────────────────────────────────
  describe('getVerificationTemplateName', () => {
    it('should return korean template name when lang is ko', () => {
      const result = service.getVerificationTemplateName('ko');
      expect(result).toBe('email-verification-ko');
    });

    it('should return english template name when lang is en', () => {
      const result = service.getVerificationTemplateName('en');
      expect(result).toBe('email-verification-en');
    });

    it('should fall back to korean template when unsupported language is given', () => {
      const result = service.getVerificationTemplateName('fr');
      expect(result).toBe('email-verification-ko');
    });

    it('should fall back to korean template when empty string is given', () => {
      const result = service.getVerificationTemplateName('');
      expect(result).toBe('email-verification-ko');
    });
  });

  // ──────────────────────────────────────────────
  // sendVerificationEmail
  // ──────────────────────────────────────────────
  describe('sendVerificationEmail', () => {
    const localizedContent = {
      emailTitle: '인증 코드',
      description: '인증 코드를 입력하세요.',
    };

    it('should call mailerService.sendMail with correct params when successful', async () => {
      await service.sendVerificationEmail(
        'user@example.com',
        '123456',
        localizedContent,
        'ko',
      );

      expect(mockMailerService.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'user@example.com',
          subject: '인증 코드',
          template: 'email-verification-ko',
          context: expect.objectContaining({
            verificationCode: '123456',
            lang: 'ko',
          }),
        }),
      );
    });

    it('should use english template when lang is en', async () => {
      await service.sendVerificationEmail(
        'user@example.com',
        'ABCDEF',
        localizedContent,
        'en',
      );

      expect(mockMailerService.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          template: 'email-verification-en',
        }),
      );
    });

    it('should throw InternalServerErrorException when mailerService.sendMail throws an Error', async () => {
      mockMailerService.sendMail.mockRejectedValue(
        new Error('SMTP connection refused'),
      );

      await expect(
        service.sendVerificationEmail(
          'user@example.com',
          '123456',
          localizedContent,
          'ko',
        ),
      ).rejects.toThrow(InternalServerErrorException);
    });

    it('should throw InternalServerErrorException when mailerService.sendMail throws a non-Error value', async () => {
      mockMailerService.sendMail.mockRejectedValue('string error');

      await expect(
        service.sendVerificationEmail(
          'user@example.com',
          '123456',
          localizedContent,
          'ko',
        ),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });

  // ──────────────────────────────────────────────
  // sendWelcomeEmail
  // ──────────────────────────────────────────────
  describe('sendWelcomeEmail', () => {
    it('should send welcome email using user preferred language when no language arg is passed', async () => {
      const mockUser = UserFactory.create({
        id: 1,
        email: 'user@example.com',
        name: 'Alice',
        preferredLanguage: 'en',
      });
      mockUserService.findByIdWithSelect.mockResolvedValue(mockUser);
      mockConfigService.get.mockReturnValue('https://pickeat.com');

      await service.sendWelcomeEmail('1');

      expect(mockMailerService.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'user@example.com',
          template: 'welcome-en',
        }),
      );
    });

    it('should use language argument when provided even if user has different preferred language', async () => {
      const mockUser = UserFactory.create({
        id: 1,
        email: 'user@example.com',
        name: 'Bob',
        preferredLanguage: 'en',
      });
      mockUserService.findByIdWithSelect.mockResolvedValue(mockUser);
      mockConfigService.get.mockReturnValue('https://pickeat.com');

      await service.sendWelcomeEmail('1', 'ko');

      expect(mockMailerService.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          template: 'welcome-ko',
        }),
      );
    });

    it('should fallback to ko language when user has no preferred language', async () => {
      const mockUser = UserFactory.create({
        id: 1,
        email: 'user@example.com',
        name: 'Charlie',
        preferredLanguage: null as unknown as 'ko',
      });
      mockUserService.findByIdWithSelect.mockResolvedValue(mockUser);
      mockConfigService.get.mockReturnValue(undefined);

      await service.sendWelcomeEmail('1');

      expect(mockMailerService.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          template: 'welcome-ko',
        }),
      );
    });

    it('should derive userName from email prefix when user has no name', async () => {
      const mockUser = UserFactory.create({
        id: 1,
        email: 'johndoe@example.com',
        preferredLanguage: 'ko',
      });
      // Force name to falsy so the source code falls back to email prefix
      mockUser.name = '';
      mockUserService.findByIdWithSelect.mockResolvedValue(mockUser);
      mockConfigService.get.mockReturnValue('https://pickeat.com');

      await service.sendWelcomeEmail('1');

      expect(mockMailerService.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          context: expect.objectContaining({ userName: 'johndoe' }),
        }),
      );
    });

    it('should return early without sending email when user is not found', async () => {
      mockUserService.findByIdWithSelect.mockResolvedValue(null);

      await service.sendWelcomeEmail('999');

      expect(mockMailerService.sendMail).not.toHaveBeenCalled();
    });

    it('should return early without sending email when test mode is active', async () => {
      mockIsTestMode.mockReturnValue(true);
      const mockUser = UserFactory.create({
        id: 1,
        email: 'user@example.com',
        name: 'Dave',
        preferredLanguage: 'ko',
      });
      mockUserService.findByIdWithSelect.mockResolvedValue(mockUser);

      await service.sendWelcomeEmail('1');

      expect(mockMailerService.sendMail).not.toHaveBeenCalled();
    });

    it('should not throw when mailerService.sendMail fails during welcome email', async () => {
      const mockUser = UserFactory.create({
        id: 1,
        email: 'user@example.com',
        name: 'Eve',
        preferredLanguage: 'ko',
      });
      mockUserService.findByIdWithSelect.mockResolvedValue(mockUser);
      mockConfigService.get.mockReturnValue('https://pickeat.com');
      mockMailerService.sendMail.mockRejectedValue(new Error('SMTP failed'));

      await expect(service.sendWelcomeEmail('1')).resolves.toBeUndefined();
    });

    it('should use FRONTEND_URL from config as loginLink', async () => {
      const mockUser = UserFactory.create({
        id: 1,
        email: 'user@example.com',
        name: 'Frank',
        preferredLanguage: 'ko',
      });
      mockUserService.findByIdWithSelect.mockResolvedValue(mockUser);
      mockConfigService.get.mockReturnValue('https://custom.pickeat.app');

      await service.sendWelcomeEmail('1');

      expect(mockMailerService.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          context: expect.objectContaining({
            loginLink: 'https://custom.pickeat.app',
          }),
        }),
      );
    });
  });

  // ──────────────────────────────────────────────
  // sendAccountDeactivationEmail
  // ──────────────────────────────────────────────
  describe('sendAccountDeactivationEmail', () => {
    const deactivatedAt = new Date('2024-01-15T10:00:00Z');

    it('should send deactivation email using provided language when language arg is passed', async () => {
      await service.sendAccountDeactivationEmail(
        'user@example.com',
        '악의적 활동',
        deactivatedAt,
        'ko',
      );

      expect(mockMailerService.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'user@example.com',
          template: 'account-deactivation-ko',
        }),
      );
    });

    it('should send deactivation email with english template when language is en', async () => {
      await service.sendAccountDeactivationEmail(
        'user@example.com',
        'Malicious activity',
        deactivatedAt,
        'en',
      );

      expect(mockMailerService.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          template: 'account-deactivation-en',
        }),
      );
    });

    it('should look up user preferred language when no language arg is passed', async () => {
      const mockUser = UserFactory.create({
        email: 'user@example.com',
        preferredLanguage: 'en',
      });
      mockUserService.findByEmailWithSelect.mockResolvedValue(mockUser);

      await service.sendAccountDeactivationEmail(
        'user@example.com',
        'Violation',
        deactivatedAt,
      );

      expect(mockUserService.findByEmailWithSelect).toHaveBeenCalledWith(
        'user@example.com',
        ['preferredLanguage'],
      );
      expect(mockMailerService.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          template: 'account-deactivation-en',
        }),
      );
    });

    it('should fallback to ko language when user has no preferred language and no language arg', async () => {
      mockUserService.findByEmailWithSelect.mockResolvedValue(null);

      await service.sendAccountDeactivationEmail(
        'user@example.com',
        '위반',
        deactivatedAt,
      );

      expect(mockMailerService.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          template: 'account-deactivation-ko',
        }),
      );
    });

    it('should return early without sending email when test mode is active', async () => {
      mockIsTestMode.mockReturnValue(true);

      await service.sendAccountDeactivationEmail(
        'user@example.com',
        '위반',
        deactivatedAt,
        'ko',
      );

      expect(mockMailerService.sendMail).not.toHaveBeenCalled();
    });

    it('should include userName derived from email prefix in email context', async () => {
      await service.sendAccountDeactivationEmail(
        'johndoe@example.com',
        '위반',
        deactivatedAt,
        'ko',
      );

      expect(mockMailerService.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          context: expect.objectContaining({ userName: 'johndoe' }),
        }),
      );
    });

    it('should include reason in email context', async () => {
      const reason = '커뮤니티 가이드라인 위반';

      await service.sendAccountDeactivationEmail(
        'user@example.com',
        reason,
        deactivatedAt,
        'ko',
      );

      expect(mockMailerService.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          context: expect.objectContaining({ reason }),
        }),
      );
    });

    it('should not throw when mailerService.sendMail fails during deactivation email', async () => {
      mockMailerService.sendMail.mockRejectedValue(
        new Error('SMTP unavailable'),
      );

      await expect(
        service.sendAccountDeactivationEmail(
          'user@example.com',
          '위반',
          deactivatedAt,
          'ko',
        ),
      ).resolves.toBeUndefined();
    });

    it('should not query user service when language argument is explicitly provided', async () => {
      await service.sendAccountDeactivationEmail(
        'user@example.com',
        '위반',
        deactivatedAt,
        'en',
      );

      expect(mockUserService.findByEmailWithSelect).not.toHaveBeenCalled();
    });
  });
});
