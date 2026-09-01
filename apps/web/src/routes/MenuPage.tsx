import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  EmptyState,
  FormField,
  IconPlus,
  IconTrash,
  Modal,
  PageHeader,
  useToast,
} from '@planner/ui';
import { MENU_DEFAULTS, MENU_LABELS } from '@planner/contracts';
import { api } from '../api/client.js';
import { useMenu } from '../api/queries.js';
import { ErrorBox, Loading } from '../components/Loading.js';
import {
  MenuParamFields,
  menuParamsDefaults,
  type MenuParamsValue,
} from '../components/MenuParams.js';

// подписи и наборы значений живут в @planner/contracts — одно место на всё приложение
const ENERGY = MENU_LABELS.energy;
const TIME = MENU_LABELS.estimatedTime;
const COST = MENU_LABELS.cost;
const PLACE = MENU_LABELS.place;
const COMPANY = MENU_LABELS.company;
// фильтр по попробованности: значения уезжают в query строками
const TRIED = { false: 'ещё нет', true: 'уже да' };

export function MenuPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [filter, setFilter] = useState<Record<string, string | undefined>>({});
  const menu = useMenu(filter);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [params, setParams] = useState<MenuParamsValue>(() => ({
    ...menuParamsDefaults(),
    company: MENU_DEFAULTS.company,
  }));

  const create = useMutation({
    mutationFn: () =>
      api.menu.create({
        title,
        category: MENU_DEFAULTS.category,
        energy: params.energy,
        estimatedTime: params.estimatedTime,
        // раньше cost и place были зашиты в код и человек их не видел
        cost: params.cost,
        place: params.place,
        company: params.company ?? MENU_DEFAULTS.company,
        tried: false,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['menu'] });
      toast.show('Сохранено. Срока у этого нет.');
      setTitle('');
      setOpen(false);
    },
  });
  const toggleTried = useMutation({
    mutationFn: (vars: { id: string; tried: boolean }) =>
      api.menu.update(vars.id, { tried: !vars.tried }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['menu'] }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.menu.remove(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['menu'] });
      toast.show('Удалено из меню');
    },
  });

  if (menu.isLoading) return <Loading what="Загружаю меню" />;
  if (menu.isError) return <ErrorBox error={menu.error} />;

  const setF = (key: string, value: string) =>
    setFilter((prev) => ({ ...prev, [key]: prev[key] === value ? undefined : value }));

  const group = (key: string, options: Record<string, string>) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <span className="lbl">
        {key === 'tried'
          ? 'Пробовала'
          : key === 'energy'
            ? 'Энергия'
            : key === 'estimatedTime'
              ? 'Время'
              : key === 'cost'
                ? 'Стоимость'
                : key === 'place'
                  ? 'Место'
                  : 'Компания'}
      </span>
      <div className="chips">
        {Object.entries(options).map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={`chip${filter[key] === value ? ' is-active' : ''}`}
            aria-pressed={filter[key] === value}
            onClick={() => setF(key, value)}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <>
      <PageHeader
        title="Меню возможностей"
        subtitle="Приятное и необязательное. Идеи по направлениям становятся обычными задачами своих проектов."
        actions={
          <Button onClick={() => setOpen(true)}>
            <IconPlus />
            Добавить
          </Button>
        }
      />

      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 18 }}>
        {group('tried', TRIED)}
        {group('energy', ENERGY)}
        {group('estimatedTime', TIME)}
        {group('cost', COST)}
        {group('place', PLACE)}
        {group('company', COMPANY)}
      </div>

      {menu.data?.length === 0 ? (
        <EmptyState
          title="В меню пока пусто"
          description="Сюда попадает всё, что просто хочется. Без сроков и без обязательств."
          action={<Button onClick={() => setOpen(true)}>Добавить возможность</Button>}
        />
      ) : (
        <div className="menu-ideas">
          {(menu.data ?? []).map((m) => (
            <div className={`menu-idea${m.tried ? ' is-tried' : ''}`} key={m.id}>
              {/* метки категории на карточке больше нет: она ничего не
                  говорила о самой возможности и почти всегда была «другое» */}
              <div className="ttl">{m.title}</div>
              {m.comment ? <p className="hint">{m.comment}</p> : null}
              <div className="params">
                <span className="p">
                  <span className="lbl">Энергия</span>
                  {ENERGY[m.energy]}
                </span>
                <span className="p">
                  <span className="lbl">Время</span>
                  {TIME[m.estimatedTime]}
                </span>
                <span className="p">
                  <span className="lbl">Стоимость</span>
                  {COST[m.cost]}
                </span>
                <span className="p">
                  <span className="lbl">Место</span>
                  {PLACE[m.place]}
                </span>
                <span className="p">
                  <span className="lbl">Компания</span>
                  {COMPANY[m.company]}
                </span>
              </div>
              <div className="actions">
                <Button
                  size="sm"
                  variant={m.tried ? 'ghost' : undefined}
                  onClick={() => toggleTried.mutate({ id: m.id, tried: m.tried })}
                >
                  {m.tried ? 'Убрать отметку' : 'Попробовала'}
                </Button>
                <button
                  type="button"
                  className="row-del"
                  aria-label={`Удалить из меню: ${m.title}`}
                  title="Удалить"
                  onClick={() => remove.mutate(m.id)}
                >
                  <IconTrash />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={open}
        onOpenChange={setOpen}
        title="Новая возможность"
        description="У неё не будет дедлайна, приоритета и уведомления."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Отмена
            </Button>
            <Button variant="primary" disabled={!title.trim()} onClick={() => create.mutate()}>
              Сохранить
            </Button>
          </>
        }
      >
        <FormField label="Что хочется">
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} />
        </FormField>
        <MenuParamFields
          value={params}
          withCompany
          onChange={(changes) => setParams((prev) => ({ ...prev, ...changes }))}
        />
      </Modal>
    </>
  );
}
