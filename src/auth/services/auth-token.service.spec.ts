import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthTokenService } from './auth-token.service';
import { JwtTokenProvider } from '../provider/jwt-token.provider';
import { UserService } from '@/user/user.service';
import { User } from '@/user/entities/user.entity';
import { createMockRepository } from '../../../test/mocks/repository.mock';
import { UserFactory } from '../../../test/factories/entity.factory';
import { createMockConfigService } from '../../../test/mocks/external-clients.mock';

describe('AuthTokenService', () => {
  let service: AuthTokenService;
  let mockUserRepository: ReturnType<typeof createMockRepository<User>>;
  let mockJwtService: jest.Mocked<JwtService>;
  let mockJwtTokenProvider: jest.Mocked<JwtTokenProvider>;
  let mockUserService: jest.Mocked<UserService>;

  beforeEach(async () => {
    mockUserRepository = createMockRepository<User>();
    mockJwtService = {
      sign: jest.fn(),
      verify: jest.fn(),
    } as any;
    mockJwtTokenProvider = {
      createToken: jest.fn(),
      createRefreshToken: jest.fn(),
    } as any;
    mockUserService = {
      findByEmail: jest.fn(),
    } as any;

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
          provide: getRepositoryToken(User),
          useValue: mockUserRepository,
        },
        {
          provide: ConfigService,
          useValue: createMockConfigService({
            JWT_REFRESH_SECRET: 'test-refresh-secret',
          }),
        },
      ],
    }).compile();

    service = module.get<AuthTokenService>(AuthTokenService);
  });

  describe('issueTokens', () => {
    it('should issue access and refresh tokens when user is valid', async () => {
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
      mockUserRepository.save.mockResolvedValue(user);

      // Mock bcrypt.hash
      jest
        .spyOn(bcrypt, 'hash')
        .mockResolvedValue('hashed-refresh-token' as never);

      // Act
      const result = await service.issueTokens(user);

      // Assert
      expect(result).toEqual({
        token: expectedToken,
        refreshToken: expectedRefreshToken,
      });
      expect(mockJwtTokenProvider.createToken).toHaveBeenCalledWith(
        'test@example.com',
        'USER',
      );
      expect(mockJwtTokenProvider.createRefreshToken).toHaveBeenCalledWith(
        'test@example.com',
        'USER',
      );
      expect(mockUserRepository.save).toHaveBeenCalledWith(user);
    });

    it('should persist hashed refresh token to database', async () => {
      // Arrange
      const user = UserFactory.create();
      const refreshToken = 'refresh-token-123';
      const hashedToken = 'hashed-token-123';

      mockJwtTokenProvider.createToken.mockReturnValue('access-token');
      mockJwtTokenProvider.createRefreshToken.mockReturnValue(refreshToken);
      jest.spyOn(bcrypt, 'hash').mockResolvedValue(hashedToken as never);
      mockUserRepository.save.mockResolvedValue(user);

      // Act
      await service.issueTokens(user);

      // Assert
      expect(bcrypt.hash).toHaveBeenCalledWith(refreshToken, 10);
      expect(user.refreshToken).toBe(hashedToken);
      expect(mockUserRepository.save).toHaveBeenCalledWith(user);
    });
  });

  describe('persistRefreshToken', () => {
    it('should hash and save refresh token when provided', async () => {
      // Arrange
      const user = UserFactory.create();
      const refreshToken = 'refresh-token-123';
      const hashedToken = 'hashed-token-123';

      jest.spyOn(bcrypt, 'hash').mockResolvedValue(hashedToken as never);
      mockUserRepository.save.mockResolvedValue(user);

      // Act
      await service.persistRefreshToken(user, refreshToken);

      // Assert
      expect(bcrypt.hash).toHaveBeenCalledWith(refreshToken, 10);
      expect(user.refreshToken).toBe(hashedToken);
      expect(mockUserRepository.save).toHaveBeenCalledWith(user);
    });

    it('should set refresh token to null when null is provided', async () => {
      // Arrange
      const user = UserFactory.create({ refreshToken: 'old-token' });
      mockUserRepository.save.mockResolvedValue(user);

      // Act
      await service.persistRefreshToken(user, null);

      // Assert
      expect(user.refreshToken).toBeNull();
      expect(mockUserRepository.save).toHaveBeenCalledWith(user);
    });
  });

  describe('refreshAccessToken', () => {
    it('should refresh tokens when valid refresh token is provided', async () => {
      // Arrange
      const user = UserFactory.create({
        email: 'test@example.com',
        role: 'USER',
        refreshToken: 'hashed-refresh-token',
      });
      const refreshToken = 'valid-refresh-token';
      const payload = {
        email: 'test@example.com',
        role: 'USER',
        type: 'refresh',
      };
      const newAccessToken = 'new-access-token';
      const newRefreshToken = 'new-refresh-token';

      mockJwtService.verify.mockReturnValue(payload);
      mockUserService.findByEmail.mockResolvedValue(user);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);
      jest.spyOn(bcrypt, 'hash').mockResolvedValue('new-hashed-token' as never);
      mockJwtTokenProvider.createToken.mockReturnValue(newAccessToken);
      mockJwtTokenProvider.createRefreshToken.mockReturnValue(newRefreshToken);
      mockUserRepository.save.mockResolvedValue(user);

      // Act
      const result = await service.refreshAccessToken(refreshToken);

      // Assert
      expect(result).toEqual({
        token: newAccessToken,
        refreshToken: newRefreshToken,
      });
      expect(mockJwtService.verify).toHaveBeenCalledWith(refreshToken, {
        secret: 'test-refresh-secret',
      });
      expect(mockUserService.findByEmail).toHaveBeenCalledWith(
        'test@example.com',
      );
      expect(bcrypt.compare).toHaveBeenCalledWith(
        refreshToken,
        'hashed-refresh-token',
      );
    });

    it('should throw UnauthorizedException when token type is not refresh', async () => {
      // Arrange
      const payload = {
        email: 'test@example.com',
        role: 'USER',
        type: 'access',
      };
      mockJwtService.verify.mockReturnValue(payload);

      // Act & Assert
      await expect(service.refreshAccessToken('invalid-token')).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(service.refreshAccessToken('invalid-token')).rejects.toThrow(
        '유효하지 않은 refresh token입니다.',
      );
    });

    it('should throw UnauthorizedException when user not found', async () => {
      // Arrange
      const payload = {
        email: 'nonexistent@example.com',
        role: 'USER',
        type: 'refresh',
      };
      mockJwtService.verify.mockReturnValue(payload);
      mockUserService.findByEmail.mockResolvedValue(null);

      // Act & Assert
      await expect(service.refreshAccessToken('token')).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(service.refreshAccessToken('token')).rejects.toThrow(
        '사용자를 찾을 수 없습니다.',
      );
    });

    it('should throw UnauthorizedException when user has no refresh token', async () => {
      // Arrange
      const user = UserFactory.create({ refreshToken: null });
      const payload = {
        email: 'test@example.com',
        role: 'USER',
        type: 'refresh',
      };
      mockJwtService.verify.mockReturnValue(payload);
      mockUserService.findByEmail.mockResolvedValue(user);

      // Act & Assert
      await expect(service.refreshAccessToken('token')).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(service.refreshAccessToken('token')).rejects.toThrow(
        '유효하지 않은 refresh token입니다.',
      );
    });

    it('should throw UnauthorizedException when refresh token does not match', async () => {
      // Arrange
      const user = UserFactory.create({ refreshToken: 'hashed-token' });
      const payload = {
        email: 'test@example.com',
        role: 'USER',
        type: 'refresh',
      };
      mockJwtService.verify.mockReturnValue(payload);
      mockUserService.findByEmail.mockResolvedValue(user);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(false as never);

      // Act & Assert
      await expect(service.refreshAccessToken('wrong-token')).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(service.refreshAccessToken('wrong-token')).rejects.toThrow(
        '유효하지 않은 refresh token입니다.',
      );
    });

    it('should throw UnauthorizedException when JWT verification fails', async () => {
      // Arrange
      mockJwtService.verify.mockImplementation(() => {
        throw new Error('jwt malformed');
      });

      // Act & Assert
      await expect(
        service.refreshAccessToken('malformed-token'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when JWT is expired', async () => {
      // Arrange
      mockJwtService.verify.mockImplementation(() => {
        throw new Error('jwt expired');
      });

      // Act & Assert
      await expect(service.refreshAccessToken('expired-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('logout', () => {
    it('should clear refresh token when valid token is provided', async () => {
      // Arrange
      const user = UserFactory.create({
        email: 'test@example.com',
        refreshToken: 'hashed-token',
      });
      const refreshToken = 'valid-refresh-token';
      const payload = {
        email: 'test@example.com',
        role: 'USER',
        type: 'refresh',
      };

      mockJwtService.verify.mockReturnValue(payload);
      mockUserService.findByEmail.mockResolvedValue(user);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);
      mockUserRepository.save.mockResolvedValue(user);

      // Act
      await service.logout(refreshToken);

      // Assert
      expect(mockJwtService.verify).toHaveBeenCalledWith(refreshToken, {
        secret: 'test-refresh-secret',
      });
      expect(mockUserService.findByEmail).toHaveBeenCalledWith(
        'test@example.com',
      );
      expect(bcrypt.compare).toHaveBeenCalledWith(refreshToken, 'hashed-token');
      expect(user.refreshToken).toBeNull();
      expect(mockUserRepository.save).toHaveBeenCalledWith(user);
    });

    it('should do nothing when no refresh token is provided', async () => {
      // Act
      await service.logout(undefined);

      // Assert
      expect(mockJwtService.verify).not.toHaveBeenCalled();
      expect(mockUserService.findByEmail).not.toHaveBeenCalled();
      expect(mockUserRepository.save).not.toHaveBeenCalled();
    });

    it('should not throw error when JWT verification fails during logout', async () => {
      // Arrange
      mockJwtService.verify.mockImplementation(() => {
        throw new Error('jwt expired');
      });

      // Act & Assert
      await expect(service.logout('expired-token')).resolves.toBeUndefined();
    });

    it('should not clear token when user not found', async () => {
      // Arrange
      const payload = {
        email: 'test@example.com',
        role: 'USER',
        type: 'refresh',
      };
      mockJwtService.verify.mockReturnValue(payload);
      mockUserService.findByEmail.mockResolvedValue(null);

      // Act
      await service.logout('token');

      // Assert
      expect(mockUserRepository.save).not.toHaveBeenCalled();
    });

    it('should not clear token when user has no refresh token', async () => {
      // Arrange
      const user = UserFactory.create({ refreshToken: null });
      const payload = {
        email: 'test@example.com',
        role: 'USER',
        type: 'refresh',
      };
      mockJwtService.verify.mockReturnValue(payload);
      mockUserService.findByEmail.mockResolvedValue(user);

      // Act
      await service.logout('token');

      // Assert
      expect(mockUserRepository.save).not.toHaveBeenCalled();
    });

    it('should not clear token when token does not match', async () => {
      // Arrange
      const user = UserFactory.create({ refreshToken: 'hashed-token' });
      const payload = {
        email: 'test@example.com',
        role: 'USER',
        type: 'refresh',
      };
      mockJwtService.verify.mockReturnValue(payload);
      mockUserService.findByEmail.mockResolvedValue(user);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(false as never);

      // Act
      await service.logout('wrong-token');

      // Assert
      expect(mockUserRepository.save).not.toHaveBeenCalled();
    });
  });
});
