import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Checkbox, FormField, Modal, useToast } from '@planner/ui';
import { TRAVEL_TAG_LABELS, travelTag, type TravelItem, type TravelTag } from '@planner/contracts';
import { api } from '../api/client.js';
import { qk, useTravelCategories } from '../api/queries.js';

/**
 * «Всегда» — не тег для выбора, а отдельный флаг alwaysInclude: показывать
 * оба способа сказать одно и то же было бы избыточно (см. план раздела).
 */
const PICKABLE_TAGS = travelTag.options.filter((t): t is Exclude<TravelTag, 'always'> => t !== 'always');

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
  const [tags, setTags] = useState<TravelTag[]>([]);
  const [alwaysInclude, setAlwaysInclude] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(item?.name ?? '');
    setCategoryId(item?.categoryId ?? '');
    setNewCategoryName('');
    setTags(item?.tags.filter((t) => t !== 'always') ?? []);
    setAlwaysInclude(item?.alwaysInclude ?? false);
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
      const payload = { name: name.trim(), categoryId: finalCategoryId, tags, alwaysInclude };
      return item ? api.travel.updateItem(item.id, payload) : api.travel.createItem(payload);
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

  const toggleTag = (t: TravelTag) =>
    setTags((prev) => (prev.includes(t) ? prev.filter((v) => v !== t) : [...prev, t]));

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

      <div className="field">
        <Checkbox
          checked={alwaysInclude}
          onChange={() => setAlwaysInclude((v) => !v)}
          label="Всегда добавлять в чек-лист"
        />
      </div>

      <div className="field">
        <span className="lbl">Добавлять при условиях</span>
        <div className="chips">
          {PICKABLE_TAGS.map((t) => (
            <button
              key={t}
              type="button"
              className={`chip${tags.includes(t) ? ' is-active' : ''}`}
              aria-pressed={tags.includes(t)}
              onClick={() => toggleTag(t)}
            >
              {TRAVEL_TAG_LABELS[t]}
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}
