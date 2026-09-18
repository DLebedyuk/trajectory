import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, EmptyState, IconArchive, IconCalendar, IconPlus, PageHeader } from '@planner/ui';
import type { TravelItem } from '@planner/contracts';
import { formatLongDate } from '@planner/shared';
import { useTravelItems, useTrips } from '../api/queries.js';
import { ErrorBox, Loading } from '../components/Loading.js';
import { NewTripWizard } from '../features/NewTripWizard.js';
import { TravelItemModal } from '../features/TravelItemModal.js';

export function TravelPage() {
  const navigate = useNavigate();
  const trips = useTrips();
  const items = useTravelItems();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<TravelItem | null>(null);
  const [addItemOpen, setAddItemOpen] = useState(false);

  if (trips.isLoading || items.isLoading) return <Loading what="Загружаю поездки" />;
  if (trips.isError) return <ErrorBox error={trips.error} onRetry={() => void trips.refetch()} />;
  if (items.isError) return <ErrorBox error={items.error} onRetry={() => void items.refetch()} />;

  const upcoming = (trips.data ?? []).filter((t) => t.status === 'planning');
  const done = (trips.data ?? []).filter((t) => t.status === 'done');

  const groups = new Map<string, TravelItem[]>();
  for (const item of items.data ?? []) {
    const key = item.categoryName ?? 'Другое';
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }

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
        </h4>
        <p className="hint" style={{ marginBottom: 12 }}>
          Постоянная база: отсюда собираются чек-листы поездок.
        </p>
        {(items.data ?? []).length === 0 ? (
          <p className="hint">Пока пусто.</p>
        ) : (
          [...groups.entries()].map(([category, catItems]) => (
            <div className="travel-lib-group" key={category}>
              <span className="lbl">{category}</span>
              <div className="chips">
                {catItems.map((it) => (
                  <button
                    key={it.id}
                    type="button"
                    className="chip travel-item-chip"
                    onClick={() => setEditingItem(it)}
                  >
                    {it.name}
                    {it.alwaysInclude ? <span className="qty-tag"> · всегда</span> : null}
                  </button>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      <NewTripWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        onCreated={(tripId) => navigate(`/travel/${tripId}`)}
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
