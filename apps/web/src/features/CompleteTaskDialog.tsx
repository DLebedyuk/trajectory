import { useState, type ReactNode } from 'react';
import { Button, Checkbox, FormField, Modal } from '@planner/ui';
import { todayInTimezone } from '@planner/shared';
import { useCompleteTask, useSettings } from '../api/queries.js';

interface Pending {
  id: string;
  title?: string;
}

/**
 * Подтверждение закрытия задачи.
 *
 * Нужно по двум причинам сразу. Первая — мисклик: чекбокс в списке стоит
 * вплотную к строке, и промах закрывал задачу молча. Вторая — касание:
 * закрытая задача может быть занятием, а может бытовой мелочью вроде
 * «позвонить в поликлинику», и решается это по факту, а не когда задачу
 * заводили.
 *
 * Галочка включена по умолчанию: задача и есть занятие, просто запланированное,
 * и снимать её приходится реже, чем ставить.
 *
 * День касания выбирается тут же: задачу могли сделать вчера, а закрыть в
 * приложении только сегодня. По умолчанию — сегодня, будущее недоступно.
 *
 * Задачу закрывают из трёх мест, поэтому диалог живёт в хуке: страница зовёт
 * askComplete и рисует dialog у себя, а поведение остаётся одно на всех.
 */
export function useCompleteTaskDialog(): {
  askComplete: (id: string, title?: string) => void;
  dialog: ReactNode;
} {
  const complete = useCompleteTask();
  const settings = useSettings();
  const [pending, setPending] = useState<Pending | null>(null);
  const [withTouch, setWithTouch] = useState(true);
  const [touchDate, setTouchDate] = useState('');
  // часовой пояс из настроек, а не браузера: так же считает «сегодня» сервер
  const today = todayInTimezone(settings.data?.timezone ?? 'UTC');

  const close = (): void => setPending(null);

  const confirm = (): void => {
    if (!pending) return;
    complete.mutate({ taskId: pending.id, withTouch, touchDate: touchDate || today });
    close();
  };

  const dialog = (
    <Modal
      open={pending !== null}
      onOpenChange={(open) => {
        if (!open) close();
      }}
      title="Закрыть задачу?"
      description={pending?.title}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Отмена
          </Button>
          <Button variant="primary" onClick={confirm}>
            Закрыть
          </Button>
        </>
      }
    >
      {/*
        div, а не button: настоящий чекбокс (см. Checkbox) сам рендерится
        кнопкой, а кнопка внутри кнопки — невалидный HTML. Браузер в этом
        случае сам разрывает вложенность как ему вздумается, и клик по
        кружку переставал сохранять новое значение.
      */}
      <div className="touch-ask" onClick={() => setWithTouch((v) => !v)}>
        <Checkbox
          checked={withTouch}
          onChange={() => setWithTouch((v) => !v)}
          label="Записать касание"
        />
        <span className="touch-ask-text">
          Записать касание
          <small>Появится в карте направления — так же, как записанное руками.</small>
        </span>
      </div>
      {withTouch ? (
        <FormField label="День касания">
          <input
            type="date"
            value={touchDate || today}
            max={today}
            onChange={(e) => setTouchDate(e.target.value)}
          />
        </FormField>
      ) : null}
    </Modal>
  );

  return {
    askComplete: (id, title) => {
      // каждый новый диалог начинается с сегодняшнего дня, а не с прошлого выбора
      setTouchDate('');
      setPending({ id, title });
    },
    dialog,
  };
}
