import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api } from './client.js';
import type { TaskFilter } from '@planner/contracts';

/** Ключи запросов. Инвалидация точечная: обновляем только связанное. */
export const qk = {
  authStatus: ['authStatus'] as const,
  telegram: ['telegram'] as const,
  calendarConnection: ['calendarConnection'] as const,
  calendars: ['calendars'] as const,
  dashboard: ['dashboard'] as const,
  me: ['me'] as const,
  settings: ['settings'] as const,
  focus: ['focus'] as const,
  directions: ['directions'] as const,
  direction: (id: string) => ['direction', id] as const,
  projects: (directionId: string) => ['projects', directionId] as const,
  project: (id: string) => ['project', id] as const,
  tasks: (projectId: string, filter?: TaskFilter) => ['tasks', projectId, filter ?? {}] as const,
  task: (id: string) => ['task', id] as const,
  pinnedTasks: (directionId?: string) => ['pinnedTasks', directionId ?? 'all'] as const,
  doneTasks: (directionId: string) => ['doneTasks', directionId] as const,
  touches: (query: unknown) => ['touches', query] as const,
  heatmap: (weeks: number, directionId?: string) =>
    ['heatmap', weeks, directionId ?? 'all'] as const,
  reminders: ['reminders'] as const,
  remindersArchive: ['reminders', 'archive'] as const,
  inbox: ['inbox'] as const,
  menu: (filter: unknown) => ['menu', filter] as const,
  media: (kind?: string) => ['media', kind ?? 'all'] as const,
  mediaItem: (id: string) => ['mediaItem', id] as const,
  mediaCategories: ['mediaCategories'] as const,
};

/** Всё, на что влияет смена активной задачи или закрепления. */
export function invalidateFocusScope(qc: QueryClient, projectId?: string): void {
  void qc.invalidateQueries({ queryKey: qk.dashboard });
  void qc.invalidateQueries({ queryKey: qk.focus });
  void qc.invalidateQueries({ queryKey: ['pinnedTasks'] });
  if (projectId) {
    void qc.invalidateQueries({ queryKey: ['tasks', projectId] });
    void qc.invalidateQueries({ queryKey: qk.project(projectId) });
  } else {
    void qc.invalidateQueries({ queryKey: ['tasks'] });
  }
  void qc.invalidateQueries({ queryKey: ['projects'] });
}

/**
 * Данные, которые меняются снаружи приложения: бот в Telegram создаёт
 * напоминания и входящие, а вкладка об этом не знает. Общий staleTime в 30
 * секунд означал, что открытый экран продолжает показывать старый кеш.
 *
 * Поэтому здесь: свежий запрос при открытии экрана, свежий при возврате
 * в окно и спокойный опрос раз в 15 секунд, пока экран открыт. Чаще незачем —
 * пользователь один, а сервер не резиновый.
 */
const EXTERNALLY_CHANGED = {
  staleTime: 0,
  refetchOnMount: 'always',
  refetchOnWindowFocus: 'always',
  refetchInterval: 15_000,
  // в фоновой вкладке не опрашиваем: смысла нет, а батарею жалко
  refetchIntervalInBackground: false,
} as const;

export const useDashboard = () =>
  useQuery({ queryKey: qk.dashboard, queryFn: api.dashboard, ...EXTERNALLY_CHANGED });
export const useFocus = () => useQuery({ queryKey: qk.focus, queryFn: api.focus.get });
export const useDirections = () =>
  useQuery({ queryKey: qk.directions, queryFn: api.directions.list });
export const useDirection = (id: string) =>
  useQuery({
    queryKey: qk.direction(id),
    queryFn: () => api.directions.get(id),
    enabled: Boolean(id),
  });
export const useProjects = (directionId: string) =>
  useQuery({
    queryKey: qk.projects(directionId),
    queryFn: () => api.projects.listByDirection(directionId),
    enabled: Boolean(directionId),
  });
/** Архив направления: завершённые задачи всех его проектов. */
export const useDoneTasks = (directionId: string, enabled = true) =>
  useQuery({
    queryKey: qk.doneTasks(directionId),
    queryFn: () => api.tasks.doneByDirection(directionId),
    enabled: enabled && Boolean(directionId),
  });
export const useProject = (id: string) =>
  useQuery({ queryKey: qk.project(id), queryFn: () => api.projects.get(id), enabled: Boolean(id) });
export const useTasks = (projectId: string, filter?: TaskFilter, enabled = true) =>
  useQuery({
    queryKey: qk.tasks(projectId, filter),
    queryFn: () => api.tasks.listByProject(projectId, filter),
    enabled: enabled && Boolean(projectId),
  });
export const useTask = (id: string) =>
  useQuery({ queryKey: qk.task(id), queryFn: () => api.tasks.get(id), enabled: Boolean(id) });
export const usePinnedTasks = (directionId?: string) =>
  useQuery({ queryKey: qk.pinnedTasks(directionId), queryFn: () => api.tasks.pinned(directionId) });
export const useHeatmap = (weeks: number, directionId?: string) =>
  useQuery({
    queryKey: qk.heatmap(weeks, directionId),
    queryFn: () => api.touches.heatmap(weeks, directionId),
  });
export const useTouches = (query: { directionId?: string; limit?: number }) =>
  useQuery({ queryKey: qk.touches(query), queryFn: () => api.touches.list(query) });
export const useReminders = () =>
  useQuery({ queryKey: qk.reminders, queryFn: api.reminders.list, ...EXTERNALLY_CHANGED });
export const useRemindersArchive = () =>
  useQuery({ queryKey: qk.remindersArchive, queryFn: api.reminders.archive });
export const useInbox = () =>
  useQuery({ queryKey: qk.inbox, queryFn: api.inbox.list, ...EXTERNALLY_CHANGED });
export const useMenu = (filter: Record<string, string | undefined>) =>
  useQuery({ queryKey: qk.menu(filter), queryFn: () => api.menu.list(filter as never) });
export const useMedia = (kind?: string) =>
  useQuery({ queryKey: qk.media(kind), queryFn: () => api.media.list(kind) });
export const useMediaItem = (id: string) =>
  useQuery({ queryKey: qk.mediaItem(id), queryFn: () => api.media.get(id), enabled: Boolean(id) });
export const useMediaCategories = () =>
  useQuery({ queryKey: qk.mediaCategories, queryFn: api.media.categories });
export const useSettings = () => useQuery({ queryKey: qk.settings, queryFn: api.settings.get });

/** Сделать задачу активной: направление её проекта уходит в фокус автоматически. */
export function useActivateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) => api.tasks.activate(taskId),
    onSuccess: (_data, taskId) => {
      invalidateFocusScope(qc);
      void qc.invalidateQueries({ queryKey: qk.task(taskId) });
    },
  });
}

export function useTogglePin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, pinned }: { taskId: string; pinned: boolean }) =>
      pinned ? api.tasks.unpin(taskId) : api.tasks.pin(taskId),
    onSuccess: (_data, vars) => {
      invalidateFocusScope(qc);
      void qc.invalidateQueries({ queryKey: qk.task(vars.taskId) });
    },
  });
}

export function useCompleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) => api.tasks.complete(taskId),
    onSuccess: (_data, taskId) => {
      invalidateFocusScope(qc);
      void qc.invalidateQueries({ queryKey: qk.task(taskId) });
    },
  });
}
