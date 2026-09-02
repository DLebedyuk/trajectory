import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type Theme = 'light' | 'dark' | 'system';

interface UiState {
  theme: Theme;
  sidebarOpen: boolean;
  /** Локальные фильтры задач проекта — не серверное состояние. */
  taskFilter: { estimatedDuration: string; withDeadlineOnly: boolean; sort: string };
  setTheme: (theme: Theme) => void;
  toggleSidebar: () => void;
  setTaskFilter: (patch: Partial<UiState['taskFilter']>) => void;
}

/**
 * Zustand хранит только состояние интерфейса. Серверные сущности живут
 * исключительно в TanStack Query — дублировать их здесь нельзя.
 */
export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      theme: 'system',
      sidebarOpen: false,
      taskFilter: { estimatedDuration: 'all', withDeadlineOnly: false, sort: 'manual' },
      setTheme: (theme) => set({ theme }),
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
      setTaskFilter: (patch) => set((s) => ({ taskFilter: { ...s.taskFilter, ...patch } })),
    }),
    { name: 'planner-ui' },
  ),
);

export type { Theme };

const darkQuery = (): MediaQueryList | null =>
  typeof window === 'undefined' ? null : window.matchMedia('(prefers-color-scheme: dark)');

/** Тёмная ли тема сейчас: «Авто» спрашивает систему. */
export function isDarkNow(theme: Theme): boolean {
  if (theme === 'dark') return true;
  if (theme === 'light') return false;
  return darkQuery()?.matches ?? false;
}

/**
 * Тема живёт в двух местах: data-theme нужен для системных элементов
 * (color-scheme, скроллбары), класс theme-dark — для токенов оформления.
 * Держим их согласованными в одном месте, чтобы не разъезжались.
 */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
  root.classList.toggle('theme-dark', isDarkNow(theme));
  root.style.colorScheme = isDarkNow(theme) ? 'dark' : 'light';
  applyStatusBarColor(root);
}

/**
 * Статус-бар телефона красится по meta[name=theme-color]. В разметке их две —
 * под системную светлую и тёмную тему, чтобы первый кадр не мигал. Но тема в
 * приложении своя и системную может не повторять, поэтому после переключения
 * обе метки получают цвет фактического фона, а media с них снимается: иначе
 * браузер возьмёт ту, что совпала с системной темой, и в светлом интерфейсе
 * полоса статуса останется тёмной.
 */
function applyStatusBarColor(root: HTMLElement): void {
  const bg = getComputedStyle(root).getPropertyValue('--bg').trim();
  if (!bg) return;
  document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
    meta.removeAttribute('media');
    meta.setAttribute('content', bg);
  });
}

/**
 * Пока выбрана «Авто», приложение обязано реагировать на смену системной темы
 * без перезагрузки — иначе вечером интерфейс останется светлым.
 */
export function watchSystemTheme(getTheme: () => Theme): () => void {
  const query = darkQuery();
  if (!query) return () => undefined;
  const onChange = (): void => {
    if (getTheme() === 'system') applyTheme('system');
  };
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}
