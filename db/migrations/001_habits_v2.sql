-- Track only vitamins, pooped and walked. Past check-offs of other habits are kept, just hidden.
update habits set active = false where key not in ('vitamins', 'poop', 'walked');
insert into habits (key, name, emoji, color, sort, active) values
  ('vitamins', 'Vitamins', '💊', '#9C83E0', 1, true),
  ('poop',     'Pooped',   '💩', '#C99A6A', 2, true),
  ('walked',   'Walked',   '🏃‍♀️', '#4FB08A', 3, true)
on conflict (key) do update set name = excluded.name, emoji = excluded.emoji, color = excluded.color, sort = excluded.sort, active = true;
