insert into goals (key, label, target, success_min, period) values
  ('protein_daily',   'Protein',            130, 110, 'day'),
  ('workouts_weekly', 'Workouts per week',    4, null, 'week'),
  ('abs_sets_weekly', 'Ab sets per week',    12, null, 'week')
on conflict (key) do nothing;

insert into habits (key, name, color, sort) values
  ('vitamins', 'Vitamins', '#5E9A5A', 1),
  ('poop',     'Pooped',   '#B8894A', 2)
on conflict (key) do nothing;
