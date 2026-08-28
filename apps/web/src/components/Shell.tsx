import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client.js';
import { qk } from '../api/queries.js';
import { applyTheme, useUiStore } from '../store/ui.js';

const NAV = [
  { to: '/', label: 'Главная', end: true },
  { to: '/directions', label: 'Направления' },
  { to: '/reminders', label: 'Напоминания', badge: 'reminders' as const },
  { to: '/menu', label: 'Меню' },
  { to: '/media', label: 'Книги и фильмы' },
  { to: '/inbox', label: 'Входящие', badge: 'inbox' as const },
  { to: '/settings', label: 'Настройки' },
];

export function Shell({ children }: { children: ReactNode }) {
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);

  const reminders = useQuery({ queryKey: qk.reminders, queryFn: api.reminders.today });
  const inbox = useQuery({ queryKey: qk.inbox, queryFn: api.inbox.list });

  const counts: Record<string, number> = {
    reminders: reminders.data?.length ?? 0,
    inbox: inbox.data?.length ?? 0,
  };

  const choose = (next: 'light' | 'dark' | 'system'): void => {
    setTheme(next);
    applyTheme(next);
  };

  return (
    <div className="app-shell">
      <aside className="rail">
        <div className="brand">
          <svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden="true">
            <path
              d="M2 21C5 21 6 5 10 5s5 12 8 12 3-8 6-8"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              opacity=".35"
            />
            <circle cx="10" cy="5" r="2.4" fill="var(--d-act)" />
            <circle cx="18" cy="17" r="2.4" fill="var(--d-eng)" />
            <circle cx="24" cy="9" r="2.4" fill="var(--d-vocal)" />
          </svg>
          <div>
            <div className="brand-name">Траектория</div>
            <div className="brand-sub">личный планировщик</div>
          </div>
        </div>

        <nav className="nav" aria-label="Основная навигация">
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end}>
              <span>{item.label}</span>
              {item.badge && counts[item.badge] ? (
                <span className="cnt">{counts[item.badge]}</span>
              ) : null}
            </NavLink>
          ))}
        </nav>

        <div className="rail-foot">
          <div>
            <div className="lbl" style={{ marginBottom: 6 }}>
              Тема
            </div>
            <div className="seg">
              {(['light', 'dark', 'system'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  data-on={theme === value}
                  onClick={() => choose(value)}
                >
                  {value === 'light' ? 'Светлая' : value === 'dark' ? 'Тёмная' : 'Авто'}
                </button>
              ))}
            </div>
          </div>
        </div>
      </aside>

      <main className="content">{children}</main>
    </div>
  );
}
