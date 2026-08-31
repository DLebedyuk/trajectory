import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, EmptyState, IconPlus, PageHeader, useToast } from '@planner/ui';
import { formatLongDate, plural, todayInTimezone } from '@planner/shared';
import type { TouchWithContext } from '@planner/contracts';
import { api } from '../api/client.js';
import { useDashboard, useDirection, useTouches } from '../api/queries.js';
import { ErrorBox, Loading } from '../components/Loading.js';
import { TouchModal } from '../features/TouchModal.js';

/** Касания одного дня. Дата — заголовок, чтобы список читался сверху вниз. */
function DayGroup({
  date,
  items,
  onRemove,
}: {
  date: string;
  items: TouchWithContext[];
  onRemove: (id: string) => void;
}) {
  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <h4>
        {formatLongDate(date)}
        <span className="more">
          {items.length} {plural(items.length, 'касание', 'касания', 'касаний')}
        </span>
      </h4>
      {items.map((t) => (
        <div className="touch-item" key={t.id}>
          <span
            className="dir-glyph sm"
            style={{ ['--c' as string]: `var(${t.directionColor})` }}
            aria-hidden="true"
          >
            {t.directionName.charAt(0)}
          </span>
          <div className="info">
            <div className="ttl">{t.title}</div>
            <div className="meta">
              {t.directionName}
              {t.projectTitle ? ` · ${t.projectTitle}` : ''}
            </div>
            {/* комментарий — то, ради чего человек его писал; раньше он никуда не выводился */}
            {t.comment ? <p className="hint touch-comment">{t.comment}</p> : null}
          </div>
          <Button size="sm" variant="ghost" danger onClick={() => onRemove(t.id)}>
            Удалить
          </Button>
        </div>
      ))}
    </div>
  );
}

/**
 * Все касания — направления или вообще все. Отдельная страница, а не модалка:
 * сюда приходят читать историю, а не сделать одно действие и закрыть.
 */
export function TouchesPage() {
  const { directionId } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();

  const dashboard = useDashboard();
  const direction = useDirection(directionId ?? '');
  const touches = useTouches({ directionId, limit: 500 });
  const [touchOpen, setTouchOpen] = useState(false);

  const today = dashboard.data?.today ?? todayInTimezone('UTC');

  const remove = useMutation({
    mutationFn: (id: string) => api.touches.remove(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['touches'] });
      void qc.invalidateQueries({ queryKey: ['heatmap'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
      toast.show('Касание удалено');
    },
    onError: () => toast.show('Не удалось удалить касание'),
  });

  if (touches.isLoading) return <Loading what="Загружаю касания" />;
  if (touches.isError)
    return <ErrorBox error={touches.error} onRetry={() => void touches.refetch()} />;

  const list = touches.data ?? [];
  // сервер отдаёт по убыванию даты — сохраняем порядок, просто склеиваем дни
  const byDate: { date: string; items: TouchWithContext[] }[] = [];
  for (const t of list) {
    const last = byDate[byDate.length - 1];
    if (last && last.date === t.date) last.items.push(t);
    else byDate.push({ date: t.date, items: [t] });
  }

  const name = directionId ? (direction.data?.name ?? 'Направление') : null;

  return (
    <>
      <PageHeader
        onBack={() => navigate(directionId ? `/directions/${directionId}` : '/activity')}
        backLabel={name ?? 'Активность'}
        title="Все касания"
        subtitle={
          name
            ? `Каждый записанный факт работы по направлению «${name}».`
            : 'Каждый записанный факт работы, по всем направлениям.'
        }
        actions={
          <Button size="sm" variant="primary" onClick={() => setTouchOpen(true)}>
            <IconPlus />
            Касание
          </Button>
        }
      />

      {list.length === 0 ? (
        <EmptyState
          title="Касаний пока нет"
          description="Касание — это один факт осмысленной работы. Длительность не важна."
          action={<Button onClick={() => setTouchOpen(true)}>Записать первое</Button>}
        />
      ) : (
        byDate.map((g) => (
          <DayGroup
            key={g.date}
            date={g.date}
            items={g.items}
            onRemove={(id) => remove.mutate(id)}
          />
        ))
      )}

      <TouchModal
        open={touchOpen}
        onOpenChange={setTouchOpen}
        directionId={directionId}
        today={today}
      />
    </>
  );
}
