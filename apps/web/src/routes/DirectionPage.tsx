import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  FormField,
  Heatmap,
  IconChevron,
  IconPlus,
  Modal,
  PageHeader,
  useToast,
} from '@planner/ui';
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
import { Glyph } from '../components/Glyph.js';
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
  if (direction.isError) return <ErrorBox error={direction.error} />;
  const d = direction.data;
  if (!d) return null;

  const list = projects.data ?? [];
  const hot = list.filter((p) => p.status === 'active' && (p.hasActiveTask || p.pinnedCount > 0));
  const rest = list.filter((p) => p.status === 'active' && !p.hasActiveTask && p.pinnedCount === 0);
  const paused = list.filter((p) => p.status === 'paused');
  const archived = list.filter((p) => p.status === 'archived');
  const total = heat.data?.total ?? 0;

  const projectCard = (p: (typeof list)[number], prominent: boolean) => (
    <button
      key={p.id}
      type="button"
      className="card"
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        marginBottom: 10,
        background: prominent ? undefined : 'transparent',
      }}
      onClick={() => navigate(`/projects/${p.id}`)}
    >
      <div style={{ fontFamily: 'Literata, serif', fontSize: prominent ? 17 : 15.5 }}>
        {p.title}
        {p.status === 'paused' ? (
          <span className="quiet" style={{ marginLeft: 6 }}>
            на паузе
          </span>
        ) : null}
      </div>
      {p.desiredOutcome ? (
        <p className="hint" style={{ marginTop: 5, maxWidth: '70ch' }}>
          {p.desiredOutcome}
        </p>
      ) : null}
      <div className="quiet" style={{ marginTop: 9 }}>
        {[
          p.hasActiveTask && p.activeTaskTitle ? `Сейчас: ${p.activeTaskTitle}` : null,
          p.pinnedCount ? `Закреплено: ${p.pinnedCount}` : null,
          p.deadline ? `срок ${formatLongDate(p.deadline)}` : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      </div>
    </button>
  );

  return (
    <>
      <PageHeader
        onBack={() => navigate('/directions')}
        backLabel="Направления"
        title={d.name}
        eyebrow={
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Glyph name={d.name} color={d.color} large />
          </div>
        }
        subtitle={d.showMotto && d.motto ? <em>«{d.motto}»</em> : d.description}
        actions={
          <>
            <Button size="sm" onClick={() => setSettingsOpen(true)}>
              Настройки
            </Button>
            <Button
              size="sm"
              onClick={() => setDirection.mutate({ directionId, onConflict: 'ask' })}
            >
              Поставить в фокус
            </Button>
            <Button size="sm" variant="primary" onClick={() => setTouchOpen(true)}>
              <IconPlus />
              Касание
            </Button>
          </>
        }
      />

      <div className="card">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) 300px',
            gap: 26,
            alignItems: 'start',
          }}
          className="dirsplit"
        >
          <div>
            <div className="lbl" style={{ marginBottom: 10 }}>
              Карта касаний
            </div>
            <Heatmap days={heat.data?.days ?? []} today={today} onDayClick={setDay} />
            <p className="hint" style={{ marginTop: 12 }}>
              {total} {plural(total, 'касание', 'касания', 'касаний')} всего ·{' '}
              {heat.data?.weekTotal ?? 0} на этой неделе
            </p>
          </div>
          <div>
            <div className="sec-h" style={{ marginBottom: 8 }}>
              <span className="lbl">Последние касания</span>
            </div>
            {(touches.data ?? []).map((t) => (
              <div className="row" key={t.id} style={{ padding: '8px 0' }}>
                <i
                  className="dot"
                  style={{ background: `var(${t.directionColor})`, marginTop: 5 }}
                />
                <div className="row-main">
                  <div className="row-title" style={{ fontWeight: 400 }}>
                    {t.title}
                  </div>
                  <div className="row-sub">
                    {humanDate(t.date, today)}
                    {t.projectTitle ? ` · ${t.projectTitle}` : ''}
                  </div>
                </div>
              </div>
            ))}
            {touches.data?.length === 0 ? <p className="hint">Пока ни одного.</p> : null}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 20 }}>
        <div className="sec-h">
          <h3 style={{ fontSize: 17 }}>Проекты</h3>
          <Button size="sm" onClick={() => setProjectOpen(true)}>
            <IconPlus />
            Новый проект
          </Button>
        </div>

        {hot.map((p) => projectCard(p, true))}
        {rest.map((p) => projectCard(p, false))}
        {list.length === 0 ? (
          <div className="card">
            <p className="hint">Проектов пока нет. Направление живёт и без них.</p>
          </div>
        ) : null}

        {paused.length > 0 ? (
          <div className="fold" style={{ marginTop: 6 }}>
            <button type="button" className="fold-h" onClick={() => setShowPaused((v) => !v)}>
              <span className="lbl">На паузе · {paused.length}</span>
              <span
                style={{
                  transform: showPaused ? 'rotate(180deg)' : undefined,
                  display: 'inline-flex',
                  color: 'var(--text-3)',
                }}
              >
                <IconChevron />
              </span>
            </button>
            {showPaused ? (
              <div className="fold-b">{paused.map((p) => projectCard(p, false))}</div>
            ) : null}
          </div>
        ) : null}

        {archived.length > 0 ? (
          <div className="fold" style={{ marginTop: 8 }}>
            <button type="button" className="fold-h" onClick={() => setShowArchive((v) => !v)}>
              <span className="lbl">Архив · {archived.length}</span>
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
                {archived.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="row"
                    style={{ width: '100%', textAlign: 'left' }}
                    onClick={() => navigate(`/projects/${p.id}`)}
                  >
                    <div className="row-main">
                      <div className="row-title" style={{ fontWeight: 400 }}>
                        {p.title}
                      </div>
                      <div className="row-sub">
                        завершён {p.completedAt ? humanDate(p.completedAt.slice(0, 10), today) : ''}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

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
    </>
  );
}
