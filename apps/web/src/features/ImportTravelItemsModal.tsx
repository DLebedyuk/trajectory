import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, FormField, Modal, useToast } from '@planner/ui';
import { api } from '../api/client.js';
import { qk, useTravelCategories } from '../api/queries.js';

/** Маркеры списка в начале строки («- », «• », «1. ») не часть названия. */
const LIST_MARKER = /^\s*(?:[-–—•*·]|\d+[.)])\s+/;

export function parseItemLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(LIST_MARKER, '').trim())
    .filter(Boolean);
}

export function ImportTravelItemsModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const categories = useTravelCategories();
  const [categoryId, setCategoryId] = useState('');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [text, setText] = useState('');

  useEffect(() => {
    if (!open) return;
    setCategoryId('');
    setNewCategoryName('');
    setText('');
  }, [open]);

  const names = parseItemLines(text);
  const needsCategoryName = categoryId === 'new' && !newCategoryName.trim();

  const run = useMutation({
    mutationFn: () =>
      api.travel.importItems({
        names,
        categoryId: categoryId && categoryId !== 'new' ? categoryId : null,
        newCategoryName: categoryId === 'new' ? newCategoryName.trim() : null,
      }),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: qk.travelItems });
      void qc.invalidateQueries({ queryKey: qk.travelCategories });
      toast.show(
        res.skipped > 0
          ? `Добавлено: ${res.created}. Уже были в базе: ${res.skipped}`
          : `Добавлено: ${res.created}`,
      );
      onOpenChange(false);
    },
    onError: () => toast.show('Не удалось импортировать список'),
  });

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Быстрый импорт"
      description="Выберите категорию и впишите вещи — каждая с новой строки."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button
            variant="primary"
            disabled={names.length === 0 || needsCategoryName || run.isPending}
            onClick={() => run.mutate()}
          >
            {names.length > 0 ? `Добавить (${names.length})` : 'Добавить'}
          </Button>
        </>
      }
    >
      <FormField label="Категория">
        <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">без категории</option>
          {(categories.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
          <option value="new">+ новая категория</option>
        </select>
      </FormField>
      {categoryId === 'new' ? (
        <FormField label="Название категории">
          <input
            type="text"
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
          />
        </FormField>
      ) : null}
      <FormField label="Вещи" hint="Можно вставлять список с маркерами — «-», «•», «1.» уберутся сами.">
        <textarea
          rows={8}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={'Паспорт\nЗарядка\nНоутбук'}
        />
      </FormField>
    </Modal>
  );
}
