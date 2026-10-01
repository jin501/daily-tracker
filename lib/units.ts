/** Weight display. Stored in kg (plus what you typed); shown in your unit, rounded to 0.5. */
export type WUnit = 'lb' | 'kg';
export const LB_TO_KG = 0.45359237;

export type Weighted = { weight_kg: number | null; weight_input?: number | null; weight_unit?: string | null };

const half = (n: number) => Math.round(n * 2) / 2;

export function kgTo(kg: number, unit: WUnit): number {
  return half(unit === 'kg' ? kg : kg / LB_TO_KG);
}

export function toKg(v: number, unit: WUnit): number {
  return unit === 'kg' ? v : v * LB_TO_KG;
}

/** The set's weight in `unit`: exactly what you typed when units match, converted otherwise. */
export function weightIn(s: Weighted, unit: WUnit): number | null {
  if (s.weight_input != null && s.weight_unit === unit) return Number(s.weight_input);
  return s.weight_kg == null ? null : kgTo(Number(s.weight_kg), unit);
}

/** Progression step: lower body jumps more than upper. */
export const increment = (unit: WUnit, lower: boolean) => (unit === 'lb' ? (lower ? 10 : 5) : lower ? 5 : 2.5);
