import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  IconAuto,
  IconBook,
  IconDirections,
  IconHome,
  IconIdeas,
  IconInbox,
  IconLogout,
  IconMoon,
  IconSettings,
  IconSun,
  IconBell,
  IconMore,
  IconArchive,
  IconTouch,
} from '@planner/ui';
import { api } from '../api/client.js';
import { qk, useFocus } from '../api/queries.js';
import { applyTheme, useUiStore, watchSystemTheme } from '../store/ui.js';

const NAV = [
  { to: '/', label: 'Главная', end: true, Icon: IconHome },
  { to: '/directions', label: 'Направления', Icon: IconDirections },
  { to: '/reminders', label: 'Напоминания', badge: 'reminders' as const, Icon: IconBell },
  { to: '/menu', label: 'Меню', Icon: IconIdeas },
  { to: '/media', label: 'Книги и фильмы', Icon: IconBook },
  { to: '/inbox', label: 'Входящие', badge: 'inbox' as const, Icon: IconInbox },
  { to: '/settings', label: 'Настройки', Icon: IconSettings },
];

/**
 * Нижняя навигация мобильного: четыре вкладки вокруг круглой «Главной».
 * Добавление переехало наверх, в кнопку «+»: центр нижней панели — самое
 * удобное место на экране, и его занимает самый частый переход, а не действие.
 */
const MOBILE_NAV_LEFT = [
  { to: '/inbox', label: 'Входящие', badge: 'inbox' as const, Icon: IconInbox },
  { to: '/media', label: 'Полка', Icon: IconBook },
];

const MOBILE_NAV_RIGHT = [{ to: '/directions', label: 'Направления', Icon: IconDirections }];

/**
 * Разделы, которым не хватило места в нижней панели. На десктопе они есть в
 * боковом меню, а на телефоне до этого дня были недоступны вовсе — включая
 * настройки.
 */
const MORE_LINKS = [
  {
    to: '/menu',
    title: 'Меню возможностей',
    sub: 'Идеи — приятное и необязательное',
    Icon: IconIdeas,
  },
  { to: '/touches', title: 'История касаний', sub: 'Все факты работы по дням', Icon: IconTouch },
  {
    to: '/reminders',
    title: 'Напоминания',
    sub: 'Отметить готовым, перенести',
    badge: 'reminders' as const,
    Icon: IconBell,
  },
  {
    to: '/reminders/archive',
    title: 'Архив напоминаний',
    sub: 'Выполненное и пропущенное за 7 дней',
    Icon: IconArchive,
  },
  {
    to: '/settings',
    title: 'Настройки',
    sub: 'Тема, Telegram, Google Calendar',
    Icon: IconSettings,
  },
];

/**
 * Ширина контента зависит от страницы. Списки и карты дышат, читаемые формы —
 * нет: строка в 1600 пикселей не читается, а карта касаний в 700 не помещается.
 */
function widthClass(pathname: string): 'wide' | 'medium' | 'narrow' {
  if (pathname === '/' || pathname === '/directions' || pathname === '/touches') return 'wide';
  if (/^\/directions\/[^/]+\/(archive|touches)$/.test(pathname)) return 'wide';
  if (/^\/tasks\//.test(pathname) || /^\/media\/[^/]+$/.test(pathname)) return 'narrow';
  return 'medium';
}

const THEMES = [
  { value: 'light' as const, label: 'Светлая', Icon: IconSun },
  { value: 'dark' as const, label: 'Тёмная', Icon: IconMoon },
  { value: 'system' as const, label: 'Авто', Icon: IconAuto },
];

export function Shell({ children }: { children: ReactNode }) {
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);
  const location = useLocation();
  const navigate = useNavigate();

  const reminders = useQuery({ queryKey: qk.reminders, queryFn: api.reminders.today });
  const inbox = useQuery({ queryKey: qk.inbox, queryFn: api.inbox.list });
  const me = useQuery({ queryKey: qk.me, queryFn: api.me });
  const focus = useFocus();

  const [moreOpen, setMoreOpen] = useState(false);

  const qc = useQueryClient();
  const logout = useMutation({
    mutationFn: api.auth.logout,
    onSuccess: () => {
      qc.clear();
      window.location.assign('/');
    },
  });

  // «Авто» обязана переключаться вслед за системой без перезагрузки
  useEffect(() => watchSystemTheme(() => useUiStore.getState().theme), []);
  useEffect(() => applyTheme(theme), [theme]);

  const counts: Record<string, number> = {
    reminders: reminders.data?.length ?? 0,
    inbox: inbox.data?.length ?? 0,
  };

  /*
   * Акцент всего приложения задаёт направление в фокусе — и только оно.
   * Имена направлений здесь не участвуют: берём цвет из данных, поэтому
   * созданное пользователем направление красит интерфейс так же, как исходные.
   */
  const accentColor = focus.data?.direction?.color;
  const shellStyle = accentColor
    ? ({ '--accent-base': `var(${accentColor})` } as CSSProperties)
    : undefined;

  const initial = (me.data?.displayName ?? '?').trim().charAt(0).toUpperCase();

  return (
    <div className="app-shell" style={shellStyle}>
      <aside className="app-sidebar">
        <div className="brand">
          <div className="logo" aria-hidden="true" />
          <div>
            <div className="name">Траектория</div>
            <div className="sub">личный планировщик</div>
          </div>
        </div>

        <nav aria-label="Основная навигация">
          {NAV.map(({ to, label, end, badge, Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => `nav-item${isActive ? ' is-active' : ''}`}
            >
              <Icon />
              <span>{label}</span>
              {badge && counts[badge] ? <span className="ct mono">{counts[badge]}</span> : null}
            </NavLink>
          ))}
        </nav>

        <div className="bottom">
          {me.data ? (
            <div className="user">
              <div className="av" aria-hidden="true">
                {initial}
              </div>
              <div className="info">
                <div className="nm">{me.data.displayName}</div>
                <div className="ml">{me.data.email}</div>
              </div>
              <button
                type="button"
                onClick={() => logout.mutate()}
                aria-label="Выйти из аккаунта"
                title="Выйти"
              >
                <IconLogout />
              </button>
            </div>
          ) : null}

          <div className="theme" role="group" aria-label="Тема оформления">
            {THEMES.map(({ value, label, Icon }) => (
              <button
                key={value}
                type="button"
                className={theme === value ? 'is-active' : undefined}
                aria-pressed={theme === value}
                onClick={() => setTheme(value)}
              >
                <Icon />
                {label}
              </button>
            ))}
          </div>
        </div>
      </aside>

      <main className={`app-main ${widthClass(location.pathname)}`}>{children}</main>

      <nav className="m-bottom" aria-label="Навигация">
        {MOBILE_NAV_LEFT.map(({ to, label, badge, Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => `tab${isActive ? ' is-active' : ''}`}
          >
            <Icon />
            {label}
            {badge && counts[badge] ? <span className="ct mono">{counts[badge]}</span> : null}
          </NavLink>
        ))}

        {/* Домик без подписи: в кружок она не влезает, а иконка понятна и так. */}
        <NavLink
          to="/"
          end
          className={({ isActive }) => `tab is-home${isActive ? ' is-active' : ''}`}
          aria-label="Главная"
        >
          <IconHome />
        </NavLink>

        {MOBILE_NAV_RIGHT.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => `tab${isActive ? ' is-active' : ''}`}
          >
            <Icon />
            {label}
          </NavLink>
        ))}

        <button
          type="button"
          className={`tab${moreOpen ? ' is-active' : ''}`}
          onClick={() => setMoreOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
        >
          <IconMore />
          Ещё
        </button>
      </nav>

      {moreOpen ? (
        <div
          className="sheet-backdrop"
          role="presentation"
          onClick={() => setMoreOpen(false)}
          onKeyDown={(e) => e.key === 'Escape' && setMoreOpen(false)}
        >
          <div
            className="plus-sheet"
            role="dialog"
            aria-label="Ещё"
            onClick={(e) => e.stopPropagation()}
          >
            <h5>Ещё</h5>
            {MORE_LINKS.map(({ to, title, sub, badge, Icon }) => (
              <button
                key={to}
                type="button"
                className="opt"
                onClick={() => {
                  setMoreOpen(false);
                  navigate(to);
                }}
              >
                <span className="ic-wrap">
                  <Icon />
                </span>
                <span className="info">
                  <span className="ttl">{title}</span>
                  <span className="sub">{sub}</span>
                </span>
                {badge && counts[badge] ? <span className="ct mono">{counts[badge]}</span> : null}
              </button>
            ))}
            <button
              type="button"
              className="btn ghost sheet-cancel"
              onClick={() => setMoreOpen(false)}
            >
              Отмена
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
