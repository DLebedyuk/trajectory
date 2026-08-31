import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, FormField, Heatmap, IconPlus, Modal, PageHeader, useToast } from '@planner/ui';
import { formatLongDate, humanDate, plural, todayInTimezone } from '@planner/shared';
import { api } from '../api/client.js';
import {
  qk,
  useDashboard,
  useDirection,
  useHeatmap,
  useProjects,
  useTouches,
} from '../api/queries.js';
import { ErrorBox, Loading } from '../components/Loading.js';
import { TouchModal } from '../features/TouchModal.js';
import { useFocusDirection } from '../features/useFocusDirection.js';
import { DirectionSettingsModal } from '../features/DirectionSettingsModal.js';
import { DayTouchesModal } from '../features/DayTouchesModal.js';

/** Страница направления. Задачи здесь не показываются — только проекты. */
export function DirectionPage() {
  const { directionId = '' } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();

  const direction = useDirection(directionId);
  const projects = useProjects(directionId);
  const heat = useHeatmap(26, directionId);
  const touches = useTouches({ directionId, limit: 5 });
  const dashboard = useDashboard();

  const [touchOpen, setTouchOpen] = useState(false);
  const [day, setDay] = useState<string | null>(null);
  const [projectOpen, setProjectOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [outcome, setOutcome] = useState('');
  const [showPaused, setShowPaused] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const today = dashboard.data?.today ?? todayInTimezone('UTC');

  const createProject = useMutation({
    mutationFn: () =>
      api.projects.create({
        directionId,
        title,
        desiredOutcome: outcome,
        status: 'active',
        notes: [],
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.projects(directionId) });
      toast.show('Проект создан');
      setTitle('');
      setOutcome('');
      setProjectOpen(false);
    },
  });

  // 'ask' — сервер вернёт 409, если активна задача из другого направления,
  // и пользователь сам решит, что делать. Молча снимать задачу нельзя.
  const { setDirection, conflictModal } = useFocusDirection();

  if (direction.isLoading) return <Loading what="Загружаю направление" />;
  if (direction.isError)
    return <ErrorBox error={direction.error} onRetry={() => void direction.refetch()} />;
  const d = direction.data;
  if (!d) return null;

  const list = projects.data ?? [];
  const active = list.filter((p) => p.status === 'active');
  const paused = list.filter((p) => p.status === 'paused');
  const archived = list.filter((p) => p.status === 'archived');
  const total = heat.data?.total ?? 0;
  const isFocus = dashboard.data?.focus.focusDirectionId === directionId;
  const dirColor = `var(${d.color})`;

  const projectCard = (p: (typeof list)[number], modifier?: 'is-paused' | 'is-completed') => (
    <button
      key={p.id}
      type="button"
      className={`dir-project-card${modifier ? ` ${modifier}` : ''}`}
      style={{ ['--c' as string]: dirColor }}
      onClick={() => navigate(`/projects/${p.id}`)}
    >
      <span className="top">
        <span className="nm">{p.title}</span>
        <span className="stats">
          {p.openTaskCount
            ? `${p.openTaskCount} ${plural(p.openTaskCount, 'задача', 'задачи', 'задач')}`
            : 'без открытых задач'}
          {p.pinnedCount ? ` · закреплено ${p.pinnedCount}` : ''}
          {p.deadline ? ` · срок ${formatLongDate(p.deadline)}` : ''}
        </span>
      </span>
      {p.desiredOutcome ? <span className="goal">{p.desiredOutcome}</span> : null}
    </button>
  );

  return (
    <div className="dir-page-content">
      <PageHeader
        onBack={() => navigate('/directions')}
        backLabel="Направления"
        title={d.name}
        glyph={{ letter: d.name.charAt(0), color: d.color }}
        subtitle={d.description}
        actions={
          <>
            <Button size="sm" onClick={() => setSettingsOpen(true)}>
              Настройки
            </Button>
            <Button size="sm" onClick={() => navigate(`/directions/${directionId}/archive`)}>
              Архив
            </Button>
            <Button
              size="sm"
              variant={isFocus ? undefined : 'primary'}
              disabled={isFocus}
              onClick={() => setDirection.mutate({ directionId, onConflict: 'ask' })}
            >
              {isFocus ? 'В фокусе' : 'Поставить в фокус'}
            </Button>
          </>
        }
      />

      <div className="card">
        <div className="dir-split">
          <div>
            <h4>Карта касаний</h4>
            <div className="scroll-x">
              <Heatmap days={heat.data?.days ?? []} today={today} onDayClick={setDay} />
            </div>
            <p className="hint" style={{ marginTop: 12 }}>
              {total} {plural(total, 'касание', 'касания', 'касаний')} всего ·{' '}
              {heat.data?.weekTotal ?? 0} на этой неделе
            </p>
          </div>

          <div>
            <h4>
              Последние касания
              <span className="today-links">
                <button type="button" onClick={() => setTouchOpen(true)}>
                  Записать
                </button>
                <button
                  type="button"
                  onClick={() => navigate(`/directions/${directionId}/touches`)}
                >
                  Все
                </button>
              </span>
            </h4>
            {(touches.data ?? []).map((t) => (
              <div className="touch-item" key={t.id}>
                <span
                  className="dir-glyph sm"
                  style={{ ['--c' as string]: `var(${t.directionColor})` }}
                  aria-hidden="true"
                >
                  {t.directionName.charAt(0)}
                </span>
                <div className="info">
                  <div className="ttl">{t.title}</div>
                  <div className="meta">
                    {humanDate(t.date, today)}
                    {t.projectTitle ? ` · ${t.projectTitle}` : ''}
                  </div>
                  {t.comment ? <p className="hint">{t.comment}</p> : null}
                </div>
              </div>
            ))}
            {touches.data?.length === 0 ? <p className="hint">Пока ни одного.</p> : null}
          </div>
        </div>
      </div>

      {/* Проекты — отдельная секция, а не продолжение карточки с картой касаний */}
      <section className="dir-projects-section" aria-label="Проекты направления">
        <div className="section-title">
          Проекты
          <Button size="sm" onClick={() => setProjectOpen(true)}>
            <IconPlus />
            Новый проект
          </Button>
        </div>

        {active.map((p) => projectCard(p))}

        {list.length === 0 ? (
          <div className="card">
            <p className="hint">Проектов пока нет. Направление живёт и без них.</p>
          </div>
        ) : null}

        {paused.length > 0 ? (
          <>
            <button
              type="button"
              className="dir-collapsed"
              aria-expanded={showPaused}
              onClick={() => setShowPaused((v) => !v)}
            >
              <span className="lbl">На паузе</span>
              <span className="ct">
                {paused.length} · {showPaused ? 'свернуть' : 'показать'}
              </span>
            </button>
            {showPaused ? paused.map((p) => projectCard(p, 'is-paused')) : null}
          </>
        ) : null}

        {archived.length > 0 ? (
          <>
            <button
              type="button"
              className="dir-collapsed"
              aria-expanded={showArchive}
              onClick={() => setShowArchive((v) => !v)}
            >
              <span className="lbl">Завершённые проекты</span>
              <span className="ct">
                {archived.length} · {showArchive ? 'свернуть' : 'показать'}
              </span>
            </button>
            {showArchive ? archived.map((p) => projectCard(p, 'is-completed')) : null}
          </>
        ) : null}
      </section>

      <TouchModal
        open={touchOpen}
        onOpenChange={setTouchOpen}
        directionId={directionId}
        today={today}
      />
      <DayTouchesModal date={day} directionId={directionId} onClose={() => setDay(null)} />

      <DirectionSettingsModal
        direction={d}
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        onArchived={() => navigate('/directions')}
      />

      {conflictModal}

      <Modal
        open={projectOpen}
        onOpenChange={setProjectOpen}
        title="Новый проект"
        footer={
          <>
            <Button variant="ghost" onClick={() => setProjectOpen(false)}>
              Отмена
            </Button>
            <Button
              variant="primary"
              disabled={!title.trim()}
              onClick={() => createProject.mutate()}
            >
              Создать
            </Button>
          </>
        }
      >
        <FormField label="Название">
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} />
        </FormField>
        <FormField label="Желаемый результат">
          <textarea rows={2} value={outcome} onChange={(e) => setOutcome(e.target.value)} />
        </FormField>
      </Modal>
    </div>
  );
}
