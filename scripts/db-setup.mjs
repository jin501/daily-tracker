import { readFileSync, readdirSync } from 'node:fs';
import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url && process.argv.includes('--if-configured')) {
  console.log('DATABASE_URL not set, skipping table setup');
  process.exit(0);
}
if (!url) {
  console.error('Set DATABASE_URL first (e.g. `export $(cat .env.local | xargs)` or use dotenv).');
  process.exit(1);
}
const needsSsl = process.env.DATABASE_SSL === 'require' ||
  (process.env.DATABASE_SSL !== 'disable' && !/@(localhost|127\.0\.0\.1|[^/:@]+\.railway\.internal)[:/]/.test(url));
const sql = postgres(url, { ssl: needsSsl ? 'require' : false, prepare: false, onnotice: () => {} });

// schema + seed are idempotent and run every time
for (const file of ['db/schema.sql', 'db/seed.sql']) {
  await sql.unsafe(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'));
  console.log(`ran ${file}`);
}

// migrations run once each, in filename order
const done = new Set((await sql`select name from schema_migrations`).map((r) => r.name));
for (const file of readdirSync(new URL('../db/migrations', import.meta.url)).filter((f) => f.endsWith('.sql')).sort()) {
  if (done.has(file)) continue;
  const body = readFileSync(new URL(`../db/migrations/${file}`, import.meta.url), 'utf8');
  await sql.begin(async (tx) => {
    await tx.unsafe(body);
    await tx`insert into schema_migrations (name) values (${file})`;
  });
  console.log(`migrated ${file}`);
}
await sql.end();
