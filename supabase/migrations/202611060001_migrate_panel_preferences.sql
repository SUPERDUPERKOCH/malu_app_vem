-- Preferencias editadas no Painel do aplicativo.
alter table public.profiles
  add column preferred_name text,
  add column notify_workouts boolean not null default true,
  add column notify_meetings boolean not null default true,
  add column notify_rewards boolean not null default true,
  add column share_progress_with_team boolean not null default true;

alter table public.profiles
  add constraint profiles_preferred_name_length
  check (preferred_name is null or length(trim(preferred_name)) between 1 and 80);

comment on column public.profiles.preferred_name is 'Nome curto escolhido pela participante para exibicao no app.';
comment on column public.profiles.notify_workouts is 'Receber lembretes relacionados aos treinos.';
comment on column public.profiles.notify_meetings is 'Receber lembretes dos encontros do VEM.';
comment on column public.profiles.notify_rewards is 'Receber avisos de premios liberados.';
comment on column public.profiles.share_progress_with_team is 'Permite compartilhar progresso de treino e plano com a equipe; nao inclui saude ou medidas.';

grant update (
  preferred_name,
  notify_workouts,
  notify_meetings,
  notify_rewards,
  share_progress_with_team
) on table public.profiles to authenticated;

