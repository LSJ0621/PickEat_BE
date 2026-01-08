import {
  elapsedSeconds,
  parseTokens,
  mapStatusGroupFromError,
  type StatusGroup,
} from '@/common/utils/metrics.util';

describe('metrics.util', () => {
  describe('elapsedSeconds', () => {
    it('should calculate elapsed seconds correctly', () => {
      // Arrange
      const startedAt = Date.now() - 5000; // 5 seconds ago

      // Act
      const result = elapsedSeconds(startedAt);

      // Assert
      expect(result).toBeGreaterThanOrEqual(5);
      expect(result).toBeLessThan(5.1); // Allow small margin for execution time
    });

    it('should return 0 when startedAt is current time', () => {
      // Arrange
      const startedAt = Date.now();

      // Act
      const result = elapsedSeconds(startedAt);

      // Assert
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThan(0.01); // Very small elapsed time
    });

    it('should handle large time differences', () => {
      // Arrange
      const startedAt = Date.now() - 60000; // 60 seconds ago

      // Act
      const result = elapsedSeconds(startedAt);

      // Assert
      expect(result).toBeGreaterThanOrEqual(60);
      expect(result).toBeLessThan(60.1);
    });
  });

  describe('parseTokens', () => {
    it('should return the number as-is when input is a number', () => {
      // Arrange
      const input = 1000;

      // Act
      const result = parseTokens(input);

      // Assert
      expect(result).toBe(1000);
    });

    it('should parse numeric string correctly', () => {
      // Arrange
      const input = '1000';

      // Act
      const result = parseTokens(input);

      // Assert
      expect(result).toBe(1000);
    });

    it('should remove commas from string and parse correctly', () => {
      // Arrange
      const input = '1,000,000';

      // Act
      const result = parseTokens(input);

      // Assert
      expect(result).toBe(1000000);
    });

    it('should handle string with spaces and commas', () => {
      // Arrange
      const input = ' 1,234,567 ';

      // Act
      const result = parseTokens(input);

      // Assert
      expect(result).toBe(1234567);
    });

    it('should return NaN for invalid string', () => {
      // Arrange
      const input = 'invalid';

      // Act
      const result = parseTokens(input);

      // Assert
      expect(result).toBeNaN();
    });

    it('should return 0 for null', () => {
      // Arrange
      const input = null;

      // Act
      const result = parseTokens(input);

      // Assert
      expect(result).toBe(0);
    });

    it('should return NaN for undefined', () => {
      // Arrange
      const input = undefined;

      // Act
      const result = parseTokens(input);

      // Assert
      expect(result).toBeNaN();
    });

    it('should handle zero correctly', () => {
      // Arrange
      const input = 0;

      // Act
      const result = parseTokens(input);

      // Assert
      expect(result).toBe(0);
    });

    it('should handle negative numbers', () => {
      // Arrange
      const input = -1000;

      // Act
      const result = parseTokens(input);

      // Assert
      expect(result).toBe(-1000);
    });

    it('should handle negative number strings with commas', () => {
      // Arrange
      const input = '-1,000';

      // Act
      const result = parseTokens(input);

      // Assert
      expect(result).toBe(-1000);
    });

    it('should handle decimal numbers', () => {
      // Arrange
      const input = 1234.56;

      // Act
      const result = parseTokens(input);

      // Assert
      expect(result).toBe(1234.56);
    });

    it('should handle decimal strings', () => {
      // Arrange
      const input = '1,234.56';

      // Act
      const result = parseTokens(input);

      // Assert
      expect(result).toBe(1234.56);
    });
  });

  describe('mapStatusGroupFromError', () => {
    describe('when error has direct status field', () => {
      it('should return "429" when status is 429', () => {
        // Arrange
        const error = { status: 429 };

        // Act
        const result = mapStatusGroupFromError(error);

        // Assert
        expect(result).toBe('429');
      });

      it('should return "5xx" when status is 500', () => {
        // Arrange
        const error = { status: 500 };

        // Act
        const result = mapStatusGroupFromError(error);

        // Assert
        expect(result).toBe('5xx');
      });

      it('should return "5xx" when status is 502', () => {
        // Arrange
        const error = { status: 502 };

        // Act
        const result = mapStatusGroupFromError(error);

        // Assert
        expect(result).toBe('5xx');
      });

      it('should return "5xx" when status is 503', () => {
        // Arrange
        const error = { status: 503 };

        // Act
        const result = mapStatusGroupFromError(error);

        // Assert
        expect(result).toBe('5xx');
      });

      it('should return "4xx" when status is 400', () => {
        // Arrange
        const error = { status: 400 };

        // Act
        const result = mapStatusGroupFromError(error);

        // Assert
        expect(result).toBe('4xx');
      });

      it('should return "4xx" when status is 401', () => {
        // Arrange
        const error = { status: 401 };

        // Act
        const result = mapStatusGroupFromError(error);

        // Assert
        expect(result).toBe('4xx');
      });

      it('should return "4xx" when status is 404', () => {
        // Arrange
        const error = { status: 404 };

        // Act
        const result = mapStatusGroupFromError(error);

        // Assert
        expect(result).toBe('4xx');
      });

      it('should return "2xx" when status is 200', () => {
        // Arrange
        const error = { status: 200 };

        // Act
        const result = mapStatusGroupFromError(error);

        // Assert
        expect(result).toBe('2xx');
      });

      it('should return "2xx" when status is 201', () => {
        // Arrange
        const error = { status: 201 };

        // Act
        const result = mapStatusGroupFromError(error);

        // Assert
        expect(result).toBe('2xx');
      });

      it('should return "2xx" when status is 204', () => {
        // Arrange
        const error = { status: 204 };

        // Act
        const result = mapStatusGroupFromError(error);

        // Assert
        expect(result).toBe('2xx');
      });
    });

    describe('when error has response.status field', () => {
      it('should return "429" when response.status is 429', () => {
        // Arrange
        const error = { response: { status: 429 } };

        // Act
        const result = mapStatusGroupFromError(error);

        // Assert
        expect(result).toBe('429');
      });

      it('should return "5xx" when response.status is 500', () => {
        // Arrange
        const error = { response: { status: 500 } };

        // Act
        const result = mapStatusGroupFromError(error);

        // Assert
        expect(result).toBe('5xx');
      });

      it('should return "4xx" when response.status is 404', () => {
        // Arrange
        const error = { response: { status: 404 } };

        // Act
        const result = mapStatusGroupFromError(error);

        // Assert
        expect(result).toBe('4xx');
      });

      it('should return "2xx" when response.status is 200', () => {
        // Arrange
        const error = { response: { status: 200 } };

        // Act
        const result = mapStatusGroupFromError(error);

        // Assert
        expect(result).toBe('2xx');
      });
    });

    describe('when error has statusCode field', () => {
      it('should return "429" when statusCode is 429', () => {
        // Arrange
        const error = { statusCode: 429 };

        // Act
        const result = mapStatusGroupFromError(error);

        // Assert
        expect(result).toBe('429');
      });

      it('should return "5xx" when statusCode is 500', () => {
        // Arrange
        const error = { statusCode: 500 };

        // Act
        const result = mapStatusGroupFromError(error);

        // Assert
        expect(result).toBe('5xx');
      });

      it('should return "4xx" when statusCode is 404', () => {
        // Arrange
        const error = { statusCode: 404 };

        // Act
        const result = mapStatusGroupFromError(error);

        // Assert
        expect(result).toBe('4xx');
      });

      it('should return "2xx" when statusCode is 200', () => {
        // Arrange
        const error = { statusCode: 200 };

        // Act
        const result = mapStatusGroupFromError(error);

        // Assert
        expect(result).toBe('2xx');
      });
    });

    describe('when error has multiple status fields', () => {
      it('should prioritize status over response.status', () => {
        // Arrange
        const error = { status: 400, response: { status: 500 } };

        // Act
        const result = mapStatusGroupFromError(error);

        // Assert
        expect(result).toBe('4xx');
      });

      it('should prioritize status over statusCode', () => {
        // Arrange
        const error = { status: 400, statusCode: 500 };

        // Act
        const result = mapStatusGroupFromError(error);

        // Assert
        expect(result).toBe('4xx');
      });

      it('should prioritize response.status over statusCode when status is not present', () => {
        // Arrange
        const error = { response: { status: 400 }, statusCode: 500 };

        // Act
        const result = mapStatusGroupFromError(error);

        // Assert
        expect(result).toBe('4xx');
      });
    });

    describe('when error has no status field', () => {
      it('should return "timeout" for empty object', () => {
        // Arrange
        const error = {};

        // Act
        const result = mapStatusGroupFromError(error);

        // Assert
        expect(result).toBe('timeout');
      });

      it('should return "timeout" for null', () => {
        // Arrange
        const error = null;

        // Act
        const result = mapStatusGroupFromError(error);

        // Assert
        expect(result).toBe('timeout');
      });

      it('should return "timeout" for undefined', () => {
        // Arrange
        const error = undefined;

        // Act
        const result = mapStatusGroupFromError(error);

        // Assert
        expect(result).toBe('timeout');
      });

      it('should return "timeout" for string', () => {
        // Arrange
        const error = 'error message';

        // Act
        const result = mapStatusGroupFromError(error);

        // Assert
        expect(result).toBe('timeout');
      });

      it('should return "timeout" for number', () => {
        // Arrange
        const error = 500;

        // Act
        const result = mapStatusGroupFromError(error);

        // Assert
        expect(result).toBe('timeout');
      });

      it('should return "timeout" for boolean', () => {
        // Arrange
        const error = true;

        // Act
        const result = mapStatusGroupFromError(error);

        // Assert
        expect(result).toBe('timeout');
      });

      it('should return "timeout" for object without status fields', () => {
        // Arrange
        const error = { message: 'some error', code: 'ERR_TIMEOUT' };

        // Act
        const result = mapStatusGroupFromError(error);

        // Assert
        expect(result).toBe('timeout');
      });
    });

    describe('edge cases', () => {
      it('should return "timeout" when status is undefined', () => {
        // Arrange
        const error = { status: undefined };

        // Act
        const result = mapStatusGroupFromError(error);

        // Assert
        expect(result).toBe('timeout');
      });

      it('should return "timeout" when status is null', () => {
        // Arrange
        const error = { status: null };

        // Act
        const result = mapStatusGroupFromError(error);

        // Assert
        expect(result).toBe('timeout');
      });

      it('should return "timeout" when status is non-numeric string', () => {
        // Arrange
        const error = { status: 'error' as any };

        // Act
        const result = mapStatusGroupFromError(error);

        // Assert
        expect(result).toBe('timeout');
      });

      it('should return "2xx" when status is 1xx (100-199)', () => {
        // Arrange
        const error = { status: 100 };

        // Act
        const result = mapStatusGroupFromError(error);

        // Assert
        expect(result).toBe('2xx');
      });

      it('should return "2xx" when status is 3xx (300-399)', () => {
        // Arrange
        const error = { status: 301 };

        // Act
        const result = mapStatusGroupFromError(error);

        // Assert
        expect(result).toBe('2xx');
      });

      it('should return "4xx" when status is 499', () => {
        // Arrange
        const error = { status: 499 };

        // Act
        const result = mapStatusGroupFromError(error);

        // Assert
        expect(result).toBe('4xx');
      });

      it('should return "5xx" when status is 599', () => {
        // Arrange
        const error = { status: 599 };

        // Act
        const result = mapStatusGroupFromError(error);

        // Assert
        expect(result).toBe('5xx');
      });
    });
  });
});
