import { useQuery } from '@tanstack/react-query';
import { Button, Modal } from '@planner/ui';
import { formatLongDate, plural } from '@planner/shared';
import { api } from '../api/client.js';

export function DayTouchesModal({
  date,
  directionId,
  onClose,
  onAddTouch,
}: {
  date: string | null;
  directionId?: string;
  onClose: () => void;
  /** Есть — показываем «Записать касание» с этой же датой. Нет — кнопки не будет. */
  onAddTouch?: (date: string) => void;
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
        <>
          <Button variant="ghost" onClick={onClose}>
            Закрыть
          </Button>
          {onAddTouch && date ? (
            <Button variant="primary" onClick={() => onAddTouch(date)}>
              Записать касание
            </Button>
          ) : null}
        </>
      }
    >
      <div style={{ marginTop: 14 }}>
        {list.map((t) => (
          <div className="row" key={t.id} style={{ alignItems: 'flex-start' }}>
            <i className="dot" style={{ background: `var(${t.directionColor})`, marginTop: 6 }} />
            <div className="row-main">
              <div className="row-title">{t.title}</div>
              <div className="row-sub">
                {t.directionName}
                {t.projectTitle ? ` · ${t.projectTitle}` : ''}
              </div>
              {t.comment ? (
                <p className="hint" style={{ marginTop: 4 }}>
                  {t.comment}
                </p>
              ) : null}
            </div>
          </div>
        ))}
        {list.length === 0 ? <p className="hint">В этот день касаний не было.</p> : null}
      </div>
    </Modal>
  );
}
