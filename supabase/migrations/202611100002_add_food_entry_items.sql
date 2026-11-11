alter table public.food_entries
  add column food_items jsonb not null default '[]'::jsonb;

alter table public.food_entries
  add constraint food_entries_food_items_array check (jsonb_typeof(food_items) = 'array');

comment on column public.food_entries.food_items is
  'Alimentos estruturados da refeicao, com nome, gramas, kcal por 100 g e kcal calculadas.';
