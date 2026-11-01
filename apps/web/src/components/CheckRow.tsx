import { Checkbox } from '@planner/ui';

/**
 * Чекбокс с видимой подписью. Сам Checkbox рисует только кружок (подпись у
 * него — для скринридера), а щёлкать удобнее по всей строке. div, а не
 * label/button: Checkbox сам рендерится кнопкой, кнопка в кнопке невалидна.
 */
export function CheckRow({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <div className="check-row" onClick={onChange}>
      <Checkbox checked={checked} onChange={onChange} label={label} />
      <span>{label}</span>
    </div>
  );
}
