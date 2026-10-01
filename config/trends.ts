/**
 * Trends tab layout. Reorder, remove, or add widgets here; each one reads
 * from the metrics registry (lib/metrics.ts), so no backend changes needed.
 * `metric` can be any registry id, including 'habit:<key>'.
 */
export type Tone = 'purple' | 'blue' | 'green' | 'yellow' | 'peach' | 'mint';

export type Widget =
  | { type: 'calendar' }
  | { type: 'protein-stats' }
  | { type: 'protein-streak' }
  | { type: 'weekly-bars'; metric: string; goal?: string; title: string; tone: Tone; weeks: number; unit: string; decimals?: number }
  | { type: 'ab-summary' }
  | { type: 'habit-strips'; days: number };

export const trendsLayout: Widget[] = [
  { type: 'calendar' },
  { type: 'protein-stats' },
  { type: 'protein-streak' },
  { type: 'weekly-bars', metric: 'training_days', goal: 'workouts_weekly', title: 'Workouts per week', tone: 'purple', weeks: 6, unit: '' },
  { type: 'weekly-bars', metric: 'gym_hours', title: 'Hours at the gym', tone: 'purple', weeks: 6, unit: 'h', decimals: 1 },
  { type: 'ab-summary' },
  { type: 'weekly-bars', metric: 'ab_sets', goal: 'abs_sets_weekly', title: 'Ab sets per week', tone: 'blue', weeks: 6, unit: ' sets' },
  { type: 'habit-strips', days: 14 },
];
