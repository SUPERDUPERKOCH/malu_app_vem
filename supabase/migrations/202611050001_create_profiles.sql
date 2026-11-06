-- VEM: perfis de usuários ligados ao Supabase Auth.
-- Credenciais permanecem em auth.users; dados do aplicativo ficam em public.profiles.

create type public.app_role as enum ('participant', 'coach', 'admin');
create type public.subscription_status as enum ('pending', 'active', 'suspended', 'cancelled');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  first_name text not null default '',
  last_name text not null default '',
  role public.app_role not null default 'participant',
  subscription_status public.subscription_status not null default 'pending',
  birth_date date,
  avatar_url text,
  objective text,
  personal_goal text,
  weekly_goal smallint,
  level text,
  modality text,
  onboarding_completed boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint profiles_email_not_blank check (length(trim(email)) > 3),
  constraint profiles_first_name_length check (length(first_name) <= 80),
  constraint profiles_last_name_length check (length(last_name) <= 120),
  constraint profiles_weekly_goal_range check (weekly_goal is null or weekly_goal between 1 and 7),
  constraint profiles_level_valid check (level is null or level in ('beginner', 'intermediate', 'advanced')),
  constraint profiles_modality_valid check (modality is null or modality in ('gym', 'home'))
);

create unique index profiles_email_unique_idx on public.profiles (lower(email));
create index profiles_role_idx on public.profiles (role);
create index profiles_subscription_status_idx on public.profiles (subscription_status);

comment on table public.profiles is 'Dados de perfil do aplicativo VEM; identidade e senha ficam em auth.users.';
comment on column public.profiles.first_name is 'Nome da participante.';
comment on column public.profiles.last_name is 'Sobrenome da participante.';

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role = 'admin'
      and active = true
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  full_name text := trim(coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  resolved_first_name text;
  resolved_last_name text;
begin
  resolved_first_name := trim(coalesce(
    nullif(new.raw_user_meta_data ->> 'first_name', ''),
    nullif(split_part(full_name, ' ', 1), ''),
    ''
  ));

  resolved_last_name := trim(coalesce(
    nullif(new.raw_user_meta_data ->> 'last_name', ''),
    nullif(substr(full_name, length(resolved_first_name) + 1), ''),
    ''
  ));

  insert into public.profiles (id, email, first_name, last_name)
  values (new.id, coalesce(new.email, ''), resolved_first_name, resolved_last_name)
  on conflict (id) do update
    set email = excluded.email,
        first_name = case when public.profiles.first_name = '' then excluded.first_name else public.profiles.first_name end,
        last_name = case when public.profiles.last_name = '' then excluded.last_name else public.profiles.last_name end;

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.sync_user_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is distinct from old.email then
    update public.profiles
    set email = coalesce(new.email, '')
    where id = new.id;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_email_updated
after update of email on auth.users
for each row execute function public.sync_user_email();

-- Cria perfis para contas que já estavam no Auth antes desta migração.
insert into public.profiles (id, email, first_name, last_name, created_at)
select
  user_row.id,
  coalesce(user_row.email, ''),
  trim(coalesce(
    nullif(user_row.raw_user_meta_data ->> 'first_name', ''),
    nullif(split_part(coalesce(user_row.raw_user_meta_data ->> 'full_name', ''), ' ', 1), ''),
    ''
  )),
  trim(coalesce(
    nullif(user_row.raw_user_meta_data ->> 'last_name', ''),
    nullif(substr(
      coalesce(user_row.raw_user_meta_data ->> 'full_name', ''),
      length(split_part(coalesce(user_row.raw_user_meta_data ->> 'full_name', ''), ' ', 1)) + 1
    ), ''),
    ''
  )),
  user_row.created_at
from auth.users as user_row
on conflict (id) do nothing;

alter table public.profiles enable row level security;

create policy "profiles_select_own_or_admin"
on public.profiles
for select
to authenticated
using (id = (select auth.uid()) or (select public.is_admin()));

create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;
grant update (
  first_name,
  last_name,
  birth_date,
  avatar_url,
  objective,
  personal_goal,
  weekly_goal,
  level,
  modality,
  onboarding_completed
) on table public.profiles to authenticated;

grant usage on type public.app_role to authenticated;
grant usage on type public.subscription_status to authenticated;
