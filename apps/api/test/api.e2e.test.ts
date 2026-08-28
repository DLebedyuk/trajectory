import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { prepareDatabase, TEST_DB_URL, TEST_USER_ID } from './setup.js';

process.env.DATABASE_URL = TEST_DB_URL;
process.env.DEV_AUTH = 'true';
process.env.TELEGRAM_MODE = 'off';
process.env.NODE_ENV = 'test';

let app: INestApplication;
/** Запросы от имени тестового пользователя. */
const api = {
  get: (url: string) => request(app.getHttpServer()).get(url).set('x-user-id', TEST_USER_ID),
  post: (url: string) => request(app.getHttpServer()).post(url).set('x-user-id', TEST_USER_ID),
  patch: (url: string) => request(app.getHttpServer()).patch(url).set('x-user-id', TEST_USER_ID),
  put: (url: string) => request(app.getHttpServer()).put(url).set('x-user-id', TEST_USER_ID),
};

beforeAll(async () => {
  await prepareDatabase();
  const { Test } = await import('@nestjs/testing');
  const { AppModule } = await import('../src/app.module.js');
  const { AllExceptionsFilter } = await import('../src/common/http-exception.filter.js');
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.init();
  // диагностика формата ошибок выполняется отдельным тестом ниже
}, 60_000);

afterAll(async () => {
  await app?.close();
});

describe('вертикальный срез: направление → проект → задача → фокус', () => {
  let directionId = '';
  let otherDirectionId = '';
  let projectId = '';
  let taskId = '';
  let secondTaskId = '';

  it('1. создаёт направление', async () => {
    const res = await api.post('/api/directions').send({ name: 'Озвучка', color: '--d-voice' });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Озвучка');
    directionId = res.body.id;

    const other = await api.post('/api/directions').send({ name: 'Физика', color: '--d-phys' });
    otherDirectionId = other.body.id;
  });

  it('2. создаёт проект внутри направления', async () => {
    const res = await api
      .post('/api/projects')
      .send({ directionId, title: 'Подготовить демо для сайта', desiredOutcome: 'Готовое демо' });
    expect(res.status).toBe(201);
    projectId = res.body.id;
  });

  it('3. создаёт задачу; задача не может существовать без проекта', async () => {
    const res = await api
      .post('/api/tasks')
      .send({ projectId, title: 'Записать блок narration', estimatedDuration: 'medium' });
    expect(res.status).toBe(201);
    taskId = res.body.id;

    const second = await api
      .post('/api/tasks')
      .send({ projectId, title: 'Перезаписать ролик №1', estimatedDuration: 'medium' });
    secondTaskId = second.body.id;

    const bad = await api.post('/api/tasks').send({ title: 'Без проекта' });
    expect(bad.status).toBe(400);
  });

  it('4-5. выбор активной задачи ставит её направление в фокус', async () => {
    const res = await api.post(`/api/tasks/${taskId}/activate`);
    expect(res.status).toBe(201);
    expect(res.body.activeTaskId).toBe(taskId);
    expect(res.body.focusDirectionId).toBe(directionId);
    expect(res.body.activeTask.projectTitle).toBe('Подготовить демо для сайта');
    expect(res.body.activeTask.directionName).toBe('Озвучка');
  });

  it('выбор новой активной задачи снимает предыдущую, но не удаляет её', async () => {
    await api.post(`/api/tasks/${secondTaskId}/activate`);
    const focus = await api.get('/api/focus');
    expect(focus.body.activeTaskId).toBe(secondTaskId);

    const previous = await api.get(`/api/tasks/${taskId}`);
    expect(previous.body.status).toBe('open');

    await api.post(`/api/tasks/${taskId}/activate`);
  });

  it('не допускает расхождения фокуса и активной задачи', async () => {
    const conflict = await api
      .put('/api/focus/direction')
      .send({ directionId: otherDirectionId, onConflict: 'ask' });
    expect(conflict.status).toBe(409);
    expect(conflict.body.error.code).toBe('focus_direction_conflict');

    const kept = await api
      .put('/api/focus/direction')
      .send({ directionId: otherDirectionId, onConflict: 'keepTask' });
    expect(kept.body.focusDirectionId).toBe(directionId);

    const cleared = await api
      .put('/api/focus/direction')
      .send({ directionId: otherDirectionId, onConflict: 'clearTask' });
    expect(cleared.body.focusDirectionId).toBe(otherDirectionId);
    expect(cleared.body.activeTaskId).toBeNull();

    await api.post(`/api/tasks/${taskId}/activate`);
  });

  it('6-7. закрепление показывает связку «проект → задача»', async () => {
    await api.post(`/api/tasks/${secondTaskId}/pin`);
    const pinned = await api.get('/api/tasks/pinned');
    expect(pinned.body).toHaveLength(1);
    expect(pinned.body[0].projectTitle).toBe('Подготовить демо для сайта');
    expect(pinned.body[0].title).toBe('Перезаписать ролик №1');
    expect(pinned.body[0].directionName).toBe('Озвучка');
  });

  it('активная задача не дублируется в закреплённых на главной', async () => {
    await api.post(`/api/tasks/${taskId}/pin`);
    const dashboard = await api.get('/api/dashboard');
    const ids = dashboard.body.pinnedTasks.map((t: { id: string }) => t.id);
    expect(ids).not.toContain(taskId);
    expect(ids).toContain(secondTaskId);
  });

  it('8-9. выполнение активной задачи убирает её из активного и закреплённого', async () => {
    const res = await api.post(`/api/tasks/${taskId}/complete`);
    expect(res.body.status).toBe('done');
    expect(res.body.pinned).toBe(false);

    const focus = await api.get('/api/focus');
    expect(focus.body.activeTaskId).toBeNull();

    const pinned = await api.get('/api/tasks/pinned');
    expect(pinned.body.map((t: { id: string }) => t.id)).not.toContain(taskId);
  });

  it('17. фильтрует задачи проекта', async () => {
    await api.post('/api/tasks').send({
      projectId,
      title: 'Быстрая задача',
      estimatedDuration: 'short',
      deadline: '2026-12-01',
    });

    const all = await api.get('/api/tasks').query({ projectId });
    expect(all.body.length).toBeGreaterThanOrEqual(2);

    const short = await api.get('/api/tasks').query({ projectId, estimatedDuration: 'short' });
    expect(short.body).toHaveLength(1);

    const withDeadline = await api.get('/api/tasks').query({ projectId, withDeadlineOnly: 'true' });
    expect(withDeadline.body).toHaveLength(1);

    const done = await api.get('/api/tasks').query({ projectId, status: 'done' });
    expect(done.body.map((t: { id: string }) => t.id)).toContain(taskId);
    // завершённые не попадают в основной список
    expect(all.body.map((t: { id: string }) => t.id)).not.toContain(taskId);
  });

  it('13-14. архивирование и возврат задачи', async () => {
    const reopened = await api.post(`/api/tasks/${taskId}/reopen`);
    expect(reopened.body.status).toBe('open');
    await api.post(`/api/tasks/${taskId}/complete`);
  });

  it('10. создаёт касание направления', async () => {
    const res = await api
      .post('/api/touches')
      .send({ directionId, date: '2026-08-26', title: 'Тест микрофона', projectId });
    expect(res.status).toBe(201);
    expect(res.body.directionName).toBe('Озвучка');

    const day = await api.get('/api/touches/day/2026-08-26');
    expect(day.body).toHaveLength(1);

    const heatmap = await api.get('/api/touches/heatmap').query({ weeks: 52 });
    expect(heatmap.body.total).toBe(1);
  });

  it('завершение проекта закрывает задачи, но сохраняет касания направления', async () => {
    const res = await api.post(`/api/projects/${projectId}/complete`);
    expect(res.body.status).toBe('archived');
    const heatmap = await api.get('/api/touches/heatmap').query({ weeks: 52 });
    expect(heatmap.body.total).toBe(1);
  });
});

describe('напоминания', () => {
  let reminderId = '';

  it('11. создаёт напоминание через web', async () => {
    const res = await api
      .post('/api/reminders')
      .send({ text: 'Поставить стирку', scheduledDate: '2026-08-27', source: 'web' });
    expect(res.status).toBe(201);
    expect(res.body.deliveryMode).toBe('digest');
    reminderId = res.body.id;
  });

  it('перенос не создаёт долга', async () => {
    const res = await api.post(`/api/reminders/${reminderId}/snooze`).send({ mode: 'tomorrow' });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('active');
  });

  it('15. архив показывает только последние семь дней', async () => {
    const fresh = await api
      .post('/api/reminders')
      .send({ text: 'Свежее', scheduledDate: '2026-08-20', source: 'web' });
    await api.post(`/api/reminders/${fresh.body.id}/complete`);

    const archive = await api.get('/api/reminders/archive');
    expect(archive.body.map((r: { text: string }) => r.text)).toContain('Свежее');
  });

  it('превращает напоминание в задачу выбранного проекта', async () => {
    const dir = await api.post('/api/directions').send({ name: 'Английский' });
    const project = await api
      .post('/api/projects')
      .send({ directionId: dir.body.id, title: 'Занятия с Джоном' });
    const reminder = await api
      .post('/api/reminders')
      .send({ text: 'Оплатить занятия', scheduledDate: '2026-09-01', source: 'web' });

    const res = await api
      .post(`/api/reminders/${reminder.body.id}/to-task`)
      .send({ projectId: project.body.id });
    expect(res.status).toBe(201);
    expect(res.body.task.title).toBe('Оплатить занятия');

    const gone = await api.get('/api/reminders');
    expect(gone.body.map((r: { id: string }) => r.id)).not.toContain(reminder.body.id);
  });

  it('нельзя превратить в задачу без проекта', async () => {
    const reminder = await api
      .post('/api/reminders')
      .send({ text: 'Что-то', scheduledDate: '2026-09-01', source: 'web' });
    const res = await api.post(`/api/reminders/${reminder.body.id}/to-task`).send({});
    expect(res.status).toBe(400);
  });
});

describe('входящие и mock-разбор', () => {
  it('12. добавляет мысль и разбирает вручную', async () => {
    const created = await api
      .post('/api/inbox')
      .send({ originalText: 'сходить на выставку Фриды', source: 'web' });
    expect(created.status).toBe(201);

    const proposals = await api.post('/api/inbox/propose');
    const proposal = proposals.body.find(
      (p: { inboxItemId: string }) => p.inboxItemId === created.body.id,
    );
    expect(proposal.type).toBe('menu');

    const applied = await api.post('/api/inbox/apply').send({ proposals: [proposal] });
    expect(applied.body.applied).toBe(1);

    const menu = await api.get('/api/menu');
    expect(menu.body.map((m: { title: string }) => m.title)).toContain('Сходить на выставку Фриды');
  });

  it('ИИ не выдумывает дату напоминания', async () => {
    const created = await api
      .post('/api/inbox')
      .send({ originalText: 'не забыть позвонить в клинику', source: 'web' });
    const proposals = await api.post('/api/inbox/propose');
    const proposal = proposals.body.find(
      (p: { inboxItemId: string }) => p.inboxItemId === created.body.id,
    );
    expect(proposal.type).toBe('reminder');
    expect(proposal.remindAt).toBeNull();

    const applied = await api.post('/api/inbox/apply').send({ proposals: [proposal] });
    expect(applied.body.applied).toBe(0);
    expect(applied.body.skipped[0].reason).toContain('дата');
  });
});

describe('книги и фильмы', () => {
  it('16. добавляет и закрепляет несколько книг', async () => {
    const a = await api
      .post('/api/media')
      .send({ kind: 'book', title: 'Гордость и предубеждение', coverEmoji: '📗' });
    const b = await api.post('/api/media').send({ kind: 'book', title: 'Краткая история времени' });
    await api.post(`/api/media/${a.body.id}/pin`);
    await api.post(`/api/media/${b.body.id}/pin`);

    const pinned = await api.get('/api/media/pinned');
    expect(pinned.body).toHaveLength(2);

    await api.post(`/api/media/${b.body.id}/unpin`);
    const after = await api.get('/api/media/pinned');
    expect(after.body).toHaveLength(1);
  });
});

describe('система', () => {
  it('health и ready отвечают', async () => {
    expect((await request(app.getHttpServer()).get('/health')).status).toBe(200);
    const ready = await request(app.getHttpServer()).get('/ready');
    expect(ready.body.database).toBe('ok');
  });

  it('ошибки приходят в едином формате', async () => {
    const res = await api.get('/api/directions/00000000-0000-4000-8000-00000000dead');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('not_found');
  });
});
