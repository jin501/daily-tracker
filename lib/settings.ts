import { db } from './db';
import type { WUnit } from './units';

export async function getUnit(): Promise<WUnit> {
  try {
    const [r] = await db()<{ value: unknown }[]>`select value from app_settings where key = 'weight_unit'`;
    return r?.value === 'kg' ? 'kg' : 'lb';
  } catch {
    return 'lb';
  }
}

export async function setUnit(unit: WUnit) {
  await db()`insert into app_settings (key, value) values ('weight_unit', ${db().json(unit)})
    on conflict (key) do update set value = excluded.value`;
}
