import { useState, type ReactNode } from 'react';
import { Button, Checkbox, Modal } from '@planner/ui';
import { useCompleteTask } from '../api/queries.js';

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
 * Задачу закрывают из трёх мест, поэтому диалог живёт в хуке: страница зовёт
 * askComplete и рисует dialog у себя, а поведение остаётся одно на всех.
 */
export function useCompleteTaskDialog(): {
  askComplete: (id: string, title?: string) => void;
  dialog: ReactNode;
} {
  const complete = useCompleteTask();
  const [pending, setPending] = useState<Pending | null>(null);
  const [withTouch, setWithTouch] = useState(true);

  const close = (): void => setPending(null);

  const confirm = (): void => {
    if (!pending) return;
    complete.mutate({ taskId: pending.id, withTouch });
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
      <button
        type="button"
        className="touch-ask"
        onClick={() => setWithTouch((v) => !v)}
        aria-pressed={withTouch}
      >
        <Checkbox
          checked={withTouch}
          onChange={() => setWithTouch((v) => !v)}
          label="Записать касание"
        />
        <span className="touch-ask-text">
          Записать касание
          <small>Появится в карте направления — так же, как записанное руками.</small>
        </span>
      </button>
    </Modal>
  );

  return { askComplete: (id, title) => setPending({ id, title }), dialog };
}
