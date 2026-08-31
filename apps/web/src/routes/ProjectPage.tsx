import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  FormField,
  IconPause,
  IconPlus,
  IconTrash,
  Modal,
  PageHeader,
  useToast,
} from '@planner/ui';

/** Фильтр по примерному времени — те же значения, что у задачи. */
const DURATIONS = [
  { value: 'all', label: 'любое' },
  { value: 'short', label: '15 минут' },
  { value: 'medium', label: 'около часа' },
  { value: 'long', label: 'несколько часов' },
];
import { formatLongDate } from '@planner/shared';
import type { TaskFilter } from '@planner/contracts';
import { api } from '../api/client.js';
import {
  invalidateFocusScope,
  qk,
  useCompleteTask,
  useDashboard,
  useDirection,
  useDirections,
  useProject,
  useTasks,
  useTogglePin,
} from '../api/queries.js';
import { TaskLine } from '../features/TaskLine.js';
import { ProjectSettingsModal } from '../features/ProjectSettingsModal.js';
import { ErrorBox, Loading } from '../components/Loading.js';
import { useUiStore } from '../store/ui.js';

export function ProjectPage() {
  const { projectId = '' } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const project = useProject(projectId);
  const dashboard = useDashboard();
  const direction = useDirection(project.data?.directionId ?? '');
  const allDirections = useDirections();
  const filterState = useUiStore((s) => s.taskFilter);
  const setFilter = useUiStore((s) => s.setTaskFilter);

  const filter: TaskFilter = {
    ...(filterState.estimatedDuration !== 'all'
      ? { estimatedDuration: filterState.estimatedDuration as 'short' | 'medium' | 'long' }
      : {}),
    ...(filterState.withDeadlineOnly ? { withDeadlineOnly: true } : {}),
    sort: filterState.sort as 'manual' | 'deadline' | 'pinned',
  };
  const tasks = useTasks(projectId, filter);

  const completeTask = useCompleteTask();
  const togglePin = useTogglePin();
  const [taskOpen, setTaskOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [deadline, setDeadline] = useState('');
  const [duration, setDuration] = useState('');
  const [note, setNote] = useState('');

  const activeTaskId = dashboard.data?.focus.activeTaskId ?? null;
  // Активная задача — глобальное состояние; в списке она просто подсвечена.
  // Проектный «Следующий шаг» из интерфейса убран, модель в API и БД осталась.

  const createTask = useMutation({
    mutationFn: () =>
      api.tasks.create({
        projectId,
        title,
        deadline: deadline || null,
        estimatedDuration: (duration || null) as 'short' | 'medium' | 'long' | null,
        pinned: false,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tasks', projectId] });
      void qc.invalidateQueries({ queryKey: qk.project(projectId) });
      toast.show('Задача создана');
      setTitle('');
      setDeadline('');
      setDuration('');
      setTaskOpen(false);
    },
  });

  const changeStatus = useMutation({
    mutationFn: (action: 'pause' | 'resume' | 'complete') => api.projects[action](projectId),
    onSuccess: (_d, action) => {
      invalidateFocusScope(qc, projectId);
      void qc.invalidateQueries({ queryKey: qk.project(projectId) });
      toast.show(
        action === 'pause'
          ? 'Проект на паузе'
          : action === 'resume'
            ? 'Проект снова активен'
            : 'Проект в архиве. Касания остались в статистике направления.',
      );
      if (action === 'complete' && project.data)
        navigate(`/directions/${project.data.directionId}`);
    },
  });
  const addNote = useMutation({
    mutationFn: () =>
      api.projects.update(projectId, { notes: [...(project.data?.notes ?? []), note] }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.project(projectId) });
      setNote('');
      setNoteOpen(false);
    },
  });
  const removeNote = useMutation({
    mutationFn: (index: number) =>
      api.projects.update(projectId, {
        notes: (project.data?.notes ?? []).filter((_, i) => i !== index),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.project(projectId) }),
  });

  if (project.isLoading) return <Loading what="Загружаю проект" />;
  if (project.isError)
    return <ErrorBox error={project.error} onRetry={() => void project.refetch()} />;
  const p = project.data;
  if (!p) return null;

  const color = direction.data?.color ?? '--d-eng';
  const openTasks = tasks.data ?? [];

  const statusBadge =
    p.status === 'paused' ? 'на паузе' : p.status === 'archived' ? 'завершён' : null;

  return (
    <div className="proj-page-content">
      <PageHeader
        onBack={() => navigate(`/directions/${p.directionId}`)}
        backLabel={`К направлению${direction.data ? ` «${direction.data.name}»` : ''}`}
        title={p.title}
        eyebrow={direction.data?.name}
        subtitle={
          <>
            {p.desiredOutcome}
            <span className="proj-meta">
              {p.deadline ? <span className="mono">срок {formatLongDate(p.deadline)}</span> : null}
              {statusBadge ? <span className="badge">{statusBadge}</span> : null}
            </span>
          </>
        }
        actions={
          <>
            <Button size="sm" onClick={() => setSettingsOpen(true)}>
              Настройки
            </Button>
            <Button size="sm" onClick={() => navigate(`/projects/${projectId}/archive`)}>
              Архив
            </Button>
            {p.status === 'active' ? (
              <Button size="sm" onClick={() => changeStatus.mutate('pause')}>
                <IconPause />
                На паузу
              </Button>
            ) : p.status === 'paused' ? (
              <Button size="sm" onClick={() => changeStatus.mutate('resume')}>
                Сделать активным
              </Button>
            ) : null}
            {p.status !== 'archived' ? (
              <Button size="sm" variant="primary" onClick={() => changeStatus.mutate('complete')}>
                Завершить
              </Button>
            ) : null}
          </>
        }
      />

      <div className="two-col">
        <div>
          <div className="card">
            <h4>
              Задачи
              <Button size="sm" onClick={() => setTaskOpen(true)}>
                <IconPlus />
                Новая задача
              </Button>
            </h4>

            <div className="proj-filters">
              <span className="lbl">Время</span>
              {DURATIONS.map((d) => (
                <button
                  key={d.value}
                  type="button"
                  className={`chip${filterState.estimatedDuration === d.value ? ' is-active' : ''}`}
                  aria-pressed={filterState.estimatedDuration === d.value}
                  onClick={() => setFilter({ estimatedDuration: d.value })}
                >
                  {d.label}
                </button>
              ))}
              <button
                type="button"
                className={`chip${filterState.withDeadlineOnly ? ' is-active' : ''}`}
                aria-pressed={filterState.withDeadlineOnly}
                onClick={() => setFilter({ withDeadlineOnly: !filterState.withDeadlineOnly })}
              >
                только со сроком
              </button>
              <label className="sort">
                Порядок{' '}
                <select
                  aria-label="Порядок"
                  value={filterState.sort}
                  onChange={(e) => setFilter({ sort: e.target.value })}
                >
                  <option value="manual">вручную</option>
                  <option value="deadline">сначала ближайшие</option>
                  <option value="pinned">сначала закреплённые</option>
                </select>
              </label>
            </div>

            {openTasks.length > 0 ? (
              openTasks.map((t) => (
                <TaskLine
                  key={t.id}
                  task={t}
                  isActive={activeTaskId === t.id}
                  directionColor={color}
                  onOpen={() => navigate(`/tasks/${t.id}`)}
                  onComplete={() => completeTask.mutate(t.id)}
                  onTogglePin={() => togglePin.mutate({ taskId: t.id, pinned: t.pinned })}
                />
              ))
            ) : (
              <p className="hint" style={{ padding: '8px 2px' }}>
                {tasks.data?.length === 0
                  ? 'Под этот фильтр ничего не попадает.'
                  : 'Открытых задач нет.'}
              </p>
            )}
          </div>
        </div>

        {/* заметки справа на десктопе, под задачами — на узком экране */}
        <aside className="right-col">
          <div className="card">
            <h4>
              Заметки
              <Button size="sm" variant="ghost" onClick={() => setNoteOpen(true)}>
                <IconPlus />
                Заметка
              </Button>
            </h4>
            {p.notes.length > 0 ? (
              p.notes.map((n, i) => (
                <div className="note-row" key={`${n}-${i}`}>
                  <span>{n}</span>
                  <button
                    type="button"
                    className="row-del"
                    aria-label={`Удалить заметку: ${n}`}
                    title="Удалить"
                    onClick={() => removeNote.mutate(i)}
                  >
                    <IconTrash />
                  </button>
                </div>
              ))
            ) : (
              <p className="hint">Заметок нет.</p>
            )}
          </div>
        </aside>
      </div>

      <ProjectSettingsModal
        project={p}
        directions={allDirections.data ?? []}
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
      />

      <Modal
        open={taskOpen}
        onOpenChange={setTaskOpen}
        title="Новая задача"
        description={`Задача принадлежит проекту «${p.title}». Направление определяется через него.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setTaskOpen(false)}>
              Отмена
            </Button>
            <Button variant="primary" disabled={!title.trim()} onClick={() => createTask.mutate()}>
              Создать
            </Button>
          </>
        }
      >
        <FormField label="Название">
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} />
        </FormField>
        <div className="cols2">
          <FormField label="Дедлайн — если он настоящий">
            <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </FormField>
          <FormField label="Примерно займёт">
            <select value={duration} onChange={(e) => setDuration(e.target.value)}>
              <option value="">не знаю</option>
              <option value="short">15 минут</option>
              <option value="medium">около часа</option>
              <option value="long">несколько часов</option>
            </select>
          </FormField>
        </div>
      </Modal>

      <Modal
        open={noteOpen}
        onOpenChange={setNoteOpen}
        title="Заметка проекта"
        footer={
          <>
            <Button variant="ghost" onClick={() => setNoteOpen(false)}>
              Отмена
            </Button>
            <Button variant="primary" disabled={!note.trim()} onClick={() => addNote.mutate()}>
              Сохранить
            </Button>
          </>
        }
      >
        <FormField label="Текст">
          <input type="text" value={note} onChange={(e) => setNote(e.target.value)} />
        </FormField>
      </Modal>
    </div>
  );
}
