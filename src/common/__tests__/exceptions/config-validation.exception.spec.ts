import { ConfigValidationException } from '../../exceptions/config-validation.exception';

describe('ConfigValidationException', () => {
  describe('constructor', () => {
    it('should create an instance with the provided message', () => {
      // Arrange
      const message = 'Missing required environment variable: DATABASE_URL';

      // Act
      const exception = new ConfigValidationException(message);

      // Assert
      expect(exception.message).toBe(message);
    });

    it('should set the name property to "ConfigValidationException"', () => {
      // Arrange
      const message = 'Invalid configuration value';

      // Act
      const exception = new ConfigValidationException(message);

      // Assert
      expect(exception.name).toBe('ConfigValidationException');
    });

    it('should extend Error class', () => {
      // Arrange
      const message = 'Configuration validation failed';

      // Act
      const exception = new ConfigValidationException(message);

      // Assert
      expect(exception).toBeInstanceOf(Error);
    });

    it('should be an instance of ConfigValidationException', () => {
      // Arrange
      const message = 'Invalid port number';

      // Act
      const exception = new ConfigValidationException(message);

      // Assert
      expect(exception).toBeInstanceOf(ConfigValidationException);
    });

    it('should have a stack trace', () => {
      // Arrange
      const message = 'Stack trace test';

      // Act
      const exception = new ConfigValidationException(message);

      // Assert
      expect(exception.stack).toBeDefined();
      expect(typeof exception.stack).toBe('string');
    });

    it('should capture stack trace starting from constructor when Error.captureStackTrace is available', () => {
      // Arrange
      const message = 'Stack trace capture test';
      const originalCaptureStackTrace = Error.captureStackTrace;
      const mockCaptureStackTrace = jest.fn();
      Error.captureStackTrace = mockCaptureStackTrace;

      // Act
      const exception = new ConfigValidationException(message);

      // Assert
      expect(mockCaptureStackTrace).toHaveBeenCalledWith(
        exception,
        ConfigValidationException,
      );

      // Cleanup
      Error.captureStackTrace = originalCaptureStackTrace;
    });

    it('should not throw when Error.captureStackTrace is undefined', () => {
      // Arrange
      const message = 'No captureStackTrace test';
      const originalCaptureStackTrace = Error.captureStackTrace;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (Error as any).captureStackTrace = undefined;

      // Act & Assert
      expect(() => {
        new ConfigValidationException(message);
      }).not.toThrow();

      // Cleanup
      Error.captureStackTrace = originalCaptureStackTrace;
    });

    it('should handle empty string message', () => {
      // Arrange
      const message = '';

      // Act
      const exception = new ConfigValidationException(message);

      // Assert
      expect(exception.message).toBe('');
      expect(exception.name).toBe('ConfigValidationException');
    });

    it('should handle multi-line message', () => {
      // Arrange
      const message = `Configuration validation failed:
- Missing DATABASE_URL
- Invalid JWT_SECRET length`;

      // Act
      const exception = new ConfigValidationException(message);

      // Assert
      expect(exception.message).toBe(message);
      expect(exception.name).toBe('ConfigValidationException');
    });

    it('should handle special characters in message', () => {
      // Arrange
      const message = 'Invalid value: "test@#$%^&*()" for KEY_NAME';

      // Act
      const exception = new ConfigValidationException(message);

      // Assert
      expect(exception.message).toBe(message);
    });
  });

  describe('error throwing', () => {
    it('should be catchable when thrown', () => {
      // Arrange
      const message = 'Throw test';

      // Act & Assert
      expect(() => {
        throw new ConfigValidationException(message);
      }).toThrow(ConfigValidationException);
    });

    it('should be catchable as Error', () => {
      // Arrange
      const message = 'Error catch test';

      // Act & Assert
      expect(() => {
        throw new ConfigValidationException(message);
      }).toThrow(Error);
    });

    it('should preserve message when caught', () => {
      // Arrange
      const message = 'Message preservation test';

      // Act
      try {
        throw new ConfigValidationException(message);
      } catch (error) {
        // Assert
        expect(error).toBeInstanceOf(ConfigValidationException);
        if (error instanceof ConfigValidationException) {
          expect(error.message).toBe(message);
        }
      }
    });

    it('should be distinguishable from generic Error by name', () => {
      // Arrange
      const message = 'Name check test';

      // Act
      try {
        throw new ConfigValidationException(message);
      } catch (error) {
        // Assert
        expect(error).toBeInstanceOf(Error);
        if (error instanceof Error) {
          expect(error.name).toBe('ConfigValidationException');
          expect(error.name).not.toBe('Error');
        }
      }
    });
  });

  describe('typical use cases', () => {
    it('should handle missing required environment variable scenario', () => {
      // Arrange
      const envVar = 'JWT_SECRET';
      const message = `Missing required environment variable: ${envVar}`;

      // Act
      const exception = new ConfigValidationException(message);

      // Assert
      expect(exception.message).toContain(envVar);
      expect(exception).toBeInstanceOf(ConfigValidationException);
    });

    it('should handle invalid environment variable value scenario', () => {
      // Arrange
      const message =
        'Invalid PORT value: must be a number between 1 and 65535';

      // Act
      const exception = new ConfigValidationException(message);

      // Assert
      expect(exception.message).toBe(message);
      expect(exception.name).toBe('ConfigValidationException');
    });

    it('should handle multiple validation errors scenario', () => {
      // Arrange
      const errors = ['Missing DATABASE_URL', 'Invalid JWT_EXPIRES_IN format'];
      const message = `Configuration validation failed:\n${errors.join('\n')}`;

      // Act
      const exception = new ConfigValidationException(message);

      // Assert
      expect(exception.message).toContain('DATABASE_URL');
      expect(exception.message).toContain('JWT_EXPIRES_IN');
    });
  });
});
