import { File, Paths } from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import { ACTIVITY_TYPES, dateKey, estimateCalories, latestBodyWeight } from './activities';
import { supabase } from './supabase';

export interface DaySummary {
  names: string[];
  count: number;
  minutes: number;
  /** Volume de carga: soma de repetições × kg das séries concluídas. */
  volumeKg: number;
  calories: number;
  sets: number;
  weightMeasured: boolean;
}

/** Frases de conclusão do esboço VEM. */
export const COMPLETION_PHRASES = [
  'Ninguém viu, mas o seu corpo viu. E agradeceu.', 'Você apareceu pra você hoje. Isso é tudo.', 'Constância é isso: fazer mesmo sem vontade.',
  'Mais uma promessa cumprida com você mesma.', 'Hoje você foi a mulher que decidiu ser.', 'O treino acabou. O orgulho fica.', 'Você é a prova de que dá pra começar de onde está.',
];

const MET_WORKOUT = 5;
const MET_RUN = 9.8;

async function currentUserId(): Promise<string> { const { data, error } = await supabase.auth.getUser(); if (error) throw error; if (!data.user) throw new Error('not_authenticated'); return data.user.id; }

/** Resumo de tudo que foi concluído no dia: treinos do app, corridas e atividades externas. */
export async function loadDaySummary(date = dateKey()): Promise<DaySummary> {
  const userId = await currentUserId();
  const [y, m, d] = date.split('-').map(Number);
  const start = new Date(y ?? 2026, (m ?? 1) - 1, d ?? 1); const end = new Date(start); end.setDate(end.getDate() + 1);
  const [sessionsResult, externalResult, runsResult, weight] = await Promise.all([
    supabase.from('workout_sessions').select('id, name, elapsed_ms').eq('user_id', userId).eq('status', 'completed').gte('started_at', start.toISOString()).lt('started_at', end.toISOString()),
    supabase.from('external_activities').select('activity_type, duration_minutes, estimated_calories').eq('user_id', userId).eq('activity_date', date),
    supabase.from('run_sessions').select('duration_seconds').eq('user_id', userId).eq('activity_date', date),
    latestBodyWeight(),
  ]);
  if (sessionsResult.error) throw sessionsResult.error; if (externalResult.error) throw externalResult.error; if (runsResult.error) throw runsResult.error;
  const sessions = sessionsResult.data ?? [];
  let volume = 0; let sets = 0;
  if (sessions.length) {
    const setsResult = await supabase.from('workout_session_sets').select('repetitions, load_kg').in('session_id', sessions.map((row) => row.id)).eq('completed', true);
    if (setsResult.error) throw setsResult.error;
    for (const set of setsResult.data ?? []) { sets += 1; volume += (set.repetitions ?? 0) * (Number(set.load_kg) || 0); }
  }
  const workoutMinutes = sessions.reduce((sum, row) => sum + Number(row.elapsed_ms) / 60000, 0);
  const external = externalResult.data ?? []; const runs = runsResult.data ?? [];
  const externalMinutes = external.reduce((sum, row) => sum + row.duration_minutes, 0);
  const runMinutes = runs.reduce((sum, row) => sum + row.duration_seconds / 60, 0);
  const calories = estimateCalories(MET_WORKOUT, weight.kg, workoutMinutes)
    + external.reduce((sum, row) => sum + (row.estimated_calories ?? estimateCalories(ACTIVITY_TYPES.find(([type]) => type === row.activity_type)?.[1] ?? 4.5, weight.kg, row.duration_minutes)), 0)
    + estimateCalories(MET_RUN, weight.kg, runMinutes);
  return {
    names: [...sessions.map((row) => row.name), ...external.map((row) => row.activity_type), ...runs.map(() => 'Corrida')],
    count: sessions.length + external.length + runs.length,
    minutes: Math.round(workoutMinutes + externalMinutes + runMinutes),
    volumeKg: Math.round(volume),
    calories: Math.round(calories),
    sets,
    weightMeasured: weight.measured,
  };
}

export const sharingAvailable = (): Promise<boolean> => Sharing.isAvailableAsync();

async function writePng(base64: string, name: string): Promise<File> {
  const file = new File(Paths.cache, `${name}.png`);
  if (file.exists) file.delete();
  await file.write(base64, { encoding: 'base64' });
  return file;
}

/** Salva o PNG direto na galeria do celular. Pede só a permissão de gravar fotos. */
export async function savePngToGallery(base64: string, name: string): Promise<void> {
  const permission = await MediaLibrary.requestPermissionsAsync(true, ['photo']);
  if (!permission.granted) throw new Error('Permita que o VEM salve fotos nas configurações do celular.');
  const file = await writePng(base64, name);
  await MediaLibrary.Asset.create(file.uri);
}

/** Salva o PNG (base64) no cache e abre o compartilhamento do celular (Instagram, galeria, WhatsApp…). */
export async function sharePng(base64: string, name: string): Promise<void> {
  const file = await writePng(base64, name);
  if (!(await Sharing.isAvailableAsync())) throw new Error('O compartilhamento não está disponível neste aparelho.');
  await Sharing.shareAsync(file.uri, { mimeType: 'image/png', dialogTitle: 'Compartilhar imagem VEM', UTI: 'public.png' });
}
