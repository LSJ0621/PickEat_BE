import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { type Request } from 'express';
import { JwtStrategy, bearerTokenExtractor } from '../../strategy/jwt.strategy';
import { AuthUserPayload } from '../../decorators/current-user.decorator';
import { createMockConfigService } from '../../../../test/mocks/external-clients.mock';

interface MockRequest {
  headers: {
    authorization?: string | string[] | undefined;
  };
}

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
        sub: 1,
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
        sub: 2,
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
        'Invalid token: missing sub, email or role',
      );
    });

    it('should throw UnauthorizedException when email is undefined', () => {
      // Arrange
      const payload = {
        role: 'USER',
      } as unknown as AuthUserPayload;

      // Act & Assert
      expect(() => strategy.validate(payload)).toThrow(UnauthorizedException);
      expect(() => strategy.validate(payload)).toThrow(
        'Invalid token: missing sub, email or role',
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
        'Invalid token: missing sub, email or role',
      );
    });

    it('should throw UnauthorizedException when role is undefined', () => {
      // Arrange
      const payload = {
        email: 'test@example.com',
      } as unknown as AuthUserPayload;

      // Act & Assert
      expect(() => strategy.validate(payload)).toThrow(UnauthorizedException);
      expect(() => strategy.validate(payload)).toThrow(
        'Invalid token: missing sub, email or role',
      );
    });

    it('should throw UnauthorizedException when both email and role are missing', () => {
      // Arrange
      const payload = {} as unknown as AuthUserPayload;

      // Act & Assert
      expect(() => strategy.validate(payload)).toThrow(UnauthorizedException);
      expect(() => strategy.validate(payload)).toThrow(
        'Invalid token: missing sub, email or role',
      );
    });

    it('should accept payload with additional properties', () => {
      // Arrange
      const payload = {
        sub: 1,
        email: 'test@example.com',
        role: 'USER',
        iat: 1234567890,
        exp: 1234567890,
        type: 'access',
      } as AuthUserPayload & { iat: number; exp: number; type: string };

      // Act
      const result = strategy.validate(payload);

      // Assert
      expect(result).toEqual(payload);
    });
  });

  describe('bearerTokenExtractor', () => {
    it('should extract token from valid Bearer authorization header', () => {
      // Arrange
      const mockRequest: MockRequest = {
        headers: {
          authorization: 'Bearer valid-jwt-token',
        },
      };

      // Act
      const result = bearerTokenExtractor(mockRequest as unknown as Request);

      // Assert
      expect(result).toBe('valid-jwt-token');
    });

    it('should return null when authorization header is missing', () => {
      // Arrange
      const mockRequest: MockRequest = {
        headers: {},
      };

      // Act
      const result = bearerTokenExtractor(mockRequest as unknown as Request);

      // Assert
      expect(result).toBeNull();
    });

    it('should return null when authorization header is undefined', () => {
      // Arrange
      const mockRequest: MockRequest = {
        headers: {
          authorization: undefined,
        },
      };

      // Act
      const result = bearerTokenExtractor(mockRequest as unknown as Request);

      // Assert
      expect(result).toBeNull();
    });

    it('should extract token from array authorization header', () => {
      // Arrange
      const mockRequest: MockRequest = {
        headers: {
          authorization: ['Bearer token-from-array'],
        },
      };

      // Act
      const result = bearerTokenExtractor(mockRequest as unknown as Request);

      // Assert
      expect(result).toBe('token-from-array');
    });

    it('should extract first token when authorization header is array with multiple values', () => {
      // Arrange
      const mockRequest: MockRequest = {
        headers: {
          authorization: ['Bearer first-token', 'Bearer second-token'],
        },
      };

      // Act
      const result = bearerTokenExtractor(mockRequest as unknown as Request);

      // Assert
      expect(result).toBe('first-token');
    });

    it('should return null when authorization header is not a string after array extraction', () => {
      // Arrange
      const mockRequest: MockRequest = {
        headers: {
          authorization: [123] as unknown as string[],
        },
      };

      // Act
      const result = bearerTokenExtractor(mockRequest as unknown as Request);

      // Assert
      expect(result).toBeNull();
    });

    it('should return null when authorization header value is not a string type', () => {
      // Arrange
      const mockRequest: MockRequest = {
        headers: {
          authorization: 123 as unknown as string,
        },
      };

      // Act
      const result = bearerTokenExtractor(mockRequest as unknown as Request);

      // Assert
      expect(result).toBeNull();
    });

    it('should return null when authorization header does not match Bearer pattern', () => {
      // Arrange
      const mockRequest: MockRequest = {
        headers: {
          authorization: 'InvalidFormat token',
        },
      };

      // Act
      const result = bearerTokenExtractor(mockRequest as unknown as Request);

      // Assert
      expect(result).toBeNull();
    });

    it('should return null when authorization header is just Bearer without token', () => {
      // Arrange
      const mockRequest: MockRequest = {
        headers: {
          authorization: 'Bearer',
        },
      };

      // Act
      const result = bearerTokenExtractor(mockRequest as unknown as Request);

      // Assert
      expect(result).toBeNull();
    });

    it('should extract whitespace as token when authorization header is Bearer with only whitespace', () => {
      // Arrange
      const mockRequest: MockRequest = {
        headers: {
          authorization: 'Bearer   ',
        },
      };

      // Act
      const result = bearerTokenExtractor(mockRequest as unknown as Request);

      // Assert - The regex .+ matches one or more characters including whitespace
      expect(result).toBe(' ');
    });

    it('should handle Bearer with case insensitive matching', () => {
      // Arrange
      const mockRequest: MockRequest = {
        headers: {
          authorization: 'bearer lowercase-token',
        },
      };

      // Act
      const result = bearerTokenExtractor(mockRequest as unknown as Request);

      // Assert
      expect(result).toBe('lowercase-token');
    });

    it('should extract token when Bearer has mixed case', () => {
      // Arrange
      const mockRequest: MockRequest = {
        headers: {
          authorization: 'BeArEr mixed-case-token',
        },
      };

      // Act
      const result = bearerTokenExtractor(mockRequest as unknown as Request);

      // Assert
      expect(result).toBe('mixed-case-token');
    });

    it('should return null when header value is empty string', () => {
      // Arrange
      const mockRequest: MockRequest = {
        headers: {
          authorization: '',
        },
      };

      // Act
      const result = bearerTokenExtractor(mockRequest as unknown as Request);

      // Assert
      expect(result).toBeNull();
    });

    it('should extract token with special characters', () => {
      // Arrange
      const mockRequest: MockRequest = {
        headers: {
          authorization:
            'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
        },
      };

      // Act
      const result = bearerTokenExtractor(mockRequest as unknown as Request);

      // Assert
      expect(result).toBe(
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
      );
    });
  });
});
