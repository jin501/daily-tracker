export const round = (n: number, dp = 0) => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};

/** 25 -> "25", 7.94 -> "7.9" */
export const num = (n: number | null | undefined, dp = 1) => (n == null ? '' : String(round(n, dp)));

import { weightIn, type WUnit, type Weighted } from './units';

type SetLike = Weighted & { reps: number | null; duration_s: number | null; distance_m: number | null };

/** "50 × 12" (short, unit shown elsewhere) or "50 lb × 12" (long). */
export function setLabel(s: SetLike, unit: WUnit, long = false): string {
  if (s.distance_m != null) return s.distance_m >= 1000 ? `${num(s.distance_m / 1000, 2)}km` : `${num(s.distance_m, 0)}m`;
  if (s.duration_s != null && s.reps == null) return s.duration_s >= 60 ? `${num(s.duration_s / 60, 1)} min` : `${s.duration_s}s`;
  const w = weightIn(s, unit);
  if (w != null && s.reps != null) return long ? `${num(w)} ${unit} × ${s.reps}` : `${num(w)} × ${s.reps}`;
  if (s.reps != null) return `${s.reps} reps`;
  if (w != null) return `${num(w)} ${unit}`;
  return 'done';
}

export const kcal = (n: number) => Math.round(n).toLocaleString('en-US');

export function duration(min: number): string {
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}

const ACTIVITY_EMOJI: [RegExp, string][] = [
  [/tennis/i, '🎾'], [/pickle|ping ?pong|table tennis/i, '🏓'], [/run|jog/i, '🏃'], [/walk/i, '🚶'],
  [/bike|cycl|spin/i, '🚴'], [/hike|hiking/i, '🥾'], [/yoga/i, '🧘'], [/climb|boulder/i, '🧗'],
  [/swim/i, '🏊'], [/basketball/i, '🏀'], [/soccer|football/i, '⚽'], [/sail/i, '⛵'], [/ski|snowboard/i, '🎿'], [/danc/i, '💃'],
];
export const activityEmoji = (name: string) => ACTIVITY_EMOJI.find(([r]) => r.test(name))?.[1] ?? '⚡';

/** Epley estimate. Only meaningful for weighted sets. */
export const est1RM = (kg: number, reps: number) => (reps <= 1 ? kg : kg * (1 + reps / 30));

export const MEAL_ORDER = ['breakfast', 'lunch', 'snack', 'dinner'] as const;
export const MEAL_COLORS: Record<string, string> = {
  breakfast: '#3E6B34',
  lunch: '#6FA05F',
  snack: '#A6CF91',
  dinner: '#56957F',
};
export const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

const FRACTIONS: Record<string, string> = { '0.25': '1/4', '0.33': '1/3', '0.5': '1/2', '0.67': '2/3', '0.75': '3/4' };
/** 0.25 -> "1/4", 1.5 -> "1 1/2", 5 -> "5" */
export function qty(n: number): string {
  const whole = Math.floor(n);
  const frac = FRACTIONS[String(round(n - whole, 2))];
  if (frac) return whole ? `${whole} ${frac}` : frac;
  return num(n, 2);
}
