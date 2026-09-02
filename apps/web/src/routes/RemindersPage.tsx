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
import { formatLongDate, todayInTimezone } from '@planner/shared';
import type { Reminder } from '@planner/contracts';
import { api } from '../api/client.js';
import { qk, useDashboard, useDirections, useReminders } from '../api/queries.js';
import { ReminderModal } from '../features/ReminderModal.js';
import { ErrorBox, Loading } from '../components/Loading.js';

const MISS: Record<string, string> = {
  none: 'больше не переспрашивать',
  evening: 'один раз переспросить вечером',
  nextDigest: 'перенести в следующую сводку',
};

export function RemindersPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const reminders = useReminders();
  const dashboard = useDashboard();
  const directions = useDirections();
  const [editing, setEditing] = useState<Reminder | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [toTask, setToTask] = useState<Reminder | null>(null);
  const [projectId, setProjectId] = useState('');
  const [projects, setProjects] = useState<{ id: string; title: string; directionName: string }[]>(
    [],
  );

  const today = dashboard.data?.today ?? todayInTimezone('UTC');

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: qk.reminders });
    void qc.invalidateQueries({ queryKey: qk.dashboard });
    void qc.invalidateQueries({ queryKey: qk.remindersArchive });
  };

  const complete = useMutation({
    mutationFn: (id: string) => api.reminders.complete(id),
    onSuccess: () => {
      refresh();
      toast.show('Готово. Напоминание ушло в архив.');
    },
  });
  const snooze = useMutation({
    mutationFn: (vars: { id: string; mode: 'hour' | 'evening' | 'tomorrow' }) =>
      api.reminders.snooze(vars.id, { mode: vars.mode }),
    onSuccess: (_d, vars) => {
      refresh();
      toast.show(
        vars.mode === 'hour'
          ? 'Напомню через час'
          : vars.mode === 'evening'
            ? 'Напомню вечером'
            : 'Перенесено на завтра — без всякого долга',
      );
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.reminders.remove(id),
    onSuccess: () => {
      refresh();
      toast.show('Удалено');
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
   * Карточка напоминания. Частые действия — «Готово» и переносы — остаются
   * на виду, редкие уезжают в «···»: на телефоне семь кнопок подряд
   * превращаются в кашу, но исчезнуть ни одно действие не должно.
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
          onClick={() => complete.mutate(r.id)}
        />
        <span className="rt">{r.text}</span>
        <span className="when mono">
          {formatLongDate(r.scheduledDate)}
          {r.scheduledTime ? `, ${r.scheduledTime}` : ''}
        </span>
      </div>

      <div className="meta">
        <span className="badge">
          {r.deliveryMode === 'alert' ? 'отдельное уведомление' : 'в дневной сводке'}
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
        <span className="badge">{MISS[r.missedBehavior]}</span>
      </div>

      {r.comment ? <p className="hint rem-comment">{r.comment}</p> : null}

      <div className="actions">
        <button type="button" className="btn primary" onClick={() => complete.mutate(r.id)}>
          Готово
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => snooze.mutate({ id: r.id, mode: 'hour' })}
        >
          Через час
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => snooze.mutate({ id: r.id, mode: 'tomorrow' })}
        >
          Завтра
        </button>
        <OverflowMenu
          label={`Ещё действия: ${r.text}`}
          items={[
            { label: 'Вечером', onSelect: () => snooze.mutate({ id: r.id, mode: 'evening' }) },
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
    </>
  );
}
