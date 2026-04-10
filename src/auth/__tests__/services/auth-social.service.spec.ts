import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, HttpException } from '@nestjs/common';
import { AuthSocialService } from '@/auth/services/auth-social.service';
import { AuthResult } from '@/auth/interfaces/auth.interface';
import { ErrorCode } from '@/common/constants/error-codes';
import { MessageCode } from '@/common/constants/message-codes';
import { KakaoOAuthClient } from '@/external/kakao/clients/kakao-oauth.client';
import { GoogleOAuthClient } from '@/external/google/clients/google-oauth.client';
import { User } from '@/user/entities/user.entity';
import { UserService } from '@/user/user.service';
import { UserFactory } from '../../../../test/factories/entity.factory';

describe('AuthSocialService', () => {
  let authSocialService: AuthSocialService;

  const mockUserService = {
    findByEmailWithPassword: jest.fn(),
    getUserBySocialId: jest.fn(),
    createOauth: jest.fn(),
    findBySocialEmailWithDeleted: jest.fn(),
    findByEmail: jest.fn(),
    restoreSocialUser: jest.fn(),
  };

  const mockKakaoClient = {
    getAccessToken: jest.fn(),
    getUserProfile: jest.fn(),
  };

  const mockGoogleClient = {
    getAccessToken: jest.fn(),
    getUserProfile: jest.fn(),
  };

  const buildMockAuthResult = (user: User): Promise<AuthResult> =>
    Promise.resolve({
      token: 'mock-token',
      email: user.email,
      name: user.name ?? null,
      address: null,
      latitude: null,
      longitude: null,
      birthDate: null,
      gender: null,
      preferredLanguage: 'ko',
      preferences: null,
    });

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthSocialService,
        { provide: UserService, useValue: mockUserService },
        { provide: KakaoOAuthClient, useValue: mockKakaoClient },
        { provide: GoogleOAuthClient, useValue: mockGoogleClient },
      ],
    }).compile();

    authSocialService = module.get<AuthSocialService>(AuthSocialService);
  });

  // =====================
  // processKakaoProfile (tested via kakaoLoginWithToken)
  // =====================
  describe('Kakao OAuth', () => {
    const mockKakaoProfile = {
      id: 123456789,
      kakao_account: {
        email: 'kakao-user@example.com',
        profile: { nickname: '카카오유저' },
      },
      properties: { nickname: '카카오유저' },
    };

    beforeEach(() => {
      mockKakaoClient.getUserProfile.mockResolvedValue(mockKakaoProfile);
    });

    it('should create a new user and return auth result when Kakao user does not exist', async () => {
      const newUser = UserFactory.createWithSocial(
        'kakao-user@example.com',
        '123456789',
        'kakao',
      );
      mockUserService.findByEmailWithPassword.mockResolvedValue(null);
      mockUserService.getUserBySocialId.mockResolvedValue(null);
      mockUserService.createOauth.mockResolvedValue(newUser);

      const result = await authSocialService.kakaoLoginWithToken(
        'test-access-token',
        buildMockAuthResult,
      );

      expect(result).toHaveProperty('token');
      expect(mockUserService.createOauth).toHaveBeenCalled();
    });

    it('should return auth result without creating user when Kakao user already exists', async () => {
      const existingUser = UserFactory.createWithSocial(
        'kakao-user@example.com',
        '123456789',
        'kakao',
      );
      mockUserService.findByEmailWithPassword.mockResolvedValue(null);
      mockUserService.getUserBySocialId.mockResolvedValue(existingUser);

      const result = await authSocialService.kakaoLoginWithToken(
        'test-access-token',
        buildMockAuthResult,
      );

      expect(result).toHaveProperty('token');
      expect(mockUserService.createOauth).not.toHaveBeenCalled();
    });

    it('should throw HttpException with AUTH_RE_REGISTER_REQUIRED when Kakao user is soft-deleted', async () => {
      const deletedUser = UserFactory.createWithSocial(
        'kakao-user@example.com',
        '123456789',
        'kakao',
      );
      deletedUser.deletedAt = new Date();
      mockUserService.findByEmailWithPassword.mockResolvedValue(null);
      mockUserService.getUserBySocialId.mockResolvedValue(deletedUser);

      await expect(
        authSocialService.kakaoLoginWithToken('test-access-token', buildMockAuthResult),
      ).rejects.toMatchObject({
        response: { error: ErrorCode.AUTH_RE_REGISTER_REQUIRED },
      });
    });
  });

  // =====================
  // processGoogleProfile (tested via googleLogin)
  // =====================
  describe('Google OAuth', () => {
    it('should create a new user and return auth result when Google user does not exist', async () => {
      const mockGoogleProfile = {
        sub: 'google-sub-123',
        email: 'google-user@example.com',
        name: '구글유저',
        email_verified: true,
      };
      const newUser = UserFactory.createWithSocial(
        'google-user@example.com',
        'google-sub-123',
        'google',
      );

      mockGoogleClient.getAccessToken.mockResolvedValue({
        access_token: 'google-access-token',
      });
      mockGoogleClient.getUserProfile.mockResolvedValue(mockGoogleProfile);
      mockUserService.findByEmailWithPassword.mockResolvedValue(null);
      mockUserService.getUserBySocialId.mockResolvedValue(null);
      mockUserService.createOauth.mockResolvedValue(newUser);

      const result = await authSocialService.googleLogin(
        'auth-code',
        buildMockAuthResult,
      );

      expect(result).toHaveProperty('token');
      expect(mockUserService.createOauth).toHaveBeenCalled();
    });

    it('should return auth result without creating user when Google user already exists', async () => {
      const mockGoogleProfile = {
        sub: 'google-sub-123',
        email: 'google-user@example.com',
        name: '구글유저',
        email_verified: true,
      };
      const existingUser = UserFactory.createWithSocial(
        'google-user@example.com',
        'google-sub-123',
        'google',
      );

      mockGoogleClient.getAccessToken.mockResolvedValue({
        access_token: 'google-access-token',
      });
      mockGoogleClient.getUserProfile.mockResolvedValue(mockGoogleProfile);
      mockUserService.findByEmailWithPassword.mockResolvedValue(null);
      mockUserService.getUserBySocialId.mockResolvedValue(existingUser);

      const result = await authSocialService.googleLogin(
        'auth-code',
        buildMockAuthResult,
      );

      expect(result).toHaveProperty('token');
      expect(mockUserService.createOauth).not.toHaveBeenCalled();
    });
  });

  // =====================
  // reRegisterSocial
  // =====================
  describe('reRegisterSocial', () => {
    it('should restore deleted social user and return success messageCode', async () => {
      const email = 'deleted-social@example.com';
      const deletedUser = UserFactory.createWithSocial(email, 'kakao-id-999', 'kakao');
      deletedUser.deletedAt = new Date();
      const restoredUser = UserFactory.createWithSocial(email, 'kakao-id-999', 'kakao');

      mockUserService.findBySocialEmailWithDeleted.mockResolvedValue(deletedUser);
      mockUserService.findByEmailWithPassword.mockResolvedValue(null);
      mockUserService.restoreSocialUser.mockResolvedValue(undefined);
      mockUserService.findByEmail.mockResolvedValue(restoredUser);

      const result = await authSocialService.reRegisterSocial({ email });

      expect(result.messageCode).toBe(MessageCode.AUTH_RE_REGISTRATION_COMPLETED);
      expect(mockUserService.restoreSocialUser).toHaveBeenCalledWith(email);
    });

    it('should throw BadRequestException when no deleted social user exists for re-registration', async () => {
      mockUserService.findBySocialEmailWithDeleted.mockResolvedValue(null);

      await expect(
        authSocialService.reRegisterSocial({ email: 'nonexistent@example.com' }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
