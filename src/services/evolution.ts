import type { Json } from '../types/database';
import { listDailyCheckins, type DailyCheckin } from './dailyCheckins';
import { getCurrentUserProfile } from './users';
import { supabase } from './supabase';

/** As 8 áreas da avaliação mensal do esboço VEM (notas de 0 a 10). */
export const LIFE_AREAS = ['Corpo e treino', 'Alimentação', 'Mente e emoções', 'Autoestima', 'Relacionamentos', 'Trabalho e propósito', 'Descanso e sono', 'Diversão e hobbies'] as const;
export type LifeArea = (typeof LIFE_AREAS)[number];
export type AreaScores = Partial<Record<LifeArea, number>>;

export type MilestoneType = 'vitoria' | 'meta' | 'esporte';
export const MILESTONE_TYPES: ReadonlyArray<readonly [MilestoneType, string]> = [['vitoria', 'Vitória do dia a dia'], ['meta', 'Meta pessoal'], ['esporte', 'Conquista esportiva']];

export interface Measurement { id: string; date: string; weight?: number; waist?: number; hip?: number; arm?: number }
export interface MeasurementInput { date: string; weight?: number; waist?: number; hip?: number; arm?: number }
export interface Milestone { id: string; date: string; title: string; type: MilestoneType }
export interface JourneyStep { title: string; date: string; victory: boolean }
export interface UpcomingStep { title: string; remaining: string; progress: number }
export interface LoadSession { date: string; sets: Array<{ reps: number | null; load: number }>; max: number; volume: number }
export interface ExerciseLoads { exerciseId: string; name: string; inProgram: boolean; sessions: LoadSession[] }
export interface MonthlyEvaluation { month: string; scores: AreaScores; savedOn: string }
export interface WeekBar { start: string; count: number }
export interface HabitDay { date: string; water: number; meals: number; mood: number | null; trained: boolean }

export interface EvolutionData {
  /** Treinos do app + corridas + atividades externas. */
  activities: number;
  startDate: string | null;
  journeyDays: number;
  streak: number;
  bestStreak: number;
  weeklyGoal: number;
  weekCount: number;
  achievements: JourneyStep[];
  upcoming: UpcomingStep[];
  loads: ExerciseLoads[];
  measurements: Measurement[];
  milestones: Milestone[];
  evaluations: MonthlyEvaluation[];
  habits: HabitDay[];
  weeks: WeekBar[];
  trainedLast30: number;
  habitDaysLast30: number;
}

interface WorkoutContent { exercicios?: Array<{ id: string; nome?: string }>; programas?: Array<{ id: string; modalidade?: string; niveis?: string[]; treinos?: Array<{ itens?: Array<{ exId?: string }> }> }> }

export function dateKey(date = new Date()): string { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
export function parseDate(key: string): Date { const [y, m, d] = key.split('-').map(Number); return new Date(y ?? 2026, (m ?? 1) - 1, d ?? 1); }
const addDays = (date: Date, days: number): Date => { const next = new Date(date); next.setDate(next.getDate() + days); return next; };
const daysBetween = (from: string, to: string): number => Math.round((parseDate(to).getTime() - parseDate(from).getTime()) / 86_400_000);
export function weekStart(date: Date): Date { const start = new Date(date); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - ((start.getDay() + 6) % 7)); return start; }

async function currentUserId(): Promise<string> { const { data, error } = await supabase.auth.getUser(); if (error) throw error; if (!data.user) throw new Error('not_authenticated'); return data.user.id; }

function objectValue(value: Json | undefined): Record<string, Json | undefined> { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
function parseScores(value: Json): AreaScores {
  const raw = objectValue(value);
  const scores: AreaScores = {};
  for (const area of LIFE_AREAS) { const item = raw[area]; if (typeof item === 'number' && item >= 0 && item <= 10) scores[area] = item; }
  return scores;
}
const mealsCount = (checkin: DailyCheckin): number => Object.values(checkin.meals).filter(Boolean).length;
const hasHabit = (checkin: DailyCheckin): boolean => checkin.waterGlasses > 0 || !!checkin.mood || mealsCount(checkin) > 0;

function streakFrom(dates: Set<string>): number {
  let count = 0; let cursor = new Date();
  if (!dates.has(dateKey(cursor))) cursor = addDays(cursor, -1);
  while (dates.has(dateKey(cursor))) { count += 1; cursor = addDays(cursor, -1); }
  return count;
}

function bestStreakFrom(dates: string[]): number {
  let best = 0; let current = 0; let previous: string | null = null;
  for (const date of dates) { current = previous && daysBetween(previous, date) === 1 ? current + 1 : 1; best = Math.max(best, current); previous = date; }
  return best;
}

/** Marcos automáticos da jornada, como no esboço: treinos acumulados, semana com meta e meses de VEM. */
function journey(activityDates: string[], weeklyGoal: number): { achievements: JourneyStep[]; upcoming: UpcomingStep[] } {
  const total = activityDates.length; const start = activityDates[0] ?? null; const today = dateKey();
  let goalWeek: string | null = null;
  const perWeek = new Map<string, number>();
  for (const date of activityDates) {
    const key = dateKey(weekStart(parseDate(date)));
    const count = (perWeek.get(key) ?? 0) + 1; perWeek.set(key, count);
    if (count === weeklyGoal && !goalWeek) goalWeek = date;
  }
  const thisWeek = perWeek.get(dateKey(weekStart(new Date()))) ?? 0;
  const definitions: Array<{ title: string; kind: 'n' | 'week' | 'days'; value?: number }> = [
    { title: 'Primeiro treino', kind: 'n', value: 1 }, { title: 'Primeira semana com a meta batida', kind: 'week' }, { title: '5 treinos', kind: 'n', value: 5 },
    { title: 'Primeiro mês de VEM', kind: 'days', value: 30 }, { title: '10 treinos', kind: 'n', value: 10 }, { title: '25 treinos', kind: 'n', value: 25 },
    { title: 'Dois meses de VEM', kind: 'days', value: 60 }, { title: '50 treinos', kind: 'n', value: 50 }, { title: 'Três meses de VEM', kind: 'days', value: 90 }, { title: '100 treinos', kind: 'n', value: 100 },
  ];
  const achievements: JourneyStep[] = []; const upcoming: UpcomingStep[] = [];
  for (const item of definitions) {
    if (item.kind === 'n') {
      const value = item.value ?? 1;
      if (total >= value) achievements.push({ title: item.title, date: activityDates[value - 1] ?? today, victory: false });
      else upcoming.push({ title: item.title, remaining: value - total === 1 ? 'falta 1 treino' : `faltam ${value - total} treinos`, progress: total / value });
    } else if (item.kind === 'week') {
      if (goalWeek) achievements.push({ title: item.title, date: goalWeek, victory: false });
      else upcoming.push({ title: item.title, remaining: `bater ${weeklyGoal} treinos numa semana`, progress: Math.min(1, thisWeek / weeklyGoal) });
    } else if (!start) {
      upcoming.push({ title: item.title, remaining: 'começa no primeiro treino', progress: 0 });
    } else {
      const target = dateKey(addDays(parseDate(start), item.value ?? 30));
      if (today >= target) achievements.push({ title: item.title, date: target, victory: false });
      else { const left = daysBetween(today, target); upcoming.push({ title: item.title, remaining: left === 1 ? 'amanhã' : `em ${left} dias`, progress: 1 - left / (item.value ?? 30) }); }
    }
  }
  return { achievements, upcoming };
}

export async function loadEvolution(): Promise<EvolutionData> {
  const userId = await currentUserId();
  const today = new Date();
  const [profile, sessionsResult, runsResult, externalResult, measuresResult, milestonesResult, evaluationsResult, redemptionsResult, rewardsResult, contentResult, checkins] = await Promise.all([
    getCurrentUserProfile(),
    supabase.from('workout_sessions').select('id, started_at, exercise_map').eq('user_id', userId).eq('status', 'completed').order('started_at', { ascending: true }),
    supabase.from('run_sessions').select('activity_date').eq('user_id', userId),
    supabase.from('external_activities').select('activity_date').eq('user_id', userId),
    supabase.from('body_measurements').select('*').eq('user_id', userId).order('measured_on', { ascending: true }).order('created_at', { ascending: true }),
    supabase.from('progress_milestones').select('*').eq('user_id', userId).order('milestone_date', { ascending: false }),
    supabase.from('monthly_evaluations').select('reference_month, scores, updated_at').eq('user_id', userId).order('reference_month'),
    supabase.from('user_reward_redemptions').select('reward_id, redeemed_at').eq('user_id', userId),
    supabase.from('rewards').select('id, name'),
    supabase.from('content_documents').select('content').eq('key', 'workouts').maybeSingle(),
    listDailyCheckins(dateKey(addDays(today, -370)), dateKey(today)),
  ]);
  for (const result of [sessionsResult, runsResult, externalResult, measuresResult, milestonesResult, evaluationsResult, redemptionsResult, rewardsResult, contentResult]) if (result.error) throw result.error;

  const sessions = sessionsResult.data ?? [];
  const sessionDate = new Map(sessions.map((row) => [row.id, dateKey(new Date(row.started_at))]));
  const activityDates = [
    ...sessions.map((row) => sessionDate.get(row.id) ?? ''),
    ...(runsResult.data ?? []).map((row) => row.activity_date),
    ...(externalResult.data ?? []).map((row) => row.activity_date),
  ].filter(Boolean).sort();
  const uniqueDates = [...new Set(activityDates)];
  const weeklyGoal = profile?.weeklyGoal ?? 3;
  const { achievements, upcoming } = journey(activityDates, weeklyGoal);

  // Cargas: séries concluídas por exercício (considerando trocas registradas em exercise_map).
  const content = contentResult.data?.content as unknown as WorkoutContent | null;
  const names = new Map((content?.exercicios ?? []).map((exercise) => [exercise.id, exercise.nome ?? 'Exercício']));
  const modality = profile?.modality === 'home' ? 'casa' : 'academia';
  const level = profile?.level === 'advanced' ? 'avancada' : profile?.level === 'intermediate' ? 'intermediaria' : 'iniciante';
  const program = (content?.programas ?? []).find((item) => item.modalidade === modality && (item.niveis ?? []).includes(level));
  const programExercises = new Set((program?.treinos ?? []).flatMap((workout) => (workout.itens ?? []).flatMap((item) => (item.exId ? [item.exId] : []))));
  const loads = new Map<string, Map<string, LoadSession>>();
  if (sessions.length) {
    const setsResult = await supabase.from('workout_session_sets').select('session_id, item_id, set_index, repetitions, load_kg').in('session_id', sessions.map((row) => row.id)).eq('completed', true).order('set_index');
    if (setsResult.error) throw setsResult.error;
    const maps = new Map(sessions.map((row) => [row.id, objectValue(row.exercise_map)]));
    for (const set of setsResult.data ?? []) {
      const exerciseId = maps.get(set.session_id)?.[set.item_id];
      if (typeof exerciseId !== 'string') continue;
      const bySession = loads.get(exerciseId) ?? new Map<string, LoadSession>();
      const entry = bySession.get(set.session_id) ?? { date: sessionDate.get(set.session_id) ?? '', sets: [], max: 0, volume: 0 };
      const load = Number(set.load_kg) || 0;
      entry.sets.push({ reps: set.repetitions, load });
      entry.max = Math.max(entry.max, load);
      entry.volume += (set.repetitions ?? 0) * load;
      bySession.set(set.session_id, entry);
      loads.set(exerciseId, bySession);
    }
  }
  const exerciseLoads: ExerciseLoads[] = [...loads.entries()].map(([exerciseId, bySession]) => ({
    exerciseId, name: names.get(exerciseId) ?? 'Exercício', inProgram: programExercises.has(exerciseId),
    sessions: [...bySession.values()].sort((a, b) => (a.date < b.date ? -1 : 1)),
  })).sort((a, b) => Number(b.inProgram) - Number(a.inProgram) || b.sessions.length - a.sessions.length);

  // Hábitos: últimos 14 dias, 6 semanas e janela de 30 dias.
  const byDate = new Map(checkins.map((checkin) => [checkin.date, checkin]));
  const trainedSet = new Set(uniqueDates);
  const habits: HabitDay[] = Array.from({ length: 14 }, (_, index) => {
    const date = dateKey(addDays(today, index - 13)); const checkin = byDate.get(date);
    return { date, water: checkin?.waterGlasses ?? 0, meals: checkin ? mealsCount(checkin) : 0, mood: checkin?.mood ?? null, trained: trainedSet.has(date) };
  });
  const currentWeek = weekStart(today);
  const weeks: WeekBar[] = Array.from({ length: 6 }, (_, index) => {
    const start = addDays(currentWeek, -7 * (5 - index)); const end = addDays(start, 7);
    return { start: dateKey(start), count: activityDates.filter((date) => parseDate(date) >= start && parseDate(date) < end).length };
  });
  const last30 = Array.from({ length: 30 }, (_, index) => dateKey(addDays(today, -index)));

  const rewardNames = new Map((rewardsResult.data ?? []).map((row) => [row.id, row.name]));
  const redemptions = (redemptionsResult.data ?? []).flatMap((row) => {
    const name = rewardNames.get(row.reward_id);
    return name ? [{ title: `Prêmio resgatado: ${name}`, date: dateKey(new Date(row.redeemed_at)), victory: true }] : [];
  });
  const milestones: Milestone[] = (milestonesResult.data ?? []).map((row) => ({ id: row.id, date: row.milestone_date, title: row.title, type: row.type === 'meta' || row.type === 'esporte' ? row.type : 'vitoria' }));

  return {
    activities: activityDates.length,
    startDate: activityDates[0] ?? null,
    journeyDays: activityDates[0] ? daysBetween(activityDates[0], dateKey()) : 0,
    streak: streakFrom(trainedSet),
    bestStreak: bestStreakFrom(uniqueDates),
    weeklyGoal,
    weekCount: activityDates.filter((date) => parseDate(date) >= currentWeek).length,
    achievements: [...achievements, ...milestones.map((item) => ({ title: item.title, date: item.date, victory: true })), ...redemptions].sort((a, b) => (a.date < b.date ? -1 : 1)),
    upcoming: upcoming.slice(0, 3),
    loads: exerciseLoads,
    measurements: (measuresResult.data ?? []).map((row) => ({ id: row.id, date: row.measured_on, weight: row.weight_kg ?? undefined, waist: row.waist_cm ?? undefined, hip: row.hip_cm ?? undefined, arm: row.arm_cm ?? undefined })),
    milestones,
    evaluations: (evaluationsResult.data ?? []).map((row) => ({ month: row.reference_month.slice(0, 7), scores: parseScores(row.scores), savedOn: dateKey(new Date(row.updated_at)) })).filter((item) => Object.keys(item.scores).length > 0),
    habits,
    weeks,
    trainedLast30: last30.filter((date) => trainedSet.has(date)).length,
    habitDaysLast30: last30.filter((date) => { const checkin = byDate.get(date); return !!checkin && hasHabit(checkin); }).length,
  };
}

export async function saveMeasurement(input: MeasurementInput): Promise<void> {
  const userId = await currentUserId();
  if (![input.weight, input.waist, input.hip, input.arm].some((value) => typeof value === 'number' && value > 0)) throw new Error('Preencha pelo menos um campo.');
  if (input.date > dateKey()) throw new Error('A data não pode ser no futuro.');
  const { error } = await supabase.from('body_measurements').insert({ user_id: userId, measured_on: input.date, weight_kg: input.weight ?? null, waist_cm: input.waist ?? null, hip_cm: input.hip ?? null, arm_cm: input.arm ?? null });
  if (error) throw error;
}

export async function deleteMeasurement(id: string): Promise<void> {
  const userId = await currentUserId();
  const { error } = await supabase.from('body_measurements').delete().eq('user_id', userId).eq('id', id);
  if (error) throw error;
}

export async function saveMilestone(title: string, type: MilestoneType, date: string): Promise<void> {
  const userId = await currentUserId();
  if (!title.trim()) throw new Error('Escreva sua conquista.');
  if (date > dateKey()) throw new Error('A data não pode ser no futuro.');
  const { error } = await supabase.from('progress_milestones').insert({ user_id: userId, title: title.trim().slice(0, 180), type, milestone_date: date });
  if (error) throw error;
}

export async function deleteMilestone(id: string): Promise<void> {
  const userId = await currentUserId();
  const { error } = await supabase.from('progress_milestones').delete().eq('user_id', userId).eq('id', id);
  if (error) throw error;
}

/** `month` no formato `YYYY-MM`. */
export async function saveEvaluation(month: string, scores: AreaScores): Promise<void> {
  const userId = await currentUserId();
  const complete = Object.fromEntries(LIFE_AREAS.map((area) => [area, scores[area] ?? 5]));
  const { error } = await supabase.from('monthly_evaluations').upsert({ user_id: userId, reference_month: `${month}-01`, scores: complete }, { onConflict: 'user_id,reference_month' });
  if (error) throw error;
}

export async function deleteEvaluation(month: string): Promise<void> {
  const userId = await currentUserId();
  const { error } = await supabase.from('monthly_evaluations').delete().eq('user_id', userId).eq('reference_month', `${month}-01`);
  if (error) throw error;
}

export function averageScore(scores: AreaScores): number | null {
  const values = LIFE_AREAS.flatMap((area) => (scores[area] === undefined ? [] : [scores[area] as number]));
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

/** Frase do mês do esboço: destaca a área que mais subiu, ou a melhor e a que pede cuidado. */
export function evaluationMessage(scores: AreaScores, previous?: AreaScores): string {
  const media = averageScore(scores);
  if (media === null) return 'Dê uma nota pra cada área. A frase do mês aparece aqui.';
  const best = LIFE_AREAS.reduce((current, area) => ((scores[area] ?? -1) > (scores[current] ?? -1) ? area : current), LIFE_AREAS[0]);
  const worst = LIFE_AREAS.reduce((current, area) => ((scores[area] ?? 11) < (scores[current] ?? 11) ? area : current), LIFE_AREAS[0]);
  let rose: LifeArea | null = null; let biggest = 0;
  if (previous) for (const area of LIFE_AREAS) { const diff = (scores[area] ?? 0) - (previous[area] ?? 0); if (diff > biggest) { biggest = diff; rose = area; } }
  if (rose) return `${rose} subiu ${biggest} ${biggest === 1 ? 'ponto' : 'pontos'}. Você está se movendo, e dá pra ver. Que tal um carinho extra pra ${worst.toLowerCase()}?`;
  if (media >= 7) return `Você está num momento bonito, com ${best.toLowerCase()} em destaque. Cuide do que está bom e olhe com calma pra ${worst.toLowerCase()}.`;
  if (media >= 5) return `Base construída. ${best} está te sustentando. Escolha um passo pequeno em ${worst.toLowerCase()}.`;
  return `Meses difíceis também fazem parte. Você olhou pra sua vida com honestidade, e isso já é movimento. Comece por ${worst.toLowerCase()}, um passo de cada vez.`;
}
