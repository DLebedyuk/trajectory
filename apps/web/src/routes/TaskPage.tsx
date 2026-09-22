import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  ConfirmModal,
  FormField,
  IconCheck,
  IconPin,
  IconPinFilled,
  IconPlus,
  IconTrash,
  Modal,
  PageHeader,
  useToast,
} from '@planner/ui';
import { api } from '../api/client.js';
import { invalidateFocusScope, qk, useDashboard, useTask, useTogglePin } from '../api/queries.js';
import { useCompleteTaskDialog } from '../features/CompleteTaskDialog.js';
import { ErrorBox, Loading } from '../components/Loading.js';

export function TaskPage() {
  const { taskId = '' } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const task = useTask(taskId);
  const dashboard = useDashboard();
  const { askComplete, dialog: completeDialog } = useCompleteTaskDialog();
  const togglePin = useTogglePin();

  const [title, setTitle] = useState('');
  const [deadline, setDeadline] = useState('');
  const [exactTime, setExactTime] = useState('');
  const [duration, setDuration] = useState('');
  const [remindAt, setRemindAt] = useState('');
  const [comment, setComment] = useState('');
  const [itemOpen, setItemOpen] = useState(false);
  const [itemText, setItemText] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => {
    if (!task.data) return;
    setTitle(task.data.title);
    setDeadline(task.data.deadline ?? '');
    setExactTime(task.data.exactTime ?? '');
    setDuration(task.data.estimatedDuration ?? '');
    setRemindAt(task.data.remindAt ?? '');
    setComment(task.data.comment ?? '');
  }, [task.data]);

  const save = useMutation({
    mutationFn: () =>
      api.tasks.update(taskId, {
        title,
        deadline: deadline || null,
        exactTime: exactTime || null,
        estimatedDuration: (duration || null) as 'short' | 'medium' | 'long' | null,
        remindAt: remindAt || null,
        comment: comment || null,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.task(taskId) });
      void qc.invalidateQueries({ queryKey: ['tasks'] });
      void qc.invalidateQueries({ queryKey: qk.dashboard });
      toast.show('Сохранено');
    },
  });

  const setActive = useMutation({
    mutationFn: () => api.tasks.activate(taskId),
    onSuccess: () => {
      invalidateFocusScope(qc);
      void qc.invalidateQueries({ queryKey: qk.task(taskId) });
      toast.show('Теперь это активная задача');
    },
  });
  const clearActive = useMutation({
    mutationFn: () => api.focus.clearActiveTask(),
    onSuccess: () => invalidateFocusScope(qc),
  });
  const remove = useMutation({
    mutationFn: () => api.tasks.remove(taskId),
    onSuccess: () => {
      invalidateFocusScope(qc);
      toast.show('Задача удалена');
      if (task.data) navigate(`/projects/${task.data.projectId}`);
    },
  });
  const addItem = useMutation({
    mutationFn: () => api.tasks.addChecklistItem(taskId, itemText),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.task(taskId) });
      setItemText('');
      setItemOpen(false);
    },
  });
  const toggleItem = useMutation({
    mutationFn: (vars: { itemId: string; completed: boolean }) =>
      api.tasks.updateChecklistItem(taskId, vars.itemId, { completed: !vars.completed }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.task(taskId) }),
  });
  const removeItem = useMutation({
    mutationFn: (itemId: string) => api.tasks.removeChecklistItem(taskId, itemId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.task(taskId) }),
  });
  const reopen = useMutation({
    mutationFn: () => api.tasks.reopen(taskId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.task(taskId) });
      void qc.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  if (task.isLoading) return <Loading what="Загружаю задачу" />;
  if (task.isError) return <ErrorBox error={task.error} onRetry={() => void task.refetch()} />;
  const t = task.data;
  if (!t) return null;
  const isActive = dashboard.data?.focus.activeTaskId === t.id;

  return (
    <>
      <PageHeader
        onBack={() => navigate(`/projects/${t.projectId}`)}
        backLabel={`К проекту «${t.projectTitle}»`}
        title={t.title}
        eyebrow={
          <span className="crumbs">
            <button type="button" onClick={() => navigate(`/directions/${t.directionId}`)}>
              {t.directionName}
            </button>
            <span className="sep">→</span>
            <button type="button" onClick={() => navigate(`/projects/${t.projectId}`)}>
              {t.projectTitle}
            </button>
            {isActive ? <span className="focus-state active">активная</span> : null}
            {t.pinned ? <span className="focus-state pinned">важная</span> : null}
          </span>
        }
        actions={
          <>
            <Button size="sm" onClick={() => togglePin.mutate({ taskId: t.id, pinned: t.pinned })}>
              {t.pinned ? <IconPinFilled /> : <IconPin />}
              {t.pinned ? 'Снять отметку' : 'Отметить важной'}
            </Button>
            {isActive ? (
              <Button size="sm" variant="ghost" onClick={() => clearActive.mutate()}>
                Убрать из активного
              </Button>
            ) : (
              <Button size="sm" onClick={() => setActive.mutate()}>
                Сделать активной
              </Button>
            )}
            {t.status === 'open' ? (
              <Button size="sm" variant="primary" onClick={() => askComplete(t.id, t.title)}>
                <IconCheck />
                Выполнена
              </Button>
            ) : (
              <Button size="sm" onClick={() => reopen.mutate()}>
                Вернуть в работу
              </Button>
            )}
          </>
        }
      />

      <div>
        <div className="card">
          <div className="task-fields">
            <div className="field full">
              <label htmlFor="task-title">Название</label>
              <input
                id="task-title"
                className="val"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="task-deadline">Дедлайн</label>
              <input
                id="task-deadline"
                className="val"
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="task-duration">Примерно займёт</label>
              <select
                id="task-duration"
                className="val"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
              >
                <option value="">не знаю</option>
                <option value="short">15 минут</option>
                <option value="medium">около часа</option>
                <option value="long">несколько часов</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="task-remind">Напоминание</label>
              <input
                id="task-remind"
                className="val"
                type="date"
                value={remindAt}
                onChange={(e) => setRemindAt(e.target.value)}
              />
            </div>
            <div className="field full">
              <label htmlFor="task-comment">Комментарий</label>
              <textarea
                id="task-comment"
                className="val"
                rows={3}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
            </div>
          </div>
          <div className="task-save">
            <Button variant="primary" onClick={() => save.mutate()} disabled={save.isPending}>
              Сохранить
            </Button>
            <span className="hint">Пустое напоминание — уведомления не будет.</span>
          </div>
        </div>

        <div className="card task-checklist">
          <h4>
            Чек-лист
            <Button size="sm" variant="ghost" onClick={() => setItemOpen(true)}>
              <IconPlus />
              Пункт
            </Button>
          </h4>
          {t.checklist.length > 0 ? (
            t.checklist.map((c) => (
              <div className="task-row" key={c.id}>
                <button
                  type="button"
                  className={`check${c.completed ? ' done' : ''}`}
                  aria-label={`Пункт: ${c.text}`}
                  aria-pressed={c.completed}
                  onClick={() => toggleItem.mutate({ itemId: c.id, completed: c.completed })}
                />
                <span className={`tname${c.completed ? ' done' : ''}`}>{c.text}</span>
                <button
                  type="button"
                  className="row-del"
                  aria-label={`Удалить пункт: ${c.text}`}
                  title="Удалить"
                  onClick={() => removeItem.mutate(c.id)}
                >
                  <IconTrash />
                </button>
              </div>
            ))
          ) : (
            <p className="hint">Пунктов нет. Чек-лист — часть одной задачи.</p>
          )}
        </div>

        {/*
          Удаление задачи стоит отдельно от всего остального: рядом с
          «Сохранить» его слишком легко нажать по инерции. Сам клик по кнопке
          ничего не удаляет — сначала подтверждение в модалке.
        */}
        <Button
          variant="ghost"
          danger
          style={{ marginTop: 16 }}
          onClick={() => setDeleteOpen(true)}
        >
          <IconTrash />
          Удалить задачу
        </Button>
      </div>

      <Modal
        open={itemOpen}
        onOpenChange={setItemOpen}
        title="Пункт чек-листа"
        footer={
          <>
            <Button variant="ghost" onClick={() => setItemOpen(false)}>
              Отмена
            </Button>
            <Button variant="primary" disabled={!itemText.trim()} onClick={() => addItem.mutate()}>
              Добавить
            </Button>
          </>
        }
      >
        <FormField label="Текст">
          <input type="text" value={itemText} onChange={(e) => setItemText(e.target.value)} />
        </FormField>
      </Modal>

      <ConfirmModal
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Удалить задачу?"
        description="Насовсем, вместе с чек-листом. Отменить будет нечем."
        pending={remove.isPending}
        onConfirm={() => remove.mutate()}
      />

      {completeDialog}
    </>
  );
}
