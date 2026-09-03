import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, DIRECTION_COLORS, FormField, Modal, useToast } from '@planner/ui';
import type { Direction } from '@planner/contracts';
import { api } from '../api/client.js';
import { qk } from '../api/queries.js';

export function DirectionSettingsModal({
  direction,
  open,
  onOpenChange,
  onArchived,
}: {
  direction: Direction;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onArchived?: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState(direction.name);
  const [description, setDescription] = useState(direction.description ?? '');
  const [color, setColor] = useState(direction.color);

  useEffect(() => {
    if (!open) return;
    setName(direction.name);
    setDescription(direction.description ?? '');
    setColor(direction.color);
  }, [open, direction]);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: qk.direction(direction.id) });
    void qc.invalidateQueries({ queryKey: qk.directions });
  };

  const save = useMutation({
    mutationFn: () =>
      api.directions.update(direction.id, {
        name: name.trim(),
        description: description.trim() || null,
        color,
      }),
    onSuccess: () => {
      invalidate();
      toast.show('Направление обновлено');
      onOpenChange(false);
    },
    onError: () => toast.show('Не удалось сохранить направление'),
  });

  const archive = useMutation({
    mutationFn: () => api.directions.archive(direction.id),
    onSuccess: () => {
      invalidate();
      toast.show('Направление в архиве. Касания и статистика остались.');
      onOpenChange(false);
      onArchived?.();
    },
    onError: () => toast.show('Не удалось архивировать направление'),
  });

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Настройки направления"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Отменить
          </Button>
          <Button variant="primary" disabled={!name.trim()} onClick={() => save.mutate()}>
            Сохранить
          </Button>
        </>
      }
    >
      <FormField label="Название">
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
      </FormField>
      <FormField label="Описание" hint="Необязательно">
        <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
      </FormField>
      <div className="field">
        <span className="lbl">Цвет</span>
        {/* Именно чипы, а не список: «тауп» и «дымчато-лиловый» словами не различишь. */}
        <div className="chips">
          {DIRECTION_COLORS.map((c) => (
            <button
              key={c.value}
              type="button"
              className={`chip${color === c.value ? ' is-active' : ''}`}
              aria-pressed={color === c.value}
              onClick={() => setColor(c.value)}
            >
              <i className="dir-dot" style={{ ['--c' as string]: `var(${c.value})` }} />
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 18, borderTop: '1px solid var(--line)', paddingTop: 14 }}>
        <p className="hint" style={{ marginBottom: 10 }}>
          Направление можно убрать в архив: оно исчезнет из списка, но касания и статистика
          останутся.
        </p>
        <Button size="sm" onClick={() => archive.mutate()}>
          Убрать в архив
        </Button>
      </div>
    </Modal>
  );
}
