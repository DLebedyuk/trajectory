import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  ConfirmModal,
  FormField,
  IconPin,
  IconPinFilled,
  PageHeader,
  useToast,
} from '@planner/ui';
import { api } from '../api/client.js';
import { qk, useMediaCategories, useMediaItem } from '../api/queries.js';
import { ErrorBox, Loading } from '../components/Loading.js';

export function MediaItemPage() {
  const { mediaId = '' } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const item = useMediaItem(mediaId);
  const categories = useMediaCategories();

  const [categoryId, setCategoryId] = useState('');
  const [comment, setComment] = useState('');
  const [link, setLink] = useState('');
  const [startedAt, setStartedAt] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => {
    if (!item.data) return;
    setCategoryId(item.data.categoryId ?? '');
    setComment(item.data.comment ?? '');
    setLink(item.data.link ?? '');
    setStartedAt(item.data.startedAt ?? '');
  }, [item.data]);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: qk.mediaItem(mediaId) });
    void qc.invalidateQueries({ queryKey: ['media'] });
    void qc.invalidateQueries({ queryKey: qk.dashboard });
  };

  const save = useMutation({
    mutationFn: () =>
      api.media.update(mediaId, {
        categoryId: categoryId || null,
        comment: comment || null,
        link: link || null,
        startedAt: startedAt || null,
      }),
    onSuccess: () => {
      refresh();
      toast.show('Сохранено');
    },
  });
  const rate = useMutation({
    mutationFn: (rating: number) => api.media.update(mediaId, { rating }),
    onSuccess: refresh,
  });
  const togglePin = useMutation({
    mutationFn: () => (item.data?.pinned ? api.media.unpin(mediaId) : api.media.pin(mediaId)),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: () => api.media.remove(mediaId),
    onSuccess: () => {
      refresh();
      toast.show('Удалено');
      navigate('/media');
    },
  });

  if (item.isLoading) return <Loading what="Загружаю" />;
  if (item.isError) return <ErrorBox error={item.error} />;
  const m = item.data;
  if (!m) return null;

  return (
    <>
      <PageHeader
        onBack={() => navigate('/media')}
        backLabel="Книги и фильмы"
        title={m.title}
        subtitle={m.authorOrDirector}
      />
      <div style={{ display: 'flex', gap: 26, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ width: 170, flex: 'none' }}>
          <div
            className="cover"
            style={{
              cursor: 'default',
              background:
                'linear-gradient(155deg, color-mix(in srgb, var(--d-eng) 30%, transparent), color-mix(in srgb, var(--d-act) 14%, transparent))',
            }}
          >
            <span className="em">{m.coverEmoji ?? '📘'}</span>
          </div>
          <Button
            size="sm"
            style={{ marginTop: 10, width: '100%', justifyContent: 'center' }}
            onClick={() => togglePin.mutate()}
          >
            {m.pinned ? <IconPinFilled /> : <IconPin />}
            {m.pinned ? 'Открепить' : 'Закрепить'}
          </Button>
        </div>
        <div style={{ flex: 1, minWidth: 280, maxWidth: 540 }}>
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
          <FormField label="Комментарий">
            <textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} />
          </FormField>
          <div className="cols2">
            <FormField label="Ссылка">
              <input
                type="text"
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder="https://"
              />
            </FormField>
            <FormField label="Начала">
              <input type="date" value={startedAt} onChange={(e) => setStartedAt(e.target.value)} />
            </FormField>
          </div>
          <div className="field">
            <span className="lbl">Оценка</span>
            <div className="chips">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  className="chip"
                  data-on={m.rating === n}
                  onClick={() => rate.mutate(n)}
                >
                  {n}
                </button>
              ))}
              {m.rating ? (
                <button type="button" className="chip" onClick={() => rate.mutate(0)}>
                  снять
                </button>
              ) : null}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
            <Button size="sm" variant="primary" onClick={() => save.mutate()}>
              Сохранить
            </Button>
            <Button size="sm" variant="ghost" danger onClick={() => setDeleteOpen(true)}>
              Удалить
            </Button>
          </div>
        </div>
      </div>

      <ConfirmModal
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Удалить «${m.title}»?`}
        pending={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
    </>
  );
}
