import {
  MENU_DEFAULTS,
  MENU_FIELD_LABELS,
  MENU_LABELS,
  type MenuCompany,
  type MenuCost,
  type MenuEnergy,
  type MenuEstimatedTime,
  type MenuPlace,
} from '@planner/contracts';

/**
 * Параметры возможности меню в том виде, в каком их правит человек.
 * Категории здесь нет: на карточке она не показывается, а значит и спрашивать
 * её незачем — в базе остаётся значение по умолчанию.
 */
export interface MenuParamsValue {
  energy: MenuEnergy;
  estimatedTime: MenuEstimatedTime;
  cost: MenuCost;
  place: MenuPlace;
  company?: MenuCompany;
}

/**
 * Значения по умолчанию берём из общего модуля и показываем их выбранными.
 * Смысл в том, чтобы человек видел, что именно сохранится, ещё до сохранения:
 * раньше cost и place подставлялись молча — в форме меню жёстко в коде,
 * во входящих вообще defaults'ами базы.
 */
export const menuParamsDefaults = (): MenuParamsValue => ({
  energy: MENU_DEFAULTS.energy,
  estimatedTime: MENU_DEFAULTS.estimatedTime,
  cost: MENU_DEFAULTS.cost,
  place: MENU_DEFAULTS.place,
});

function Select<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Record<string, string>;
  onChange: (v: T) => void;
}) {
  return (
    <div className="ffield">
      <span className="lbl">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value as T)}>
        {Object.entries(options).map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * Один набор полей «Идеи меню» на все три места: карточка входящей, пакетный
 * предпросмотр ИИ и форма «Новая возможность». Наборы значений и подписи
 * приходят из @planner/contracts, дублировать их больше негде.
 */
export function MenuParamFields({
  value,
  onChange,
  withCompany = false,
  className = 'inbox-grid',
}: {
  value: MenuParamsValue;
  onChange: (changes: Partial<MenuParamsValue>) => void;
  withCompany?: boolean;
  className?: string;
}) {
  return (
    <div className={className} style={{ marginTop: 0 }}>
      <Select
        label={MENU_FIELD_LABELS.energy}
        value={value.energy}
        options={MENU_LABELS.energy}
        onChange={(energy: MenuEnergy) => onChange({ energy })}
      />
      <Select
        label={MENU_FIELD_LABELS.estimatedTime}
        value={value.estimatedTime}
        options={MENU_LABELS.estimatedTime}
        onChange={(estimatedTime: MenuEstimatedTime) => onChange({ estimatedTime })}
      />
      <Select
        label={MENU_FIELD_LABELS.cost}
        value={value.cost}
        options={MENU_LABELS.cost}
        onChange={(cost: MenuCost) => onChange({ cost })}
      />
      <Select
        label={MENU_FIELD_LABELS.place}
        value={value.place}
        options={MENU_LABELS.place}
        onChange={(place: MenuPlace) => onChange({ place })}
      />
      {withCompany ? (
        <Select
          label={MENU_FIELD_LABELS.company}
          value={value.company ?? MENU_DEFAULTS.company}
          options={MENU_LABELS.company}
          onChange={(company: MenuCompany) => onChange({ company })}
        />
      ) : null}
    </div>
  );
}
