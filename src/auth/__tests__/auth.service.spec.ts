import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { DataSource } from 'typeorm';
import { AuthService } from '@/auth/auth.service';
import { AuthTokenService } from '@/auth/services/auth-token.service';
import { AuthSocialService } from '@/auth/services/auth-social.service';
import { AuthPasswordService } from '@/auth/services/auth-password.service';
import { EmailVerificationService } from '@/auth/services/email-verification.service';
import { AuthProfile } from '@/auth/interfaces/auth.interface';
import { RedisCacheService } from '@/common/cache/cache.service';
import { User } from '@/user/entities/user.entity';
import { UserService } from '@/user/user.service';
import { UserPreferenceService } from '@/user/services/user-preference.service';
import { UserAddressService } from '@/user/services/user-address.service';
import { createMockRepository } from '../../../test/mocks/repository.mock';
import { UserFactory } from '../../../test/factories/entity.factory';

describe('AuthService', () => {
  let authService: AuthService;
  let mockUserRepository: ReturnType<typeof createMockRepository<User>>;

  const mockUserService = {
    getAuthenticatedEntity: jest.fn(),
    getEntityDefaultAddress: jest.fn(),
    updateLoginTimestamps: jest.fn(),
    createUser: jest.fn(),
    markEmailVerified: jest.fn(),
    findByEmail: jest.fn(),
    findByIdWithSelect: jest.fn(),
  };

  const mockAuthTokenService = {
    issueTokens: jest.fn(),
    storeRefreshToken: jest.fn(),
  };

  const mockCacheService = {
    getUserProfile: jest.fn(),
    setUserProfile: jest.fn(),
  };

  const mockUserPreferenceService = {
    getPreferences: jest.fn(),
  };

  const mockUserAddressService = {
    getAddresses: jest.fn(),
  };

  beforeEach(async () => {
    mockUserRepository = createMockRepository<User>();

    jest.resetAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UserService, useValue: mockUserService },
        { provide: AuthTokenService, useValue: mockAuthTokenService },
        {
          provide: AuthSocialService,
          useValue: { kakaoLogin: jest.fn(), googleLogin: jest.fn() },
        },
        {
          provide: AuthPasswordService,
          useValue: { sendResetPasswordCode: jest.fn() },
        },
        {
          provide: EmailVerificationService,
          useValue: { isEmailVerified: jest.fn(), sendCode: jest.fn() },
        },
        { provide: RedisCacheService, useValue: mockCacheService },
        { provide: UserPreferenceService, useValue: mockUserPreferenceService },
        { provide: UserAddressService, useValue: mockUserAddressService },
        { provide: getRepositoryToken(User), useValue: mockUserRepository },
        { provide: DataSource, useValue: { transaction: jest.fn() } },
      ],
    }).compile();

    authService = module.get<AuthService>(AuthService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // =====================
  // validateUser
  // =====================
  describe('validateUser', () => {
    it('should return { user, reason: "success" } when email and password are valid', async () => {
      const user = UserFactory.createWithPassword('test@example.com', 'hashed');
      mockUserRepository.findOne.mockResolvedValue(user);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);

      const result = await authService.validateUser('test@example.com', 'password');

      expect(result.user).toBe(user);
      expect(result.reason).toBe('success');
    });

    it('should return { user: null, reason: "not_found" } when email does not exist', async () => {
      mockUserRepository.findOne.mockResolvedValue(null);

      const result = await authService.validateUser('none@example.com', 'password');

      expect(result.user).toBeNull();
      expect(result.reason).toBe('not_found');
    });

    it('should return { user: null, reason: "wrong_password" } when password does not match', async () => {
      const user = UserFactory.createWithPassword('test@example.com', 'hashed');
      mockUserRepository.findOne.mockResolvedValue(user);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(false as never);

      const result = await authService.validateUser('test@example.com', 'wrongpass');

      expect(result.user).toBeNull();
      expect(result.reason).toBe('wrong_password');
    });

    it('should return { user: null, reason: "deleted" } when user is soft-deleted', async () => {
      const deletedUser = UserFactory.create({
        email: 'deleted@example.com',
        password: 'hashed',
        deletedAt: new Date(),
      });
      mockUserRepository.findOne.mockResolvedValue(deletedUser);

      const result = await authService.validateUser('deleted@example.com', 'password');

      expect(result.user).toBeNull();
      expect(result.reason).toBe('deleted');
    });

    it('should return { user: null, reason: "deactivated" } when user account is deactivated', async () => {
      const deactivatedUser = UserFactory.create({
        email: 'deactivated@example.com',
        password: 'hashed',
      });
      deactivatedUser.isDeactivated = true;
      mockUserRepository.findOne.mockResolvedValue(deactivatedUser);

      const result = await authService.validateUser('deactivated@example.com', 'password');

      expect(result.user).toBeNull();
      expect(result.reason).toBe('deactivated');
    });

    it('should return { user: null, reason: "no_password" } when user is a social-only account', async () => {
      const socialUser = UserFactory.createWithSocial('social@example.com');
      mockUserRepository.findOne.mockResolvedValue(socialUser);

      const result = await authService.validateUser('social@example.com', 'anything');

      expect(result.user).toBeNull();
      expect(result.reason).toBe('no_password');
    });
  });

  // =====================
  // buildAuthResult
  // =====================
  describe('buildAuthResult', () => {
    it('should return AuthResult with token and profile data', async () => {
      const user = UserFactory.createWithPassword();
      const mockToken = 'mock-access-token';

      mockAuthTokenService.issueTokens.mockResolvedValue({ token: mockToken });
      mockUserService.updateLoginTimestamps.mockResolvedValue(undefined);
      mockUserService.getEntityDefaultAddress.mockResolvedValue(null);
      mockCacheService.setUserProfile.mockResolvedValue(undefined);
      mockUserPreferenceService.getPreferences.mockResolvedValue(undefined);
      mockUserAddressService.getAddresses.mockResolvedValue(undefined);

      const result = await authService.buildAuthResult(user);

      expect(result.token).toBe(mockToken);
      expect(result.email).toBe(user.email);
      expect(result).not.toHaveProperty('password');
      expect(mockAuthTokenService.issueTokens).toHaveBeenCalledWith(user);
    });
  });

  // =====================
  // getUserProfile
  // =====================
  describe('getUserProfile', () => {
    it('should return cached profile without querying DB when cache hits', async () => {
      const user = UserFactory.createWithPassword();
      const cachedProfile: AuthProfile = {
        email: user.email,
        name: user.name,
        address: null,
        latitude: null,
        longitude: null,
        birthDate: null,
        gender: null,
        preferredLanguage: 'ko',
      };

      mockUserService.getAuthenticatedEntity.mockResolvedValue(user);
      mockCacheService.getUserProfile.mockResolvedValue(cachedProfile);

      const result = await authService.getUserProfile(user.email);

      expect(result).toMatchObject({ email: user.email });
      expect(mockUserService.getEntityDefaultAddress).not.toHaveBeenCalled();
    });

    it('should query DB and save result to cache when cache misses', async () => {
      const user = UserFactory.createWithPassword();

      mockUserService.getAuthenticatedEntity.mockResolvedValue(user);
      mockCacheService.getUserProfile.mockResolvedValue(null);
      mockUserService.getEntityDefaultAddress.mockResolvedValue(null);
      mockCacheService.setUserProfile.mockResolvedValue(undefined);

      const result = await authService.getUserProfile(user.email);

      expect(result.email).toBe(user.email);
      expect(mockUserService.getEntityDefaultAddress).toHaveBeenCalledWith(user);
      expect(mockCacheService.setUserProfile).toHaveBeenCalled();
    });
  });
});
