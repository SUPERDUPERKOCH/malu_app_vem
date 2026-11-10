-- Padroniza a comunicação do cardio nos programas de academia.
-- A duração é por sessão de treino; a grade semanal mostra apenas "cardio".

do $migration$
declare
  updated_programs jsonb;
begin
  select coalesce(
    jsonb_agg(
      case program->>'id'
        when 'academia-iniciante' then
          jsonb_set(
            jsonb_set(program, '{frequencia}', '"Musculação 3 a 4x por semana · Cardio 4 a 5x por semana · 30–40 min"'::jsonb),
            '{cardio}', '[["Duração","30–40 min por treino"]]'::jsonb
          )
        when 'academia-intermediaria' then
          jsonb_set(
            jsonb_set(program, '{frequencia}', '"Musculação 4 a 5x por semana · Cardio 5 a 6x por semana · 30–40 min"'::jsonb),
            '{cardio}', '[["Duração","30–40 min por treino"]]'::jsonb
          )
        when 'academia-avancada' then
          jsonb_set(
            jsonb_set(program, '{frequencia}', '"Musculação 5 a 6x por semana · Cardio 6 a 7x por semana · 30–40 min"'::jsonb),
            '{cardio}', '[["Duração","30–40 min por treino"]]'::jsonb
          )
        else program
      end
      order by ordinal
    ),
    '[]'::jsonb
  )
  into updated_programs
  from public.content_documents document,
       jsonb_array_elements(coalesce(document.content->'programas', '[]'::jsonb))
         with ordinality as programs(program, ordinal)
  where document.key = 'workouts';

  update public.content_documents
  set content = jsonb_set(content, '{programas}', updated_programs, true),
      version = greatest(coalesce(version, 0), 5),
      schema_version = '5',
      source = 'clube-vem-cardio-duration',
      published_at = now(),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'cardioDuration', '30–40 min por treino',
        'cardioDurationUpdatedAt', now()
      )
  where key = 'workouts';
end
$migration$;
