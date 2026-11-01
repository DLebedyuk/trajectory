import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  IconArchive,
  IconBell,
  IconPlus,
  Modal,
  OverflowMenu,
  PageHeader,
  useToast,
} from '@planner/ui';
import {
  addDaysToDateOnly,
  formatLongDate,
  timeInTimezone,
  todayInTimezone,
} from '@planner/shared';
import type { CreateReminderInput, Reminder, TimeSlot } from '@planner/contracts';
import { api } from '../api/client.js';
import {
  qk,
  useDashboard,
  useDirections,
  useReminders,
  useRemindersArchive,
  useSettings,
} from '../api/queries.js';
import { ReminderModal } from '../features/ReminderModal.js';
import { useDragSort } from '../features/useDragSort.js';
import { CheckRow } from '../components/CheckRow.js';
import { ErrorBox, Loading } from '../components/Loading.js';

const SLOT_BADGE: Record<string, string> = {
  morning: 'утром',
  day: 'днём',
  evening: 'вечером',
};

const SLOT_ORDER: TimeSlot[] = ['morning', 'day', 'evening'];
const SLOTS: { value: TimeSlot; label: string }[] = [
  { value: 'morning', label: 'Утро' },
  { value: 'day', label: 'День' },
  { value: 'evening', label: 'Вечер' },
];

interface SlotOption {
  date: string;
  slot: TimeSlot;
  label: string;
}

/**
 * Ближайшие несколько слотов от текущего момента — то же самое, что сервис
 * сам подбирает для «напомни мне» без времени, только видно наперёд и можно
 * выбрать любой из них. Сегодняшние уже прошедшие слоты не предлагаем —
 * «сегодня утром» после обеда никому не нужно.
 */
function nextSlotOptions(
  now: Date,
  timezone: string,
  times: { morningTime: string; dayTime: string; eveningTime: string },
  count = 4,
): SlotOption[] {
  const slotTime: Record<TimeSlot, string> = {
    morning: times.morningTime,
    day: times.dayTime,
    evening: times.eveningTime,
  };
  const today = todayInTimezone(timezone, now);
  const nowTime = timeInTimezone(timezone, now);
  const options: SlotOption[] = [];
  let dayOffset = 0;
  while (options.length < count) {
    const date = dayOffset === 0 ? today : addDaysToDateOnly(today, dayOffset);
    const dayLabel =
      dayOffset === 0 ? 'сегодня' : dayOffset === 1 ? 'завтра' : formatLongDate(date);
    for (const slot of SLOT_ORDER) {
      if (dayOffset === 0 && slotTime[slot] <= nowTime) continue;
      options.push({ date, slot, label: `${dayLabel} ${SLOT_BADGE[slot]}` });
      if (options.length === count) break;
    }
    dayOffset += 1;
  }
  return options;
}

const byManualOrder = (a: Reminder, b: Reminder) =>
  a.sortOrder - b.sortOrder || a.scheduledDate.localeCompare(b.scheduledDate);

/**
 * Напоминания и ежедневный список — одно и то же. Мелкое дело записывается
 * одной строкой и стоит в своём дне; уведомление к нему включается отдельно
 * и только если нужно. Невыполненное не исчезает в полночь: всё, чей день
 * наступил или прошёл, остаётся в «Сегодня» с исходной датой.
 */
export function RemindersPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const reminders = useReminders();
  const archive = useRemindersArchive();
  const dashboard = useDashboard();
  const directions = useDirections();
  const settings = useSettings();
  const [editing, setEditing] = useState<Reminder | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [toTask, setToTask] = useState<Reminder | null>(null);
  const [projectId, setProjectId] = useState('');
  const [projects, setProjects] = useState<{ id: string; title: string; directionName: string }[]>(
    [],
  );
  const [snoozeTarget, setSnoozeTarget] = useState<Reminder | null>(null);
  const [snoozeChoice, setSnoozeChoice] = useState('');
  // id завершающихся напоминаний — набор, а не одно значение: mutation.variables
  // хранит только последний вызов mutate(), и при быстром клике A → B кнопка A
  // разблокировалась бы, пока её запрос ещё летит
  const [completingIds, setCompletingIds] = useState<Set<string>>(new Set());

  // быстрое добавление: строка текста, остальное — только если раскрыть
  const [draft, setDraft] = useState('');
  const [more, setMore] = useState(false);
  const [draftDate, setDraftDate] = useState('');
  const [draftNotify, setDraftNotify] = useState(false);
  const [draftTime, setDraftTime] = useState('');
  const [draftSlot, setDraftSlot] = useState<TimeSlot | ''>('');
  const inputRef = useRef<HTMLInputElement>(null);

  // правка текста прямо в строке
  const [inlineId, setInlineId] = useState<string | null>(null);
  const [inlineText, setInlineText] = useState('');

  const today = dashboard.data?.today ?? todayInTimezone('UTC');
  const timezone = settings.data?.timezone ?? 'UTC';
  const tomorrow = addDaysToDateOnly(today, 1);

  /*
    Смена даты, пока страница открыта: «сегодня» считает сервер (часовой пояс
    человека), поэтому раз в минуту сверяемся и, если день сменился,
    перезапрашиваем. Ничего не переносится и не удаляется — просто вчерашнее
    становится просроченным.
  */
  useEffect(() => {
    if (!settings.data) return;
    const id = window.setInterval(() => {
      if (todayInTimezone(timezone) !== today) {
        void qc.invalidateQueries({ queryKey: qk.dashboard });
        void qc.invalidateQueries({ queryKey: qk.reminders });
      }
    }, 60_000);
    return () => window.clearInterval(id);
  }, [qc, settings.data, timezone, today]);

  // только настоящие настройки человека — пока они не загрузились, список пуст,
  // а не подставленные дефолты: ничего похожего на угаданное время не показываем
  const snoozeOptions =
    snoozeTarget && settings.data
      ? nextSlotOptions(new Date(), settings.data.timezone, {
          morningTime: settings.data.morningTime,
          dayTime: settings.data.dayTime,
          eveningTime: settings.data.eveningTime,
        })
      : [];

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: qk.reminders });
    void qc.invalidateQueries({ queryKey: qk.dashboard });
    void qc.invalidateQueries({ queryKey: qk.remindersArchive });
  };

  /*
    Поле очищается сразу, а не по ответу сервера: пункты записывают пачкой,
    один за другим, и второй Enter, пока первый ещё летит, раньше терялся.
    Каждый запрос несёт свой текст в переменных мутации.
  */
  const add = useMutation({
    mutationFn: (input: CreateReminderInput) => api.reminders.create(input),
    onSuccess: (saved) => {
      refresh();
      // обычная запись на сегодня — без сообщений: строка и так появилась в списке
      if (saved.notify) {
        toast.show(
          saved.scheduledTime
            ? `Напомню ${formatLongDate(saved.scheduledDate)} в ${saved.scheduledTime}`
            : `Напомню ${formatLongDate(saved.scheduledDate)} ${saved.timeSlot ? SLOT_BADGE[saved.timeSlot] : ''}`.trim(),
        );
      } else if (saved.scheduledDate !== today) {
        toast.show(`Записано на ${formatLongDate(saved.scheduledDate)}`);
      }
    },
    onError: (_e, input) => {
      toast.show('Не удалось записать');
      // текст не пропадает: возвращаем в поле, если оно не занято новым
      setDraft((current) => current || input.text);
    },
  });

  const complete = useMutation({
    mutationFn: (id: string) => api.reminders.complete(id),
    onMutate: (id) => {
      setCompletingIds((prev) => new Set(prev).add(id));
    },
    onSettled: (_data, _error, id) => {
      setCompletingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    },
    onSuccess: (saved) => {
      refresh();
      // повторяющееся напоминание сервер не архивирует, а переносит на
      // следующую дату — сообщение должно говорить о том, что реально случилось
      if (saved.repeatRule) {
        toast.show(`Отметил. Следующее — ${formatLongDate(saved.scheduledDate)}.`);
      } else if (saved.notify) {
        toast.show('Готово. Напоминание ушло в архив.');
      }
    },
    onError: () => toast.show('Не удалось отметить готовым'),
  });
  const reopen = useMutation({
    mutationFn: (id: string) => api.reminders.reopen(id),
    onSuccess: refresh,
    onError: () => toast.show('Не удалось вернуть'),
  });
  const snoozeEvening = useMutation({
    mutationFn: (id: string) => api.reminders.snooze(id, { mode: 'evening' }),
    onSuccess: () => {
      refresh();
      toast.show('Напомню вечером');
    },
    onError: () => toast.show('Не удалось перенести напоминание'),
  });
  const moveTo = useMutation({
    mutationFn: (vars: { id: string; date: string; slot: TimeSlot }) =>
      // scheduledTime нужно снять явно: иначе у напоминания с точным временем
      // (alert) выбранный слот молча отбрасывается — deliveryMode не меняется
      api.reminders.update(vars.id, {
        scheduledDate: vars.date,
        scheduledTime: null,
        timeSlot: vars.slot,
      }),
    onSuccess: () => {
      refresh();
      toast.show('Перенесено');
      setSnoozeTarget(null);
      setSnoozeChoice('');
    },
    onError: () => toast.show('Не удалось перенести напоминание'),
  });
  const toTomorrow = useMutation({
    mutationFn: (id: string) => api.reminders.update(id, { scheduledDate: tomorrow }),
    onSuccess: () => {
      refresh();
      toast.show('Перенесено на завтра');
    },
    onError: () => toast.show('Не удалось перенести'),
  });
  const rename = useMutation({
    mutationFn: (vars: { id: string; text: string }) =>
      api.reminders.update(vars.id, { text: vars.text }),
    onSuccess: refresh,
    onError: () => toast.show('Не удалось сохранить'),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.reminders.remove(id),
    onSuccess: () => {
      refresh();
      toast.show('Удалено');
    },
    onError: () => toast.show('Не удалось удалить напоминание'),
  });
  // порядок — сразу на экране; при ошибке список перезапрашивается заново
  const reorder = useMutation({
    mutationFn: (ids: string[]) => api.reminders.reorder(ids),
    onMutate: (ids) => {
      const rank = new Map(ids.map((id, i) => [id, i]));
      qc.setQueryData<Reminder[]>(qk.reminders, (prev) =>
        prev?.map((r) => (rank.has(r.id) ? { ...r, sortOrder: rank.get(r.id)! } : r)),
      );
    },
    onError: () => {
      toast.show('Не удалось сохранить порядок');
      void qc.invalidateQueries({ queryKey: qk.reminders });
    },
  });
  const convert = useMutation({
    mutationFn: () => api.reminders.toTask(toTask?.id as string, { projectId }),
    onSuccess: () => {
      refresh();
      void qc.invalidateQueries({ queryKey: ['tasks'] });
      toast.show('Стало задачей проекта');
      setToTask(null);
      setProjectId('');
    },
    onError: () => toast.show('Не удалось превратить в задачу'),
  });

  const openConvert = async (r: Reminder) => {
    setToTask(r);
    const dirs = directions.data ?? [];
    const all = await Promise.all(
      dirs.map(async (d) =>
        (await api.projects.listByDirection(d.id))
          .filter((p) => p.status !== 'archived')
          .map((p) => ({ id: p.id, title: p.title, directionName: d.name })),
      ),
    );
    setProjects(all.flat());
  };

  /*
    Три раздела не пересекаются и вместе покрывают весь список.

    Раньше регулярное напоминание, у которого наступил срок, попадало сразу
    в «Сегодня» и в «Регулярные»: одна и та же карточка на экране дважды, и
    непонятно, в какой из них нажимать «Готово». Наступивший срок важнее
    регулярности — такое напоминание живёт только в «Сегодня», а метка
    «каждую неделю» на карточке никуда не девается.
  */
  const active = reminders.data ?? [];
  const todayList = active.filter((r) => r.scheduledDate <= today).sort(byManualOrder);
  const later = active.filter((r) => r.scheduledDate > today);
  const soon = later.filter((r) => !r.repeatRule);
  const repeating = later.filter((r) => r.repeatRule);
  // сделанное сегодня — из архива: день закрытия в часовом поясе человека
  const doneToday = (archive.data ?? []).filter(
    (r) =>
      r.status === 'done' &&
      r.closedAt !== null &&
      todayInTimezone(timezone, new Date(r.closedAt)) === today,
  );

  const sort = useDragSort(
    todayList.map((r) => r.id),
    (ids) => reorder.mutate(ids),
  );

  if (reminders.isLoading) return <Loading what="Загружаю напоминания" />;
  if (reminders.isError)
    return <ErrorBox error={reminders.error} onRetry={() => void reminders.refetch()} />;

  const commitInline = () => {
    const id = inlineId;
    const text = inlineText.trim();
    setInlineId(null);
    const current = active.find((r) => r.id === id);
    if (id && text && current && text !== current.text) rename.mutate({ id, text });
  };

  const whenBadge = (r: Reminder) =>
    r.deliveryMode === 'alert' && r.scheduledTime
      ? r.scheduledTime
      : `в сводке ${r.timeSlot ? SLOT_BADGE[r.timeSlot] : ''}`.trim();

  /**
   * Строка списка. Чекбокс слева — это и есть «Готово», отдельной кнопки под
   * него не заводим. Все остальные действия живут в «···»; текст правится
   * двойным щелчком прямо в строке.
   */
  const card = (r: Reminder, opts: { sortable?: boolean; showDate?: boolean } = {}) => {
    const overdue = r.scheduledDate < today;
    const hasMeta =
      opts.showDate || overdue || r.notify || Boolean(r.repeatRule) || Boolean(r.comment);
    return (
      <div
        // источник (telegram/app) по-прежнему хранится в базе, но в интерфейсе
        // не показывается: человеку важно само напоминание, а не откуда оно пришло
        className={`rem-card${r.repeatRule ? ' is-regular' : ''}${r.notify ? '' : ' is-plain'}${
          sort.draggingId === r.id ? ' is-dragging' : ''
        }`}
        key={r.id}
        ref={opts.sortable ? sort.itemRef(r.id) : undefined}
        style={opts.sortable ? sort.itemStyle(r.id) : undefined}
      >
        <div className="top">
          {opts.sortable && todayList.length > 1 ? (
            <button
              type="button"
              className="rem-handle"
              aria-label={`Перетащить: ${r.text}`}
              {...sort.handleProps(r.id)}
            >
              ⋮⋮
            </button>
          ) : null}
          <button
            type="button"
            className="check"
            aria-label={`Выполнить: ${r.text}`}
            // блокируем именно эту кнопку на время запроса — иначе двойной клик
            // (в том числе A → B → A, пока A ещё летит) на повторяющемся
            // напоминании переносит его сразу на два периода
            disabled={completingIds.has(r.id)}
            onClick={() => complete.mutate(r.id)}
          />
          {inlineId === r.id ? (
            <input
              className="rt rem-inline"
              aria-label="Текст"
              autoFocus
              value={inlineText}
              onChange={(e) => setInlineText(e.target.value)}
              onBlur={commitInline}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitInline();
                if (e.key === 'Escape') setInlineId(null);
              }}
            />
          ) : (
            <span
              className="rt"
              onDoubleClick={() => {
                setInlineId(r.id);
                setInlineText(r.text);
              }}
            >
              {r.text}
            </span>
          )}
          <OverflowMenu
            label={`Ещё действия: ${r.text}`}
            items={[
              {
                label: 'Изменить текст',
                onSelect: () => {
                  setInlineId(r.id);
                  setInlineText(r.text);
                },
              },
              {
                label: r.notify ? 'Дата и время' : 'Дата и напоминание',
                onSelect: () => {
                  setEditing(r);
                  setModalOpen(true);
                },
              },
              ...(r.scheduledDate <= today
                ? [{ label: 'На завтра', onSelect: () => toTomorrow.mutate(r.id) }]
                : []),
              ...(r.notify
                ? [
                    {
                      label: 'Отложить',
                      onSelect: () => {
                        setSnoozeTarget(r);
                        setSnoozeChoice('');
                      },
                    },
                    { label: 'Вечером', onSelect: () => snoozeEvening.mutate(r.id) },
                  ]
                : []),
              { label: 'Превратить в задачу', onSelect: () => void openConvert(r) },
              { label: 'Удалить', danger: true, onSelect: () => remove.mutate(r.id) },
            ]}
          />
        </div>

        {hasMeta ? (
          <div className="meta">
            {opts.showDate || overdue ? (
              <span className={`when mono${overdue ? ' is-overdue' : ''}`}>
                {overdue ? 'с ' : ''}
                {formatLongDate(r.scheduledDate)}
              </span>
            ) : null}
            {r.notify ? (
              <span className="badge">
                <IconBell />
                {whenBadge(r)}
              </span>
            ) : null}
            {r.repeatRule ? (
              <span className="badge">
                {r.repeatRule === 'daily'
                  ? 'каждый день'
                  : r.repeatRule === 'weekly'
                    ? 'каждую неделю'
                    : 'каждый месяц'}
              </span>
            ) : null}
          </div>
        ) : null}

        {r.comment ? <p className="hint rem-comment">{r.comment}</p> : null}
      </div>
    );
  };

  const section = (title: string, list: Reminder[], empty: string) => (
    <section className="rem-section">
      <div className="section-title">
        {title}
        {list.length > 0 ? <span className="ct">{list.length}</span> : null}
      </div>
      {list.length > 0 ? (
        list.map((r) => card(r, { showDate: true }))
      ) : (
        <p className="hint">{empty}</p>
      )}
    </section>
  );

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    const notify = more && draftNotify;
    add.mutate({
      text,
      scheduledDate: (more && draftDate) || today,
      notify,
      scheduledTime: notify ? draftTime || null : null,
      timeSlot: notify && !draftTime ? draftSlot || null : null,
      source: 'web',
    });
    setDraft('');
    setMore(false);
    setDraftDate('');
    setDraftNotify(false);
    setDraftTime('');
    setDraftSlot('');
    inputRef.current?.focus();
  };

  return (
    <>
      <PageHeader
        title="Напоминания"
        subtitle="Мелкие дела на день — записать и выкинуть из головы. Напомнить можно, но не обязательно."
        actions={
          <>
            <Button size="sm" onClick={() => navigate('/reminders/archive')}>
              <IconArchive />
              Архив
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setEditing(null);
                setModalOpen(true);
              }}
            >
              <IconBell />
              Напомнить
            </Button>
          </>
        }
      />

      <form className="rem-quick" onSubmit={submit}>
        <div className="rem-quick-row">
          <input
            ref={inputRef}
            type="text"
            value={draft}
            maxLength={500}
            placeholder="Что не забыть сделать?"
            aria-label="Новое дело"
            enterKeyHint="done"
            onChange={(e) => setDraft(e.target.value)}
          />
          <button
            type="button"
            className="rem-quick-more"
            aria-expanded={more}
            aria-label="Дата и напоминание"
            title="Дата и напоминание"
            data-on={more || undefined}
            onClick={() => setMore((v) => !v)}
          >
            <IconBell />
          </button>
          <Button type="submit" variant="primary" aria-label="Добавить" disabled={!draft.trim()}>
            <IconPlus />
          </Button>
        </div>
        {more ? (
          <div className="rem-quick-extra">
            <div className="seg" role="group" aria-label="День">
              <button
                type="button"
                data-on={!draftDate || draftDate === today}
                onClick={() => setDraftDate('')}
              >
                Сегодня
              </button>
              <button
                type="button"
                data-on={draftDate === tomorrow}
                onClick={() => setDraftDate(tomorrow)}
              >
                Завтра
              </button>
            </div>
            <input
              type="date"
              aria-label="Другой день"
              value={draftDate || today}
              onChange={(e) => setDraftDate(e.target.value)}
            />
            <CheckRow
              checked={draftNotify}
              onChange={() => setDraftNotify((v) => !v)}
              label="Напомнить"
            />
            {draftNotify ? (
              <>
                <input
                  type="time"
                  aria-label="Точное время"
                  value={draftTime}
                  onChange={(e) => {
                    setDraftTime(e.target.value);
                    if (e.target.value) setDraftSlot('');
                  }}
                />
                <div className="seg" role="group" aria-label="Или в сводке">
                  {SLOTS.map((s) => (
                    <button
                      key={s.value}
                      type="button"
                      data-on={draftSlot === s.value}
                      onClick={() => {
                        setDraftSlot(draftSlot === s.value ? '' : s.value);
                        setDraftTime('');
                      }}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </>
            ) : null}
          </div>
        ) : null}
      </form>

      <div>
        <section className="rem-section">
          <div className="section-title">
            Сегодня
            {todayList.length > 0 ? <span className="ct">{todayList.length}</span> : null}
          </div>
          {todayList.length > 0 ? (
            todayList.map((r) => card(r, { sortable: true }))
          ) : (
            <p className="hint">
              {doneToday.length > 0 ? 'Всё на сегодня сделано.' : 'Сегодня ничего не ждёт.'}
            </p>
          )}
          {doneToday.length > 0 ? (
            <div className="rem-done" aria-label="Сделано сегодня">
              {doneToday.map((r) => (
                <div className="rem-done-row" key={r.id}>
                  <button
                    type="button"
                    className="check done"
                    aria-label={`Вернуть: ${r.text}`}
                    onClick={() => reopen.mutate(r.id)}
                  />
                  <span className="rt">{r.text}</span>
                </div>
              ))}
            </div>
          ) : null}
        </section>
        {section('Ближайшие', soon, 'Впереди пусто.')}
        {/* «нет» было бы неправдой: регулярное со сроком на сегодня стоит
            выше, в «Сегодня» */}
        {section('Регулярные', repeating, 'Впереди регулярных нет.')}
      </div>

      <ReminderModal open={modalOpen} onOpenChange={setModalOpen} today={today} editing={editing} />

      <Modal
        open={Boolean(toTask)}
        onOpenChange={(v) => !v && setToTask(null)}
        title="Превратить в задачу"
        description={
          toTask
            ? `«${toTask.text}» станет задачей проекта. Проект не выбирается автоматически.`
            : undefined
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setToTask(null)}>
              Отмена
            </Button>
            <Button variant="primary" disabled={!projectId} onClick={() => convert.mutate()}>
              Создать задачу
            </Button>
          </>
        }
      >
        <div className="field">
          <span className="lbl">Проект — определяет направление</span>
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">— выбери проект —</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.directionName} · {p.title}
              </option>
            ))}
          </select>
        </div>
      </Modal>

      <Modal
        open={Boolean(snoozeTarget)}
        onOpenChange={(v) => !v && setSnoozeTarget(null)}
        title="Отложить"
        description={snoozeTarget ? `«${snoozeTarget.text}»` : undefined}
        footer={
          <>
            <Button variant="ghost" onClick={() => setSnoozeTarget(null)}>
              Отмена
            </Button>
            <Button
              variant="primary"
              disabled={!snoozeChoice}
              onClick={() => {
                const chosen = snoozeOptions.find((o) => `${o.date}|${o.slot}` === snoozeChoice);
                if (chosen && snoozeTarget) {
                  moveTo.mutate({ id: snoozeTarget.id, date: chosen.date, slot: chosen.slot });
                }
              }}
            >
              Перенести
            </Button>
          </>
        }
      >
        <div className="field">
          <span className="lbl">Новое время</span>
          {settings.isLoading ? (
            <p className="hint">Загружаю настройки времени…</p>
          ) : (
            <select value={snoozeChoice} onChange={(e) => setSnoozeChoice(e.target.value)}>
              <option value="">— выбери —</option>
              {snoozeOptions.map((o) => (
                <option key={`${o.date}|${o.slot}`} value={`${o.date}|${o.slot}`}>
                  {o.label}
                </option>
              ))}
            </select>
          )}
        </div>
      </Modal>
    </>
  );
}
