create table public.body_measurements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  measured_on date not null,
  weight_kg numeric(6,2),
  waist_cm numeric(6,2),
  hip_cm numeric(6,2),
  arm_cm numeric(6,2),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint body_measurements_positive check (
    (weight_kg is null or weight_kg > 0) and
    (waist_cm is null or waist_cm > 0) and
    (hip_cm is null or hip_cm > 0) and
    (arm_cm is null or arm_cm > 0)
  )
);

create index body_measurements_user_date_idx on public.body_measurements (user_id, measured_on desc);
create trigger body_measurements_set_updated_at before update on public.body_measurements
for each row execute function public.set_updated_at();

create table public.progress_milestones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  milestone_date date not null default current_date,
  title text not null,
  type text not null default 'victory',
  created_at timestamptz not null default now(),
  constraint progress_milestones_title_not_blank check (length(trim(title)) between 1 and 180)
);

create index progress_milestones_user_date_idx on public.progress_milestones (user_id, milestone_date desc);

alter table public.body_measurements enable row level security;
alter table public.progress_milestones enable row level security;
create policy "body_measurements_own_all" on public.body_measurements for all to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "progress_milestones_own_all" on public.progress_milestones for all to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

revoke all on table public.body_measurements, public.progress_milestones from anon, authenticated;
grant select, insert, update, delete on table public.body_measurements, public.progress_milestones to authenticated;

