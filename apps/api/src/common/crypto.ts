import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
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

/** Ключ задан, но не является ключом: молча хешировать такое нельзя. */
export class BadEncryptionKeyError extends Error {
  constructor() {
    super(
      'TOKEN_ENCRYPTION_KEY должен быть настоящим 32-байтовым ключом: 64 hex-символа ' +
        'или 32 байта в base64. Сгенерируйте его командой openssl rand -hex 32. ' +
        'Короткая осмысленная строка ключом не является, даже если её захешировать.',
    );
  }
}

/**
 * Только настоящий 32-байтовый ключ: hex или base64.
 *
 * Раньше произвольная строка молча прогонялась через sha256 и превращалась
 * в «ключ». Выглядело это как работающее шифрование, а на деле стойкость
 * оказывалась равна стойкости пароля вроде «planner123»: перебор идёт по
 * исходной строке, а не по 256 битам. Худший вид проблемы — тот, что не
 * подаёт признаков.
 */
function key(): Buffer {
  const raw = env.TOKEN_ENCRYPTION_KEY.trim();
  if (!raw) throw new MissingEncryptionKeyError();
  if (/^[0-9a-f]{64}$/i.test(raw)) return Buffer.from(raw, 'hex');
  if (/^[A-Za-z0-9+/]{43}=$|^[A-Za-z0-9+/]{44}$/.test(raw)) {
    const decoded = Buffer.from(raw, 'base64');
    if (decoded.length === 32) return decoded;
  }
  throw new BadEncryptionKeyError();
}

/** Ключ пригоден для работы: и задан, и имеет правильный вид. */
export function encryptionKeyProblem(): MissingEncryptionKeyError | BadEncryptionKeyError | null {
  try {
    key();
    return null;
  } catch (e) {
    return e instanceof MissingEncryptionKeyError || e instanceof BadEncryptionKeyError ? e : null;
  }
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

/**
 * Кривой ключ — это «не настроено», а не «настроено криво»: подключать
 * календарь с ним нельзя, иначе токен окажется зашифрован тем, что ключом
 * не является.
 */
export const isEncryptionConfigured = (): boolean => encryptionKeyProblem() === null;
