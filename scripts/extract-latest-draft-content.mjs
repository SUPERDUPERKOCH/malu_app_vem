import { readFile, writeFile } from 'node:fs/promises';
import vm from 'node:vm';

const [, , sourcePath, outputPath] = process.argv;

if (!sourcePath || !outputPath) {
  console.error('Uso: node scripts/extract-latest-draft-content.mjs <vem-app.html> <saida.json>');
  process.exit(1);
}

const source = await readFile(sourcePath, 'utf8');

function initializerOf(name) {
  const marker = `const ${name}=`;
  const markerAt = source.indexOf(marker);
  if (markerAt < 0) throw new Error(`Constante ${name} não encontrada no esboço.`);

  const start = markerAt + marker.length;
  const opening = source[start];
  const closing = opening === '{' ? '}' : opening === '[' ? ']' : null;
  if (!closing) throw new Error(`Inicializador de ${name} não é objeto nem array.`);

  let depth = 0;
  let quote = '';
  let escaped = false;
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
    if (character === opening) depth += 1;
    if (character === closing) depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Inicializador de ${name} não foi fechado.`);
}

// Avalia somente os dois literais de dados em um contexto sem acesso a Node,
// sem geração dinâmica de código e com limite curto de execução.
const context = vm.createContext({}, { codeGeneration: { strings: false, wasm: false } });
const workouts = vm.runInContext(`(${initializerOf('TREINOS_VEM')})`, context, { timeout: 1_000 });
context.TREINOS_VEM = workouts;
const content = vm.runInContext(`(${initializerOf('CONTEUDO_EXEMPLO')})`, context, { timeout: 1_000 });

const documents = {
  workouts: content.treinos,
  meal_plans: content.cardapios,
  course: content.curso,
  agenda: content.agenda,
  general: content.geral,
};

for (const [key, value] of Object.entries(documents)) {
  if (!value || typeof value !== 'object') throw new Error(`Documento ${key} ausente ou inválido.`);
}

const counts = {
  exercises: documents.workouts.exercicios?.length ?? 0,
  programs: documents.workouts.programas?.length ?? 0,
  mealPlans: documents.meal_plans.lista?.length ?? 0,
  courseModules: documents.course.modulos?.length ?? 0,
  meetings: documents.agenda.encontros?.length ?? 0,
  runningPlans: documents.general.corrida?.length ?? 0,
};

if (outputPath.toLowerCase().endsWith('.sql')) {
  const sqlString = (value) => value == null || value === '' ? 'null' : `'${String(value).replaceAll("'", "''")}'`;
  const rows = Object.entries(documents).map(([key, value]) => {
    const metadata = JSON.stringify({ importedFrom: 'vem-app.html', ...counts });
    return `('${key}', $content$${JSON.stringify(value)}$content$::jsonb, true, 3, '3', 'latest-html-draft', now(), $meta$${metadata}$meta$::jsonb)`;
  });
  const meetings = (documents.agenda.encontros ?? []).map((meeting) =>
    `(${sqlString(meeting.id)}, ${sqlString(meeting.data)}, ${sqlString(meeting.hora)}, ${sqlString(meeting.tema)}, ${sqlString(meeting.responsavel)}, ${sqlString(meeting.link)}, ${sqlString(meeting.gravacao)}, true, ${Number(meeting.duracao) || 60}, ${sqlString(meeting.tipo || 'weekly')}, ${sqlString(meeting.materiais)})`
  );
  const sql = `-- Gerado por scripts/extract-latest-draft-content.mjs a partir do último esboço VEM.\n` +
    `insert into public.content_documents\n  (key, content, active, version, schema_version, source, published_at, metadata)\nvalues\n  ${rows.join(',\n  ')}\n` +
    `on conflict (key) do update set\n  content = excluded.content,\n  active = true,\n  schema_version = excluded.schema_version,\n  source = excluded.source,\n  published_at = excluded.published_at,\n  metadata = excluded.metadata;\n` +
    `${meetings.length ? `\ninsert into public.meetings\n  (id, meeting_date, meeting_time, topic, responsible, join_url, recording_url, active, duration_minutes, meeting_type, materials_url)\nvalues\n  ${meetings.join(',\n  ')}\non conflict (id) do update set\n  meeting_date = excluded.meeting_date,\n  meeting_time = excluded.meeting_time,\n  topic = excluded.topic,\n  responsible = excluded.responsible,\n  join_url = excluded.join_url,\n  recording_url = excluded.recording_url,\n  active = excluded.active,\n  duration_minutes = excluded.duration_minutes,\n  meeting_type = excluded.meeting_type,\n  materials_url = excluded.materials_url;\n` : ''}`;
  await writeFile(outputPath, sql, 'utf8');
} else {
  await writeFile(outputPath, `${JSON.stringify(documents, null, 2)}\n`, 'utf8');
}

console.log(JSON.stringify({
  outputPath,
  keys: Object.keys(documents),
  ...counts,
}, null, 2));
