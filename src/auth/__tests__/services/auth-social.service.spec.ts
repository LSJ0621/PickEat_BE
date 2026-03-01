import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
import { AuthSocialService } from '../../services/auth-social.service';
import { UserService } from '@/user/user.service';
import { User } from '@/user/entities/user.entity';
import { GoogleOAuthClient } from '@/external/google/clients/google-oauth.client';
import { GoogleUserProfile } from '@/external/google/google.types';
import { KakaoOAuthClient } from '@/external/kakao/clients/kakao-oauth.client';
import { KakaoUserProfile } from '@/external/kakao/kakao.types';
import { SocialType } from '@/user/enum/social-type.enum';
import { UserFactory } from '../../../../test/factories/entity.factory';
import { AuthResult } from '../../interfaces/auth.interface';
import {
  createMockGoogleOAuthClient,
  createMockKakaoOAuthClient,
} from '../../../../test/mocks/external-clients.mock';
import { MessageCode } from '@/common/constants/message-codes';
import { ErrorCode } from '@/common/constants/error-codes';

describe('AuthSocialService', () => {
  let service: AuthSocialService;
  let mockUserService: jest.Mocked<
    Pick<
      UserService,
      | 'getUserBySocialId'
      | 'createOauth'
      | 'findByEmailWithPassword'
      | 'findBySocialEmailWithDeleted'
      | 'restoreSocialUser'
      | 'findByEmail'
    >
  >;
  let mockKakaoOAuthClient: ReturnType<typeof createMockKakaoOAuthClient>;
  let mockGoogleOAuthClient: ReturnType<typeof createMockGoogleOAuthClient>;

  const mockBuildAuthResult = jest.fn().mockImplementation(
    (user: User): Promise<AuthResult> =>
      Promise.resolve({
        token: 'access-token',
        refreshToken: 'refresh-token',
        email: user.email,
        address: null,
        latitude: null,
        longitude: null,
        name: user.name,
        preferences: null,
        birthDate: null,
        gender: null,
        preferredLanguage: 'ko',
      }),
  );

  beforeEach(async () => {
    mockUserService = {
      getUserBySocialId: jest.fn(),
      createOauth: jest.fn(),
      findByEmailWithPassword: jest.fn(),
      findBySocialEmailWithDeleted: jest.fn(),
      restoreSocialUser: jest.fn().mockResolvedValue(undefined),
      findByEmail: jest.fn(),
    } as jest.Mocked<
      Pick<
        UserService,
        | 'getUserBySocialId'
        | 'createOauth'
        | 'findByEmailWithPassword'
        | 'findBySocialEmailWithDeleted'
        | 'restoreSocialUser'
        | 'findByEmail'
      >
    >;
    mockKakaoOAuthClient = createMockKakaoOAuthClient();
    mockGoogleOAuthClient = createMockGoogleOAuthClient();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthSocialService,
        {
          provide: UserService,
          useValue: mockUserService,
        },
        {
          provide: KakaoOAuthClient,
          useValue: mockKakaoOAuthClient,
        },
        {
          provide: GoogleOAuthClient,
          useValue: mockGoogleOAuthClient,
        },
      ],
    }).compile();

    service = module.get<AuthSocialService>(AuthSocialService);
    mockBuildAuthResult.mockClear();
  });

  describe('kakaoLogin', () => {
    it('should login with Kakao when user exists', async () => {
      // Arrange
      const code = 'kakao-auth-code';
      const kakaoId = '123456789';
      const email = 'test@kakao.com';
      const user = UserFactory.createWithSocial(
        email,
        kakaoId,
        SocialType.KAKAO,
      );

      mockKakaoOAuthClient.getAccessToken.mockResolvedValue({
        access_token: 'kakao-access-token',
        token_type: 'bearer',
        refresh_token: 'kakao-refresh-token',
        expires_in: 21599,
        scope: 'account_email',
        refresh_token_expires_in: 5183999,
      });

      mockKakaoOAuthClient.getUserProfile.mockResolvedValue({
        id: kakaoId,
        kakao_account: {
          email,
          profile: { nickname: 'Test User' },
        },
      });

      mockUserService.findByEmailWithPassword.mockResolvedValue(null);
      mockUserService.getUserBySocialId.mockResolvedValue(user);

      // Act
      const result = await service.kakaoLogin(code, mockBuildAuthResult);

      // Assert
      expect(result).toBeDefined();
      expect(mockBuildAuthResult).toHaveBeenCalledWith(user);
      expect(mockKakaoOAuthClient.getAccessToken).toHaveBeenCalledWith(code);
      expect(mockKakaoOAuthClient.getUserProfile).toHaveBeenCalledWith(
        'kakao-access-token',
      );
    });

    it('should create new user when Kakao user does not exist', async () => {
      // Arrange
      const code = 'kakao-auth-code';
      const kakaoId = '123456789';
      const email = 'newuser@kakao.com';
      const newUser = UserFactory.createWithSocial(
        email,
        kakaoId,
        SocialType.KAKAO,
      );

      mockKakaoOAuthClient.getAccessToken.mockResolvedValue({
        access_token: 'kakao-access-token',
        token_type: 'bearer',
        refresh_token: 'kakao-refresh-token',
        expires_in: 21599,
        scope: 'account_email',
        refresh_token_expires_in: 5183999,
      });

      mockKakaoOAuthClient.getUserProfile.mockResolvedValue({
        id: kakaoId,
        kakao_account: {
          email,
          profile: { nickname: 'New User' },
        },
      });

      mockUserService.findByEmailWithPassword.mockResolvedValue(null);
      mockUserService.getUserBySocialId.mockResolvedValue(null);
      mockUserService.createOauth.mockResolvedValue(newUser);

      // Act
      const result = await service.kakaoLogin(code, mockBuildAuthResult);

      // Assert
      expect(result).toBeDefined();
      expect(mockUserService.createOauth).toHaveBeenCalledWith(
        kakaoId,
        email,
        SocialType.KAKAO,
        undefined,
        undefined,
      );
      expect(mockBuildAuthResult).toHaveBeenCalledWith(newUser);
    });

    it('should throw BadRequestException when Kakao profile has no email', async () => {
      // Arrange
      const code = 'kakao-auth-code';

      mockKakaoOAuthClient.getAccessToken.mockResolvedValue({
        access_token: 'kakao-access-token',
        token_type: 'bearer',
        refresh_token: 'kakao-refresh-token',
        expires_in: 21599,
        scope: 'account_email',
        refresh_token_expires_in: 5183999,
      });

      mockKakaoOAuthClient.getUserProfile.mockResolvedValue({
        id: 123456789,
        kakao_account: {
          email: undefined,
          profile: { nickname: 'Test' },
        },
      } as KakaoUserProfile);

      // Act & Assert
      await expect(
        service.kakaoLogin(code, mockBuildAuthResult),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.kakaoLogin(code, mockBuildAuthResult),
      ).rejects.toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            errorCode: ErrorCode.AUTH_EMAIL_NOT_REGISTERED,
          }),
        }),
      );
    });

    it('should throw BadRequestException when email is already used for regular signup', async () => {
      // Arrange
      const code = 'kakao-auth-code';
      const email = 'existing@example.com';
      const regularUser = UserFactory.createWithPassword(email);

      mockKakaoOAuthClient.getAccessToken.mockResolvedValue({
        access_token: 'kakao-access-token',
        token_type: 'bearer',
        refresh_token: 'kakao-refresh-token',
        expires_in: 21599,
        scope: 'account_email',
        refresh_token_expires_in: 5183999,
      });

      mockKakaoOAuthClient.getUserProfile.mockResolvedValue({
        id: '123456789',
        kakao_account: {
          email,
          profile: { nickname: 'Test' },
        },
      });

      mockUserService.findByEmailWithPassword.mockResolvedValue(regularUser);

      // Act & Assert
      await expect(
        service.kakaoLogin(code, mockBuildAuthResult),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.kakaoLogin(code, mockBuildAuthResult),
      ).rejects.toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            errorCode: ErrorCode.AUTH_EMAIL_ALREADY_REGISTERED,
          }),
        }),
      );
    });

    it('should throw RE_REGISTER_REQUIRED when user is deleted', async () => {
      // Arrange
      const code = 'kakao-auth-code';
      const kakaoId = '123456789';
      const email = 'deleted@kakao.com';
      const deletedUser = UserFactory.createWithSocial(
        email,
        kakaoId,
        SocialType.KAKAO,
      );
      deletedUser.deletedAt = new Date();

      mockKakaoOAuthClient.getAccessToken.mockResolvedValue({
        access_token: 'kakao-access-token',
        token_type: 'bearer',
        refresh_token: 'kakao-refresh-token',
        expires_in: 21599,
        scope: 'account_email',
        refresh_token_expires_in: 5183999,
      });

      mockKakaoOAuthClient.getUserProfile.mockResolvedValue({
        id: kakaoId,
        kakao_account: {
          email,
          profile: { nickname: 'Deleted User' },
        },
      });

      mockUserService.findByEmailWithPassword.mockResolvedValue(null);
      mockUserService.getUserBySocialId.mockResolvedValue(deletedUser);

      // Act & Assert
      try {
        await service.kakaoLogin(code, mockBuildAuthResult);
        fail('Should have thrown HttpException');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        const httpError = error as HttpException;
        expect(httpError.getStatus()).toBe(HttpStatus.BAD_REQUEST);
        const response = httpError.getResponse() as {
          error: string;
          email: string;
        };
        expect(response.error).toBe('AUTH_RE_REGISTER_REQUIRED');
        expect(response.email).toBe(email);
      }
    });

    it('should throw FORBIDDEN exception when user is deactivated', async () => {
      // Arrange
      const code = 'kakao-auth-code';
      const kakaoId = '123456789';
      const email = 'deactivated@kakao.com';
      const deactivatedUser = UserFactory.createWithSocial(
        email,
        kakaoId,
        SocialType.KAKAO,
      );
      deactivatedUser.isDeactivated = true;
      deactivatedUser.deactivatedAt = new Date();

      mockKakaoOAuthClient.getAccessToken.mockResolvedValue({
        access_token: 'kakao-access-token',
        token_type: 'bearer',
        refresh_token: 'kakao-refresh-token',
        expires_in: 21599,
        scope: 'account_email',
        refresh_token_expires_in: 5183999,
      });

      mockKakaoOAuthClient.getUserProfile.mockResolvedValue({
        id: kakaoId,
        kakao_account: {
          email,
          profile: { nickname: 'Deactivated User' },
        },
      });

      mockUserService.findByEmailWithPassword.mockResolvedValue(null);
      mockUserService.getUserBySocialId.mockResolvedValue(deactivatedUser);

      // Act & Assert
      await expect(
        service.kakaoLogin(code, mockBuildAuthResult),
      ).rejects.toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            errorCode: ErrorCode.AUTH_ACCOUNT_DEACTIVATED,
          }),
        }),
      );
    });
  });

  describe('kakaoLoginWithToken', () => {
    it('should login with Kakao access token', async () => {
      // Arrange
      const accessToken = 'kakao-access-token';
      const kakaoId = '123456789';
      const email = 'test@kakao.com';
      const user = UserFactory.createWithSocial(
        email,
        kakaoId,
        SocialType.KAKAO,
      );

      mockKakaoOAuthClient.getUserProfile.mockResolvedValue({
        id: kakaoId,
        kakao_account: {
          email,
          profile: { nickname: 'Test User' },
        },
      });

      mockUserService.findByEmailWithPassword.mockResolvedValue(null);
      mockUserService.getUserBySocialId.mockResolvedValue(user);

      // Act
      const result = await service.kakaoLoginWithToken(
        accessToken,
        mockBuildAuthResult,
      );

      // Assert
      expect(result).toBeDefined();
      expect(mockBuildAuthResult).toHaveBeenCalledWith(user);
      expect(mockKakaoOAuthClient.getUserProfile).toHaveBeenCalledWith(
        accessToken,
      );
      expect(mockKakaoOAuthClient.getAccessToken).not.toHaveBeenCalled();
    });
  });

  describe('googleLogin', () => {
    it('should login with Google when user exists', async () => {
      // Arrange
      const code = 'google-auth-code';
      const googleId = 'google-sub-123';
      const email = 'test@gmail.com';
      const user = UserFactory.createWithSocial(
        email,
        googleId,
        SocialType.GOOGLE,
      );

      mockGoogleOAuthClient.getAccessToken.mockResolvedValue({
        access_token: 'google-access-token',
        expires_in: 3599,
        token_type: 'Bearer',
        scope: 'openid email profile',
        id_token: 'google-id-token',
      });

      mockGoogleOAuthClient.getUserProfile.mockResolvedValue({
        sub: googleId,
        email,
        email_verified: true,
        name: 'Test User',
        picture: 'https://example.com/photo.jpg',
        given_name: 'Test',
        family_name: 'User',
      });

      mockUserService.findByEmailWithPassword.mockResolvedValue(null);
      mockUserService.getUserBySocialId.mockResolvedValue(user);

      // Act
      const result = await service.googleLogin(code, mockBuildAuthResult);

      // Assert
      expect(result).toBeDefined();
      expect(mockBuildAuthResult).toHaveBeenCalledWith(user);
      expect(mockGoogleOAuthClient.getAccessToken).toHaveBeenCalledWith(code);
      expect(mockGoogleOAuthClient.getUserProfile).toHaveBeenCalledWith(
        'google-access-token',
      );
    });

    it('should create new user with name when Google user does not exist', async () => {
      // Arrange
      const code = 'google-auth-code';
      const googleId = 'google-sub-123';
      const email = 'newuser@gmail.com';
      const name = 'New Google User';
      const newUser = UserFactory.createWithSocial(
        email,
        googleId,
        SocialType.GOOGLE,
      );
      newUser.name = name;

      mockGoogleOAuthClient.getAccessToken.mockResolvedValue({
        access_token: 'google-access-token',
        expires_in: 3599,
        token_type: 'Bearer',
        scope: 'openid email profile',
        id_token: 'google-id-token',
      });

      mockGoogleOAuthClient.getUserProfile.mockResolvedValue({
        sub: googleId,
        email,
        email_verified: true,
        name,
        picture: 'https://example.com/photo.jpg',
        given_name: 'New',
        family_name: 'User',
      });

      mockUserService.findByEmailWithPassword.mockResolvedValue(null);
      mockUserService.getUserBySocialId.mockResolvedValue(null);
      mockUserService.createOauth.mockResolvedValue(newUser);

      // Act
      const result = await service.googleLogin(code, mockBuildAuthResult);

      // Assert
      expect(result).toBeDefined();
      expect(mockUserService.createOauth).toHaveBeenCalledWith(
        googleId,
        email,
        SocialType.GOOGLE,
        name,
        undefined,
      );
      expect(mockBuildAuthResult).toHaveBeenCalledWith(newUser);
    });

    it('should throw BadRequestException when Google profile has no email', async () => {
      // Arrange
      const code = 'google-auth-code';

      mockGoogleOAuthClient.getAccessToken.mockResolvedValue({
        access_token: 'google-access-token',
        expires_in: 3599,
        token_type: 'Bearer',
        scope: 'openid email profile',
        id_token: 'google-id-token',
      });

      mockGoogleOAuthClient.getUserProfile.mockResolvedValue({
        sub: 'google-sub-123',
        email: undefined,
        email_verified: true,
        name: 'Test',
      } as GoogleUserProfile);

      // Act & Assert
      await expect(
        service.googleLogin(code, mockBuildAuthResult),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.googleLogin(code, mockBuildAuthResult),
      ).rejects.toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            errorCode: ErrorCode.AUTH_EMAIL_NOT_REGISTERED,
          }),
        }),
      );
    });

    it('should throw BadRequestException when email is already used for regular signup', async () => {
      // Arrange
      const code = 'google-auth-code';
      const email = 'existing@example.com';
      const regularUser = UserFactory.createWithPassword(email);

      mockGoogleOAuthClient.getAccessToken.mockResolvedValue({
        access_token: 'google-access-token',
        expires_in: 3599,
        token_type: 'Bearer',
        scope: 'openid email profile',
        id_token: 'google-id-token',
      });

      mockGoogleOAuthClient.getUserProfile.mockResolvedValue({
        sub: 'google-sub-123',
        email,
        email_verified: true,
        name: 'Test',
      });

      mockUserService.findByEmailWithPassword.mockResolvedValue(regularUser);

      // Act & Assert
      await expect(
        service.googleLogin(code, mockBuildAuthResult),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.googleLogin(code, mockBuildAuthResult),
      ).rejects.toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            errorCode: ErrorCode.AUTH_EMAIL_ALREADY_REGISTERED,
          }),
        }),
      );
    });

    it('should throw RE_REGISTER_REQUIRED when Google user is deleted', async () => {
      // Arrange
      const code = 'google-auth-code';
      const googleId = 'google-sub-123';
      const email = 'deleted@gmail.com';
      const deletedUser = UserFactory.createWithSocial(
        email,
        googleId,
        SocialType.GOOGLE,
      );
      deletedUser.deletedAt = new Date();

      mockGoogleOAuthClient.getAccessToken.mockResolvedValue({
        access_token: 'google-access-token',
        expires_in: 3599,
        token_type: 'Bearer',
        scope: 'openid email profile',
        id_token: 'google-id-token',
      });

      mockGoogleOAuthClient.getUserProfile.mockResolvedValue({
        sub: googleId,
        email,
        email_verified: true,
        name: 'Deleted User',
      });

      mockUserService.findByEmailWithPassword.mockResolvedValue(null);
      mockUserService.getUserBySocialId.mockResolvedValue(deletedUser);

      // Act & Assert
      try {
        await service.googleLogin(code, mockBuildAuthResult);
        fail('Should have thrown HttpException');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        const httpError = error as HttpException;
        expect(httpError.getStatus()).toBe(HttpStatus.BAD_REQUEST);
        const response = httpError.getResponse() as {
          error: string;
          email: string;
        };
        expect(response.error).toBe('AUTH_RE_REGISTER_REQUIRED');
        expect(response.email).toBe(email);
      }
    });

    it('should throw FORBIDDEN exception when Google user is deactivated', async () => {
      // Arrange
      const code = 'google-auth-code';
      const googleId = 'google-sub-123';
      const email = 'deactivated@gmail.com';
      const deactivatedUser = UserFactory.createWithSocial(
        email,
        googleId,
        SocialType.GOOGLE,
      );
      deactivatedUser.isDeactivated = true;
      deactivatedUser.deactivatedAt = new Date();

      mockGoogleOAuthClient.getAccessToken.mockResolvedValue({
        access_token: 'google-access-token',
        expires_in: 3599,
        token_type: 'Bearer',
        scope: 'openid email profile',
        id_token: 'google-id-token',
      });

      mockGoogleOAuthClient.getUserProfile.mockResolvedValue({
        sub: googleId,
        email,
        email_verified: true,
        name: 'Deactivated User',
      });

      mockUserService.findByEmailWithPassword.mockResolvedValue(null);
      mockUserService.getUserBySocialId.mockResolvedValue(deactivatedUser);

      // Act & Assert
      await expect(
        service.googleLogin(code, mockBuildAuthResult),
      ).rejects.toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            errorCode: ErrorCode.AUTH_ACCOUNT_DEACTIVATED,
          }),
        }),
      );
    });
  });

  describe('reRegisterSocial', () => {
    it('should re-register deleted social user successfully', async () => {
      // Arrange
      const email = 'deleted@kakao.com';
      const deletedUser = UserFactory.createWithSocial(
        email,
        'kakao-123',
        SocialType.KAKAO,
      );
      deletedUser.deletedAt = new Date();

      const restoredUser = {
        ...deletedUser,
        deletedAt: null,
      };

      mockUserService.findBySocialEmailWithDeleted.mockResolvedValue(
        deletedUser,
      );
      mockUserService.findByEmailWithPassword.mockResolvedValue(null);
      mockUserService.restoreSocialUser.mockResolvedValue(undefined);
      mockUserService.findByEmail.mockResolvedValue(restoredUser as User);

      // Act
      const result = await service.reRegisterSocial({ email });

      // Assert
      expect(result.messageCode).toBe(
        MessageCode.AUTH_RE_REGISTRATION_COMPLETED,
      );
      expect(mockUserService.restoreSocialUser).toHaveBeenCalledWith(email);
    });

    it('should throw BadRequestException when no deleted account exists', async () => {
      // Arrange
      const email = 'nonexistent@kakao.com';
      mockUserService.findBySocialEmailWithDeleted.mockResolvedValue(null);

      // Act & Assert
      await expect(service.reRegisterSocial({ email })).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.reRegisterSocial({ email })).rejects.toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            errorCode: ErrorCode.AUTH_NO_REREGISTER_ACCOUNT,
          }),
        }),
      );
    });

    it('should throw BadRequestException when account is not deleted', async () => {
      // Arrange
      const email = 'active@kakao.com';
      const activeUser = UserFactory.createWithSocial(
        email,
        'kakao-123',
        SocialType.KAKAO,
      );
      activeUser.deletedAt = null;

      mockUserService.findBySocialEmailWithDeleted.mockResolvedValue(
        activeUser,
      );

      // Act & Assert
      await expect(service.reRegisterSocial({ email })).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.reRegisterSocial({ email })).rejects.toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            errorCode: ErrorCode.AUTH_NO_REREGISTER_ACCOUNT,
          }),
        }),
      );
    });

    it('should throw BadRequestException when email is used for regular signup', async () => {
      // Arrange
      const email = 'conflict@example.com';
      const deletedSocialUser = UserFactory.createWithSocial(
        email,
        'kakao-123',
        SocialType.KAKAO,
      );
      deletedSocialUser.deletedAt = new Date();
      deletedSocialUser.socialId = 'kakao-123'; // Ensure socialId is set
      const activeRegularUser = UserFactory.createWithPassword(email);

      // Set up mocks for the expected call sequence
      mockUserService.findBySocialEmailWithDeleted
        .mockResolvedValueOnce(deletedSocialUser) // First call (first expect)
        .mockResolvedValueOnce(deletedSocialUser); // Second call (second expect)
      mockUserService.findByEmailWithPassword
        .mockResolvedValueOnce(activeRegularUser) // First call (first expect)
        .mockResolvedValueOnce(activeRegularUser); // Second call (second expect)

      // Act & Assert
      await expect(service.reRegisterSocial({ email })).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.reRegisterSocial({ email })).rejects.toThrow(
        '이미 일반 회원가입으로 가입한 이메일입니다',
      );
    });

    it('should throw BadRequestException when user restore fails', async () => {
      // Arrange
      const email = 'deleted@kakao.com';
      const deletedUser = UserFactory.createWithSocial(
        email,
        'kakao-123',
        SocialType.KAKAO,
      );
      deletedUser.deletedAt = new Date();
      deletedUser.socialId = 'kakao-123'; // Ensure socialId is set

      mockUserService.findBySocialEmailWithDeleted
        .mockResolvedValueOnce(deletedUser) // First expect: first call
        .mockResolvedValueOnce(deletedUser); // Second expect: first call
      mockUserService.findByEmailWithPassword
        .mockResolvedValueOnce(null) // First expect: no active regular user
        .mockResolvedValueOnce(null); // Second expect: no active regular user
      mockUserService.restoreSocialUser.mockResolvedValue(undefined);
      mockUserService.findByEmail
        .mockResolvedValueOnce(null) // First expect: user not found after update
        .mockResolvedValueOnce(null); // Second expect: user not found after update

      // Act & Assert
      await expect(service.reRegisterSocial({ email })).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.reRegisterSocial({ email })).rejects.toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            errorCode: ErrorCode.AUTH_RE_REGISTER_ERROR,
          }),
        }),
      );
    });
  });
});
