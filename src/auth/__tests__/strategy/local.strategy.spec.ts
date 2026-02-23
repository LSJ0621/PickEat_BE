import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { LocalStrategy } from '../../strategy/local.strategy';
import { AuthService } from '../../auth.service';
import { UserFactory } from '../../../../test/factories/entity.factory';
import { ErrorCode } from '../../../common/constants/error-codes';

describe('LocalStrategy', () => {
  let strategy: LocalStrategy;
  let mockAuthService: jest.Mocked<Pick<AuthService, 'validateUser'>>;

  beforeEach(async () => {
    mockAuthService = {
      validateUser: jest.fn(),
    } as jest.Mocked<Pick<AuthService, 'validateUser'>>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LocalStrategy,
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
      ],
    }).compile();

    strategy = module.get<LocalStrategy>(LocalStrategy);
  });

  describe('validate', () => {
    it('should return user when credentials are valid', async () => {
      // Arrange
      const email = 'test@example.com';
      const password = 'password123';
      const user = UserFactory.create({ email });

      mockAuthService.validateUser.mockResolvedValue({
        user,
        reason: 'success',
      });

      // Act
      const result = await strategy.validate(email, password);

      // Assert
      expect(result).toBe(user);
      expect(mockAuthService.validateUser).toHaveBeenCalledWith(
        email,
        password,
      );
    });

    it('should throw UnauthorizedException when credentials are invalid', async () => {
      // Arrange
      const email = 'test@example.com';
      const password = 'wrong-password';

      mockAuthService.validateUser.mockResolvedValue({
        user: null,
        reason: 'wrong_password',
      });

      // Act & Assert
      await expect(strategy.validate(email, password)).rejects.toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            errorCode: ErrorCode.AUTH_INVALID_CREDENTIALS,
          }),
        }),
      );
      expect(mockAuthService.validateUser).toHaveBeenCalledWith(
        email,
        password,
      );
    });

    it('should throw UnauthorizedException when user is not found', async () => {
      // Arrange
      const email = 'nonexistent@example.com';
      const password = 'password123';

      mockAuthService.validateUser.mockResolvedValue({
        user: null,
        reason: 'not_found',
      });

      // Act & Assert
      await expect(strategy.validate(email, password)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(mockAuthService.validateUser).toHaveBeenCalledWith(
        email,
        password,
      );
    });

    it('should validate user with different email formats', async () => {
      // Arrange
      const emails = [
        'test@example.com',
        'user+tag@example.com',
        'user.name@example.co.kr',
        'TEST@EXAMPLE.COM',
      ];

      for (const email of emails) {
        const user = UserFactory.create({ email });
        mockAuthService.validateUser.mockResolvedValue({
          user,
          reason: 'success',
        });

        // Act
        const result = await strategy.validate(email, 'password');

        // Assert
        expect(result).toBe(user);
      }
    });

    it('should handle empty password', async () => {
      // Arrange
      const email = 'test@example.com';
      const password = '';

      mockAuthService.validateUser.mockResolvedValue({
        user: null,
        reason: 'no_password',
      });

      // Act & Assert
      await expect(strategy.validate(email, password)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(mockAuthService.validateUser).toHaveBeenCalledWith(
        email,
        password,
      );
    });

    it('should handle empty email', async () => {
      // Arrange
      const email = '';
      const password = 'password123';

      mockAuthService.validateUser.mockResolvedValue({
        user: null,
        reason: 'not_found',
      });

      // Act & Assert
      await expect(strategy.validate(email, password)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(mockAuthService.validateUser).toHaveBeenCalledWith(
        email,
        password,
      );
    });

    it('should pass through validation errors from AuthService', async () => {
      // Arrange
      const email = 'test@example.com';
      const password = 'password123';
      const error = new Error('Database connection failed');

      mockAuthService.validateUser.mockRejectedValue(error);

      // Act & Assert
      await expect(strategy.validate(email, password)).rejects.toThrow(
        'Database connection failed',
      );
    });
  });
});
