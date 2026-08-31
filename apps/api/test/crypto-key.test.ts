import { afterEach, describe, expect, it, vi } from 'vitest';
import { TEST_DB_URL } from './setup.js';

process.env.DATABASE_URL = TEST_DB_URL;
process.env.NODE_ENV = 'test';
process.env.TELEGRAM_MODE = 'off';

/** Модуль читает env один раз при импорте — поэтому импортируем заново на каждый ключ. */
async function withKey(value: string) {
  vi.resetModules();
  process.env.TOKEN_ENCRYPTION_KEY = value;
  return import('../src/common/crypto.js');
}

afterEach(() => {
  vi.resetModules();
});

/**
 * Раньше любая строка молча превращалась в ключ через sha256. Шифрование
 * выглядело работающим, а стойкость была равна стойкости этой строки:
 * перебор шёл бы по ней, а не по 256 битам.
 */
describe('ключ шифрования', () => {
  it('64 hex-символа принимаются', async () => {
    const { isEncryptionConfigured, encryptSecret, decryptSecret } = await withKey('a'.repeat(64));
    expect(isEncryptionConfigured()).toBe(true);
    expect(decryptSecret(encryptSecret('секрет'))).toBe('секрет');
  });

  it('32 байта в base64 принимаются', async () => {
    const base64 = Buffer.alloc(32, 7).toString('base64');
    const { isEncryptionConfigured, encryptSecret, decryptSecret } = await withKey(base64);
    expect(isEncryptionConfigured()).toBe(true);
    expect(decryptSecret(encryptSecret('секрет'))).toBe('секрет');
  });

  it('короткая осмысленная строка отвергается с понятной ошибкой', async () => {
    const { isEncryptionConfigured, encryptSecret, BadEncryptionKeyError } =
      await withKey('planner123');
    expect(isEncryptionConfigured()).toBe(false);
    expect(() => encryptSecret('секрет')).toThrow(BadEncryptionKeyError);
    expect(() => encryptSecret('секрет')).toThrow(/openssl rand -hex 32/);
  });

  it('hex не той длины отвергается', async () => {
    const { isEncryptionConfigured } = await withKey('abcdef0123456789');
    expect(isEncryptionConfigured()).toBe(false);
  });

  it('пустой ключ — это «не задан», а не «кривой»', async () => {
    const { isEncryptionConfigured, encryptSecret, MissingEncryptionKeyError } = await withKey('');
    expect(isEncryptionConfigured()).toBe(false);
    expect(() => encryptSecret('секрет')).toThrow(MissingEncryptionKeyError);
  });
});
