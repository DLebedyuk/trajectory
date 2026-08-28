import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, FormField, Modal, useToast } from '@planner/ui';
import { formatLongDate } from '@planner/shared';
import type { Reminder } from '@planner/contracts';
import { api } from '../api/client.js';
import { qk } from '../api/queries.js';

export function ReminderModal({
  open,
  onOpenChange,
  today,
  editing,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  today: string;
  editing?: Reminder | null;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [text, setText] = useState('');
  const [date, setDate] = useState(today);
  const [time, setTime] = useState('');
  const [repeat, setRepeat] = useState<'' | 'daily' | 'weekly' | 'monthly'>('');
  const [comment, setComment] = useState('');

  useEffect(() => {
    if (!open) return;
    setText(editing?.text ?? '');
    setDate(editing?.scheduledDate ?? today);
    setTime(editing?.scheduledTime ?? '');
    setRepeat((editing?.repeatRule as '' | 'daily' | 'weekly' | 'monthly') ?? '');
    setComment(editing?.comment ?? '');
  }, [open, editing, today]);

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        text,
        scheduledDate: date,
        scheduledTime: time || null,
        repeatRule: repeat || null,
        comment: comment || null,
      };
      return editing
        ? api.reminders.update(editing.id, payload)
        : api.reminders.create({ ...payload, source: 'web' as const });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.reminders });
      void qc.invalidateQueries({ queryKey: qk.dashboard });
      toast.show(
        time
          ? `Напомню ${formatLongDate(date)} в ${time}`
          : `Напомню ${formatLongDate(date)} в дневной сводке`,
      );
      onOpenChange(false);
    },
  });

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? 'Напоминание' : 'Напомнить'}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button
            variant="primary"
            disabled={text.trim().length === 0 || save.isPending}
            onClick={() => save.mutate()}
          >
            Сохранить
          </Button>
        </>
      }
    >
      <FormField label="О чём">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Поставить стирку"
        />
      </FormField>
      <div className="cols2">
        <FormField label="Дата">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </FormField>
        <FormField label="Точное время" hint="Без времени уйдёт в дневную сводку">
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </FormField>
      </div>
      <FormField label="Повторять">
        <select value={repeat} onChange={(e) => setRepeat(e.target.value as typeof repeat)}>
          <option value="">не повторять</option>
          <option value="daily">каждый день</option>
          <option value="weekly">каждую неделю</option>
          <option value="monthly">каждый месяц</option>
        </select>
      </FormField>
      <FormField label="Комментарий">
        <input type="text" value={comment} onChange={(e) => setComment(e.target.value)} />
      </FormField>
    </Modal>
  );
}
