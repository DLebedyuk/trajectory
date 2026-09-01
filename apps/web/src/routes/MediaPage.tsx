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
import { MEDIA_STATUS_LABELS, mediaStatus } from '@planner/contracts';
import { api } from '../api/client.js';
import { qk, useMedia, useMediaCategories } from '../api/queries.js';
import { ErrorBox, Loading } from '../components/Loading.js';

const KIND_LABEL: Record<string, string> = { book: 'Книги', film: 'Фильмы', series: 'Сериалы' };

/** Вкладки полки: подписи зависят от вида, значения — общие. */
const STATUS_TABS = [
  { value: null, book: 'Всё', film: 'Всё' },
  { value: 'want' as const, book: 'Хочу прочитать', film: 'Хочу посмотреть' },
  { value: 'doing' as const, book: 'Читаю', film: 'Смотрю' },
  { value: 'done' as const, book: 'Прочитано', film: 'Просмотрено' },
];

const STATUS_CLASS: Record<'want' | 'doing' | 'done', string> = {
  want: 'want',
  doing: 'now',
  done: 'done',
};

export function MediaPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const [tab, setTab] = useState<'book' | 'film'>('book');
  const [category, setCategory] = useState<string>('all');
  const [statusTab, setStatusTab] = useState<'want' | 'doing' | 'done' | null>(null);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [newGenre, setNewGenre] = useState('');
  const [emoji, setEmoji] = useState('📗');

  // Сериалы живут на вкладке фильмов — по смыслу это одна полка.
  const media = useMedia();
  const categories = useMediaCategories();

  const setStatus = useMutation({
    mutationFn: (v: { id: string; status: 'want' | 'doing' | 'done' }) =>
      api.media.update(v.id, { status: v.status }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['media'] });
      void qc.invalidateQueries({ queryKey: qk.dashboard });
    },
    onError: () => toast.show('Не удалось поменять статус'),
  });

  const togglePin = useMutation({
    mutationFn: (m: MediaItem) => (m.pinned ? api.media.unpin(m.id) : api.media.pin(m.id)),
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: ['media'] });
      void qc.invalidateQueries({ queryKey: qk.dashboard });
      toast.show(data.pinned ? 'Теперь перед глазами' : 'Откреплено');
    },
  });

  /*
    Жанр можно завести прямо здесь: раньше ручка создания жанра существовала
    в API, но нигде не вызывалась — на пустой полке жанр было не из чего
    выбрать и фильтровать оказывалось нечего.
  */
  const create = useMutation({
    mutationFn: async () => {
      let genreId = categoryId || null;
      if (categoryId === 'new' && newGenre.trim()) {
        genreId = (await api.media.createCategory(newGenre.trim())).id;
      } else if (categoryId === 'new') {
        genreId = null;
      }
      return api.media.create({
        kind: tab,
        title,
        authorOrDirector: author || null,
        categoryId: genreId,
        status: 'want',
        coverEmoji: emoji,
        pinned: false,
        rating: 0,
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['media'] });
      void qc.invalidateQueries({ queryKey: qk.mediaCategories });
      toast.show('Добавлено на полку');
      setTitle('');
      setAuthor('');
      setNewGenre('');
      setCategoryId('');
      setOpen(false);
    },
  });

  if (media.isLoading) return <Loading what="Загружаю полку" />;
  if (media.isError) return <ErrorBox error={media.error} />;

  const all = (media.data ?? []).filter((m) =>
    tab === 'book' ? m.kind === 'book' : m.kind !== 'book',
  );
  // жанр фильтрует и карточки, и счётчики на вкладках: иначе вкладка обещала
  // «Всё 5», а под ней лежала одна книга
  const byGenre = all.filter(
    (m) =>
      category === 'all' ||
      (category === 'none' ? m.categoryId === null : m.categoryId === category),
  );
  const shelf = byGenre.filter((m) => statusTab === null || m.status === statusTab);
  /*
    Раньше набор жанров собирался только из того, что уже стоит на полке:
    пока ни одной книге жанр не проставлен, весь фильтр просто не появлялся.
    Показываем все заведённые жанры, а «без жанра» — только если такие есть.
  */
  const genres = categories.data ?? [];
  const hasUngrouped = all.some((m) => !m.categoryId);

  const card = (m: MediaItem) => (
    <div className="media-card" key={m.id}>
      <button
        type="button"
        className="cover"
        style={{ ['--c' as string]: `var(${m.kind === 'book' ? '--d-eng' : '--d-vocal'})` }}
        onClick={() => navigate(`/media/${m.id}`)}
        aria-label={`Открыть «${m.title}»`}
      >
        {/* буква вместо эмодзи: эмодзи в каждой системе выглядит по-своему */}
        {m.title.charAt(0)}
      </button>

      <div className="top-row">
        <span className={`status-badge ${STATUS_CLASS[m.status]}`}>
          {MEDIA_STATUS_LABELS[m.kind][m.status]}
        </span>
        <button
          type="button"
          className={`pin${m.pinned ? ' is-pinned' : ''}`}
          aria-label={m.pinned ? `Открепить «${m.title}»` : `Закрепить «${m.title}»`}
          onClick={() => togglePin.mutate(m)}
        >
          {m.pinned ? <IconPinFilled /> : <IconPin />}
        </button>
      </div>

      <div className="ttl">{m.title}</div>
      {m.authorOrDirector ? <div className="author">{m.authorOrDirector}</div> : null}

      <div className="cat-row">
        {m.categoryName ? <span className="cat">{m.categoryName}</span> : null}
        {m.rating > 0 ? <span className="rating">{'★'.repeat(m.rating)}</span> : null}
      </div>

      {/* статус меняется прямо на полке: ради одного переключения незачем
          открывать карточку */}
      <div className="chips">
        {mediaStatus.options.map((value) => (
          <button
            key={value}
            type="button"
            className={`chip${m.status === value ? ' is-active' : ''}`}
            aria-pressed={m.status === value}
            onClick={() => setStatus.mutate({ id: m.id, status: value })}
          >
            {MEDIA_STATUS_LABELS[m.kind][value]}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <>
      <PageHeader
        title="Книги и фильмы"
        subtitle="Полка. Сроков нет — только состояние: хочу, в процессе, закончила."
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
              className={`chip${tab === 'book' ? ' is-active' : ''}`}
              aria-pressed={tab === 'book'}
              onClick={() => setTab('book')}
            >
              Книги
            </button>
            <button
              type="button"
              className={`chip${tab === 'film' ? ' is-active' : ''}`}
              aria-pressed={tab === 'film'}
              onClick={() => setTab('film')}
            >
              Фильмы и сериалы
            </button>
          </div>
        </div>
        {genres.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span className="lbl">Жанр</span>
            <div className="chips">
              <button
                type="button"
                className={`chip${category === 'all' ? ' is-active' : ''}`}
                aria-pressed={category === 'all'}
                onClick={() => setCategory('all')}
              >
                все
              </button>
              {genres.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`chip${category === c.id ? ' is-active' : ''}`}
                  aria-pressed={category === c.id}
                  onClick={() => setCategory(c.id)}
                >
                  {c.name}
                </button>
              ))}
              {hasUngrouped ? (
                <button
                  type="button"
                  className={`chip${category === 'none' ? ' is-active' : ''}`}
                  aria-pressed={category === 'none'}
                  onClick={() => setCategory('none')}
                >
                  без жанра
                </button>
              ) : null}
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
          <div className="media-tabs" role="tablist">
            {STATUS_TABS.map((t) => {
              const count = byGenre.filter((m) => (t.value ? m.status === t.value : true)).length;
              return (
                <button
                  key={t.value ?? 'all'}
                  type="button"
                  role="tab"
                  aria-selected={statusTab === t.value}
                  className={`tab${statusTab === t.value ? ' is-active' : ''}`}
                  onClick={() => setStatusTab(t.value)}
                >
                  {tab === 'book' ? t.book : t.film}
                  <span className="ct mono">{count}</span>
                </button>
              );
            })}
          </div>

          {shelf.length > 0 ? (
            <div className="media-shelf">{shelf.map((m) => card(m))}</div>
          ) : (
            <p className="hint">Здесь пока пусто.</p>
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
          <FormField label="Жанр">
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">без жанра</option>
              {(categories.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
              <option value="new">+ новый жанр</option>
            </select>
          </FormField>
        </div>
        {categoryId === 'new' ? (
          <FormField label="Название жанра">
            <input
              type="text"
              value={newGenre}
              onChange={(e) => setNewGenre(e.target.value)}
              placeholder="например, детектив"
            />
          </FormField>
        ) : null}
        <FormField label="Обложка">
          <div className="chips">
            {(tab === 'book' ? ['📗', '📕', '📘', '📙'] : ['🎬', '🎞️', '🎥', '📺']).map((e) => (
              <button
                key={e}
                type="button"
                className={`chip${emoji === e ? ' is-active' : ''}`}
                aria-pressed={emoji === e}
                onClick={() => setEmoji(e)}
              >
                {e}
              </button>
            ))}
          </div>
        </FormField>
        <p className="hint" style={{ marginTop: 10 }}>
          Раздел: {KIND_LABEL[tab]}. Попадёт в «{MEDIA_STATUS_LABELS[tab].want.toLowerCase()}» —
          статус можно поменять прямо на полке.
        </p>
      </Modal>
    </>
  );
}
