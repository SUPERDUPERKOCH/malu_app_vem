alter table public.workout_sessions
  add column mobility_completed_at timestamptz,
  add column mobility_items jsonb not null default '[]'::jsonb;

alter table public.workout_sessions
  add constraint workout_sessions_mobility_items_array
  check (jsonb_typeof(mobility_items) = 'array');
