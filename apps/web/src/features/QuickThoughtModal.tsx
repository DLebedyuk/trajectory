import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Modal, useToast } from '@planner/ui';
import { api } from '../api/client.js';
import { qk } from '../api/queries.js';

/**
 * Быстрая запись во входящие. Одно поле и ничего больше: смысл входящих
 * в том, чтобы мысль попала внутрь раньше, чем человек решит, что это такое.
 */
export function QuickThoughtModal({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved?: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [text, setText] = useState('');

  const save = useMutation({
    mutationFn: () => api.inbox.create({ originalText: text.trim(), source: 'web' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.inbox });
      toast.show('Записано во входящие');
      setText('');
      onOpenChange(false);
      onSaved?.();
    },
    onError: () => toast.show('Не удалось записать'),
  });

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Записать мысль"
      description="Попадёт во входящие. Разобрать можно потом."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button
            variant="primary"
            disabled={!text.trim() || save.isPending}
            onClick={() => save.mutate()}
          >
            Сохранить
          </Button>
        </>
      }
    >
      <div className="field">
        <textarea
          rows={3}
          value={text}
          autoFocus
          placeholder="Например: посмотреть спектакль в Практике"
          onChange={(e) => setText(e.target.value)}
        />
      </div>
    </Modal>
  );
}
