import { useQuery } from '@tanstack/react-query';
import { Button, Modal } from '@planner/ui';
import { formatLongDate, plural } from '@planner/shared';
import { api } from '../api/client.js';

export function DayTouchesModal({
  date,
  directionId,
  onClose,
}: {
  date: string | null;
  directionId?: string;
  onClose: () => void;
}) {
  const touches = useQuery({
    queryKey: ['touches-day', date, directionId],
    queryFn: () => api.touches.byDate(date as string, directionId),
    enabled: Boolean(date),
  });

  const list = touches.data ?? [];

  return (
    <Modal
      open={Boolean(date)}
      onOpenChange={(v) => !v && onClose()}
      title={date ? formatLongDate(date) : ''}
      description={`${list.length} ${plural(list.length, 'касание', 'касания', 'касаний')}`}
      footer={
        <Button variant="ghost" onClick={onClose}>
          Закрыть
        </Button>
      }
    >
      <div style={{ marginTop: 14 }}>
        {list.map((t) => (
          <div className="row" key={t.id}>
            <i className="dot" style={{ background: `var(${t.directionColor})`, marginTop: 6 }} />
            <div className="row-main">
              <div className="row-title">{t.title}</div>
              <div className="row-sub">
                {t.directionName}
                {t.projectTitle ? ` · ${t.projectTitle}` : ''}
              </div>
            </div>
          </div>
        ))}
        {list.length === 0 ? <p className="hint">В этот день касаний не было.</p> : null}
      </div>
    </Modal>
  );
}
