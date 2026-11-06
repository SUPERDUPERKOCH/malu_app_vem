-- Estrutura da versão 3 do conteúdo VEM e estados necessários para as próximas telas.
alter table public.content_documents
  add column version integer not null default 1,
  add column schema_version text not null default '1',
  add column source text,
  add column published_at timestamptz,
  add column metadata jsonb not null default '{}'::jsonb;

alter table public.content_documents
  add constraint content_documents_version_positive check (version > 0),
  add constraint content_documents_metadata_object check (jsonb_typeof(metadata) = 'object');

create table public.content_document_revisions (
  id bigint generated always as identity primary key,
  document_key text not null,
  version integer not null,
  content jsonb not null,
  metadata jsonb not null default '{}'::jsonb,
  changed_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint content_document_revisions_content_object check (jsonb_typeof(content) = 'object'),
  constraint content_document_revisions_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create index content_document_revisions_key_version_idx
on public.content_document_revisions (document_key, version desc);

create or replace function public.archive_content_document_revision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.content is distinct from new.content then
    insert into public.content_document_revisions
      (document_key, version, content, metadata, changed_by)
    values
      (old.key, old.version, old.content, old.metadata, (select auth.uid()));
    new.version := old.version + 1;
  end if;
  return new;
end;
$$;

create trigger content_documents_archive_revision
before update on public.content_documents
for each row execute function public.archive_content_document_revision();

alter table public.content_document_revisions enable row level security;
create policy "content_revisions_admin_read"
on public.content_document_revisions for select to authenticated
using ((select public.is_admin()));

revoke all on table public.content_document_revisions from anon, authenticated;
grant select on table public.content_document_revisions to authenticated;

alter table public.profiles
  add column reminder_settings jsonb not null default '{}'::jsonb,
  add column theme_preference text not null default 'system',
  add column workout_clearance_at timestamptz;

alter table public.profiles
  add constraint profiles_reminder_settings_object check (jsonb_typeof(reminder_settings) = 'object'),
  add constraint profiles_theme_preference_valid check (theme_preference in ('system', 'light', 'dark'));

grant update (reminder_settings, theme_preference, workout_clearance_at)
on table public.profiles to authenticated;

create table public.user_workout_schedules (
  user_id uuid primary key references auth.users (id) on delete cascade,
  program_id text not null,
  starts_on date not null default current_date,
  weekday_plan jsonb not null default '{}'::jsonb,
  phase_index smallint not null default 0,
  current_week smallint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_workout_schedules_weekday_plan_object check (jsonb_typeof(weekday_plan) = 'object'),
  constraint user_workout_schedules_phase_nonnegative check (phase_index >= 0),
  constraint user_workout_schedules_week_positive check (current_week between 1 and 104)
);

create trigger user_workout_schedules_set_updated_at
before update on public.user_workout_schedules
for each row execute function public.set_updated_at();

create table public.user_reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  body text,
  kind text not null default 'other',
  reminder_time time,
  weekdays smallint[] not null default '{}'::smallint[],
  scheduled_at timestamptz,
  interval_minutes integer,
  window_start time,
  window_end time,
  source text not null default 'user',
  content_ref text,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_reminders_title_not_blank check (length(trim(title)) between 1 and 120),
  constraint user_reminders_kind_valid check (kind in ('water', 'meal', 'workout', 'meeting', 'reading', 'task', 'movement', 'self_care', 'other')),
  constraint user_reminders_source_valid check (source in ('user', 'team', 'system')),
  constraint user_reminders_weekdays_valid check (weekdays <@ array[1,2,3,4,5,6,7]::smallint[]),
  constraint user_reminders_interval_positive check (interval_minutes is null or interval_minutes > 0)
);

create index user_reminders_user_enabled_idx on public.user_reminders (user_id, enabled);
create trigger user_reminders_set_updated_at before update on public.user_reminders
for each row execute function public.set_updated_at();

create table public.run_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  plan_id text,
  plan_session_id text,
  activity_date date not null default current_date,
  distance_km numeric(7,3),
  duration_seconds integer not null,
  perceived_effort smallint,
  notes text,
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint run_sessions_distance_positive check (distance_km is null or distance_km > 0),
  constraint run_sessions_duration_positive check (duration_seconds > 0),
  constraint run_sessions_effort_range check (perceived_effort is null or perceived_effort between 1 and 10)
);

create index run_sessions_user_date_idx on public.run_sessions (user_id, activity_date desc);
create trigger run_sessions_set_updated_at before update on public.run_sessions
for each row execute function public.set_updated_at();

create table public.external_activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  activity_date date not null default current_date,
  activity_type text not null,
  duration_minutes integer not null,
  distance_km numeric(7,3),
  estimated_calories integer,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint external_activities_type_not_blank check (length(trim(activity_type)) between 1 and 80),
  constraint external_activities_duration_positive check (duration_minutes > 0),
  constraint external_activities_distance_positive check (distance_km is null or distance_km > 0),
  constraint external_activities_calories_nonnegative check (estimated_calories is null or estimated_calories >= 0)
);

create index external_activities_user_date_idx on public.external_activities (user_id, activity_date desc);
create trigger external_activities_set_updated_at before update on public.external_activities
for each row execute function public.set_updated_at();

create table public.monthly_evaluations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  reference_month date not null,
  energy smallint,
  sleep smallint,
  self_esteem smallint,
  relationship_with_food smallint,
  consistency smallint,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, reference_month),
  constraint monthly_evaluations_month_start check (reference_month = date_trunc('month', reference_month)::date),
  constraint monthly_evaluations_energy_range check (energy is null or energy between 1 and 5),
  constraint monthly_evaluations_sleep_range check (sleep is null or sleep between 1 and 5),
  constraint monthly_evaluations_self_esteem_range check (self_esteem is null or self_esteem between 1 and 5),
  constraint monthly_evaluations_food_range check (relationship_with_food is null or relationship_with_food between 1 and 5),
  constraint monthly_evaluations_consistency_range check (consistency is null or consistency between 1 and 5)
);

create index monthly_evaluations_user_month_idx on public.monthly_evaluations (user_id, reference_month desc);
create trigger monthly_evaluations_set_updated_at before update on public.monthly_evaluations
for each row execute function public.set_updated_at();

create table public.course_lesson_progress (
  user_id uuid not null references auth.users (id) on delete cascade,
  module_id text not null,
  lesson_id text not null,
  completed_at timestamptz,
  last_position_seconds integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, module_id, lesson_id),
  constraint course_lesson_progress_position_nonnegative check (last_position_seconds >= 0)
);

create trigger course_lesson_progress_set_updated_at before update on public.course_lesson_progress
for each row execute function public.set_updated_at();

alter table public.meetings
  add column duration_minutes integer not null default 60,
  add column meeting_type text not null default 'weekly',
  add column materials_url text;

alter table public.meetings
  add constraint meetings_duration_positive check (duration_minutes > 0),
  add constraint meetings_type_not_blank check (length(trim(meeting_type)) between 1 and 40);

alter table public.workout_sessions
  add column scheduled_for date,
  add column phase_index smallint,
  add column estimated_calories integer,
  add column source text not null default 'program';

alter table public.workout_sessions
  add constraint workout_sessions_phase_nonnegative check (phase_index is null or phase_index >= 0),
  add constraint workout_sessions_calories_nonnegative check (estimated_calories is null or estimated_calories >= 0),
  add constraint workout_sessions_source_valid check (source in ('program', 'manual', 'import'));

alter table public.user_workout_schedules enable row level security;
alter table public.user_reminders enable row level security;
alter table public.run_sessions enable row level security;
alter table public.external_activities enable row level security;
alter table public.monthly_evaluations enable row level security;
alter table public.course_lesson_progress enable row level security;

create policy "user_workout_schedules_own_all" on public.user_workout_schedules for all to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "user_reminders_own_all" on public.user_reminders for all to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "run_sessions_own_all" on public.run_sessions for all to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "external_activities_own_all" on public.external_activities for all to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "monthly_evaluations_own_all" on public.monthly_evaluations for all to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "course_lesson_progress_own_all" on public.course_lesson_progress for all to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

revoke all on table
  public.user_workout_schedules,
  public.user_reminders,
  public.run_sessions,
  public.external_activities,
  public.monthly_evaluations,
  public.course_lesson_progress
from anon, authenticated;

grant select, insert, update, delete on table
  public.user_workout_schedules,
  public.user_reminders,
  public.run_sessions,
  public.external_activities,
  public.monthly_evaluations,
  public.course_lesson_progress
to authenticated;
