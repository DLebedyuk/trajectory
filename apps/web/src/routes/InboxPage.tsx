import { useState, type ReactNode } from 'react';
import { useMutation, useQueries, useQueryClient } from '@tanstack/react-query';
import { Button, EmptyState, IconPlus, IconSpark, Modal, PageHeader, useToast } from '@planner/ui';
import type { InboxProposal } from '@planner/contracts';
import { MENU_DEFAULTS } from '@planner/contracts';
import { api } from '../api/client.js';
import { humanDate } from '@planner/shared';
import { qk, useDirections, useInbox } from '../api/queries.js';
import { ErrorBox, Loading } from '../components/Loading.js';
import {
  MenuParamFields,
  menuParamsDefaults,
  type MenuParamsValue,
} from '../components/MenuParams.js';

/**
 * Поле разбора. Подпись связана с полем через id: без этого её не найдёт
 * ни скринридер, ни тест — а строк тут много и все они похожи.
 */
function Field({
  label,
  id,
  wide = false,
  children,
}: {
  label: string;
  id: string;
  wide?: boolean;
  children: (id: string) => ReactNode;
}) {
  return (
    <div className="f" style={wide ? { gridColumn: '1 / -1' } : undefined}>
      <label htmlFor={id}>{label}</label>
      {children(id)}
    </div>
  );
}

const TYPES: [InboxProposal['type'], string][] = [
  ['task', 'Задача'],
  ['project', 'Проект'],
  ['reminder', 'Напоминание'],
  ['menu', 'Идея меню'],
  ['book', 'Книга'],
  ['film', 'Фильм или сериал'],
  ['keep', 'Оставить во входящих'],
];

export function InboxPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const inbox = useInbox();
  const directions = useDirections();
  const [batch, setBatch] = useState<(InboxProposal & { on: boolean })[] | null>(null);
  const [thought, setThought] = useState('');
  const [addOpen, setAddOpen] = useState(false);

  const projectQueries = useQueries({
    queries: (directions.data ?? []).map((d) => ({
      queryKey: ['inbox-projects', d.id],
      queryFn: () => api.projects.listByDirection(d.id),
    })),
  });
  const projects = projectQueries
    .flatMap((q) => q.data ?? [])
    .filter((p) => p.status !== 'archived');
  const directionName = (directionId: string): string =>
    directions.data?.find((d) => d.id === directionId)?.name ?? '';

  const propose = useMutation({
    mutationFn: () => api.inbox.propose(),
    onSuccess: (data) => setBatch(data.map((p) => ({ ...p, on: true }))),
  });
  const apply = useMutation({
    mutationFn: (proposals: InboxProposal[]) => api.inbox.apply(proposals),
    onSuccess: (result) => {
      void qc.invalidateQueries({ queryKey: qk.inbox });
      void qc.invalidateQueries({ queryKey: ['menu'] });
      void qc.invalidateQueries({ queryKey: ['media'] });
      void qc.invalidateQueries({ queryKey: qk.reminders });
      void qc.invalidateQueries({ queryKey: ['tasks'] });
      toast.show(
        `Применено: ${result.applied}${result.skipped.length ? `. Не хватило данных: ${result.skipped.length}` : ''}`,
      );
      if (result.skipped.length === 0) setBatch(null);
    },
  });
  const add = useMutation({
    mutationFn: () => api.inbox.create({ originalText: thought, source: 'web' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.inbox });
      setThought('');
      setAddOpen(false);
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.inbox.remove(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.inbox }),
  });
  const applyOne = useMutation({
    mutationFn: (proposal: InboxProposal) => api.inbox.apply([proposal]),
    onSuccess: (result) => {
      void qc.invalidateQueries({ queryKey: qk.inbox });
      toast.show(result.applied ? 'Разобрано' : (result.skipped[0]?.reason ?? 'Не удалось'));
    },
  });

  if (inbox.isLoading) return <Loading what="Загружаю входящие" />;
  if (inbox.isError) return <ErrorBox error={inbox.error} onRetry={() => void inbox.refetch()} />;

  const items = inbox.data ?? [];

  const patch = (index: number, changes: Partial<InboxProposal & { on: boolean }>) =>
    setBatch((prev) => prev?.map((p, i) => (i === index ? { ...p, ...changes } : p)) ?? null);

  return (
    <>
      <PageHeader
        title="Входящие"
        subtitle="Место для быстрой фиксации. Каждая запись — обычная редактируемая карточка."
        actions={
          <>
            <Button onClick={() => setAddOpen(true)}>
              <IconPlus />
              Мысль
            </Button>
            {/* записи приходят из Telegram — на случай, если апдейт задержался */}
            <Button size="sm" variant="ghost" onClick={() => void inbox.refetch()}>
              Обновить
            </Button>
            {items.length > 0 ? (
              <Button
                variant="primary"
                onClick={() => propose.mutate()}
                disabled={propose.isPending}
              >
                <IconSpark />
                Разобрать входящие с ИИ
              </Button>
            ) : null}
          </>
        }
      />

      {items.length === 0 ? (
        <EmptyState
          title="Входящие разобраны"
          description="Ничего не висит. Новые мысли можно кидать сюда из приложения или из Telegram."
          action={<Button onClick={() => setAddOpen(true)}>Записать мысль</Button>}
        />
      ) : (
        <div>
          {items.map((item) => (
            <InboxCard
              key={item.id}
              text={item.originalText}
              source={item.source}
              createdAt={item.createdAt}
              projects={projects.map((p) => ({
                id: p.id,
                title: p.title,
                directionName: directionName(p.directionId),
              }))}
              directions={(directions.data ?? []).map((d) => ({ id: d.id, name: d.name }))}
              onSave={(proposal) => applyOne.mutate({ ...proposal, inboxItemId: item.id })}
              onDelete={() => remove.mutate(item.id)}
            />
          ))}
        </div>
      )}

      <Modal
        open={Boolean(batch)}
        onOpenChange={(v) => !v && setBatch(null)}
        title="Так разобрать?"
        description="Ничего не сохранено. Поправь что угодно, сними галочки с лишнего."
        footer={
          <>
            <span className="hint" style={{ marginRight: 'auto' }}>
              Выбрано: {batch?.filter((b) => b.on).length ?? 0} из {batch?.length ?? 0}
            </span>
            <Button variant="ghost" onClick={() => setBatch(null)}>
              Отмена
            </Button>
            <Button
              variant="primary"
              onClick={() =>
                apply.mutate((batch ?? []).filter((b) => b.on).map(({ on: _on, ...rest }) => rest))
              }
            >
              Применить выбранное
            </Button>
          </>
        }
      >
        <div style={{ marginTop: 16 }}>
          {(batch ?? []).map((b, index) => (
            <div className="inbox-card is-ai" data-off={!b.on} key={b.inboxItemId}>
              <label className="ai-src-row">
                <input
                  type="checkbox"
                  checked={b.on}
                  onChange={() => patch(index, { on: !b.on })}
                />
                <span className="text">
                  «{items.find((i) => i.id === b.inboxItemId)?.originalText}»
                </span>
              </label>
              <div className="inbox-fields">
                <Field label="Тип" id={`ai-type-${b.inboxItemId}`}>
                  {(id) => (
                    <select
                      id={id}
                      value={b.type}
                      onChange={(e) =>
                        patch(index, { type: e.target.value as InboxProposal['type'] })
                      }
                    >
                      {TYPES.map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                  )}
                </Field>
                <Field label="Формулировка" id={`ai-text-${b.inboxItemId}`} wide>
                  {(id) => (
                    <input
                      id={id}
                      type="text"
                      value={b.text}
                      onChange={(e) => patch(index, { text: e.target.value })}
                    />
                  )}
                </Field>
                {b.type === 'task' ? (
                  <Field
                    label="Проект — он же задаёт направление"
                    id={`ai-project-${b.inboxItemId}`}
                    wide
                  >
                    {(id) => (
                      <select
                        id={id}
                        value={b.projectId ?? ''}
                        onChange={(e) => patch(index, { projectId: e.target.value || null })}
                      >
                        <option value="">— выбрать —</option>
                        {projects.map((p) => (
                          <option key={p.id} value={p.id}>
                            {directionName(p.directionId)} · {p.title}
                          </option>
                        ))}
                      </select>
                    )}
                  </Field>
                ) : null}
                {/* проект заводится внутри направления, и выбрать его должен
                    человек: раньше сервер молча брал первое попавшееся */}
                {b.type === 'project' ? (
                  <Field label="Направление" id={`ai-direction-${b.inboxItemId}`} wide>
                    {(id) => (
                      <select
                        id={id}
                        value={b.directionId ?? ''}
                        onChange={(e) => patch(index, { directionId: e.target.value || null })}
                      >
                        <option value="">— выбрать —</option>
                        {(directions.data ?? []).map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </Field>
                ) : null}
                {b.type === 'reminder' ? (
                  <>
                    <Field label="Когда" id={`ai-date-${b.inboxItemId}`}>
                      {(id) => (
                        <input
                          id={id}
                          type="date"
                          value={b.remindAt ?? ''}
                          onChange={(e) => patch(index, { remindAt: e.target.value || null })}
                        />
                      )}
                    </Field>
                    <Field label="Во сколько — если время важно" id={`ai-time-${b.inboxItemId}`}>
                      {(id) => (
                        <input
                          id={id}
                          type="time"
                          value={b.remindTime ?? ''}
                          onChange={(e) => patch(index, { remindTime: e.target.value || null })}
                        />
                      )}
                    </Field>
                  </>
                ) : null}
              </div>
              {b.type === 'menu' ? (
                <MenuParamFields
                  className="inbox-fields"
                  withCompany
                  value={{
                    energy: b.energy ?? MENU_DEFAULTS.energy,
                    estimatedTime: b.estimatedTime ?? MENU_DEFAULTS.estimatedTime,
                    cost: b.cost ?? MENU_DEFAULTS.cost,
                    place: b.place ?? MENU_DEFAULTS.place,
                    company: b.company ?? MENU_DEFAULTS.company,
                  }}
                  onChange={(changes) => patch(index, changes)}
                />
              ) : null}
              {b.note ? (
                <p className="hint" style={{ marginTop: 9 }}>
                  {b.note}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      </Modal>

      <Modal
        open={addOpen}
        onOpenChange={setAddOpen}
        title="Записать мысль"
        footer={
          <>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>
              Отмена
            </Button>
            <Button variant="primary" disabled={!thought.trim()} onClick={() => add.mutate()}>
              Сохранить
            </Button>
          </>
        }
      >
        <div className="field">
          <textarea rows={3} value={thought} onChange={(e) => setThought(e.target.value)} />
        </div>
      </Modal>
    </>
  );
}

function InboxCard({
  text,
  source,
  createdAt,
  projects,
  directions,
  onSave,
  onDelete,
}: {
  text: string;
  source: string;
  createdAt: string;
  projects: { id: string; title: string; directionName: string }[];
  directions: { id: string; name: string }[];
  onSave: (proposal: Omit<InboxProposal, 'inboxItemId'> & { inboxItemId: string }) => void;
  onDelete: () => void;
}) {
  const [type, setType] = useState<InboxProposal['type']>('keep');
  const [value, setValue] = useState(text);
  const [projectId, setProjectId] = useState('');
  const [directionId, setDirectionId] = useState('');
  const [remindAt, setRemindAt] = useState('');
  const [remindTime, setRemindTime] = useState('');
  const [menu, setMenu] = useState<MenuParamsValue>(() => ({
    ...menuParamsDefaults(),
    company: MENU_DEFAULTS.company,
  }));

  return (
    <div className="inbox-card">
      <div className="top">
        <span className="text">{text}</span>
        <span className="when mono">
          {humanDate(createdAt.slice(0, 10), createdAt.slice(0, 10))}
        </span>
      </div>

      <div className="meta">
        <span className={`badge${source === 'telegram' ? ' is-tg' : ''}`}>
          {source === 'telegram' ? 'Telegram' : 'приложение'}
        </span>
      </div>

      {/* тип выбирается чипами: длинный список в select не читается */}
      <div className="controls">
        {TYPES.map(([v, l]) => (
          <button
            key={v}
            type="button"
            className={`sel${type === v ? ' is-active' : ''}`}
            aria-pressed={type === v}
            onClick={() => setType(v)}
          >
            {l}
          </button>
        ))}
      </div>

      <div className="inbox-fields">
        <Field label="Формулировка" id={`text-${text}`} wide>
          {(id) => (
            <input id={id} type="text" value={value} onChange={(e) => setValue(e.target.value)} />
          )}
        </Field>
        {type === 'task' ? (
          <Field label="Проект — определяет направление" id={`project-${text}`} wide>
            {(id) => (
              <select id={id} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                <option value="">— выбери проект —</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.directionName} · {p.title}
                  </option>
                ))}
              </select>
            )}
          </Field>
        ) : null}
        {/* проект живёт внутри направления, и выбрать его должен человек:
            раньше сервер молча брал первое попавшееся */}
        {type === 'project' ? (
          <Field label="Направление — в нём заведётся проект" id={`direction-${text}`} wide>
            {(id) => (
              <select id={id} value={directionId} onChange={(e) => setDirectionId(e.target.value)}>
                <option value="">— выбери направление —</option>
                {directions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
        ) : null}
        {type === 'reminder' ? (
          <>
            <Field label="Когда напомнить" id={`date-${text}`}>
              {(id) => (
                <input
                  id={id}
                  type="date"
                  value={remindAt}
                  onChange={(e) => setRemindAt(e.target.value)}
                />
              )}
            </Field>
            <Field label="Во сколько — если время важно" id={`time-${text}`}>
              {(id) => (
                <input
                  id={id}
                  type="time"
                  value={remindTime}
                  onChange={(e) => setRemindTime(e.target.value)}
                />
              )}
            </Field>
          </>
        ) : null}
      </div>

      {type === 'menu' ? (
        <MenuParamFields
          className="inbox-fields"
          withCompany
          value={menu}
          onChange={(changes) => setMenu((prev) => ({ ...prev, ...changes }))}
        />
      ) : null}

      <div className="controls" style={{ marginTop: 10 }}>
        <button
          type="button"
          className="apply"
          onClick={() =>
            onSave({
              inboxItemId: '',
              type,
              text: value,
              projectId: projectId || null,
              directionId: directionId || null,
              remindAt: remindAt || null,
              remindTime: remindTime || null,
              // параметры меню уходят только для меню — иначе это лишние поля
              ...(type === 'menu' ? menu : {}),
            })
          }
        >
          Применить
        </button>
        <button type="button" className="del" onClick={onDelete}>
          Удалить
        </button>
      </div>
    </div>
  );
}
