insert into goals (key, label, target, success_min, period) values
  ('protein_daily',   'Protein',            130, 110, 'day'),
  ('calories_daily',  'Calories',          2200, 2000, 'day'),
  ('workouts_weekly', 'Workouts per week',    4, null, 'week'),
  ('abs_sets_weekly', 'Ab sets per week',    12, null, 'week')
on conflict (key) do nothing;

insert into habits (key, name, emoji, color, sort) values
  ('vitamins', 'Vitamins', '💊', '#9C83E0', 1),
  ('poop',     'Pooped',   '💩', '#C99A6A', 2),
  ('walked',   'Walked',   '🏃‍♀️', '#4FB08A', 3)
on conflict (key) do nothing;

insert into app_settings (key, value) values ('weight_unit', '"lb"')
on conflict (key) do nothing;
