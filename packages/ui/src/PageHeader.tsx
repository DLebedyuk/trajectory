import type { ReactNode } from 'react';
import { IconBack } from './icons.js';

export interface PageHeaderGlyph {
  /** Буква направления. Иконку не рисуем: буква читается в любом размере. */
  letter: string;
  /** Имя CSS-переменной цвета направления, как оно хранится в базе. */
  color: string;
}

/**
 * Шапка страницы: возврат, надзаголовок, значок и заголовок на одной строке,
 * описание и действия. Вёрстка вынесена в CSS (.page-header) — inline-стили
 * здесь мешали бы теме и адаптивности.
 */
export function PageHeader({
  title,
  subtitle,
  eyebrow,
  icon,
  glyph,
  actions,
  onBack,
  backLabel = 'Назад',
}: {
  title: string;
  subtitle?: ReactNode;
  eyebrow?: ReactNode;
  /** Произвольный значок перед заголовком. */
  icon?: ReactNode;
  /** Значок направления: буква на его цвете. */
  glyph?: PageHeaderGlyph;
  actions?: ReactNode;
  onBack?: () => void;
  backLabel?: string;
}) {
  return (
    <div className="page-header">
      {onBack ? (
        <button type="button" className="back" onClick={onBack} aria-label={`Назад: ${backLabel}`}>
          <IconBack />
        </button>
      ) : null}

      <div className="titles">
        {eyebrow ? <div className="eyebrow">{eyebrow}</div> : null}
        <h1>
          {glyph ? (
            <span
              className="glyph"
              style={{ ['--c' as string]: `var(${glyph.color})` }}
              aria-hidden="true"
            >
              {glyph.letter}
            </span>
          ) : (
            icon
          )}
          {title}
        </h1>
        {subtitle ? <div className="desc">{subtitle}</div> : null}
      </div>

      {actions ? <div className="actions">{actions}</div> : null}
    </div>
  );
}
