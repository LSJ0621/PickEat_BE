import { determineThreshold } from '../../utils/threshold.util';
import { BUG_REPORT_NOTIFICATION } from '@/common/constants/business.constants';

describe('threshold.util', () => {
  describe('determineThreshold', () => {
    it('should return null for count below 10', () => {
      // Arrange & Act & Assert
      expect(determineThreshold(0)).toBeNull();
      expect(determineThreshold(5)).toBeNull();
      expect(determineThreshold(9)).toBeNull();
    });

    it('should return 10 for count between 10 and 19', () => {
      // Arrange & Act & Assert
      expect(determineThreshold(10)).toBe(10);
      expect(determineThreshold(15)).toBe(10);
      expect(determineThreshold(19)).toBe(10);
    });

    it('should return 20 for count between 20 and 29', () => {
      // Arrange & Act & Assert
      expect(determineThreshold(20)).toBe(20);
      expect(determineThreshold(25)).toBe(20);
      expect(determineThreshold(29)).toBe(20);
    });

    it('should return 30 for count between 30 and 49', () => {
      // Arrange & Act & Assert
      expect(determineThreshold(30)).toBe(30);
      expect(determineThreshold(40)).toBe(30);
      expect(determineThreshold(49)).toBe(30);
    });

    it('should return 50 for count between 50 and 99', () => {
      // Arrange & Act & Assert
      expect(determineThreshold(50)).toBe(50);
      expect(determineThreshold(75)).toBe(50);
      expect(determineThreshold(99)).toBe(50);
    });

    it('should return 100 for count 100 or above', () => {
      // Arrange & Act & Assert
      expect(determineThreshold(100)).toBe(100);
      expect(determineThreshold(150)).toBe(100);
      expect(determineThreshold(500)).toBe(100);
      expect(determineThreshold(1000)).toBe(100);
    });

    it('should return null for exactly 0', () => {
      // Arrange & Act
      const result = determineThreshold(0);

      // Assert
      expect(result).toBeNull();
    });

    it('should return correct threshold for exact boundary values', () => {
      // Arrange & Act & Assert
      // Exactly at threshold boundaries
      expect(determineThreshold(10)).toBe(10);
      expect(determineThreshold(20)).toBe(20);
      expect(determineThreshold(30)).toBe(30);
      expect(determineThreshold(50)).toBe(50);
      expect(determineThreshold(100)).toBe(100);
    });

    it('should return correct threshold for values just below boundaries', () => {
      // Arrange & Act & Assert
      // Just below threshold boundaries
      expect(determineThreshold(9)).toBeNull();
      expect(determineThreshold(19)).toBe(10);
      expect(determineThreshold(29)).toBe(20);
      expect(determineThreshold(49)).toBe(30);
      expect(determineThreshold(99)).toBe(50);
    });

    it('should return correct threshold for values just above boundaries', () => {
      // Arrange & Act & Assert
      // Just above threshold boundaries
      expect(determineThreshold(11)).toBe(10);
      expect(determineThreshold(21)).toBe(20);
      expect(determineThreshold(31)).toBe(30);
      expect(determineThreshold(51)).toBe(50);
      expect(determineThreshold(101)).toBe(100);
    });

    it('should handle negative numbers (edge case)', () => {
      // Arrange & Act & Assert
      // Negative numbers should return null (no threshold)
      expect(determineThreshold(-1)).toBeNull();
      expect(determineThreshold(-10)).toBeNull();
      expect(determineThreshold(-100)).toBeNull();
    });

    it('should handle very large numbers', () => {
      // Arrange & Act
      const result = determineThreshold(999999);

      // Assert
      // Should return the highest threshold (100)
      expect(result).toBe(100);
    });

    it('should use thresholds from BUG_REPORT_NOTIFICATION constant', () => {
      // Arrange
      const expectedThresholds = BUG_REPORT_NOTIFICATION.THRESHOLDS;

      // Act & Assert
      // Verify it works with all thresholds from the constant
      expectedThresholds.forEach((threshold) => {
        const result = determineThreshold(threshold);
        expect(result).toBe(threshold);
      });
    });

    it('should return the highest matching threshold', () => {
      // Arrange & Act
      const result = determineThreshold(200);

      // Assert
      // For 200, should return 100 (the highest threshold it exceeds)
      expect(result).toBe(100);
    });

    it('should handle decimal numbers by flooring (implicit Math.floor)', () => {
      // Arrange & Act & Assert
      // JavaScript comparison will handle decimals naturally
      expect(determineThreshold(10.5)).toBe(10);
      expect(determineThreshold(19.9)).toBe(10);
      expect(determineThreshold(20.1)).toBe(20);
      expect(determineThreshold(99.99)).toBe(50);
    });

    it('should iterate thresholds in reverse order to find highest match', () => {
      // Arrange
      const testCount = 55;

      // Act
      const result = determineThreshold(testCount);

      // Assert
      // For 55, should return 50 (not 10, 20, or 30)
      expect(result).toBe(50);
      expect(result).not.toBe(10);
      expect(result).not.toBe(20);
      expect(result).not.toBe(30);
    });

    it('should handle count exactly at middle of range', () => {
      // Arrange & Act & Assert
      expect(determineThreshold(15)).toBe(10); // Middle of 10-19
      expect(determineThreshold(25)).toBe(20); // Middle of 20-29
      expect(determineThreshold(40)).toBe(30); // Middle of 30-49
      expect(determineThreshold(75)).toBe(50); // Middle of 50-99
    });

    it('should return consistent results for same input', () => {
      // Arrange
      const testCount = 42;

      // Act
      const result1 = determineThreshold(testCount);
      const result2 = determineThreshold(testCount);
      const result3 = determineThreshold(testCount);

      // Assert
      expect(result1).toBe(result2);
      expect(result2).toBe(result3);
      expect(result1).toBe(30);
    });

    it('should return null for negative decimals', () => {
      // Arrange & Act & Assert
      expect(determineThreshold(-0.5)).toBeNull();
      expect(determineThreshold(-10.5)).toBeNull();
    });

    it('should handle all threshold boundaries correctly', () => {
      // Arrange
      const testCases = [
        { count: 0, expected: null },
        { count: 9, expected: null },
        { count: 10, expected: 10 },
        { count: 19, expected: 10 },
        { count: 20, expected: 20 },
        { count: 29, expected: 20 },
        { count: 30, expected: 30 },
        { count: 49, expected: 30 },
        { count: 50, expected: 50 },
        { count: 99, expected: 50 },
        { count: 100, expected: 100 },
        { count: 1000, expected: 100 },
      ];

      // Act & Assert
      testCases.forEach(({ count, expected }) => {
        const result = determineThreshold(count);
        expect(result).toBe(expected);
      });
    });
  });
});
