import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  EmptyState,
  IconArchive,
  IconCalendar,
  IconPlus,
  IconTrash,
  Modal,
  PageHeader,
  useToast,
} from '@planner/ui';
import type { TravelCategory, TravelItem } from '@planner/contracts';
import { formatLongDate } from '@planner/shared';
import { api } from '../api/client.js';
import { qk, useTravelCategories, useTravelItems, useTrips } from '../api/queries.js';
import { ErrorBox, Loading } from '../components/Loading.js';
import { ImportTravelItemsModal } from '../features/ImportTravelItemsModal.js';
import { NewTripWizard } from '../features/NewTripWizard.js';
import { TravelItemModal } from '../features/TravelItemModal.js';

export function TravelPage() {
  const navigate = useNavigate();
  const trips = useTrips();
  const items = useTravelItems();
  const categories = useTravelCategories();
  const qc = useQueryClient();
  const toast = useToast();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<TravelItem | null>(null);
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [categoryToDelete, setCategoryToDelete] = useState<TravelCategory | null>(null);

  const removeCategory = useMutation({
    mutationFn: (id: string) => api.travel.removeCategory(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.travelCategories });
      void qc.invalidateQueries({ queryKey: qk.travelItems });
      void qc.invalidateQueries({ queryKey: ['tripChecklist'] });
      toast.show('Категория удалена');
      setCategoryToDelete(null);
    },
    onError: () => toast.show('Не удалось удалить категорию'),
  });

  if (trips.isLoading || items.isLoading || categories.isLoading) return <Loading what="Загружаю поездки" />;
  if (trips.isError) return <ErrorBox error={trips.error} onRetry={() => void trips.refetch()} />;
  if (items.isError) return <ErrorBox error={items.error} onRetry={() => void items.refetch()} />;

  const upcoming = (trips.data ?? []).filter((t) => t.status === 'planning');
  const done = (trips.data ?? []).filter((t) => t.status === 'done');

  // категории показываем все, в том числе пустые: иначе пустую не удалить
  const allItems = items.data ?? [];
  const groups = (categories.data ?? []).map((c) => ({
    category: c,
    items: allItems.filter((i) => i.categoryId === c.id),
  }));
  const uncategorized = allItems.filter((i) => !i.categoryId);

  return (
    <>
      <PageHeader
        title="Поездки"
        subtitle="Личная база вещей и чек-листы под конкретные поездки."
        actions={
          <Button variant="primary" onClick={() => setWizardOpen(true)}>
            <IconPlus />
            Новая поездка
          </Button>
        }
      />

      {upcoming.length === 0 ? (
        <EmptyState
          title="Поездок пока нет"
          description="Создайте поездку — чек-лист соберётся из вашей личной базы вещей."
          action={<Button onClick={() => setWizardOpen(true)}>Новая поездка</Button>}
        />
      ) : (
        <div className="trip-list">
          {upcoming.map((t) => (
            <button
              type="button"
              key={t.id}
              className="card trip-card"
              onClick={() => navigate(`/travel/${t.id}`)}
            >
              <div className="ttl">
                <IconCalendar />
                {t.name ?? t.city ?? t.country}
              </div>
              <div className="hint">
                {formatLongDate(t.startDate)} – {formatLongDate(t.endDate)}
              </div>
              <div className="stats">
                <span>
                  Собрано {t.packedCount} из {t.totalCount}
                </span>
                {t.needToBuyCount > 0 ? <span>{t.needToBuyCount} нужно купить</span> : null}
              </div>
            </button>
          ))}
        </div>
      )}

      {done.length > 0 ? (
        <div className="card" style={{ marginTop: 14 }}>
          <h4>Завершённые поездки</h4>
          <div className="trip-list-compact">
            {done.map((t) => (
              <button
                type="button"
                key={t.id}
                className="trip-compact-row"
                onClick={() => navigate(`/travel/${t.id}`)}
              >
                <span>{t.name ?? t.city ?? t.country}</span>
                <span className="hint">{formatLongDate(t.startDate)}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="card travel-library" style={{ marginTop: 24 }}>
        <h4>
          <IconArchive />
          Мои вещи
          <span className="travel-lib-actions">
            <Button size="sm" variant="ghost" onClick={() => setImportOpen(true)}>
              Импорт
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setEditingItem(null);
                setAddItemOpen(true);
              }}
            >
              <IconPlus />
              Вещь
            </Button>
          </span>
        </h4>
        <p className="hint" style={{ marginBottom: 12 }}>
          Постоянная база: отсюда собираются чек-листы поездок.
        </p>
        {groups.map(({ category, items: catItems }) => (
          <div className="travel-lib-group" key={category.id}>
            <span className="lbl travel-lib-head">
              {category.name}
              <button
                type="button"
                className="row-del"
                aria-label={`Удалить категорию: ${category.name}`}
                title="Удалить категорию"
                onClick={() => setCategoryToDelete(category)}
              >
                <IconTrash />
              </button>
            </span>
            {catItems.length > 0 ? (
              <div className="chips">
                {catItems.map((it) => (
                  <button
                    key={it.id}
                    type="button"
                    className="chip travel-item-chip"
                    onClick={() => setEditingItem(it)}
                  >
                    {it.name}
                  </button>
                ))}
              </div>
            ) : (
              <span className="hint">Пусто</span>
            )}
          </div>
        ))}
        {uncategorized.length > 0 ? (
          <div className="travel-lib-group">
            <span className="lbl">Без категории</span>
            <div className="chips">
              {uncategorized.map((it) => (
                <button
                  key={it.id}
                  type="button"
                  className="chip travel-item-chip"
                  onClick={() => setEditingItem(it)}
                >
                  {it.name}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {groups.length === 0 && uncategorized.length === 0 ? (
          <p className="hint">Пока пусто.</p>
        ) : null}
      </div>

      <NewTripWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        onCreated={(tripId) => navigate(`/travel/${tripId}`)}
      />
      <ImportTravelItemsModal open={importOpen} onOpenChange={setImportOpen} />
      <Modal
        open={categoryToDelete !== null}
        onOpenChange={(v) => {
          if (!v) setCategoryToDelete(null);
        }}
        title={`Удалить категорию «${categoryToDelete?.name ?? ''}»?`}
        description="Вещи из неё не удалятся — они останутся в базе без категории."
        footer={
          <>
            <Button variant="ghost" onClick={() => setCategoryToDelete(null)}>
              Отмена
            </Button>
            <Button
              variant="primary"
              danger
              onClick={() => categoryToDelete && removeCategory.mutate(categoryToDelete.id)}
            >
              Удалить
            </Button>
          </>
        }
      />
      <TravelItemModal
        item={editingItem ?? undefined}
        open={addItemOpen || editingItem !== null}
        onOpenChange={(v) => {
          if (!v) {
            setAddItemOpen(false);
            setEditingItem(null);
          }
        }}
      />
    </>
  );
}
