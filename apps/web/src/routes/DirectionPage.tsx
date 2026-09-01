import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  FormField,
  Heatmap,
  IconPin,
  IconPinFilled,
  IconPlus,
  IconTrash,
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
  useToggleProjectPin,
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
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState('');

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

  /*
    Заметки направления устроены так же, как заметки проекта: список строк
    целиком отправляется в update. Отдельного эндпоинта нет намеренно —
    заметок мало, а порядок и удаление по индексу так остаются простыми.
  */
  const addNote = useMutation({
    mutationFn: () =>
      api.directions.update(directionId, { notes: [...(direction.data?.notes ?? []), note] }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.direction(directionId) });
      void qc.invalidateQueries({ queryKey: qk.directions });
      setNote('');
      setNoteOpen(false);
    },
  });
  const removeNote = useMutation({
    mutationFn: (index: number) =>
      api.directions.update(directionId, {
        notes: (direction.data?.notes ?? []).filter((_, i) => i !== index),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.direction(directionId) });
      void qc.invalidateQueries({ queryKey: qk.directions });
    },
  });

  // 'ask' — сервер вернёт 409, если активна задача из другого направления,
  // и пользователь сам решит, что делать. Молча снимать задачу нельзя.
  const { setDirection, conflictModal } = useFocusDirection();
  const togglePin = useToggleProjectPin();

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

  /*
    Карточка проекта — div, а не button: внутри живёт кнопка закрепления,
    а кнопка в кнопке недопустима. Клик по карточке открывает проект.
  */
  const projectCard = (p: (typeof list)[number], modifier?: 'is-paused' | 'is-completed') => (
    <div
      key={p.id}
      className={`dir-project-card${modifier ? ` ${modifier}` : ''}${p.pinned ? ' is-pinned' : ''}`}
      style={{ ['--c' as string]: dirColor }}
      onClick={() => navigate(`/projects/${p.id}`)}
    >
      <span className="top">
        <button type="button" className="nm" onClick={() => navigate(`/projects/${p.id}`)}>
          {p.title}
        </button>
        {p.status === 'active' ? (
          <button
            type="button"
            className={`pin${p.pinned ? ' is-pinned' : ''}`}
            aria-label={p.pinned ? `Открепить проект: ${p.title}` : `Закрепить проект: ${p.title}`}
            title={
              p.pinned
                ? 'Открепить'
                : 'Закрепить — в направлении закреплённым может быть только один проект'
            }
            onClick={(e) => {
              e.stopPropagation();
              togglePin.mutate(
                { projectId: p.id, pinned: p.pinned },
                {
                  onSuccess: () =>
                    toast.show(p.pinned ? 'Закрепление снято' : `Закреплён: ${p.title}`),
                },
              );
            }}
          >
            {p.pinned ? <IconPinFilled /> : <IconPin />}
          </button>
        ) : null}
        <span className="stats">
          {p.openTaskCount
            ? `${p.openTaskCount} ${plural(p.openTaskCount, 'задача', 'задачи', 'задач')}`
            : 'без открытых задач'}
          {p.pinnedCount ? ` · важных ${p.pinnedCount}` : ''}
          {p.deadline ? ` · срок ${formatLongDate(p.deadline)}` : ''}
        </span>
      </span>
      {p.desiredOutcome ? <span className="goal">{p.desiredOutcome}</span> : null}
    </div>
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
      <div className="two-col">
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

        {/* Заметки направления — тот же блок, что внутри проекта, только уровнем выше */}
        <aside className="right-col">
          <div className="card">
            <h4>
              Заметки
              <Button size="sm" variant="ghost" onClick={() => setNoteOpen(true)}>
                <IconPlus />
                Заметка
              </Button>
            </h4>
            {(d.notes ?? []).length > 0 ? (
              (d.notes ?? []).map((n, i) => (
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
              <p className="hint">
                Заметок нет. Сюда удобно складывать то, что относится ко всему направлению, а не к
                одному проекту.
              </p>
            )}
          </div>
        </aside>
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
        open={noteOpen}
        onOpenChange={setNoteOpen}
        title="Новая заметка"
        description="Заметка направления. Ни срока, ни напоминания у неё нет."
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
