import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, FormField, Modal, useToast } from '@planner/ui';
import { api } from '../api/client.js';
import { qk } from '../api/queries.js';

/** Запись касания. Фактическое время не спрашиваем — считается сам факт работы. */
export function TouchModal({
  open,
  onOpenChange,
  directionId,
  today,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  directionId?: string;
  today: string;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [dir, setDir] = useState(directionId ?? '');
  const [projectId, setProjectId] = useState('');
  const [title, setTitle] = useState('');
  const [comment, setComment] = useState('');
  const [date, setDate] = useState(today);

  const directions = useQuery({
    queryKey: qk.directions,
    queryFn: api.directions.list,
    enabled: open,
  });
  const projects = useQuery({
    queryKey: ['touch-projects', dir],
    queryFn: () => api.projects.listByDirection(dir),
    enabled: open && Boolean(dir),
  });

  const create = useMutation({
    mutationFn: () =>
      api.touches.create({
        directionId: dir,
        projectId: projectId || null,
        date,
        title,
        comment: comment || null,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['heatmap'] });
      void qc.invalidateQueries({ queryKey: ['touches'] });
      void qc.invalidateQueries({ queryKey: qk.dashboard });
      void qc.invalidateQueries({ queryKey: qk.directions });
      toast.show('Записано. Появился новый квадрат.');
      setTitle('');
      setComment('');
      onOpenChange(false);
    },
  });

  const effectiveDir = dir || directionId || '';

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Записать касание"
      description="Один факт осмысленной работы. Длительность не спрашиваем."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button
            variant="primary"
            disabled={!effectiveDir || title.trim().length === 0 || create.isPending}
            onClick={() => create.mutate()}
          >
            Записать
          </Button>
        </>
      }
    >
      <div className="field">
        <span className="lbl">Направление</span>
        <div className="chips">
          {(directions.data ?? []).map((d) => (
            <button
              key={d.id}
              type="button"
              className="chip"
              data-on={effectiveDir === d.id}
              onClick={() => {
                setDir(d.id);
                setProjectId('');
              }}
            >
              <i className="dot" style={{ background: `var(${d.color})` }} />
              {d.name}
            </button>
          ))}
        </div>
      </div>

      <FormField label="Проект — необязательно">
        <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
          <option value="">без проекта</option>
          {(projects.data ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
      </FormField>

      <FormField label="Что было">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Например: разбирала монолог по кускам"
        />
      </FormField>

      <div className="cols2">
        <FormField label="Дата">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </FormField>
        <FormField label="Комментарий">
          <input type="text" value={comment} onChange={(e) => setComment(e.target.value)} />
        </FormField>
      </div>
    </Modal>
  );
}
