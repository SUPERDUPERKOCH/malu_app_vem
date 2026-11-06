const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'web', 'App_Vida_em_Movimento.html'), 'utf8');
const marker = 'const CONTEUDO_EXEMPLO=';
const markerIndex = source.indexOf(marker);
if (markerIndex < 0) throw new Error('CONTEUDO_EXEMPLO não encontrado.');

const start = source.indexOf('{', markerIndex + marker.length);
let depth = 0;
let quote = '';
let escaped = false;
let end = -1;
for (let index = start; index < source.length; index += 1) {
  const character = source[index];
  if (quote) {
    if (escaped) escaped = false;
    else if (character === '\\') escaped = true;
    else if (character === quote) quote = '';
    continue;
  }
  if (character === '"' || character === "'" || character === '`') {
    quote = character;
    continue;
  }
  if (character === '{') depth += 1;
  if (character === '}') {
    depth -= 1;
    if (depth === 0) {
      end = index + 1;
      break;
    }
  }
}
if (end < 0) throw new Error('Objeto CONTEUDO_EXEMPLO incompleto.');

const sandbox = {
  ex: (id, nome, grupo, dicas, erros, alternativa) => ({ id, nome, grupo, dicas, erros, alternativa: alternativa || '', video: '', videoLink: '', exemplo: true }),
  it: (exId, series, reps, carga, descanso, obs) => ({ id: `i${exId}-${series}-${String(reps).replace(/\W/g, '')}-${carga}`, exId, series, reps: String(reps), carga, descanso: descanso || 60, obs: obs || '' }),
};
const content = vm.runInNewContext(`(${source.slice(start, end)})`, sandbox, { timeout: 1000 });
const workoutJson = JSON.stringify(content.treinos);
const nutritionJson = JSON.stringify(content.cardapios);
if (!workoutJson || !nutritionJson) throw new Error('Treinos ou cardápios ausentes.');

const sql = `-- Gerado de web/App_Vida_em_Movimento.html por scripts/export-supabase-content.js.
insert into public.content_documents (key, content, active)
values
  ('workouts', $content$${workoutJson}$content$::jsonb, true),
  ('meal_plans', $content$${nutritionJson}$content$::jsonb, true)
on conflict (key) do update
set content = excluded.content,
    active = excluded.active,
    updated_at = now();
`;

const output = path.join(root, 'supabase', 'migrations', '202611060006_seed_workout_nutrition_content.sql');
fs.writeFileSync(output, sql);
console.log(`Migration gerada: ${path.relative(root, output)} (${Math.round(sql.length / 1024)} KB)`);
