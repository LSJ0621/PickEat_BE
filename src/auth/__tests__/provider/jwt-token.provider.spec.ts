import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { JwtTokenProvider } from '../../provider/jwt-token.provider';
import { createMockConfigService } from '../../../../test/mocks/external-clients.mock';

describe('JwtTokenProvider', () => {
  let provider: JwtTokenProvider;
  let mockJwtService: jest.Mocked<Pick<JwtService, 'sign'>>;

  beforeEach(async () => {
    mockJwtService = {
      sign: jest.fn(),
    } as jest.Mocked<Pick<JwtService, 'sign'>>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtTokenProvider,
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
        {
          provide: ConfigService,
          useValue: createMockConfigService({
            JWT_REFRESH_SECRET: 'test-refresh-secret',
          }),
        },
      ],
    }).compile();

    provider = module.get<JwtTokenProvider>(JwtTokenProvider);
  });

  describe('createToken', () => {
    it('should create access token with email and role', () => {
      // Arrange
      const email = 'test@example.com';
      const role = 'USER';
      const expectedToken = 'access-token-123';

      mockJwtService.sign.mockReturnValue(expectedToken);

      // Act
      const result = provider.createToken(email, role);

      // Assert
      expect(result).toBe(expectedToken);
      expect(mockJwtService.sign).toHaveBeenCalledWith({ email, role });
    });

    it('should create access token for ADMIN role', () => {
      // Arrange
      const email = 'admin@example.com';
      const role = 'ADMIN';
      const expectedToken = 'admin-access-token';

      mockJwtService.sign.mockReturnValue(expectedToken);

      // Act
      const result = provider.createToken(email, role);

      // Assert
      expect(result).toBe(expectedToken);
      expect(mockJwtService.sign).toHaveBeenCalledWith({ email, role });
    });

    it('should create tokens with different emails', () => {
      // Arrange
      const emails = [
        'user1@example.com',
        'user2@example.com',
        'user3@example.com',
      ];
      const role = 'USER';

      emails.forEach((email, index) => {
        mockJwtService.sign.mockReturnValue(`token-${index}`);

        // Act
        const result = provider.createToken(email, role);

        // Assert
        expect(result).toBe(`token-${index}`);
        expect(mockJwtService.sign).toHaveBeenCalledWith({ email, role });
      });
    });

    it('should use JwtModule configuration for expiration and secret', () => {
      // Arrange
      const email = 'test@example.com';
      const role = 'USER';
      mockJwtService.sign.mockReturnValue('token');

      // Act
      provider.createToken(email, role);

      // Assert
      // JwtService.sign is called without options, so it uses module defaults
      expect(mockJwtService.sign).toHaveBeenCalledWith({ email, role });
    });
  });

  describe('createRefreshToken', () => {
    it('should create refresh token with email, role, and type', () => {
      // Arrange
      const email = 'test@example.com';
      const role = 'USER';
      const expectedToken = 'refresh-token-123';

      mockJwtService.sign.mockReturnValue(expectedToken);

      // Act
      const result = provider.createRefreshToken(email, role);

      // Assert
      expect(result).toBe(expectedToken);
      expect(mockJwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({ email, role, type: 'refresh' }),
        {
          expiresIn: '7d',
          secret: 'test-refresh-secret',
        },
      );
    });

    it('should create refresh token for ADMIN role', () => {
      // Arrange
      const email = 'admin@example.com';
      const role = 'ADMIN';
      const expectedToken = 'admin-refresh-token';

      mockJwtService.sign.mockReturnValue(expectedToken);

      // Act
      const result = provider.createRefreshToken(email, role);

      // Assert
      expect(result).toBe(expectedToken);
      expect(mockJwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({ email, role, type: 'refresh' }),
        {
          expiresIn: '7d',
          secret: 'test-refresh-secret',
        },
      );
    });

    it('should use 7 days expiration for refresh token', () => {
      // Arrange
      const email = 'test@example.com';
      const role = 'USER';
      mockJwtService.sign.mockReturnValue('token');

      // Act
      provider.createRefreshToken(email, role);

      // Assert
      expect(mockJwtService.sign).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ expiresIn: '7d' }),
      );
    });

    it('should use refresh secret from config', () => {
      // Arrange
      const email = 'test@example.com';
      const role = 'USER';
      mockJwtService.sign.mockReturnValue('token');

      // Act
      provider.createRefreshToken(email, role);

      // Assert
      expect(mockJwtService.sign).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ secret: 'test-refresh-secret' }),
      );
    });

    it('should include type=refresh in payload', () => {
      // Arrange
      const email = 'test@example.com';
      const role = 'USER';
      mockJwtService.sign.mockReturnValue('token');

      // Act
      provider.createRefreshToken(email, role);

      // Assert
      expect(mockJwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'refresh' }),
        expect.any(Object),
      );
    });

    it('should create different tokens for different users', () => {
      // Arrange
      const users = [
        { email: 'user1@example.com', role: 'USER' },
        { email: 'user2@example.com', role: 'ADMIN' },
        { email: 'user3@example.com', role: 'USER' },
      ];

      users.forEach((user, index) => {
        mockJwtService.sign.mockReturnValue(`refresh-token-${index}`);

        // Act
        const result = provider.createRefreshToken(user.email, user.role);

        // Assert
        expect(result).toBe(`refresh-token-${index}`);
        expect(mockJwtService.sign).toHaveBeenCalledWith(
          expect.objectContaining({
            email: user.email,
            role: user.role,
            type: 'refresh',
          }),
          { expiresIn: '7d', secret: 'test-refresh-secret' },
        );
      });
    });
  });

  describe('token differentiation', () => {
    it('should create different tokens for access and refresh', () => {
      // Arrange
      const email = 'test@example.com';
      const role = 'USER';

      mockJwtService.sign
        .mockReturnValueOnce('access-token')
        .mockReturnValueOnce('refresh-token');

      // Act
      const accessToken = provider.createToken(email, role);
      const refreshToken = provider.createRefreshToken(email, role);

      // Assert
      expect(accessToken).toBe('access-token');
      expect(refreshToken).toBe('refresh-token');
      expect(mockJwtService.sign).toHaveBeenCalledTimes(2);

      // Access token call (no extra options)
      expect(mockJwtService.sign).toHaveBeenNthCalledWith(1, { email, role });

      // Refresh token call (with type, jti, and options)
      expect(mockJwtService.sign).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ email, role, type: 'refresh' }),
        { expiresIn: '7d', secret: 'test-refresh-secret' },
      );
    });
  });
});
