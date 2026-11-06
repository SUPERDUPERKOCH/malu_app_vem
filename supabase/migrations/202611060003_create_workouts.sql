-- Conteudo editorial versionado no banco (treinos e cardapios).
create table public.content_documents (
  key text primary key,
  content jsonb not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint content_documents_key_not_blank check (length(trim(key)) > 0),
  constraint content_documents_content_object check (jsonb_typeof(content) = 'object')
);

create trigger content_documents_set_updated_at
before update on public.content_documents
for each row execute function public.set_updated_at();

create or replace function public.can_access_content()
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
      and active = true
      and (role in ('coach', 'admin') or subscription_status = 'active')
  );
$$;

revoke all on function public.can_access_content() from public;
grant execute on function public.can_access_content() to authenticated;

alter table public.content_documents enable row level security;

create policy "content_documents_read_active_subscribers"
on public.content_documents for select to authenticated
using (active = true and (select public.can_access_content()));

create policy "content_documents_admin_insert"
on public.content_documents for insert to authenticated
with check ((select public.is_admin()));

create policy "content_documents_admin_update"
on public.content_documents for update to authenticated
using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "content_documents_admin_delete"
on public.content_documents for delete to authenticated
using ((select public.is_admin()));

revoke all on table public.content_documents from anon, authenticated;
grant select, insert, update, delete on table public.content_documents to authenticated;

create table public.workout_sessions (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  workout_id text not null,
  program_id text not null,
  name text not null,
  focus text not null default '',
  status text not null default 'in_progress',
  started_at timestamptz not null,
  elapsed_ms bigint not null default 0,
  is_running boolean not null default true,
  running_since timestamptz,
  finished_at timestamptz,
  items jsonb not null default '[]'::jsonb,
  substitutions jsonb not null default '{}'::jsonb,
  exercise_map jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workout_sessions_status_valid check (status in ('in_progress', 'completed')),
  constraint workout_sessions_elapsed_nonnegative check (elapsed_ms >= 0),
  constraint workout_sessions_items_array check (jsonb_typeof(items) = 'array'),
  constraint workout_sessions_substitutions_object check (jsonb_typeof(substitutions) = 'object'),
  constraint workout_sessions_exercise_map_object check (jsonb_typeof(exercise_map) = 'object')
);

create index workout_sessions_user_started_idx on public.workout_sessions (user_id, started_at desc);
create index workout_sessions_user_status_idx on public.workout_sessions (user_id, status);

create trigger workout_sessions_set_updated_at
before update on public.workout_sessions
for each row execute function public.set_updated_at();

create table public.workout_session_sets (
  session_id text not null references public.workout_sessions (id) on delete cascade,
  item_id text not null,
  set_index smallint not null,
  repetitions integer,
  load_kg numeric(7,2) not null default 0,
  completed boolean not null default false,
  completed_at timestamptz,
  primary key (session_id, item_id, set_index),
  constraint workout_session_sets_index_nonnegative check (set_index >= 0),
  constraint workout_session_sets_reps_nonnegative check (repetitions is null or repetitions >= 0),
  constraint workout_session_sets_load_nonnegative check (load_kg >= 0)
);

alter table public.workout_sessions enable row level security;
alter table public.workout_session_sets enable row level security;

create policy "workout_sessions_own_all"
on public.workout_sessions for all to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy "workout_session_sets_select_own"
on public.workout_session_sets for select to authenticated
using (exists (select 1 from public.workout_sessions s where s.id = session_id and s.user_id = (select auth.uid())));
create policy "workout_session_sets_insert_own"
on public.workout_session_sets for insert to authenticated
with check (exists (select 1 from public.workout_sessions s where s.id = session_id and s.user_id = (select auth.uid())));
create policy "workout_session_sets_update_own"
on public.workout_session_sets for update to authenticated
using (exists (select 1 from public.workout_sessions s where s.id = session_id and s.user_id = (select auth.uid())))
with check (exists (select 1 from public.workout_sessions s where s.id = session_id and s.user_id = (select auth.uid())));
create policy "workout_session_sets_delete_own"
on public.workout_session_sets for delete to authenticated
using (exists (select 1 from public.workout_sessions s where s.id = session_id and s.user_id = (select auth.uid())));

revoke all on table public.workout_sessions, public.workout_session_sets from anon, authenticated;
grant select, insert, update, delete on table public.workout_sessions, public.workout_session_sets to authenticated;

