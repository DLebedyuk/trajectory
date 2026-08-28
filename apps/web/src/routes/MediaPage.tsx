import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  EmptyState,
  FormField,
  IconPin,
  IconPinFilled,
  IconPlus,
  Modal,
  PageHeader,
  useToast,
} from '@planner/ui';
import type { MediaItem } from '@planner/contracts';
import { api } from '../api/client.js';
import { qk, useMedia, useMediaCategories } from '../api/queries.js';
import { ErrorBox, Loading } from '../components/Loading.js';

const KIND_LABEL: Record<string, string> = { book: 'Книги', film: 'Фильмы', series: 'Сериалы' };

/** Полка без статусов: только категории и закрепление. Закреплять можно несколько. */
export function MediaPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const [tab, setTab] = useState<'book' | 'film'>('book');
  const [category, setCategory] = useState<string>('all');
  const [justPinned, setJustPinned] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [emoji, setEmoji] = useState('📗');

  // Сериалы живут на вкладке фильмов — по смыслу это одна полка.
  const media = useMedia();
  const categories = useMediaCategories();

  const togglePin = useMutation({
    mutationFn: (m: MediaItem) => (m.pinned ? api.media.unpin(m.id) : api.media.pin(m.id)),
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: ['media'] });
      void qc.invalidateQueries({ queryKey: qk.dashboard });
      setJustPinned(data.pinned ? data.id : null);
      toast.show(data.pinned ? 'Теперь перед глазами' : 'Откреплено');
      setTimeout(() => setJustPinned(null), 500);
    },
  });

  const create = useMutation({
    mutationFn: () =>
      api.media.create({
        kind: tab,
        title,
        authorOrDirector: author || null,
        categoryId: categoryId || null,
        coverEmoji: emoji,
        pinned: false,
        rating: 0,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['media'] });
      toast.show('Добавлено на полку');
      setTitle('');
      setAuthor('');
      setOpen(false);
    },
  });

  if (media.isLoading) return <Loading what="Загружаю полку" />;
  if (media.isError) return <ErrorBox error={media.error} />;

  const all = (media.data ?? []).filter((m) =>
    tab === 'book' ? m.kind === 'book' : m.kind !== 'book',
  );
  const pinned = all.filter((m) => m.pinned);
  const rest = all.filter((m) => !m.pinned && (category === 'all' || m.categoryId === category));
  const usedCategories = (categories.data ?? []).filter((c) =>
    all.some((m) => m.categoryId === c.id),
  );

  const card = (m: MediaItem, animate: boolean) => (
    <div className={animate ? 'mitem flyin' : 'mitem'} key={m.id}>
      <div style={{ position: 'relative' }}>
        <button
          type="button"
          className="cover"
          style={{
            background: `linear-gradient(155deg, color-mix(in srgb, var(--d-eng) 30%, transparent), color-mix(in srgb, var(--d-act) 14%, transparent))`,
          }}
          onClick={() => navigate(`/media/${m.id}`)}
          aria-label={`Открыть «${m.title}»`}
        >
          <span className="em">{m.coverEmoji ?? '📘'}</span>
        </button>
        <button
          type="button"
          className="pinfab"
          data-on={m.pinned}
          aria-label={m.pinned ? `Открепить «${m.title}»` : `Закрепить «${m.title}»`}
          onClick={() => togglePin.mutate(m)}
        >
          {m.pinned ? <IconPinFilled /> : <IconPin />}
        </button>
      </div>
      <div>
        <div className="mtitle">{m.title}</div>
        <div className="mauthor">{m.authorOrDirector}</div>
        <div className="quiet" style={{ marginTop: 4 }}>
          {m.categoryName ?? ''}
        </div>
      </div>
    </div>
  );

  return (
    <>
      <PageHeader
        title="Книги и фильмы"
        subtitle="Полка. Никаких статусов и сроков — только категории и то, что сейчас перед глазами."
        actions={
          <Button variant="primary" onClick={() => setOpen(true)}>
            <IconPlus />
            {tab === 'book' ? 'Книга' : 'Фильм'}
          </Button>
        }
      />

      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 18 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <span className="lbl">Раздел</span>
          <div className="chips">
            <button
              type="button"
              className="chip"
              data-on={tab === 'book'}
              onClick={() => setTab('book')}
            >
              Книги
            </button>
            <button
              type="button"
              className="chip"
              data-on={tab === 'film'}
              onClick={() => setTab('film')}
            >
              Фильмы и сериалы
            </button>
          </div>
        </div>
        {usedCategories.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span className="lbl">Категория</span>
            <div className="chips">
              <button
                type="button"
                className="chip"
                data-on={category === 'all'}
                onClick={() => setCategory('all')}
              >
                все
              </button>
              {usedCategories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="chip"
                  data-on={category === c.id}
                  onClick={() => setCategory(c.id)}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {all.length === 0 ? (
        <EmptyState
          title="Полка пуста"
          description="Добавь то, что хочется прочитать или посмотреть — без всякого срока."
          action={<Button onClick={() => setOpen(true)}>Добавить</Button>}
        />
      ) : (
        <>
          <div style={{ marginBottom: 26 }}>
            <div className="sec-h">
              <span className="lbl">{tab === 'book' ? 'Сейчас читаю' : 'Сейчас смотрю'}</span>
            </div>
            {pinned.length > 0 ? (
              <div className="mediagrid mg-pinned">
                {pinned.map((m) => card(m, justPinned === m.id))}
              </div>
            ) : (
              <p className="hint">
                Ничего не закреплено. Нажми на булавку на обложке, чтобы держать это перед глазами.
              </p>
            )}
          </div>
          <div className="sec-h">
            <span className="lbl">Вся полка</span>
          </div>
          {rest.length > 0 ? (
            <div className="mediagrid mg-all">{rest.map((m) => card(m, false))}</div>
          ) : (
            <p className="hint">В этой категории пусто.</p>
          )}
        </>
      )}

      <Modal
        open={open}
        onOpenChange={setOpen}
        title="Добавить на полку"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Отмена
            </Button>
            <Button variant="primary" disabled={!title.trim()} onClick={() => create.mutate()}>
              Добавить
            </Button>
          </>
        }
      >
        <FormField label="Название">
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} />
        </FormField>
        <div className="cols2">
          <FormField label={tab === 'book' ? 'Автор' : 'Режиссёр'}>
            <input type="text" value={author} onChange={(e) => setAuthor(e.target.value)} />
          </FormField>
          <FormField label="Категория">
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">без категории</option>
              {(categories.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </FormField>
        </div>
        <FormField label="Обложка">
          <div className="chips">
            {(tab === 'book' ? ['📗', '📕', '📘', '📙'] : ['🎬', '🎞️', '🎥', '📺']).map((e) => (
              <button
                key={e}
                type="button"
                className="chip"
                data-on={emoji === e}
                onClick={() => setEmoji(e)}
              >
                {e}
              </button>
            ))}
          </div>
        </FormField>
        <p className="hint" style={{ marginTop: 10 }}>
          Раздел: {KIND_LABEL[tab]}. Статусов чтения нет — потом просто закрепи то, что читаешь.
        </p>
      </Modal>
    </>
  );
}
