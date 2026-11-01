import { useMemo, useState, type DragEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  DIRECTION_COLORS,
  EmptyState,
  FormField,
  IconPinFilled,
  IconPlus,
  Modal,
  OverflowMenu,
  useToast,
} from '@planner/ui';
import { formatShortDate, plural, todayInTimezone } from '@planner/shared';
import type { Board, BoardTask, ProjectWithFlags } from '@planner/contracts';
import { api } from '../api/client.js';
import { CheckRow } from '../components/CheckRow.js';
import { invalidateFocusScope, qk, useBoard, useSettings } from '../api/queries.js';
import { ErrorBox, Loading } from '../components/Loading.js';
import { useCompleteTaskDialog } from './CompleteTaskDialog.js';

type Sort = 'project' | 'deadline';

/*
  Цвет проекта на доске. Своего цвета у проекта нет, поэтому он выводится из
  id — стабильно между перезагрузками. Совпадения разводятся по порядку
  проектов, а цвет самого направления пропускается: им уже окрашена страница.
*/
function projectColors(projectIds: string[], directionColor: string): Map<string, string> {
  const palette = DIRECTION_COLORS.map((c) => c.value).filter((c) => c !== directionColor);
  const taken = new Set<number>();
  const result = new Map<string, string>();
  for (const id of projectIds) {
    let hash = 0;
    for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
    let index = hash % palette.length;
    // проектов на доске больше, чем цветов, — повторы неизбежны, но не раньше
    for (let i = 0; i < palette.length && taken.has(index); i += 1) {
      index = (index + 1) % palette.length;
    }
    taken.add(index);
    result.set(id, palette[index]!);
  }
  return result;
}

/**
 * Канбан направления. Карточки — это сами задачи проектов, включённых в
 * доску: никаких копий и отдельного хранилища. Колонки повторяют статусы
 * задачи (open / done), поэтому перенос — это обычное закрытие или возврат,
 * с тем же окном касания, что и в проекте.
 *
 * На телефоне перетаскивание не работает (HTML5 drag-and-drop там не
 * поддерживается) — вместо него кружок-чекбокс на карточке и пункт меню.
 */
export function DirectionBoard({
  directionId,
  directionColor,
  projects,
}: {
  directionId: string;
  directionColor: string;
  projects: ProjectWithFlags[];
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const board = useBoard(directionId);
  const settings = useSettings();
  const today = todayInTimezone(settings.data?.timezone ?? 'UTC');
  const { askComplete, dialog } = useCompleteTaskDialog();

  // фильтры живут в адресе: перезагрузка и «назад» их не теряют, задач они не трогают
  const [params, setParams] = useSearchParams();
  const search = params.get('q') ?? '';
  const onlyProjects = (params.get('p') ?? '').split(',').filter(Boolean);
  const hideDone = params.get('done') === 'hide';
  const sort: Sort = params.get('sort') === 'deadline' ? 'deadline' : 'project';
  const setParam = (key: string, value: string | null) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );

  const [setupOpen, setSetupOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newProjectId, setNewProjectId] = useState('');
  const [dragId, setDragId] = useState<string | null>(null);
  const [overColumn, setOverColumn] = useState<'open' | 'done' | null>(null);

  const toggleProject = useMutation({
    mutationFn: (vars: { id: string; on: boolean }) =>
      api.projects.update(vars.id, { showOnBoard: vars.on }),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: qk.board(directionId) });
      void qc.invalidateQueries({ queryKey: qk.projects(directionId) });
      void qc.invalidateQueries({ queryKey: qk.project(vars.id) });
    },
    onError: () => toast.show('Не удалось изменить доску'),
  });

  // возврат из «Готово» — сразу на экране, при ошибке карточка едет обратно
  const reopen = useMutation({
    mutationFn: (taskId: string) => api.tasks.reopen(taskId),
    onMutate: async (taskId) => {
      await qc.cancelQueries({ queryKey: qk.board(directionId) });
      const previous = qc.getQueryData<Board>(qk.board(directionId));
      if (previous) {
        qc.setQueryData<Board>(qk.board(directionId), {
          ...previous,
          tasks: previous.tasks.map((t) =>
            t.id === taskId ? { ...t, status: 'open', completedAt: null } : t,
          ),
        });
      }
      return { previous };
    },
    onError: (_e, _taskId, context) => {
      if (context?.previous) qc.setQueryData(qk.board(directionId), context.previous);
      toast.show('Не удалось вернуть задачу');
    },
    onSuccess: (_data, taskId) => {
      invalidateFocusScope(qc);
      void qc.invalidateQueries({ queryKey: qk.task(taskId) });
      // вместе с возвратом откатывается касание
      void qc.invalidateQueries({ queryKey: ['heatmap'] });
      void qc.invalidateQueries({ queryKey: ['touches'] });
    },
  });

  const createTask = useMutation({
    mutationFn: () =>
      api.tasks.create({ projectId: newProjectId, title: newTitle.trim(), pinned: false }),
    onSuccess: (task) => {
      invalidateFocusScope(qc, task.projectId);
      toast.show('Задача добавлена');
      setNewTitle('');
      setCreateOpen(false);
    },
    onError: () => toast.show('Не удалось добавить задачу'),
  });

  const data = board.data;
  const colors = useMemo(
    () =>
      projectColors(
        (data?.projects ?? []).map((p) => p.id),
        directionColor,
      ),
    [data, directionColor],
  );

  const liveProjects = projects.filter((p) => p.status !== 'archived');

  const setupList = (
    <div className="board-setup">
      {liveProjects.length === 0 ? (
        <p className="hint">В направлении пока нет проектов.</p>
      ) : (
        liveProjects.map((p) => (
          <CheckRow
            key={p.id}
            checked={p.showOnBoard}
            onChange={() => toggleProject.mutate({ id: p.id, on: !p.showOnBoard })}
            label={p.title}
          />
        ))
      )}
    </div>
  );

  if (board.isLoading) return <Loading what="Собираю доску" />;
  if (board.isError) return <ErrorBox error={board.error} onRetry={() => void board.refetch()} />;
  if (!data) return null;

  if (data.projects.length === 0) {
    return (
      <div className="card">
        <EmptyState
          title="На доске пока пусто"
          description="Доска собирает задачи нескольких проектов направления в одном месте — например, все серии всех мультфильмов. Отметьте проекты, которые на ней нужны: задачи останутся в своих проектах, доска их только показывает."
        />
        {setupList}
      </div>
    );
  }

  const projectOrder = new Map(data.projects.map((p, i) => [p.id, i]));
  const needle = search.trim().toLocaleLowerCase('ru');
  const visible = data.tasks.filter(
    (t) =>
      (onlyProjects.length === 0 || onlyProjects.includes(t.projectId)) &&
      (!needle || t.title.toLocaleLowerCase('ru').includes(needle)),
  );
  const byProject = (a: BoardTask, b: BoardTask) =>
    (projectOrder.get(a.projectId) ?? 0) - (projectOrder.get(b.projectId) ?? 0) ||
    a.sortOrder - b.sortOrder;
  const byDeadline = (a: BoardTask, b: BoardTask) => {
    if (a.deadline && b.deadline && a.deadline !== b.deadline) {
      return a.deadline < b.deadline ? -1 : 1;
    }
    if (Boolean(a.deadline) !== Boolean(b.deadline)) return a.deadline ? -1 : 1;
    return byProject(a, b);
  };
  const openTasks = visible
    .filter((t) => t.status === 'open')
    .sort(sort === 'deadline' ? byDeadline : byProject);
  const doneTasks = visible
    .filter((t) => t.status === 'done')
    // свежезакрытое — наверху: это то, что только что сделано
    .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));

  const toggleFilter = (id: string) => {
    const next = onlyProjects.includes(id)
      ? onlyProjects.filter((x) => x !== id)
      : [...onlyProjects, id];
    setParam('p', next.join(','));
  };

  const moveTo = (task: BoardTask, column: 'open' | 'done') => {
    if (task.status === column) return;
    if (column === 'done') askComplete(task.id, task.title);
    else reopen.mutate(task.id);
  };

  const dropHandlers = (column: 'open' | 'done') => ({
    onDragOver: (e: DragEvent) => {
      if (!dragId) return;
      e.preventDefault();
      setOverColumn(column);
    },
    onDragLeave: () => setOverColumn((c) => (c === column ? null : c)),
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      const task = data.tasks.find((t) => t.id === e.dataTransfer.getData('text/plain'));
      setDragId(null);
      setOverColumn(null);
      if (task) moveTo(task, column);
    },
  });

  const card = (t: BoardTask) => {
    const done = t.status === 'done';
    const overdue = !done && t.deadline !== null && t.deadline < today;
    const checked = t.checklist.filter((i) => i.completed).length;
    return (
      <div
        key={t.id}
        className={`board-card${done ? ' is-done' : ''}${dragId === t.id ? ' is-dragging' : ''}`}
        style={{ ['--c' as string]: `var(${colors.get(t.projectId) ?? directionColor})` }}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData('text/plain', t.id);
          e.dataTransfer.effectAllowed = 'move';
          setDragId(t.id);
        }}
        onDragEnd={() => {
          setDragId(null);
          setOverColumn(null);
        }}
        onClick={() => navigate(`/tasks/${t.id}`)}
      >
        <div className="top">
          <button
            type="button"
            className={`check${done ? ' done' : ''}`}
            aria-label={done ? `Вернуть в работу: ${t.title}` : `Готово: ${t.title}`}
            onClick={(e) => {
              e.stopPropagation();
              moveTo(t, done ? 'open' : 'done');
            }}
          />
          <span className="ttl">{t.title}</span>
          {/* меню не должно открывать задачу: клик гасится на обёртке */}
          <span onClick={(e) => e.stopPropagation()}>
            <OverflowMenu
              label={`Действия: ${t.title}`}
              items={[
                { label: 'Открыть', onSelect: () => navigate(`/tasks/${t.id}`) },
                done
                  ? { label: 'Вернуть в «К выполнению»', onSelect: () => moveTo(t, 'open') }
                  : { label: 'Перенести в «Готово»', onSelect: () => moveTo(t, 'done') },
              ]}
            />
          </span>
        </div>
        <div className="meta">
          <span className="proj">
            <i className="dot" />
            {t.projectTitle}
          </span>
          {t.isActive ? <span className="badge is-focus">в фокусе</span> : null}
          {t.pinned ? (
            <span className="badge" title="Важная">
              <IconPinFilled />
            </span>
          ) : null}
          {t.deadline && !done ? (
            <span className={`badge mono${overdue ? ' is-overdue' : ''}`}>
              {overdue ? 'просрочено · ' : 'до '}
              {formatShortDate(t.deadline)}
            </span>
          ) : null}
          {t.checklist.length > 0 ? (
            <span className="badge mono">
              {checked}/{t.checklist.length}
            </span>
          ) : null}
        </div>
      </div>
    );
  };

  const column = (key: 'open' | 'done', title: string, list: BoardTask[], empty: string) => (
    <section
      className={`board-col${overColumn === key ? ' is-over' : ''}`}
      aria-label={title}
      {...dropHandlers(key)}
    >
      <div className="board-col-head">
        <span className="lbl">{title}</span>
        <span className="ct">{list.length}</span>
        {key === 'open' ? (
          <button
            type="button"
            className="board-add"
            aria-label="Новая задача"
            title="Новая задача"
            onClick={() => {
              setNewProjectId(
                onlyProjects.length === 1 ? onlyProjects[0]! : (data.projects[0]?.id ?? ''),
              );
              setCreateOpen(true);
            }}
          >
            <IconPlus />
          </button>
        ) : null}
      </div>
      <div className="board-col-body">
        {list.length > 0 ? list.map(card) : <p className="hint">{empty}</p>}
      </div>
    </section>
  );

  const openCount = data.tasks.filter((t) => t.status === 'open').length;

  return (
    <div className="board">
      <div className="board-toolbar">
        <input
          type="search"
          className="board-search"
          placeholder="Найти задачу"
          aria-label="Поиск по названию задачи"
          value={search}
          onChange={(e) => setParam('q', e.target.value)}
        />
        <div className="chips" role="group" aria-label="Проекты на доске">
          <button
            type="button"
            className="chip"
            data-on={onlyProjects.length === 0}
            onClick={() => setParam('p', null)}
          >
            все
          </button>
          {data.projects.map((p) => (
            <button
              key={p.id}
              type="button"
              className="chip"
              data-on={onlyProjects.includes(p.id)}
              onClick={() => toggleFilter(p.id)}
            >
              <i className="dot" style={{ background: `var(${colors.get(p.id)})` }} />
              {p.title}
            </button>
          ))}
        </div>
        <div className="board-toolbar-row">
          <div className="seg" role="group" aria-label="Сортировка">
            <button
              type="button"
              data-on={sort === 'project'}
              aria-pressed={sort === 'project'}
              onClick={() => setParam('sort', null)}
            >
              По проектам
            </button>
            <button
              type="button"
              data-on={sort === 'deadline'}
              aria-pressed={sort === 'deadline'}
              onClick={() => setParam('sort', 'deadline')}
            >
              По сроку
            </button>
          </div>
          <CheckRow
            checked={hideDone}
            onChange={() => setParam('done', hideDone ? null : 'hide')}
            label="Скрыть готовые"
          />
          <Button size="sm" variant="ghost" onClick={() => setSetupOpen(true)}>
            Проекты на доске
          </Button>
        </div>
        <p className="hint">
          {openCount} {plural(openCount, 'задача', 'задачи', 'задач')} к выполнению в{' '}
          {data.projects.length} {plural(data.projects.length, 'проекте', 'проектах', 'проектах')}
        </p>
      </div>

      <div className={`board-cols${hideDone ? ' is-single' : ''}`}>
        {column(
          'open',
          'К выполнению',
          openTasks,
          needle || onlyProjects.length ? 'Ничего не нашлось.' : 'Всё сделано.',
        )}
        {hideDone ? null : column('done', 'Готово', doneTasks, 'Пока ничего не закрыто.')}
      </div>

      {dialog}

      <Modal
        open={setupOpen}
        onOpenChange={setSetupOpen}
        title="Проекты на доске"
        description="Задачи отмеченных проектов видны на доске. Сами задачи от этого не меняются."
        footer={
          <Button variant="primary" onClick={() => setSetupOpen(false)}>
            Готово
          </Button>
        }
      >
        {setupList}
      </Modal>

      <Modal
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Новая задача"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Отмена
            </Button>
            <Button
              variant="primary"
              disabled={!newTitle.trim() || !newProjectId || createTask.isPending}
              onClick={() => createTask.mutate()}
            >
              Добавить
            </Button>
          </>
        }
      >
        <FormField label="Название">
          <input
            type="text"
            value={newTitle}
            autoFocus
            placeholder="Серия 5"
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newTitle.trim() && newProjectId) createTask.mutate();
            }}
          />
        </FormField>
        <FormField label="Проект" hint="Задача всегда живёт в проекте — доска её только показывает">
          <select value={newProjectId} onChange={(e) => setNewProjectId(e.target.value)}>
            {data.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </FormField>
      </Modal>
    </div>
  );
}
