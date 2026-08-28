import { Button, Modal } from '@planner/ui';

export interface FocusConflictInfo {
  activeTaskTitle: string;
  activeTaskDirectionName: string;
  requestedDirectionId: string;
  requestedDirectionName: string;
}

/**
 * Не допускаем состояния «в фокусе Физика, а занимаюсь задачей из Озвучки»:
 * пользователь явно выбирает, что делать.
 */
export function FocusConflictModal({
  conflict,
  onClose,
  onKeepTask,
  onClearTask,
}: {
  conflict: FocusConflictInfo | null;
  onClose: () => void;
  onKeepTask: () => void;
  onClearTask: () => void;
}) {
  return (
    <Modal
      open={Boolean(conflict)}
      onOpenChange={(v) => !v && onClose()}
      title="Активная задача из другого направления"
      description={
        conflict
          ? `Сейчас активна «${conflict.activeTaskTitle}» из направления «${conflict.activeTaskDirectionName}», а в фокус просится «${conflict.requestedDirectionName}».`
          : undefined
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Отменить
          </Button>
          <Button onClick={onKeepTask}>Оставить задачу</Button>
          <Button variant="primary" onClick={onClearTask}>
            Сменить направление
          </Button>
        </>
      }
    >
      <p className="hint" style={{ marginTop: 12 }}>
        «Оставить задачу» ничего не меняет. «Сменить направление» переводит фокус и очищает активную
        задачу — сама задача останется в проекте.
      </p>
    </Modal>
  );
}
