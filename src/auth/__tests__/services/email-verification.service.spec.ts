import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { MailerService } from '@nestjs-modules/mailer';
import {
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { EmailVerificationService } from '../../services/email-verification.service';
import { EmailVerification } from '../../entities/email-verification.entity';
import { EmailPurpose } from '../../dto/send-email-code.dto';
import { createMockRepository } from '../../../../test/mocks/repository.mock';
import { EmailVerificationFactory } from '../../../../test/factories/entity.factory';
import { createMockConfigService } from '../../../../test/mocks/external-clients.mock';
import { EMAIL_VERIFICATION } from '@/common/constants/business.constants';

// 유닛 테스트에서는 테스트 모드 바이패스 비활성화
jest.mock('../../../common/utils/test-mode.util', () => ({
  isTestMode: jest.fn(() => false),
}));

describe('EmailVerificationService', () => {
  let service: EmailVerificationService;
  let mockRepository: ReturnType<
    typeof createMockRepository<EmailVerification>
  >;
  let mockMailerService: jest.Mocked<Pick<MailerService, 'sendMail'>>;

  beforeEach(async () => {
    mockRepository = createMockRepository<EmailVerification>();
    mockMailerService = {
      sendMail: jest.fn(),
    } as jest.Mocked<Pick<MailerService, 'sendMail'>>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailVerificationService,
        {
          provide: getRepositoryToken(EmailVerification),
          useValue: mockRepository,
        },
        {
          provide: MailerService,
          useValue: mockMailerService,
        },
        {
          provide: ConfigService,
          useValue: createMockConfigService({
            EMAIL_HOST: 'smtp.example.com',
            EMAIL_PORT: 587,
            EMAIL_SECURE: 'true',
            EMAIL_ADDRESS: 'noreply@example.com',
            EMAIL_PASSWORD: 'password',
          }),
        },
      ],
    }).compile();

    service = module.get<EmailVerificationService>(EmailVerificationService);
  });

  describe('generateCode', () => {
    it('should generate 6-digit code by default', () => {
      // Act
      const code = service.generateCode();

      // Assert
      expect(code).toHaveLength(6);
      expect(code).toMatch(/^\d{6}$/);
    });

    it('should generate code with custom length', () => {
      // Act
      const code = service.generateCode(4);

      // Assert
      expect(code).toHaveLength(4);
      expect(code).toMatch(/^\d{4}$/);
    });

    it('should pad with leading zeros', () => {
      // Act - Generate multiple codes and check padding
      const codes = Array.from({ length: 10 }, () => service.generateCode(6));

      // Assert
      codes.forEach((code) => {
        expect(code).toHaveLength(6);
      });
    });
  });

  describe('sendCode', () => {
    // Helper function to setup mocks for sendCode tests
    function setupSendCodeMocks() {
      jest.spyOn(bcrypt, 'hash').mockResolvedValue('hashed-code' as never);
      mockMailerService.sendMail.mockResolvedValue({} as { messageId: string });
    }

    it('should send verification code for first-time user', async () => {
      // Setup: Mock bcrypt and mailer
      setupSendCodeMocks();
      // Arrange
      const email = 'test@example.com';
      mockRepository.findOne.mockResolvedValue(null);
      mockRepository.create.mockImplementation(
        (data) => data as EmailVerification,
      );
      mockRepository.save.mockResolvedValue({} as EmailVerification);

      // Act
      const result = await service.sendCode(email, EmailPurpose.SIGNUP);

      // Assert
      expect(result.remainCount).toBe(4); // 5 - 1
      expect(result.message).toContain('인증번호가 발송되었습니다');
      expect(mockMailerService.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: email,
          subject: '[PickEat] 이메일 인증 코드',
          template: 'email-verification',
        }),
      );
      expect(mockRepository.save).toHaveBeenCalled();
    });

    it('should send password reset verification code', async () => {
      // Setup: Mock bcrypt and mailer
      setupSendCodeMocks();

      // Arrange
      const email = 'test@example.com';
      mockRepository.findOne.mockResolvedValue(null);
      mockRepository.create.mockImplementation(
        (data) => data as EmailVerification,
      );
      mockRepository.save.mockResolvedValue({} as EmailVerification);

      // Act
      await service.sendCode(email, EmailPurpose.RESET_PASSWORD);

      // Assert
      expect(mockMailerService.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: email,
          subject: '[PickEat] 비밀번호 재설정 인증 코드',
          template: 'email-verification',
        }),
      );
    });

    it('should send re-register verification code', async () => {
      // Setup: Mock bcrypt and mailer
      setupSendCodeMocks();

      // Arrange
      const email = 'test@example.com';
      mockRepository.findOne.mockResolvedValue(null);
      mockRepository.create.mockImplementation(
        (data) => data as EmailVerification,
      );
      mockRepository.save.mockResolvedValue({} as EmailVerification);

      // Act
      await service.sendCode(email, EmailPurpose.RE_REGISTER);

      // Assert
      expect(mockMailerService.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: email,
          subject: '[PickEat] 재가입 인증 코드',
          template: 'email-verification',
        }),
      );
    });

    it('should update existing record on same day resend', async () => {
      // Setup: Mock bcrypt and mailer
      setupSendCodeMocks();

      // Arrange
      const email = 'test@example.com';
      const now = new Date();
      const lastSentAt = new Date(
        now.getTime() - EMAIL_VERIFICATION.RESEND_LIMIT_MS - 1000,
      );
      const existing = EmailVerificationFactory.create({
        email,
        sendCount: 1,
        lastSentAt,
        createdAt: now,
      });

      mockRepository.findOne.mockResolvedValue(existing);
      mockRepository.save.mockResolvedValue(existing);

      // Act
      const result = await service.sendCode(email, EmailPurpose.SIGNUP);

      // Assert
      expect(result.remainCount).toBe(3); // 5 - 2
      expect(existing.sendCount).toBe(2);
      expect(existing.status).toBe('ACTIVE');
      expect(existing.used).toBe(false);
    });

    it('should throw BadRequestException when resending too quickly', async () => {
      // No setup needed - testing error case
      // Arrange
      const email = 'test@example.com';
      const now = new Date();
      const recentlySent = new Date(now.getTime() - 10000); // 10 seconds ago
      const existing = EmailVerificationFactory.create({
        email,
        lastSentAt: recentlySent,
        createdAt: now,
      });

      mockRepository.findOne.mockResolvedValue(existing);

      // Act & Assert
      await expect(
        service.sendCode(email, EmailPurpose.SIGNUP),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.sendCode(email, EmailPurpose.SIGNUP),
      ).rejects.toThrow('인증코드를 너무 자주 요청하고 있습니다');
    });

    it('should throw BadRequestException when daily limit exceeded', async () => {
      // No setup needed - testing error case
      // Arrange
      const email = 'test@example.com';
      const now = new Date();
      const existing = EmailVerificationFactory.create({
        email,
        sendCount: 5,
        lastSentAt: new Date(
          now.getTime() - EMAIL_VERIFICATION.RESEND_LIMIT_MS - 1000,
        ),
        createdAt: now,
      });

      mockRepository.findOne.mockResolvedValue(existing);

      // Act & Assert
      await expect(
        service.sendCode(email, EmailPurpose.SIGNUP),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.sendCode(email, EmailPurpose.SIGNUP),
      ).rejects.toThrow('하루 최대 발송 횟수를 초과했습니다');
    });

    it('should throw BadRequestException when user is blocked after 5 failures', async () => {
      // No setup needed - testing error case
      // Arrange
      const email = 'test@example.com';
      const now = new Date();
      const existing = EmailVerificationFactory.create({
        email,
        failCount: 5,
        updatedAt: now,
      });

      mockRepository.findOne.mockResolvedValue(existing);

      // Act & Assert
      await expect(
        service.sendCode(email, EmailPurpose.SIGNUP),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.sendCode(email, EmailPurpose.SIGNUP),
      ).rejects.toThrow('5회 실패로 인해 다음날까지 회원가입이 불가능합니다');
    });

    it('should throw BadRequestException when already completed today', async () => {
      // No setup needed - testing error case
      // Arrange
      const email = 'test@example.com';
      const now = new Date();
      const existing = EmailVerificationFactory.create({
        email,
        status: 'INVALIDATED',
        updatedAt: now,
      });

      mockRepository.findOne.mockResolvedValue(existing);

      // Act & Assert
      await expect(
        service.sendCode(email, EmailPurpose.SIGNUP),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.sendCode(email, EmailPurpose.SIGNUP),
      ).rejects.toThrow('이미 이메일 인증이 완료되었습니다');
    });

    it('should throw InternalServerErrorException when email config is missing', async () => {
      // Arrange - Service constructor validates config, so this test should check that
      // Act & Assert
      await expect(async () => {
        await Test.createTestingModule({
          providers: [
            EmailVerificationService,
            {
              provide: getRepositoryToken(EmailVerification),
              useValue: mockRepository,
            },
            {
              provide: MailerService,
              useValue: mockMailerService,
            },
            {
              provide: ConfigService,
              useValue: createMockConfigService({}),
            },
          ],
        }).compile();
      }).rejects.toThrow(InternalServerErrorException);
    });

    it('should create new record for different day', async () => {
      // Setup: Mock bcrypt and mailer
      setupSendCodeMocks();

      // Arrange
      const email = 'test@example.com';
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const existing = EmailVerificationFactory.create({
        email,
        sendCount: 3,
        createdAt: yesterday,
        lastSentAt: yesterday,
      });

      mockRepository.findOne.mockResolvedValue(existing);
      mockRepository.create.mockImplementation(
        (data) => data as EmailVerification,
      );
      mockRepository.save.mockResolvedValue({} as EmailVerification);

      // Act
      const result = await service.sendCode(email, EmailPurpose.SIGNUP);

      // Assert
      expect(result.remainCount).toBe(4); // New day, reset to 5 - 1
      expect(mockRepository.create).toHaveBeenCalled();
    });

    it('should handle edge case with corrupted sendCount exceeding limit', async () => {
      // No setup needed - testing error case
      // Arrange - Tests line 76: nextSendCount > dailySendLimit
      // This is a defensive check for data corruption where sendCount somehow exceeds limit
      const email = 'test@example.com';
      const now = new Date();
      const existing = EmailVerificationFactory.create({
        email,
        sendCount: 6, // Corrupted data: already exceeds limit
        lastSentAt: new Date(
          now.getTime() - EMAIL_VERIFICATION.RESEND_LIMIT_MS - 1000,
        ),
        createdAt: now,
      });

      mockRepository.findOne.mockResolvedValue(existing);

      // Act & Assert
      await expect(
        service.sendCode(email, EmailPurpose.SIGNUP),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.sendCode(email, EmailPurpose.SIGNUP),
      ).rejects.toThrow('하루 최대 발송 횟수를 초과했습니다');
    });

    it('should send password reset code with correct error message when already completed today', async () => {
      // No setup needed - testing error case
      // Arrange - Tests line 326: RESET_PASSWORD branch in ensureNotCompletedToday
      const email = 'test@example.com';
      const now = new Date();
      const existing = EmailVerificationFactory.create({
        email,
        purpose: EmailPurpose.RESET_PASSWORD,
        status: 'INVALIDATED',
        updatedAt: now,
      });

      mockRepository.findOne.mockResolvedValue(existing);

      // Act & Assert
      await expect(
        service.sendCode(email, EmailPurpose.RESET_PASSWORD),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.sendCode(email, EmailPurpose.RESET_PASSWORD),
      ).rejects.toThrow(
        '이미 비밀번호 재설정을 완료했습니다. 내일 다시 시도해주세요.',
      );
    });

    it('should send re-register code with correct error message when already completed today', async () => {
      // No setup needed - testing error case
      // Arrange - Tests line 328-329: RE_REGISTER branch in ensureNotCompletedToday
      const email = 'test@example.com';
      const now = new Date();
      const existing = EmailVerificationFactory.create({
        email,
        purpose: EmailPurpose.RE_REGISTER,
        status: 'INVALIDATED',
        updatedAt: now,
      });

      mockRepository.findOne.mockResolvedValue(existing);

      // Act & Assert
      await expect(
        service.sendCode(email, EmailPurpose.RE_REGISTER),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.sendCode(email, EmailPurpose.RE_REGISTER),
      ).rejects.toThrow('이미 재가입을 완료했습니다. 내일 다시 시도해주세요.');
    });

    it('should throw when undefined dates result in corrupted sendCount exceeding limit', async () => {
      // No setup needed - testing error case
      // Arrange - Tests line 76 true branch with undefined dates
      const email = 'test@example.com';
      const existing = EmailVerificationFactory.create({
        email,
        failCount: 2, // Low fail count to avoid blocking
        sendCount: 5, // At limit - will become 6 when incremented
      });
      // Set all dates to undefined - isSamePurposeDay uses fallback to 'now', so treats as same day
      existing.updatedAt = undefined as unknown as Date;
      existing.createdAt = undefined as unknown as Date;
      existing.lastSentAt = undefined as unknown as Date;

      mockRepository.findOne.mockResolvedValue(existing);

      // Act & Assert - Should throw because nextSendCount = 6 > 5
      await expect(
        service.sendCode(email, EmailPurpose.SIGNUP),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.sendCode(email, EmailPurpose.SIGNUP),
      ).rejects.toThrow('하루 최대 발송 횟수를 초과했습니다');
    });

    it('should successfully send when INVALIDATED record has undefined dates', async () => {
      // Setup: Mock bcrypt and mailer
      setupSendCodeMocks();

      // Arrange - Tests line 356: isSameDay with undefined target in ensureNotCompletedToday line 320
      const email = 'test@example.com';
      const now = new Date();
      const existing = EmailVerificationFactory.create({
        email,
        purpose: EmailPurpose.SIGNUP,
        status: 'INVALIDATED', // Triggers ensureNotCompletedToday
        failCount: 1,
        sendCount: 2,
        lastSentAt: new Date(
          now.getTime() - EMAIL_VERIFICATION.RESEND_LIMIT_MS - 10000,
        ),
        createdAt: now, // For isSamePurposeDay calculation
      });
      // Set updatedAt to undefined
      // ensureNotCompletedToday calls isSameDay(now, updatedAt ?? createdAt) -> isSameDay(now, undefined)
      // which hits line 356 and returns false, making !isSameDay = true, so function returns early
      existing.updatedAt = undefined as unknown as Date;
      existing.createdAt = undefined as unknown as Date; // Also set createdAt to undefined to test fallback

      mockRepository.findOne.mockResolvedValue(existing);
      mockRepository.save.mockResolvedValue(existing);
      mockMailerService.sendMail.mockResolvedValue({} as { messageId: string });

      // Act - Should succeed because isSameDay(now, undefined) returns false in ensureNotCompletedToday
      const result = await service.sendCode(email, EmailPurpose.SIGNUP);

      // Assert - Succeeds and updates existing record (isSamePurposeDay is true due to lastSentAt fallback)
      expect(result).toBeDefined();
      expect(result.remainCount).toBe(2); // 5 - 3
      expect(mockMailerService.sendMail).toHaveBeenCalled();
    });
  });

  describe('verifyCode', () => {
    it('should verify valid code successfully', async () => {
      // Arrange
      const email = 'test@example.com';
      const code = '123456';
      const verification = EmailVerificationFactory.create({
        email,
        codeHash: 'hashed-code',
        status: 'ACTIVE',
        expiresAt: new Date(Date.now() + 60000),
      });

      mockRepository.findOne.mockResolvedValue(verification);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);
      mockRepository.save.mockResolvedValue(verification);

      // Act
      const result = await service.verifyCode(email, code, EmailPurpose.SIGNUP);

      // Assert
      expect(result).toBe(true);
      expect(verification.used).toBe(true);
      expect(verification.status).toBe('USED');
      expect(verification.usedAt).toBeDefined();
      expect(mockRepository.save).toHaveBeenCalledWith(verification);
    });

    it('should throw BadRequestException when no verification found', async () => {
      // Arrange
      mockRepository.findOne.mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.verifyCode('test@example.com', '123456'),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.verifyCode('test@example.com', '123456'),
      ).rejects.toThrow('코드가 유효하지 않습니다');
    });

    it('should throw BadRequestException when code is expired', async () => {
      // Arrange
      const verification = EmailVerificationFactory.create({
        expiresAt: new Date(Date.now() - 1000),
        status: 'ACTIVE',
      });

      mockRepository.findOne.mockResolvedValue(verification);
      mockRepository.save.mockResolvedValue(verification);

      // Act & Assert
      await expect(
        service.verifyCode('test@example.com', '123456'),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.verifyCode('test@example.com', '123456'),
      ).rejects.toThrow('코드가 만료되었습니다');
      expect(verification.status).toBe('EXPIRED');
    });

    it('should throw BadRequestException when code is already used', async () => {
      // Arrange
      const verification = EmailVerificationFactory.createUsed();

      mockRepository.findOne.mockResolvedValue(verification);

      // Act & Assert
      await expect(
        service.verifyCode('test@example.com', '123456'),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.verifyCode('test@example.com', '123456'),
      ).rejects.toThrow('이미 사용된 코드입니다');
    });

    it('should throw BadRequestException when status is INVALIDATED', async () => {
      // Arrange
      const verification = EmailVerificationFactory.create({
        status: 'INVALIDATED',
        expiresAt: new Date(Date.now() + 60000),
      });

      mockRepository.findOne.mockResolvedValue(verification);

      // Act & Assert
      await expect(
        service.verifyCode('test@example.com', '123456'),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.verifyCode('test@example.com', '123456'),
      ).rejects.toThrow('이미 사용이 완료된 코드입니다');
    });

    it('should increment fail count and throw when code is incorrect', async () => {
      // Arrange
      const verification = EmailVerificationFactory.create({
        status: 'ACTIVE',
        expiresAt: new Date(Date.now() + 60000),
        failCount: 0,
      });

      mockRepository.findOne.mockResolvedValue(verification);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(false as never);
      mockRepository.save.mockResolvedValue(verification);

      // Act & Assert
      await expect(
        service.verifyCode('test@example.com', 'wrong-code'),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.verifyCode('test@example.com', 'wrong-code'),
      ).rejects.toThrow('코드가 유효하지 않습니다');
      // Called twice because of the two expects above, so failCount is 2
      expect(verification.failCount).toBe(2);
    });

    it('should block after 5 failed attempts', async () => {
      // Arrange
      const verification = EmailVerificationFactory.create({
        status: 'ACTIVE',
        expiresAt: new Date(Date.now() + 60000),
        failCount: 4,
        updatedAt: new Date(),
      });

      mockRepository.findOne.mockResolvedValue(verification);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(false as never);
      mockRepository.save.mockResolvedValue(verification);

      // Act & Assert
      await expect(
        service.verifyCode('test@example.com', 'wrong-code'),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.verifyCode('test@example.com', 'wrong-code'),
      ).rejects.toThrow('5회 실패로 인해 다음날까지 회원가입이 불가능합니다');
      expect(verification.failCount).toBe(5);
    });

    it('should reset failCount to 1 when incorrect code on different day', async () => {
      // Arrange - Tests line 338: failCount = 1 when not same day
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const verification = EmailVerificationFactory.create({
        status: 'ACTIVE',
        expiresAt: new Date(Date.now() + 60000),
        failCount: 3,
        updatedAt: yesterday, // Different day
        createdAt: yesterday,
      });

      mockRepository.findOne.mockResolvedValue(verification);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(false as never);
      mockRepository.save.mockResolvedValue(verification);

      // Act & Assert
      await expect(
        service.verifyCode('test@example.com', 'wrong-code'),
      ).rejects.toThrow(BadRequestException);
      expect(verification.failCount).toBe(1); // Reset to 1, not incremented
    });

    it('should throw BadRequestException when user is blocked', async () => {
      // Arrange
      const verification = EmailVerificationFactory.create({
        failCount: 5,
        updatedAt: new Date(),
      });

      mockRepository.findOne.mockResolvedValue(verification);

      // Act & Assert
      await expect(
        service.verifyCode('test@example.com', '123456'),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.verifyCode('test@example.com', '123456'),
      ).rejects.toThrow('5회 실패로 인해 다음날까지 회원가입이 불가능합니다');
    });

    it('should not be blocked when failCount is 5 but updatedAt is undefined', async () => {
      // Arrange - Tests line 356: isSameDay returns false when target is null/undefined
      const verification = EmailVerificationFactory.create({
        status: 'ACTIVE',
        expiresAt: new Date(Date.now() + 60000),
        failCount: 5,
      });
      // Explicitly set to undefined to test null check in isSameDay
      verification.updatedAt = undefined as unknown as Date;
      verification.createdAt = undefined as unknown as Date;

      mockRepository.findOne.mockResolvedValue(verification);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);
      mockRepository.save.mockResolvedValue(verification);

      // Act - Should succeed because isSameDay returns false for null dates
      const result = await service.verifyCode('test@example.com', '123456');

      // Assert
      expect(result).toBe(true);
      expect(verification.used).toBe(true);
    });
  });

  describe('isEmailVerified', () => {
    it('should return true when email is verified', async () => {
      // Arrange
      const verification = EmailVerificationFactory.createUsed();
      mockRepository.findOne.mockResolvedValue(verification);

      // Act
      const result = await service.isEmailVerified(
        'test@example.com',
        EmailPurpose.SIGNUP,
      );

      // Assert
      expect(result).toBe(true);
    });

    it('should return false when no verification found', async () => {
      // Arrange
      mockRepository.findOne.mockResolvedValue(null);

      // Act
      const result = await service.isEmailVerified(
        'test@example.com',
        EmailPurpose.SIGNUP,
      );

      // Assert
      expect(result).toBe(false);
    });

    it('should return false when verification is not used', async () => {
      // Arrange
      const verification = EmailVerificationFactory.create({
        status: 'ACTIVE',
      });
      mockRepository.findOne.mockResolvedValue(verification);

      // Act
      const result = await service.isEmailVerified(
        'test@example.com',
        EmailPurpose.SIGNUP,
      );

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('clearVerification', () => {
    it('should delete all verifications for email and purpose', async () => {
      // Arrange
      mockRepository.delete.mockResolvedValue({ affected: 1, raw: [] });

      // Act
      await service.clearVerification('test@example.com', EmailPurpose.SIGNUP);

      // Assert
      expect(mockRepository.delete).toHaveBeenCalledWith({
        email: 'test@example.com',
        purpose: EmailPurpose.SIGNUP,
      });
    });
  });

  describe('expireVerification', () => {
    it('should invalidate verification when found', async () => {
      // Arrange
      const verification = EmailVerificationFactory.create({
        status: 'ACTIVE',
      });
      mockRepository.findOne.mockResolvedValue(verification);
      mockRepository.save.mockResolvedValue(verification);

      // Act
      await service.expireVerification('test@example.com', EmailPurpose.SIGNUP);

      // Assert
      expect(verification.status).toBe('INVALIDATED');
      expect(mockRepository.save).toHaveBeenCalledWith(verification);
    });

    it('should do nothing when no verification found', async () => {
      // Arrange
      mockRepository.findOne.mockResolvedValue(null);

      // Act
      await service.expireVerification('test@example.com', EmailPurpose.SIGNUP);

      // Assert
      expect(mockRepository.save).not.toHaveBeenCalled();
    });
  });
});
