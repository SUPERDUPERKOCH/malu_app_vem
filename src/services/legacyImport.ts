import * as FileSystem from 'expo-file-system/legacy';
import type { Database, Json } from '../types/database';
import { supabase } from './supabase';
import { calculateRecommendation, type QuizAnswers } from './onboarding';

const OLD_DATA_DIRECTORY = `${FileSystem.documentDirectory}vem-dados/`;
const OLD_PHOTO_DIRECTORY = `${FileSystem.documentDirectory}vem-fotos/`;
type JsonObject = Record<string, unknown>;

const decodeKey = (name: string): string =>
  name.replace(/_([0-9a-f]{4})/g, (_match, hexadecimal: string) => String.fromCharCode(parseInt(hexadecimal, 16)));

function object(value: unknown): JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : {};
}

function numeric(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const result = Number(value);
  return Number.isFinite(result) && result >= 0 ? result : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function asJson(value: unknown, fallback: Json): Json {
  try { return JSON.parse(JSON.stringify(value)) as Json; } catch { return fallback; }
}

async function readOldData(): Promise<Map<string, unknown>> {
  const result = new Map<string, unknown>();
  try {
    const info = await FileSystem.getInfoAsync(OLD_DATA_DIRECTORY);
    if (!info.exists) return result;
    const names = await FileSystem.readDirectoryAsync(OLD_DATA_DIRECTORY);
    for (const name of names) {
      try {
        const raw = await FileSystem.readAsStringAsync(`${OLD_DATA_DIRECTORY}${name}`);
        result.set(decodeKey(name), JSON.parse(raw) as unknown);
      } catch { /* um arquivo inválido não deve impedir os demais */ }
    }
  } catch { /* instalação sem dados antigos */ }
  return result;
}

async function readOldPhotos(): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  try {
    const info = await FileSystem.getInfoAsync(OLD_PHOTO_DIRECTORY);
    if (!info.exists) return result;
    for (const name of await FileSystem.readDirectoryAsync(OLD_PHOTO_DIRECTORY)) {
      try { result.set(decodeKey(name), await FileSystem.readAsStringAsync(`${OLD_PHOTO_DIRECTORY}${name}`)); } catch { /* foto inválida */ }
    }
  } catch { /* instalação sem fotos antigas */ }
  return result;
}

function decodeBase64(value: string): ArrayBuffer {
  const binary = atob(value); const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

async function importPhoto(userId: string, date: string, photoId: string, photos: Map<string, string>): Promise<string | null> {
  const source = photos.get(photoId); if (!source) return null;
  const match = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/s.exec(source); if (!match?.[1] || !match[2]) return null;
  const extension = match[1] === 'image/png' ? 'png' : match[1] === 'image/webp' ? 'webp' : 'jpg';
  const path = `${userId}/${date}/${photoId}.${extension}`;
  const result = await supabase.storage.from('food-photos').upload(path, decodeBase64(match[2]), { contentType: match[1], upsert: true });
  if (result.error) throw result.error;
  return path;
}

function dateTime(value: unknown, date: string, fallbackHour = '12:00:00'): string {
  const timestamp = numeric(value);
  if (timestamp !== null && timestamp > 1_000_000_000) return new Date(timestamp).toISOString();
  if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) return new Date(value).toISOString();
  return new Date(`${date}T${fallbackHour}`).toISOString();
}

function profileUpdate(profile: JsonObject): Database['public']['Tables']['profiles']['Update'] {
  const notifications = object(profile.notif);
  const privacy = object(profile.privacidade);
  const level = stringValue(profile.nivel);
  const modality = stringValue(profile.modalidade);
  return {
    ...(stringValue(profile.apelido) ? { preferred_name: stringValue(profile.apelido) } : {}),
    ...(stringValue(profile.objetivo) ? { objective: stringValue(profile.objetivo) } : {}),
    ...(stringValue(profile.metaPessoal) ? { personal_goal: stringValue(profile.metaPessoal) } : {}),
    ...(numeric(profile.metaSemanal) !== null ? { weekly_goal: numeric(profile.metaSemanal) } : {}),
    ...(level ? { level: level === 'avancada' ? 'advanced' : level === 'intermediaria' ? 'intermediate' : 'beginner' } : {}),
    ...(modality ? { modality: modality === 'casa' ? 'home' : 'gym' } : {}),
    ...(typeof notifications.treino === 'boolean' ? { notify_workouts: notifications.treino } : {}),
    ...(typeof notifications.encontros === 'boolean' ? { notify_meetings: notifications.encontros } : {}),
    ...(typeof notifications.premios === 'boolean' ? { notify_rewards: notifications.premios } : {}),
    ...(typeof privacy.contarEquipe === 'boolean' ? { share_progress_with_team: privacy.contarEquipe } : {}),
    ...(stringValue(profile.cardapio) ? { meal_plan_id: stringValue(profile.cardapio) } : {}),
    ...(numeric(profile.metaKcal) !== null ? { calorie_goal: numeric(profile.metaKcal) } : {}),
    ...(profile.horarios ? { meal_times: asJson(profile.horarios, {}) } : {}),
  };
}

function importedQuizAnswers(value: unknown): QuizAnswers | null {
  const answers = object(object(value).respostas);
  const objective = { emagrecer: 'weight_loss', forca: 'strength', rotina: 'routine' }[String(answers.objetivo)] as QuizAnswers['objective'] | undefined;
  const activity = { sedentaria: 'sedentary', leve: 'light', moderada: 'moderate', alta: 'high' }[String(answers.atividade)] as QuizAnswers['activity'] | undefined;
  const experience = { iniciante: 'beginner', intermediaria: 'intermediate', avancada: 'advanced' }[String(answers.experiencia)] as QuizAnswers['experience'] | undefined;
  const location = { academia: 'gym', casa: 'home' }[String(answers.local)] as QuizAnswers['location'] | undefined;
  const nutrition = { tradicional: 'traditional', vegetariano: 'vegetarian', 'sem-gluten': 'gluten_free', 'sem-lactose': 'lactose_free' }[String(answers.alimentacao)] as QuizAnswers['nutrition'] | undefined;
  const health = { nenhuma: 'none', gestante: 'pregnant', condicao: 'condition', lesao: 'injury' }[String(answers.saude)] as QuizAnswers['health'] | undefined;
  const age = numeric(answers.idade); const heightCm = numeric(answers.altura); const weightKg = numeric(answers.peso); const daysPerWeek = numeric(answers.dias);
  if (!objective || !activity || !experience || !location || !nutrition || !health || age === null || heightCm === null || weightKg === null || daysPerWeek === null) return null;
  return { objective, activity, experience, location, nutrition, health, age, heightCm, weightKg, daysPerWeek };
}

async function importDay(userId: string, date: string, raw: unknown, photos: Map<string, string>): Promise<void> {
  const day = object(raw);
  const sessions = Array.isArray(day.sessoes) ? day.sessoes.map(object) : [];
  const completed = !!day.concluido || sessions.some((session) => session.status === 'concluido');
  const checkin = await supabase.from('daily_checkins').upsert({
    user_id: userId, checkin_date: date, water_glasses: numeric(day.agua) ?? 0,
    mood: numeric(day.humor), meals: asJson(day.refeicoes, {}), choices: asJson(day.escolhas, {}),
    custom_habits: asJson(day.custom, {}), workout_completed: completed,
  }, { onConflict: 'user_id,checkin_date' });
  if (checkin.error) throw checkin.error;

  for (const session of sessions) {
    const originalId = stringValue(session.id) ?? `${date}-${Math.random().toString(36).slice(2)}`;
    const sessionId = `legacy-${userId}-${originalId}`;
    const status = session.status === 'concluido' ? 'completed' : 'in_progress';
    const startedAt = dateTime(session.inicio, date);
    const elapsedMs = numeric(session.duracao) ?? numeric(session.acum) ?? 0;
    const row = await supabase.from('workout_sessions').upsert({
      id: sessionId, user_id: userId, workout_id: stringValue(session.treinoId) ?? 'legacy',
      program_id: stringValue(session.programaId) ?? 'legacy', name: stringValue(session.nome) ?? 'Treino importado',
      focus: stringValue(session.foco) ?? '', status, started_at: startedAt, elapsed_ms: elapsedMs,
      is_running: status === 'in_progress' && !!session.rodando,
      running_since: status === 'in_progress' && session.rodando ? dateTime(session.desde, date) : null,
      finished_at: status === 'completed' ? dateTime(session.fim, date, '18:00:00') : null,
      items: asJson(session.itens, []), substitutions: asJson(session.trocas, {}), exercise_map: asJson(session.exMap, {}),
    }, { onConflict: 'id' });
    if (row.error) throw row.error;
    const sets = object(session.series);
    const setRows: Database['public']['Tables']['workout_session_sets']['Insert'][] = [];
    for (const [itemId, rawSets] of Object.entries(sets)) {
      if (!Array.isArray(rawSets)) continue;
      rawSets.forEach((rawSet, setIndex) => {
        const set = object(rawSet);
        setRows.push({ session_id: sessionId, item_id: itemId, set_index: setIndex, repetitions: numeric(set.reps), load_kg: numeric(set.carga) ?? 0, completed: !!set.feito, completed_at: set.feito ? dateTime(session.fim, date, '18:00:00') : null });
      });
    }
    if (setRows.length) { const result = await supabase.from('workout_session_sets').upsert(setRows, { onConflict: 'session_id,item_id,set_index' }); if (result.error) throw result.error; }
  }

  const foods = Array.isArray(day.comidas) ? day.comidas.map(object) : [];
  if (foods.length) {
    const rows: Database['public']['Tables']['food_entries']['Insert'][] = [];
    for (let index = 0; index < foods.length; index += 1) {
      const food = foods[index] ?? {}; const photoId = stringValue(food.foto);
      rows.push({ user_id: userId, entry_date: date, id: stringValue(food.id) ?? `imported-${index}`, meal_ref: stringValue(food.ref) ?? 'outro', eaten_at: stringValue(food.hora), description: stringValue(food.desc) ?? 'Alimento importado', calories: numeric(food.kcal) ?? 0, source: stringValue(food.fonte) ?? 'importacao', photo_path: photoId ? await importPhoto(userId, date, photoId, photos) : null });
    }
    const result = await supabase.from('food_entries').upsert(rows, { onConflict: 'user_id,entry_date,id' });
    if (result.error) throw result.error;
  }
}

export async function importLegacyDataOnce(userId: string, alreadyImportedAt?: string): Promise<boolean> {
  if (alreadyImportedAt) return false;
  const [entries, photos] = await Promise.all([readOldData(), readOldPhotos()]);
  const profileEntry = [...entries.entries()].find(([key]) => /\/perfil$/.test(key));
  const oldProfile = object(profileEntry?.[1]);
  const importedProfile = profileUpdate(oldProfile);
  const quizEntry = [...entries.entries()].find(([key]) => /\/quiz$/.test(key));
  const quizAnswers = importedQuizAnswers(quizEntry?.[1]);
  if (quizAnswers) {
    const recommendation = calculateRecommendation(quizAnswers);
    const quiz = await supabase.from('onboarding_quizzes').upsert({ user_id: userId, answers: asJson(quizAnswers, {}), recommendations: asJson(recommendation, {}), completed_at: stringValue(object(quizEntry?.[1]).feitoEm) ?? new Date().toISOString() }, { onConflict: 'user_id' });
    if (quiz.error) throw quiz.error;
    Object.assign(importedProfile, { objective: quizAnswers.objective === 'weight_loss' ? 'Emagrecer com saúde' : quizAnswers.objective === 'strength' ? 'Ganhar força e condicionamento' : 'Manter o peso e criar rotina', weekly_goal: recommendation.weeklyGoal, level: recommendation.level, modality: recommendation.modality, meal_plan_id: recommendation.mealPlanId, calorie_goal: recommendation.calorieTarget, onboarding_completed: true });
  }

  for (const [key, value] of entries) {
    const day = /\/x\/dias\/(\d{4}-\d{2}-\d{2})$/.exec(key);
    if (day?.[1]) await importDay(userId, day[1], value, photos);
  }

  for (const [key, value] of entries) {
    const measureDate = /\/x\/medidas\//.test(key);
    if (measureDate) {
      const measure = object(value); const date = stringValue(measure.data);
      if (date) {
        const existing = await supabase.from('body_measurements').select('id').eq('user_id', userId).eq('measured_on', date).limit(1);
        if (existing.error) throw existing.error;
        if (!existing.data?.length) { const result = await supabase.from('body_measurements').insert({ user_id: userId, measured_on: date, weight_kg: numeric(measure.peso), waist_cm: numeric(measure.cintura), hip_cm: numeric(measure.quadril), arm_cm: numeric(measure.braco) }); if (result.error) throw result.error; }
      }
    }
    const milestoneKey = /\/x\/marcos\//.test(key);
    if (milestoneKey) {
      const milestone = object(value); const title = stringValue(milestone.titulo); const date = stringValue(milestone.data);
      if (title && date) {
        const existing = await supabase.from('progress_milestones').select('id').eq('user_id', userId).eq('milestone_date', date).eq('title', title).limit(1);
        if (existing.error) throw existing.error;
        if (!existing.data?.length) { const result = await supabase.from('progress_milestones').insert({ user_id: userId, milestone_date: date, title, type: stringValue(milestone.tipo) ?? 'victory' }); if (result.error) throw result.error; }
      }
    }
  }

  const redeemed = object(object(oldProfile.premios).resgatados);
  const rewardIds = Object.keys(redeemed);
  if (rewardIds.length) {
    const available = await supabase.from('rewards').select('id').in('id', rewardIds);
    if (available.error) throw available.error;
    const rows = (available.data ?? []).map((reward) => ({ user_id: userId, reward_id: reward.id, redeemed_at: dateTime(redeemed[reward.id], new Date().toISOString().slice(0, 10)) }));
    if (rows.length) { const result = await supabase.from('user_reward_redemptions').upsert(rows, { onConflict: 'user_id,reward_id' }); if (result.error) throw result.error; }
  }

  const importedAt = new Date().toISOString();
  const result = await supabase.from('profiles').update({ ...importedProfile, legacy_imported_at: importedAt }).eq('id', userId);
  if (result.error) throw result.error;
  try {
    await Promise.all([
      FileSystem.deleteAsync(OLD_DATA_DIRECTORY, { idempotent: true }),
      FileSystem.deleteAsync(OLD_PHOTO_DIRECTORY, { idempotent: true }),
    ]);
  } catch { /* os dados já estão seguros no Supabase e não devem ser reimportados */ }
  return true;
}
