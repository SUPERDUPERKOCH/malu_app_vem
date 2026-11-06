alter table public.profiles
  add column legacy_imported_at timestamptz;

grant update (legacy_imported_at) on table public.profiles to authenticated;

create table public.meetings (
  id text primary key,
  meeting_date date not null,
  meeting_time time,
  topic text not null,
  responsible text,
  join_url text,
  recording_url text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meetings_topic_not_blank check (length(trim(topic)) between 1 and 180)
);

create index meetings_active_date_idx on public.meetings (active, meeting_date, meeting_time);
create trigger meetings_set_updated_at before update on public.meetings
for each row execute function public.set_updated_at();

create table public.rewards (
  id text primary key,
  name text not null,
  description text,
  metric text not null,
  target integer not null,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rewards_name_not_blank check (length(trim(name)) between 1 and 180),
  constraint rewards_metric_valid check (metric in ('workouts', 'streak', 'habits')),
  constraint rewards_target_positive check (target > 0)
);

create index rewards_active_order_idx on public.rewards (active, sort_order, target);
create trigger rewards_set_updated_at before update on public.rewards
for each row execute function public.set_updated_at();

create table public.user_reward_redemptions (
  user_id uuid not null references auth.users (id) on delete cascade,
  reward_id text not null references public.rewards (id) on delete cascade,
  redeemed_at timestamptz not null default now(),
  primary key (user_id, reward_id)
);

alter table public.meetings enable row level security;
alter table public.rewards enable row level security;
alter table public.user_reward_redemptions enable row level security;

create policy "meetings_read_active_subscribers" on public.meetings for select to authenticated
using ((active = true and (select public.can_access_content())) or (select public.is_admin()));
create policy "meetings_admin_insert" on public.meetings for insert to authenticated with check ((select public.is_admin()));
create policy "meetings_admin_update" on public.meetings for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "meetings_admin_delete" on public.meetings for delete to authenticated using ((select public.is_admin()));

create policy "rewards_read_active_subscribers" on public.rewards for select to authenticated
using ((active = true and (select public.can_access_content())) or (select public.is_admin()));
create policy "rewards_admin_insert" on public.rewards for insert to authenticated with check ((select public.is_admin()));
create policy "rewards_admin_update" on public.rewards for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "rewards_admin_delete" on public.rewards for delete to authenticated using ((select public.is_admin()));

create policy "reward_redemptions_own_all" on public.user_reward_redemptions for all to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

revoke all on table public.meetings, public.rewards, public.user_reward_redemptions from anon, authenticated;
grant select, insert, update, delete on table public.meetings, public.rewards, public.user_reward_redemptions to authenticated;
