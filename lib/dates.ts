// All app dates are plain 'YYYY-MM-DD' strings in the user's timezone.
// Date math happens in UTC so it never drifts across DST.

const TZ = process.env.APP_TIMEZONE || 'America/New_York';
const DAY_START = Number(process.env.DAY_START_HOUR ?? 3);

export const isDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

const toUTC = (d: string) => new Date(`${d}T00:00:00Z`);
const fromUTC = (d: Date) => d.toISOString().slice(0, 10);

/** Today's log date. Before DAY_START_HOUR it still counts as yesterday. */
export function todayLocal(now = new Date()): string {
  const shifted = new Date(now.getTime() - DAY_START * 3_600_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(shifted);
}

export function nowLabel(now = new Date()): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'long', hour: 'numeric', minute: '2-digit' }).format(now);
}

export function addDays(d: string, n: number): string {
  const x = toUTC(d);
  x.setUTCDate(x.getUTCDate() + n);
  return fromUTC(x);
}

/** Monday = 0 ... Sunday = 6 */
export const weekday = (d: string) => (toUTC(d).getUTCDay() + 6) % 7;
export const weekStart = (d: string) => addDays(d, -weekday(d));
export const monthStart = (d: string) => `${d.slice(0, 7)}-01`;
export const yearStart = (d: string) => `${d.slice(0, 4)}-01-01`;
export const yearEnd = (d: string) => `${d.slice(0, 4)}-12-31`;

export function addMonths(d: string, n: number): string {
  const x = toUTC(monthStart(d));
  x.setUTCMonth(x.getUTCMonth() + n);
  return fromUTC(x);
}

export function monthEnd(d: string): string {
  return addDays(addMonths(d, 1), -1);
}

export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export const minDate = (a: string, b: string) => (a < b ? a : b);

export function fmt(d: string, opts: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', ...opts }).format(toUTC(d));
}

export const dayNum = (d: string) => Number(d.slice(8, 10));

// ---------- clock times (gym sessions) ----------

const partsIn = (at: Date) => {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
      .formatToParts(at).map((x) => [x.type, x.value]),
  );
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
};

/** "HH:MM" on a log date, in the app timezone -> real instant. Times before the day rollover belong to the next calendar day. */
export function localTimeToDate(logDate: string, hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  const day = h < DAY_START ? addDays(logDate, 1) : logDate;
  const [y, mo, d] = day.split('-').map(Number);
  const wall = Date.UTC(y, mo - 1, d, h, m);
  let guess = wall;
  for (let i = 0; i < 2; i++) guess = wall - (partsIn(new Date(guess)) - guess);
  return new Date(guess);
}

/** Real instant -> "HH:MM" in the app timezone (for time inputs). */
export function toLocalHHMM(at: Date | string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(at));
}

/** Real instant -> "5:42 PM". */
export function clock(at: Date | string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }).format(new Date(at));
}
