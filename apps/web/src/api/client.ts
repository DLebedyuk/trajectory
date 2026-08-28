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
  Task,
  TaskFilter,
  TaskWithContext,
  TouchWithContext,
  UpdateDirectionInput,
  UpdateMediaItemInput,
  UpdateMenuItemInput,
  UpdateProjectInput,
  UpdateReminderInput,
  UpdateSettingsInput,
  UpdateTaskInput,
  User,
} from '@planner/contracts';

const BASE = import.meta.env.VITE_API_URL ?? '';

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
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
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
  todayReminders: Reminder[];
  pinnedTasks: TaskWithContext[];
  pinnedMedia: MediaItem[];
  heatmap: Heatmap;
}

export const api = {
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
    get: (id: string) => get<Project>(`/api/projects/${id}`),
    create: (input: CreateProjectInput) => post<Project>('/api/projects', input),
    update: (id: string, input: UpdateProjectInput) => patch<Project>(`/api/projects/${id}`, input),
    pause: (id: string) => post<Project>(`/api/projects/${id}/pause`),
    resume: (id: string) => post<Project>(`/api/projects/${id}/resume`),
    complete: (id: string) => post<Project>(`/api/projects/${id}/complete`),
  },

  tasks: {
    listByProject: (projectId: string, filter?: TaskFilter) =>
      get<Task[]>('/api/tasks', { projectId, ...(filter as Query) }),
    get: (id: string) => get<TaskWithContext>(`/api/tasks/${id}`),
    pinned: (directionId?: string) => get<TaskWithContext[]>('/api/tasks/pinned', { directionId }),
    create: (input: CreateTaskInput) => post<Task>('/api/tasks', input),
    update: (id: string, input: UpdateTaskInput) => patch<Task>(`/api/tasks/${id}`, input),
    remove: (id: string) => del<{ ok: true }>(`/api/tasks/${id}`),
    complete: (id: string) => post<Task>(`/api/tasks/${id}/complete`),
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
};

export type Api = typeof api;
