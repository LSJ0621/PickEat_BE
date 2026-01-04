import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../user/entities/user.entity';
import { UserService } from '../user/user.service';
import { AuthService } from './auth.service';
import { EmailPurpose } from './dto/send-email-code.dto';
import { AuthSocialService } from './services/auth-social.service';
import { AuthTokenService } from './services/auth-token.service';
import { EmailVerificationService } from './services/email-verification.service';

describe('AuthService', () => {
  let service: AuthService;
  let userService: jest.Mocked<UserService>;
  let authTokenService: jest.Mocked<AuthTokenService>;
  let authSocialService: jest.Mocked<AuthSocialService>;
  let emailVerificationService: jest.Mocked<EmailVerificationService>;
  let userRepository: jest.Mocked<Repository<User>>;

  const mockUser: User = {
    id: 1,
    email: 'test@example.com',
    password: '$2b$10$hashedpassword',
    name: 'Test User',
    role: 'USER',
    emailVerified: true,
    reRegisterEmailVerified: false,
    preferences: null,
    refreshToken: null,
    socialId: null,
    socialType: null,
    lastPasswordChangedAt: null,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    version: 1,
    addresses: [],
    recommendations: [],
    menuSelections: [],
  } as User;

  beforeEach(async () => {
    const mockUserService = {
      getUserBySocialId: jest.fn(),
      createOauth: jest.fn(),
      createUser: jest.fn(),
      findByEmail: jest.fn(),
      markEmailVerified: jest.fn(),
      updatePassword: jest.fn(),
      getAuthenticatedEntity: jest.fn(),
      getEntityDefaultAddress: jest.fn(),
    };

    const mockAuthTokenService = {
      issueTokens: jest.fn(),
      refreshAccessToken: jest.fn(),
      logout: jest.fn(),
      persistRefreshToken: jest.fn(),
    };

    const mockAuthSocialService = {
      kakaoLogin: jest.fn(),
      kakaoLoginWithToken: jest.fn(),
      googleLogin: jest.fn(),
      reRegisterSocial: jest.fn(),
    };

    const mockEmailVerificationService = {
      sendCode: jest.fn(),
      verifyCode: jest.fn(),
      isEmailVerified: jest.fn(),
      expireVerification: jest.fn(),
      clearVerification: jest.fn(),
    };

    const mockUserRepository = {
      findOne: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
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
          provide: EmailVerificationService,
          useValue: mockEmailVerificationService,
        },
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepository,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    userService = module.get(UserService);
    authTokenService = module.get(AuthTokenService);
    authSocialService = module.get(AuthSocialService);
    emailVerificationService = module.get(EmailVerificationService);
    userRepository = module.get(getRepositoryToken(User));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('kakaoLogin', () => {
    it('should delegate to authSocialService', async () => {
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
      };

      authSocialService.kakaoLogin.mockResolvedValue(expectedResult);

      const result = await service.kakaoLogin(code);

      expect(authSocialService.kakaoLogin).toHaveBeenCalledWith(
        code,
        expect.any(Function),
      );
      expect(result).toEqual(expectedResult);
    });
  });

  describe('kakaoLoginWithToken', () => {
    it('should delegate to authSocialService', async () => {
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
      };

      authSocialService.kakaoLoginWithToken.mockResolvedValue(expectedResult);

      const result = await service.kakaoLoginWithToken(accessToken);

      expect(authSocialService.kakaoLoginWithToken).toHaveBeenCalledWith(
        accessToken,
        expect.any(Function),
      );
      expect(result).toEqual(expectedResult);
    });
  });

  describe('googleLogin', () => {
    it('should delegate to authSocialService', async () => {
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
      };

      authSocialService.googleLogin.mockResolvedValue(expectedResult);

      const result = await service.googleLogin(code);

      expect(authSocialService.googleLogin).toHaveBeenCalledWith(
        code,
        expect.any(Function),
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
    it('should delegate to authTokenService', async () => {
      const refreshToken = 'refresh-token';

      await service.logout(refreshToken);

      expect(authTokenService.logout).toHaveBeenCalledWith(refreshToken);
    });
  });

  describe('register', () => {
    it('should create a new user successfully', async () => {
      const registerDto = {
        email: 'newuser@example.com',
        password: 'password123',
        name: 'New User',
      };

      userRepository.findOne.mockResolvedValue(null);
      emailVerificationService.isEmailVerified.mockResolvedValue(false);
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
      expect(result).toEqual({ message: '회원가입이 완료되었습니다.' });
    });

    it('should throw BadRequestException if email already exists', async () => {
      const registerDto = {
        email: 'existing@example.com',
        password: 'password123',
        name: 'Existing User',
      };

      userRepository.findOne.mockResolvedValue(mockUser);

      await expect(service.register(registerDto)).rejects.toThrow(
        '이미 등록된 이메일입니다.',
      );
    });
  });

  describe('validateUser', () => {
    it('should return user if credentials are valid', async () => {
      const email = 'test@example.com';
      const password = 'password123';

      userRepository.findOne.mockResolvedValue(mockUser);
      jest.spyOn(require('bcrypt'), 'compare').mockResolvedValue(true as never);

      const result = await service.validateUser(email, password);

      expect(result).toEqual(mockUser);
    });

    it('should return null if user does not exist', async () => {
      const email = 'nonexistent@example.com';
      const password = 'password123';

      userRepository.findOne.mockResolvedValue(null);

      const result = await service.validateUser(email, password);

      expect(result).toBeNull();
    });

    it('should return null if user is deleted', async () => {
      const deletedUser = { ...mockUser, deletedAt: new Date() };
      userRepository.findOne.mockResolvedValue(deletedUser);

      const result = await service.validateUser('test@example.com', 'password');

      expect(result).toBeNull();
    });

    it('should return null if password is invalid', async () => {
      userRepository.findOne.mockResolvedValue(mockUser);
      jest
        .spyOn(require('bcrypt'), 'compare')
        .mockResolvedValue(false as never);

      const result = await service.validateUser('test@example.com', 'wrongpw');

      expect(result).toBeNull();
    });
  });

  describe('login', () => {
    it('should return auth result for valid credentials', async () => {
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
      };

      userRepository.findOne.mockResolvedValue(mockUser);
      jest.spyOn(require('bcrypt'), 'compare').mockResolvedValue(true as never);
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

    it('should throw UnauthorizedException for invalid credentials', async () => {
      const loginDto = {
        email: 'test@example.com',
        password: 'wrongpassword',
      };

      userRepository.findOne.mockResolvedValue(mockUser);
      jest
        .spyOn(require('bcrypt'), 'compare')
        .mockResolvedValue(false as never);

      await expect(service.login(loginDto)).rejects.toThrow(
        '이메일 또는 비밀번호가 올바르지 않습니다.',
      );
    });
  });

  describe('checkEmail', () => {
    it('should return available for new email', async () => {
      userRepository.findOne.mockResolvedValue(null);

      const result = await service.checkEmail('new@example.com');

      expect(result).toEqual({
        available: true,
        message: '사용 가능한 이메일입니다.',
      });
    });

    it('should return not available for existing email', async () => {
      userRepository.findOne.mockResolvedValue(mockUser);

      const result = await service.checkEmail('existing@example.com');

      expect(result).toEqual({
        available: false,
        message: '이미 사용 중인 이메일입니다.',
      });
    });

    it('should indicate re-registration possibility for deleted user', async () => {
      const deletedUser = { ...mockUser, deletedAt: new Date() };
      userRepository.findOne.mockResolvedValue(deletedUser);

      const result = await service.checkEmail('deleted@example.com');

      expect(result).toEqual({
        available: false,
        canReRegister: true,
        message: '기존에 탈퇴 이력이 있습니다. 재가입하시겠습니까?',
      });
    });
  });

  describe('sendResetPasswordCode', () => {
    it('should send reset password code for regular user', async () => {
      const email = 'test@example.com';
      userService.findByEmail.mockResolvedValue(mockUser);
      emailVerificationService.sendCode.mockResolvedValue({
        remainCount: 4,
        message: '인증번호가 발송되었습니다. 남은 재발송 횟수는 4회입니다.',
      });

      const result = await service.sendResetPasswordCode(email);

      expect(userService.findByEmail).toHaveBeenCalledWith(email);
      expect(emailVerificationService.sendCode).toHaveBeenCalledWith(
        email,
        EmailPurpose.RESET_PASSWORD,
      );
      expect(result.remainCount).toBe(4);
    });

    it('should throw BadRequestException for social login account', async () => {
      const socialUser = { ...mockUser, password: null, socialId: 'kakao123' };
      userService.findByEmail.mockResolvedValue(socialUser);

      await expect(
        service.sendResetPasswordCode('social@example.com'),
      ).rejects.toThrow('소셜 로그인으로 가입한 계정입니다.');
    });

    it('should throw BadRequestException for non-existent email', async () => {
      userService.findByEmail.mockResolvedValue(null);

      await expect(
        service.sendResetPasswordCode('nonexistent@example.com'),
      ).rejects.toThrow('등록되지 않은 이메일입니다.');
    });
  });

  describe('resetPassword', () => {
    it('should reset password successfully', async () => {
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

    it('should throw BadRequestException if email not verified', async () => {
      const resetDto = {
        email: 'test@example.com',
        newPassword: 'newpassword123',
      };

      emailVerificationService.isEmailVerified.mockResolvedValue(false);

      await expect(service.resetPassword(resetDto)).rejects.toThrow(
        '이메일 인증이 완료되지 않았습니다.',
      );
    });
  });

  describe('reRegister', () => {
    it('should re-register deleted user successfully', async () => {
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

      expect(userRepository.update).toHaveBeenCalledWith(
        { email: reRegisterDto.email },
        expect.objectContaining({
          deletedAt: null,
          reRegisterEmailVerified: true,
        }),
      );
      expect(result).toEqual({
        message: '재가입이 완료되었습니다. 로그인해주세요.',
      });
    });

    it('should throw BadRequestException if no deleted account exists', async () => {
      const reRegisterDto = {
        email: 'active@example.com',
        password: 'password123',
        name: 'Active User',
      };

      userRepository.findOne.mockResolvedValue(mockUser);

      await expect(service.reRegister(reRegisterDto)).rejects.toThrow(
        '재가입할 수 있는 계정이 없습니다.',
      );
    });
  });

  describe('getUserProfile', () => {
    it('should return user profile', async () => {
      const email = 'test@example.com';
      userService.getAuthenticatedEntity.mockResolvedValue(mockUser);
      userService.getEntityDefaultAddress.mockResolvedValue(null);

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
    it('should mark email verified and expire verification when email is verified', async () => {
      const registerDto = {
        email: 'verified@example.com',
        password: 'password123',
        name: 'Verified User',
      };

      userRepository.findOne.mockResolvedValue(null);
      emailVerificationService.isEmailVerified.mockResolvedValue(true);
      userService.createUser.mockResolvedValue(mockUser);

      await service.register(registerDto);

      expect(userService.markEmailVerified).toHaveBeenCalledWith(
        registerDto.email,
      );
      expect(emailVerificationService.expireVerification).toHaveBeenCalledWith(
        registerDto.email,
        EmailPurpose.SIGNUP,
      );
    });

    it('should not mark email verified when email is not verified', async () => {
      const registerDto = {
        email: 'unverified@example.com',
        password: 'password123',
        name: 'Unverified User',
      };

      userRepository.findOne.mockResolvedValue(null);
      emailVerificationService.isEmailVerified.mockResolvedValue(false);
      userService.createUser.mockResolvedValue(mockUser);

      await service.register(registerDto);

      expect(userService.markEmailVerified).not.toHaveBeenCalled();
      expect(
        emailVerificationService.expireVerification,
      ).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException for deleted user during registration', async () => {
      const registerDto = {
        email: 'deleted@example.com',
        password: 'password123',
        name: 'Deleted User',
      };

      const deletedUser = { ...mockUser, deletedAt: new Date() };
      userRepository.findOne.mockResolvedValue(deletedUser);

      await expect(service.register(registerDto)).rejects.toThrow(
        '기존에 탈퇴 이력이 있습니다. 재가입을 진행해주세요.',
      );
    });
  });

  describe('validateUser - all conditional branches', () => {
    it('should return null when user has no password (social login account)', async () => {
      const socialUser = { ...mockUser, password: null };
      userRepository.findOne.mockResolvedValue(socialUser);

      const result = await service.validateUser(
        'test@example.com',
        'password123',
      );

      expect(result).toBeNull();
    });
  });

  describe('checkEmailAvailability - throwOnConflict false branches', () => {
    it('should return early void when throwOnConflict is true and email is available', async () => {
      userRepository.findOne.mockResolvedValue(null);

      const result = await (service as any).checkEmailAvailability(
        'new@example.com',
        true,
      );

      expect(result).toBeUndefined();
    });
  });

  describe('buildAddressResponse - latitude/longitude type conversion branches', () => {
    it('should convert string latitude/longitude to numbers', async () => {
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

      const result = await service.getUserProfile('test@example.com');

      expect(result.latitude).toBe(37.5);
      expect(result.longitude).toBe(127.0);
      expect(typeof result.latitude).toBe('number');
      expect(typeof result.longitude).toBe('number');
    });

    it('should use numeric latitude/longitude when already numbers', async () => {
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

      const result = await service.getUserProfile('test@example.com');

      expect(result.latitude).toBe(37.5);
      expect(result.longitude).toBe(127.0);
    });
  });

  describe('ensurePasswordChangeAllowed - rate limiting', () => {
    it('should allow password change when lastPasswordChangedAt is null', async () => {
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

    it('should throw HttpException when password was changed less than 24 hours ago', async () => {
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
        '비밀번호는 하루에 한 번만 변경할 수 있습니다.',
      );
      expect(userService.updatePassword).not.toHaveBeenCalled();
    });
  });

  describe('reRegister - error branches', () => {
    it('should throw BadRequestException when user not found after re-register update', async () => {
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
        '재가입 처리 중 오류가 발생했습니다.',
      );
    });

    it('should throw BadRequestException when email is not verified for re-register', async () => {
      const deletedUser = { ...mockUser, deletedAt: new Date() };
      const reRegisterDto = {
        email: 'deleted@example.com',
        password: 'newpassword123',
        name: 'Re-registered User',
      };

      userRepository.findOne.mockResolvedValue(deletedUser);
      emailVerificationService.isEmailVerified.mockResolvedValue(false);

      await expect(service.reRegister(reRegisterDto)).rejects.toThrow(
        '이메일 인증이 완료되지 않았습니다.',
      );
    });

    it('should throw BadRequestException when no user exists for re-register', async () => {
      const reRegisterDto = {
        email: 'nonexistent@example.com',
        password: 'newpassword123',
        name: 'New User',
      };

      userRepository.findOne.mockResolvedValue(null);

      await expect(service.reRegister(reRegisterDto)).rejects.toThrow(
        '재가입할 수 있는 계정이 없습니다.',
      );
    });
  });

  describe('verifyResetPasswordCode', () => {
    it('should verify reset password code for regular user', async () => {
      const email = 'test@example.com';
      const code = '123456';
      userService.findByEmail.mockResolvedValue(mockUser);
      emailVerificationService.verifyCode.mockResolvedValue(true);

      await service.verifyResetPasswordCode(email, code);

      expect(userService.findByEmail).toHaveBeenCalledWith(email);
      expect(emailVerificationService.verifyCode).toHaveBeenCalledWith(
        email,
        code,
        EmailPurpose.RESET_PASSWORD,
      );
    });

    it('should throw BadRequestException for non-existent user', async () => {
      userService.findByEmail.mockResolvedValue(null);

      await expect(
        service.verifyResetPasswordCode('nonexistent@example.com', '123456'),
      ).rejects.toThrow('등록되지 않은 이메일입니다.');
    });

    it('should throw BadRequestException for social login account', async () => {
      const socialUser = { ...mockUser, password: null, socialId: 'kakao123' };
      userService.findByEmail.mockResolvedValue(socialUser);

      await expect(
        service.verifyResetPasswordCode('social@example.com', '123456'),
      ).rejects.toThrow('소셜 로그인으로 가입한 계정입니다.');
    });
  });

  describe('reRegisterSocial', () => {
    it('should delegate to authSocialService', async () => {
      const reRegisterSocialDto = {
        email: 'social@example.com',
        socialType: 'kakao' as const,
      };
      const expectedResult = { message: '재가입이 완료되었습니다.' };

      authSocialService.reRegisterSocial.mockResolvedValue(expectedResult);

      const result = await service.reRegisterSocial(reRegisterSocialDto);

      expect(authSocialService.reRegisterSocial).toHaveBeenCalledWith(
        reRegisterSocialDto,
      );
      expect(result).toEqual(expectedResult);
    });
  });

  describe('buildAuthResult - preferences branch', () => {
    it('should include preferences when user has preferences', async () => {
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

    it('should set preferences to null when user has no preferences', async () => {
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
    it('should handle logout with undefined refresh token', async () => {
      await service.logout(undefined);

      expect(authTokenService.logout).toHaveBeenCalledWith(undefined);
    });

    it('should handle logout with valid refresh token', async () => {
      const refreshToken = 'valid-refresh-token';

      await service.logout(refreshToken);

      expect(authTokenService.logout).toHaveBeenCalledWith(refreshToken);
    });
  });
});
