import { useCallback, useRef, useState, type CSSProperties, type PointerEvent } from 'react';

interface Session {
  pointerId: number;
  startY: number;
  from: number;
  to: number;
  /** Положения карточек на момент захвата: во время перетаскивания вёрстка не меняется. */
  rects: DOMRect[];
}

/**
 * Перетаскивание в коротком вертикальном списке на pointer events: одинаково
 * для мыши, пальца и пера, без библиотек. Тянут за ручку (у неё touch-action:
 * none, иначе браузер начнёт прокрутку), карточка едет за пальцем, соседи
 * расступаются сдвигом transform — сама вёрстка до отпускания не меняется.
 * Порядок отдаётся наружу один раз, когда палец отпущен.
 */
export function useDragSort(ids: string[], onCommit: (ids: string[]) => void) {
  const nodes = useRef(new Map<string, HTMLElement>());
  const session = useRef<Session | null>(null);
  const [drag, setDrag] = useState<{ id: string; from: number; to: number; dy: number } | null>(
    null,
  );

  const itemRef = useCallback(
    (id: string) => (el: HTMLElement | null) => {
      if (el) nodes.current.set(id, el);
      else nodes.current.delete(id);
    },
    [],
  );

  const move = (id: string, delta: -1 | 1) => {
    const from = ids.indexOf(id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= ids.length) return;
    const next = [...ids];
    next.splice(to, 0, next.splice(from, 1)[0]!);
    onCommit(next);
  };

  const handleProps = (id: string) => ({
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      if (e.button !== 0 || ids.length < 2) return;
      const rects = ids.map((i) => nodes.current.get(i)?.getBoundingClientRect());
      if (rects.some((r) => !r)) return;
      const from = ids.indexOf(id);
      e.currentTarget.setPointerCapture(e.pointerId);
      e.preventDefault();
      session.current = {
        pointerId: e.pointerId,
        startY: e.clientY,
        from,
        to: from,
        rects: rects as DOMRect[],
      };
      setDrag({ id, from, to: from, dy: 0 });
    },
    onPointerMove: (e: PointerEvent<HTMLElement>) => {
      const s = session.current;
      if (!s || e.pointerId !== s.pointerId) return;
      const dy = e.clientY - s.startY;
      const own = s.rects[s.from]!;
      const center = own.top + own.height / 2 + dy;
      let to = s.from;
      s.rects.forEach((r, i) => {
        const mid = r.top + r.height / 2;
        if (i > s.from && center > mid) to = Math.max(to, i);
        if (i < s.from && center < mid) to = Math.min(to, i);
      });
      s.to = to;
      setDrag({ id, from: s.from, to, dy });
    },
    onPointerUp: (e: PointerEvent<HTMLElement>) => {
      const s = session.current;
      if (!s || e.pointerId !== s.pointerId) return;
      session.current = null;
      setDrag(null);
      if (s.to !== s.from) {
        const next = [...ids];
        next.splice(s.to, 0, next.splice(s.from, 1)[0]!);
        onCommit(next);
      }
    },
    onPointerCancel: () => {
      session.current = null;
      setDrag(null);
    },
  });

  /** Сдвиг карточки на время перетаскивания. */
  const itemStyle = (id: string): CSSProperties | undefined => {
    const s = session.current;
    if (!drag || !s) return undefined;
    if (id === drag.id) {
      return { transform: `translateY(${drag.dy}px)`, zIndex: 2, position: 'relative' };
    }
    const i = ids.indexOf(id);
    const own = s.rects[s.from]!;
    const next = s.rects[s.from + 1] ?? s.rects[s.from - 1];
    const gap = next ? Math.abs(next.top - own.top) - own.height : 0;
    const step = own.height + Math.max(gap, 0);
    if (drag.from < drag.to && i > drag.from && i <= drag.to) {
      return { transform: `translateY(${-step}px)` };
    }
    if (drag.to < drag.from && i >= drag.to && i < drag.from) {
      return { transform: `translateY(${step}px)` };
    }
    return undefined;
  };

  return { itemRef, itemStyle, handleProps, move, draggingId: drag?.id ?? null };
}
