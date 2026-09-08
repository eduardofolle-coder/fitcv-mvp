import crypto from 'crypto';
import { env } from '../env.js';

export class EncryptionService {
  private static encryptionKey: Buffer;

  static initialize() {
    // ✅ AES-256-GCM requires 32-byte key
    if (env.DATA_ENCRYPTION_KEY.length < 32) {
      console.warn('⚠️  Encryption key is too short, padding with zeros');
      this.encryptionKey = Buffer.from(env.DATA_ENCRYPTION_KEY.padEnd(32, '0'));
    } else {
      this.encryptionKey = Buffer.from(env.DATA_ENCRYPTION_KEY.slice(0, 32));
    }
  }

  static encrypt(plaintext: string): string {
    if (!this.encryptionKey) this.initialize();

    // ✅ Generate random IV (16 bytes)
    const iv = crypto.randomBytes(16);

    // ✅ Create cipher
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);

    // ✅ Encrypt
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    // ✅ Get auth tag
    const authTag = cipher.getAuthTag();

    // ✅ Return: iv:authTag:ciphertext
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  static decrypt(ciphertext: string): string {
    if (!this.encryptionKey) this.initialize();

    try {
      const [ivHex, authTagHex, encrypted] = ciphertext.split(':');

      if (!ivHex || !authTagHex || !encrypted) {
        throw new Error('Invalid ciphertext format');
      }

      const iv = Buffer.from(ivHex, 'hex');
      const authTag = Buffer.from(authTagHex, 'hex');

      // ✅ Create decipher
      const decipher = crypto.createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
      decipher.setAuthTag(authTag);

      // ✅ Decrypt
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (err) {
      console.error('Decryption failed:', err);
      throw new Error('Failed to decrypt data');
    }
  }
}

// Initialize on import
EncryptionService.initialize();
