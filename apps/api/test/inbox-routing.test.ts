import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { prepareDatabase, TEST_DB_URL, TEST_USER_ID } from './setup.js';

process.env.DATABASE_URL = TEST_DB_URL;
process.env.DEV_AUTH = 'true';
process.env.TELEGRAM_MODE = 'off';
process.env.NODE_ENV = 'test';

let app: INestApplication;
const api = {
  get: (url: string) => request(app.getHttpServer()).get(url).set('x-user-id', TEST_USER_ID),
  post: (url: string) => request(app.getHttpServer()).post(url).set('x-user-id', TEST_USER_ID),
  patch: (url: string) => request(app.getHttpServer()).patch(url).set('x-user-id', TEST_USER_ID),
};

let voice = '';
let acting = '';
let demo = '';

const addItem = async (text: string): Promise<string> =>
  (await api.post('/api/inbox').send({ originalText: text, source: 'web' })).body.id;

const applyOne = (proposal: Record<string, unknown>) =>
  api.post('/api/inbox/apply').send({ proposals: [proposal] });

beforeAll(async () => {
  await prepareDatabase();
  const { Test } = await import('@nestjs/testing');
  const { AppModule } = await import('../src/app.module.js');
  const { AllExceptionsFilter } = await import('../src/common/http-exception.filter.js');
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.init();

  // «Актёрство» создаётся первым — именно его прежний код брал бы для любого проекта
  acting = (await api.post('/api/directions').send({ name: 'Актёрство', color: '--d-act' })).body
    .id;
  voice = (await api.post('/api/directions').send({ name: 'Озвучка', color: '--d-voice' })).body.id;
  demo = (await api.post('/api/projects').send({ directionId: voice, title: 'Демо для сайта' }))
    .body.id;
}, 60_000);

afterAll(async () => {
  await app?.close();
});

beforeEach(async () => {
  await api.patch('/api/settings').send({ missedReminderBehavior: 'none' });
});

/**
 * Разбор входящих раньше писал в таблицы напрямую, минуя сервисы, и вторая
 * копия правил разошлась с первой. Здесь проверяется, что запись попадает
 * ровно туда и ровно такой, как если бы её завели в приложении руками.
 */
describe('куда попадают разобранные входящие', () => {
  it('проект заводится в выбранном направлении, а не в первом попавшемся', async () => {
    const id = await addItem('собрать портфолио для озвучки');
    const res = await applyOne({
      inboxItemId: id,
      type: 'project',
      text: 'Портфолио',
      directionId: voice,
    });

    expect(res.body.applied).toBe(1);
    const inVoice = await api.get('/api/projects').query({ directionId: voice });
    const inActing = await api.get('/api/projects').query({ directionId: acting });
    expect(inVoice.body.map((p: { title: string }) => p.title)).toContain('Портфолио');
    expect(inActing.body.map((p: { title: string }) => p.title)).not.toContain('Портфолио');
  });

  it('без направления проект не создаётся, запись остаётся во входящих', async () => {
    const id = await addItem('какой-то большой замысел');
    const res = await applyOne({ inboxItemId: id, type: 'project', text: 'Замысел' });

    expect(res.body.applied).toBe(0);
    expect(res.body.skipped[0].reason).toContain('направление');
    expect((await api.get('/api/inbox')).body.map((i: { id: string }) => i.id)).toContain(id);
  });

  it('проект из входящих живой, а не сразу на паузе', async () => {
    const id = await addItem('новый курс по речи');
    await applyOne({ inboxItemId: id, type: 'project', text: 'Курс по речи', directionId: acting });

    const list = await api.get('/api/projects').query({ directionId: acting });
    const created = list.body.find((p: { title: string }) => p.title === 'Курс по речи');
    expect(created.status).toBe('active');
  });

  it('напоминание со временем — отдельное уведомление, без времени — дневная сводка', async () => {
    const withTime = await addItem('позвонить в студию');
    await applyOne({
      inboxItemId: withTime,
      type: 'reminder',
      text: 'Позвонить в студию',
      remindAt: '2026-12-01',
      remindTime: '10:30',
    });
    const without = await addItem('полить цветы');
    await applyOne({
      inboxItemId: without,
      type: 'reminder',
      text: 'Полить цветы',
      remindAt: '2026-12-01',
    });

    const list = await api.get('/api/reminders');
    const timed = list.body.find((r: { text: string }) => r.text === 'Позвонить в студию');
    const soft = list.body.find((r: { text: string }) => r.text === 'Полить цветы');
    expect(timed.scheduledTime).toBe('10:30');
    expect(timed.deliveryMode).toBe('alert');
    expect(soft.scheduledTime).toBeNull();
    expect(soft.deliveryMode).toBe('digest');
  });

  it('напоминание из входящих слушается настройки «если пропущено»', async () => {
    // раньше здесь молча вставлялось значение по умолчанию из базы — 'evening'
    const id = await addItem('забрать заказ');
    await applyOne({
      inboxItemId: id,
      type: 'reminder',
      text: 'Забрать заказ',
      remindAt: '2026-12-02',
    });

    const list = await api.get('/api/reminders');
    const created = list.body.find((r: { text: string }) => r.text === 'Забрать заказ');
    expect(created.missedBehavior).toBe('none');
  });

  it('задача уходит в выбранный проект и сохраняет дату напоминания', async () => {
    const id = await addItem('переписать вступление');
    await applyOne({
      inboxItemId: id,
      type: 'task',
      text: 'Переписать вступление',
      projectId: demo,
      remindAt: '2026-12-03',
    });

    const tasks = await api.get('/api/tasks').query({ projectId: demo });
    const created = tasks.body.find((t: { title: string }) => t.title === 'Переписать вступление');
    expect(created).toBeTruthy();
    expect(created.remindAt).toBe('2026-12-03');
  });

  it('книга ложится на полку в состоянии «хочу»', async () => {
    const id = await addItem('прочитать Чехова');
    await applyOne({ inboxItemId: id, type: 'book', text: 'Чехов, рассказы' });

    const shelf = await api.get('/api/media').query({ kind: 'book' });
    const created = shelf.body.find((m: { title: string }) => m.title === 'Чехов, рассказы');
    expect(created.status).toBe('want');
  });

  it('тип «заметка в проект» больше не принимается', async () => {
    const id = await addItem('мысль про монолог');
    const res = await applyOne({ inboxItemId: id, type: 'note', text: 'Мысль', projectId: demo });

    expect(res.status).toBe(400);
    expect((await api.get('/api/inbox')).body.map((i: { id: string }) => i.id)).toContain(id);
  });
});
