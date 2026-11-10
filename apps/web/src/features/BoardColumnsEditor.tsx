import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, IconTrash, useToast } from '@planner/ui';
import type { Board, BoardColumn } from '@planner/contracts';
import { api } from '../api/client.js';
import { qk } from '../api/queries.js';

const MAX_COLUMNS = 8;

/**
 * Столбцы доски направления. «Готово» здесь не настраивается: это закрытые
 * задачи, и закрыть задачу можно только через окно касания. Всё, что до
 * него, — свои стадии: у озвучки «Долги / Сегодня / На фиксах».
 */
export function BoardColumnsEditor({
  directionId,
  columns,
}: {
  directionId: string;
  columns: BoardColumn[];
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [newTitle, setNewTitle] = useState('');
  const refresh = () => void qc.invalidateQueries({ queryKey: qk.board(directionId) });

  const create = useMutation({
    mutationFn: (title: string) => api.boardColumns.create(directionId, title),
    onSuccess: () => {
      setNewTitle('');
      refresh();
    },
    onError: () => toast.show('Не удалось добавить столбец'),
  });
  const rename = useMutation({
    mutationFn: (v: { id: string; title: string }) => api.boardColumns.rename(v.id, v.title),
    onSuccess: refresh,
    onError: () => toast.show('Не удалось переименовать столбец'),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.boardColumns.remove(id),
    onSuccess: refresh,
    onError: () => toast.show('Не удалось удалить столбец'),
  });
  const reorder = useMutation({
    mutationFn: (ids: string[]) => api.boardColumns.reorder(ids),
    // порядок — сразу на экране, при ошибке доска перечитается
    onMutate: (ids) => {
      const prev = qc.getQueryData<Board>(qk.board(directionId));
      if (prev) {
        const byId = new Map(prev.columns.map((c) => [c.id, c]));
        qc.setQueryData<Board>(qk.board(directionId), {
          ...prev,
          columns: ids.map((id, i) => ({ ...byId.get(id)!, sortOrder: i })),
        });
      }
    },
    onSettled: refresh,
    onError: () => toast.show('Не удалось поменять порядок'),
  });

  const move = (index: number, step: -1 | 1) => {
    const ids = columns.map((c) => c.id);
    const j = index + step;
    if (j < 0 || j >= ids.length) return;
    [ids[index], ids[j]] = [ids[j]!, ids[index]!];
    reorder.mutate(ids);
  };

  const add = () => {
    const title = newTitle.trim();
    if (title && !create.isPending) create.mutate(title);
  };

  return (
    <div className="board-columns-editor">
      {columns.length === 0 ? (
        <p className="hint">
          Сейчас у доски один столбец «К выполнению». Добавьте свои — например «Долги», «Сегодня»,
          «На фиксах».
        </p>
      ) : (
        <ol className="board-columns-list">
          {columns.map((c, i) => (
            <li key={c.id}>
              <input
                type="text"
                defaultValue={c.title}
                maxLength={40}
                aria-label={`Название столбца ${i + 1}`}
                onBlur={(e) => {
                  const title = e.target.value.trim();
                  if (!title) e.target.value = c.title;
                  else if (title !== c.title) rename.mutate({ id: c.id, title });
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur();
                }}
              />
              <button
                type="button"
                className="icon-btn"
                aria-label={`Выше: ${c.title}`}
                disabled={i === 0}
                onClick={() => move(i, -1)}
              >
                ↑
              </button>
              <button
                type="button"
                className="icon-btn"
                aria-label={`Ниже: ${c.title}`}
                disabled={i === columns.length - 1}
                onClick={() => move(i, 1)}
              >
                ↓
              </button>
              <button
                type="button"
                className="icon-btn"
                aria-label={`Удалить столбец: ${c.title}`}
                onClick={() => remove.mutate(c.id)}
              >
                <IconTrash />
              </button>
            </li>
          ))}
          <li className="is-fixed">
            <span>Готово</span>
            <span className="hint">закрытые задачи, есть всегда</span>
          </li>
        </ol>
      )}

      {columns.length < MAX_COLUMNS ? (
        <div className="board-columns-add">
          <input
            type="text"
            value={newTitle}
            maxLength={40}
            placeholder="Новый столбец"
            aria-label="Название нового столбца"
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') add();
            }}
          />
          <Button size="sm" disabled={!newTitle.trim() || create.isPending} onClick={add}>
            Добавить
          </Button>
        </div>
      ) : null}

      <p className="hint">
        Задачи, заведённые в проекте, и карточки удалённого столбца попадают в первый столбец.
      </p>
    </div>
  );
}
