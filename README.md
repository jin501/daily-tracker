# Daily

A personal tracker for protein, workouts and habits. You type (or say) what you ate or did, it parses it, you confirm, and it lands on a dashboard.

- **Today**: gym sign in/out with a live timer, the day type (Upper, Lower, Full body) and activity pills up top, protein vs your goal (110 counts, 130 is the goal), calories vs your range, streaks, meals with protein and kcal per item, training cards, abs this week, weekly workouts and habits. Use the arrows to view or edit past days.
- **Calories**: tap the calories tile for a per-meal and per-food breakdown, where each number came from, tap-to-fix, and Recheck.
- **Sandbox**: flip the log box to Sandbox to plan a meal that hits your remaining protein (with − / + to fiddle), or get a workout suggestion from your own history. Nothing saves until you tap Log this.
- **Trends**: week, month or year calendar colored by training (workout, abs only, both) or protein, plus weekly bars (workouts, gym hours, ab sets), ab stats and habit strips.
- **Lifts**: grouped by core movement (Row, Lat Pulldown...) with a chart per variation (Cable Row, DB Row...), PRs, estimated 1RM, volume, lb/kg toggle, and an editor to fix groupings.
- **Settings**: protein goal, calorie range, weekly goals, lb/kg, habits with emoji.

## How logging works

1. You send a message like `breakfast 1/4 cup steel cut oats, 5 shrimp, 1 egg` or paste a whole workout log. Past dates work: `yesterday`, `saturday`, `9/18`.
2. Claude (Haiku by default) turns it into structured items: grams for each food plus a realistic calorie/protein estimate, and for exercises the variation, its core movement and category.
3. Each food is searched in USDA FoodData Central. A USDA match is only used if its numbers for that amount land near the estimate (calories within 35%, protein within 40%); this stops things like "1 cup rice" matching raw rice. Mixed dishes (stews, jjigae, hotteok) and foods with no agreeing match use the estimate, tagged `est.`.
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
- **Habits**: add, rename, change the emoji or remove them in Settings. The log box only checks off habits you track ("took vitamins", "walked"); it never creates new ones.
- **Exercise groups**: each exercise (a variation) belongs to a core movement in `movements`, which has the category (upper, lower, abs, cardio, full_body). Cards, abs counts, day types and the coach all read the `exercise_info` view. Fix any grouping on Lifts.
- **Workout suggestions**: `lib/coach.ts`. Plain rules over your last 12 weeks, no AI guessing: most overdue day type, your usual exercises for it, double progression for weights and reps. It says it's still learning until about 3 weeks and 6 gym days are logged.
- **Database changes**: `db/schema.sql` and `db/seed.sql` run on every build and are safe to re-run. One-time data changes go in `db/migrations/NNN_name.sql`; each runs once and is recorded in `schema_migrations`.
- **Parser**: prompt and tool schema live in `lib/parse.ts`. Whatever it returns is validated against `lib/draft.ts` before saving, so prompt or model changes can't corrupt data. Set `ANTHROPIC_MODEL` to try a different model.

## Project map

```
app/                 pages (Today, Trends, Lifts, Settings, Login) and API routes
components/          LogBox (input + confirm cards), habit toggles, nav
config/trends.ts     Trends layout
lib/metrics.ts       metrics registry, goals, streaks
lib/queries.ts       day view (training cards), lifts queries
lib/parse.ts         Claude parsing + normalization
lib/usda.ts          USDA candidates, cached, cross-checked against the estimate
lib/movements.ts     core movements, name rules for older exercises
lib/coach.ts         workout suggestions from your history
lib/sandbox.ts       meal sandbox math (runs in the browser)
lib/gym.ts           gym sessions, auto-end after 3 hours
lib/daytype.ts       upper / lower / full body from the day's sets
lib/save.ts          writes drafts in one transaction
lib/draft.ts         the data contract (zod)
db/schema.sql        tables (safe to re-run)
db/seed.sql          default goals and habits
db/migrations/       one-time data changes
```

## Notes

- Weights show in lb by default (Settings or Lifts to switch). They're stored in kg plus exactly what you typed, so 25 lb always shows as 25 lb.
- Set a real `USDA_API_KEY` (free at fdc.nal.usda.gov). `DEMO_KEY` gets rate limited quickly, which means more foods fall back to estimates.
- A "workout day" for the weekly goal is any day with a logged workout, activity or gym check-in. Change `training_days` in `lib/metrics.ts` if you want lifting only.
- Gym sessions you forget to end close themselves at 3 hours; tap the gym time pill to fix the times.
- Deleting: the × on a meal, a training card (removes that exercise's sets for the day) or an activity. Tap any food's kcal on the Calories page to fix it.
