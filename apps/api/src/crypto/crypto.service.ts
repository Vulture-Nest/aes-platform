import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { AppConfig } from '../config/configuration';

/** Ciphertext marker + version so decrypt() can distinguish encrypted from legacy plaintext. */
const PREFIX = 'enc:v1:';
const IV_LEN = 12; // GCM nonce
const TAG_LEN = 16;

/**
 * Application-layer encryption for sensitive columns at rest (spec §16 / Prompt 10 —
 * bank account numbers). AES-256-GCM with a random per-value nonce; the stored form is
 * `enc:v1:<base64(iv|tag|ciphertext)>`. Values without the marker are treated as legacy
 * plaintext and passed through, so the system stays correct while old rows are migrated.
 *
 * With no PAYROLL_ENCRYPTION_KEY configured the service degrades to a pass-through (a
 * loud warning is logged once) so local/dev without a key still runs; production must set
 * a 32-byte key (hex or base64).
 */
@Injectable()
export class CryptoService {
  private readonly logger = new Logger(CryptoService.name);
  private readonly key: Buffer | null;

  constructor(config: ConfigService<AppConfig, true>) {
    const raw = config.get('security', { infer: true }).encryptionKey;
    this.key = raw ? this.parseKey(raw) : null;
    if (!this.key) {
      this.logger.warn(
        'PAYROLL_ENCRYPTION_KEY not set — sensitive columns will NOT be encrypted at rest',
      );
    }
  }

  /** Accept a 32-byte key as 64 hex chars or base64; reject anything else at boot. */
  private parseKey(raw: string): Buffer {
    const key = /^[0-9a-fA-F]{64}$/.test(raw)
      ? Buffer.from(raw, 'hex')
      : Buffer.from(raw, 'base64');
    if (key.length !== 32) {
      throw new Error('PAYROLL_ENCRYPTION_KEY must decode to 32 bytes (256-bit key)');
    }
    return key;
  }

  /** Encrypt for storage. Null/empty and (no-key) values pass through unchanged. */
  encrypt(plaintext: string | null): string | null {
    if (!plaintext || !this.key) {
      return plaintext;
    }
    const iv = randomBytes(IV_LEN);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return PREFIX + Buffer.concat([iv, tag, enc]).toString('base64');
  }

  /** Decrypt a stored value; legacy plaintext (no marker) and null pass through. */
  decrypt(stored: string | null): string | null {
    if (!stored || !stored.startsWith(PREFIX)) {
      return stored;
    }
    if (!this.key) {
      return stored;
    }
    const buf = Buffer.from(stored.slice(PREFIX.length), 'base64');
    const iv = buf.subarray(0, IV_LEN);
    const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
    const enc = buf.subarray(IV_LEN + TAG_LEN);
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
  }

  /** Decrypt then mask all but the last 4 characters (payroll privacy). */
  maskAccountNo(stored: string | null): string | null {
    const plaintext = this.decrypt(stored);
    if (!plaintext) {
      return plaintext;
    }
    const last4 = plaintext.slice(-4);
    return `${'*'.repeat(Math.max(plaintext.length - 4, 0))}${last4}`;
  }
}
