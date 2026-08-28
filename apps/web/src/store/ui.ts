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

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
}
