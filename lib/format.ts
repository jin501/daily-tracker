export const round = (n: number, dp = 0) => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};

/** 25 -> "25", 7.94 -> "7.9" */
export const num = (n: number | null | undefined, dp = 1) => (n == null ? '' : String(round(n, dp)));

type SetLike = { weight_kg: number | null; reps: number | null; duration_s: number | null; distance_m: number | null };

export function setLabel(s: SetLike, long = false): string {
  if (s.distance_m != null) return s.distance_m >= 1000 ? `${num(s.distance_m / 1000, 2)}km` : `${num(s.distance_m, 0)}m`;
  if (s.duration_s != null && s.reps == null) return s.duration_s >= 60 ? `${num(s.duration_s / 60, 1)} min` : `${s.duration_s}s`;
  if (s.weight_kg != null && s.reps != null) return long ? `${num(s.weight_kg)}kg × ${s.reps}` : `${num(s.weight_kg)}×${s.reps}`;
  if (s.reps != null) return `${s.reps} reps`;
  if (s.weight_kg != null) return `${num(s.weight_kg)}kg`;
  return 'done';
}

/** Epley estimate. Only meaningful for weighted sets. */
export const est1RM = (kg: number, reps: number) => (reps <= 1 ? kg : kg * (1 + reps / 30));

export const MEAL_ORDER = ['breakfast', 'lunch', 'snack', 'dinner'] as const;
export const MEAL_COLORS: Record<string, string> = {
  breakfast: '#2F6B3B',
  lunch: '#5E9A5A',
  snack: '#8FC286',
  dinner: '#9DB24A',
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
