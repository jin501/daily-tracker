-- Daily tracker schema. Safe to re-run.

-- Raw log: every message you send, exactly as typed, plus what it parsed into.
-- Lets you re-parse history later if the parser improves.
create table if not exists entries (
  id          bigserial primary key,
  created_at  timestamptz not null default now(),
  raw_text    text not null,
  parsed      jsonb not null,
  deleted_at  timestamptz
);

create table if not exists meals (
  id          bigserial primary key,
  entry_id    bigint references entries(id) on delete cascade,
  local_date  date not null,
  meal_type   text not null,              -- breakfast | lunch | dinner | snack
  created_at  timestamptz not null default now()
);
create index if not exists meals_date_idx on meals(local_date);

create table if not exists food_items (
  id              bigserial primary key,
  meal_id         bigint not null references meals(id) on delete cascade,
  name            text not null,
  quantity        numeric,
  unit            text,
  grams           numeric,
  protein_g       numeric not null default 0,
  calories        numeric not null default 0,
  carbs_g         numeric,
  fat_g           numeric,
  source          text not null default 'estimate',   -- usda | estimate | manual
  fdc_id          integer,
  fdc_description text
);

create table if not exists exercises (
  id       serial primary key,
  name     text not null unique,
  aliases  text[] not null default '{}',
  tags     text[] not null default '{}'   -- abs, back, chest, shoulders, arms, legs, glutes, cardio, full_body
);

create table if not exists workouts (
  id          bigserial primary key,
  entry_id    bigint references entries(id) on delete cascade,
  local_date  date not null,
  title       text,
  notes       text,
  created_at  timestamptz not null default now()
);
create index if not exists workouts_date_idx on workouts(local_date);

create table if not exists workout_sets (
  id           bigserial primary key,
  workout_id   bigint not null references workouts(id) on delete cascade,
  exercise_id  integer not null references exercises(id),
  position     integer not null default 0,   -- order of the exercise in the workout
  set_index    integer not null default 1,
  weight_kg    numeric,
  reps         integer,
  duration_s   integer,
  distance_m   numeric,
  superset     text
);
create index if not exists sets_workout_idx on workout_sets(workout_id);
create index if not exists sets_exercise_idx on workout_sets(exercise_id);

create table if not exists activities (
  id            bigserial primary key,
  entry_id      bigint references entries(id) on delete cascade,
  local_date    date not null,
  name          text not null,
  duration_min  integer,
  distance_km   numeric,
  notes         text,
  created_at    timestamptz not null default now()
);
create index if not exists activities_date_idx on activities(local_date);

create table if not exists habits (
  id      serial primary key,
  key     text not null unique,
  name    text not null,
  color   text not null default '#9C83E0',
  sort    integer not null default 0,
  active  boolean not null default true
);

create table if not exists habit_logs (
  habit_id    integer not null references habits(id) on delete cascade,
  local_date  date not null,
  done        boolean not null default true,
  entry_id    bigint references entries(id) on delete set null,
  primary key (habit_id, local_date)
);

-- Goals live in the DB so changing a number never needs a deploy.
create table if not exists goals (
  key          text primary key,     -- protein_daily | workouts_weekly | abs_sets_weekly
  label        text not null,
  target       numeric not null,
  success_min  numeric,              -- e.g. 110 counts even though 130 is the goal
  period       text not null         -- day | week
);

-- USDA lookups are cached so the same food never hits the API twice.
create table if not exists food_cache (
  query        text primary key,
  fdc_id       integer,
  description  text,
  per100       jsonb,                -- { protein, calories, carbs, fat } per 100 g
  fetched_at   timestamptz not null default now()
);

-- ---------- v2: core movements, units, gym sessions, sandbox ----------

-- A movement is the core exercise ("Row"); exercises are its variations ("Cable Row", "DB Row").
create table if not exists movements (
  id        serial primary key,
  name      text not null unique,
  category  text not null default 'upper'   -- upper | lower | abs | cardio | full_body
);
create unique index if not exists movements_name_ci on movements (lower(name));
alter table exercises add column if not exists movement_id integer references movements(id) on delete set null;

-- What you actually typed, so "25 lb" shows as 25 lb (not 24.9) in either unit.
alter table workout_sets add column if not exists weight_input numeric;
alter table workout_sets add column if not exists weight_unit text;

alter table habits add column if not exists emoji text;

-- Gym check-ins. Assigned to the log date you signed in on.
create table if not exists gym_sessions (
  id          bigserial primary key,
  local_date  date not null,
  started_at  timestamptz not null default now(),
  ended_at    timestamptz,
  auto_ended  boolean not null default false
);
create index if not exists gym_sessions_date_idx on gym_sessions(local_date);

-- Manual "this was a leg day" overrides. Without a row, the day type is worked out from the sets.
create table if not exists day_types (
  local_date  date primary key,
  day_type    text not null
);

create table if not exists app_settings (
  key    text primary key,
  value  jsonb not null
);

-- USDA candidates per search phrase (replaces food_cache, which kept only the first hit).
create table if not exists food_lookup (
  query       text primary key,
  candidates  jsonb not null,
  fetched_at  timestamptz not null default now()
);

-- One-time data changes live in db/migrations and are recorded here.
create table if not exists schema_migrations (
  name    text primary key,
  ran_at  timestamptz not null default now()
);

-- Every set query goes through this, so a variation always knows its core movement and category.
create or replace view exercise_info as
select
  e.id as exercise_id,
  e.name as variation,
  e.movement_id,
  coalesce(m.name, e.name) as movement,
  coalesce(m.category,
    case when 'abs' = any(e.tags) then 'abs'
         when 'cardio' = any(e.tags) then 'cardio'
         when 'full_body' = any(e.tags) then 'full_body'
         when e.tags && array['legs', 'glutes'] then 'lower'
         else 'upper' end) as category,
  e.tags
from exercises e left join movements m on m.id = e.movement_id;
