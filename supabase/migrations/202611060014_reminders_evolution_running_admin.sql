-- Etapas 4 a 7: lembretes, Mapa da Evolução, corrida/atividades externas e indicadores da equipe.

-- Mapa da Evolução: notas de 0 a 10 para as 8 áreas da vida, no formato do esboço VEM.
alter table public.monthly_evaluations
  add column scores jsonb not null default '{}'::jsonb;

alter table public.monthly_evaluations
  add constraint monthly_evaluations_scores_object check (jsonb_typeof(scores) = 'object');

-- Corrida: dor ou incômodo informado no registro alimenta o coach.
alter table public.run_sessions
  add column pain boolean not null default false;
-- Índices de run_sessions, external_activities e user_reminders já existem desde a migration 011.

-- Progresso nas planilhas de corrida (planilha VEM e planilhas publicadas pela equipe).
create table public.running_plan_progress (
  user_id uuid not null references auth.users (id) on delete cascade,
  plan_id text not null,
  session_id text not null,
  completed_on date not null default current_date,
  created_at timestamptz not null default now(),
  primary key (user_id, plan_id, session_id)
);

alter table public.running_plan_progress enable row level security;
create policy "running_plan_progress_own_all" on public.running_plan_progress for all to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on table public.running_plan_progress from anon, authenticated;
grant select, insert, update, delete on table public.running_plan_progress to authenticated;

-- Desafio aceito do coach de corrida e histórico de desafios cumpridos.
alter table public.profiles
  add column running_state jsonb not null default '{}'::jsonb;

alter table public.profiles
  add constraint profiles_running_state_object check (jsonb_typeof(running_state) = 'object');

grant update (running_state) on table public.profiles to authenticated;

-- Indicadores agregados da equipe. Só considera participantes que permitiram compartilhar
-- os números; nunca expõe peso, medidas, saúde, respostas do quiz ou avaliações.
create or replace function public.admin_team_indicators()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  week_start date := date_trunc('week', (now() at time zone 'America/Sao_Paulo'))::date;
  result jsonb;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  with shared as (
    select p.id, p.meal_plan_id, p.objective, p.level, p.modality
    from public.profiles p
    where p.role = 'participant' and p.share_progress_with_team and p.active
  ),
  activity as (
    select s.user_id, (s.started_at at time zone 'America/Sao_Paulo')::date as day
    from public.workout_sessions s join shared on shared.id = s.user_id
    where s.status = 'completed'
    union all
    select a.user_id, a.activity_date from public.external_activities a join shared on shared.id = a.user_id
    union all
    select r.user_id, r.activity_date from public.run_sessions r join shared on shared.id = r.user_id
  )
  select jsonb_build_object(
    'quizzes', (select count(*) from public.onboarding_quizzes q join shared on shared.id = q.user_id),
    'activeThisWeek', (select count(distinct user_id) from activity where day >= week_start),
    'workoutsThisWeek', (select count(*) from activity where day >= week_start),
    'workoutsTotal', (select count(*) from activity),
    'perDay', (
      select coalesce(jsonb_agg(coalesce(c.total, 0) order by d.offset_day), '[]'::jsonb)
      from generate_series(0, 6) as d(offset_day)
      left join (select day, count(*) as total from activity where day >= week_start group by day) c
        on c.day = week_start + d.offset_day
    ),
    'mealPlans', (select coalesce(jsonb_object_agg(k, n), '{}'::jsonb) from (select coalesce(meal_plan_id, '') as k, count(*) as n from shared group by 1) x),
    'objectives', (select coalesce(jsonb_object_agg(k, n), '{}'::jsonb) from (select coalesce(objective, '') as k, count(*) as n from shared group by 1) x),
    'levels', (select coalesce(jsonb_object_agg(k, n), '{}'::jsonb) from (select coalesce(level, '') as k, count(*) as n from shared group by 1) x),
    'modalities', (select coalesce(jsonb_object_agg(k, n), '{}'::jsonb) from (select coalesce(modality, '') as k, count(*) as n from shared group by 1) x)
  ) into result;

  return result;
end;
$$;

revoke all on function public.admin_team_indicators() from public;
grant execute on function public.admin_team_indicators() to authenticated;
