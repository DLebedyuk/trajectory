import { beforeAll, describe, expect, it } from 'vitest';
import { TEST_DB_URL } from './setup.js';

process.env.DATABASE_URL = TEST_DB_URL;
process.env.NODE_ENV = 'test';
process.env.TELEGRAM_MODE = 'off';
process.env.APP_BASE_URL = 'https://planner.example';

let safeRedirect: typeof import('../src/common/safe-redirect.js').safeRedirect;

beforeAll(async () => {
  ({ safeRedirect } = await import('../src/common/safe-redirect.js'));
});

/**
 * redirectTo приходит из адресной строки и после успешного входа отдаётся
 * браузеру в Location. Внешний адрес здесь — открытый редирект: человек
 * проходит настоящий экран Google и оказывается на чужом сайте.
 */
describe('куда разрешено вернуть браузер после входа', () => {
  it('внутренний путь разрешён и достраивается до полного адреса', () => {
    expect(safeRedirect('/settings')).toBe('https://planner.example/settings');
    expect(safeRedirect('/directions/1?tab=touches')).toBe(
      'https://planner.example/directions/1?tab=touches',
    );
  });

  it('свой origin разрешён', () => {
    expect(safeRedirect('https://planner.example/inbox')).toBe('https://planner.example/inbox');
  });

  it('чужой сайт отвергается', () => {
    expect(safeRedirect('https://evil.example/steal')).toBe('https://planner.example/');
  });

  it('протокол-относительный адрес отвергается', () => {
    // браузер прочитает это как https://evil.example, хотя выглядит как путь
    expect(safeRedirect('//evil.example')).toBe('https://planner.example/');
    expect(safeRedirect('/\\evil.example')).toBe('https://planner.example/');
    expect(safeRedirect('///evil.example')).toBe('https://planner.example/');
  });

  it('чужая схема отвергается', () => {
    expect(safeRedirect('javascript:alert(1)')).toBe('https://planner.example/');
    expect(safeRedirect('data:text/html,<script>1</script>')).toBe('https://planner.example/');
  });

  it('похожий, но чужой хост отвергается', () => {
    expect(safeRedirect('https://planner.example.evil.ru/')).toBe('https://planner.example/');
    expect(safeRedirect('http://planner.example/')).toBe('https://planner.example/');
  });

  it('пусто — возвращаемся туда, куда сказано по умолчанию', () => {
    expect(safeRedirect(undefined)).toBe('https://planner.example/');
    expect(safeRedirect(null)).toBe('https://planner.example/');
    expect(safeRedirect('   ')).toBe('https://planner.example/');
    expect(safeRedirect(undefined, '/settings?calendar=connected')).toBe(
      'https://planner.example/settings?calendar=connected',
    );
  });
});
