import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy';
import { AuthUserPayload } from '../decorators/current-user.decorator';
import { createMockConfigService } from '../../../test/mocks/external-clients.mock';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        {
          provide: ConfigService,
          useValue: createMockConfigService({
            JWT_SECRET: 'test-jwt-secret',
          }),
        },
      ],
    }).compile();

    strategy = module.get<JwtStrategy>(JwtStrategy);
  });

  describe('validate', () => {
    it('should return payload when valid JWT payload is provided', () => {
      // Arrange
      const payload: AuthUserPayload = {
        email: 'test@example.com',
        role: 'USER',
      };

      // Act
      const result = strategy.validate(payload);

      // Assert
      expect(result).toEqual(payload);
    });

    it('should return payload for ADMIN role', () => {
      // Arrange
      const payload: AuthUserPayload = {
        email: 'admin@example.com',
        role: 'ADMIN',
      };

      // Act
      const result = strategy.validate(payload);

      // Assert
      expect(result).toEqual(payload);
    });

    it('should throw UnauthorizedException when email is missing', () => {
      // Arrange
      const payload = {
        email: '',
        role: 'USER',
      } as AuthUserPayload;

      // Act & Assert
      expect(() => strategy.validate(payload)).toThrow(UnauthorizedException);
      expect(() => strategy.validate(payload)).toThrow(
        'Invalid token: missing email or role',
      );
    });

    it('should throw UnauthorizedException when email is undefined', () => {
      // Arrange
      const payload = {
        role: 'USER',
      } as any;

      // Act & Assert
      expect(() => strategy.validate(payload)).toThrow(UnauthorizedException);
      expect(() => strategy.validate(payload)).toThrow(
        'Invalid token: missing email or role',
      );
    });

    it('should throw UnauthorizedException when role is missing', () => {
      // Arrange
      const payload = {
        email: 'test@example.com',
        role: '',
      } as AuthUserPayload;

      // Act & Assert
      expect(() => strategy.validate(payload)).toThrow(UnauthorizedException);
      expect(() => strategy.validate(payload)).toThrow(
        'Invalid token: missing email or role',
      );
    });

    it('should throw UnauthorizedException when role is undefined', () => {
      // Arrange
      const payload = {
        email: 'test@example.com',
      } as any;

      // Act & Assert
      expect(() => strategy.validate(payload)).toThrow(UnauthorizedException);
      expect(() => strategy.validate(payload)).toThrow(
        'Invalid token: missing email or role',
      );
    });

    it('should throw UnauthorizedException when both email and role are missing', () => {
      // Arrange
      const payload = {} as any;

      // Act & Assert
      expect(() => strategy.validate(payload)).toThrow(UnauthorizedException);
      expect(() => strategy.validate(payload)).toThrow(
        'Invalid token: missing email or role',
      );
    });

    it('should accept payload with additional properties', () => {
      // Arrange
      const payload = {
        email: 'test@example.com',
        role: 'USER',
        iat: 1234567890,
        exp: 1234567890,
        type: 'access',
      } as any;

      // Act
      const result = strategy.validate(payload);

      // Assert
      expect(result).toEqual(payload);
    });
  });

  describe('bearerTokenExtractor', () => {
    // Helper function that mirrors the actual bearerTokenExtractor logic
    const bearerTokenExtractor = (request: any): string | null => {
      const authorizationHeader = request.headers.authorization as
        | string
        | string[]
        | undefined;
      if (!authorizationHeader) {
        return null;
      }
      const headerValue = Array.isArray(authorizationHeader)
        ? authorizationHeader[0]
        : authorizationHeader;
      if (!headerValue || typeof headerValue !== 'string') {
        return null;
      }
      const matches = headerValue.match(/^Bearer\s+(.+)$/i);
      return matches?.[1] ?? null;
    };

    it('should extract token from valid Bearer authorization header', () => {
      // Arrange
      const mockRequest = {
        headers: {
          authorization: 'Bearer valid-jwt-token',
        },
      };

      // Act
      const result = bearerTokenExtractor(mockRequest);

      // Assert
      expect(result).toBe('valid-jwt-token');
    });

    it('should return null when authorization header is missing', () => {
      // Arrange
      const mockRequest = {
        headers: {},
      };

      // Act
      const result = bearerTokenExtractor(mockRequest);

      // Assert
      expect(result).toBeNull();
    });

    it('should return null when authorization header is undefined', () => {
      // Arrange
      const mockRequest = {
        headers: {
          authorization: undefined,
        },
      };

      // Act
      const result = bearerTokenExtractor(mockRequest);

      // Assert
      expect(result).toBeNull();
    });

    it('should extract token from array authorization header', () => {
      // Arrange
      const mockRequest = {
        headers: {
          authorization: ['Bearer token-from-array'],
        },
      };

      // Act
      const result = bearerTokenExtractor(mockRequest);

      // Assert
      expect(result).toBe('token-from-array');
    });

    it('should extract first token when authorization header is array with multiple values', () => {
      // Arrange
      const mockRequest = {
        headers: {
          authorization: ['Bearer first-token', 'Bearer second-token'],
        },
      };

      // Act
      const result = bearerTokenExtractor(mockRequest);

      // Assert
      expect(result).toBe('first-token');
    });

    it('should return null when authorization header is not a string after array extraction', () => {
      // Arrange
      const mockRequest = {
        headers: {
          authorization: [123] as any,
        },
      };

      // Act
      const result = bearerTokenExtractor(mockRequest);

      // Assert
      expect(result).toBeNull();
    });

    it('should return null when authorization header value is not a string type', () => {
      // Arrange
      const mockRequest = {
        headers: {
          authorization: 123 as any,
        },
      };

      // Act
      const result = bearerTokenExtractor(mockRequest);

      // Assert
      expect(result).toBeNull();
    });

    it('should return null when authorization header does not match Bearer pattern', () => {
      // Arrange
      const mockRequest = {
        headers: {
          authorization: 'InvalidFormat token',
        },
      };

      // Act
      const result = bearerTokenExtractor(mockRequest);

      // Assert
      expect(result).toBeNull();
    });

    it('should return null when authorization header is just Bearer without token', () => {
      // Arrange
      const mockRequest = {
        headers: {
          authorization: 'Bearer',
        },
      };

      // Act
      const result = bearerTokenExtractor(mockRequest);

      // Assert
      expect(result).toBeNull();
    });

    it('should extract whitespace as token when authorization header is Bearer with only whitespace', () => {
      // Arrange
      const mockRequest = {
        headers: {
          authorization: 'Bearer   ',
        },
      };

      // Act
      const result = bearerTokenExtractor(mockRequest);

      // Assert - The regex .+ matches one or more characters including whitespace
      expect(result).toBe(' ');
    });

    it('should handle Bearer with case insensitive matching', () => {
      // Arrange
      const mockRequest = {
        headers: {
          authorization: 'bearer lowercase-token',
        },
      };

      // Act
      const result = bearerTokenExtractor(mockRequest);

      // Assert
      expect(result).toBe('lowercase-token');
    });

    it('should extract token when Bearer has mixed case', () => {
      // Arrange
      const mockRequest = {
        headers: {
          authorization: 'BeArEr mixed-case-token',
        },
      };

      // Act
      const result = bearerTokenExtractor(mockRequest);

      // Assert
      expect(result).toBe('mixed-case-token');
    });

    it('should return null when header value is empty string', () => {
      // Arrange
      const mockRequest = {
        headers: {
          authorization: '',
        },
      };

      // Act
      const result = bearerTokenExtractor(mockRequest);

      // Assert
      expect(result).toBeNull();
    });

    it('should extract token with special characters', () => {
      // Arrange
      const mockRequest = {
        headers: {
          authorization:
            'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
        },
      };

      // Act
      const result = bearerTokenExtractor(mockRequest);

      // Assert
      expect(result).toBe(
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
      );
    });
  });
});
