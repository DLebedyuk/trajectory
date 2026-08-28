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
