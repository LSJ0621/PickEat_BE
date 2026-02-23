import { BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ErrorCode } from '@/common/constants/error-codes';
import { MessageCode } from '@/common/constants/message-codes';
import { User } from '@/user/entities/user.entity';
import { UserService } from '@/user/user.service';
import { EmailPurpose } from '../../dto/send-email-code.dto';
import { EmailVerificationService } from '../../services/email-verification.service';
import { AuthPasswordService } from '../../services/auth-password.service';

describe('AuthPasswordService', () => {
  let service: AuthPasswordService;
  let userService: jest.Mocked<UserService>;
  let emailVerificationService: jest.Mocked<EmailVerificationService>;

  const mockUser: User = {
    id: 1,
    email: 'test@example.com',
    password: '$2b$10$hashedpassword',
    name: 'Test User',
    role: 'USER',
    birthDate: null,
    gender: null,
    preferredLanguage: 'ko',
    emailVerified: true,
    reRegisterEmailVerified: false,
    preferences: null,
    tasteAnalysis: null,
    refreshToken: null,
    socialId: null,
    socialType: null,
    isDeactivated: false,
    deactivatedAt: null,
    lastPasswordChangedAt: null,
    lastActiveAt: null,
    lastLoginAt: null,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    version: 1,
    addresses: [],
    recommendations: [],
    menuSelections: [],
  } as User;

  beforeEach(async () => {
    const mockUserService: jest.Mocked<Partial<UserService>> = {
      findByEmail: jest.fn(),
      markEmailVerified: jest.fn(),
      updatePassword: jest.fn(),
    };

    const mockEmailVerificationService: jest.Mocked<
      Partial<EmailVerificationService>
    > = {
      sendCode: jest.fn(),
      verifyCode: jest.fn(),
      isEmailVerified: jest.fn(),
      expireVerification: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthPasswordService,
        {
          provide: UserService,
          useValue: mockUserService,
        },
        {
          provide: EmailVerificationService,
          useValue: mockEmailVerificationService,
        },
      ],
    }).compile();

    service = module.get<AuthPasswordService>(AuthPasswordService);
    userService = module.get(UserService);
    emailVerificationService = module.get(EmailVerificationService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should create service instance when all dependencies are injected', () => {
    expect(service).toBeDefined();
  });

  describe('sendResetPasswordCode', () => {
    it('should send reset password code when regular user requests it', async () => {
      const email = 'test@example.com';
      userService.findByEmail.mockResolvedValue(mockUser);
      emailVerificationService.sendCode.mockResolvedValue({
        remainCount: 4,
        messageCode: MessageCode.AUTH_VERIFICATION_CODE_SENT,
      });

      const result = await service.sendResetPasswordCode(email);

      expect(userService.findByEmail).toHaveBeenCalledWith(email);
      expect(emailVerificationService.sendCode).toHaveBeenCalledWith(
        email,
        EmailPurpose.RESET_PASSWORD,
        undefined,
      );
      expect(result.remainCount).toBe(4);
    });

    it('should pass language parameter to sendCode', async () => {
      const email = 'test@example.com';
      userService.findByEmail.mockResolvedValue(mockUser);
      emailVerificationService.sendCode.mockResolvedValue({
        remainCount: 3,
        messageCode: MessageCode.AUTH_VERIFICATION_CODE_SENT,
      });

      await service.sendResetPasswordCode(email, 'en');

      expect(emailVerificationService.sendCode).toHaveBeenCalledWith(
        email,
        EmailPurpose.RESET_PASSWORD,
        'en',
      );
    });

    it('should throw BadRequestException when social login account requests password reset', async () => {
      const socialUser = { ...mockUser, password: null, socialId: 'kakao123' };
      userService.findByEmail.mockResolvedValue(socialUser);

      await expect(
        service.sendResetPasswordCode('social@example.com'),
      ).rejects.toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            errorCode: ErrorCode.AUTH_SOCIAL_LOGIN_ACCOUNT,
          }),
        }),
      );
    });

    it('should throw BadRequestException when non-existent email requests password reset', async () => {
      userService.findByEmail.mockResolvedValue(null);

      await expect(
        service.sendResetPasswordCode('nonexistent@example.com'),
      ).rejects.toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            errorCode: ErrorCode.AUTH_EMAIL_NOT_REGISTERED,
          }),
        }),
      );
    });
  });

  describe('verifyResetPasswordCode', () => {
    it('should verify reset password code when regular user provides valid code', async () => {
      const email = 'test@example.com';
      const code = '123456';
      userService.findByEmail.mockResolvedValue(mockUser);
      emailVerificationService.verifyCode.mockResolvedValue(undefined);

      await service.verifyResetPasswordCode(email, code);

      expect(userService.findByEmail).toHaveBeenCalledWith(email);
      expect(emailVerificationService.verifyCode).toHaveBeenCalledWith(
        email,
        code,
        EmailPurpose.RESET_PASSWORD,
      );
    });

    it('should throw BadRequestException when non-existent user tries to verify reset code', async () => {
      userService.findByEmail.mockResolvedValue(null);

      await expect(
        service.verifyResetPasswordCode('nonexistent@example.com', '123456'),
      ).rejects.toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            errorCode: ErrorCode.AUTH_EMAIL_NOT_REGISTERED,
          }),
        }),
      );
    });

    it('should throw BadRequestException when social login account tries to verify reset code', async () => {
      const socialUser = { ...mockUser, password: null, socialId: 'kakao123' };
      userService.findByEmail.mockResolvedValue(socialUser);

      await expect(
        service.verifyResetPasswordCode('social@example.com', '123456'),
      ).rejects.toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            errorCode: ErrorCode.AUTH_SOCIAL_LOGIN_ACCOUNT,
          }),
        }),
      );
    });
  });

  describe('resetPassword', () => {
    it('should reset password successfully when valid reset request is provided', async () => {
      const resetDto = {
        email: 'test@example.com',
        newPassword: 'newpassword123',
      };

      emailVerificationService.isEmailVerified.mockResolvedValue(true);
      userService.findByEmail.mockResolvedValue(mockUser);
      userService.updatePassword.mockResolvedValue(mockUser);
      userService.markEmailVerified.mockResolvedValue(undefined);
      emailVerificationService.expireVerification.mockResolvedValue(undefined);

      await service.resetPassword(resetDto);

      expect(userService.updatePassword).toHaveBeenCalledWith(
        mockUser,
        expect.any(String),
      );
      expect(emailVerificationService.expireVerification).toHaveBeenCalledWith(
        resetDto.email,
        EmailPurpose.RESET_PASSWORD,
      );
    });

    it('should throw BadRequestException when email is not verified', async () => {
      const resetDto = {
        email: 'test@example.com',
        newPassword: 'newpassword123',
      };

      emailVerificationService.isEmailVerified.mockResolvedValue(false);

      await expect(service.resetPassword(resetDto)).rejects.toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            errorCode: ErrorCode.AUTH_EMAIL_NOT_VERIFIED,
          }),
        }),
      );
    });

    it('should allow password change when user has never changed password', async () => {
      const userWithoutPasswordChange = {
        ...mockUser,
        lastPasswordChangedAt: null,
      };
      userService.findByEmail.mockResolvedValue(userWithoutPasswordChange);
      emailVerificationService.isEmailVerified.mockResolvedValue(true);
      userService.updatePassword.mockResolvedValue(userWithoutPasswordChange);

      const resetDto = {
        email: 'test@example.com',
        newPassword: 'newpassword123',
      };

      await service.resetPassword(resetDto);

      expect(userService.updatePassword).toHaveBeenCalled();
    });

    it('should allow password change when more than 24 hours have passed', async () => {
      const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
      const userWithOldPasswordChange = {
        ...mockUser,
        lastPasswordChangedAt: twoDaysAgo,
      };
      userService.findByEmail.mockResolvedValue(userWithOldPasswordChange);
      emailVerificationService.isEmailVerified.mockResolvedValue(true);
      userService.updatePassword.mockResolvedValue(userWithOldPasswordChange);

      const resetDto = {
        email: 'test@example.com',
        newPassword: 'newpassword123',
      };

      await service.resetPassword(resetDto);

      expect(userService.updatePassword).toHaveBeenCalled();
    });

    it('should throw HttpException when user tries to change password within 24 hours', async () => {
      const oneHourAgo = new Date(Date.now() - 1 * 60 * 60 * 1000);
      const userWithRecentPasswordChange = {
        ...mockUser,
        lastPasswordChangedAt: oneHourAgo,
      };
      userService.findByEmail.mockResolvedValue(userWithRecentPasswordChange);
      emailVerificationService.isEmailVerified.mockResolvedValue(true);

      const resetDto = {
        email: 'test@example.com',
        newPassword: 'newpassword123',
      };

      await expect(service.resetPassword(resetDto)).rejects.toThrow(
        expect.objectContaining({
          status: HttpStatus.TOO_MANY_REQUESTS,
          response: expect.objectContaining({
            errorCode: ErrorCode.AUTH_PASSWORD_CHANGE_LIMIT,
          }),
        }),
      );
      expect(userService.updatePassword).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when non-existent user tries to reset password', async () => {
      emailVerificationService.isEmailVerified.mockResolvedValue(true);
      userService.findByEmail.mockResolvedValue(null);

      const resetDto = {
        email: 'nonexistent@example.com',
        newPassword: 'newpassword123',
      };

      await expect(service.resetPassword(resetDto)).rejects.toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            errorCode: ErrorCode.AUTH_EMAIL_NOT_REGISTERED,
          }),
        }),
      );
    });
  });
});
