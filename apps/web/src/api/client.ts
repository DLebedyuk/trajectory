import type {
  ApplyInboxResult,
  CreateDirectionInput,
  CreateInboxItemInput,
  CreateMediaItemInput,
  CreateMenuItemInput,
  CreateProjectInput,
  CreateReminderInput,
  CreateTaskInput,
  CreateTouchInput,
  Direction,
  DirectionWithStats,
  Focus,
  Heatmap,
  InboxItem,
  InboxProposal,
  MediaCategory,
  MediaItem,
  MenuFilter,
  MenuItem,
  Project,
  ProjectWithFlags,
  Reminder,
  ReminderToTaskInput,
  Settings,
  SnoozeReminderInput,
  CreateTravelItemInput,
  CreateTripChecklistItemInput,
  CreateTripInput,
  Task,
  TaskFilter,
  TaskWithContext,
  TouchWithContext,
  TravelCategory,
  TravelItem,
  Trip,
  TripChecklistItem,
  TripWithStats,
  UpdateDirectionInput,
  UpdateMediaItemInput,
  UpdateMenuItemInput,
  UpdateProjectInput,
  UpdateReminderInput,
  UpdateSettingsInput,
  UpdateTaskInput,
  UpdateTravelItemInput,
  UpdateTripChecklistItemInput,
  UpdateTripInput,
  User,
} from '@planner/contracts';

const BASE = import.meta.env.VITE_API_URL ?? '';

/**
 * DEVELOPMENT-ONLY. Позволяет ходить в API от имени конкретного пользователя,
 * пока настоящей авторизации нет. Сервер принимает этот заголовок только при
 * включённом DEV_AUTH; в production он игнорируется и запрос получит 401.
 */
const DEV_USER_ID = import.meta.env.VITE_DEV_USER_ID as string | undefined;

function authHeaders(): Record<string, string> {
  return DEV_USER_ID ? { 'x-user-id': DEV_USER_ID } : {};
}

/** Типизированная ошибка API — единый формат { error: { code, message } }. */
export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Конфликт фокуса: активная задача из другого направления. */
  get isFocusConflict(): boolean {
    return this.code === 'focus_direction_conflict';
  }
}

type Query = Record<string, string | number | boolean | undefined | null>;

function withQuery(path: string, query?: Query): string {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

async function call<T>(method: string, path: string, body?: unknown, query?: Query): Promise<T> {
  const res = await fetch(`${BASE}${withQuery(path, query)}`, {
    method,
    // сессия живёт в httpOnly-куке, поэтому запросы должны её нести
    credentials: 'include',
    headers: {
      ...authHeaders(),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const payload = text ? (JSON.parse(text) as unknown) : undefined;
  if (!res.ok) {
    const err = (payload as { error?: { code: string; message: string; details?: unknown } })
      ?.error;
    throw new ApiError(
      err?.code ?? 'unknown',
      err?.message ?? `Запрос завершился с кодом ${res.status}`,
      res.status,
      err?.details,
    );
  }
  return payload as T;
}

const get = <T>(path: string, query?: Query) => call<T>('GET', path, undefined, query);
const post = <T>(path: string, body?: unknown) => call<T>('POST', path, body ?? {});
const patch = <T>(path: string, body: unknown) => call<T>('PATCH', path, body);
const put = <T>(path: string, body: unknown) => call<T>('PUT', path, body);
const del = <T>(path: string) => call<T>('DELETE', path);

export interface CalendarEventView {
  id: string;
  title: string;
  time: string;
  duration: string | null;
  calendarName: string;
}

export interface DashboardData {
  today: string;
  timezone: string;
  focus: Focus;
  events: CalendarEventView[];
  dueTasks: TaskWithContext[];
  /** Просроченное — отдельным списком, чтобы не открывать день хвостом. */
  overdueTasks: TaskWithContext[];
  todayReminders: Reminder[];
  /** Закреплённый проект направления в фокусе. Один или ни одного. */
  pinnedProject: Project | null;
  pinnedMedia: MediaItem[];
  heatmap: Heatmap;
}

export interface TelegramStatus {
  connected: boolean;
  username: string | null;
  connectedAt: string | null;
  botUsername: string | null;
}

export interface TelegramLinkCode {
  code: string;
  expiresAt: string;
  deepLink: string | null;
}

export interface CalendarConnection {
  connected: boolean;
  revoked: boolean;
  lastSyncAt: string | null;
  lastError: string | null;
  encryptionReady: boolean;
}

export interface CalendarView {
  id: string;
  name: string;
  enabled: boolean;
  primary: boolean;
}

export interface AuthStatus {
  authenticated: boolean;
  googleConfigured: boolean;
  devAuth: boolean;
}

export const api = {
  auth: {
    status: () => get<AuthStatus>('/api/auth/status'),
    /** Переход на Google — обычная навигация, не fetch. */
    loginUrl: (redirectTo?: string) =>
      `${BASE}/api/auth/google${redirectTo ? `?redirectTo=${encodeURIComponent(redirectTo)}` : ''}`,
    logout: () => post<{ ok: true }>('/api/auth/logout'),
  },

  calendar: {
    connection: () => get<CalendarConnection>('/api/calendar/connection'),
    list: () => get<CalendarView[]>('/api/calendar/list'),
    setEnabled: (id: string, enabled: boolean) =>
      post<CalendarView>(`/api/calendar/${id}/enabled`, { enabled }),
    sync: () =>
      post<{
        calendars: number;
        events: number;
        removed: number;
        partial: boolean;
        failed: string[];
      }>('/api/calendar/sync'),
    disconnect: () => post<{ ok: true }>('/api/calendar/disconnect'),
    /** Согласие на календарь — обычная навигация, не fetch. */
    connectUrl: () => `${BASE}/api/calendar/google/connect`,
  },

  telegram: {
    status: () => get<TelegramStatus>('/api/telegram/status'),
    issueCode: () => post<TelegramLinkCode>('/api/telegram/link-code'),
    disconnect: () => post<{ ok: true }>('/api/telegram/disconnect'),
  },

  dashboard: () => get<DashboardData>('/api/dashboard'),

  me: () => get<User>('/api/me'),
  settings: {
    get: () => get<Settings>('/api/settings'),
    update: (input: UpdateSettingsInput) => patch<Settings>('/api/settings', input),
  },

  directions: {
    list: () => get<DirectionWithStats[]>('/api/directions'),
    get: (id: string) => get<Direction>(`/api/directions/${id}`),
    create: (input: CreateDirectionInput) => post<Direction>('/api/directions', input),
    update: (id: string, input: UpdateDirectionInput) =>
      patch<Direction>(`/api/directions/${id}`, input),
    archive: (id: string) => post<Direction>(`/api/directions/${id}/archive`),
  },

  projects: {
    listByDirection: (directionId: string) =>
      get<ProjectWithFlags[]>('/api/projects', { directionId }),
    pinned: () => get<Project[]>('/api/projects/pinned'),
    get: (id: string) => get<Project>(`/api/projects/${id}`),
    create: (input: CreateProjectInput) => post<Project>('/api/projects', input),
    update: (id: string, input: UpdateProjectInput) => patch<Project>(`/api/projects/${id}`, input),
    pin: (id: string) => post<Project>(`/api/projects/${id}/pin`),
    unpin: (id: string) => post<Project>(`/api/projects/${id}/unpin`),
    pause: (id: string) => post<Project>(`/api/projects/${id}/pause`),
    resume: (id: string) => post<Project>(`/api/projects/${id}/resume`),
    complete: (id: string) => post<Project>(`/api/projects/${id}/complete`),
  },

  tasks: {
    listByProject: (projectId: string, filter?: TaskFilter) =>
      get<Task[]>('/api/tasks', { projectId, ...(filter as Query) }),
    get: (id: string) => get<TaskWithContext>(`/api/tasks/${id}`),
    pinned: (directionId?: string) => get<TaskWithContext[]>('/api/tasks/pinned', { directionId }),
    /** Завершённые задачи всех проектов направления — архив направления. */
    doneByDirection: (directionId: string) =>
      get<TaskWithContext[]>('/api/tasks/done', { directionId }),
    create: (input: CreateTaskInput) => post<Task>('/api/tasks', input),
    update: (id: string, input: UpdateTaskInput) => patch<Task>(`/api/tasks/${id}`, input),
    remove: (id: string) => del<{ ok: true }>(`/api/tasks/${id}`),
    complete: (id: string, withTouch = false) =>
      post<Task>(`/api/tasks/${id}/complete`, { withTouch }),
    reopen: (id: string) => post<Task>(`/api/tasks/${id}/reopen`),
    pin: (id: string) => post<Task>(`/api/tasks/${id}/pin`),
    unpin: (id: string) => post<Task>(`/api/tasks/${id}/unpin`),
    activate: (id: string) => post<Focus>(`/api/tasks/${id}/activate`),
    addChecklistItem: (id: string, text: string) => post(`/api/tasks/${id}/checklist`, { text }),
    updateChecklistItem: (
      id: string,
      itemId: string,
      patchBody: { completed?: boolean; text?: string },
    ) => patch(`/api/tasks/${id}/checklist/${itemId}`, patchBody),
    removeChecklistItem: (id: string, itemId: string) =>
      del(`/api/tasks/${id}/checklist/${itemId}`),
  },

  focus: {
    get: () => get<Focus>('/api/focus'),
    setDirection: (
      directionId: string | null,
      onConflict: 'ask' | 'keepTask' | 'clearTask' = 'ask',
    ) => put<Focus>('/api/focus/direction', { directionId, onConflict }),
    clearDirection: () => del<Focus>('/api/focus/direction'),
    setActiveTask: (taskId: string | null) => put<Focus>('/api/focus/active-task', { taskId }),
    clearActiveTask: () => del<Focus>('/api/focus/active-task'),
  },

  touches: {
    list: (query?: { directionId?: string; from?: string; to?: string; limit?: number }) =>
      get<TouchWithContext[]>('/api/touches', query as Query),
    byDate: (date: string, directionId?: string) =>
      get<TouchWithContext[]>(`/api/touches/day/${date}`, { directionId }),
    heatmap: (weeks = 26, directionId?: string) =>
      get<Heatmap>('/api/touches/heatmap', { weeks, directionId }),
    create: (input: CreateTouchInput) => post<TouchWithContext>('/api/touches', input),
    remove: (id: string) => del<{ ok: true }>(`/api/touches/${id}`),
  },

  reminders: {
    list: () => get<Reminder[]>('/api/reminders'),
    today: () => get<Reminder[]>('/api/reminders/today'),
    archive: () => get<Reminder[]>('/api/reminders/archive'),
    create: (input: CreateReminderInput) => post<Reminder>('/api/reminders', input),
    update: (id: string, input: UpdateReminderInput) =>
      patch<Reminder>(`/api/reminders/${id}`, input),
    complete: (id: string) => post<Reminder>(`/api/reminders/${id}/complete`),
    snooze: (id: string, input: SnoozeReminderInput) =>
      post<Reminder>(`/api/reminders/${id}/snooze`, input),
    toTask: (id: string, input: ReminderToTaskInput) =>
      post<{ task: Task }>(`/api/reminders/${id}/to-task`, input),
    remove: (id: string) => del<Reminder>(`/api/reminders/${id}`),
  },

  inbox: {
    list: () => get<InboxItem[]>('/api/inbox'),
    create: (input: CreateInboxItemInput) => post<InboxItem>('/api/inbox', input),
    update: (id: string, originalText: string) =>
      patch<InboxItem>(`/api/inbox/${id}`, { originalText }),
    remove: (id: string) => del<{ ok: true }>(`/api/inbox/${id}`),
    propose: () => post<InboxProposal[]>('/api/inbox/propose'),
    apply: (proposals: InboxProposal[]) =>
      post<ApplyInboxResult>('/api/inbox/apply', { proposals }),
  },

  menu: {
    list: (filter?: MenuFilter) => get<MenuItem[]>('/api/menu', filter as Query),
    categories: () => get<string[]>('/api/menu/categories'),
    create: (input: CreateMenuItemInput) => post<MenuItem>('/api/menu', input),
    update: (id: string, input: UpdateMenuItemInput) => patch<MenuItem>(`/api/menu/${id}`, input),
    remove: (id: string) => del<{ ok: true }>(`/api/menu/${id}`),
  },

  media: {
    list: (kind?: string, categoryId?: string) =>
      get<MediaItem[]>('/api/media', { kind, categoryId }),
    pinned: () => get<MediaItem[]>('/api/media/pinned'),
    get: (id: string) => get<MediaItem>(`/api/media/${id}`),
    categories: () => get<MediaCategory[]>('/api/media/categories'),
    createCategory: (name: string) => post<MediaCategory>('/api/media/categories', { name }),
    create: (input: CreateMediaItemInput) => post<MediaItem>('/api/media', input),
    update: (id: string, input: UpdateMediaItemInput) =>
      patch<MediaItem>(`/api/media/${id}`, input),
    pin: (id: string) => post<MediaItem>(`/api/media/${id}/pin`),
    unpin: (id: string) => post<MediaItem>(`/api/media/${id}/unpin`),
    remove: (id: string) => del<{ ok: true }>(`/api/media/${id}`),
  },

  travel: {
    categories: () => get<TravelCategory[]>('/api/travel/categories'),
    createCategory: (name: string) => post<TravelCategory>('/api/travel/categories', { name }),
    items: (includeArchived = false) =>
      get<TravelItem[]>('/api/travel/items', { includeArchived }),
    createItem: (input: CreateTravelItemInput) => post<TravelItem>('/api/travel/items', input),
    updateItem: (id: string, input: UpdateTravelItemInput) =>
      patch<TravelItem>(`/api/travel/items/${id}`, input),
    removeItem: (id: string) => del<{ ok: true }>(`/api/travel/items/${id}`),

    trips: () => get<TripWithStats[]>('/api/travel/trips'),
    trip: (id: string) => get<Trip>(`/api/travel/trips/${id}`),
    createTrip: (input: CreateTripInput) => post<Trip>('/api/travel/trips', input),
    updateTrip: (id: string, input: UpdateTripInput) =>
      patch<Trip>(`/api/travel/trips/${id}`, input),
    completeTrip: (id: string) => post<Trip>(`/api/travel/trips/${id}/complete`),
    removeTrip: (id: string) => del<{ ok: true }>(`/api/travel/trips/${id}`),

    checklist: (tripId: string) =>
      get<TripChecklistItem[]>(`/api/travel/trips/${tripId}/checklist`),
    addChecklistItem: (tripId: string, input: CreateTripChecklistItemInput) =>
      post<TripChecklistItem>(`/api/travel/trips/${tripId}/checklist`, input),
    updateChecklistItem: (tripId: string, itemId: string, input: UpdateTripChecklistItemInput) =>
      patch<TripChecklistItem>(`/api/travel/trips/${tripId}/checklist/${itemId}`, input),
    removeChecklistItem: (tripId: string, itemId: string) =>
      del<{ ok: true }>(`/api/travel/trips/${tripId}/checklist/${itemId}`),
    refreshChecklist: (tripId: string) =>
      post<TripChecklistItem[]>(`/api/travel/trips/${tripId}/refresh-checklist`),
  },
};

export type Api = typeof api;
