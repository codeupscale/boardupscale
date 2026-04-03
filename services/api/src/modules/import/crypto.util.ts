import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // bytes
const TAG_LENGTH = 16; // bytes
const KEY_LENGTH = 32; // bytes (256-bit)

/**
 * Derive a 32-byte AES key from the application secret using SHA-256.
 * Consistent across restarts as long as APP_SECRET does not change.
 */
function deriveKey(secret: string): Buffer {
  return crypto.createHash('sha256').update(secret).digest();
}

/**
 * Encrypt plaintext with AES-256-GCM.
 * Returns a base64 string of the format: iv(16) + ciphertext + tag(16)
 */
export function encrypt(plaintext: string, secret: string): string {
  const key = deriveKey(secret);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);

  const tag = cipher.getAuthTag();

  // Pack: iv || ciphertext || tag
  const packed = Buffer.concat([iv, encrypted, tag]);
  return packed.toString('base64');
}

/**
 * Decrypt a base64 string produced by encrypt().
 * Throws if the authentication tag does not match (tampered data).
 */
export function decrypt(encoded: string, secret: string): string {
  const key = deriveKey(secret);
  const packed = Buffer.from(encoded, 'base64');

  if (packed.length < IV_LENGTH + TAG_LENGTH) {
    throw new Error('Invalid encrypted value: too short');
  }

  const iv = packed.slice(0, IV_LENGTH);
  const tag = packed.slice(packed.length - TAG_LENGTH);
  const ciphertext = packed.slice(IV_LENGTH, packed.length - TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  return decipher.update(ciphertext) + decipher.final('utf8');
}
