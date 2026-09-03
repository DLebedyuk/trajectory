import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueries, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  DEFAULT_DIRECTION_COLOR,
  DIRECTION_COLORS,
  FormField,
  Heatmap,
  IconPlus,
  Modal,
  PageHeader,
  useToast,
} from '@planner/ui';
import { formatLongDate, plural, todayInTimezone } from '@planner/shared';
import { api } from '../api/client.js';
import { qk, useDashboard, useDirections, usePinnedProjects } from '../api/queries.js';
import { ErrorBox, Loading } from '../components/Loading.js';

/**
 * Направления — широкие плашки: слева имя и статистика, в середине карта
 * касаний, справа закреплённый проект направления.
 */
export function DirectionsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const directions = useDirections();
  const dashboard = useDashboard();
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [color, setColor] = useState(DEFAULT_DIRECTION_COLOR);

  const today = dashboard.data?.today ?? todayInTimezone('UTC');

  // карта касаний — на каждое направление свой запрос; закреплённые проекты
  // приезжают одним списком, по одному на направление
  const heatmaps = useQueries({
    queries: (directions.data ?? []).map((d) => ({
      queryKey: qk.heatmap(26, d.id),
      queryFn: () => api.touches.heatmap(26, d.id),
    })),
  });
  const pinnedProjects = usePinnedProjects();

  const create = useMutation({
    mutationFn: () =>
      // motto/showMotto — легаси-поля: девизы убраны из интерфейса,
      // данные в БД пока остаются, но новые направления их не показывают
      api.directions.create({ name, color, icon: 'spark', showMotto: false, notes: [] }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.directions });
      toast.show('Направление создано');
      setName('');
      setCreateOpen(false);
    },
  });

  if (directions.isLoading) return <Loading what="Загружаю направления" />;
  if (directions.isError)
    return <ErrorBox error={directions.error} onRetry={() => void directions.refetch()} />;

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
        const heat = heatmaps[index]?.data as
          | { days: never[]; total?: number; weekTotal?: number }
          | undefined;
        const pinned = (pinnedProjects.data ?? []).find((p) => p.directionId === d.id) ?? null;
        const isFocus = dashboard.data?.focus.focusDirectionId === d.id;
        const total = heat?.total ?? 0;

        return (
          /*
            Кликается вся плашка целиком, включая карту касаний: человек
            воспринимает её как одну карточку направления. Клавиатурная
            точка входа остаётся на кнопке с названием — вложенных кнопок
            в разметке нет, поэтому карта здесь просто div.
          */
          <div className="dir-list-row" key={d.id} onClick={() => navigate(`/directions/${d.id}`)}>
            <div className="left-cell">
              <span
                className="dir-glyph lg"
                style={{ ['--c' as string]: `var(${d.color})` }}
                aria-hidden="true"
              >
                {d.name.charAt(0)}
              </span>
              <div className="info">
                <div className="nm">
                  <button type="button" onClick={() => navigate(`/directions/${d.id}`)}>
                    {d.name}
                  </button>
                  {isFocus ? <span className="focus-badge">в фокусе</span> : null}
                </div>
                <div className="stats">
                  {total} {plural(total, 'касание', 'касания', 'касаний')} · за неделю{' '}
                  {heat?.weekTotal ?? 0}
                </div>
              </div>
            </div>

            <div className="map-cell scroll-x">
              <Heatmap
                days={heat?.days ?? []}
                today={today}
                weeks={26}
                cell={11}
                gap={3}
                showWeekdays={false}
              />
            </div>

            {/* закреплённый проект направления — он же показывается на главной,
                когда это направление в фокусе */}
            <div className="pinned-cell">
              <span className="lbl">Закреплённый проект</span>
              {pinned ? (
                <button
                  type="button"
                  className="pt"
                  onClick={(e) => {
                    // иначе клик уйдёт наверх и вместо проекта откроется направление
                    e.stopPropagation();
                    navigate(`/projects/${pinned.id}`);
                  }}
                >
                  <i className="dir-dot" style={{ ['--c' as string]: `var(${d.color})` }} />
                  <span>
                    {pinned.title}
                    {pinned.deadline ? (
                      <small> · до {formatLongDate(pinned.deadline)}</small>
                    ) : null}
                  </span>
                </button>
              ) : (
                <span className="more">Ничего не закреплено.</span>
              )}
            </div>
          </div>
        );
      })}

      <Modal
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Новое направление"
        description="Цвет станет акцентом всего приложения, когда направление окажется в фокусе."
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
        <div className="field">
          <span className="lbl">Цвет</span>
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
      </Modal>
    </>
  );
}
