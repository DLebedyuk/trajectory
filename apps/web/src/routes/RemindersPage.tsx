import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Checkbox,
  EmptyState,
  IconArchive,
  IconPlus,
  Modal,
  PageHeader,
  useToast,
} from '@planner/ui';
import { formatLongDate, todayInTimezone } from '@planner/shared';
import type { Reminder } from '@planner/contracts';
import { api } from '../api/client.js';
import {
  qk,
  useDashboard,
  useDirections,
  useReminders,
  useRemindersArchive,
} from '../api/queries.js';
import { ReminderModal } from '../features/ReminderModal.js';
import { ErrorBox, Loading } from '../components/Loading.js';

const MISS: Record<string, string> = {
  none: 'больше не переспрашивать',
  evening: 'один раз переспросить вечером',
  nextDigest: 'перенести в следующую сводку',
};

export function RemindersPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const reminders = useReminders();
  const dashboard = useDashboard();
  const directions = useDirections();
  const [archiveOpen, setArchiveOpen] = useState(false);
  const archive = useRemindersArchive();
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
  if (reminders.isError) return <ErrorBox error={reminders.error} />;

  const active = reminders.data ?? [];
  const todayList = active.filter((r) => r.scheduledDate <= today);
  const soon = active.filter((r) => r.scheduledDate > today && !r.repeatRule);
  const repeating = active.filter((r) => r.repeatRule);

  const card = (r: Reminder) => (
    <div className="rem" key={r.id}>
      <Checkbox
        checked={false}
        onChange={() => complete.mutate(r.id)}
        label={`Выполнить: ${r.text}`}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="rem-txt">{r.text}</div>
        <div className="row-sub" style={{ marginTop: 5 }}>
          <span className="tag">
            {formatLongDate(r.scheduledDate)}
            {r.scheduledTime ? `, ${r.scheduledTime}` : ''}
          </span>
          <span className="tag">
            {r.deliveryMode === 'alert' ? 'отдельное уведомление' : 'в дневной сводке'}
          </span>
          {r.repeatRule ? (
            <span className="tag">
              {r.repeatRule === 'daily'
                ? 'каждый день'
                : r.repeatRule === 'weekly'
                  ? 'каждую неделю'
                  : 'каждый месяц'}
            </span>
          ) : null}
          <span
            className="tag"
            style={r.source === 'telegram' ? { color: 'var(--tg)' } : undefined}
          >
            {r.source === 'telegram' ? 'Telegram' : 'приложение'}
          </span>
          <span className="tag">{MISS[r.missedBehavior]}</span>
        </div>
        {r.comment ? (
          <p className="hint" style={{ marginTop: 6 }}>
            {r.comment}
          </p>
        ) : null}
        <div className="rem-acts">
          <Button size="sm" onClick={() => complete.mutate(r.id)}>
            Готово
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => snooze.mutate({ id: r.id, mode: 'hour' })}
          >
            Через час
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => snooze.mutate({ id: r.id, mode: 'evening' })}
          >
            Вечером
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => snooze.mutate({ id: r.id, mode: 'tomorrow' })}
          >
            Завтра
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setEditing(r);
              setModalOpen(true);
            }}
          >
            Другая дата
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void openConvert(r)}>
            В задачу
          </Button>
          <Button size="sm" variant="ghost" danger onClick={() => remove.mutate(r.id)}>
            Удалить
          </Button>
        </div>
      </div>
    </div>
  );

  const section = (title: string, list: Reminder[], empty: string) => (
    <div style={{ marginBottom: 22 }}>
      <span className="lbl" style={{ display: 'block', marginBottom: 9 }}>
        {title}
      </span>
      {list.length > 0 ? list.map(card) : <p className="hint">{empty}</p>}
    </div>
  );

  return (
    <>
      <PageHeader
        title="Напоминания"
        subtitle="Внешняя память. Не задачи и не проекты — мелочь, которую не нужно держать в голове."
        actions={
          <>
            {/* напоминания приходят из Telegram — кнопка на случай задержки */}
            <Button size="sm" variant="ghost" onClick={() => void reminders.refetch()}>
              Обновить
            </Button>
            <Button size="sm" onClick={() => setArchiveOpen(true)}>
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

      <div style={{ maxWidth: 760 }}>
        {section('Сегодня', todayList, 'Сегодня ничего не ждёт.')}
        {section('Ближайшие', soon, 'Впереди пусто.')}
        {section('Регулярные', repeating, 'Регулярных нет.')}
        <p className="hint">Выполненные напоминания уходят в архив и лежат там семь дней.</p>
      </div>

      <ReminderModal open={modalOpen} onOpenChange={setModalOpen} today={today} editing={editing} />

      <Modal
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        title="Архив напоминаний"
        description="Последние семь дней."
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
                  {formatLongDate(r.scheduledDate)}
                  {r.scheduledTime ? `, ${r.scheduledTime}` : ''} ·{' '}
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
