create table public.onboarding_quizzes (
  user_id uuid primary key references auth.users (id) on delete cascade,
  answers jsonb not null,
  recommendations jsonb not null,
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint onboarding_quizzes_answers_object check (jsonb_typeof(answers) = 'object'),
  constraint onboarding_quizzes_recommendations_object check (jsonb_typeof(recommendations) = 'object')
);

create trigger onboarding_quizzes_set_updated_at before update on public.onboarding_quizzes
for each row execute function public.set_updated_at();

alter table public.onboarding_quizzes enable row level security;
create policy "onboarding_quizzes_private_to_owner" on public.onboarding_quizzes for all to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

revoke all on table public.onboarding_quizzes from anon, authenticated;
grant select, insert, update, delete on table public.onboarding_quizzes to authenticated;
