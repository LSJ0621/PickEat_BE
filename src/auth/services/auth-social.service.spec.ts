import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
import { Not } from 'typeorm';
import { AuthSocialService } from './auth-social.service';
import { UserService } from '@/user/user.service';
import { User } from '@/user/entities/user.entity';
import { GoogleOAuthClient } from '@/external/google/clients/google-oauth.client';
import { KakaoOAuthClient } from '@/external/kakao/clients/kakao-oauth.client';
import { SocialType } from '@/user/enum/social-type.enum';
import { createMockRepository } from '../../../test/mocks/repository.mock';
import { UserFactory } from '../../../test/factories/entity.factory';
import { AuthResult } from '../interfaces/auth.interface';
import {
  createMockGoogleOAuthClient,
  createMockKakaoOAuthClient,
} from '../../../test/mocks/external-clients.mock';

describe('AuthSocialService', () => {
  let service: AuthSocialService;
  let mockUserService: jest.Mocked<UserService>;
  let mockUserRepository: ReturnType<typeof createMockRepository<User>>;
  let mockKakaoOAuthClient: ReturnType<typeof createMockKakaoOAuthClient>;
  let mockGoogleOAuthClient: ReturnType<typeof createMockGoogleOAuthClient>;

  const mockBuildAuthResult = jest.fn().mockImplementation(
    async (user: User): Promise<AuthResult> => ({
      token: 'access-token',
      refreshToken: 'refresh-token',
      email: user.email,
      address: null,
      latitude: null,
      longitude: null,
      name: user.name,
      preferences: null,
    }),
  );

  beforeEach(async () => {
    mockUserService = {
      getUserBySocialId: jest.fn(),
      createOauth: jest.fn(),
    } as any;
    mockUserRepository = createMockRepository<User>();
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
          provide: getRepositoryToken(User),
          useValue: mockUserRepository,
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

      mockUserRepository.findOne.mockResolvedValue(null);
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

      mockUserRepository.findOne.mockResolvedValue(null);
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
        id: '123456789',
        kakao_account: {
          email: undefined,
          profile: { nickname: 'Test' },
        },
      } as any);

      // Act & Assert
      await expect(
        service.kakaoLogin(code, mockBuildAuthResult),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.kakaoLogin(code, mockBuildAuthResult),
      ).rejects.toThrow('카카오 프로필에 이메일이 포함되어 있지 않습니다');
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

      mockUserRepository.findOne.mockResolvedValue(regularUser);

      // Act & Assert
      await expect(
        service.kakaoLogin(code, mockBuildAuthResult),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.kakaoLogin(code, mockBuildAuthResult),
      ).rejects.toThrow('이미 일반 회원가입으로 가입한 이메일입니다');
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

      mockUserRepository.findOne.mockResolvedValue(null);
      mockUserService.getUserBySocialId.mockResolvedValue(deletedUser);

      // Act & Assert
      try {
        await service.kakaoLogin(code, mockBuildAuthResult);
        fail('Should have thrown HttpException');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        const httpError = error as HttpException;
        expect(httpError.getStatus()).toBe(HttpStatus.BAD_REQUEST);
        const response = httpError.getResponse() as any;
        expect(response.error).toBe('RE_REGISTER_REQUIRED');
        expect(response.email).toBe(email);
      }
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

      mockUserRepository.findOne.mockResolvedValue(null);
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

      mockUserRepository.findOne.mockResolvedValue(null);
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

      mockUserRepository.findOne.mockResolvedValue(null);
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
      } as any);

      // Act & Assert
      await expect(
        service.googleLogin(code, mockBuildAuthResult),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.googleLogin(code, mockBuildAuthResult),
      ).rejects.toThrow('구글 프로필에 이메일이 포함되어 있지 않습니다');
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

      mockUserRepository.findOne.mockResolvedValue(regularUser);

      // Act & Assert
      await expect(
        service.googleLogin(code, mockBuildAuthResult),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.googleLogin(code, mockBuildAuthResult),
      ).rejects.toThrow('이미 일반 회원가입으로 가입한 이메일입니다');
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

      mockUserRepository.findOne.mockResolvedValue(null);
      mockUserService.getUserBySocialId.mockResolvedValue(deletedUser);

      // Act & Assert
      try {
        await service.googleLogin(code, mockBuildAuthResult);
        fail('Should have thrown HttpException');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        const httpError = error as HttpException;
        expect(httpError.getStatus()).toBe(HttpStatus.BAD_REQUEST);
        const response = httpError.getResponse() as any;
        expect(response.error).toBe('RE_REGISTER_REQUIRED');
        expect(response.email).toBe(email);
      }
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
        refreshToken: null,
      };

      mockUserRepository.findOne
        .mockResolvedValueOnce(deletedUser) // First call: find deleted user
        .mockResolvedValueOnce(null) // Second call: check no active regular user
        .mockResolvedValueOnce(restoredUser); // Third call: return restored user

      mockUserRepository.update.mockResolvedValue({ affected: 1 } as any);

      // Act
      const result = await service.reRegisterSocial({ email });

      // Assert
      expect(result.message).toBe('재가입이 완료되었습니다. 로그인해주세요.');
      expect(mockUserRepository.update).toHaveBeenCalledWith(
        { email },
        { refreshToken: null, deletedAt: null },
      );
    });

    it('should throw BadRequestException when no deleted account exists', async () => {
      // Arrange
      const email = 'nonexistent@kakao.com';
      mockUserRepository.findOne.mockResolvedValue(null);

      // Act & Assert
      await expect(service.reRegisterSocial({ email })).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.reRegisterSocial({ email })).rejects.toThrow(
        '재가입할 수 있는 계정이 없습니다',
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

      mockUserRepository.findOne.mockResolvedValue(activeUser);

      // Act & Assert
      await expect(service.reRegisterSocial({ email })).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.reRegisterSocial({ email })).rejects.toThrow(
        '재가입할 수 있는 계정이 없습니다',
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
      mockUserRepository.findOne
        .mockResolvedValueOnce(deletedSocialUser) // First call: where { email, socialId: Not(null) }, withDeleted: true
        .mockResolvedValueOnce(activeRegularUser) // Second call: where { email, password: Not(null) }
        .mockResolvedValueOnce(deletedSocialUser) // Third call (for second expect)
        .mockResolvedValueOnce(activeRegularUser); // Fourth call (for second expect)

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

      mockUserRepository.findOne
        .mockResolvedValueOnce(deletedUser) // First call: find deleted user with socialId
        .mockResolvedValueOnce(null) // Second call: no active regular user
        .mockResolvedValueOnce(null) // Third call: user not found after update
        .mockResolvedValueOnce(deletedUser) // Fourth call (for second expect)
        .mockResolvedValueOnce(null) // Fifth call (for second expect)
        .mockResolvedValueOnce(null); // Sixth call (for second expect)

      mockUserRepository.update.mockResolvedValue({ affected: 1 } as any);

      // Act & Assert
      await expect(service.reRegisterSocial({ email })).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.reRegisterSocial({ email })).rejects.toThrow(
        '재가입 처리 중 오류가 발생했습니다',
      );
    });
  });
});
