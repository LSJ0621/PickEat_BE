import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;

export class EncryptionUtil {
  private readonly key: Buffer;

  constructor(encryptionKey: string) {
    // Derive a 32-byte key from the provided key using SHA-256
    this.key = crypto.createHash('sha256').update(encryptionKey).digest();
  }

  /**
   * Encrypts plaintext using AES-256-GCM
   * @returns encrypted string in format: iv:authTag:encrypted (hex encoded)
   */
  encrypt(plaintext: string): string {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, this.key, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  /**
   * Decrypts encrypted data using AES-256-GCM
   * @param encryptedData encrypted string in format: iv:authTag:encrypted
   */
  decrypt(encryptedData: string): string {
    const parts = encryptedData.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted data format');
    }

    const [ivHex, authTagHex, encrypted] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    const decipher = crypto.createDecipheriv(ALGORITHM, this.key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * Masks a URL for display purposes
   * Shows first 30 and last 10 characters
   */
  static maskUrl(url: string): string {
    if (!url) {
      return '';
    }

    if (url.length <= 40) {
      return url;
    }

    const first = url.substring(0, 30);
    const last = url.substring(url.length - 10);
    return `${first}...${last}`;
  }
}
