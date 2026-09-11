import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  IconArchive,
  IconPlus,
  Modal,
  OverflowMenu,
  PageHeader,
  useToast,
} from '@planner/ui';
import { addDaysToDateOnly, formatLongDate, timeInTimezone, todayInTimezone } from '@planner/shared';
import type { Reminder, TimeSlot } from '@planner/contracts';
import { api } from '../api/client.js';
import { qk, useDashboard, useDirections, useReminders, useSettings } from '../api/queries.js';
import { ReminderModal } from '../features/ReminderModal.js';
import { ErrorBox, Loading } from '../components/Loading.js';

const SLOT_BADGE: Record<string, string> = {
  morning: 'утром',
  day: 'днём',
  evening: 'вечером',
};

const SLOT_ORDER: TimeSlot[] = ['morning', 'day', 'evening'];

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
    const dayLabel = dayOffset === 0 ? 'сегодня' : dayOffset === 1 ? 'завтра' : formatLongDate(date);
    for (const slot of SLOT_ORDER) {
      if (dayOffset === 0 && slotTime[slot] <= nowTime) continue;
      options.push({ date, slot, label: `${dayLabel} ${SLOT_BADGE[slot]}` });
      if (options.length === count) break;
    }
    dayOffset += 1;
  }
  return options;
}

export function RemindersPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const reminders = useReminders();
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

  const today = dashboard.data?.today ?? todayInTimezone('UTC');
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
      toast.show(
        saved.repeatRule
          ? `Отметил. Следующее — ${formatLongDate(saved.scheduledDate)}.`
          : 'Готово. Напоминание ушло в архив.',
      );
    },
    onError: () => toast.show('Не удалось отметить готовым'),
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
  const remove = useMutation({
    mutationFn: (id: string) => api.reminders.remove(id),
    onSuccess: () => {
      refresh();
      toast.show('Удалено');
    },
    onError: () => toast.show('Не удалось удалить напоминание'),
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

  if (reminders.isLoading) return <Loading what="Загружаю напоминания" />;
  if (reminders.isError)
    return <ErrorBox error={reminders.error} onRetry={() => void reminders.refetch()} />;

  /*
    Три раздела не пересекаются и вместе покрывают весь список.

    Раньше регулярное напоминание, у которого наступил срок, попадало сразу
    в «Сегодня» и в «Регулярные»: одна и та же карточка на экране дважды, и
    непонятно, в какой из них нажимать «Готово». Наступивший срок важнее
    регулярности — такое напоминание живёт только в «Сегодня», а метка
    «каждую неделю» на карточке никуда не девается.
  */
  const active = reminders.data ?? [];
  const todayList = active.filter((r) => r.scheduledDate <= today);
  const later = active.filter((r) => r.scheduledDate > today);
  const soon = later.filter((r) => !r.repeatRule);
  const repeating = later.filter((r) => r.repeatRule);

  /**
   * Карточка напоминания. Чекбокс слева — это и есть «Готово», отдельной
   * кнопки под него не заводим. Сам текст — главное на карточке, поэтому
   * без ряда кнопок под ним: все действия, включая «Отложить», живут в «···».
   */
  const card = (r: Reminder) => (
    <div
      // источник (telegram/app) по-прежнему хранится в базе, но в интерфейсе
      // не показывается: человеку важно само напоминание, а не откуда оно пришло
      className={`rem-card${r.repeatRule ? ' is-regular' : ''}`}
      key={r.id}
    >
      <div className="top">
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
        <span className="rt">{r.text}</span>
        <OverflowMenu
          label={`Ещё действия: ${r.text}`}
          items={[
            {
              label: 'Отложить',
              onSelect: () => {
                setSnoozeTarget(r);
                setSnoozeChoice('');
              },
            },
            { label: 'Вечером', onSelect: () => snoozeEvening.mutate(r.id) },
            {
              label: 'Другая дата',
              onSelect: () => {
                setEditing(r);
                setModalOpen(true);
              },
            },
            { label: 'Превратить в задачу', onSelect: () => void openConvert(r) },
            { label: 'Удалить', danger: true, onSelect: () => remove.mutate(r.id) },
          ]}
        />
      </div>

      <div className="meta">
        <span className="when mono">
          {formatLongDate(r.scheduledDate)}
          {r.scheduledTime ? `, ${r.scheduledTime}` : ''}
        </span>
        <span className="badge">
          {r.deliveryMode === 'alert'
            ? 'отдельное уведомление'
            : `в сводке ${r.timeSlot ? SLOT_BADGE[r.timeSlot] : ''}`.trim()}
        </span>
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

      {r.comment ? <p className="hint rem-comment">{r.comment}</p> : null}
    </div>
  );

  const section = (title: string, list: Reminder[], empty: string) => (
    <section className="rem-section">
      <div className="section-title">
        {title}
        {list.length > 0 ? <span className="ct">{list.length}</span> : null}
      </div>
      {list.length > 0 ? list.map(card) : <p className="hint">{empty}</p>}
    </section>
  );

  return (
    <>
      <PageHeader
        title="Напоминания"
        subtitle="Внешняя память. Не задачи и не проекты — мелочь, которую не нужно держать в голове."
        actions={
          <>
            <Button size="sm" onClick={() => navigate('/reminders/archive')}>
              <IconArchive />
              Архив
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setEditing(null);
                setModalOpen(true);
              }}
            >
              <IconPlus />
              Напомнить
            </Button>
          </>
        }
      />

      <div>
        {section('Сегодня', todayList, 'Сегодня ничего не ждёт.')}
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
                const chosen = snoozeOptions.find(
                  (o) => `${o.date}|${o.slot}` === snoozeChoice,
                );
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
