-- Registro diario da participante usado pela Home.
create table public.daily_checkins (
  user_id uuid not null references auth.users (id) on delete cascade,
  checkin_date date not null,
  water_glasses smallint not null default 0,
  mood smallint,
  meals jsonb not null default '{}'::jsonb,
  choices jsonb not null default '{}'::jsonb,
  custom_habits jsonb not null default '{}'::jsonb,
  workout_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (user_id, checkin_date),
  constraint daily_checkins_water_range check (water_glasses between 0 and 20),
  constraint daily_checkins_mood_range check (mood is null or mood between 1 and 5),
  constraint daily_checkins_meals_object check (jsonb_typeof(meals) = 'object'),
  constraint daily_checkins_choices_object check (jsonb_typeof(choices) = 'object'),
  constraint daily_checkins_custom_habits_object check (jsonb_typeof(custom_habits) = 'object')
);

create index daily_checkins_user_date_desc_idx
  on public.daily_checkins (user_id, checkin_date desc);

create trigger daily_checkins_set_updated_at
before update on public.daily_checkins
for each row execute function public.set_updated_at();

alter table public.daily_checkins enable row level security;

create policy "daily_checkins_select_own"
on public.daily_checkins
for select
to authenticated
using (user_id = (select auth.uid()));

create policy "daily_checkins_insert_own"
on public.daily_checkins
for insert
to authenticated
with check (user_id = (select auth.uid()));

create policy "daily_checkins_update_own"
on public.daily_checkins
for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy "daily_checkins_delete_own"
on public.daily_checkins
for delete
to authenticated
using (user_id = (select auth.uid()));

revoke all on table public.daily_checkins from anon, authenticated;
grant select, insert, update, delete on table public.daily_checkins to authenticated;

comment on table public.daily_checkins is
  'Check-in diario privado: agua, humor, refeicoes, habitos e conclusao de treino.';

