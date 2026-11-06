alter table public.profiles
  add column meal_plan_id text,
  add column calorie_goal integer,
  add column meal_times jsonb not null default '{}'::jsonb;

alter table public.profiles
  add constraint profiles_calorie_goal_range check (calorie_goal is null or calorie_goal between 800 and 6000),
  add constraint profiles_meal_times_object check (jsonb_typeof(meal_times) = 'object');

grant update (meal_plan_id, calorie_goal, meal_times) on table public.profiles to authenticated;

create table public.food_entries (
  user_id uuid not null references auth.users (id) on delete cascade,
  entry_date date not null,
  id text not null,
  meal_ref text not null,
  eaten_at time,
  description text not null,
  calories integer not null default 0,
  source text,
  option_index smallint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, entry_date, id),
  constraint food_entries_calories_nonnegative check (calories >= 0),
  constraint food_entries_option_index_nonnegative check (option_index is null or option_index >= 0)
);

create index food_entries_user_date_idx on public.food_entries (user_id, entry_date desc);
create trigger food_entries_set_updated_at before update on public.food_entries
for each row execute function public.set_updated_at();

alter table public.food_entries enable row level security;
create policy "food_entries_own_all" on public.food_entries for all to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

revoke all on table public.food_entries from anon, authenticated;
grant select, insert, update, delete on table public.food_entries to authenticated;

