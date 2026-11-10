-- O Clube VEM passa a trabalhar com no máximo quatro dias de treino por semana.
-- Normaliza metas antigas e remove o quinto treino dos programas legados.

update public.profiles
set weekly_goal = least(4, greatest(2, weekly_goal))
where weekly_goal is not null
  and (weekly_goal < 2 or weekly_goal > 4);

update public.onboarding_quizzes
set answers = jsonb_set(
      answers,
      '{daysPerWeek}',
      to_jsonb(least(4, greatest(2, coalesce((answers->>'daysPerWeek')::integer, 3)))),
      true
    ),
    recommendations = jsonb_set(
      recommendations,
      '{weeklyGoal}',
      to_jsonb(least(4, greatest(2, coalesce((recommendations->>'weeklyGoal')::integer, 3)))),
      true
    )
where coalesce((answers->>'daysPerWeek')::integer, 3) not between 2 and 4
   or coalesce((recommendations->>'weeklyGoal')::integer, 3) not between 2 and 4;

with document as (
  select content
  from public.content_documents
  where key = 'workouts'
), programs as (
  select program, ordinal
  from document,
       jsonb_array_elements(coalesce(content->'programas', '[]'::jsonb))
         with ordinality as source(program, ordinal)
), trimmed as (
  select program,
         ordinal,
         jsonb_path_query_array(coalesce(program->'treinos', '[]'::jsonb), '$[0 to 3]') as workouts
  from programs
), normalized as (
  select ordinal,
         jsonb_set(
           jsonb_set(
             jsonb_set(program, '{treinos}', workouts, true),
             '{semana}',
             coalesce((
               select jsonb_object_agg(day, case
                 when value #>> '{}' = 'descanso' or value #>> '{}' like 'cardio%' then value
                 when exists (
                   select 1 from jsonb_array_elements(workouts) workout
                   where workout->>'letra' = value #>> '{}'
                 ) then value
                 else '"descanso"'::jsonb
               end)
               from jsonb_each(coalesce(program->'semana', '{}'::jsonb)) as week(day, value)
             ), '{}'::jsonb),
             true
           ),
           '{frequencia}',
           to_jsonb(case program->>'id'
             when 'academia-iniciante' then 'Musculação 3x por semana · Cardio 4 a 5x por semana · 30–40 min'
             when 'academia-intermediaria' then 'Musculação 4x por semana · Cardio 5 a 6x por semana · 30–40 min'
             when 'academia-avancada' then 'Musculação 4x por semana · Cardio 6 a 7x por semana · 30–40 min'
             else format('%s treinos por semana', jsonb_array_length(workouts))
           end),
           true
         ) || case program->>'id'
           when 'academia-intermediaria' then jsonb_build_object('regras', jsonb_build_array(
             jsonb_build_array('Ordem', 'Complete os quatro treinos uma vez por semana.'),
             jsonb_build_array('Alongamentos', 'Faça os alongamentos indicados antes de cada treino.')
           ))
           when 'academia-avancada' then jsonb_build_object('regras', jsonb_build_array(
             jsonb_build_array('Ordem', 'Complete os quatro treinos uma vez por semana.'),
             jsonb_build_array('Alongamentos', 'Faça os alongamentos indicados antes de cada treino.')
           ))
           else '{}'::jsonb
         end as program
  from trimmed
), rebuilt as (
  select coalesce(jsonb_agg(program order by ordinal), '[]'::jsonb) as programs
  from normalized
)
update public.content_documents
set content = jsonb_set(content, '{programas}', rebuilt.programs, true),
    version = greatest(coalesce(version, 0), 6),
    schema_version = '6',
    source = 'clube-vem-max-four-training-days',
    published_at = now(),
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'maximumTrainingDaysPerWeek', 4,
      'trainingDaysUpdatedAt', now()
    )
from rebuilt
where key = 'workouts';
