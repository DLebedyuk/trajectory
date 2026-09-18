import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  FormField,
  IconPlus,
  IconRefresh,
  IconTrash,
  Modal,
  PageHeader,
  useToast,
} from '@planner/ui';
import type { TripChecklistItem } from '@planner/contracts';
import { formatLongDate } from '@planner/shared';
import { api } from '../api/client.js';
import { qk, useTrip, useTripChecklist } from '../api/queries.js';
import { ErrorBox, Loading } from '../components/Loading.js';
import { TripSettingsModal } from '../features/TripSettingsModal.js';

const FILTERS = [
  { value: 'all' as const, label: 'Все' },
  { value: 'open' as const, label: 'Не собрано' },
  { value: 'buy' as const, label: 'Купить' },
];

export function TripPage() {
  const { tripId = '' } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const trip = useTrip(tripId);
  const checklist = useTripChecklist(tripId);
  const [filter, setFilter] = useState<'all' | 'open' | 'buy'>('all');
  const [itemOpen, setItemOpen] = useState(false);
  const [itemTitle, setItemTitle] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: qk.tripChecklist(tripId) });
    void qc.invalidateQueries({ queryKey: qk.trips });
  };

  const addItem = useMutation({
    mutationFn: () => api.travel.addChecklistItem(tripId, { title: itemTitle, quantity: 1 }),
    onSuccess: () => {
      invalidate();
      setItemTitle('');
      setItemOpen(false);
    },
  });
  const toggleField = useMutation({
    mutationFn: (vars: { itemId: string; field: 'packed' | 'needToBuy'; value: boolean }) =>
      api.travel.updateChecklistItem(tripId, vars.itemId, { [vars.field]: vars.value }),
    onSuccess: invalidate,
  });
  const setQuantity = useMutation({
    mutationFn: (vars: { itemId: string; quantity: number }) =>
      api.travel.updateChecklistItem(tripId, vars.itemId, { quantity: vars.quantity }),
    onSuccess: invalidate,
  });
  const removeItem = useMutation({
    mutationFn: (itemId: string) => api.travel.removeChecklistItem(tripId, itemId),
    onSuccess: invalidate,
  });
  const refresh = useMutation({
    mutationFn: () => api.travel.refreshChecklist(tripId),
    onSuccess: (_data, _vars) => {
      invalidate();
      void qc.invalidateQueries({ queryKey: qk.trip(tripId) });
      toast.show('Список обновлён — новые пункты добавлены, ваши правки не тронуты');
    },
  });
  const complete = useMutation({
    mutationFn: () => api.travel.completeTrip(tripId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.trip(tripId) });
      void qc.invalidateQueries({ queryKey: qk.trips });
      toast.show('Поездка завершена');
    },
  });
  const removeTrip = useMutation({
    mutationFn: () => api.travel.removeTrip(tripId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.trips });
      toast.show('Поездка удалена');
      navigate('/travel');
    },
  });

  if (trip.isLoading || checklist.isLoading) return <Loading what="Загружаю поездку" />;
  if (trip.isError) return <ErrorBox error={trip.error} onRetry={() => void trip.refetch()} />;
  if (checklist.isError)
    return <ErrorBox error={checklist.error} onRetry={() => void checklist.refetch()} />;
  const t = trip.data;
  if (!t) return null;

  const items = checklist.data ?? [];
  const packedCount = items.filter((i) => i.packed).length;
  const buyCount = items.filter((i) => i.needToBuy).length;
  const visible = items.filter((i) => {
    if (filter === 'open') return !i.packed;
    if (filter === 'buy') return i.needToBuy;
    return true;
  });

  const groups = new Map<string, TripChecklistItem[]>();
  for (const item of visible) {
    const key = item.categoryName ?? 'Другое';
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }

  const dateRange = `${formatLongDate(t.startDate)} – ${formatLongDate(t.endDate)}`;

  return (
    <>
      <PageHeader
        onBack={() => navigate('/travel')}
        title={t.name ?? t.city ?? t.country}
        subtitle={
          <>
            {dateRange}
            {t.status === 'done' ? <span className="focus-state pinned"> · завершена</span> : null}
          </>
        }
        actions={
          <>
            <Button size="sm" onClick={() => setSettingsOpen(true)}>
              Параметры поездки
            </Button>
            <Button
              size="sm"
              onClick={() => refresh.mutate()}
              disabled={refresh.isPending}
            >
              <IconRefresh />
              {t.checklistGeneratedAt ? 'Обновить рекомендации' : 'Сгенерировать чек-лист'}
            </Button>
          </>
        }
      />

      <div className="card trip-progress">
        <b>
          {packedCount} / {items.length} собрано
        </b>
        {buyCount > 0 ? <span className="hint">{buyCount} нужно купить</span> : null}
        <div className="chips">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              className={`chip${filter === f.value ? ' is-active' : ''}`}
              aria-pressed={filter === f.value}
              onClick={() => setFilter(f.value)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {items.length === 0 ? (
        <p className="hint">
          Чек-лист пока пуст. Нажмите «Сгенерировать чек-лист», чтобы собрать его из личной базы
          вещей.
        </p>
      ) : (
        [...groups.entries()].map(([category, catItems]) => (
          <div className="card checklist-group" key={category}>
            <h4>{category}</h4>
            {catItems.map((item) => (
              <div className="task-row" key={item.id}>
                <button
                  type="button"
                  className={`check${item.packed ? ' done' : ''}`}
                  aria-label={`Пункт: ${item.title}`}
                  aria-pressed={item.packed}
                  onClick={() =>
                    toggleField.mutate({ itemId: item.id, field: 'packed', value: !item.packed })
                  }
                />
                <span className={`tname${item.packed ? ' done' : ''}`}>
                  {item.title}
                  {item.quantity > 1 ? <span className="qty-tag"> × {item.quantity}</span> : null}
                </span>
                <input
                  type="number"
                  min={1}
                  className="qty-input"
                  value={item.quantity}
                  onChange={(e) =>
                    setQuantity.mutate({ itemId: item.id, quantity: Number(e.target.value) || 1 })
                  }
                  aria-label={`Количество: ${item.title}`}
                />
                <button
                  type="button"
                  className={`buy-tag${item.needToBuy ? ' is-active' : ''}`}
                  aria-pressed={item.needToBuy}
                  title="Нужно купить"
                  onClick={() =>
                    toggleField.mutate({
                      itemId: item.id,
                      field: 'needToBuy',
                      value: !item.needToBuy,
                    })
                  }
                >
                  🛒
                </button>
                <button
                  type="button"
                  className="row-del"
                  aria-label={`Удалить пункт: ${item.title}`}
                  title="Удалить"
                  onClick={() => removeItem.mutate(item.id)}
                >
                  <IconTrash />
                </button>
              </div>
            ))}
          </div>
        ))
      )}

      <Button variant="ghost" onClick={() => setItemOpen(true)}>
        <IconPlus />
        Добавить пункт
      </Button>

      <div className="card danger-zone" style={{ marginTop: 18 }}>
        <div>
          {t.status === 'planning' ? (
            <>
              <b>Завершить поездку</b>
              <p className="hint">Поездка перейдёт в архив завершённых.</p>
            </>
          ) : (
            <>
              <b>Удалить поездку</b>
              <p className="hint">Насовсем, вместе с чек-листом. Отменить будет нечем.</p>
            </>
          )}
        </div>
        {t.status === 'planning' ? (
          <Button size="sm" onClick={() => complete.mutate()}>
            Завершить
          </Button>
        ) : (
          <Button variant="ghost" danger onClick={() => removeTrip.mutate()}>
            <IconTrash />
            Удалить
          </Button>
        )}
      </div>

      <Modal
        open={itemOpen}
        onOpenChange={setItemOpen}
        title="Пункт чек-листа"
        footer={
          <>
            <Button variant="ghost" onClick={() => setItemOpen(false)}>
              Отмена
            </Button>
            <Button
              variant="primary"
              disabled={!itemTitle.trim()}
              onClick={() => addItem.mutate()}
            >
              Добавить
            </Button>
          </>
        }
      >
        <FormField label="Название">
          <input type="text" value={itemTitle} onChange={(e) => setItemTitle(e.target.value)} />
        </FormField>
      </Modal>

      <TripSettingsModal trip={t} open={settingsOpen} onOpenChange={setSettingsOpen} />
    </>
  );
}
