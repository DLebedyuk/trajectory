import '../config/load-env.js';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { and, eq } from 'drizzle-orm';
import { addDaysToDateOnly, todayInTimezone } from '@planner/shared';
import * as schema from './schema.js';

const {
  users,
  userSettings,
  userFocus,
  directions,
  projects,
  tasks,
  taskChecklistItems,
  touches,
  reminders,
  menuItems,
  mediaCategories,
  mediaItems,
  inboxItems,
  calendars,
  calendarEvents,
  seedMarkers,
} = schema;

const DEV_USER_ID = process.env.DEV_USER_ID ?? '00000000-0000-4000-8000-000000000001';
const TIMEZONE = process.env.APP_TIMEZONE ?? 'Europe/Moscow';
const MARKER = 'demo-v1';

const TODAY = todayInTimezone(TIMEZONE);
const D = (n: number): string => addDaysToDateOnly(TODAY, n);

/** Детерминированный генератор — чтобы seed давал одинаковую карту касаний. */
let seedState = 20260826;
const rnd = (): number => {
  seedState = (seedState * 1664525 + 1013904223) % 4294967296;
  return seedState / 4294967296;
};

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL не задан');
  const client = postgres(url, { max: 1 });
  const db = drizzle(client, { schema });

  await db
    .insert(users)
    .values({
      id: DEV_USER_ID,
      email: 'demo@planner.local',
      displayName: 'Даша',
      timezone: TIMEZONE,
      locale: 'ru',
    })
    .onConflictDoNothing();
  await db.insert(userSettings).values({ userId: DEV_USER_ID }).onConflictDoNothing();
  await db.insert(userFocus).values({ userId: DEV_USER_ID }).onConflictDoNothing();

  const [marker] = await db
    .select()
    .from(seedMarkers)
    .where(and(eq(seedMarkers.userId, DEV_USER_ID), eq(seedMarkers.marker, MARKER)));
  if (marker) {
    console.log('Демо-данные уже загружены — seed идемпотентен, ничего не меняю.');
    await client.end();
    return;
  }

  const dirDefs = [
    {
      key: 'act',
      name: 'Актёрство',
      color: '--d-act',
      icon: 'act',
      motto: 'Не играть чувство, а делать дело',
      description: 'Роли, монологи, самопробы и всё, что связано со сценой и камерой.',
    },
    {
      key: 'voice',
      name: 'Озвучка',
      color: '--d-voice',
      icon: 'voice',
      motto: 'Сначала дубль, потом мнение о дубле',
      description: 'Коммерческая озвучка, демо, работа с микрофоном и подачей.',
    },
    {
      key: 'vocal',
      name: 'Вокал',
      color: '--d-vocal',
      icon: 'vocal',
      motto: 'Каждый день понемногу лучше, чем раз в месяц много',
      description: 'Голос, дыхание, программа и занятия с педагогом.',
    },
    {
      key: 'eng',
      name: 'Английский',
      color: '--d-eng',
      icon: 'eng',
      motto: 'Двадцать минут каждый день',
      description: 'Произношение, занятия с преподавателем и язык для работы.',
    },
    {
      key: 'phys',
      name: 'Физика',
      color: '--d-phys',
      icon: 'phys',
      motto: 'Понимать, а не запоминать',
      description: 'Курс МФТИ, задачи и научпоп для удовольствия.',
    },
  ];
  const dirIds: Record<string, string> = {};
  for (const [i, d] of dirDefs.entries()) {
    const [row] = await db
      .insert(directions)
      .values({
        userId: DEV_USER_ID,
        name: d.name,
        description: d.description,
        color: d.color,
        icon: d.icon,
        motto: d.motto,
        showMotto: true,
        sortOrder: i,
      })
      .returning();
    dirIds[d.key] = (row as { id: string }).id;
  }

  const projDefs = [
    {
      key: 'demo',
      dir: 'voice',
      title: 'Подготовить демо для сайта',
      outcome:
        'Готовое коммерческое демо из сильных англоязычных записей, которое можно отправлять заказчикам.',
      status: 'active',
      notes: ['Хронометраж держать в пределах 60 секунд — длиннее никто не слушает.'],
    },
    {
      key: 'site',
      dir: 'voice',
      title: 'Обновить сайт озвучки',
      outcome: 'Страница, на которой сразу слышно, как я звучу.',
      status: 'active',
    },
    {
      key: 'pod',
      dir: 'voice',
      title: 'Записать пилот подкаста про голос',
      outcome: 'Один выпуск на 15 минут, чтобы понять, интересно ли это вообще.',
      status: 'paused',
    },
    {
      key: 'ophelia',
      dir: 'act',
      title: 'Подготовить монолог Офелии',
      outcome: 'Монолог, готовый к показу на камеру и на площадке, в двух редакциях перевода.',
      status: 'active',
      deadline: D(12),
    },
    {
      key: 'head',
      dir: 'act',
      title: 'Собрать материалы для сайта',
      outcome: 'Папка с фото, резюме и шоурилом, которую не стыдно отправить агенту.',
      status: 'active',
    },
    {
      key: 'uk',
      dir: 'act',
      title: 'Найти короткий курс в Великобритании',
      outcome: 'Три реальных варианта со сроками подачи и ценами.',
      status: 'paused',
    },
    {
      key: 'stud',
      dir: 'act',
      title: 'Сыграть в студенческом спектакле',
      outcome: 'Сыграно четыре показа.',
      status: 'archived',
    },
    {
      key: 'prog',
      dir: 'vocal',
      title: 'Разобрать программу на три песни',
      outcome: 'Три песни, которые можно спеть без нот и без паники.',
      status: 'active',
    },
    {
      key: 'uku',
      dir: 'vocal',
      title: 'Разучить аккомпанемент на укулеле',
      outcome: 'Аккомпанировать себе хотя бы в одной песне.',
      status: 'paused',
    },
    {
      key: 'john',
      dir: 'eng',
      title: 'Занятия с Джоном',
      outcome: 'Свободная речь на профессиональные темы без подготовки.',
      status: 'active',
      notes: ['Джон просит присылать домашку не позже вечера четверга.'],
    },
    {
      key: 'write',
      dir: 'eng',
      title: 'Подтянуть письменную часть',
      outcome: 'Писать письма и эссе без словаря.',
      status: 'paused',
    },
    {
      key: 'mipt',
      dir: 'phys',
      title: 'Пройти курс МФТИ по подготовке по физике',
      outcome: 'Курс пройден целиком, контрольные сданы.',
      status: 'active',
      deadline: D(34),
    },
    {
      key: 'astro',
      dir: 'phys',
      title: 'Разобраться с основами астрофизики',
      outcome: 'Понимать, о чём говорят в лекциях, без пауз на гугл.',
      status: 'paused',
    },
  ] as const;

  const projIds: Record<string, string> = {};
  for (const [i, p] of projDefs.entries()) {
    const [row] = await db
      .insert(projects)
      .values({
        userId: DEV_USER_ID,
        directionId: dirIds[p.dir] as string,
        title: p.title,
        desiredOutcome: p.outcome,
        status: p.status,
        deadline: 'deadline' in p ? (p.deadline as string) : null,
        notes: 'notes' in p ? ([...(p.notes as readonly string[])] as string[]) : [],
        sortOrder: i,
        completedAt: p.status === 'archived' ? new Date() : null,
      })
      .returning();
    projIds[p.key] = (row as { id: string }).id;
  }

  const taskDefs = [
    { key: 'narration', project: 'demo', title: 'Записать блок narration', est: 'medium' },
    {
      key: 'roll1',
      project: 'demo',
      title: 'Перезаписать рекламный ролик №1',
      est: 'medium',
      pinned: true,
    },
    { project: 'demo', title: 'Перезаписать рекламный ролик №3', est: 'medium' },
    { project: 'demo', title: 'Собрать финальный монтаж', est: 'long' },
    {
      project: 'demo',
      title: 'Отправить референсы звукорежиссёру',
      est: 'short',
      deadline: D(2),
      comment: 'Он ждёт три примера подачи, чтобы понять, что чистить.',
    },
    { project: 'demo', title: 'Разобрать архив записей за год', est: 'long', done: true },
    { project: 'site', title: 'Добавить новое демо', est: 'medium', pinned: true },
    { project: 'site', title: 'Переписать текст о себе', est: 'medium' },
    { project: 'pod', title: 'Набросать темы первых выпусков', est: 'medium' },
    {
      project: 'ophelia',
      title: 'Прогнать монолог с педагогом',
      est: 'medium',
      deadline: D(5),
      exactTime: '18:00',
    },
    {
      key: 'scene',
      project: 'ophelia',
      title: 'Разобрать первую сцену',
      est: 'short',
      pinned: true,
      checklist: ['Разбить на куски', 'Найти событие в каждом куске', 'Проверить на слух'],
    },
    { project: 'ophelia', title: 'Снять черновой прогон на телефон', est: 'medium' },
    { project: 'ophelia', title: 'Выбрать редакцию перевода', est: 'short', done: true },
    { project: 'head', title: 'Написать фотографу про даты', est: 'short', deadline: D(1) },
    {
      project: 'head',
      title: 'Отретушировать две фотографии',
      est: 'medium',
      deadline: D(7),
      pinned: true,
    },
    { project: 'head', title: 'Обновить резюме на английском', est: 'medium' },
    { project: 'uk', title: 'Составить список школ', est: 'medium' },
    { project: 'uk', title: 'Проверить сроки подачи', est: 'short' },
    { project: 'prog', title: 'Выбрать третью песню', est: 'medium' },
    { project: 'prog', title: 'Записать черновик первой', est: 'medium' },
    {
      project: 'prog',
      title: 'Занятие с педагогом',
      est: 'medium',
      deadline: D(3),
      exactTime: '19:00',
    },
    { project: 'uku', title: 'Разучить четыре аккорда', est: 'medium' },
    {
      project: 'john',
      title: 'Отправить домашнее задание Джону',
      est: 'medium',
      deadline: D(0),
      comment: 'Эссе на 250 слов и запись пересказа.',
    },
    { project: 'john', title: 'Прослушать запись прошлого урока', est: 'short' },
    { project: 'john', title: 'Оплатить блок из четырёх занятий', est: 'short', deadline: D(6) },
    { project: 'write', title: 'Разобрать структуру эссе', est: 'medium' },
    { project: 'mipt', title: 'Сдать контрольную по механике', est: 'long', deadline: D(9) },
    { project: 'mipt', title: 'Посмотреть лекцию 4', est: 'medium' },
    { project: 'mipt', title: 'Разобрать задачи из семинара 3', est: 'long' },
    { project: 'mipt', title: 'Прочитать главу про приливные силы', est: 'medium' },
    { project: 'astro', title: 'Посмотреть лекцию про чёрные дыры', est: 'medium' },
  ] as const;

  const taskIds: Record<string, string> = {};
  for (const [i, t] of taskDefs.entries()) {
    const [row] = await db
      .insert(tasks)
      .values({
        userId: DEV_USER_ID,
        projectId: projIds[t.project] as string,
        title: t.title,
        status: 'done' in t && t.done ? 'done' : 'open',
        completedAt: 'done' in t && t.done ? new Date() : null,
        pinned: 'pinned' in t ? Boolean(t.pinned) : false,
        deadline: 'deadline' in t ? (t.deadline as string) : null,
        exactTime: 'exactTime' in t ? (t.exactTime as string) : null,
        estimatedDuration: t.est,
        comment: 'comment' in t ? (t.comment as string) : null,
        sortOrder: i,
      })
      .returning();
    const id = (row as { id: string }).id;
    if ('key' in t && t.key) taskIds[t.key] = id;
    if ('checklist' in t) {
      const list = t.checklist as readonly string[];
      for (const [j, text] of list.entries()) {
        await db
          .insert(taskChecklistItems)
          .values({ taskId: id, text, completed: j === 0, sortOrder: j });
      }
    }
  }

  // фокус: направление «Озвучка», активная задача «Записать блок narration»
  await db
    .update(userFocus)
    .set({ focusDirectionId: dirIds.voice as string, activeTaskId: taskIds.narration as string })
    .where(eq(userFocus.userId, DEV_USER_ID));

  // касания за полгода
  const pool: Record<string, string[]> = {
    act: [
      'Занятие с педагогом',
      'Разбор сцены',
      'Читка вслух',
      'Смотрела спектакль с разбором',
      'Работа над этюдом',
      'Самопроба на камеру',
    ],
    voice: [
      'Запись рекламного ролика',
      'Чистка звука',
      'Тест микрофона',
      'Начитка отрывка',
      'Работа над демо',
    ],
    vocal: ['Распевка', 'Разбор аккордов', 'Пела с аккомпанементом', 'Занятие с педагогом'],
    eng: [
      'RP-гласные',
      'Сериал с разбором акцента',
      'Читала вслух с транскрипцией',
      'Урок с Джоном',
      'Шэдоуинг',
    ],
    phys: [
      'Лекция курса МФТИ',
      'Разбирала задачи',
      'Читала про приливные силы',
      'Семинар с разбором',
    ],
  };
  const rate: Record<string, number> = {
    act: 0.28,
    voice: 0.24,
    vocal: 0.15,
    eng: 0.38,
    phys: 0.2,
  };
  const mainProject: Record<string, string> = {
    act: 'ophelia',
    voice: 'demo',
    vocal: 'prog',
    eng: 'john',
    phys: 'mipt',
  };

  const batch: (typeof touches.$inferInsert)[] = [];
  for (let back = 190; back >= 0; back -= 1) {
    const date = D(-back);
    const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
    for (const key of Object.keys(rate)) {
      let p = rate[key] as number;
      if (dow === 0 || dow === 6) p *= 0.7;
      if (back > 60 && back < 74) p *= 0.15;
      if (back < 24 && key === 'vocal') p *= 0.25;
      if (rnd() < p) {
        const titles = pool[key] as string[];
        batch.push({
          userId: DEV_USER_ID,
          directionId: dirIds[key] as string,
          projectId: rnd() < 0.7 ? (projIds[mainProject[key] as string] as string) : null,
          date,
          title: titles[Math.floor(rnd() * titles.length)] as string,
        });
      }
    }
  }
  const named = [
    { dir: 'act', d: 0, t: 'Разбирала монолог Офелии по кускам', p: 'ophelia' },
    { dir: 'eng', d: 0, t: 'Шэдоуинг по интервью', p: 'john' },
    { dir: 'voice', d: 1, t: 'Прослушала архив и отобрала кандидатов', p: 'demo' },
    { dir: 'eng', d: 1, t: 'Урок с Джоном', p: 'john' },
    { dir: 'phys', d: 2, t: 'Лекция 3 курса МФТИ', p: 'mipt' },
    { dir: 'act', d: 3, t: 'Занятие с педагогом', p: 'ophelia' },
    { dir: 'voice', d: 4, t: 'Тест нового микрофона', p: 'demo' },
    { dir: 'vocal', d: 6, t: 'Распевка и разбор первой песни', p: 'prog' },
  ];
  for (const n of named) {
    batch.push({
      userId: DEV_USER_ID,
      directionId: dirIds[n.dir] as string,
      projectId: projIds[n.p] as string,
      date: D(-n.d),
      title: n.t,
    });
  }
  for (let i = 0; i < batch.length; i += 200) {
    await db.insert(touches).values(batch.slice(i, i + 200));
  }

  await db.insert(reminders).values([
    {
      userId: DEV_USER_ID,
      text: 'Поставить стирку',
      scheduledDate: D(0),
      timezone: TIMEZONE,
      deliveryMode: 'digest',
      source: 'telegram',
      missedBehavior: 'evening',
    },
    {
      userId: DEV_USER_ID,
      text: 'Записаться на английский на субботу',
      scheduledDate: D(0),
      timezone: TIMEZONE,
      deliveryMode: 'digest',
      source: 'web',
      missedBehavior: 'evening',
    },
    {
      userId: DEV_USER_ID,
      text: 'Решить, на какое время перенести доставку',
      scheduledDate: D(0),
      scheduledTime: '20:00',
      timezone: TIMEZONE,
      deliveryMode: 'alert',
      source: 'telegram',
      missedBehavior: 'none',
      comment: 'Слот можно менять до полуночи.',
    },
    {
      userId: DEV_USER_ID,
      text: 'Забрать посылку из пункта выдачи',
      scheduledDate: D(1),
      timezone: TIMEZONE,
      deliveryMode: 'digest',
      source: 'telegram',
      missedBehavior: 'evening',
    },
    {
      userId: DEV_USER_ID,
      text: 'Проверить возврат от Apple',
      scheduledDate: D(8),
      timezone: TIMEZONE,
      deliveryMode: 'digest',
      source: 'web',
      missedBehavior: 'nextDigest',
      comment: 'Обещали до десяти рабочих дней.',
    },
    {
      userId: DEV_USER_ID,
      text: 'Спросить Джона про занятия в октябре',
      scheduledDate: D(14),
      timezone: TIMEZONE,
      deliveryMode: 'digest',
      source: 'telegram',
      missedBehavior: 'evening',
    },
    {
      userId: DEV_USER_ID,
      text: 'Полить цветы',
      scheduledDate: D(2),
      scheduledTime: '10:00',
      timezone: TIMEZONE,
      deliveryMode: 'alert',
      repeatRule: 'weekly',
      source: 'web',
      missedBehavior: 'none',
    },
    {
      userId: DEV_USER_ID,
      text: 'Оплатить занятия по вокалу',
      scheduledDate: D(5),
      timezone: TIMEZONE,
      deliveryMode: 'digest',
      repeatRule: 'monthly',
      source: 'web',
      missedBehavior: 'nextDigest',
    },
    {
      userId: DEV_USER_ID,
      text: 'Купить огурцы и хлеб',
      scheduledDate: D(-1),
      timezone: TIMEZONE,
      deliveryMode: 'digest',
      source: 'telegram',
      status: 'done',
      closedAt: new Date(Date.now() - 86400000),
    },
    {
      userId: DEV_USER_ID,
      text: 'Отдать ключи соседке',
      scheduledDate: D(-3),
      scheduledTime: '09:00',
      timezone: TIMEZONE,
      deliveryMode: 'alert',
      source: 'web',
      status: 'done',
      closedAt: new Date(Date.now() - 3 * 86400000),
    },
    {
      userId: DEV_USER_ID,
      text: 'Забрать пальто из ателье',
      scheduledDate: D(-12),
      timezone: TIMEZONE,
      deliveryMode: 'digest',
      source: 'telegram',
      status: 'done',
      closedAt: new Date(Date.now() - 12 * 86400000),
    },
  ]);

  await db.insert(menuItems).values([
    {
      userId: DEV_USER_ID,
      title: 'Поесть фалафель',
      category: 'еда',
      energy: 'low',
      estimatedTime: 'hour',
      cost: 'cheap',
      place: 'out',
      company: 'any',
      comment: 'Тот, что рядом с театром.',
    },
    {
      userId: DEV_USER_ID,
      title: 'Покататься на лошадях',
      category: 'поездки',
      energy: 'medium',
      estimatedTime: 'hours',
      cost: 'budget',
      place: 'out',
      company: 'withSomeone',
    },
    {
      userId: DEV_USER_ID,
      title: 'Сходить на выставку',
      category: 'события',
      energy: 'low',
      estimatedTime: 'hours',
      cost: 'cheap',
      place: 'out',
      company: 'any',
    },
    {
      userId: DEV_USER_ID,
      title: 'Попробовать японский маникюр',
      category: 'другое',
      energy: 'low',
      estimatedTime: 'hour',
      cost: 'cheap',
      place: 'out',
      company: 'alone',
    },
    {
      userId: DEV_USER_ID,
      title: 'Сделать конфеты',
      category: 'творчество',
      energy: 'high',
      estimatedTime: 'hours',
      cost: 'cheap',
      place: 'home',
      company: 'any',
      comment: 'Нужна поликарбонатная форма.',
    },
    {
      userId: DEV_USER_ID,
      title: 'Погулять в новом месте',
      category: 'прогулки',
      energy: 'low',
      estimatedTime: 'hour',
      cost: 'free',
      place: 'out',
      company: 'any',
    },
    {
      userId: DEV_USER_ID,
      title: 'Собрать серьги из полимерной глины',
      category: 'творчество',
      energy: 'medium',
      estimatedTime: 'hours',
      cost: 'cheap',
      place: 'home',
      company: 'alone',
    },
    {
      userId: DEV_USER_ID,
      title: 'Сходить на джазовый концерт',
      category: 'события',
      energy: 'low',
      estimatedTime: 'hours',
      cost: 'cheap',
      place: 'out',
      company: 'withSomeone',
      tried: true,
    },
  ]);

  const catNames = [
    'научпоп',
    'классика',
    'жвачка для мозгов',
    'языковое',
    'хорроры',
    'драма',
    'комедия',
    'по профессии',
    'другое',
  ];
  const catIds: Record<string, string> = {};
  for (const [i, name] of catNames.entries()) {
    const [row] = await db
      .insert(mediaCategories)
      .values({ userId: DEV_USER_ID, name, sortOrder: i })
      .onConflictDoNothing()
      .returning();
    if (row) catIds[name] = (row as { id: string }).id;
  }

  await db.insert(mediaItems).values([
    {
      userId: DEV_USER_ID,
      kind: 'book',
      title: 'Гордость и предубеждение',
      authorOrDirector: 'Джейн Остин',
      categoryId: catIds['классика'] as string,
      coverEmoji: '📗',
      pinned: true,
      comment: 'Читаю в оригинале, по главе в день.',
      startedAt: D(-11),
    },
    {
      userId: DEV_USER_ID,
      kind: 'book',
      title: 'Работа актёра над собой',
      authorOrDirector: 'Константин Станиславский',
      categoryId: catIds['по профессии'] as string,
      coverEmoji: '📕',
    },
    {
      userId: DEV_USER_ID,
      kind: 'book',
      title: 'Краткая история времени',
      authorOrDirector: 'Стивен Хокинг',
      categoryId: catIds['научпоп'] as string,
      coverEmoji: '📘',
      pinned: true,
      comment: 'Застряла на главе про энтропию.',
      startedAt: D(-70),
    },
    {
      userId: DEV_USER_ID,
      kind: 'book',
      title: 'Дневник Бриджит Джонс',
      authorOrDirector: 'Хелен Филдинг',
      categoryId: catIds['жвачка для мозгов'] as string,
      coverEmoji: '📙',
      rating: 4,
      startedAt: D(-95),
    },
    {
      userId: DEV_USER_ID,
      kind: 'book',
      title: 'Внутренняя игра в теннис',
      authorOrDirector: 'Тимоти Голви',
      categoryId: catIds['по профессии'] as string,
      coverEmoji: '📗',
      comment: 'Советовали для работы с зажимом.',
    },
    {
      userId: DEV_USER_ID,
      kind: 'series',
      title: 'Аббатство Даунтон',
      authorOrDirector: 'Джулиан Феллоуз',
      categoryId: catIds['драма'] as string,
      coverEmoji: '🎬',
      pinned: true,
      comment: 'Заодно слушаю акценты.',
      startedAt: D(-20),
    },
    {
      userId: DEV_USER_ID,
      kind: 'film',
      title: 'Ла-Ла Ленд',
      authorOrDirector: 'Дэмьен Шазелл',
      categoryId: catIds['драма'] as string,
      coverEmoji: '🎞️',
      rating: 5,
      startedAt: D(-120),
    },
    {
      userId: DEV_USER_ID,
      kind: 'film',
      title: 'Дюна: часть вторая',
      authorOrDirector: 'Дени Вильнёв',
      categoryId: catIds['жвачка для мозгов'] as string,
      coverEmoji: '🎥',
    },
    {
      userId: DEV_USER_ID,
      kind: 'series',
      title: 'Корона',
      authorOrDirector: 'Питер Морган',
      categoryId: catIds['драма'] as string,
      coverEmoji: '📺',
      comment: 'Остановилась на третьем сезоне.',
      startedAt: D(-60),
    },
    {
      userId: DEV_USER_ID,
      kind: 'film',
      title: 'Ромео и Джульетта',
      authorOrDirector: 'Франко Дзеффирелли',
      categoryId: catIds['классика'] as string,
      coverEmoji: '🎬',
      comment: 'Для разбора Шекспира.',
    },
  ]);

  const calDefs = [
    { name: 'Работа', provider: 'google', enabled: true },
    { name: 'Личное', provider: 'google', enabled: true },
    { name: 'Семья', provider: 'yandex', enabled: false },
  ];
  const calIds: Record<string, string> = {};
  for (const c of calDefs) {
    const [row] = await db
      .insert(calendars)
      .values({ userId: DEV_USER_ID, name: c.name, provider: c.provider, enabled: c.enabled })
      .returning();
    calIds[c.name] = (row as { id: string }).id;
  }
  await db.insert(calendarEvents).values([
    {
      userId: DEV_USER_ID,
      calendarId: calIds['Работа'] as string,
      title: 'Рабочий созвон',
      date: D(0),
      time: '11:00',
      duration: '1 ч',
    },
    {
      userId: DEV_USER_ID,
      calendarId: calIds['Личное'] as string,
      title: 'Стоматолог',
      date: D(0),
      time: '17:30',
      duration: '40 мин',
    },
    {
      userId: DEV_USER_ID,
      calendarId: calIds['Работа'] as string,
      title: 'Планёрка',
      date: D(1),
      time: '10:00',
      duration: '30 мин',
    },
    {
      userId: DEV_USER_ID,
      calendarId: calIds['Личное'] as string,
      title: 'Занятие с педагогом по вокалу',
      date: D(3),
      time: '19:00',
      duration: '1 ч',
    },
    {
      userId: DEV_USER_ID,
      calendarId: calIds['Семья'] as string,
      title: 'День рождения у мамы',
      date: D(4),
      time: '18:00',
      duration: 'вечер',
    },
  ]);

  await db.insert(inboxItems).values([
    {
      userId: DEV_USER_ID,
      originalText: 'завтра надо не забыть отнести костюм в химчистку',
      source: 'telegram',
    },
    {
      userId: DEV_USER_ID,
      originalText: 'посмотреть «Ромео и Джульетту» Дзеффирелли, говорят стоит',
      source: 'telegram',
    },
    { userId: DEV_USER_ID, originalText: 'может, сделать демо ещё и на русском', source: 'web' },
    {
      userId: DEV_USER_ID,
      originalText: 'кто-то советовал книгу «Внутренняя игра в теннис»',
      source: 'telegram',
    },
    {
      userId: DEV_USER_ID,
      originalText: 'сходить на выставку Фриды в сентябре',
      source: 'telegram',
    },
    {
      userId: DEV_USER_ID,
      originalText: 'спросить у Джона про экзамен CAE и сколько к нему готовиться',
      source: 'web',
    },
  ]);

  await db.insert(seedMarkers).values({ userId: DEV_USER_ID, marker: MARKER });
  console.log(
    `Демо-данные загружены: ${dirDefs.length} направлений, ${projDefs.length} проектов, ${taskDefs.length} задач, ${batch.length} касаний.`,
  );
  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
