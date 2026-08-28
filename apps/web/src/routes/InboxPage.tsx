import { useState } from 'react';
import { useMutation, useQueries, useQueryClient } from '@tanstack/react-query';
import { Button, EmptyState, IconPlus, IconSpark, Modal, PageHeader, useToast } from '@planner/ui';
import type { InboxProposal } from '@planner/contracts';
import { api } from '../api/client.js';
import { qk, useDirections, useInbox } from '../api/queries.js';
import { ErrorBox, Loading } from '../components/Loading.js';

const TYPES: [InboxProposal['type'], string][] = [
  ['task', 'Задача'],
  ['project', 'Проект'],
  ['reminder', 'Напоминание'],
  ['menu', 'Идея меню'],
  ['book', 'Книга'],
  ['film', 'Фильм или сериал'],
  ['note', 'Заметка в проект'],
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
  if (inbox.isError) return <ErrorBox error={inbox.error} />;

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
        <div style={{ maxWidth: 820 }}>
          {items.map((item) => (
            <InboxCard
              key={item.id}
              text={item.originalText}
              source={item.source}
              projects={projects.map((p) => ({
                id: p.id,
                title: p.title,
                directionName: directionName(p.directionId),
              }))}
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
            <div className="ai-card" data-off={!b.on} key={b.inboxItemId}>
              <label
                style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 8 }}
              >
                <input
                  type="checkbox"
                  checked={b.on}
                  style={{ width: 'auto', marginTop: 3 }}
                  onChange={() => patch(index, { on: !b.on })}
                />
                <span className="ai-src">
                  «{items.find((i) => i.id === b.inboxItemId)?.originalText}»
                </span>
              </label>
              <div className="inbox-grid" style={{ marginTop: 0 }}>
                <div className="ffield">
                  <span className="lbl">Тип</span>
                  <select
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
                </div>
                <div className="ffield" style={{ gridColumn: 'span 2' }}>
                  <span className="lbl">Формулировка</span>
                  <input
                    type="text"
                    value={b.text}
                    onChange={(e) => patch(index, { text: e.target.value })}
                  />
                </div>
                {b.type === 'task' || b.type === 'note' ? (
                  <div className="ffield" style={{ gridColumn: 'span 2' }}>
                    <span className="lbl">Проект</span>
                    <select
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
                  </div>
                ) : null}
                {b.type === 'reminder' ? (
                  <div className="ffield">
                    <span className="lbl">Когда</span>
                    <input
                      type="date"
                      value={b.remindAt ?? ''}
                      onChange={(e) => patch(index, { remindAt: e.target.value || null })}
                    />
                  </div>
                ) : null}
              </div>
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
  projects,
  onSave,
  onDelete,
}: {
  text: string;
  source: string;
  projects: { id: string; title: string; directionName: string }[];
  onSave: (proposal: Omit<InboxProposal, 'inboxItemId'> & { inboxItemId: string }) => void;
  onDelete: () => void;
}) {
  const [type, setType] = useState<InboxProposal['type']>('keep');
  const [value, setValue] = useState(text);
  const [projectId, setProjectId] = useState('');
  const [remindAt, setRemindAt] = useState('');

  return (
    <div className="inbox-item">
      <div className="inbox-txt">{text}</div>
      <div className="row-sub" style={{ marginTop: 6 }}>
        <span className="tag" style={source === 'telegram' ? { color: 'var(--tg)' } : undefined}>
          {source === 'telegram' ? 'Telegram' : 'приложение'}
        </span>
      </div>
      <div className="inbox-grid">
        <div className="ffield">
          <span className="lbl">Тип</span>
          <select value={type} onChange={(e) => setType(e.target.value as InboxProposal['type'])}>
            {TYPES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
        {type === 'task' || type === 'note' ? (
          <div className="ffield">
            <span className="lbl">Проект — определяет направление</span>
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">— выбери проект —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.directionName} · {p.title}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        {type === 'reminder' ? (
          <div className="ffield">
            <span className="lbl">Когда напомнить</span>
            <input type="date" value={remindAt} onChange={(e) => setRemindAt(e.target.value)} />
          </div>
        ) : null}
        <div className="ffield" style={{ gridColumn: '1/-1' }}>
          <span className="lbl">Формулировка</span>
          <input type="text" value={value} onChange={(e) => setValue(e.target.value)} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 7, marginTop: 14, flexWrap: 'wrap' }}>
        <Button
          size="sm"
          variant="primary"
          onClick={() =>
            onSave({
              inboxItemId: '',
              type,
              text: value,
              projectId: projectId || null,
              remindAt: remindAt || null,
            })
          }
        >
          Сохранить
        </Button>
        <Button size="sm" variant="ghost" danger onClick={onDelete}>
          Удалить
        </Button>
      </div>
    </div>
  );
}
