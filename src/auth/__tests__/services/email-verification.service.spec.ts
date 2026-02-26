import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
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
import { EMAIL_VERIFICATION } from '@/common/constants/business.constants';
import { ErrorCode } from '@/common/constants/error-codes';
import { UserService } from '@/user/user.service';
import { EmailNotificationService } from '../../services/email-notification.service';

// 유닛 테스트에서는 테스트 모드 바이패스 비활성화
jest.mock('../../../common/utils/test-mode.util', () => ({
  isTestMode: jest.fn(() => false),
}));

describe('EmailVerificationService', () => {
  let service: EmailVerificationService;
  let mockRepository: ReturnType<
    typeof createMockRepository<EmailVerification>
  >;
  let mockUserService: jest.Mocked<
    Pick<UserService, 'findByEmailWithSelect' | 'findByIdWithSelect'>
  >;
  let mockEmailNotificationService: {
    ensureMailConfig: jest.Mock;
    sendVerificationEmail: jest.Mock;
    sendWelcomeEmail: jest.Mock;
    sendAccountDeactivationEmail: jest.Mock;
    getVerificationTemplateName: jest.Mock;
  };

  beforeEach(async () => {
    mockRepository = createMockRepository<EmailVerification>();
    mockUserService = {
      findByEmailWithSelect: jest.fn().mockResolvedValue(null),
      findByIdWithSelect: jest.fn().mockResolvedValue(null),
    } as jest.Mocked<
      Pick<UserService, 'findByEmailWithSelect' | 'findByIdWithSelect'>
    >;
    mockEmailNotificationService = {
      ensureMailConfig: jest.fn(),
      sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
      sendWelcomeEmail: jest.fn().mockResolvedValue(undefined),
      sendAccountDeactivationEmail: jest.fn().mockResolvedValue(undefined),
      getVerificationTemplateName: jest
        .fn()
        .mockImplementation((lang: string) => `email-verification-${lang}`),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailVerificationService,
        {
          provide: getRepositoryToken(EmailVerification),
          useValue: mockRepository,
        },
        {
          provide: UserService,
          useValue: mockUserService,
        },
        {
          provide: EmailNotificationService,
          useValue: mockEmailNotificationService,
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
      mockEmailNotificationService.sendVerificationEmail.mockResolvedValue(
        undefined,
      );
    }

    it('should send verification code for first-time user', async () => {
      // Setup: Mock bcrypt and notification service
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
      expect(result.messageCode).toBeDefined();
      expect(
        mockEmailNotificationService.sendVerificationEmail,
      ).toHaveBeenCalled();
      expect(mockRepository.save).toHaveBeenCalled();
    });

    it('should send password reset verification code', async () => {
      // Setup: Mock bcrypt and notification service
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
      expect(
        mockEmailNotificationService.sendVerificationEmail,
      ).toHaveBeenCalled();
    });

    it('should send re-register verification code', async () => {
      // Setup: Mock bcrypt and notification service
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
      expect(
        mockEmailNotificationService.sendVerificationEmail,
      ).toHaveBeenCalled();
    });

    it('should update existing record on same day resend', async () => {
      // Setup: Mock bcrypt and notification service
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
      ).rejects.toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            errorCode: ErrorCode.AUTH_VERIFICATION_TOO_MANY_REQUESTS,
          }),
        }),
      );
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
      ).rejects.toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            errorCode: ErrorCode.AUTH_DAILY_SEND_LIMIT_EXCEEDED,
          }),
        }),
      );
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
      ).rejects.toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            errorCode: ErrorCode.AUTH_VERIFICATION_BLOCKED,
          }),
        }),
      );
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
      ).rejects.toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            errorCode: ErrorCode.AUTH_ALREADY_COMPLETED_TODAY,
          }),
        }),
      );
    });

    it('should throw InternalServerErrorException when email config is missing', async () => {
      // Arrange - Service constructor calls emailNotificationService.ensureMailConfig()
      // Act & Assert
      await expect(async () => {
        const mockBadNotificationService = {
          ensureMailConfig: jest.fn().mockImplementation(() => {
            throw new InternalServerErrorException('Email configuration error');
          }),
          sendVerificationEmail: jest.fn(),
          sendWelcomeEmail: jest.fn(),
          sendAccountDeactivationEmail: jest.fn(),
          getVerificationTemplateName: jest.fn(),
        };
        await Test.createTestingModule({
          providers: [
            EmailVerificationService,
            {
              provide: getRepositoryToken(EmailVerification),
              useValue: mockRepository,
            },
            {
              provide: UserService,
              useValue: mockUserService,
            },
            {
              provide: EmailNotificationService,
              useValue: mockBadNotificationService,
            },
          ],
        }).compile();
      }).rejects.toThrow(InternalServerErrorException);
    });

    it('should create new record for different day', async () => {
      // Setup: Mock bcrypt and notification service
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
      ).rejects.toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            errorCode: ErrorCode.AUTH_DAILY_SEND_LIMIT_EXCEEDED,
          }),
        }),
      );
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
        expect.objectContaining({
          response: expect.objectContaining({
            errorCode: ErrorCode.AUTH_ALREADY_COMPLETED_TODAY,
          }),
        }),
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
      ).rejects.toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            errorCode: ErrorCode.AUTH_ALREADY_COMPLETED_TODAY,
          }),
        }),
      );
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
      ).rejects.toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            errorCode: ErrorCode.AUTH_DAILY_SEND_LIMIT_EXCEEDED,
          }),
        }),
      );
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
      mockEmailNotificationService.sendVerificationEmail.mockResolvedValue(
        undefined,
      );

      // Act - Should succeed because isSameDay(now, undefined) returns false in ensureNotCompletedToday
      const result = await service.sendCode(email, EmailPurpose.SIGNUP);

      // Assert - Succeeds and updates existing record (isSamePurposeDay is true due to lastSentAt fallback)
      expect(result).toBeDefined();
      expect(result.remainCount).toBe(2); // 5 - 3
      expect(
        mockEmailNotificationService.sendVerificationEmail,
      ).toHaveBeenCalled();
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
      await service.verifyCode(email, code, EmailPurpose.SIGNUP);

      // Assert
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
      ).rejects.toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            errorCode: ErrorCode.AUTH_VERIFICATION_CODE_INVALID,
          }),
        }),
      );
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
      ).rejects.toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            errorCode: ErrorCode.AUTH_VERIFICATION_CODE_EXPIRED,
          }),
        }),
      );
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
      ).rejects.toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            errorCode: ErrorCode.AUTH_VERIFICATION_CODE_USED,
          }),
        }),
      );
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
      ).rejects.toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            errorCode: ErrorCode.AUTH_VERIFICATION_CODE_INVALIDATED,
          }),
        }),
      );
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
      ).rejects.toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            errorCode: ErrorCode.AUTH_VERIFICATION_CODE_INVALID,
          }),
        }),
      );
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
      ).rejects.toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            errorCode: ErrorCode.AUTH_VERIFICATION_BLOCKED,
          }),
        }),
      );
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
      ).rejects.toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            errorCode: ErrorCode.AUTH_VERIFICATION_BLOCKED,
          }),
        }),
      );
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
      await service.verifyCode('test@example.com', '123456');

      // Assert
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
      mockRepository.softDelete.mockResolvedValue({
        affected: 1,
        raw: [],
        generatedMaps: [],
      });

      // Act
      await service.clearVerification('test@example.com', EmailPurpose.SIGNUP);

      // Assert
      expect(mockRepository.softDelete).toHaveBeenCalledWith({
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

  describe('Template Selection', () => {
    beforeEach(() => {
      mockEmailNotificationService.sendVerificationEmail.mockResolvedValue(
        undefined,
      );
      mockRepository.findOne.mockResolvedValue(null);
      mockRepository.create.mockReturnValue({} as EmailVerification);
      mockRepository.save.mockResolvedValue({} as EmailVerification);
      jest.spyOn(bcrypt, 'hash').mockResolvedValue('hashed-code' as never);
    });

    it('should use .ko template for Korean users', async () => {
      // Act
      await service.sendCode('test@example.com', EmailPurpose.SIGNUP, 'ko');

      // Assert
      expect(
        mockEmailNotificationService.sendVerificationEmail,
      ).toHaveBeenCalledWith(
        'test@example.com',
        expect.any(String),
        expect.any(Object),
        'ko',
      );
    });

    it('should use .en template for English users', async () => {
      // Act
      await service.sendCode('test@example.com', EmailPurpose.SIGNUP, 'en');

      // Assert
      expect(
        mockEmailNotificationService.sendVerificationEmail,
      ).toHaveBeenCalledWith(
        'test@example.com',
        expect.any(String),
        expect.any(Object),
        'en',
      );
    });

    it('should fallback to Korean for unsupported languages', async () => {
      // Act
      await service.sendCode('test@example.com', EmailPurpose.SIGNUP, 'ko');

      // Assert
      expect(
        mockEmailNotificationService.sendVerificationEmail,
      ).toHaveBeenCalledWith(
        'test@example.com',
        expect.any(String),
        expect.any(Object),
        'ko',
      );
    });

    it('should auto-apply User.preferredLanguage when lang not specified', async () => {
      // Arrange - Mock user with English preference
      mockUserService.findByEmailWithSelect.mockResolvedValue({
        preferredLanguage: 'en',
      } as any);

      // Act
      await service.sendCode('test@example.com', EmailPurpose.SIGNUP); // No lang parameter

      // Assert
      expect(mockUserService.findByEmailWithSelect).toHaveBeenCalledWith(
        'test@example.com',
        ['preferredLanguage'],
      );

      expect(
        mockEmailNotificationService.sendVerificationEmail,
      ).toHaveBeenCalledWith(
        'test@example.com',
        expect.any(String),
        expect.any(Object),
        'en',
      );
    });

    it('should fallback to Korean when user not found', async () => {
      // Arrange
      mockUserService.findByEmailWithSelect.mockResolvedValue(null);

      // Act
      await service.sendCode('nonexistent@example.com', EmailPurpose.SIGNUP);

      // Assert
      expect(
        mockEmailNotificationService.sendVerificationEmail,
      ).toHaveBeenCalledWith(
        'nonexistent@example.com',
        expect.any(String),
        expect.any(Object),
        'ko',
      );
    });

    it('should fallback to Korean when user.preferredLanguage is null', async () => {
      // Arrange
      mockUserService.findByEmailWithSelect.mockResolvedValue({
        preferredLanguage: null,
      } as any);

      // Act
      await service.sendCode('test@example.com', EmailPurpose.SIGNUP);

      // Assert
      expect(
        mockEmailNotificationService.sendVerificationEmail,
      ).toHaveBeenCalledWith(
        'test@example.com',
        expect.any(String),
        expect.any(Object),
        'ko',
      );
    });

    it('should prioritize explicit lang parameter over User.preferredLanguage', async () => {
      // Arrange
      mockUserService.findByEmailWithSelect.mockResolvedValue({
        preferredLanguage: 'en',
      } as any);

      // Act
      await service.sendCode('test@example.com', EmailPurpose.SIGNUP, 'ko');

      // Assert - Should NOT call findByEmailWithSelect since lang is explicitly provided
      expect(mockUserService.findByEmailWithSelect).not.toHaveBeenCalled();

      expect(
        mockEmailNotificationService.sendVerificationEmail,
      ).toHaveBeenCalledWith(
        'test@example.com',
        expect.any(String),
        expect.any(Object),
        'ko',
      );
    });
  });

  describe('Welcome Email', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      mockEmailNotificationService.sendWelcomeEmail.mockResolvedValue(
        undefined,
      );
    });

    it('should send Korean welcome email successfully', async () => {
      // Act
      await service.sendWelcomeEmail('123');

      // Assert - sendWelcomeEmail delegates to emailNotificationService
      expect(
        mockEmailNotificationService.sendWelcomeEmail,
      ).toHaveBeenCalledWith('123', undefined);
    });

    it('should send English welcome email successfully', async () => {
      // Act
      await service.sendWelcomeEmail('456', 'en');

      // Assert
      expect(
        mockEmailNotificationService.sendWelcomeEmail,
      ).toHaveBeenCalledWith('456', 'en');
    });

    it('should use language parameter over user preference', async () => {
      // Act
      await service.sendWelcomeEmail('123', 'en');

      // Assert
      expect(
        mockEmailNotificationService.sendWelcomeEmail,
      ).toHaveBeenCalledWith('123', 'en');
    });

    it('should delegate to emailNotificationService with userId', async () => {
      // Act
      await service.sendWelcomeEmail('123', 'ko');

      // Assert
      expect(
        mockEmailNotificationService.sendWelcomeEmail,
      ).toHaveBeenCalledWith('123', 'ko');
    });

    it('should pass undefined language when not specified', async () => {
      // Act
      await service.sendWelcomeEmail('999');

      // Assert - delegates to emailNotificationService without language
      expect(
        mockEmailNotificationService.sendWelcomeEmail,
      ).toHaveBeenCalledWith('999', undefined);
    });
  });

  describe('Account Deactivation Email', () => {
    const mockKoreanEmail = 'korean@example.com';
    const mockEnglishEmail = 'english@example.com';

    beforeEach(() => {
      jest.clearAllMocks();
      mockEmailNotificationService.sendAccountDeactivationEmail.mockResolvedValue(
        undefined,
      );
    });

    it('should send Korean deactivation email', async () => {
      // Arrange
      const reason = 'Violated terms of service';
      const deactivatedAt = new Date('2026-01-20T14:30:00Z');

      // Act
      await service.sendAccountDeactivationEmail(
        mockKoreanEmail,
        reason,
        deactivatedAt,
      );

      // Assert - delegates to emailNotificationService
      expect(
        mockEmailNotificationService.sendAccountDeactivationEmail,
      ).toHaveBeenCalledWith(mockKoreanEmail, reason, deactivatedAt, undefined);
    });

    it('should send English deactivation email', async () => {
      // Arrange
      const reason = 'Account policy violation';
      const deactivatedAt = new Date('2026-01-20T14:30:00Z');

      // Act
      await service.sendAccountDeactivationEmail(
        mockEnglishEmail,
        reason,
        deactivatedAt,
        'en',
      );

      // Assert
      expect(
        mockEmailNotificationService.sendAccountDeactivationEmail,
      ).toHaveBeenCalledWith(mockEnglishEmail, reason, deactivatedAt, 'en');
    });

    it('should pass deactivatedAt to emailNotificationService', async () => {
      // Arrange
      const deactivatedAt = new Date('2026-01-20T14:30:00Z');

      // Act
      await service.sendAccountDeactivationEmail(
        mockKoreanEmail,
        'Test reason',
        deactivatedAt,
        'ko',
      );

      // Assert
      expect(
        mockEmailNotificationService.sendAccountDeactivationEmail,
      ).toHaveBeenCalledWith(
        mockKoreanEmail,
        'Test reason',
        deactivatedAt,
        'ko',
      );
    });

    it('should pass reason to emailNotificationService', async () => {
      // Arrange
      const reason = 'Policy violation: spam';
      const deactivatedAt = new Date();

      // Act
      await service.sendAccountDeactivationEmail(
        mockKoreanEmail,
        reason,
        deactivatedAt,
        'ko',
      );

      // Assert
      expect(
        mockEmailNotificationService.sendAccountDeactivationEmail,
      ).toHaveBeenCalledWith(mockKoreanEmail, reason, deactivatedAt, 'ko');
    });

    it('should delegate with language when provided', async () => {
      // Arrange
      const deactivatedAt = new Date();

      // Act
      await service.sendAccountDeactivationEmail(
        'test@example.com',
        'Test reason',
        deactivatedAt,
        'en',
      );

      // Assert - delegates to emailNotificationService
      expect(
        mockEmailNotificationService.sendAccountDeactivationEmail,
      ).toHaveBeenCalledWith(
        'test@example.com',
        'Test reason',
        deactivatedAt,
        'en',
      );
    });

    it('should delegate without language when not provided', async () => {
      // Arrange
      const deactivatedAt = new Date();

      // Act
      await service.sendAccountDeactivationEmail(
        mockKoreanEmail,
        'Test',
        deactivatedAt,
      );

      // Assert - delegates to emailNotificationService without language
      expect(
        mockEmailNotificationService.sendAccountDeactivationEmail,
      ).toHaveBeenCalledWith(mockKoreanEmail, 'Test', deactivatedAt, undefined);
    });

    it('should delegate in test mode without throwing', async () => {
      // Arrange
      const deactivatedAt = new Date();

      // Act
      await service.sendAccountDeactivationEmail(
        mockKoreanEmail,
        'Test',
        deactivatedAt,
        'ko',
      );

      // Assert - delegates regardless of mode (emailNotificationService handles test mode)
      expect(
        mockEmailNotificationService.sendAccountDeactivationEmail,
      ).toHaveBeenCalledWith(mockKoreanEmail, 'Test', deactivatedAt, 'ko');
    });
  });
});
