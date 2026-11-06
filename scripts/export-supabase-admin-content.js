const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'web', 'App_Vida_em_Movimento.html'), 'utf8');
const marker = 'const CONTEUDO_EXEMPLO=';
const markerIndex = source.indexOf(marker);
if (markerIndex < 0) throw new Error('CONTEUDO_EXEMPLO não encontrado.');
const start = source.indexOf('{', markerIndex + marker.length);
let depth = 0; let quote = ''; let escaped = false; let end = -1;
for (let index = start; index < source.length; index += 1) {
  const character = source[index];
  if (quote) { if (escaped) escaped = false; else if (character === '\\') escaped = true; else if (character === quote) quote = ''; continue; }
  if (character === '"' || character === "'" || character === '`') { quote = character; continue; }
  if (character === '{') depth += 1;
  if (character === '}' && --depth === 0) { end = index + 1; break; }
}
if (end < 0) throw new Error('Objeto CONTEUDO_EXEMPLO incompleto.');
const sandbox = {
  ex: (id, nome, grupo, dicas, erros, alternativa) => ({ id, nome, grupo, dicas, erros, alternativa: alternativa || '', video: '', videoLink: '', exemplo: true }),
  it: (exId, series, reps, carga, descanso, obs) => ({ id: `i${exId}-${series}-${String(reps).replace(/\W/g, '')}-${carga}`, exId, series, reps: String(reps), carga, descanso: descanso || 60, obs: obs || '' }),
};
const content = vm.runInNewContext(`(${source.slice(start, end)})`, sandbox, { timeout: 1000 });
const sqlString = (value) => `'${String(value).replace(/'/g, "''")}'`;
const agenda = content.agenda || {};
const meetings = (agenda.encontros || []).map((meeting) => `(${[
  sqlString(meeting.id), sqlString(meeting.data), meeting.hora ? sqlString(meeting.hora) : 'null',
  sqlString(meeting.tema || 'Encontro VEM'), meeting.responsavel ? sqlString(meeting.responsavel) : 'null',
  meeting.link ? sqlString(meeting.link) : 'null', meeting.gravacao ? sqlString(meeting.gravacao) : 'null', 'true',
].join(', ')})`).join(',\n  ');
const rewards = [
  ['pr1', 'Café sozinha num lugar especial', 'Meia hora só sua, com o café que você mais gosta.', 'workouts', 3],
  ['pr2', 'Fazer a unha', 'Escolha a cor que combina com essa nova fase.', 'workouts', 7],
  ['pr3', 'Massagem', 'Seu corpo trabalhou. Agora ele merece descansar.', 'workouts', 15],
  ['pr4', 'Comprar algo pequeno pra você', 'Um mimo para celebrar sua conquista.', 'workouts', 22],
  ['pr5', 'Cuidar do cabelo', 'Corte, hidratação ou aquele cuidado que você adiou.', 'workouts', 30],
  ['pr6', 'Tarde de autocuidado', 'Livro, banho demorado ou série favorita. Sem culpa.', 'streak', 7],
  ['pr7', 'Dia de spa', 'Você chegou longe. Celebre do jeito que merece.', 'workouts', 60],
].map((reward, index) => `(${sqlString(reward[0])}, ${sqlString(reward[1])}, ${sqlString(reward[2])}, ${sqlString(reward[3])}, ${reward[4]}, ${index + 1}, true)`).join(',\n  ');
const generalJson = JSON.stringify(content.geral || {});
const vemSettingsJson = JSON.stringify({ call: agenda.call || null });
const sql = `-- Conteúdo administrativo inicial extraído da versão anterior.\ninsert into public.content_documents (key, content, active) values\n  ('general', $content$${generalJson}$content$::jsonb, true),\n  ('vem_settings', $content$${vemSettingsJson}$content$::jsonb, true)\non conflict (key) do update set content = excluded.content, active = excluded.active, updated_at = now();\n\n${meetings ? `insert into public.meetings (id, meeting_date, meeting_time, topic, responsible, join_url, recording_url, active) values\n  ${meetings}\non conflict (id) do update set meeting_date = excluded.meeting_date, meeting_time = excluded.meeting_time, topic = excluded.topic, responsible = excluded.responsible, join_url = excluded.join_url, recording_url = excluded.recording_url, active = excluded.active, updated_at = now();\n\n` : ''}insert into public.rewards (id, name, description, metric, target, sort_order, active) values\n  ${rewards}\non conflict (id) do update set name = excluded.name, description = excluded.description, metric = excluded.metric, target = excluded.target, sort_order = excluded.sort_order, active = excluded.active, updated_at = now();\n`;
const output = path.join(root, 'supabase', 'migrations', '202611060008_seed_vem_administration.sql');
fs.writeFileSync(output, sql);
console.log(`Migration gerada: ${path.relative(root, output)} (${Math.round(sql.length / 1024)} KB)`);
