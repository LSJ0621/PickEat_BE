import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import {
  HttpException,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthTokenService } from '../../services/auth-token.service';
import { JwtTokenProvider } from '../../provider/jwt-token.provider';
import { UserService } from '@/user/user.service';
import { RedisCacheService } from '@/common/cache/cache.service';
import { UserFactory } from '../../../../test/factories/entity.factory';
import { createMockConfigService } from '../../../../test/mocks/external-clients.mock';
import { ErrorCode } from '@/common/constants/error-codes';

describe('AuthTokenService', () => {
  let service: AuthTokenService;
  let mockJwtService: jest.Mocked<Pick<JwtService, 'sign' | 'verify'>>;
  let mockJwtTokenProvider: jest.Mocked<
    Pick<JwtTokenProvider, 'createToken' | 'createRefreshToken'>
  >;
  let mockUserService: jest.Mocked<
    Pick<UserService, 'findByEmail' | 'findByIdWithSelect'>
  >;
  let mockCacheService: jest.Mocked<
    Pick<
      RedisCacheService,
      'setRefreshToken' | 'getRefreshToken' | 'deleteRefreshToken'
    >
  >;

  beforeEach(async () => {
    jest.clearAllMocks();

    mockJwtService = {
      sign: jest.fn(),
      verify: jest.fn(),
    } as jest.Mocked<Pick<JwtService, 'sign' | 'verify'>>;

    mockJwtTokenProvider = {
      createToken: jest.fn(),
      createRefreshToken: jest.fn(),
    } as jest.Mocked<
      Pick<JwtTokenProvider, 'createToken' | 'createRefreshToken'>
    >;

    mockUserService = {
      findByEmail: jest.fn(),
      findByIdWithSelect: jest.fn(),
    } as jest.Mocked<
      Pick<UserService, 'findByEmail' | 'findByIdWithSelect'>
    >;

    mockCacheService = {
      setRefreshToken: jest.fn().mockResolvedValue(undefined),
      getRefreshToken: jest.fn(),
      deleteRefreshToken: jest.fn().mockResolvedValue(undefined),
    } as jest.Mocked<
      Pick<
        RedisCacheService,
        'setRefreshToken' | 'getRefreshToken' | 'deleteRefreshToken'
      >
    >;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthTokenService,
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
        {
          provide: JwtTokenProvider,
          useValue: mockJwtTokenProvider,
        },
        {
          provide: UserService,
          useValue: mockUserService,
        },
        {
          provide: RedisCacheService,
          useValue: mockCacheService,
        },
        {
          provide: ConfigService,
          useValue: createMockConfigService({
            JWT_SECRET: 'test-access-secret',
            JWT_REFRESH_SECRET: 'test-refresh-secret',
          }),
        },
      ],
    }).compile();

    service = module.get<AuthTokenService>(AuthTokenService);
  });

  describe('issueTokens', () => {
    it('should issue access and refresh tokens and store refresh token in Redis', async () => {
      // Arrange
      const user = UserFactory.create({
        email: 'test@example.com',
        role: 'USER',
      });
      const expectedToken = 'access-token-123';
      const expectedRefreshToken = 'refresh-token-123';

      mockJwtTokenProvider.createToken.mockReturnValue(expectedToken);
      mockJwtTokenProvider.createRefreshToken.mockReturnValue(
        expectedRefreshToken,
      );

      // Act
      const result = await service.issueTokens(user);

      // Assert
      expect(result).toEqual({
        token: expectedToken,
        refreshToken: expectedRefreshToken,
      });
      expect(mockJwtTokenProvider.createToken).toHaveBeenCalledWith(
        user.id,
        'test@example.com',
        'USER',
      );
      expect(mockJwtTokenProvider.createRefreshToken).toHaveBeenCalledWith(
        'test@example.com',
        'USER',
      );
      expect(mockCacheService.setRefreshToken).toHaveBeenCalledWith(
        user.id,
        expectedRefreshToken,
      );
    });
  });

  describe('storeRefreshToken', () => {
    it('should store refresh token in Redis when token is provided', async () => {
      // Arrange
      const userId = 1;
      const token = 'refresh-token-123';

      // Act
      await service.storeRefreshToken(userId, token);

      // Assert
      expect(mockCacheService.setRefreshToken).toHaveBeenCalledWith(
        userId,
        token,
      );
      expect(mockCacheService.deleteRefreshToken).not.toHaveBeenCalled();
    });

    it('should delete refresh token from Redis when null is provided', async () => {
      // Arrange
      const userId = 1;

      // Act
      await service.storeRefreshToken(userId, null);

      // Assert
      expect(mockCacheService.deleteRefreshToken).toHaveBeenCalledWith(userId);
      expect(mockCacheService.setRefreshToken).not.toHaveBeenCalled();
    });
  });

  describe('refreshAccessToken', () => {
    it('should issue a new access token when valid expired access token is provided', async () => {
      // Arrange
      const user = UserFactory.create({
        id: 42,
        email: 'test@example.com',
        role: 'USER',
      });
      const accessToken = 'expired-access-token';
      const storedRefreshToken = 'stored-refresh-token';
      const newAccessToken = 'new-access-token';
      const newRefreshToken = 'new-refresh-token';

      mockJwtService.verify
        .mockReturnValueOnce({ sub: 42, email: 'test@example.com', role: 'USER' }) // access token verify (ignoreExpiration)
        .mockReturnValueOnce({}) // refresh token verify
        .mockReturnValueOnce({}); // new refresh token verify (token rotation)
      mockCacheService.getRefreshToken.mockResolvedValue(storedRefreshToken);
      mockUserService.findByIdWithSelect.mockResolvedValue(user);
      mockJwtTokenProvider.createToken.mockReturnValue(newAccessToken);
      mockJwtTokenProvider.createRefreshToken.mockReturnValue(newRefreshToken);

      // Act
      const result = await service.refreshAccessToken(accessToken);

      // Assert
      expect(result).toEqual({ token: newAccessToken });
      expect(mockCacheService.getRefreshToken).toHaveBeenCalledWith(42);
      expect(mockCacheService.setRefreshToken).toHaveBeenCalledWith(
        42,
        newRefreshToken,
      );
    });

    it('should throw UnauthorizedException when access token is invalid', async () => {
      // Arrange
      mockJwtService.verify.mockImplementation(() => {
        throw new Error('jwt malformed');
      });

      // Act & Assert
      await expect(
        service.refreshAccessToken('invalid-token'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when no refresh token exists in Redis', async () => {
      // Arrange
      mockJwtService.verify.mockReturnValue({
        sub: 42,
        email: 'test@example.com',
        role: 'USER',
      });
      mockCacheService.getRefreshToken.mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.refreshAccessToken('expired-token'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException and delete Redis token when refresh token is expired', async () => {
      // Arrange
      mockJwtService.verify
        .mockReturnValueOnce({ sub: 42, email: 'test@example.com', role: 'USER' }) // access token verify
        .mockImplementationOnce(() => {
          throw new Error('jwt expired'); // refresh token verify fails
        });
      mockCacheService.getRefreshToken.mockResolvedValue('expired-refresh-token');

      // Act & Assert
      await expect(
        service.refreshAccessToken('expired-token'),
      ).rejects.toThrow(UnauthorizedException);
      expect(mockCacheService.deleteRefreshToken).toHaveBeenCalledWith(42);
    });

    it('should throw UnauthorizedException when user not found', async () => {
      // Arrange
      mockJwtService.verify
        .mockReturnValueOnce({ sub: 42, email: 'test@example.com', role: 'USER' })
        .mockReturnValueOnce({});
      mockCacheService.getRefreshToken.mockResolvedValue('stored-refresh-token');
      mockUserService.findByIdWithSelect.mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.refreshAccessToken('expired-token'),
      ).rejects.toThrow(UnauthorizedException);
      expect(mockCacheService.deleteRefreshToken).toHaveBeenCalledWith(42);
    });

    it('should throw HttpException with FORBIDDEN status when user is deactivated', async () => {
      // Arrange
      const user = UserFactory.create({
        id: 42,
        email: 'test@example.com',
        role: 'USER',
      });
      (user as Record<string, unknown>).isDeactivated = true;

      mockJwtService.verify
        .mockReturnValueOnce({ sub: 42, email: 'test@example.com', role: 'USER' })
        .mockReturnValueOnce({});
      mockCacheService.getRefreshToken.mockResolvedValue('stored-refresh-token');
      mockUserService.findByIdWithSelect.mockResolvedValue(user);

      // Act & Assert
      await expect(
        service.refreshAccessToken('expired-token'),
      ).rejects.toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            errorCode: ErrorCode.AUTH_ACCOUNT_DEACTIVATED,
          }),
        }),
      );
      expect(mockCacheService.deleteRefreshToken).toHaveBeenCalledWith(42);
    });
  });

  describe('logout', () => {
    it('should delete refresh token from Redis', async () => {
      // Arrange
      const userId = 42;

      // Act
      await service.logout(userId);

      // Assert
      expect(mockCacheService.deleteRefreshToken).toHaveBeenCalledWith(userId);
    });
  });
});
