import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import type { ReactNode } from 'react';

export interface DropdownItem {
  label: string;
  onSelect: () => void;
  danger?: boolean;
}

export function Dropdown({ trigger, items }: { trigger: ReactNode; items: DropdownItem[] }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="card"
          sideOffset={6}
          style={{ padding: 6, minWidth: 180, boxShadow: 'var(--shadow-lift)', zIndex: 70 }}
        >
          {items.map((item) => (
            <DropdownMenu.Item
              key={item.label}
              className="btn btn-ghost btn-sm"
              style={{ width: '100%', color: item.danger ? 'var(--d-act)' : undefined }}
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
