import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, FormField, Modal, useToast } from '@planner/ui';
import type { Project } from '@planner/contracts';
import { api } from '../api/client.js';
import { qk } from '../api/queries.js';

/** Редактирование проекта: название, желаемый результат, срок, направление. */
export function ProjectSettingsModal({
  project,
  directions,
  open,
  onOpenChange,
}: {
  project: Project;
  directions: { id: string; name: string }[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [title, setTitle] = useState(project.title);
  const [outcome, setOutcome] = useState(project.desiredOutcome ?? '');
  const [deadline, setDeadline] = useState(project.deadline ?? '');
  const [directionId, setDirectionId] = useState(project.directionId);

  // при повторном открытии показываем актуальные значения, а не прошлый черновик
  useEffect(() => {
    if (!open) return;
    setTitle(project.title);
    setOutcome(project.desiredOutcome ?? '');
    setDeadline(project.deadline ?? '');
    setDirectionId(project.directionId);
  }, [open, project]);

  const save = useMutation({
    mutationFn: () =>
      api.projects.update(project.id, {
        title: title.trim(),
        desiredOutcome: outcome.trim() || null,
        deadline: deadline || null,
        directionId,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.project(project.id) });
      void qc.invalidateQueries({ queryKey: qk.projects(project.directionId) });
      void qc.invalidateQueries({ queryKey: qk.projects(directionId) });
      toast.show('Проект обновлён');
      onOpenChange(false);
    },
    onError: () => toast.show('Не удалось сохранить проект'),
  });

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Настройки проекта"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Отменить
          </Button>
          <Button variant="primary" disabled={!title.trim()} onClick={() => save.mutate()}>
            Сохранить
          </Button>
        </>
      }
    >
      <FormField label="Название">
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} />
      </FormField>
      <FormField label="Желаемый результат" hint="По чему будет понятно, что проект закончен">
        <textarea rows={3} value={outcome} onChange={(e) => setOutcome(e.target.value)} />
      </FormField>
      <FormField label="Срок" hint="Необязательно. Пусто — значит срока нет">
        <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
      </FormField>
      <FormField label="Направление">
        <select value={directionId} onChange={(e) => setDirectionId(e.target.value)}>
          {directions.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </FormField>
    </Modal>
  );
}
