import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { env } from '../config/env.js';

/**
 * Шифрование секретов, которые обязаны лежать в базе в открытом виде как можно
 * меньше: refresh-токены Google. AES-256-GCM — с проверкой целостности, чтобы
 * подменённое значение не расшифровалось молча.
 *
 * Ключ берётся из TOKEN_ENCRYPTION_KEY. Если он не задан — шифровать нечем, и
 * мы отказываемся сохранять токен, а не кладём его открытым.
 */
export class MissingEncryptionKeyError extends Error {
  constructor() {
    super(
      'TOKEN_ENCRYPTION_KEY не задан. Без него refresh-токен Google хранить негде: ' +
        'сгенерируйте 32 байта (openssl rand -hex 32) и положите в .env.',
    );
  }
}

function key(): Buffer {
  const raw = env.TOKEN_ENCRYPTION_KEY;
  if (!raw) throw new MissingEncryptionKeyError();
  // допускаем hex, base64 и произвольную строку — приводим к 32 байтам
  if (/^[0-9a-f]{64}$/i.test(raw)) return Buffer.from(raw, 'hex');
  const decoded = Buffer.from(raw, 'base64');
  if (decoded.length === 32) return decoded;
  return createHash('sha256').update(raw).digest();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [
    iv.toString('base64'),
    cipher.getAuthTag().toString('base64'),
    enc.toString('base64'),
  ].join('.');
}

export function decryptSecret(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split('.');
  if (!ivB64 || !tagB64 || !dataB64) throw new Error('Повреждённый зашифрованный секрет');
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

export const isEncryptionConfigured = (): boolean => Boolean(env.TOKEN_ENCRYPTION_KEY);
