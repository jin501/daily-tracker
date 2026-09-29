type P = { size?: number; color?: string };
const base = (size: number) => ({ width: size, height: size, viewBox: '0 0 24 24', fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true });

export const Mic = ({ size = 20, color = 'currentColor' }: P) => (
  <svg {...base(size)} stroke={color} strokeWidth={2}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
);
export const ArrowUp = ({ size = 20, color = 'currentColor' }: P) => (
  <svg {...base(size)} stroke={color} strokeWidth={2.4}><path d="M12 19V5M6 11l6-6 6 6" /></svg>
);
export const Check = ({ size = 12, color = '#fff' }: P) => (
  <svg {...base(size)} stroke={color} strokeWidth={3.4}><path d="M5 12l5 5 9-10" /></svg>
);
export const Flame = ({ size = 18, color = 'currentColor' }: P) => (
  <svg {...base(size)} stroke={color} strokeWidth={2.2}><path d="M12 3c1 3 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-9z" /></svg>
);
export const Dumbbell = ({ size = 20, color = 'currentColor' }: P) => (
  <svg {...base(size)} stroke={color} strokeWidth={2}><path d="M6 8v8M3 10v4M18 8v8M21 10v4M6 12h12" /></svg>
);
export const Ball = ({ size = 20, color = 'currentColor' }: P) => (
  <svg {...base(size)} stroke={color} strokeWidth={2}><circle cx="12" cy="12" r="9" /><path d="M4 8c5 2 11 2 16 0M4 16c5-2 11-2 16 0" /></svg>
);
export const ChevronLeft = ({ size = 18, color = 'currentColor' }: P) => (
  <svg {...base(size)} stroke={color} strokeWidth={2.4}><path d="M15 6l-6 6 6 6" /></svg>
);
export const ChevronRight = ({ size = 18, color = 'currentColor' }: P) => (
  <svg {...base(size)} stroke={color} strokeWidth={2.4}><path d="M9 6l6 6-6 6" /></svg>
);
export const Gear = ({ size = 20, color = 'currentColor' }: P) => (
  <svg {...base(size)} stroke={color} strokeWidth={2}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>
);
