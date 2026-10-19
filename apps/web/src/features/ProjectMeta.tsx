import type { MouseEvent } from 'react';
import type { ProjectPriority } from '@planner/contracts';
import { Dropdown, IconPin, IconPinFilled, useToast } from '@planner/ui';
import { useUpdateProjectMeta } from '../api/queries.js';

type Priority = ProjectPriority | null;

export const PRIORITY_LABEL: Record<ProjectPriority, string> = {
  high: 'Высокий',
  normal: 'Обычный',
  low: 'Низкий',
};

/** Для сортировки «по приоритету»: без приоритета — в конце. */
export const PRIORITY_RANK: Record<ProjectPriority | 'none', number> = {
  high: 0,
  normal: 1,
  low: 2,
  none: 3,
};

const ARROW: Record<ProjectPriority, string> = { high: '↑', normal: '·', low: '↓' };

/**
 * Метка приоритета. Цвет не нужен: высокий читается весом и стрелкой,
 * низкий — приглушённостью, «без приоритета» не рисуется вовсе.
 */
export function PriorityMark({ priority }: { priority: Priority }) {
  if (!priority) return null;
  return (
    <span className={`prio is-${priority}`} title={`Приоритет: ${PRIORITY_LABEL[priority]}`}>
      <span aria-hidden="true">{ARROW[priority]}</span> {PRIORITY_LABEL[priority].toLowerCase()}
    </span>
  );
}

/*
  Карточки проекта кликабельны целиком. События из меню приходят через
  портал, но в React всплывают по дереву компонентов — до карточки, которая
  открыла бы проект. Поэтому обёртка гасит клик.
*/
const stop = (e: MouseEvent) => e.stopPropagation();

/** Приоритет в одно касание: метка сама служит кнопкой. */
export function PriorityPicker({
  projectId,
  title,
  priority,
}: {
  projectId: string;
  title: string;
  priority: Priority;
}) {
  const update = useUpdateProjectMeta();
  const pick = (next: Priority) => () => update.mutate({ id: projectId, priority: next });
  const mark = (p: Priority) => (p === priority ? '✓ ' : '');
  return (
    <span className="prio-picker" onClick={stop}>
      <Dropdown
        label={`Приоритет проекта: ${title}`}
        trigger={
          <button
            type="button"
            className={`prio-btn${priority ? '' : ' is-empty'}`}
            aria-label={`Приоритет проекта «${title}»: ${priority ? PRIORITY_LABEL[priority] : 'не задан'}`}
          >
            {priority ? <PriorityMark priority={priority} /> : 'приоритет'}
          </button>
        }
        items={[
          { label: `${mark('high')}Высокий`, onSelect: pick('high') },
          { label: `${mark('normal')}Обычный`, onSelect: pick('normal') },
          { label: `${mark('low')}Низкий`, onSelect: pick('low') },
          { label: `${mark(null)}Без приоритета`, onSelect: pick(null) },
        ]}
      />
    </span>
  );
}

/** Закрепить — значит «хочу видеть этот проект в обзоре». С фокусом не связано. */
export function PinButton({
  projectId,
  title,
  pinned,
}: {
  projectId: string;
  title: string;
  pinned: boolean;
}) {
  const update = useUpdateProjectMeta();
  const toast = useToast();
  return (
    <button
      type="button"
      className={`pin${pinned ? ' is-pinned' : ''}`}
      aria-pressed={pinned}
      aria-label={pinned ? `Открепить проект: ${title}` : `Закрепить проект: ${title}`}
      title={pinned ? 'Открепить — убрать из обзора' : 'Закрепить — показывать в обзоре'}
      onClick={(e) => {
        e.stopPropagation();
        update.mutate(
          { id: projectId, pinned: !pinned },
          {
            onSuccess: () => toast.show(pinned ? 'Убран из обзора' : `В обзоре: ${title}`),
            onError: () => toast.show('Не удалось изменить закрепление'),
          },
        );
      }}
    >
      {pinned ? <IconPinFilled /> : <IconPin />}
    </button>
  );
}
