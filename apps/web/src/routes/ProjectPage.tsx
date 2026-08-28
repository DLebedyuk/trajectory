import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Checkbox,
  FormField,
  IconArchive,
  IconChevron,
  IconClock,
  IconPause,
  IconPlus,
  Modal,
  PageHeader,
  useToast,
} from '@planner/ui';
import { DURATION_LABEL, formatLongDate, humanDate, todayInTimezone } from '@planner/shared';
import type { TaskFilter } from '@planner/contracts';
import { api } from '../api/client.js';
import {
  invalidateFocusScope,
  qk,
  useCompleteTask,
  useDashboard,
  useDirection,
  useProject,
  useTasks,
  useTogglePin,
} from '../api/queries.js';
import { TaskLine } from '../features/TaskLine.js';
import { PickTaskModal } from '../features/PickTaskModal.js';
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
  const doneTasks = useTasks(projectId, { status: 'done' });

  const completeTask = useCompleteTask();
  const togglePin = useTogglePin();
  const [pickOpen, setPickOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const [title, setTitle] = useState('');
  const [deadline, setDeadline] = useState('');
  const [duration, setDuration] = useState('');
  const [note, setNote] = useState('');

  const today = dashboard.data?.today ?? todayInTimezone('UTC');
  const activeTaskId = dashboard.data?.focus.activeTaskId ?? null;
  const activeTask = dashboard.data?.focus.activeTask ?? null;
  const isActiveHere = activeTask?.projectId === projectId ? activeTask : null;

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

  const setActive = useMutation({
    mutationFn: (taskId: string) => api.tasks.activate(taskId),
    onSuccess: () => {
      invalidateFocusScope(qc, projectId);
      toast.show('Следующий шаг выбран');
    },
  });
  const clearActive = useMutation({
    mutationFn: () => api.focus.clearActiveTask(),
    onSuccess: () => invalidateFocusScope(qc, projectId),
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
  const reopen = useMutation({
    mutationFn: (taskId: string) => api.tasks.reopen(taskId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tasks', projectId] });
      toast.show('Задача снова в работе');
    },
  });

  if (project.isLoading) return <Loading what="Загружаю проект" />;
  if (project.isError) return <ErrorBox error={project.error} />;
  const p = project.data;
  if (!p) return null;

  const color = direction.data?.color ?? '--d-eng';
  // Активная задача показана в «Следующем шаге» — во втором списке её не дублируем.
  const otherTasks = (tasks.data ?? []).filter((t) => t.id !== isActiveHere?.id);

  return (
    <>
      <PageHeader
        onBack={() => navigate(`/directions/${p.directionId}`)}
        backLabel={`К направлению${direction.data ? ` «${direction.data.name}»` : ''}`}
        title={p.title}
        subtitle={
          <>
            {p.desiredOutcome}
            {p.deadline ? (
              <div className="quiet" style={{ marginTop: 9 }}>
                Срок: {formatLongDate(p.deadline)}
              </div>
            ) : null}
            {p.status === 'paused' ? (
              <div className="quiet" style={{ marginTop: 9 }}>
                Проект на паузе.
              </div>
            ) : null}
          </>
        }
        actions={
          <>
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

      <div className="stack" style={{ maxWidth: 860 }}>
        <div>
          <span className="lbl" style={{ display: 'block', marginBottom: 8 }}>
            Следующий шаг
          </span>
          {isActiveHere ? (
            <div className="focusbar" style={{ ['--fc' as string]: `var(${color})` }}>
              <div style={{ display: 'flex', gap: 13, alignItems: 'flex-start' }}>
                <Checkbox
                  checked={false}
                  onChange={() => completeTask.mutate(isActiveHere.id)}
                  label={`Выполнить: ${isActiveHere.title}`}
                  size={23}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: 'Literata, serif', fontSize: 19 }}>
                    {isActiveHere.title}
                  </div>
                  <div className="tline-meta" style={{ marginTop: 6 }}>
                    {isActiveHere.deadline ? (
                      <i>
                        <IconClock />
                        до {formatLongDate(isActiveHere.deadline)}
                      </i>
                    ) : null}
                    {isActiveHere.estimatedDuration ? (
                      <i>{DURATION_LABEL[isActiveHere.estimatedDuration]}</i>
                    ) : null}
                  </div>
                  <div style={{ display: 'flex', gap: 7, marginTop: 14, flexWrap: 'wrap' }}>
                    <Button size="sm" onClick={() => navigate(`/tasks/${isActiveHere.id}`)}>
                      Открыть задачу
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setPickOpen(true)}>
                      Выбрать другой
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => clearActive.mutate()}>
                      Убрать
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        togglePin.mutate({ taskId: isActiveHere.id, pinned: isActiveHere.pinned })
                      }
                    >
                      {isActiveHere.pinned ? 'Открепить' : 'Закрепить'}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="focus-empty" style={{ textAlign: 'left', padding: '18px 20px' }}>
              <p style={{ fontSize: 14.5 }}>Следующий шаг для этого проекта не выбран.</p>
              <Button size="sm" style={{ marginTop: 12 }} onClick={() => setPickOpen(true)}>
                Выбрать из задач проекта
              </Button>
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-h">
            <h3 style={{ fontSize: 16 }}>Задачи</h3>
            <Button size="sm" onClick={() => setTaskOpen(true)}>
              <IconPlus />
              Новая задача
            </Button>
          </div>

          <div className="filterbar">
            <label>
              Примерное время
              <select
                aria-label="Примерное время"
                value={filterState.estimatedDuration}
                onChange={(e) => setFilter({ estimatedDuration: e.target.value })}
              >
                <option value="all">любое</option>
                <option value="short">до 15 минут</option>
                <option value="medium">около часа</option>
                <option value="long">несколько часов</option>
              </select>
            </label>
            <label>
              <input
                type="checkbox"
                checked={filterState.withDeadlineOnly}
                onChange={(e) => setFilter({ withDeadlineOnly: e.target.checked })}
              />
              Только с дедлайном
            </label>
            <label style={{ marginLeft: 'auto' }}>
              Порядок
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

          {otherTasks.length > 0 ? (
            otherTasks.map((t) => (
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
                : 'Других открытых задач нет.'}
            </p>
          )}
        </div>

        <div className="card">
          <div className="card-h">
            <h3 style={{ fontSize: 16 }}>Заметки</h3>
            <Button size="sm" variant="ghost" onClick={() => setNoteOpen(true)}>
              <IconPlus />
              Заметка
            </Button>
          </div>
          {p.notes.length > 0 ? (
            p.notes.map((n, i) => (
              <div className="row" key={`${n}-${i}`}>
                <div className="row-main" style={{ fontSize: 13.5 }}>
                  {n}
                </div>
                <Button size="sm" variant="ghost" onClick={() => removeNote.mutate(i)}>
                  Удалить
                </Button>
              </div>
            ))
          ) : (
            <p className="hint">Заметок нет.</p>
          )}
        </div>

        <div className="fold">
          <button type="button" className="fold-h" onClick={() => setShowArchive((v) => !v)}>
            <span className="lbl" style={{ display: 'inline-flex', gap: 7, alignItems: 'center' }}>
              <IconArchive /> Архив завершённых · {doneTasks.data?.length ?? 0}
            </span>
            <span
              style={{
                transform: showArchive ? 'rotate(180deg)' : undefined,
                display: 'inline-flex',
                color: 'var(--text-3)',
              }}
            >
              <IconChevron />
            </span>
          </button>
          {showArchive ? (
            <div className="fold-b">
              {(doneTasks.data ?? []).map((t) => (
                <div className="row" key={t.id} style={{ padding: '9px 0' }}>
                  <div className="row-main">
                    <div className="row-title done-strike" style={{ fontWeight: 400 }}>
                      {t.title}
                    </div>
                    <div className="row-sub">
                      {t.completedAt
                        ? `завершена ${humanDate(t.completedAt.slice(0, 10), today)}`
                        : ''}
                    </div>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => reopen.mutate(t.id)}>
                    Вернуть
                  </Button>
                </div>
              ))}
              {doneTasks.data?.length === 0 ? <p className="hint">Пусто.</p> : null}
            </div>
          ) : null}
        </div>
      </div>

      <PickTaskModal
        open={pickOpen}
        onOpenChange={setPickOpen}
        mode="active"
        excludeTaskId={activeTaskId}
        onPick={(taskId) => setActive.mutate(taskId)}
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
    </>
  );
}
