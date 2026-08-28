import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, FormField, Modal, useToast } from '@planner/ui';
import type { Direction } from '@planner/contracts';
import { api } from '../api/client.js';
import { qk } from '../api/queries.js';

/** Цвета направлений заданы токенами темы — свой цвет не вводится вручную. */
export const DIRECTION_COLORS: { value: string; label: string }[] = [
  { value: '--d-act', label: 'Тёплый красный' },
  { value: '--d-voice', label: 'Охра' },
  { value: '--d-vocal', label: 'Фиолетовый' },
  { value: '--d-eng', label: 'Зелёный' },
  { value: '--d-phys', label: 'Синий' },
];

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
  const [motto, setMotto] = useState(direction.motto ?? '');
  const [showMotto, setShowMotto] = useState(direction.showMotto);
  const [color, setColor] = useState(direction.color);

  useEffect(() => {
    if (!open) return;
    setName(direction.name);
    setDescription(direction.description ?? '');
    setMotto(direction.motto ?? '');
    setShowMotto(direction.showMotto);
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
        motto: motto.trim() || null,
        showMotto,
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
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </FormField>
      <FormField label="Описание" hint="Необязательно">
        <textarea
          className="input"
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </FormField>
      <FormField label="Девиз" hint="Своими словами. Чужие цитаты придумывать не нужно">
        <input className="input" value={motto} onChange={(e) => setMotto(e.target.value)} />
      </FormField>
      <label className="field" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          type="checkbox"
          checked={showMotto}
          onChange={(e) => setShowMotto(e.target.checked)}
        />
        <span className="hint">Показывать девиз на странице направления</span>
      </label>
      <FormField label="Цвет">
        <select className="input" value={color} onChange={(e) => setColor(e.target.value)}>
          {DIRECTION_COLORS.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </FormField>

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
