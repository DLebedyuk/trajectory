import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { OverviewProject } from '@planner/contracts';
import { Button, EmptyState, IconChevron, PageHeader, useToast } from '@planner/ui';
import { formatLongDate, plural, todayInTimezone } from '@planner/shared';
import { useDashboard, useOverview, useReorderProjects, useTasks } from '../api/queries.js';
import { ErrorBox, Loading } from '../components/Loading.js';
import {
  PinButton,
  PRIORITY_LABEL,
  PRIORITY_RANK,
  PriorityPicker,
} from '../features/ProjectMeta.js';
import { useDragSort } from '../features/useDragSort.js';
import { useUiStore } from '../store/ui.js';

const PRIORITY_FILTERS = [
  { value: 'any', label: 'Все' },
  { value: 'high', label: PRIORITY_LABEL.high },
  { value: 'normal', label: PRIORITY_LABEL.normal },
  { value: 'low', label: PRIORITY_LABEL.low },
  { value: 'none', label: 'Без приоритета' },
] as const;

/** Сколько задач показывать в раскрытой карточке: обзор — не список задач. */
const TASKS_PREVIEW = 6;

interface Group {
  directionId: string;
  name: string;
  color: string;
  projects: OverviewProject[];
}

/**
 * «Обзор» — общая картина проектов поверх направлений. Это не вторая главная
 * и не список задач: здесь видно, что где лежит, и отсюда можно перейти
 * к нужному проекту. Фокус живёт на главной и отсюда не меняется.
 */
export function OverviewPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const view = useUiStore((s) => s.overview);
  const setView = useUiStore((s) => s.setOverview);
  const overview = useOverview(view.scope);
  const dashboard = useDashboard();
  const reorder = useReorderProjects();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [ordering, setOrdering] = useState(false);

  const today = dashboard.data?.today ?? todayInTimezone('UTC');

  if (overview.isLoading) return <Loading what="Собираю обзор" />;
  if (overview.isError)
    return <ErrorBox error={overview.error} onRetry={() => void overview.refetch()} />;
  const data = overview.data;
  if (!data) return null;

  const filtered = data.projects.filter((p) =>
    view.priority === 'any'
      ? true
      : view.priority === 'none'
        ? p.priority === null
        : p.priority === view.priority,
  );

  // сервер уже отдаёт порядок направлений и ручной порядок проектов —
  // группировка его сохраняет, сортировка по приоритету стабильна
  const groups: Group[] = [];
  for (const p of filtered) {
    let g = groups.find((x) => x.directionId === p.directionId);
    if (!g) {
      g = {
        directionId: p.directionId,
        name: p.directionName,
        color: p.directionColor,
        projects: [],
      };
      groups.push(g);
    }
    g.projects.push(p);
  }
  if (view.sort === 'priority') {
    for (const g of groups) {
      g.projects.sort(
        (a, b) => PRIORITY_RANK[a.priority ?? 'none'] - PRIORITY_RANK[b.priority ?? 'none'],
      );
    }
  }

  // переставлять можно только то, что показано в ручном порядке и целиком:
  // иначе непонятно, куда встанут скрытые фильтром проекты
  const canOrder = view.sort === 'manual' && view.priority === 'any';
  const isOrdering = ordering && canOrder;

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const commitOrder = (ids: string[]) =>
    reorder.mutate(ids, { onError: () => toast.show('Не удалось сохранить порядок') });

  const { stats } = data;
  const nothingPinned = view.scope === 'pinned' && stats.pinned === 0;

  return (
    <div className="overview-page">
      <PageHeader
        title="Обзор"
        subtitle={
          view.scope === 'pinned'
            ? 'Закреплённые проекты всех направлений'
            : 'Все живые проекты по направлениям'
        }
      />

      <div className="ov-stats" role="list" aria-label="Общая статистика">
        <Stat
          label={plural(stats.directions, 'направление', 'направления', 'направлений')}
          value={stats.directions}
        />
        <Stat
          label={plural(stats.projects, 'проект', 'проекта', 'проектов')}
          value={stats.projects}
        />
        <Stat label="закреплено" value={stats.pinned} />
        <Stat
          label={plural(stats.openTasks, 'открытая задача', 'открытые задачи', 'открытых задач')}
          value={stats.openTasks}
        />
        <Stat
          label="просрочено"
          value={stats.overdueTasks}
          tone={stats.overdueTasks > 0 ? 'warn' : undefined}
        />
      </div>

      <div className="ov-toolbar">
        <div className="seg ov-scope" role="group" aria-label="Какие проекты показывать">
          <button
            type="button"
            data-on={view.scope === 'pinned'}
            aria-pressed={view.scope === 'pinned'}
            onClick={() => setView({ scope: 'pinned' })}
          >
            Закреплённые
          </button>
          <button
            type="button"
            data-on={view.scope === 'all'}
            aria-pressed={view.scope === 'all'}
            onClick={() => setView({ scope: 'all' })}
          >
            Все проекты
          </button>
        </div>

        <div className="seg ov-sort" role="group" aria-label="Сортировка">
          <button
            type="button"
            data-on={view.sort === 'manual'}
            aria-pressed={view.sort === 'manual'}
            onClick={() => setView({ sort: 'manual' })}
          >
            Мой порядок
          </button>
          <button
            type="button"
            data-on={view.sort === 'priority'}
            aria-pressed={view.sort === 'priority'}
            onClick={() => setView({ sort: 'priority' })}
          >
            По приоритету
          </button>
        </div>

        <Button
          size="sm"
          variant={isOrdering ? 'primary' : undefined}
          disabled={!canOrder || filtered.length < 2}
          title={canOrder ? undefined : 'Порядок меняется в режиме «Мой порядок» без фильтра'}
          onClick={() => setOrdering((v) => !v)}
        >
          {isOrdering ? 'Готово' : 'Упорядочить'}
        </Button>
      </div>

      <div className="chips ov-filter" role="group" aria-label="Фильтр по приоритету">
        {PRIORITY_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            className={`chip${view.priority === f.value ? ' is-active' : ''}`}
            aria-pressed={view.priority === f.value}
            onClick={() => setView({ priority: f.value })}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isOrdering ? (
        <p className="hint ov-order-hint">
          Перетащите проект за ручку или двигайте стрелками. Порядок меняется внутри направления.
        </p>
      ) : null}

      {nothingPinned ? (
        <EmptyState
          title="Закреплённых проектов пока нет"
          description="Закрепите проект на странице направления — значок булавки у карточки. Он появится здесь. Фокус на главной от этого не меняется."
          action={
            <div className="ov-empty-actions">
              <Button size="sm" variant="primary" onClick={() => setView({ scope: 'all' })}>
                Показать все проекты
              </Button>
              <Button size="sm" onClick={() => navigate('/directions')}>
                К направлениям
              </Button>
            </div>
          }
        />
      ) : data.projects.length === 0 ? (
        <EmptyState
          title="Проектов пока нет"
          description="Проекты живут внутри направлений. Направление живёт и без них."
          action={
            <Button size="sm" onClick={() => navigate('/directions')}>
              К направлениям
            </Button>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="Нет проектов с таким приоритетом"
          action={
            <Button size="sm" onClick={() => setView({ priority: 'any' })}>
              Сбросить фильтр
            </Button>
          }
        />
      ) : (
        groups.map((g) => (
          <DirectionGroup
            key={g.directionId}
            group={g}
            today={today}
            ordering={isOrdering}
            expanded={expanded}
            onToggle={toggle}
            onCommit={commitOrder}
          />
        ))
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'warn' }) {
  return (
    <div className={`ov-stat${tone ? ` is-${tone}` : ''}`} role="listitem">
      <span className="v">{value}</span>
      <span className="l">{label}</span>
    </div>
  );
}

function DirectionGroup({
  group,
  today,
  ordering,
  expanded,
  onToggle,
  onCommit,
}: {
  group: Group;
  today: string;
  ordering: boolean;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  onCommit: (ids: string[]) => void;
}) {
  const navigate = useNavigate();
  const ids = group.projects.map((p) => p.id);
  const sort = useDragSort(ids, onCommit);

  return (
    <section className="ov-group" aria-label={`Направление: ${group.name}`}>
      <div className="ov-group-head">
        <span
          className="dir-glyph sm"
          style={{ ['--c' as string]: `var(${group.color})` }}
          aria-hidden="true"
        >
          {group.name.charAt(0)}
        </span>
        <button
          type="button"
          className="nm"
          onClick={() => navigate(`/directions/${group.directionId}`)}
        >
          {group.name}
        </button>
        <span className="ct">{group.projects.length}</span>
      </div>

      <div className="ov-list">
        {group.projects.map((p, i) => (
          <div
            key={p.id}
            ref={sort.itemRef(p.id)}
            style={sort.itemStyle(p.id)}
            className={`ov-item${sort.draggingId === p.id ? ' is-dragging' : ''}`}
          >
            {ordering ? (
              <div className="ov-order">
                <button
                  type="button"
                  className="ov-handle"
                  aria-label={`Перетащить: ${p.title}`}
                  {...sort.handleProps(p.id)}
                >
                  ⋮⋮
                </button>
                <button
                  type="button"
                  className="ov-arrow"
                  aria-label={`Выше: ${p.title}`}
                  disabled={i === 0}
                  onClick={() => sort.move(p.id, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="ov-arrow"
                  aria-label={`Ниже: ${p.title}`}
                  disabled={i === group.projects.length - 1}
                  onClick={() => sort.move(p.id, 1)}
                >
                  ↓
                </button>
              </div>
            ) : null}
            <ProjectCard
              project={p}
              today={today}
              color={group.color}
              open={!ordering && expanded.has(p.id)}
              compact={ordering}
              onToggle={() => onToggle(p.id)}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

function ProjectCard({
  project: p,
  today,
  color,
  open,
  compact,
  onToggle,
}: {
  project: OverviewProject;
  today: string;
  color: string;
  open: boolean;
  compact: boolean;
  onToggle: () => void;
}) {
  const navigate = useNavigate();
  const overdueDeadline = p.nextDeadline !== null && p.nextDeadline < today;

  return (
    <div
      className={`ov-card${p.pinned ? ' is-pinned' : ''}${p.status === 'paused' ? ' is-paused' : ''}${open ? ' is-open' : ''}`}
      style={{ ['--c' as string]: `var(${color})` }}
    >
      <div className="ov-card-top">
        <button
          type="button"
          className="ov-expand"
          aria-expanded={open}
          aria-label={open ? `Свернуть задачи: ${p.title}` : `Показать задачи: ${p.title}`}
          disabled={compact}
          onClick={onToggle}
        >
          <IconChevron className="chev" aria-hidden="true" />
          <span className="nm">{p.title}</span>
        </button>
        {compact ? null : (
          <span className="ov-actions">
            <PriorityPicker projectId={p.id} title={p.title} priority={p.priority} />
            <PinButton projectId={p.id} title={p.title} pinned={p.pinned} />
          </span>
        )}
      </div>

      <div className="ov-meta">
        <span className="dir">{p.directionName}</span>
        {p.status === 'paused' ? <span className="tag">на паузе</span> : null}
        {p.hasActiveTask ? <span className="tag">сейчас в работе</span> : null}
        <span>
          сделано {p.doneTaskCount} · открыто {p.openTaskCount}
        </span>
        {p.nextDeadline ? (
          <span className={overdueDeadline ? 'is-overdue' : undefined}>
            срок {formatLongDate(p.nextDeadline)}
            {overdueDeadline ? ' — прошёл' : ''}
          </span>
        ) : null}
        {/* красным уже помечен срок — второй красный здесь был бы лишним */}
        {p.overdueTaskCount > 0 ? <span>просрочено {p.overdueTaskCount}</span> : null}
      </div>

      {open ? (
        <ProjectTasks
          projectId={p.id}
          today={today}
          onOpenProject={() => navigate(`/projects/${p.id}`)}
        />
      ) : null}
    </div>
  );
}

/** Задачи загружаются только при раскрытии карточки. */
function ProjectTasks({
  projectId,
  today,
  onOpenProject,
}: {
  projectId: string;
  today: string;
  onOpenProject: () => void;
}) {
  const navigate = useNavigate();
  const tasks = useTasks(projectId, { status: 'open' });
  const list = tasks.data ?? [];
  const shown = list.slice(0, TASKS_PREVIEW);
  const rest = list.length - shown.length;

  return (
    <div className="ov-tasks">
      {tasks.isLoading ? <p className="hint">Загружаю задачи…</p> : null}
      {tasks.isSuccess && list.length === 0 ? <p className="hint">Открытых задач нет.</p> : null}
      {shown.map((t) => (
        <button
          key={t.id}
          type="button"
          className="ov-task"
          onClick={() => navigate(`/tasks/${t.id}`)}
        >
          <span className="ttl">{t.title}</span>
          {t.deadline ? (
            <span className={`dl${t.deadline < today ? ' is-overdue' : ''}`}>
              {formatLongDate(t.deadline)}
            </span>
          ) : null}
        </button>
      ))}
      <button type="button" className="ov-open-project" onClick={onOpenProject}>
        {rest > 0
          ? `Ещё ${rest} ${plural(rest, 'задача', 'задачи', 'задач')} — открыть проект`
          : 'Открыть проект'}{' '}
        →
      </button>
    </div>
  );
}
