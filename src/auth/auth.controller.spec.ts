import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Response } from 'express';
import { Repository } from 'typeorm';
import { User } from '../user/entities/user.entity';
import { UserService } from '../user/user.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { EmailPurpose } from './dto/send-email-code.dto';
import { EmailVerificationService } from './services/email-verification.service';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: jest.Mocked<AuthService>;
  let emailVerificationService: jest.Mocked<EmailVerificationService>;
  let userService: jest.Mocked<UserService>;
  let userRepository: jest.Mocked<Repository<User>>;

  const mockAuthResult = {
    email: 'test@example.com',
    token: 'access-token',
    refreshToken: 'refresh-token',
    name: 'Test User',
    address: null,
    latitude: null,
    longitude: null,
    preferences: null,
  };

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
    const mockAuthService = {
      kakaoLogin: jest.fn(),
      kakaoLoginWithToken: jest.fn(),
      googleLogin: jest.fn(),
      register: jest.fn(),
      login: jest.fn(),
      buildAuthResult: jest.fn(),
      checkEmail: jest.fn(),
      sendResetPasswordCode: jest.fn(),
      verifyResetPasswordCode: jest.fn(),
      resetPassword: jest.fn(),
      getUserProfile: jest.fn(),
      refreshAccessToken: jest.fn(),
      logout: jest.fn(),
      reRegister: jest.fn(),
      reRegisterSocial: jest.fn(),
    };

    const mockEmailVerificationService = {
      sendCode: jest.fn(),
      verifyCode: jest.fn(),
      isEmailVerified: jest.fn(),
      expireVerification: jest.fn(),
      clearVerification: jest.fn(),
    };

    const mockUserService = {
      findByEmail: jest.fn(),
      markEmailVerified: jest.fn(),
    };

    const mockUserRepository = {
      findOne: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
        {
          provide: EmailVerificationService,
          useValue: mockEmailVerificationService,
        },
        {
          provide: UserService,
          useValue: mockUserService,
        },
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepository,
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    authService = module.get(AuthService);
    emailVerificationService = module.get(EmailVerificationService);
    userService = module.get(UserService);
    userRepository = module.get(getRepositoryToken(User));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('kakaoLogin', () => {
    it('should return auth result without refreshToken', async () => {
      const redirectDto = { code: 'kakao-code' };
      const mockResponse = {
        cookie: jest.fn(),
      } as unknown as Response;

      authService.kakaoLogin.mockResolvedValue(mockAuthResult);

      const result = await controller.kakaoLogin(redirectDto, mockResponse);

      expect(authService.kakaoLogin).toHaveBeenCalledWith('kakao-code');
      expect(mockResponse.cookie).toHaveBeenCalledWith(
        'refreshToken',
        mockAuthResult.refreshToken,
        expect.objectContaining({
          httpOnly: true,
          sameSite: 'strict',
        }),
      );
      expect(result).not.toHaveProperty('refreshToken');
      expect(result).toMatchObject({
        email: mockAuthResult.email,
        token: mockAuthResult.token,
      });
    });
  });

  describe('kakaoAppLogin', () => {
    it('should return auth result for app login', async () => {
      const appKakaoLoginDto = { accessToken: 'kakao-access-token' };
      const mockResponse = {
        cookie: jest.fn(),
      } as unknown as Response;

      authService.kakaoLoginWithToken.mockResolvedValue(mockAuthResult);

      const result = await controller.kakaoAppLogin(
        appKakaoLoginDto,
        mockResponse,
      );

      expect(authService.kakaoLoginWithToken).toHaveBeenCalledWith(
        'kakao-access-token',
      );
      expect(mockResponse.cookie).toHaveBeenCalled();
      expect(result).not.toHaveProperty('refreshToken');
    });
  });

  describe('googleLogin', () => {
    it('should return auth result for Google login', async () => {
      const redirectDto = { code: 'google-code' };
      const mockResponse = {
        cookie: jest.fn(),
      } as unknown as Response;

      authService.googleLogin.mockResolvedValue(mockAuthResult);

      const result = await controller.googleLogin(redirectDto, mockResponse);

      expect(authService.googleLogin).toHaveBeenCalledWith('google-code');
      expect(mockResponse.cookie).toHaveBeenCalled();
      expect(result).not.toHaveProperty('refreshToken');
    });
  });

  describe('register', () => {
    it('should register a new user', async () => {
      const registerDto = {
        email: 'newuser@example.com',
        password: 'password123',
        name: 'New User',
      };
      const expectedResult = { message: '회원가입이 완료되었습니다.' };

      authService.register.mockResolvedValue(expectedResult);

      const result = await controller.register(registerDto);

      expect(authService.register).toHaveBeenCalledWith(registerDto);
      expect(result).toEqual(expectedResult);
    });
  });

  describe('login', () => {
    it('should login user and set refresh token cookie', async () => {
      const mockResponse = {
        cookie: jest.fn(),
      } as unknown as Response;

      authService.buildAuthResult.mockResolvedValue(mockAuthResult);

      const result = await controller.login(mockUser, mockResponse);

      expect(authService.buildAuthResult).toHaveBeenCalledWith(mockUser);
      expect(mockResponse.cookie).toHaveBeenCalledWith(
        'refreshToken',
        mockAuthResult.refreshToken,
        expect.any(Object),
      );
      expect(result).not.toHaveProperty('refreshToken');
    });
  });

  describe('checkEmail', () => {
    it('should check if email is available', async () => {
      const checkEmailDto = { email: 'test@example.com' };
      const expectedResult = {
        available: true,
        message: '사용 가능한 이메일입니다.',
      };

      authService.checkEmail.mockResolvedValue(expectedResult);

      const result = await controller.checkEmail(checkEmailDto);

      expect(authService.checkEmail).toHaveBeenCalledWith(checkEmailDto.email);
      expect(result).toEqual(expectedResult);
    });
  });

  describe('sendEmailCode', () => {
    it('should send email verification code', async () => {
      const sendEmailCodeDto = {
        email: 'test@example.com',
        purpose: EmailPurpose.SIGNUP,
      };
      const expectedResult = {
        remainCount: 4,
        message: '인증번호가 발송되었습니다. 남은 재발송 횟수는 4회입니다.',
      };

      emailVerificationService.sendCode.mockResolvedValue(expectedResult);

      const result = await controller.sendEmailCode(sendEmailCodeDto);

      expect(emailVerificationService.sendCode).toHaveBeenCalledWith(
        sendEmailCodeDto.email,
        sendEmailCodeDto.purpose,
      );
      expect(result).toEqual({ success: true, ...expectedResult });
    });
  });

  describe('verifyEmailCode', () => {
    it('should verify email code successfully', async () => {
      const verifyEmailCodeDto = {
        email: 'test@example.com',
        code: '123456',
        purpose: EmailPurpose.SIGNUP,
      };

      emailVerificationService.verifyCode.mockResolvedValue(true);
      userService.findByEmail.mockResolvedValue(mockUser);

      const result = await controller.verifyEmailCode(verifyEmailCodeDto);

      expect(emailVerificationService.verifyCode).toHaveBeenCalledWith(
        verifyEmailCodeDto.email,
        verifyEmailCodeDto.code,
        verifyEmailCodeDto.purpose,
      );
      expect(result).toEqual({
        success: true,
        message: '이메일 인증이 완료되었습니다.',
      });
    });

    it('should handle re-register verification', async () => {
      const deletedUser = { ...mockUser, deletedAt: new Date() };
      const verifyEmailCodeDto = {
        email: 'deleted@example.com',
        code: '123456',
        purpose: EmailPurpose.RE_REGISTER,
      };

      userRepository.findOne.mockResolvedValue(deletedUser);
      emailVerificationService.verifyCode.mockResolvedValue(true);

      const result = await controller.verifyEmailCode(verifyEmailCodeDto);

      expect(userRepository.findOne).toHaveBeenCalledWith({
        where: { email: verifyEmailCodeDto.email },
        withDeleted: true,
      });
      expect(result.success).toBe(true);
    });

    it('should throw if re-register without deleted account', async () => {
      const verifyEmailCodeDto = {
        email: 'active@example.com',
        code: '123456',
        purpose: EmailPurpose.RE_REGISTER,
      };

      userRepository.findOne.mockResolvedValue(mockUser);

      await expect(
        controller.verifyEmailCode(verifyEmailCodeDto),
      ).rejects.toThrow('재가입할 수 있는 계정이 없습니다.');
    });
  });

  describe('sendResetPasswordCode', () => {
    it('should send reset password code', async () => {
      const sendResetPasswordCodeDto = { email: 'test@example.com' };
      const expectedResult = {
        remainCount: 4,
        message: '인증번호가 발송되었습니다. 남은 재발송 횟수는 4회입니다.',
      };

      authService.sendResetPasswordCode.mockResolvedValue(expectedResult);

      const result = await controller.sendResetPasswordCode(
        sendResetPasswordCodeDto,
      );

      expect(authService.sendResetPasswordCode).toHaveBeenCalledWith(
        sendResetPasswordCodeDto.email,
      );
      expect(result).toEqual({ success: true, ...expectedResult });
    });
  });

  describe('verifyResetPasswordCode', () => {
    it('should verify reset password code', async () => {
      const verifyResetPasswordCodeDto = {
        email: 'test@example.com',
        code: '123456',
      };

      authService.verifyResetPasswordCode.mockResolvedValue(undefined);

      const result = await controller.verifyResetPasswordCode(
        verifyResetPasswordCodeDto,
      );

      expect(authService.verifyResetPasswordCode).toHaveBeenCalledWith(
        verifyResetPasswordCodeDto.email,
        verifyResetPasswordCodeDto.code,
      );
      expect(result).toEqual({ success: true });
    });
  });

  describe('resetPassword', () => {
    it('should reset password successfully', async () => {
      const resetPasswordDto = {
        email: 'test@example.com',
        newPassword: 'newpassword123',
      };

      authService.resetPassword.mockResolvedValue(undefined);

      const result = await controller.resetPassword(resetPasswordDto);

      expect(authService.resetPassword).toHaveBeenCalledWith(resetPasswordDto);
      expect(result).toEqual({
        success: true,
        message: '비밀번호가 성공적으로 변경되었습니다.',
      });
    });
  });

  describe('getProfile', () => {
    it('should return user profile', async () => {
      const authUserPayload = {
        email: 'test@example.com',
        role: 'USER',
      };
      const expectedProfile = {
        email: 'test@example.com',
        name: 'Test User',
        address: null,
        latitude: null,
        longitude: null,
      };

      authService.getUserProfile.mockResolvedValue(expectedProfile);

      const result = await controller.getProfile(authUserPayload as any);

      expect(authService.getUserProfile).toHaveBeenCalledWith(
        authUserPayload.email,
      );
      expect(result).toEqual(expectedProfile);
    });
  });

  describe('refreshToken', () => {
    it('should refresh access token', async () => {
      const mockRequest = {
        cookies: { refreshToken: 'old-refresh-token' },
      } as any;
      const mockResponse = {
        cookie: jest.fn(),
      } as unknown as Response;
      const expectedTokens = {
        token: 'new-access-token',
        refreshToken: 'new-refresh-token',
      };

      authService.refreshAccessToken.mockResolvedValue(expectedTokens);

      const result = await controller.refreshToken(mockRequest, mockResponse);

      expect(authService.refreshAccessToken).toHaveBeenCalledWith(
        'old-refresh-token',
      );
      expect(mockResponse.cookie).toHaveBeenCalledWith(
        'refreshToken',
        expectedTokens.refreshToken,
        expect.any(Object),
      );
      expect(result).toEqual({ token: expectedTokens.token });
    });

    it('should throw UnauthorizedException if refresh token is missing', async () => {
      const mockRequest = { cookies: {} } as any;
      const mockResponse = {} as Response;

      await expect(
        controller.refreshToken(mockRequest, mockResponse),
      ).rejects.toThrow('Refresh token cookie is missing.');
    });
  });

  describe('logout', () => {
    it('should logout user and clear refresh token cookie', async () => {
      const mockRequest = {
        cookies: { refreshToken: 'refresh-token' },
      } as any;
      const mockResponse = {
        clearCookie: jest.fn(),
      } as unknown as Response;

      authService.logout.mockResolvedValue(undefined);

      const result = await controller.logout(mockRequest, mockResponse);

      expect(authService.logout).toHaveBeenCalledWith('refresh-token');
      expect(mockResponse.clearCookie).toHaveBeenCalledWith(
        'refreshToken',
        expect.objectContaining({
          httpOnly: true,
          sameSite: 'strict',
        }),
      );
      expect(result).toEqual({ message: '로그아웃되었습니다.' });
    });
  });

  describe('reRegister', () => {
    it('should re-register deleted user', async () => {
      const reRegisterDto = {
        email: 'deleted@example.com',
        password: 'newpassword123',
        name: 'Re-registered User',
      };
      const expectedResult = {
        message: '재가입이 완료되었습니다. 로그인해주세요.',
      };

      authService.reRegister.mockResolvedValue(expectedResult);

      const result = await controller.reRegister(reRegisterDto);

      expect(authService.reRegister).toHaveBeenCalledWith(reRegisterDto);
      expect(result).toEqual(expectedResult);
    });
  });

  describe('reRegisterSocial', () => {
    it('should re-register deleted social user', async () => {
      const reRegisterSocialDto = {
        email: 'deleted@example.com',
      };
      const expectedResult = {
        message: '재가입이 완료되었습니다. 로그인해주세요.',
      };

      authService.reRegisterSocial.mockResolvedValue(expectedResult);

      const result = await controller.reRegisterSocial(reRegisterSocialDto);

      expect(authService.reRegisterSocial).toHaveBeenCalledWith(
        reRegisterSocialDto,
      );
      expect(result).toEqual(expectedResult);
    });
  });
});
