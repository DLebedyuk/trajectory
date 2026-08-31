import type { SVGProps } from 'react';

const base = (props: SVGProps<SVGSVGElement>) => ({
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth: 1.5,
  ...props,
});

export const IconCheck = (p: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 14 14" {...base(p)} strokeWidth={2.2}>
    <path d="M2.5 7.2 5.5 10l6-6.4" />
  </svg>
);
export const IconPlus = (p: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 14 14" {...base(p)} strokeWidth={1.7}>
    <path d="M7 2v10M2 7h10" />
  </svg>
);
export const IconX = (p: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 14 14" {...base(p)} strokeWidth={1.7}>
    <path d="M3.5 3.5l7 7M10.5 3.5l-7 7" />
  </svg>
);
export const IconBack = (p: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 14 14" {...base(p)} strokeWidth={1.7}>
    <path d="M8.5 2.5 4 7l4.5 4.5" />
  </svg>
);
export const IconClock = (p: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 14 14" {...base(p)} strokeWidth={1.4}>
    <circle cx="7" cy="7" r="5.2" />
    <path d="M7 4v3.2l2 1.2" />
  </svg>
);
export const IconBell = (p: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 20 20" {...base(p)}>
    <path d="M6 8a4 4 0 0 1 8 0c0 4 1.4 5 1.4 5H4.6S6 12 6 8z" />
    <path d="M8.6 16a1.7 1.7 0 0 0 2.8 0" />
  </svg>
);
export const IconCalendar = (p: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 14 14" {...base(p)} strokeWidth={1.4}>
    <rect x="2" y="3" width="10" height="9" rx="2" />
    <path d="M2 6h10M5 1.6v2.4M9 1.6v2.4" />
  </svg>
);
export const IconPin = (p: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 14 14" {...base(p)} strokeWidth={1.4}>
    <path d="M5.1 1.7h3.8l-.6 3.3 2.3 2.2H3.4l2.3-2.2z" />
    <path d="M7 7.2V12.3" />
  </svg>
);
export const IconPinFilled = (p: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 14 14" fill="currentColor" {...p}>
    <path d="M5.1 1.7h3.8l-.6 3.3 2.3 2.2H3.4l2.3-2.2z" />
    <path d="M6.5 7.2h1V12.5h-1z" />
  </svg>
);
export const IconChevron = (p: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 14 14" {...base(p)} strokeWidth={1.6}>
    <path d="M4 5.5 7 8.5l3-3" />
  </svg>
);
export const IconSpark = (p: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 14 14" {...base(p)} strokeWidth={1.3}>
    <path d="M7 1.6 8.2 5 11.6 6.2 8.2 7.4 7 10.8 5.8 7.4 2.4 6.2 5.8 5z" />
  </svg>
);
export const IconPause = (p: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 14 14" {...base(p)} strokeWidth={1.6}>
    <path d="M5 3v8M9 3v8" />
  </svg>
);
export const IconArchive = (p: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 14 14" {...base(p)} strokeWidth={1.4}>
    <rect x="1.6" y="2.2" width="10.8" height="2.6" rx="1" />
    <path d="M2.6 4.8v6.2a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1V4.8M5.6 7.3h2.8" />
  </svg>
);

/*
 * Иконки навигации и действий. Один набор на всё приложение: viewBox 20×20,
 * обводка currentColor, размер задаётся классом .ic (1em). Эмодзи в основном
 * интерфейсе не используются — они выглядят по-разному в каждой системе.
 */
const nav = (props: SVGProps<SVGSVGElement>) => ({
  viewBox: '0 0 20 20',
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  ...props,
  className: ['ic', props.className].filter(Boolean).join(' '),
});

export const IconHome = (p: SVGProps<SVGSVGElement>) => (
  <svg {...nav(p)}>
    <path d="M3.5 8.5 10 3.5l6.5 5v7a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1z" />
    <path d="M8 16.5v-4h4v4" />
  </svg>
);
export const IconDirections = (p: SVGProps<SVGSVGElement>) => (
  <svg {...nav(p)}>
    <circle cx="10" cy="10" r="7" />
    <path d="M12.8 7.2 8.9 8.9 7.2 12.8l3.9-1.7z" />
  </svg>
);
export const IconIdeas = (p: SVGProps<SVGSVGElement>) => (
  <svg {...nav(p)}>
    <path d="M10 2.8v1.6M4.9 4.9l1.1 1.1M2.8 10h1.6M15.1 4.9 14 6M17.2 10h-1.6" />
    <path d="M7.4 13.4a3.6 3.6 0 1 1 5.2 0c-.5.5-.8 1-.8 1.7v.4H8.2v-.4c0-.7-.3-1.2-.8-1.7z" />
    <path d="M8.4 17.2h3.2" />
  </svg>
);
export const IconBook = (p: SVGProps<SVGSVGElement>) => (
  <svg {...nav(p)}>
    <path d="M4 4.2h4.2A1.8 1.8 0 0 1 10 6v10a1.5 1.5 0 0 0-1.5-1.5H4z" />
    <path d="M16 4.2h-4.2A1.8 1.8 0 0 0 10 6v10a1.5 1.5 0 0 1 1.5-1.5H16z" />
  </svg>
);
export const IconInbox = (p: SVGProps<SVGSVGElement>) => (
  <svg {...nav(p)}>
    <path d="M3 11.5 5.2 4.6a1 1 0 0 1 .95-.7h7.7a1 1 0 0 1 .95.7L17 11.5v3.6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
    <path d="M3 11.5h3.4l.9 1.8h5.4l.9-1.8H17" />
  </svg>
);
export const IconSettings = (p: SVGProps<SVGSVGElement>) => (
  <svg {...nav(p)}>
    <circle cx="10" cy="10" r="2.4" />
    <path d="M10 2.6v1.8M10 15.6v1.8M17.4 10h-1.8M4.4 10H2.6M15.2 4.8l-1.3 1.3M6.1 13.9l-1.3 1.3M15.2 15.2l-1.3-1.3M6.1 6.1 4.8 4.8" />
  </svg>
);
export const IconSun = (p: SVGProps<SVGSVGElement>) => (
  <svg {...nav(p)}>
    <circle cx="10" cy="10" r="3.4" />
    <path d="M10 2.4v1.6M10 16v1.6M17.6 10H16M4 10H2.4M15.4 4.6l-1.1 1.1M5.7 14.3l-1.1 1.1M15.4 15.4l-1.1-1.1M5.7 5.7 4.6 4.6" />
  </svg>
);
export const IconMoon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...nav(p)}>
    <path d="M15.6 12.2A6.2 6.2 0 0 1 7.8 4.4a6.4 6.4 0 1 0 7.8 7.8z" />
  </svg>
);
export const IconAuto = (p: SVGProps<SVGSVGElement>) => (
  <svg {...nav(p)}>
    <circle cx="10" cy="10" r="6.8" />
    <path d="M10 3.2v13.6" />
    <path d="M10 3.2a6.8 6.8 0 0 1 0 13.6z" fill="currentColor" stroke="none" />
  </svg>
);
export const IconLogout = (p: SVGProps<SVGSVGElement>) => (
  <svg {...nav(p)}>
    <path d="M12 6V4.6a1 1 0 0 0-1-1H4.6a1 1 0 0 0-1 1v10.8a1 1 0 0 0 1 1H11a1 1 0 0 0 1-1V14" />
    <path d="M8.4 10h8M14 7.4 16.6 10 14 12.6" />
  </svg>
);
export const IconMore = (p: SVGProps<SVGSVGElement>) => (
  <svg {...nav(p)} strokeWidth={2.2}>
    <path d="M5 10h.01M10 10h.01M15 10h.01" />
  </svg>
);
export const IconTrash = (p: SVGProps<SVGSVGElement>) => (
  <svg {...nav(p)}>
    <path d="M3.8 5.6h12.4M8 5.6V4.2a.8.8 0 0 1 .8-.8h2.4a.8.8 0 0 1 .8.8v1.4" />
    <path d="M5.4 5.6l.7 10a1 1 0 0 0 1 .9h5.8a1 1 0 0 0 1-.9l.7-10" />
  </svg>
);
export const IconRefresh = (p: SVGProps<SVGSVGElement>) => (
  <svg {...nav(p)}>
    <path d="M16.2 8.4A6.4 6.4 0 0 0 5 6.2M3.8 11.6A6.4 6.4 0 0 0 15 13.8" />
    <path d="M16.4 4.2v4.2h-4.2M3.6 15.8v-4.2h4.2" />
  </svg>
);
export const IconTouch = (p: SVGProps<SVGSVGElement>) => (
  <svg {...nav(p)}>
    <path d="M14.2 3.9a1.9 1.9 0 0 1 2.7 2.7L8.4 15 4.6 16l1-3.8z" />
    <path d="M12.6 5.5 15.3 8.2" />
  </svg>
);
export const IconThought = (p: SVGProps<SVGSVGElement>) => (
  <svg {...nav(p)}>
    <path d="M4 5.4h12a1 1 0 0 1 1 1v6.2a1 1 0 0 1-1 1H8.6L5 16.2v-2.6H4a1 1 0 0 1-1-1V6.4a1 1 0 0 1 1-1z" />
  </svg>
);
export const IconLink = (p: SVGProps<SVGSVGElement>) => (
  <svg {...nav(p)}>
    <path d="M8.4 11.6a3 3 0 0 0 4.5.3l2.2-2.2a3 3 0 0 0-4.2-4.2l-1.2 1.2" />
    <path d="M11.6 8.4a3 3 0 0 0-4.5-.3L4.9 10.3a3 3 0 0 0 4.2 4.2l1.2-1.2" />
  </svg>
);
