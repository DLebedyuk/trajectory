import type { ButtonHTMLAttributes, ReactNode } from 'react';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * 'current' — состояние уже достигнуто и повторный клик ничего не изменит
   * (например «в фокусе»): не приглашает нажать, как primary, но и не
   * выглядит рядовой кнопкой без разбора.
   */
  variant?: 'default' | 'primary' | 'ghost' | 'current';
  size?: 'md' | 'sm';
  danger?: boolean;
  children?: ReactNode;
}

export function Button({
  variant = 'default',
  size = 'md',
  danger = false,
  className = '',
  children,
  ...rest
}: ButtonProps) {
  /*
    Модификаторы — отдельные классы («btn primary»), а не «btn-primary»
    одним словом: селекторы в styles.css написаны как .btn.primary и
    рассчитывают на составное имя. Несовпадение раньше гасило вариант
    целиком — primary/ghost/sm/danger рендерились неотличимыми от default.
  */
  const classes = [
    'btn',
    variant === 'primary' ? 'primary' : '',
    variant === 'ghost' ? 'ghost' : '',
    variant === 'current' ? 'is-current' : '',
    size === 'sm' ? 'sm' : '',
    danger ? 'danger' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button type="button" className={classes} {...rest}>
      {children}
    </button>
  );
}
