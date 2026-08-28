import * as Dialog from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';

export interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
}

/** Доступная модалка на Radix, но со стилями прототипа. */
export function Modal({ open, onOpenChange, title, description, children, footer }: ModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="scrim" />
        <Dialog.Content className="modal">
          <Dialog.Title asChild>
            <h3>{title}</h3>
          </Dialog.Title>
          {description ? (
            <Dialog.Description className="hint" style={{ marginTop: 6 }}>
              {description}
            </Dialog.Description>
          ) : (
            <Dialog.Description style={{ display: 'none' }}>{title}</Dialog.Description>
          )}
          {children}
          {footer ? <div className="modal-foot">{footer}</div> : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
