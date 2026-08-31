import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

const now = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 320 }).notNull().unique(),
  displayName: varchar('display_name', { length: 120 }).notNull(),
  /** sub из Google ID-токена: стабильный идентификатор аккаунта. */
  googleSub: varchar('google_sub', { length: 64 }).unique(),
  avatarUrl: text('avatar_url'),
  timezone: varchar('timezone', { length: 64 }).notNull().default('Europe/Moscow'),
  locale: varchar('locale', { length: 10 }).notNull().default('ru'),
  createdAt: now(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Серверные сессии. В куке лежит только случайный токен, в базе — его SHA-256:
 * утечка дампа не даёт войти под пользователем.
 */
export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: varchar('token_hash', { length: 64 }).notNull(),
    userAgent: varchar('user_agent', { length: 300 }),
    createdAt: now(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => ({
    byToken: uniqueIndex('sessions_token_hash_idx').on(t.tokenHash),
    byUser: index('sessions_user_idx').on(t.userId, t.expiresAt),
  }),
);

/**
 * Одноразовый state для OAuth: защищает от подделки ответа Google.
 * Хранится в базе, а не в куке, чтобы работать и при строгих SameSite.
 */
export const oauthStates = pgTable(
  'oauth_states',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    state: varchar('state', { length: 64 }).notNull(),
    /** 'login' или 'calendar' — какой сценарий начинали. */
    purpose: varchar('purpose', { length: 20 }).notNull(),
    /** Для календаря: чей аккаунт подключаем. Для входа пусто. */
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    redirectTo: varchar('redirect_to', { length: 500 }),
    createdAt: now(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
  },
  (t) => ({ byState: uniqueIndex('oauth_states_state_idx').on(t.state) }),
);

export const userSettings = pgTable('user_settings', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  digestTime: varchar('digest_time', { length: 5 }).notNull().default('08:30'),
  missedReminderBehavior: varchar('missed_reminder_behavior', { length: 20 })
    .notNull()
    .default('evening'),
  theme: varchar('theme', { length: 10 }).notNull().default('system'),
  hardNotifications: boolean('hard_notifications').notNull().default(true),
  softNotifications: boolean('soft_notifications').notNull().default(true),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Фокус пользователя: одно направление и одна активная задача на весь аккаунт. */
export const userFocus = pgTable('user_focus', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  focusDirectionId: uuid('focus_direction_id'),
  activeTaskId: uuid('active_task_id'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const telegramAccounts = pgTable(
  'telegram_accounts',
  {
    telegramUserId: varchar('telegram_user_id', { length: 40 }).primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    chatId: varchar('chat_id', { length: 40 }).notNull(),
    /** Как подписан в Telegram — чтобы в настройках было видно, что подключено. */
    telegramUsername: varchar('telegram_username', { length: 64 }),
    createdAt: now(),
  },
  (t) => ({
    // у одного пользователя ровно один действующий Telegram: иначе старый чат
    // остаётся живым и продолжает класть записи в аккаунт после переезда
    userIdx: uniqueIndex('telegram_accounts_user_idx').on(t.userId),
  }),
);

/**
 * Одноразовый код связывания. Пользователь получает его в приложении и
 * отправляет боту: так аккаунт Telegram привязывается именно к тому, кто
 * нажал кнопку, а не к первому написавшему.
 */
export const telegramLinkCodes = pgTable(
  'telegram_link_codes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    code: varchar('code', { length: 32 }).notNull(),
    createdAt: now(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
  },
  (t) => ({ byCode: uniqueIndex('telegram_link_codes_code_idx').on(t.code) }),
);

export const directions = pgTable(
  'directions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 120 }).notNull(),
    description: text('description'),
    color: varchar('color', { length: 40 }).notNull().default('--d-eng'),
    icon: varchar('icon', { length: 40 }).notNull().default('spark'),
    motto: varchar('motto', { length: 300 }),
    showMotto: boolean('show_motto').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: now(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ byUser: index('directions_user_idx').on(t.userId, t.sortOrder) }),
);

export const projects = pgTable(
  'projects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    directionId: uuid('direction_id')
      .notNull()
      .references(() => directions.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 200 }).notNull(),
    desiredOutcome: text('desired_outcome'),
    status: varchar('status', { length: 20 }).notNull().default('active'),
    deadline: date('deadline'),
    sortOrder: integer('sort_order').notNull().default(0),
    notes: jsonb('notes').$type<string[]>().notNull().default([]),
    createdAt: now(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ byDirection: index('projects_direction_idx').on(t.directionId, t.sortOrder) }),
);

export const tasks = pgTable(
  'tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 300 }).notNull(),
    status: varchar('status', { length: 10 }).notNull().default('open'),
    pinned: boolean('pinned').notNull().default(false),
    deadline: date('deadline'),
    exactTime: varchar('exact_time', { length: 5 }),
    estimatedDuration: varchar('estimated_duration', { length: 10 }),
    remindAt: date('remind_at'),
    comment: text('comment'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: now(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byProject: index('tasks_project_idx').on(t.projectId, t.sortOrder),
    byPinned: index('tasks_pinned_idx').on(t.userId, t.pinned),
    byDeadline: index('tasks_deadline_idx').on(t.userId, t.deadline),
  }),
);

export const taskChecklistItems = pgTable(
  'task_checklist_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    text: varchar('text', { length: 300 }).notNull(),
    completed: boolean('completed').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => ({ byTask: index('checklist_task_idx').on(t.taskId, t.sortOrder) }),
);

export const touches = pgTable(
  'touches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    directionId: uuid('direction_id')
      .notNull()
      .references(() => directions.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
    date: date('date').notNull(),
    title: varchar('title', { length: 300 }).notNull(),
    comment: text('comment'),
    createdAt: now(),
  },
  (t) => ({ byUserDate: index('touches_user_date_idx').on(t.userId, t.date) }),
);

export const reminders = pgTable(
  'reminders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    text: varchar('text', { length: 500 }).notNull(),
    scheduledDate: date('scheduled_date').notNull(),
    scheduledTime: varchar('scheduled_time', { length: 5 }),
    timezone: varchar('timezone', { length: 64 }).notNull(),
    deliveryMode: varchar('delivery_mode', { length: 10 }).notNull().default('digest'),
    repeatRule: varchar('repeat_rule', { length: 10 }),
    missedBehavior: varchar('missed_behavior', { length: 20 }).notNull().default('evening'),
    source: varchar('source', { length: 10 }).notNull().default('web'),
    comment: text('comment'),
    status: varchar('status', { length: 10 }).notNull().default('active'),
    createdAt: now(),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ byUserDate: index('reminders_user_date_idx').on(t.userId, t.status, t.scheduledDate) }),
);

/**
 * Одна попытка доставки. idempotencyKey уникален, поэтому перезапуск
 * приложения не приводит к повторной отправке уже отправленного напоминания.
 */
export const reminderDeliveries = pgTable(
  'reminder_deliveries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Доставка относится либо к напоминанию, либо к задаче с remindAt. */
    reminderId: uuid('reminder_id').references(() => reminders.id, { onDelete: 'cascade' }),
    taskId: uuid('task_id').references(() => tasks.id, { onDelete: 'cascade' }),
    scheduledFor: timestamp('scheduled_for', { withTimezone: true }).notNull(),
    channel: varchar('channel', { length: 20 }).notNull().default('telegram'),
    status: varchar('status', { length: 12 }).notNull().default('pending'),
    attemptCount: integer('attempt_count').notNull().default(0),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    error: text('error'),
    idempotencyKey: varchar('idempotency_key', { length: 200 }).notNull(),
    createdAt: now(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqueKey: uniqueIndex('reminder_deliveries_idempotency_key_idx').on(t.idempotencyKey),
    byStatus: index('reminder_deliveries_status_idx').on(t.status, t.scheduledFor),
  }),
);

export const inboxItems = pgTable(
  'inbox_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    originalText: text('original_text').notNull(),
    source: varchar('source', { length: 10 }).notNull().default('web'),
    status: varchar('status', { length: 12 }).notNull().default('new'),
    proposedType: varchar('proposed_type', { length: 20 }),
    createdAt: now(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
  },
  (t) => ({ byUser: index('inbox_user_idx').on(t.userId, t.status) }),
);

export const menuItems = pgTable(
  'menu_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 200 }).notNull(),
    category: varchar('category', { length: 60 }).notNull().default('другое'),
    energy: varchar('energy', { length: 10 }).notNull().default('medium'),
    estimatedTime: varchar('estimated_time', { length: 10 }).notNull().default('hour'),
    cost: varchar('cost', { length: 10 }).notNull().default('cheap'),
    place: varchar('place', { length: 10 }).notNull().default('out'),
    company: varchar('company', { length: 15 }).notNull().default('any'),
    comment: text('comment'),
    link: varchar('link', { length: 500 }),
    tried: boolean('tried').notNull().default(false),
    createdAt: now(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ byUser: index('menu_user_idx').on(t.userId) }),
);

export const mediaCategories = pgTable(
  'media_categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 60 }).notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => ({ byUser: uniqueIndex('media_categories_user_name_idx').on(t.userId, t.name) }),
);

export const mediaItems = pgTable(
  'media_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: varchar('kind', { length: 10 }).notNull(),
    title: varchar('title', { length: 300 }).notNull(),
    authorOrDirector: varchar('author_or_director', { length: 200 }),
    categoryId: uuid('category_id').references(() => mediaCategories.id, { onDelete: 'set null' }),
    coverUrl: varchar('cover_url', { length: 500 }),
    coverEmoji: varchar('cover_emoji', { length: 8 }),
    pinned: boolean('pinned').notNull().default(false),
    comment: text('comment'),
    link: varchar('link', { length: 500 }),
    startedAt: date('started_at'),
    /** want | doing | done — «хочу», «в процессе», «закончила». */
    status: varchar('status', { length: 10 }).notNull().default('want'),
    rating: smallint('rating').notNull().default(0),
    createdAt: now(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ byUser: index('media_user_idx').on(t.userId, t.kind) }),
);

/**
 * Подключённые календари и их события. В первой итерации наполняются seed-ом:
 * синхронизация с Google Calendar и Яндекс Календарём — следующий этап.
 */
/**
 * Доступ к Google API отдельно от входа: вход даёт только личность, календарь —
 * второе, явное согласие. Refresh-токен лежит зашифрованным (AES-256-GCM).
 */
export const googleCredentials = pgTable('google_credentials', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  refreshTokenEnc: text('refresh_token_enc').notNull(),
  accessTokenEnc: text('access_token_enc'),
  accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
  scope: text('scope').notNull(),
  connectedAt: now(),
  lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
  /** Заполняется, когда Google перестал принимать токен: доступ отозвали. */
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  lastError: text('last_error'),
});

export const calendars = pgTable(
  'calendars',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 120 }).notNull(),
    provider: varchar('provider', { length: 20 }).notNull().default('google'),
    /** id календаря у провайдера: по нему список обновляется без дублей. */
    externalId: varchar('external_id', { length: 200 }),
    enabled: boolean('enabled').notNull().default(true),
    createdAt: now(),
  },
  (t) => ({
    byExternal: uniqueIndex('calendars_user_external_idx').on(t.userId, t.externalId),
  }),
);

export const calendarEvents = pgTable(
  'calendar_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    calendarId: uuid('calendar_id')
      .notNull()
      .references(() => calendars.id, { onDelete: 'cascade' }),
    /** id события у провайдера: повторная синхронизация обновляет, а не дублирует. */
    externalId: varchar('external_id', { length: 300 }),
    title: varchar('title', { length: 300 }).notNull(),
    date: date('date').notNull(),
    time: varchar('time', { length: 5 }).notNull(),
    duration: varchar('duration', { length: 40 }),
    allDay: boolean('all_day').notNull().default(false),
    createdAt: now(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byUserDate: index('calendar_events_user_date_idx').on(t.userId, t.date),
    byExternal: uniqueIndex('calendar_events_external_idx').on(t.calendarId, t.externalId),
  }),
);

/** Служебная таблица для идемпотентного seed. */
export const seedMarkers = pgTable(
  'seed_markers',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    marker: varchar('marker', { length: 80 }).notNull(),
    createdAt: now(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.userId, t.marker] }) }),
);
