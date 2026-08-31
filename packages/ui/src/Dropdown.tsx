import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import type { ReactNode } from 'react';

export interface DropdownItem {
  label: string;
  onSelect: () => void;
  danger?: boolean;
}

export function Dropdown({
  trigger,
  items,
  label = 'Ещё действия',
}: {
  trigger: ReactNode;
  items: DropdownItem[];
  label?: string;
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="menu-pop" sideOffset={6} aria-label={label}>
          {items.map((item) => (
            <DropdownMenu.Item
              key={item.label}
              className={`menu-pop-item${item.danger ? ' is-danger' : ''}`}
              onSelect={item.onSelect}
            >
              {item.label}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/**
 * Кнопка «···» для редких действий. Частые действия остаются на виду:
 * прятать всё подряд — значит прятать и то, чем пользуются каждый день.
 */
export function OverflowMenu({
  items,
  label = 'Ещё действия',
  className = 'menu-dots',
}: {
  items: DropdownItem[];
  label?: string;
  className?: string;
}) {
  if (items.length === 0) return null;
  return (
    <Dropdown
      label={label}
      items={items}
      trigger={<button type="button" className={className} aria-label={label} />}
    />
  );
}
