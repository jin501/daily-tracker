# Daily

A personal tracker for protein, workouts and habits. You type (or say) what you ate or did, it parses it, you confirm, and it lands on a dashboard.

- **Today**: protein vs your goal (110 counts, 130 is the goal), calories, streaks, meals with per-item protein, workouts and activities, abs sets this week, weekly workouts, habit checks. Use the arrows to view or edit past days.
- **Trends**: week, month or year calendar colored by training (workout, abs only, both) or protein, plus weekly bars, ab stats and habit strips.
- **Lifts**: per-exercise top-set history, PRs, estimated 1RM, volume.
- **Settings**: goals and habits.

## How logging works

1. You send a message like `breakfast 1/4 cup steel cut oats, 5 shrimp, 1 egg` or paste a whole workout log. Past dates work: `yesterday`, `saturday`, `9/18`.
2. Claude (Haiku by default) turns it into structured items and estimates grams for each food.
3. Each food is looked up in USDA FoodData Central and protein/calories are computed from grams. If USDA has no match, Claude's estimate is used and tagged `estimate`.
4. You see a confirm card, fix anything, and save.

Your original message is always stored in `entries.raw_text`, so history can be re-parsed later.

## Setup

You need Node 20+, a Postgres database, and three keys.

| Env var | Where to get it |
| --- | --- |
| `DATABASE_URL` | Supabase or Neon (free tiers work). Use the pooled connection string. |
| `ANTHROPIC_API_KEY` | console.anthropic.com |
| `USDA_API_KEY` | Free at fdc.nal.usda.gov/api-key-signup (`DEMO_KEY` works for a quick test but is rate limited) |
| `APP_PASSWORD`, `SESSION_SECRET` | Anything you like. The app is locked in production without a password. |
| `APP_TIMEZONE`, `DAY_START_HOUR` | Defaults `America/New_York` and `3`, so a 1am snack counts for the day before. |

```bash
cp .env.example .env.local        # fill it in
npm install
export $(grep -v '^#' .env.local | xargs) && npm run db:setup   # creates tables + default goals/habits
npm run dev                        # http://localhost:3000
```

### Deploy on Railway

The start command runs `scripts/db-setup.mjs` first, so tables are created (or left alone) on every boot. Point the service at this repo, set `DATABASE_URL=${{Postgres.DATABASE_URL}}` plus the keys above, and it's live.

### Deploy to Vercel (free)

1. Push to GitHub and import the repo in Vercel.
2. In the Vercel project, open Storage and add a Neon Postgres database. It sets `DATABASE_URL` for you.
3. Add `ANTHROPIC_API_KEY`, `USDA_API_KEY`, `APP_PASSWORD`, `SESSION_SECRET`, `APP_TIMEZONE` in Settings, Environment Variables, then redeploy.
   Tables are created automatically during the build.
4. On your phone, open the site and use "Add to Home Screen". It runs full-screen like an app.

## Changing things later

The backend is built so UI changes rarely need backend changes.

- **New stat anywhere**: add an entry to the registry in `lib/metrics.ts`. It's then available to every screen and to `GET /api/metrics?ids=...&from=...&to=...&bucket=day|week|month`. Habits are automatic as `habit:<key>`.
- **Rearrange Trends**: edit `config/trends.ts`. The `weekly-bars` widget works with any metric and goal.
- **Goals**: Settings page, or the `goals` table. `success_min` is the "still counts" number.
- **New habit**: Settings, or just say it in the log box ("took creatine").
- **Exercise groups**: exercises carry `tags` (abs, back, legs, ...). "Ab sets" is just the `abs` tag, so leg days or push/pull are one registry entry away.
- **Parser**: prompt and tool schema live in `lib/parse.ts`. Whatever it returns is validated against `lib/draft.ts` before saving, so prompt or model changes can't corrupt data. Set `ANTHROPIC_MODEL` to try a different model.

## Project map

```
app/                 pages (Today, Trends, Lifts, Settings, Login) and API routes
components/          LogBox (input + confirm cards), habit toggles, nav
config/trends.ts     Trends layout
lib/metrics.ts       metrics registry, goals, streaks
lib/queries.ts       day, lifts and exercise queries
lib/parse.ts         Claude parsing + normalization
lib/usda.ts          USDA lookup with Postgres cache
lib/save.ts          writes drafts in one transaction
lib/draft.ts         the data contract (zod)
db/schema.sql        tables (safe to re-run)
db/seed.sql          default goals and habits
```

## Notes

- Weights are stored in kg; lb in your message is converted.
- A "workout day" for the weekly goal is any day with a logged workout or activity (tennis counts). Change `training_days` in `lib/metrics.ts` if you want lifting only.
- Deleting: the × next to a meal, workout or activity. To fix a saved meal, delete it and log it again.
