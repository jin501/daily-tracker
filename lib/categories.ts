/** Exercise categories. Pure (no database), so client components can import it. */
export const CATEGORIES = ['upper', 'lower', 'abs', 'cardio', 'full_body'] as const;
export type Category = (typeof CATEGORIES)[number];
export const isCategory = (s: unknown): s is Category => CATEGORIES.includes(s as Category);

export const CATEGORY_LABEL: Record<Category, string> = {
  upper: 'Upper',
  lower: 'Lower',
  abs: 'Abs',
  cardio: 'Cardio',
  full_body: 'Full body',
};

/** Tile color per category. Abs and cardio stand apart from regular lifting. */
export const CATEGORY_TONE: Record<Category, 'purple' | 'abs' | 'act'> = {
  upper: 'purple',
  lower: 'purple',
  full_body: 'purple',
  abs: 'abs',
  cardio: 'act',
};
