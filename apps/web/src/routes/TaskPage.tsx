import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Checkbox,
  FormField,
  IconCheck,
  IconPin,
  IconPinFilled,
  IconPlus,
  Modal,
  PageHeader,
  useToast,
} from '@planner/ui';
import { api } from '../api/client.js';
import {
  invalidateFocusScope,
  qk,
  useCompleteTask,
  useDashboard,
  useTask,
  useTogglePin,
} from '../api/queries.js';
import { ErrorBox, Loading } from '../components/Loading.js';

export function TaskPage() {
  const { taskId = '' } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const task = useTask(taskId);
  const dashboard = useDashboard();
  const completeTask = useCompleteTask();
  const togglePin = useTogglePin();

  const [title, setTitle] = useState('');
  const [deadline, setDeadline] = useState('');
  const [exactTime, setExactTime] = useState('');
  const [duration, setDuration] = useState('');
  const [remindAt, setRemindAt] = useState('');
  const [comment, setComment] = useState('');
  const [itemOpen, setItemOpen] = useState(false);
  const [itemText, setItemText] = useState('');

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
  if (task.isError) return <ErrorBox error={task.error} />;
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
          <div className="quiet">
            <button type="button" onClick={() => navigate(`/directions/${t.directionId}`)}>
              {t.directionName}
            </button>
            {' · '}
            <button type="button" onClick={() => navigate(`/projects/${t.projectId}`)}>
              {t.projectTitle}
            </button>
          </div>
        }
        subtitle={isActive ? <span className="quiet">Сейчас активна.</span> : undefined}
        actions={
          <>
            <Button size="sm" onClick={() => togglePin.mutate({ taskId: t.id, pinned: t.pinned })}>
              {t.pinned ? <IconPinFilled /> : <IconPin />}
              {t.pinned ? 'Открепить' : 'Закрепить'}
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
              <Button size="sm" variant="primary" onClick={() => completeTask.mutate(t.id)}>
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

      <div style={{ maxWidth: 720 }}>
        <div className="card">
          <FormField label="Название">
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} />
          </FormField>
          <div className="cols3">
            <FormField label="Дедлайн">
              <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
            </FormField>
            <FormField label="Точное время">
              <input type="time" value={exactTime} onChange={(e) => setExactTime(e.target.value)} />
            </FormField>
            <FormField label="Примерно займёт">
              <select value={duration} onChange={(e) => setDuration(e.target.value)}>
                <option value="">не знаю</option>
                <option value="short">15 минут</option>
                <option value="medium">около часа</option>
                <option value="long">несколько часов</option>
              </select>
            </FormField>
          </div>
          <FormField label="Напоминание" hint="Пусто — уведомления не будет.">
            <input type="date" value={remindAt} onChange={(e) => setRemindAt(e.target.value)} />
          </FormField>
          <FormField label="Комментарий">
            <textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} />
          </FormField>
          <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
            <Button
              size="sm"
              variant="primary"
              onClick={() => save.mutate()}
              disabled={save.isPending}
            >
              Сохранить
            </Button>
            <Button size="sm" variant="ghost" danger onClick={() => remove.mutate()}>
              Удалить задачу
            </Button>
          </div>
        </div>

        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-h">
            <h3 style={{ fontSize: 16 }}>Чек-лист</h3>
            <Button size="sm" variant="ghost" onClick={() => setItemOpen(true)}>
              <IconPlus />
              Пункт
            </Button>
          </div>
          {t.checklist.length > 0 ? (
            t.checklist.map((c) => (
              <div className="row" key={c.id} style={{ padding: '8px 0' }}>
                <Checkbox
                  checked={c.completed}
                  onChange={() => toggleItem.mutate({ itemId: c.id, completed: c.completed })}
                  label={`Пункт: ${c.text}`}
                />
                <div className="row-main">
                  <div
                    className={c.completed ? 'row-title done-strike' : 'row-title'}
                    style={{ fontWeight: 400 }}
                  >
                    {c.text}
                  </div>
                </div>
                <Button size="sm" variant="ghost" onClick={() => removeItem.mutate(c.id)}>
                  Удалить
                </Button>
              </div>
            ))
          ) : (
            <p className="hint">Пунктов нет. Чек-лист — часть одной задачи.</p>
          )}
        </div>
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
    </>
  );
}
