import { truncateText } from '../../utils/discord-format.util';

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
      const text = null as unknown as string;
      const maxLength = 10;

      // Act
      const result = truncateText(text, maxLength);

      // Assert
      expect(result).toBe('');
    });

    it('should return empty string when text is undefined', () => {
      // Arrange
      const text = undefined as unknown as string;
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
});
