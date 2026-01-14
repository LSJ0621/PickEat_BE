import { EncryptionUtil } from '../utils/encryption.util';

describe('EncryptionUtil', () => {
  let encryptionUtil: EncryptionUtil;

  beforeEach(() => {
    encryptionUtil = new EncryptionUtil('test-encryption-key-32chars!!');
  });

  describe('encrypt and decrypt', () => {
    it('should encrypt and decrypt correctly', () => {
      // Arrange
      const plaintext = 'https://discord.com/api/webhooks/123/abc';

      // Act
      const encrypted = encryptionUtil.encrypt(plaintext);
      const decrypted = encryptionUtil.decrypt(encrypted);

      // Assert
      expect(decrypted).toBe(plaintext);
    });

    it('should produce encrypted value different from plaintext', () => {
      // Arrange
      const plaintext = 'test';

      // Act
      const encrypted = encryptionUtil.encrypt(plaintext);

      // Assert
      expect(encrypted).not.toBe(plaintext);
      expect(encrypted.length).toBeGreaterThan(plaintext.length);
    });

    it('should encrypt same plaintext to different ciphertexts', () => {
      // Arrange
      const plaintext = 'https://discord.com/api/webhooks/123/abc';

      // Act
      const encrypted1 = encryptionUtil.encrypt(plaintext);
      const encrypted2 = encryptionUtil.encrypt(plaintext);

      // Assert
      expect(encrypted1).not.toBe(encrypted2); // Different IVs
      expect(encryptionUtil.decrypt(encrypted1)).toBe(plaintext);
      expect(encryptionUtil.decrypt(encrypted2)).toBe(plaintext);
    });

    it('should encrypt and decrypt empty string', () => {
      // Arrange
      const plaintext = '';

      // Act
      const encrypted = encryptionUtil.encrypt(plaintext);
      const decrypted = encryptionUtil.decrypt(encrypted);

      // Assert
      expect(decrypted).toBe(plaintext);
      expect(encrypted).not.toBe('');
    });

    it('should encrypt and decrypt long text', () => {
      // Arrange
      const plaintext =
        'https://discord.com/api/webhooks/1234567890/abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_very-long-webhook-url-for-testing-purposes';

      // Act
      const encrypted = encryptionUtil.encrypt(plaintext);
      const decrypted = encryptionUtil.decrypt(encrypted);

      // Assert
      expect(decrypted).toBe(plaintext);
    });

    it('should encrypt and decrypt text with special characters', () => {
      // Arrange
      const plaintext =
        'https://example.com/webhook?key=value&special=!@#$%^&*()';

      // Act
      const encrypted = encryptionUtil.encrypt(plaintext);
      const decrypted = encryptionUtil.decrypt(encrypted);

      // Assert
      expect(decrypted).toBe(plaintext);
    });

    it('should encrypt and decrypt unicode text', () => {
      // Arrange
      const plaintext = 'https://example.com/웹훅/테스트/한글/日本語/中文';

      // Act
      const encrypted = encryptionUtil.encrypt(plaintext);
      const decrypted = encryptionUtil.decrypt(encrypted);

      // Assert
      expect(decrypted).toBe(plaintext);
    });

    it('should produce encrypted data in correct format', () => {
      // Arrange
      const plaintext = 'test';

      // Act
      const encrypted = encryptionUtil.encrypt(plaintext);

      // Assert
      const parts = encrypted.split(':');
      expect(parts).toHaveLength(3);
      // IV should be 32 hex characters (16 bytes)
      expect(parts[0]).toHaveLength(32);
      expect(/^[0-9a-f]+$/.test(parts[0])).toBe(true);
      // Auth tag should be 32 hex characters (16 bytes)
      expect(parts[1]).toHaveLength(32);
      expect(/^[0-9a-f]+$/.test(parts[1])).toBe(true);
      // Encrypted data is hex encoded
      expect(/^[0-9a-f]+$/.test(parts[2])).toBe(true);
    });

    it('should throw error when decrypting invalid format', () => {
      // Arrange
      const invalidEncrypted = 'invalid-format';

      // Act & Assert
      expect(() => encryptionUtil.decrypt(invalidEncrypted)).toThrow(
        'Invalid encrypted data format',
      );
    });

    it('should throw error when decrypting with wrong format (missing parts)', () => {
      // Arrange
      const invalidEncrypted = 'part1:part2'; // Only 2 parts instead of 3

      // Act & Assert
      expect(() => encryptionUtil.decrypt(invalidEncrypted)).toThrow(
        'Invalid encrypted data format',
      );
    });

    it('should throw error when decrypting with corrupted data', () => {
      // Arrange
      const plaintext = 'test';
      const encrypted = encryptionUtil.encrypt(plaintext);
      const parts = encrypted.split(':');
      // Corrupt the encrypted data by changing one character
      parts[2] = parts[2].substring(0, parts[2].length - 2) + 'ff';
      const corruptedEncrypted = parts.join(':');

      // Act & Assert
      expect(() => encryptionUtil.decrypt(corruptedEncrypted)).toThrow();
    });

    it('should use different encryption keys correctly', () => {
      // Arrange
      const plaintext = 'test';
      const util1 = new EncryptionUtil('key1-must-be-long-enough-32ch');
      const util2 = new EncryptionUtil('key2-must-be-different-32char');

      // Act
      const encrypted1 = util1.encrypt(plaintext);
      const encrypted2 = util2.encrypt(plaintext);

      // Assert
      expect(util1.decrypt(encrypted1)).toBe(plaintext);
      expect(util2.decrypt(encrypted2)).toBe(plaintext);
      // Cannot decrypt with wrong key
      expect(() => util1.decrypt(encrypted2)).toThrow();
      expect(() => util2.decrypt(encrypted1)).toThrow();
    });
  });

  describe('maskUrl', () => {
    it('should mask long URL correctly', () => {
      // Arrange
      const url = 'https://discord.com/api/webhooks/123456789/abcdefghijklmnop';
      // URL length: 59, first 30 chars + '...' + last 10 chars

      // Act
      const masked = EncryptionUtil.maskUrl(url);

      // Assert
      expect(masked).toBe('https://discord.com/api/webhoo...ghijklmnop');
      expect(masked).toContain('...');
      expect(masked.length).toBeLessThan(url.length);
    });

    it('should not mask short URL', () => {
      // Arrange
      const url = 'https://example.com';

      // Act
      const masked = EncryptionUtil.maskUrl(url);

      // Assert
      expect(masked).toBe(url);
      expect(masked).not.toContain('...');
    });

    it('should return empty string for empty input', () => {
      // Arrange
      const url = '';

      // Act
      const masked = EncryptionUtil.maskUrl(url);

      // Assert
      expect(masked).toBe('');
    });

    it('should handle null input', () => {
      // Arrange
      const url = null as unknown as string;

      // Act
      const masked = EncryptionUtil.maskUrl(url);

      // Assert
      expect(masked).toBe('');
    });

    it('should handle undefined input', () => {
      // Arrange
      const url = undefined as unknown as string;

      // Act
      const masked = EncryptionUtil.maskUrl(url);

      // Assert
      expect(masked).toBe('');
    });

    it('should show first 30 and last 10 characters for long URLs', () => {
      // Arrange
      const url =
        'https://discord.com/api/webhooks/1234567890/abcdefghijklmnopqrstuvwxyz';

      // Act
      const masked = EncryptionUtil.maskUrl(url);

      // Assert
      expect(masked).toBe('https://discord.com/api/webhoo...qrstuvwxyz');
      expect(masked.substring(0, 30)).toBe(url.substring(0, 30));
      expect(masked.substring(masked.length - 10)).toBe(
        url.substring(url.length - 10),
      );
    });

    it('should handle URL with exactly 40 characters', () => {
      // Arrange
      const url = 'https://example.com/path/1234567890ab';

      // Act
      const masked = EncryptionUtil.maskUrl(url);

      // Assert
      expect(masked).toBe(url);
      expect(masked).not.toContain('...');
    });

    it('should mask URL with exactly 41 characters', () => {
      // Arrange
      const url = 'https://example.com/path/1234567890abcdef'; // 41 characters

      // Act
      const masked = EncryptionUtil.maskUrl(url);

      // Assert
      expect(masked).toContain('...');
      // first 30 + '...' + last 10 = 30 + 3 + 10 = 43 chars in masked string
      expect(masked).toBe('https://example.com/path/12345...7890abcdef');
    });
  });
});
