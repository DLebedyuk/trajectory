import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, FormField, Modal, useToast } from '@planner/ui';
import type { TravelItem } from '@planner/contracts';
import { api } from '../api/client.js';
import { qk, useTravelCategories } from '../api/queries.js';

export function TravelItemModal({
  item,
  open,
  onOpenChange,
}: {
  /** Если передан — редактирование существующей вещи, иначе создание новой. */
  item?: TravelItem;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const categories = useTravelCategories();
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [newCategoryName, setNewCategoryName] = useState('');

  useEffect(() => {
    if (!open) return;
    setName(item?.name ?? '');
    setCategoryId(item?.categoryId ?? '');
    setNewCategoryName('');
  }, [open, item]);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: qk.travelItems });
    void qc.invalidateQueries({ queryKey: qk.travelCategories });
  };

  const save = useMutation({
    mutationFn: async () => {
      let finalCategoryId = categoryId || null;
      if (categoryId === 'new' && newCategoryName.trim()) {
        finalCategoryId = (await api.travel.createCategory(newCategoryName.trim())).id;
      } else if (categoryId === 'new') {
        finalCategoryId = null;
      }
      // у вещи нет условий: новая вещь попадает в каждый чек-лист, а у редактируемой
      // условия, заведённые стартовым набором, остаются как были
      return item
        ? api.travel.updateItem(item.id, { name: name.trim(), categoryId: finalCategoryId })
        : api.travel.createItem({
            name: name.trim(),
            categoryId: finalCategoryId,
            tags: [],
            alwaysInclude: true,
          });
    },
    onSuccess: () => {
      invalidate();
      toast.show(item ? 'Вещь обновлена' : 'Добавлено в личную базу');
      onOpenChange(false);
    },
    onError: () => toast.show('Не удалось сохранить вещь'),
  });

  const toggleArchived = useMutation({
    mutationFn: () => api.travel.updateItem((item as TravelItem).id, { archived: !item?.archived }),
    onSuccess: () => {
      invalidate();
      toast.show(item?.archived ? 'Вещь возвращена в базу' : 'Вещь архивирована');
      onOpenChange(false);
    },
  });

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={item ? 'Изменить вещь' : 'Добавить вещь'}
      footer={
        <>
          {item ? (
            <Button variant="ghost" onClick={() => toggleArchived.mutate()}>
              {item.archived ? 'Вернуть в базу' : 'Архивировать'}
            </Button>
          ) : (
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Отмена
            </Button>
          )}
          <Button variant="primary" disabled={!name.trim()} onClick={() => save.mutate()}>
            {item ? 'Сохранить' : 'Добавить'}
          </Button>
        </>
      }
    >
      <FormField label="Название">
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
      </FormField>
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
    </Modal>
  );
}
