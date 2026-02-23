import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { HttpException, HttpStatus } from '@nestjs/common';
import { MessageCode } from '@/common/constants/message-codes';
import { ErrorCode } from '@/common/constants/error-codes';
import { User } from '../../user/entities/user.entity';
import { UserService } from '../../user/user.service';
import { AuthService } from '../auth.service';
import { EmailPurpose } from '../dto/send-email-code.dto';
import { AuthPasswordService } from '../services/auth-password.service';
import { AuthSocialService } from '../services/auth-social.service';
import { AuthTokenService } from '../services/auth-token.service';
import { EmailVerificationService } from '../services/email-verification.service';
import { RedisCacheService } from '@/common/cache/cache.service';

describe('AuthService', () => {
  let service: AuthService;
  let userService: jest.Mocked<UserService>;
  let authTokenService: jest.Mocked<AuthTokenService>;
  let authSocialService: jest.Mocked<AuthSocialService>;
  let authPasswordService: jest.Mocked<AuthPasswordService>;
  let emailVerificationService: jest.Mocked<EmailVerificationService>;
  let userRepository: jest.Mocked<Repository<User>>;
  let cacheService: jest.Mocked<RedisCacheService>;

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
      getUserBySocialId: jest.fn(),
      createOauth: jest.fn(),
      createUser: jest.fn(),
      findByEmail: jest.fn(),
      markEmailVerified: jest.fn(),
      updatePassword: jest.fn(),
      getAuthenticatedEntity: jest.fn(),
      getEntityDefaultAddress: jest.fn(),
    };

    const mockAuthTokenService: jest.Mocked<Partial<AuthTokenService>> = {
      issueTokens: jest.fn(),
      refreshAccessToken: jest.fn(),
      logout: jest.fn(),
      persistRefreshToken: jest.fn(),
    };

    const mockAuthSocialService: jest.Mocked<Partial<AuthSocialService>> = {
      kakaoLogin: jest.fn(),
      kakaoLoginWithToken: jest.fn(),
      googleLogin: jest.fn(),
      reRegisterSocial: jest.fn(),
    };

    const mockAuthPasswordService: jest.Mocked<Partial<AuthPasswordService>> =
      {
        sendResetPasswordCode: jest.fn(),
        verifyResetPasswordCode: jest.fn(),
        resetPassword: jest.fn(),
      };

    const mockEmailVerificationService: jest.Mocked<
      Partial<EmailVerificationService>
    > = {
      sendCode: jest.fn(),
      verifyCode: jest.fn(),
      isEmailVerified: jest.fn(),
      expireVerification: jest.fn(),
      clearVerification: jest.fn(),
    };

    const mockUserRepository: jest.Mocked<Partial<Repository<User>>> = {
      findOne: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    };

    const mockDataSource = {
      transaction: jest.fn().mockImplementation(async (runInTransaction) => {
        const manager = {
          getRepository: jest.fn().mockReturnValue({
            update: jest.fn().mockResolvedValue({ affected: 1 }),
            findOne: jest.fn().mockResolvedValue(null),
            save: jest.fn(),
          }),
        };
        return runInTransaction(manager);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: UserService,
          useValue: mockUserService,
        },
        {
          provide: AuthTokenService,
          useValue: mockAuthTokenService,
        },
        {
          provide: AuthSocialService,
          useValue: mockAuthSocialService,
        },
        {
          provide: AuthPasswordService,
          useValue: mockAuthPasswordService,
        },
        {
          provide: EmailVerificationService,
          useValue: mockEmailVerificationService,
        },
        {
          provide: RedisCacheService,
          useValue: {
            get: jest.fn(),
            set: jest.fn(),
            del: jest.fn(),
            getUserProfile: jest.fn(),
            setUserProfile: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepository,
        },
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
        {
          provide: 'ConfigService',
          useValue: {
            get: jest.fn(),
            getOrThrow: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    userService = module.get(UserService);
    authTokenService = module.get(AuthTokenService);
    authSocialService = module.get(AuthSocialService);
    authPasswordService = module.get(AuthPasswordService);
    emailVerificationService = module.get(EmailVerificationService);
    userRepository = module.get(getRepositoryToken(User));
    cacheService = module.get(RedisCacheService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should create service instance when all dependencies are injected', () => {
    expect(service).toBeDefined();
  });

  describe('kakaoLogin', () => {
    it('should delegate to authSocialService when called', async () => {
      const code = 'test-code';
      const expectedResult = {
        email: 'test@example.com',
        token: 'access-token',
        refreshToken: 'refresh-token',
        name: 'Test User',
        address: null,
        latitude: null,
        longitude: null,
        preferences: null,
        birthDate: null,
        gender: null,
        preferredLanguage: 'ko' as const,
      };

      authSocialService.kakaoLogin.mockResolvedValue(expectedResult);

      const result = await service.kakaoLogin(code);

      expect(authSocialService.kakaoLogin).toHaveBeenCalledWith(
        code,
        expect.any(Function),
        undefined,
      );
      expect(result).toEqual(expectedResult);
    });
  });

  describe('kakaoLoginWithToken', () => {
    it('should delegate to authSocialService when called', async () => {
      const accessToken = 'kakao-access-token';
      const expectedResult = {
        email: 'test@example.com',
        token: 'access-token',
        refreshToken: 'refresh-token',
        name: 'Test User',
        address: null,
        latitude: null,
        longitude: null,
        preferences: null,
        birthDate: null,
        gender: null,
        preferredLanguage: 'ko' as const,
      };

      authSocialService.kakaoLoginWithToken.mockResolvedValue(expectedResult);

      const result = await service.kakaoLoginWithToken(accessToken);

      expect(authSocialService.kakaoLoginWithToken).toHaveBeenCalledWith(
        accessToken,
        expect.any(Function),
        undefined,
      );
      expect(result).toEqual(expectedResult);
    });
  });

  describe('googleLogin', () => {
    it('should delegate to authSocialService when called', async () => {
      const code = 'google-code';
      const expectedResult = {
        email: 'test@example.com',
        token: 'access-token',
        refreshToken: 'refresh-token',
        name: 'Test User',
        address: null,
        latitude: null,
        longitude: null,
        preferences: null,
        birthDate: null,
        gender: null,
        preferredLanguage: 'ko' as const,
      };

      authSocialService.googleLogin.mockResolvedValue(expectedResult);

      const result = await service.googleLogin(code);

      expect(authSocialService.googleLogin).toHaveBeenCalledWith(
        code,
        expect.any(Function),
        undefined,
      );
      expect(result).toEqual(expectedResult);
    });
  });

  describe('refreshAccessToken', () => {
    it('should delegate to authTokenService', async () => {
      const refreshToken = 'refresh-token';
      const expectedTokens = {
        token: 'new-access-token',
        refreshToken: 'new-refresh-token',
      };

      authTokenService.refreshAccessToken.mockResolvedValue(expectedTokens);

      const result = await service.refreshAccessToken(refreshToken);

      expect(authTokenService.refreshAccessToken).toHaveBeenCalledWith(
        refreshToken,
      );
      expect(result).toEqual(expectedTokens);
    });
  });

  describe('logout', () => {
    it('should delegate to authTokenService when logout is called', async () => {
      const refreshToken = 'refresh-token';

      await service.logout(refreshToken);

      expect(authTokenService.logout).toHaveBeenCalledWith(refreshToken);
    });
  });

  describe('register', () => {
    it('should create a new user successfully when valid registration data is provided', async () => {
      const registerDto = {
        email: 'newuser@example.com',
        password: 'password123',
        name: 'New User',
      };

      userRepository.findOne.mockResolvedValue(null);
      emailVerificationService.isEmailVerified.mockResolvedValue(true);
      userService.createUser.mockResolvedValue(mockUser);

      const result = await service.register(registerDto);

      expect(userRepository.findOne).toHaveBeenCalledWith({
        where: { email: registerDto.email },
        withDeleted: true,
      });
      expect(userService.createUser).toHaveBeenCalledWith(
        expect.objectContaining({
          email: registerDto.email,
          name: registerDto.name,
          role: 'USER',
        }),
      );
      expect(result).toEqual({
        messageCode: MessageCode.AUTH_REGISTRATION_COMPLETED,
      });
    });

    it('should throw BadRequestException when email already exists', async () => {
      const registerDto = {
        email: 'existing@example.com',
        password: 'password123',
        name: 'Existing User',
      };

      userRepository.findOne.mockResolvedValue(mockUser);

      await expect(service.register(registerDto)).rejects.toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            errorCode: ErrorCode.AUTH_EMAIL_ALREADY_EXISTS,
          }),
        }),
      );
    });
  });

  describe('validateUser', () => {
    it('should return user when credentials are valid', async () => {
      const email = 'test@example.com';
      const password = 'password123';

      userRepository.findOne.mockResolvedValue(mockUser);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);

      const result = await service.validateUser(email, password);

      expect(result.user).toEqual(mockUser);
      expect(result.reason).toBe('success');
    });

    it('should return null user when user does not exist', async () => {
      const email = 'nonexistent@example.com';
      const password = 'password123';

      userRepository.findOne.mockResolvedValue(null);

      const result = await service.validateUser(email, password);

      expect(result.user).toBeNull();
      expect(result.reason).toBe('not_found');
    });

    it('should return null user when user is deleted', async () => {
      const deletedUser = { ...mockUser, deletedAt: new Date() };
      userRepository.findOne.mockResolvedValue(deletedUser);

      const result = await service.validateUser('test@example.com', 'password');

      expect(result.user).toBeNull();
      expect(result.reason).toBe('deleted');
    });

    it('should return null user when password is invalid', async () => {
      userRepository.findOne.mockResolvedValue(mockUser);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(false as never);

      const result = await service.validateUser('test@example.com', 'wrongpw');

      expect(result.user).toBeNull();
      expect(result.reason).toBe('wrong_password');
    });
  });

  describe('login', () => {
    it('should return auth result when valid credentials are provided', async () => {
      const loginDto = { email: 'test@example.com', password: 'password123' };
      const authResult = {
        email: mockUser.email,
        token: 'access-token',
        refreshToken: 'refresh-token',
        name: mockUser.name,
        address: null,
        latitude: null,
        longitude: null,
        preferences: null,
        birthDate: null,
        gender: null,
        preferredLanguage: 'ko' as const,
      };

      userRepository.findOne.mockResolvedValue(mockUser);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);
      authTokenService.issueTokens.mockResolvedValue({
        token: 'access-token',
        refreshToken: 'refresh-token',
      });
      userService.getEntityDefaultAddress.mockResolvedValue(null);

      const result = await service.login(loginDto);

      expect(result).toMatchObject({
        email: authResult.email,
        token: authResult.token,
        refreshToken: authResult.refreshToken,
      });
    });

    it('should throw UnauthorizedException when invalid credentials are provided', async () => {
      const loginDto = {
        email: 'test@example.com',
        password: 'wrongpassword',
      };

      // First call is validateUser (returns null due to wrong password)
      userRepository.findOne.mockResolvedValueOnce(mockUser);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(false as never);
      // Second call is to check for deactivated user (returns active user)
      userRepository.findOne.mockResolvedValueOnce(mockUser);

      await expect(service.login(loginDto)).rejects.toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            errorCode: ErrorCode.AUTH_INVALID_CREDENTIALS,
          }),
        }),
      );
    });

    it('should throw HttpException with FORBIDDEN status when user is deactivated', async () => {
      const loginDto = {
        email: 'test@example.com',
        password: 'password123',
      };
      const deactivatedUser = {
        ...mockUser,
        isDeactivated: true,
        deactivatedAt: new Date(),
      };

      // First call is validateUser (returns null because user is deactivated)
      userRepository.findOne.mockResolvedValueOnce(deactivatedUser);
      // Second call is to check if user is deactivated
      userRepository.findOne.mockResolvedValueOnce(deactivatedUser);

      await expect(service.login(loginDto)).rejects.toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            errorCode: ErrorCode.USER_DEACTIVATED,
          }),
        }),
      );
    });
  });

  describe('checkEmail', () => {
    it('should return available when new email is checked', async () => {
      userRepository.findOne.mockResolvedValue(null);

      const result = await service.checkEmail('new@example.com');

      expect(result).toEqual({
        available: true,
        messageCode: MessageCode.AUTH_EMAIL_AVAILABLE,
      });
    });

    it('should return not available when existing email is checked', async () => {
      userRepository.findOne.mockResolvedValue(mockUser);

      const result = await service.checkEmail('existing@example.com');

      expect(result).toEqual({
        available: false,
        errorCode: ErrorCode.AUTH_EMAIL_IN_USE,
      });
    });

    it('should indicate re-registration possibility when deleted user email is checked', async () => {
      const deletedUser = { ...mockUser, deletedAt: new Date() };
      userRepository.findOne.mockResolvedValue(deletedUser);

      const result = await service.checkEmail('deleted@example.com');

      expect(result).toEqual({
        available: false,
        canReRegister: true,
        errorCode: ErrorCode.AUTH_WITHDRAWAL_HISTORY_CONFIRM,
      });
    });
  });

  describe('sendResetPasswordCode', () => {
    it('should delegate to authPasswordService when called', async () => {
      const email = 'test@example.com';
      const expectedResult = {
        remainCount: 4,
        messageCode: MessageCode.AUTH_VERIFICATION_CODE_SENT,
      };

      authPasswordService.sendResetPasswordCode.mockResolvedValue(
        expectedResult,
      );

      const result = await service.sendResetPasswordCode(email, 'ko');

      expect(authPasswordService.sendResetPasswordCode).toHaveBeenCalledWith(
        email,
        'ko',
      );
      expect(result).toEqual(expectedResult);
    });
  });

  describe('resetPassword', () => {
    it('should delegate to authPasswordService when called', async () => {
      const resetDto = {
        email: 'test@example.com',
        newPassword: 'newpassword123',
      };

      authPasswordService.resetPassword.mockResolvedValue(undefined);

      await service.resetPassword(resetDto);

      expect(authPasswordService.resetPassword).toHaveBeenCalledWith(resetDto);
    });
  });

  describe('reRegister', () => {
    it('should re-register deleted user successfully when valid data is provided', async () => {
      const deletedUser = { ...mockUser, deletedAt: new Date() };
      const reRegisterDto = {
        email: 'deleted@example.com',
        password: 'newpassword123',
        name: 'Re-registered User',
      };

      userRepository.findOne
        .mockResolvedValueOnce(deletedUser)
        .mockResolvedValueOnce({ ...deletedUser, deletedAt: null });
      emailVerificationService.isEmailVerified.mockResolvedValue(true);
      emailVerificationService.expireVerification.mockResolvedValue(undefined);

      const result = await service.reRegister(reRegisterDto);

      expect(result).toEqual({
        messageCode: MessageCode.AUTH_RE_REGISTRATION_COMPLETED,
      });
    });

    it('should throw BadRequestException when no deleted account exists', async () => {
      const reRegisterDto = {
        email: 'active@example.com',
        password: 'password123',
        name: 'Active User',
      };

      userRepository.findOne.mockResolvedValue(mockUser);

      await expect(service.reRegister(reRegisterDto)).rejects.toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            errorCode: ErrorCode.AUTH_RE_REGISTER_NOT_AVAILABLE,
          }),
        }),
      );
    });
  });

  describe('getUserProfile', () => {
    it('should return user profile when user email is provided', async () => {
      const email = 'test@example.com';
      userService.getAuthenticatedEntity.mockResolvedValue(mockUser);
      userService.getEntityDefaultAddress.mockResolvedValue(null);
      cacheService.getUserProfile.mockResolvedValue(null);

      const result = await service.getUserProfile(email);

      expect(result).toMatchObject({
        email: mockUser.email,
        name: mockUser.name,
        address: null,
        latitude: null,
        longitude: null,
      });
    });
  });

  describe('register - email verification branch', () => {
    it('should mark email verified and expire verification when user registers with verified email', async () => {
      const registerDto = {
        email: 'verified@example.com',
        password: 'password123',
        name: 'Verified User',
      };

      userRepository.findOne.mockResolvedValue(null);
      emailVerificationService.isEmailVerified.mockResolvedValue(true);
      userService.createUser.mockResolvedValue(mockUser);
      (emailVerificationService as any).sendWelcomeEmail = jest.fn();

      await service.register(registerDto);

      expect(userService.markEmailVerified).toHaveBeenCalledWith(
        registerDto.email,
      );
      expect(emailVerificationService.expireVerification).toHaveBeenCalledWith(
        registerDto.email,
        EmailPurpose.SIGNUP,
      );
    });

    it('should throw BadRequestException when email is not verified', async () => {
      const registerDto = {
        email: 'unverified@example.com',
        password: 'password123',
        name: 'Unverified User',
      };

      userRepository.findOne.mockResolvedValue(null);
      emailVerificationService.isEmailVerified.mockResolvedValue(false);

      await expect(service.register(registerDto)).rejects.toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            errorCode: ErrorCode.AUTH_EMAIL_NOT_VERIFIED,
          }),
        }),
      );

      expect(userService.createUser).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when deleted user tries to register again', async () => {
      const registerDto = {
        email: 'deleted@example.com',
        password: 'password123',
        name: 'Deleted User',
      };

      const deletedUser = { ...mockUser, deletedAt: new Date() };
      userRepository.findOne.mockResolvedValue(deletedUser);

      await expect(service.register(registerDto)).rejects.toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            errorCode: ErrorCode.AUTH_WITHDRAWAL_HISTORY_REREGISTER,
          }),
        }),
      );
    });
  });

  describe('register - welcome email integration', () => {
    it('should send welcome email after successful registration', async () => {
      // Arrange
      const registerDto = {
        email: 'newuser@example.com',
        password: 'password123',
        name: 'New User',
      };

      userRepository.findOne.mockResolvedValue(null);
      emailVerificationService.isEmailVerified.mockResolvedValue(true);
      userService.createUser.mockResolvedValue(mockUser);
      (emailVerificationService as any).sendWelcomeEmail = jest.fn();

      // Act
      await service.register(registerDto, 'ko');

      // Assert
      expect(
        (emailVerificationService as any).sendWelcomeEmail,
      ).toHaveBeenCalledWith(mockUser.id.toString(), 'ko');
      expect(userService.markEmailVerified).toHaveBeenCalled();
      expect(
        (emailVerificationService as any).sendWelcomeEmail,
      ).toHaveBeenCalled();
    });

    it('should not fail registration if welcome email fails', async () => {
      // Arrange
      const registerDto = {
        email: 'newuser@example.com',
        password: 'password123',
        name: 'New User',
      };

      userRepository.findOne.mockResolvedValue(null);
      emailVerificationService.isEmailVerified.mockResolvedValue(true);
      userService.createUser.mockResolvedValue(mockUser);
      (emailVerificationService as any).sendWelcomeEmail = jest
        .fn()
        .mockRejectedValue(new Error('SMTP connection failed'));

      // Act
      const result = await service.register(registerDto);

      // Assert
      expect(result).toEqual({
        messageCode: MessageCode.AUTH_REGISTRATION_COMPLETED,
      });
    });

    it('should pass user preferred language to welcome email', async () => {
      // Arrange
      const registerDto = {
        email: 'english@example.com',
        password: 'password123',
        name: 'English User',
      };

      userRepository.findOne.mockResolvedValue(null);
      emailVerificationService.isEmailVerified.mockResolvedValue(true);
      userService.createUser.mockResolvedValue(mockUser);
      (emailVerificationService as any).sendWelcomeEmail = jest.fn();

      // Act
      await service.register(registerDto, 'en');

      // Assert
      expect(
        (emailVerificationService as any).sendWelcomeEmail,
      ).toHaveBeenCalledWith(mockUser.id.toString(), 'en');
    });

    it('should still send welcome email if language is not provided', async () => {
      // Arrange
      const registerDto = {
        email: 'noLang@example.com',
        password: 'password123',
        name: 'No Lang User',
      };

      userRepository.findOne.mockResolvedValue(null);
      emailVerificationService.isEmailVerified.mockResolvedValue(true);
      userService.createUser.mockResolvedValue(mockUser);
      (emailVerificationService as any).sendWelcomeEmail = jest.fn();

      // Act
      await service.register(registerDto);

      // Assert
      expect(
        (emailVerificationService as any).sendWelcomeEmail,
      ).toHaveBeenCalledWith(mockUser.id.toString(), undefined);
    });

    it('should log warning if welcome email service fails', async () => {
      // Arrange
      const registerDto = {
        email: 'emailfail@example.com',
        password: 'password123',
        name: 'Email Fail User',
      };

      userRepository.findOne.mockResolvedValue(null);
      emailVerificationService.isEmailVerified.mockResolvedValue(true);
      userService.createUser.mockResolvedValue(mockUser);

      const emailError = new Error('SMTP connection failed');
      (emailVerificationService as any).sendWelcomeEmail = jest
        .fn()
        .mockRejectedValue(emailError);

      const loggerWarnSpy = jest.spyOn((service as any).logger, 'warn');

      // Act
      await service.register(registerDto);

      // Assert
      expect(loggerWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to send welcome email'),
      );
    });
  });

  describe('validateUser - all conditional branches', () => {
    it('should return null user when social login user has no password', async () => {
      const socialUser = { ...mockUser, password: null };
      userRepository.findOne.mockResolvedValue(socialUser);

      const result = await service.validateUser(
        'test@example.com',
        'password123',
      );

      expect(result.user).toBeNull();
      expect(result.reason).toBe('no_password');
    });

    it('should return null user when user is deactivated', async () => {
      const deactivatedUser = {
        ...mockUser,
        isDeactivated: true,
        deactivatedAt: new Date(),
      };
      userRepository.findOne.mockResolvedValue(deactivatedUser);

      const result = await service.validateUser(
        'test@example.com',
        'password123',
      );

      expect(result.user).toBeNull();
      expect(result.reason).toBe('deactivated');
    });
  });

  describe('getUserProfile - address coordinate handling', () => {
    it('should convert string latitude/longitude to numbers when address has string coordinates', async () => {
      const addressWithStringCoords = {
        id: 1,
        roadAddress: '서울시 강남구',
        latitude: '37.5',
        longitude: '127.0',
      } as any;

      userService.getAuthenticatedEntity.mockResolvedValue(mockUser);
      userService.getEntityDefaultAddress.mockResolvedValue(
        addressWithStringCoords,
      );
      cacheService.getUserProfile.mockResolvedValue(null);

      const result = await service.getUserProfile('test@example.com');

      expect(result.latitude).toBe(37.5);
      expect(result.longitude).toBe(127.0);
      expect(typeof result.latitude).toBe('number');
      expect(typeof result.longitude).toBe('number');
    });

    it('should use numeric latitude/longitude when coordinates are already numbers', async () => {
      const addressWithNumericCoords = {
        id: 1,
        roadAddress: '서울시 강남구',
        latitude: 37.5,
        longitude: 127.0,
      } as any;

      userService.getAuthenticatedEntity.mockResolvedValue(mockUser);
      userService.getEntityDefaultAddress.mockResolvedValue(
        addressWithNumericCoords,
      );
      cacheService.getUserProfile.mockResolvedValue(null);

      const result = await service.getUserProfile('test@example.com');

      expect(result.latitude).toBe(37.5);
      expect(result.longitude).toBe(127.0);
    });
  });


  describe('reRegister - error branches', () => {
    it('should throw BadRequestException when re-register update fails to restore user', async () => {
      const deletedUser = { ...mockUser, deletedAt: new Date() };
      const reRegisterDto = {
        email: 'deleted@example.com',
        password: 'newpassword123',
        name: 'Re-registered User',
      };

      userRepository.findOne
        .mockResolvedValueOnce(deletedUser)
        .mockResolvedValueOnce(null);
      emailVerificationService.isEmailVerified.mockResolvedValue(true);

      await expect(service.reRegister(reRegisterDto)).rejects.toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            errorCode: ErrorCode.AUTH_RE_REGISTER_ERROR,
          }),
        }),
      );
    });

    it('should throw BadRequestException when re-register is attempted without email verification', async () => {
      const deletedUser = { ...mockUser, deletedAt: new Date() };
      const reRegisterDto = {
        email: 'deleted@example.com',
        password: 'newpassword123',
        name: 'Re-registered User',
      };

      userRepository.findOne.mockResolvedValue(deletedUser);
      emailVerificationService.isEmailVerified.mockResolvedValue(false);

      await expect(service.reRegister(reRegisterDto)).rejects.toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            errorCode: ErrorCode.AUTH_EMAIL_NOT_VERIFIED,
          }),
        }),
      );
    });

    it('should throw BadRequestException when re-register is attempted for non-existent user', async () => {
      const reRegisterDto = {
        email: 'nonexistent@example.com',
        password: 'newpassword123',
        name: 'New User',
      };

      userRepository.findOne.mockResolvedValue(null);

      await expect(service.reRegister(reRegisterDto)).rejects.toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            errorCode: ErrorCode.AUTH_RE_REGISTER_NOT_AVAILABLE,
          }),
        }),
      );
    });
  });

  describe('verifyResetPasswordCode', () => {
    it('should delegate to authPasswordService when called', async () => {
      const email = 'test@example.com';
      const code = '123456';
      authPasswordService.verifyResetPasswordCode.mockResolvedValue(undefined);

      await service.verifyResetPasswordCode(email, code);

      expect(authPasswordService.verifyResetPasswordCode).toHaveBeenCalledWith(
        email,
        code,
      );
    });
  });

  describe('reRegisterSocial', () => {
    it('should delegate to authSocialService when social user re-registers', async () => {
      const reRegisterSocialDto = {
        email: 'social@example.com',
        socialType: 'kakao' as const,
      };
      const expectedResult = {
        messageCode: MessageCode.AUTH_RE_REGISTRATION_COMPLETED,
      };

      authSocialService.reRegisterSocial.mockResolvedValue(expectedResult);

      const result = await service.reRegisterSocial(reRegisterSocialDto);

      expect(authSocialService.reRegisterSocial).toHaveBeenCalledWith(
        reRegisterSocialDto,
      );
      expect(result).toEqual(expectedResult);
    });
  });

  describe('buildAuthResult - user preferences handling', () => {
    it('should include preferences in auth result when user has preferences', async () => {
      const userWithPreferences = {
        ...mockUser,
        preferences: {
          likes: ['한식', '중식'],
          dislikes: ['채식'],
          analysis: '한식을 선호합니다',
        },
      };
      authTokenService.issueTokens.mockResolvedValue({
        token: 'access-token',
        refreshToken: 'refresh-token',
      });
      userService.getEntityDefaultAddress.mockResolvedValue(null);

      const result = await service.buildAuthResult(userWithPreferences);

      expect(result.preferences).toEqual({
        likes: ['한식', '중식'],
        dislikes: ['채식'],
        analysis: '한식을 선호합니다',
      });
    });

    it('should set preferences to null in auth result when user has no preferences', async () => {
      const userWithoutPreferences = { ...mockUser, preferences: null };
      authTokenService.issueTokens.mockResolvedValue({
        token: 'access-token',
        refreshToken: 'refresh-token',
      });
      userService.getEntityDefaultAddress.mockResolvedValue(null);

      const result = await service.buildAuthResult(userWithoutPreferences);

      expect(result.preferences).toBeNull();
    });
  });

  describe('logout - undefined refreshToken branch', () => {
    it('should handle logout when refresh token is undefined', async () => {
      await service.logout(undefined);

      expect(authTokenService.logout).toHaveBeenCalledWith(undefined);
    });

    it('should handle logout when valid refresh token is provided', async () => {
      const refreshToken = 'valid-refresh-token';

      await service.logout(refreshToken);

      expect(authTokenService.logout).toHaveBeenCalledWith(refreshToken);
    });
  });
});
