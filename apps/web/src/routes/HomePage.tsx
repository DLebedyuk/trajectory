import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  EmptyState,
  Heatmap,
  IconBell,
  IconPlus,
  Modal,
  ProjectTaskCard,
  useToast,
} from '@planner/ui';
import { DURATION_LABEL, formatLongDate, humanDate, plural } from '@planner/shared';
import { api } from '../api/client.js';
import {
  invalidateFocusScope,
  qk,
  useCompleteTask,
  useDashboard,
  useDirections,
  useTogglePin,
} from '../api/queries.js';
import { TodayBlock } from '../features/TodayBlock.js';
import { FocusCard } from '../features/FocusCard.js';
import { PickTaskModal } from '../features/PickTaskModal.js';
import { useFocusDirection } from '../features/useFocusDirection.js';
import { DayTouchesModal } from '../features/DayTouchesModal.js';
import { TouchModal } from '../features/TouchModal.js';
import { ReminderModal } from '../features/ReminderModal.js';
import { ErrorBox, Loading } from '../components/Loading.js';

export function HomePage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const dashboard = useDashboard();
  const directions = useDirections();
  const completeTask = useCompleteTask();
  const togglePin = useTogglePin();

  const [pickOpen, setPickOpen] = useState(false);
  const [pickMode, setPickMode] = useState<'active' | 'pin'>('active');
  const [dirOpen, setDirOpen] = useState(false);
  const [day, setDay] = useState<string | null>(null);
  const [touchOpen, setTouchOpen] = useState(false);
  const [remindOpen, setRemindOpen] = useState(false);
  const [thoughtOpen, setThoughtOpen] = useState(false);
  const [thought, setThought] = useState('');
  const [archiveOpen, setArchiveOpen] = useState(false);

  const archive = useQuery({
    queryKey: qk.remindersArchive,
    queryFn: api.reminders.archive,
    enabled: archiveOpen,
  });

  const setActive = useMutation({
    mutationFn: (taskId: string) => api.tasks.activate(taskId),
    onSuccess: () => {
      invalidateFocusScope(qc);
      toast.show('Активная задача обновлена');
    },
  });
  const clearActive = useMutation({
    mutationFn: () => api.focus.clearActiveTask(),
    onSuccess: () => {
      invalidateFocusScope(qc);
      toast.show('Активной задачи нет');
    },
  });
  const { setDirection, conflictModal } = useFocusDirection({
    onSettled: () => setDirOpen(false),
  });
  const completeReminder = useMutation({
    mutationFn: (id: string) => api.reminders.complete(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.dashboard });
      void qc.invalidateQueries({ queryKey: qk.reminders });
      toast.show('Готово. Напоминание ушло в архив.');
    },
  });
  const addThought = useMutation({
    mutationFn: () => api.inbox.create({ originalText: thought, source: 'web' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.inbox });
      toast.show('Сохранил во входящие. Ничего делать не надо.');
      setThought('');
      setThoughtOpen(false);
    },
  });

  if (dashboard.isLoading) return <Loading what="Собираю главную" />;
  if (dashboard.isError) return <ErrorBox error={dashboard.error} />;
  const data = dashboard.data;
  if (!data) return null;

  const weekTotal = data.heatmap.weekTotal;

  return (
    <>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 16,
          marginBottom: 20,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div className="lbl">
            {humanDate(data.today, data.today)}, {formatLongDate(data.today)}
          </div>
          <h1 style={{ fontSize: 26, marginTop: 6 }}>Привет</h1>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button onClick={() => setThoughtOpen(true)}>
            <IconPlus />
            Мысль
          </Button>
          <Button variant="primary" onClick={() => setRemindOpen(true)}>
            <IconBell />
            Напомнить
          </Button>
        </div>
      </div>

      <div className="stack" style={{ maxWidth: 840 }}>
        <TodayBlock
          events={data.events}
          tasks={data.dueTasks}
          overdue={data.overdueTasks}
          reminders={data.todayReminders}
          onCompleteTask={(id) => completeTask.mutate(id)}
          onCompleteReminder={(id) => completeReminder.mutate(id)}
          onOpenArchive={() => setArchiveOpen(true)}
        />

        <FocusCard
          focus={data.focus}
          onComplete={() => data.focus.activeTaskId && completeTask.mutate(data.focus.activeTaskId)}
          onPickTask={() => {
            setPickMode('active');
            setPickOpen(true);
          }}
          onClearActive={() => clearActive.mutate()}
          onChangeDirection={() => setDirOpen(true)}
          onClearFocus={() => setDirection.mutate({ directionId: null, onConflict: 'clearTask' })}
        />

        {data.pinnedTasks.length > 0 ? (
          <div>
            <div className="sec-h">
              <span className="lbl">Закреплённое</span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setPickMode('pin');
                  setPickOpen(true);
                }}
              >
                <IconPlus />
                Закрепить
              </Button>
            </div>
            <div className="pin-grid">
              {data.pinnedTasks.map((t) => (
                <ProjectTaskCard
                  key={t.id}
                  projectTitle={t.projectTitle}
                  taskTitle={t.title}
                  directionName={t.directionName}
                  directionColor={t.directionColor}
                  meta={
                    t.deadline
                      ? `до ${formatLongDate(t.deadline)}`
                      : t.estimatedDuration
                        ? DURATION_LABEL[t.estimatedDuration]
                        : null
                  }
                  onOpen={() => navigate(`/tasks/${t.id}`)}
                  onComplete={() => completeTask.mutate(t.id)}
                  onUnpin={() => togglePin.mutate({ taskId: t.id, pinned: true })}
                />
              ))}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '2px 4px' }}>
            <span className="quiet">Закреплённых задач пока нет.</span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setPickMode('pin');
                setPickOpen(true);
              }}
            >
              Закрепить задачу
            </Button>
          </div>
        )}

        <div className="card">
          <div className="card-h">
            <div>
              <div className="lbl">Касания по всем направлениям</div>
              <div className="hint" style={{ marginTop: 3 }}>
                Нажми на день, чтобы увидеть, что было.
              </div>
            </div>
            <Button size="sm" onClick={() => setTouchOpen(true)}>
              <IconPlus />
              Записать касание
            </Button>
          </div>
          <Heatmap days={data.heatmap.days} today={data.today} onDayClick={setDay} />
          <div className="legend">
            {(directions.data ?? []).map((d) => (
              <b key={d.id}>
                <i className="dot" style={{ background: `var(${d.color})` }} />
                {d.name}
              </b>
            ))}
          </div>
          <div
            style={{
              marginTop: 14,
              paddingTop: 12,
              borderTop: '1px solid var(--line)',
              display: 'flex',
              justifyContent: 'space-between',
              gap: 12,
              flexWrap: 'wrap',
            }}
          >
            <span className="quiet">
              За эту неделю: {weekTotal} {plural(weekTotal, 'касание', 'касания', 'касаний')}.
            </span>
            <Link className="quiet-link" to="/activity">
              Посмотреть историю
            </Link>
          </div>
        </div>

        {data.pinnedMedia.length > 0 ? (
          <div>
            <div className="sec-h">
              <span className="lbl">Читаю и смотрю</span>
              <Link className="quiet-link" to="/media">
                Вся полка
              </Link>
            </div>
            <div className="strip">
              {data.pinnedMedia.map((m) => (
                <Link key={m.id} className="chipcard" to={`/media/${m.id}`}>
                  <span className="em" style={{ fontSize: 19 }}>
                    {m.coverEmoji ?? '📘'}
                  </span>
                  <span>
                    <span
                      style={{ fontFamily: 'Literata, serif', fontSize: 13.5, display: 'block' }}
                    >
                      {m.title}
                    </span>
                    <span className="quiet">{m.authorOrDirector ?? m.categoryName ?? ''}</span>
                  </span>
                </Link>
              ))}
            </div>
          </div>
        ) : null}

        <div
          className="card"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <div style={{ fontFamily: 'Literata, serif', fontSize: 16 }}>
              Хочется чего-нибудь совсем другого?
            </div>
            <div className="hint" style={{ marginTop: 4 }}>
              Загляни в меню возможностей.
            </div>
          </div>
          <Button onClick={() => navigate('/menu')}>Открыть меню</Button>
        </div>
      </div>

      <PickTaskModal
        open={pickOpen}
        onOpenChange={setPickOpen}
        mode={pickMode}
        excludeTaskId={pickMode === 'active' ? data.focus.activeTaskId : null}
        onPick={(taskId) =>
          pickMode === 'active'
            ? setActive.mutate(taskId)
            : togglePin.mutate({ taskId, pinned: false })
        }
      />

      <Modal
        open={dirOpen}
        onOpenChange={setDirOpen}
        title="Направление в фокусе"
        description="Область, которой сейчас хочется уделять больше внимания."
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setDirection.mutate({ directionId: null, onConflict: 'clearTask' })}
            >
              Очистить фокус
            </Button>
            <Button variant="ghost" onClick={() => setDirOpen(false)}>
              Закрыть
            </Button>
          </>
        }
      >
        <div className="field">
          <div className="chips">
            {(directions.data ?? []).map((d) => (
              <button
                key={d.id}
                type="button"
                className="chip"
                data-on={data.focus.focusDirectionId === d.id}
                onClick={() => setDirection.mutate({ directionId: d.id, onConflict: 'ask' })}
              >
                <i className="dot" style={{ background: `var(${d.color})` }} />
                {d.name}
              </button>
            ))}
          </div>
        </div>
      </Modal>

      {conflictModal}

      <DayTouchesModal date={day} onClose={() => setDay(null)} />
      <TouchModal open={touchOpen} onOpenChange={setTouchOpen} today={data.today} />
      <ReminderModal open={remindOpen} onOpenChange={setRemindOpen} today={data.today} />

      <Modal
        open={thoughtOpen}
        onOpenChange={setThoughtOpen}
        title="Записать мысль"
        description="Попадёт во «Входящие». Это ещё не задача."
        footer={
          <>
            <Button variant="ghost" onClick={() => setThoughtOpen(false)}>
              Отмена
            </Button>
            <Button
              variant="primary"
              disabled={thought.trim().length === 0 || addThought.isPending}
              onClick={() => addThought.mutate()}
            >
              Сохранить
            </Button>
          </>
        }
      >
        <div className="field">
          <textarea rows={3} value={thought} onChange={(e) => setThought(e.target.value)} />
        </div>
      </Modal>

      <Modal
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        title="Архив напоминаний"
        description="Последние семь дней. Дальше приложение ничего не хранит на виду."
        footer={
          <Button variant="ghost" onClick={() => setArchiveOpen(false)}>
            Закрыть
          </Button>
        }
      >
        <div style={{ marginTop: 14 }}>
          {(archive.data ?? []).map((r) => (
            <div className="row" key={r.id}>
              <div className="row-main">
                <div className="row-title">{r.text}</div>
                <div className="row-sub">
                  {formatLongDate(r.scheduledDate)} ·{' '}
                  {r.status === 'done' ? 'выполнено' : 'удалено'}
                </div>
              </div>
            </div>
          ))}
          {archive.data?.length === 0 ? (
            <EmptyState title="За неделю ничего не закрывалось" />
          ) : null}
        </div>
      </Modal>
    </>
  );
}
