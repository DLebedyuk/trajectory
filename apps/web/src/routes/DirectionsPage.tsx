import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueries, useQueryClient } from '@tanstack/react-query';
import { Button, FormField, Heatmap, IconPlus, Modal, PageHeader, useToast } from '@planner/ui';
import { DURATION_LABEL, formatLongDate, todayInTimezone } from '@planner/shared';
import { api } from '../api/client.js';
import { qk, useDashboard, useDirections } from '../api/queries.js';
import { Glyph } from '../components/Glyph.js';
import { ErrorBox, Loading } from '../components/Loading.js';

/**
 * Направления — широкие горизонтальные плашки: слева карта касаний,
 * справа закреплённые задачи вместе с их проектами.
 */
export function DirectionsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const directions = useDirections();
  const dashboard = useDashboard();
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');

  const today = dashboard.data?.today ?? todayInTimezone('UTC');

  const perDirection = useQueries({
    queries: (directions.data ?? []).flatMap((d) => [
      { queryKey: qk.heatmap(26, d.id), queryFn: () => api.touches.heatmap(26, d.id) },
      { queryKey: qk.pinnedTasks(d.id), queryFn: () => api.tasks.pinned(d.id) },
    ]),
  });

  const create = useMutation({
    mutationFn: () =>
      // motto/showMotto — легаси-поля: девизы убраны из интерфейса,
      // данные в БД пока остаются, но новые направления их не показывают
      api.directions.create({ name, color: '--d-eng', icon: 'spark', showMotto: false }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.directions });
      toast.show('Направление создано');
      setName('');
      setCreateOpen(false);
    },
  });

  if (directions.isLoading) return <Loading what="Загружаю направления" />;
  if (directions.isError) return <ErrorBox error={directions.error} />;

  return (
    <>
      <PageHeader
        title="Направления"
        subtitle="Проекты и задачи живут внутри направлений."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <IconPlus />
            Новое направление
          </Button>
        }
      />

      {(directions.data ?? []).map((d, index) => {
        const heat = perDirection[index * 2]?.data as { days: never[] } | undefined;
        const pinned = (perDirection[index * 2 + 1]?.data ?? []) as {
          id: string;
          title: string;
          projectTitle: string;
          deadline: string | null;
          estimatedDuration: 'short' | 'medium' | 'long' | null;
        }[];
        const isFocus = dashboard.data?.focus.focusDirectionId === d.id;
        return (
          <div className="dirrow" key={d.id}>
            <button
              className="dirrow-l"
              type="button"
              onClick={() => navigate(`/directions/${d.id}`)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                <Glyph name={d.name} color={d.color} />
                <span style={{ fontFamily: 'Literata, serif', fontSize: 18 }}>{d.name}</span>
                {isFocus ? (
                  <span className="quiet" style={{ marginLeft: 6 }}>
                    в фокусе
                  </span>
                ) : null}
              </div>

              <Heatmap
                days={heat?.days ?? []}
                today={today}
                weeks={26}
                cell={12}
                gap={3}
                showWeekdays={false}
              />
            </button>
            <div className="dirrow-r">
              {pinned.length > 0 ? (
                <>
                  <span className="lbl">Закреплено</span>
                  {pinned.slice(0, 4).map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className="dirpin"
                      onClick={() => navigate(`/tasks/${t.id}`)}
                    >
                      <div className="pc-proj">{t.projectTitle}</div>
                      <div className="pc-task">{t.title}</div>
                      <div className="pc-meta">
                        {t.deadline
                          ? `до ${formatLongDate(t.deadline)}`
                          : t.estimatedDuration
                            ? DURATION_LABEL[t.estimatedDuration]
                            : ''}
                      </div>
                    </button>
                  ))}
                </>
              ) : (
                <span className="quiet">Ничего не закреплено.</span>
              )}
            </div>
          </div>
        );
      })}

      <Modal
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Новое направление"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Отмена
            </Button>
            <Button variant="primary" disabled={!name.trim()} onClick={() => create.mutate()}>
              Создать
            </Button>
          </>
        }
      >
        <FormField label="Название">
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
        </FormField>
      </Modal>
    </>
  );
}
