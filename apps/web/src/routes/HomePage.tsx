import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Heatmap, IconBell, IconPlus, IconThought, Modal, useToast } from '@planner/ui';
import { formatLongDate, humanDate, plural } from '@planner/shared';
import { api } from '../api/client.js';
import { invalidateFocusScope, qk, useDashboard, useDirections } from '../api/queries.js';
import { useCompleteTaskDialog } from '../features/CompleteTaskDialog.js';
import { TodayBlock } from '../features/TodayBlock.js';
import { SoftRemindersCard } from '../features/SoftRemindersCard.js';
import { FocusCard } from '../features/FocusCard.js';
import { PickTaskModal } from '../features/PickTaskModal.js';
import { PickPinnedProjectModal } from '../features/PickPinnedProjectModal.js';
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
  const { askComplete, dialog: completeDialog } = useCompleteTaskDialog();

  const [pickOpen, setPickOpen] = useState(false);
  const [dirOpen, setDirOpen] = useState(false);
  const [day, setDay] = useState<string | null>(null);
  const [touchOpen, setTouchOpen] = useState(false);
  const [remindOpen, setRemindOpen] = useState(false);
  const [thoughtOpen, setThoughtOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);

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
    onError: () => toast.show('Не удалось отметить готовым'),
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
          {/*
            Одна кнопка вместо двух: что именно записать — мысль или
            напоминание — спрашиваем следующим шагом. Так на главной остаётся
            одно понятное действие, а не развилка до того, как человек решил.
          */}
          <Button variant="primary" onClick={() => setAddOpen(true)}>
            <IconPlus />
            Добавить
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
            onCompleteTask={(id) => askComplete(id)}
            onCompleteReminder={(id) => completeReminder.mutate(id)}
          />

          <FocusCard
            focus={data.focus}
            pinnedProject={data.pinnedProject}
            onOpenPinned={() => setPinOpen(true)}
            onComplete={() =>
              data.focus.activeTaskId &&
              askComplete(data.focus.activeTaskId, data.focus.activeTask?.title)
            }
            onPickTask={() => setPickOpen(true)}
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
              Нажмите на день, чтобы увидеть, что было.
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

          {/*
            Полка на главной: под касаниями, а не сбоку. Показываем и пустой —
            иначе блок исчезает целиком, и непонятно, куда делось «сейчас читаю».
          */}
          <div className="card">
            <h4>
              Читаю и смотрю
              <Link className="more" to="/media">
                Вся полка
              </Link>
            </h4>
            {data.pinnedMedia.length > 0 ? (
              data.pinnedMedia.map((m) => (
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
              ))
            ) : (
              <p className="hint">
                Ничего не закреплено. Откройте полку и закрепите то, что читаете или смотрите
                сейчас.
              </p>
            )}
          </div>
        </div>

        <aside className="right-col">
          <SoftRemindersCard
            reminders={data.todayReminders}
            onComplete={(id) => completeReminder.mutate(id)}
          />

          <div className="card menu-invite">
            <div>
              <div className="menu-invite-title">Хочется чего-нибудь совсем другого?</div>
              <p className="hint">Загляните в меню возможностей.</p>
            </div>
            <Button onClick={() => navigate('/menu')}>Открыть меню</Button>
          </div>
        </aside>
      </div>

      <PickTaskModal
        open={pickOpen}
        onOpenChange={setPickOpen}
        excludeTaskId={data.focus.activeTaskId}
        onPick={(taskId) => setActive.mutate(taskId)}
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

      {data.focus.direction ? (
        <PickPinnedProjectModal
          open={pinOpen}
          onOpenChange={setPinOpen}
          directionId={data.focus.direction.id}
          directionName={data.focus.direction.name}
          pinnedProjectId={data.pinnedProject?.id ?? null}
        />
      ) : null}

      {conflictModal}

      <DayTouchesModal date={day} onClose={() => setDay(null)} />
      <TouchModal open={touchOpen} onOpenChange={setTouchOpen} today={data.today} />
      <ReminderModal open={remindOpen} onOpenChange={setRemindOpen} today={data.today} />
      <QuickThoughtModal open={thoughtOpen} onOpenChange={setThoughtOpen} />

      {addOpen ? (
        <div
          className="sheet-backdrop"
          role="presentation"
          onClick={() => setAddOpen(false)}
          onKeyDown={(e) => e.key === 'Escape' && setAddOpen(false)}
        >
          <div
            className="plus-sheet"
            role="dialog"
            aria-label="Что добавить"
            onClick={(e) => e.stopPropagation()}
          >
            <h5>Что записать</h5>
            <button
              type="button"
              className="opt"
              onClick={() => {
                setAddOpen(false);
                setThoughtOpen(true);
              }}
            >
              <span className="ic-wrap">
                <IconThought />
              </span>
              <span className="info">
                <span className="ttl">Мысль</span>
                <span className="sub">Попадёт во входящие, разберём потом</span>
              </span>
            </button>
            <button
              type="button"
              className="opt"
              onClick={() => {
                setAddOpen(false);
                setRemindOpen(true);
              }}
            >
              <span className="ic-wrap">
                <IconBell />
              </span>
              <span className="info">
                <span className="ttl">Напоминание</span>
                <span className="sub">Внешняя память: придёт в нужный момент</span>
              </span>
            </button>
            <button
              type="button"
              className="btn ghost sheet-cancel"
              onClick={() => setAddOpen(false)}
            >
              Отмена
            </button>
          </div>
        </div>
      ) : null}

      {completeDialog}
    </div>
  );
}
