import { IconCheck } from './icons.js';

export interface CheckboxProps {
  checked: boolean;
  onChange: () => void;
  label: string;
  size?: number;
}

/** Круглый чекбокс из прототипа. Всегда с доступным именем. */
export function Checkbox({ checked, onChange, label, size = 19 }: CheckboxProps) {
  return (
    <button
      type="button"
      className="check"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      data-checked={checked}
      style={{ width: size, height: size }}
      onClick={(e) => {
        e.stopPropagation();
        onChange();
      }}
    >
      <IconCheck />
    </button>
  );
}
