import { Button } from './Button.js';
import { Modal } from './Modal.js';

export interface ConfirmModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  pending?: boolean;
}

/** Подтверждение опасного действия — один и тот же диалог для всех кнопок «Удалить». */
export function ConfirmModal({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Удалить',
  cancelLabel = 'Отмена',
  onConfirm,
  pending = false,
}: ConfirmModalProps) {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {cancelLabel}
          </Button>
          <Button variant="primary" danger disabled={pending} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    />
  );
}
