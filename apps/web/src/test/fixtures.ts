import type { DashboardData } from '../api/client.js';
import type { Focus, Project, TaskWithContext } from '@planner/contracts';

const iso = '2026-08-27T09:00:00.000Z';

export const makeTask = (over: Partial<TaskWithContext> = {}): TaskWithContext => ({
  id: 'task-1',
  userId: 'user-1',
  projectId: 'project-1',
  title: 'Записать блок narration',
  status: 'open',
  pinned: false,
  deadline: null,
  exactTime: null,
  estimatedDuration: 'medium',
  remindAt: null,
  comment: null,
  sortOrder: 0,
  createdAt: iso,
  completedAt: null,
  updatedAt: iso,
  checklist: [],
  projectTitle: 'Подготовить демо для сайта',
  directionId: 'dir-voice',
  directionName: 'Озвучка',
  directionColor: '--d-voice',
  ...over,
});

export const makeFocus = (over: Partial<Focus> = {}): Focus => ({
  focusDirectionId: 'dir-voice',
  activeTaskId: 'task-1',
  direction: {
    id: 'dir-voice',
    userId: 'user-1',
    name: 'Озвучка',
    description: null,
    color: '--d-voice',
    icon: 'voice',
    motto: null,
    showMotto: false,
    sortOrder: 0,
    notes: [],
    archivedAt: null,
    createdAt: iso,
    updatedAt: iso,
  },
  activeTask: makeTask(),
  ...over,
});

export const makeProject = (over: Partial<Project> = {}): Project => ({
  id: 'project-1',
  userId: 'user-1',
  directionId: 'dir-voice',
  title: 'Подготовить демо для сайта',
  desiredOutcome: null,
  status: 'active',
  deadline: null,
  sortOrder: 0,
  notes: [],
  pinned: true,
  createdAt: iso,
  completedAt: null,
  updatedAt: iso,
  ...over,
});

export const makeDashboard = (over: Partial<DashboardData> = {}): DashboardData => ({
  today: '2026-08-27',
  timezone: 'Europe/Moscow',
  focus: makeFocus(),
  events: [],
  dueTasks: [],
  overdueTasks: [],
  todayReminders: [],
  pinnedProject: makeProject(),
  pinnedMedia: [],
  heatmap: { from: '2026-03-02', to: '2026-08-27', days: [], weekTotal: 4, total: 40 },
  ...over,
});
