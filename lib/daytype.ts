import type { Category } from './categories';

export const DAY_TYPES = ['upper', 'lower', 'full_body', 'abs', 'cardio'] as const;
export type DayType = (typeof DAY_TYPES)[number];
export const isDayType = (s: unknown): s is DayType => DAY_TYPES.includes(s as DayType);

export const DAY_LABEL: Record<DayType, string> = {
  upper: 'Upper day',
  lower: 'Lower day',
  full_body: 'Full body',
  abs: 'Abs day',
  cardio: 'Cardio day',
};

export type CategoryCounts = Record<Category, number>;
export const emptyCounts = (): CategoryCounts => ({ upper: 0, lower: 0, abs: 0, cardio: 0, full_body: 0 });

/**
 * The day's type from its sets. Most sets wins; a real mix of upper and lower
 * (the smaller side is at least 30%) is full body. Abs and cardio only decide
 * the type when nothing else was trained.
 */
export function dayTypeFromCounts(c: CategoryCounts): DayType | null {
  const main = c.upper + c.lower + c.full_body;
  if (main === 0) return c.abs ? 'abs' : c.cardio ? 'cardio' : null;
  if (c.full_body >= Math.max(c.upper, c.lower)) return 'full_body';
  const ul = c.upper + c.lower;
  if (Math.min(c.upper, c.lower) / ul >= 0.3) return 'full_body';
  return c.upper >= c.lower ? 'upper' : 'lower';
}
