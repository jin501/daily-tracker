import postgres from 'postgres';

let client: postgres.Sql | null = null;

/** Local and Railway-internal connections don't use SSL; hosted poolers (Supabase, Neon) do. */
export function needsSsl(url: string): boolean {
  if (process.env.DATABASE_SSL === 'disable') return false;
  if (process.env.DATABASE_SSL === 'require') return true;
  return !/@(localhost|127\.0\.0\.1|[^/:@]+\.railway\.internal)[:/]/.test(url);
}

/** Lazily created so builds don't need a database. */
export function db(): postgres.Sql {
  if (!client) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.');
    client = postgres(url, {
      ssl: needsSsl(url) ? 'require' : false,
      max: 5,
      prepare: false, // plays nice with Supabase / Neon poolers
      types: {
        // numeric -> JS number, date -> 'YYYY-MM-DD' string (no timezone surprises)
        numeric: { to: 1700, from: [1700], serialize: (x: number) => String(x), parse: (x: string) => parseFloat(x) },
        date: { to: 1082, from: [1082], serialize: (x: string) => x, parse: (x: string) => x },
      },
    });
  }
  return client;
}
