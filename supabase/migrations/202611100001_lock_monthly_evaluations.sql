-- Avaliacao mensal: primeira resposta um mes apos o cadastro e as seguintes
-- um mes apos a resposta anterior. Avaliacoes salvas sao historicas e imutaveis.

drop policy if exists "monthly_evaluations_own_all" on public.monthly_evaluations;

create policy "monthly_evaluations_select_own"
on public.monthly_evaluations
for select
to authenticated
using (user_id = (select auth.uid()));

revoke all on table public.monthly_evaluations from anon, authenticated;
grant select on table public.monthly_evaluations to authenticated;

create or replace function public.monthly_evaluation_status()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with evaluation_state as (
    select
      p.created_at as joined_at,
      max(e.created_at) as last_evaluation_at,
      count(e.id)::integer as evaluation_count
    from public.profiles p
    left join public.monthly_evaluations e on e.user_id = p.id
    where p.id = (select auth.uid())
    group by p.created_at
  )
  select jsonb_build_object(
    'joined_at', joined_at,
    'last_evaluation_at', last_evaluation_at,
    'next_evaluation_at', coalesce(last_evaluation_at, joined_at) + interval '1 month',
    'available', now() >= coalesce(last_evaluation_at, joined_at) + interval '1 month',
    'evaluation_count', evaluation_count
  )
  from evaluation_state;
$$;

revoke all on function public.monthly_evaluation_status() from public;
grant execute on function public.monthly_evaluation_status() to authenticated;

create or replace function public.submit_monthly_evaluation(p_scores jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  user_id uuid := (select auth.uid());
  joined_at timestamptz;
  next_at timestamptz;
  evaluation_id uuid;
begin
  if user_id is null then
    raise exception 'not_authenticated';
  end if;

  if p_scores is null or jsonb_typeof(p_scores) <> 'object' then
    raise exception 'invalid_scores';
  end if;

  -- Trava o perfil para duas requisicoes simultaneas nao criarem duas respostas.
  select p.created_at into joined_at
  from public.profiles p
  where p.id = user_id
  for update;

  select coalesce(max(e.created_at), joined_at) + interval '1 month'
    into next_at
  from public.monthly_evaluations e
  where e.user_id = user_id;

  if next_at is null then
    raise exception 'profile_not_found';
  end if;

  if now() < next_at then
    raise exception 'monthly_evaluation_locked';
  end if;

  insert into public.monthly_evaluations (user_id, reference_month, scores)
  values (
    user_id,
    date_trunc('month', timezone('America/Sao_Paulo', now()))::date,
    p_scores
  )
  returning id into evaluation_id;

  return evaluation_id;
end;
$$;

revoke all on function public.submit_monthly_evaluation(jsonb) from public;
grant execute on function public.submit_monthly_evaluation(jsonb) to authenticated;

comment on function public.monthly_evaluation_status() is
  'Informa quando a participante pode responder a proxima avaliacao mensal.';
comment on function public.submit_monthly_evaluation(jsonb) is
  'Registra uma avaliacao imutavel somente apos o intervalo de um mes.';
