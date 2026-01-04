import {
  truncateText,
  formatTimeAgo,
  formatBugReportSummary,
} from './discord-format.util';
import {
  BugReportFactory,
  UserFactory,
} from '../../../test/factories/entity.factory';
import { BUG_REPORT_NOTIFICATION } from '@/common/constants/business.constants';

describe('discord-format.util', () => {
  describe('truncateText', () => {
    it('should return original text when shorter than maxLength', () => {
      // Arrange
      const text = 'Short text';
      const maxLength = 20;

      // Act
      const result = truncateText(text, maxLength);

      // Assert
      expect(result).toBe('Short text');
    });

    it('should return original text when exactly at maxLength', () => {
      // Arrange
      const text = 'Exact length';
      const maxLength = 12;

      // Act
      const result = truncateText(text, maxLength);

      // Assert
      expect(result).toBe('Exact length');
    });

    it('should truncate text and add ellipsis when longer than maxLength', () => {
      // Arrange
      const text = 'This is a very long text that needs to be truncated';
      const maxLength = 20;

      // Act
      const result = truncateText(text, maxLength);

      // Assert
      expect(result).toBe('This is a very long ...');
      expect(result.length).toBe(23); // 20 + '...'
    });

    it('should return empty string when text is empty', () => {
      // Arrange
      const text = '';
      const maxLength = 10;

      // Act
      const result = truncateText(text, maxLength);

      // Assert
      expect(result).toBe('');
    });

    it('should return empty string when text is null', () => {
      // Arrange
      const text = null as any;
      const maxLength = 10;

      // Act
      const result = truncateText(text, maxLength);

      // Assert
      expect(result).toBe('');
    });

    it('should return empty string when text is undefined', () => {
      // Arrange
      const text = undefined as any;
      const maxLength = 10;

      // Act
      const result = truncateText(text, maxLength);

      // Assert
      expect(result).toBe('');
    });

    it('should handle text with length 0', () => {
      // Arrange
      const text = '';
      const maxLength = 5;

      // Act
      const result = truncateText(text, maxLength);

      // Assert
      expect(result).toBe('');
    });
  });

  describe('formatTimeAgo', () => {
    it('should return "방금 전" for time less than 1 minute ago', () => {
      // Arrange
      const date = new Date(Date.now() - 30 * 1000); // 30 seconds ago

      // Act
      const result = formatTimeAgo(date);

      // Assert
      expect(result).toBe('방금 전');
    });

    it('should return "방금 전" for current time', () => {
      // Arrange
      const date = new Date();

      // Act
      const result = formatTimeAgo(date);

      // Assert
      expect(result).toBe('방금 전');
    });

    it('should return "N분 전" for time in minutes', () => {
      // Arrange
      const date = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes ago

      // Act
      const result = formatTimeAgo(date);

      // Assert
      expect(result).toBe('5분 전');
    });

    it('should return "1분 전" for exactly 1 minute ago', () => {
      // Arrange
      const date = new Date(Date.now() - 1 * 60 * 1000); // 1 minute ago

      // Act
      const result = formatTimeAgo(date);

      // Assert
      expect(result).toBe('1분 전');
    });

    it('should return "59분 전" for time just under 1 hour', () => {
      // Arrange
      const date = new Date(Date.now() - 59 * 60 * 1000); // 59 minutes ago

      // Act
      const result = formatTimeAgo(date);

      // Assert
      expect(result).toBe('59분 전');
    });

    it('should return "N시간 전" for time in hours', () => {
      // Arrange
      const date = new Date(Date.now() - 3 * 60 * 60 * 1000); // 3 hours ago

      // Act
      const result = formatTimeAgo(date);

      // Assert
      expect(result).toBe('3시간 전');
    });

    it('should return "1시간 전" for exactly 1 hour ago', () => {
      // Arrange
      const date = new Date(Date.now() - 1 * 60 * 60 * 1000); // 1 hour ago

      // Act
      const result = formatTimeAgo(date);

      // Assert
      expect(result).toBe('1시간 전');
    });

    it('should return "23시간 전" for time just under 1 day', () => {
      // Arrange
      const date = new Date(Date.now() - 23 * 60 * 60 * 1000); // 23 hours ago

      // Act
      const result = formatTimeAgo(date);

      // Assert
      expect(result).toBe('23시간 전');
    });

    it('should return "N일 전" for time in days', () => {
      // Arrange
      const date = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000); // 5 days ago

      // Act
      const result = formatTimeAgo(date);

      // Assert
      expect(result).toBe('5일 전');
    });

    it('should return "1일 전" for exactly 1 day ago', () => {
      // Arrange
      const date = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000); // 1 day ago

      // Act
      const result = formatTimeAgo(date);

      // Assert
      expect(result).toBe('1일 전');
    });
  });

  describe('formatBugReportSummary', () => {
    it('should format bug report summary with all fields', () => {
      // Arrange
      const user = UserFactory.create({ email: 'user@example.com' });
      const bug = BugReportFactory.create({
        id: 42,
        category: 'UI/UX',
        title: 'Button not working',
        user,
        createdAt: new Date(Date.now() - 5 * 60 * 1000), // 5 minutes ago
      });

      // Act
      const result = formatBugReportSummary(bug);

      // Assert
      expect(result).toContain('#42');
      expect(result).toContain('[UI/UX]');
      expect(result).toContain('Button not working');
      expect(result).toContain('(user@example.com)');
      expect(result).toContain('5분 전');
    });

    it('should truncate long titles', () => {
      // Arrange
      const longTitle = 'A'.repeat(150); // Longer than DESCRIPTION_PREVIEW_LENGTH
      const user = UserFactory.create();
      const bug = BugReportFactory.create({
        title: longTitle,
        user,
      });

      // Act
      const result = formatBugReportSummary(bug);

      // Assert
      expect(result).toContain('...');
      expect(result).not.toContain(longTitle);
      const titleInResult = result.match(/\[.*?\] (.*) \(/)?.[1] || '';
      expect(titleInResult.length).toBeLessThanOrEqual(
        BUG_REPORT_NOTIFICATION.DESCRIPTION_PREVIEW_LENGTH + 3,
      );
    });

    it('should handle bug report with no user email', () => {
      // Arrange
      const bug = BugReportFactory.create();
      bug.user = null as any; // Simulate missing user

      // Act
      const result = formatBugReportSummary(bug);

      // Assert
      expect(result).toContain('(알 수 없음)');
    });

    it('should handle bug report with undefined user', () => {
      // Arrange
      const bug = BugReportFactory.create();
      bug.user = undefined as any; // Simulate undefined user

      // Act
      const result = formatBugReportSummary(bug);

      // Assert
      expect(result).toContain('(알 수 없음)');
    });

    it('should format with different categories', () => {
      // Arrange
      const user = UserFactory.create();
      const bug = BugReportFactory.create({
        category: 'Performance',
        user,
      });

      // Act
      const result = formatBugReportSummary(bug);

      // Assert
      expect(result).toContain('[Performance]');
    });

    it('should handle recent bug reports (방금 전)', () => {
      // Arrange
      const user = UserFactory.create();
      const bug = BugReportFactory.create({
        user,
        createdAt: new Date(Date.now() - 10 * 1000), // 10 seconds ago
      });

      // Act
      const result = formatBugReportSummary(bug);

      // Assert
      expect(result).toContain('방금 전');
    });

    it('should handle old bug reports (days)', () => {
      // Arrange
      const user = UserFactory.create();
      const bug = BugReportFactory.create({
        user,
        createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
      });

      // Act
      const result = formatBugReportSummary(bug);

      // Assert
      expect(result).toContain('7일 전');
    });

    it('should format with bullet point prefix', () => {
      // Arrange
      const user = UserFactory.create();
      const bug = BugReportFactory.create({ user });

      // Act
      const result = formatBugReportSummary(bug);

      // Assert
      expect(result).toMatch(/^• #\d+/);
    });

    it('should handle short titles without truncation', () => {
      // Arrange
      const user = UserFactory.create();
      const bug = BugReportFactory.create({
        title: 'Short',
        user,
      });

      // Act
      const result = formatBugReportSummary(bug);

      // Assert
      expect(result).toContain('Short');
      expect(result).not.toContain('...');
    });
  });
});
