import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Heatmap, IconBell, IconPlus, Modal, useToast } from '@planner/ui';
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
import { QuickThoughtModal } from '../features/QuickThoughtModal.js';
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

  if (dashboard.isLoading) return <Loading what="Собираю главную" />;
  if (dashboard.isError)
    return <ErrorBox error={dashboard.error} onRetry={() => void dashboard.refetch()} />;
  const data = dashboard.data;
  if (!data) return null;

  const weekTotal = data.heatmap.weekTotal;

  return (
    <div className="home-content">
      <div className="home-greeting">
        <div>
          <div className="date mono">
            {humanDate(data.today, data.today)}, {formatLongDate(data.today)}
          </div>
          <h1>Привет</h1>
        </div>
        <div className="home-quick">
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

      <div className="two-col">
        <div className="home-main">
          <TodayBlock
            events={data.events}
            tasks={data.dueTasks}
            overdue={data.overdueTasks}
            reminders={data.todayReminders}
            onCompleteTask={(id) => completeTask.mutate(id)}
            onCompleteReminder={(id) => completeReminder.mutate(id)}
          />

          <FocusCard
            focus={data.focus}
            onComplete={() =>
              data.focus.activeTaskId && completeTask.mutate(data.focus.activeTaskId)
            }
            onPickTask={() => {
              setPickMode('active');
              setPickOpen(true);
            }}
            onClearActive={() => clearActive.mutate()}
            onChangeDirection={() => setDirOpen(true)}
            onClearFocus={() => setDirection.mutate({ directionId: null, onConflict: 'clearTask' })}
          />

          <div className="card">
            <h4>
              Касания по всем направлениям
              <Button size="sm" onClick={() => setTouchOpen(true)}>
                <IconPlus />
                Записать касание
              </Button>
            </h4>
            <p className="hint" style={{ marginBottom: 10 }}>
              Нажми на день, чтобы увидеть, что было.
            </p>
            <div className="scroll-x">
              <Heatmap days={data.heatmap.days} today={data.today} onDayClick={setDay} />
            </div>
            <div className="heat-legend">
              {(directions.data ?? []).map((d) => (
                <span key={d.id}>
                  <i className="dir-dot" style={{ ['--c' as string]: `var(${d.color})` }} />
                  {d.name}
                </span>
              ))}
            </div>
            <div className="card-foot">
              <span className="hint">
                За эту неделю: {weekTotal} {plural(weekTotal, 'касание', 'касания', 'касаний')}.
              </span>
              <Link to="/touches">Посмотреть историю</Link>
            </div>
          </div>
        </div>

        <aside className="right-col">
          <div className="card">
            <h4>
              Закреплённое
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
            </h4>
            {data.pinnedTasks.length === 0 ? (
              <p className="hint">Закреплённых задач пока нет.</p>
            ) : (
              data.pinnedTasks.map((t) => (
                <div className="pinned-row" key={t.id}>
                  <button
                    type="button"
                    className="check"
                    aria-label={`Выполнить: ${t.title}`}
                    onClick={() => completeTask.mutate(t.id)}
                  />
                  <Link className="info" to={`/tasks/${t.id}`}>
                    <span className="proj">{t.projectTitle}</span>
                    <span className="ttl">{t.title}</span>
                    <span className="meta">
                      <i
                        className="dir-dot"
                        style={{ ['--c' as string]: `var(${t.directionColor})` }}
                      />
                      {t.directionName}
                      {t.deadline
                        ? ` · до ${formatLongDate(t.deadline)}`
                        : t.estimatedDuration
                          ? ` · ${DURATION_LABEL[t.estimatedDuration]}`
                          : ''}
                    </span>
                  </Link>
                  <button
                    type="button"
                    className="pin-off"
                    aria-label={`Открепить: ${t.title}`}
                    title="Открепить"
                    onClick={() => togglePin.mutate({ taskId: t.id, pinned: true })}
                  >
                    ×
                  </button>
                </div>
              ))
            )}
          </div>

          {data.pinnedMedia.length > 0 ? (
            <div className="card">
              <h4>
                Читаю и смотрю
                <Link className="more" to="/media">
                  Вся полка
                </Link>
              </h4>
              {data.pinnedMedia.map((m) => (
                <Link key={m.id} className="media-row" to={`/media/${m.id}`}>
                  <span
                    className="cover"
                    // у медиа нет направления: обложка красится по типу записи
                    style={{
                      ['--c' as string]: `var(${m.kind === 'book' ? '--d-eng' : '--d-vocal'})`,
                    }}
                    aria-hidden="true"
                  >
                    {m.title.charAt(0)}
                  </span>
                  <span className="info">
                    <span className="ttl">{m.title}</span>
                    <span className="sub">{m.authorOrDirector ?? m.categoryName ?? ''}</span>
                  </span>
                </Link>
              ))}
            </div>
          ) : null}

          <div className="card menu-invite">
            <div>
              <div className="menu-invite-title">Хочется чего-нибудь совсем другого?</div>
              <p className="hint">Загляни в меню возможностей.</p>
            </div>
            <Button onClick={() => navigate('/menu')}>Открыть меню</Button>
          </div>
        </aside>
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
                className={`chip${data.focus.focusDirectionId === d.id ? ' is-active' : ''}`}
                onClick={() => setDirection.mutate({ directionId: d.id, onConflict: 'ask' })}
              >
                <i className="dir-dot" style={{ ['--c' as string]: `var(${d.color})` }} />
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
      <QuickThoughtModal open={thoughtOpen} onOpenChange={setThoughtOpen} />
    </div>
  );
}
