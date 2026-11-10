import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { activeTag, applyTag, parseQuickCard, suggestTag } from '@planner/shared';
import type { BoardProject } from '@planner/contracts';

/**
 * Быстрая карточка, как на доске в Обсидиане: пишешь «поправить титры #кот»,
 * Enter — и карточка в столбце. Тег выбирает проект; без тега — проект по
 * умолчанию (выбранный фильтром или последний использованный), и он виден
 * под полем, чтобы карточка не уехала неизвестно куда.
 *
 * Пока набирается тег, под полем — подсказки: стрелки, Tab или Enter
 * подставляют проект целиком.
 */
export function BoardQuickAdd({
  label,
  projects,
  defaultProjectId,
  colors,
  onSubmit,
}: {
  /** Название столбца — для подписи поля. */
  label: string;
  projects: BoardProject[];
  defaultProjectId: string | null;
  colors: Map<string, string>;
  /** Резолвится, когда карточка создана; при ошибке текст остаётся в поле. */
  onSubmit: (title: string, projectId: string) => Promise<unknown>;
}) {
  const [text, setText] = useState('');
  const [caret, setCaret] = useState(0);
  const [focused, setFocused] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [pending, setPending] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();

  const typing = focused && !dismissed ? activeTag(text, caret) : null;
  const suggestions = typing ? suggestTag(typing.query, projects) : [];
  const open = suggestions.length > 0;

  const parsed = parseQuickCard(text, projects);
  const targetId = parsed.kind === 'ok' ? (parsed.projectId ?? defaultProjectId) : null;
  const target = projects.find((p) => p.id === targetId) ?? null;

  const sync = () => {
    const el = input.current;
    if (el) setCaret(el.selectionStart ?? el.value.length);
  };

  const pick = (title: string) => {
    if (!typing) return;
    const next = applyTag(text, typing, title);
    setText(next.text);
    setCaret(next.caret);
    setHighlight(0);
    requestAnimationFrame(() => input.current?.setSelectionRange(next.caret, next.caret));
  };

  const submit = async () => {
    if (pending || parsed.kind !== 'ok' || !parsed.title || !target) return;
    setPending(true);
    try {
      await onSubmit(parsed.title, target.id);
      setText('');
      setCaret(0);
    } catch {
      // текст не теряем: ошибку уже показал тост
    } finally {
      setPending(false);
      input.current?.focus();
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const step = e.key === 'ArrowDown' ? 1 : -1;
        setHighlight((h) => (h + step + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === 'Tab' || e.key === 'Enter') {
        e.preventDefault();
        pick(suggestions[Math.min(highlight, suggestions.length - 1)]!.title);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setDismissed(true);
        return;
      }
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      void submit();
    } else if (e.key === 'Escape' && text) {
      e.preventDefault();
      setText('');
    }
  };

  // строка под полем: куда упадёт карточка или что не так с тегом
  let status: ReactNode = null;
  if (text.trim()) {
    if (parsed.kind === 'unknown') {
      status = <span className="is-error">#{parsed.tag} — нет такого проекта на доске</span>;
    } else if (parsed.kind === 'ambiguous') {
      status = (
        <span className="is-error">
          #{parsed.tag} — подходит к нескольким: {parsed.candidates.map((c) => c.title).join(', ')}
        </span>
      );
    } else if (target) {
      status = (
        <span>
          <i className="dot" style={{ background: `var(${colors.get(target.id)})` }} />
          {target.title}
          {parsed.projectId ? null : ' · по умолчанию'}
        </span>
      );
    }
  }

  return (
    <div className="board-quick">
      <input
        ref={input}
        type="text"
        value={text}
        placeholder="Карточка #проект"
        aria-label={`Новая карточка в «${label}»`}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open ? `${listId}-${highlight}` : undefined}
        onChange={(e) => {
          setText(e.target.value);
          setCaret(e.target.selectionStart ?? e.target.value.length);
          setDismissed(false);
          setHighlight(0);
        }}
        onKeyDown={onKeyDown}
        onKeyUp={sync}
        onClick={sync}
        onFocus={() => setFocused(true)}
        // клик по подсказке случается после blur — даём ему успеть
        onBlur={() => setTimeout(() => setFocused(false), 120)}
      />
      {open ? (
        <ul className="board-quick-list" role="listbox" id={listId} aria-label="Проекты">
          {suggestions.map((p, i) => (
            <li
              key={p.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === highlight}
              data-on={i === highlight}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(p.title);
              }}
            >
              <i className="dot" style={{ background: `var(${colors.get(p.id)})` }} />
              {p.title}
            </li>
          ))}
        </ul>
      ) : null}
      {/* пока открыты подсказки, строка статуса пряталась бы под ними */}
      {status && !open ? (
        <div className="board-quick-status" aria-live="polite">
          {status}
        </div>
      ) : null}
    </div>
  );
}
