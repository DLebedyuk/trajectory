import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, FormField, Modal, useToast } from '@planner/ui';
import { formatLongDate } from '@planner/shared';
import type { Reminder, TimeSlot } from '@planner/contracts';
import { api } from '../api/client.js';
import { qk } from '../api/queries.js';

const SLOTS: { value: TimeSlot; label: string }[] = [
  { value: 'morning', label: 'Утро' },
  { value: 'day', label: 'День' },
  { value: 'evening', label: 'Вечер' },
];
const SLOT_LABEL: Record<TimeSlot, string> = { morning: 'утром', day: 'днём', evening: 'вечером' };

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
  const [timeSlot, setTimeSlot] = useState<TimeSlot | ''>('');
  const [repeat, setRepeat] = useState<'' | 'daily' | 'weekly' | 'monthly'>('');
  const [comment, setComment] = useState('');

  useEffect(() => {
    if (!open) return;
    setText(editing?.text ?? '');
    setDate(editing?.scheduledDate ?? today);
    setTime(editing?.scheduledTime ?? '');
    setTimeSlot(editing?.timeSlot ?? '');
    setRepeat((editing?.repeatRule as '' | 'daily' | 'weekly' | 'monthly') ?? '');
    setComment(editing?.comment ?? '');
  }, [open, editing, today]);

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        text,
        scheduledDate: date,
        scheduledTime: time || null,
        timeSlot: time ? null : timeSlot || null,
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
          : timeSlot
            ? `Напомню ${formatLongDate(date)} ${SLOT_LABEL[timeSlot]}`
            : `Напомню ${formatLongDate(date)} — подберу ближайшее время`,
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
        <FormField label="Точное время" hint="Без времени — один из слотов слева">
          <input
            type="time"
            value={time}
            onChange={(e) => {
              setTime(e.target.value);
              if (e.target.value) setTimeSlot('');
            }}
          />
        </FormField>
      </div>
      <FormField
        label="Когда напомнить, если без точного времени"
        hint="Ничего не выбрано — возьмём ближайшее подходящее"
      >
        <div className="seg">
          {SLOTS.map((s) => (
            <button
              key={s.value}
              type="button"
              data-on={timeSlot === s.value}
              onClick={() => {
                setTimeSlot(timeSlot === s.value ? '' : s.value);
                setTime('');
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
      </FormField>
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
