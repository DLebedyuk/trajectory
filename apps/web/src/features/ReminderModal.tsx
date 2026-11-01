import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, FormField, Modal, useToast } from '@planner/ui';
import { formatLongDate } from '@planner/shared';
import type { Reminder, TimeSlot } from '@planner/contracts';
import { api } from '../api/client.js';
import { qk } from '../api/queries.js';
import { CheckRow } from '../components/CheckRow.js';

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
  // новое из кнопки «Напомнить» — с уведомлением; у пункта списка — как было
  const [notify, setNotify] = useState(true);

  useEffect(() => {
    if (!open) return;
    setText(editing?.text ?? '');
    setDate(editing?.scheduledDate ?? today);
    setTime(editing?.scheduledTime ?? '');
    setTimeSlot(editing?.timeSlot ?? '');
    setRepeat((editing?.repeatRule as '' | 'daily' | 'weekly' | 'monthly') ?? '');
    setComment(editing?.comment ?? '');
    setNotify(editing?.notify ?? true);
  }, [open, editing, today]);

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        text,
        scheduledDate: date,
        notify,
        scheduledTime: notify ? time || null : null,
        timeSlot: notify && !time ? timeSlot || null : null,
        repeatRule: repeat || null,
        comment: comment || null,
      };
      return editing
        ? api.reminders.update(editing.id, payload)
        : api.reminders.create({ ...payload, source: 'web' as const });
    },
    onSuccess: (saved) => {
      void qc.invalidateQueries({ queryKey: qk.reminders });
      void qc.invalidateQueries({ queryKey: qk.dashboard });
      // текст строим из того, что реально сохранил сервер: прошедший слот он
      // мог перенести на другую дату, а форма об этом ничего не знает
      toast.show(
        !saved.notify
          ? `Записано на ${formatLongDate(saved.scheduledDate)}, без уведомления`
          : saved.scheduledTime
            ? `Напомню ${formatLongDate(saved.scheduledDate)} в ${saved.scheduledTime}`
            : saved.timeSlot
              ? `Напомню ${formatLongDate(saved.scheduledDate)} ${SLOT_LABEL[saved.timeSlot]}`
              : `Напомню ${formatLongDate(saved.scheduledDate)} — подберу ближайшее время`,
      );
      onOpenChange(false);
    },
    onError: () => toast.show('Не удалось сохранить напоминание'),
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
      <FormField label="День" hint="В этот день дело появится в списке «Сегодня»">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </FormField>
      {/* день в списке и уведомление — разные вещи: дата ещё не значит «напомни» */}
      <CheckRow checked={notify} onChange={() => setNotify((v) => !v)} label="Напомнить" />
      {notify ? (
        <>
          <FormField label="Точное время" hint="Без времени — один из слотов ниже">
            <input
              type="time"
              value={time}
              onChange={(e) => {
                setTime(e.target.value);
                if (e.target.value) setTimeSlot('');
              }}
            />
          </FormField>
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
        </>
      ) : null}
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
