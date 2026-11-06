import type { Database, Json } from '../types/database';
import { markTodayWorkoutCompleted } from './dailyCheckins';
import { getCurrentUserProfile } from './users';
import { supabase } from './supabase';

export interface ExerciseDefinition { id: string; name: string; group: string; instructions: string; commonErrors: string; alternativeId?: string; videoUrl?: string }
export interface WorkoutItem { id: string; exerciseId: string; exercise: ExerciseDefinition; sets: number; repetitions: string; loadKg: number; supportsLoad: boolean; block: string; restSeconds: number; notes: string }
export interface MobilityExercise { id: string; name: string; repetitions: string; instructions: string }
export interface ProgramPhase { label: string; name: string; description: string; startWeek: number; endWeek: number }
export interface NativeWorkout { id: string; programId: string; letter: string; name: string; focus: string; weekdays: string[]; modality: string; levels: string[]; example: boolean; items: WorkoutItem[]; mobility: MobilityExercise[]; mobilityGroup: string | null; estimatedMinutes: number }
export interface WorkoutProfessional { name: string; registry: string }
export interface WorkoutProgramDetails { id: string; name: string; description: string; audience: string; frequency: string; duration: string; equipment: string; warmup: boolean; defaultWeek: Record<string, string>; phases: ProgramPhase[]; cardio: string[][]; rules: string[][]; responsible: WorkoutProfessional; workouts: NativeWorkout[] }
export interface WorkoutSchedule { programId: string; startsOn: string; weekdayPlan: Record<string, string>; currentWeek: number; phaseIndex: number; persisted: boolean }
export type DayKind = 'treino' | 'cardio' | 'folga';
export type TodayKind = 'treino' | 'cardio' | 'descanso' | 'livre';
export interface ScheduleCheck { trainingDays: number; required: number; conflict: [string, string] | null; valid: boolean }
/** Semana começando na segunda, como no esboço VEM. */
export const WEEK_DAYS = ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'] as const;
const JS_WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'] as const;
export function todayCode(date = new Date()): string { return JS_WEEKDAYS[date.getDay()] ?? 'seg'; }
export interface WorkoutSetRecord { reps: number | null; carga: number; feito: boolean }
export interface ActiveWorkoutSession {
  id: string; treinoId: string; programaId: string; nome: string; foco: string; status: 'andamento' | 'concluido'; inicio: number; acum: number; rodando: boolean; desde: number | null; duracao?: number; fim?: number;
  series: Record<string, WorkoutSetRecord[]>; trocas: Record<string, string>; exMap: Record<string, string>; mobilidade: string[];
  itens: Array<{ id: string; exId: string; series: number; reps: string; carga: number; descanso: number; obs: string }>;
}
export interface WorkoutOverview { workouts: NativeWorkout[]; program: WorkoutProgramDetails | null; schedule: WorkoutSchedule | null; todayPlan: string; todayKind: TodayKind; todayCardio: string; suggestedWorkoutId: string | null; activeSession: ActiveWorkoutSession | null; completedToday: ActiveWorkoutSession[]; completedTotal: number }

interface LegacyExercise { id: string; nome?: string; grupo?: string; dicas?: string; erros?: string; alternativa?: string; video?: string; videoLink?: string }
interface LegacyItem { id: string; exId: string; series?: number; reps?: string; carga?: number; kg?: boolean; bloco?: string; descanso?: number; obs?: string }
interface LegacyMobility { exId: string; qtd?: string; como?: string }
interface LegacyWorkout { id: string; letra?: string; nome?: string; foco?: string; dias?: string[]; mob?: string | null; itens?: LegacyItem[] }
interface LegacyProgram { id: string; nome?: string; modalidade?: string; niveis?: string[]; exemplo?: boolean; treinos?: LegacyWorkout[]; desc?: string; paraQuem?: string; frequencia?: string; duracao?: string; precisa?: string; semana?: Record<string, string>; fases?: string[][]; cardio?: string[][]; regras?: string[][]; aquecimento?: boolean }
interface LegacyContent { exercicios?: LegacyExercise[]; programas?: LegacyProgram[]; mobilidade?: Record<string, LegacyMobility[]>; responsavel?: { nome?: string; cref?: string } }
type SessionRow = Database['public']['Tables']['workout_sessions']['Row'];
type SetRow = Database['public']['Tables']['workout_session_sets']['Row'];

async function currentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!data.user) throw new Error('not_authenticated');
  return data.user.id;
}

function objectRecord(value: Json): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
}

/** Aceita ids em texto ou objetos `{ id }` gravados em `mobility_items`. */
function mobilityIds(value: Json | undefined): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (typeof entry === 'string') return [entry];
    if (entry && typeof entry === 'object' && !Array.isArray(entry) && typeof entry.id === 'string') return [entry.id];
    return [];
  });
}

function sessionItems(value: Json): ActiveWorkoutSession['itens'] {
  return Array.isArray(value) ? value as ActiveWorkoutSession['itens'] : [];
}

function elapsed(session: ActiveWorkoutSession): number {
  return session.acum + (session.rodando && session.desde ? Date.now() - session.desde : 0);
}

function estimatedMinutes(items: LegacyItem[]): number {
  const seconds = items.reduce((sum, item) => sum + (item.series ?? 0) * ((item.descanso ?? 60) + 40), 0);
  return Math.max(5, Math.round(seconds / 60));
}

function phaseRange(label: string, index: number): { startWeek: number; endWeek: number } {
  const weeks = [...label.matchAll(/\d+/g)].map((match) => Number(match[0]));
  return { startWeek: weeks[0] ?? index * 4 + 1, endWeek: weeks.at(-1) ?? index * 4 + 4 };
}

function mapWorkouts(content: LegacyContent | null, selectedProgramId?: string): NativeWorkout[] {
  const exercises = new Map((content?.exercicios ?? []).map((exercise) => [exercise.id, exercise]));
  return (content?.programas ?? []).filter((program) => !selectedProgramId || program.id === selectedProgramId).flatMap((program) => (program.treinos ?? []).map((workout) => {
    const rawItems = workout.itens ?? [];
    const mobility = workout.mob ? (content?.mobilidade?.[workout.mob] ?? []).map((item) => {
      const exercise = exercises.get(item.exId);
      return { id: item.exId, name: exercise?.nome ?? 'Mobilidade', repetitions: item.qtd ?? '', instructions: item.como ?? '' };
    }) : [];
    return {
      id: workout.id, programId: program.id, letter: workout.letra ?? workout.id.split('-').at(-1) ?? '', name: workout.nome ?? 'Treino', focus: workout.foco ?? 'Treino', weekdays: workout.dias ?? [], modality: program.modalidade ?? 'academia', levels: program.niveis ?? [], example: !!program.exemplo, mobility, mobilityGroup: mobility.length ? workout.mob ?? null : null, estimatedMinutes: estimatedMinutes(rawItems) + (mobility.length ? 5 : 0),
      items: rawItems.map((item) => { const exercise = exercises.get(item.exId); return { id: item.id, exerciseId: item.exId, sets: item.series ?? 0, repetitions: item.reps ?? '', loadKg: item.carga ?? 0, supportsLoad: item.kg === true || (item.carga ?? 0) > 0, block: item.bloco ?? '', restSeconds: item.descanso ?? 60, notes: item.obs ?? '', exercise: { id: item.exId, name: exercise?.nome ?? 'Exercício', group: exercise?.grupo ?? '', instructions: exercise?.dicas ?? '', commonErrors: exercise?.erros ?? '', alternativeId: exercise?.alternativa, videoUrl: exercise?.videoLink || exercise?.video } }; }),
    };
  }));
}

function mapProgram(content: LegacyContent | null, raw: LegacyProgram | undefined): WorkoutProgramDetails | null {
  if (!raw) return null;
  return {
    id: raw.id,
    name: raw.nome ?? 'Programa VEM',
    description: raw.desc ?? '',
    audience: raw.paraQuem ?? '',
    frequency: raw.frequencia ?? '',
    duration: raw.duracao ?? '',
    equipment: raw.precisa ?? '',
    warmup: raw.aquecimento === true,
    defaultWeek: { ...(raw.semana ?? {}) },
    responsible: { name: content?.responsavel?.nome?.trim() ?? '', registry: content?.responsavel?.cref?.trim() ?? '' },
    phases: (raw.fases ?? []).map((phase, index) => ({ label: phase[0] ?? `Fase ${index + 1}`, name: phase[1] ?? '', description: phase[2] ?? '', ...phaseRange(phase[0] ?? '', index) })),
    cardio: raw.cardio ?? [],
    rules: raw.regras ?? [],
    workouts: mapWorkouts(content, raw.id),
  };
}

function isoDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function weeksSince(startDate: string): number {
  const start = new Date(`${startDate}T12:00:00`);
  const today = new Date(`${isoDate()}T12:00:00`);
  return Math.max(1, Math.floor((today.getTime() - start.getTime()) / 604_800_000) + 1);
}

/** Semana e fase são sempre derivadas de `starts_on`; os campos gravados no banco são apenas um espelho do último cálculo. */
function scheduleProgress(program: WorkoutProgramDetails | null, startsOn: string): { currentWeek: number; phaseIndex: number } {
  const maxWeek = program?.phases.at(-1)?.endWeek ?? 12;
  const currentWeek = Math.min(maxWeek, weeksSince(startsOn));
  const phaseIndex = Math.max(0, program?.phases.findIndex((phase) => currentWeek >= phase.startWeek && currentWeek <= phase.endWeek) ?? 0);
  return { currentWeek, phaseIndex };
}

function toSession(row: SessionRow, sets: SetRow[]): ActiveWorkoutSession {
  const series: Record<string, WorkoutSetRecord[]> = {};
  for (const set of sets.filter((item) => item.session_id === row.id).sort((a, b) => a.set_index - b.set_index)) {
    (series[set.item_id] ??= [])[set.set_index] = { reps: set.repetitions, carga: Number(set.load_kg), feito: set.completed };
  }
  return { id: row.id, treinoId: row.workout_id, programaId: row.program_id, nome: row.name, foco: row.focus, status: row.status === 'completed' ? 'concluido' : 'andamento', inicio: new Date(row.started_at).getTime(), acum: Number(row.elapsed_ms), rodando: row.is_running, desde: row.running_since ? new Date(row.running_since).getTime() : null, ...(row.finished_at ? { fim: new Date(row.finished_at).getTime(), duracao: Number(row.elapsed_ms) } : {}), series, trocas: objectRecord(row.substitutions), exMap: objectRecord(row.exercise_map), mobilidade: mobilityIds(row.mobility_items), itens: sessionItems(row.items) };
}

async function getSession(sessionId: string): Promise<ActiveWorkoutSession | null> {
  const [{ data: row, error }, { data: sets, error: setsError }] = await Promise.all([
    supabase.from('workout_sessions').select('*').eq('id', sessionId).maybeSingle(),
    supabase.from('workout_session_sets').select('*').eq('session_id', sessionId),
  ]);
  if (error) throw error;
  if (setsError) throw setsError;
  return row ? toSession(row, sets ?? []) : null;
}

export async function loadWorkoutOverview(): Promise<WorkoutOverview> {
  const userId = await currentUserId();
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const end = new Date(start); end.setDate(end.getDate() + 1);
  const [documentResult, profile, sessionsResult, countResult, scheduleResult] = await Promise.all([
    supabase.from('content_documents').select('content').eq('key', 'workouts').maybeSingle(),
    getCurrentUserProfile(),
    supabase.from('workout_sessions').select('*').eq('user_id', userId).or(`status.eq.in_progress,and(status.eq.completed,started_at.gte.${start.toISOString()},started_at.lt.${end.toISOString()})`).order('started_at', { ascending: false }),
    supabase.from('workout_sessions').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'completed'),
    supabase.from('user_workout_schedules').select('*').eq('user_id', userId).maybeSingle(),
  ]);
  if (documentResult.error) throw documentResult.error;
  if (sessionsResult.error) throw sessionsResult.error;
  if (countResult.error) throw countResult.error;
  if (scheduleResult.error) throw scheduleResult.error;
  const rows = sessionsResult.data ?? [];
  let sets: SetRow[] = [];
  if (rows.length) {
    const setResult = await supabase.from('workout_session_sets').select('*').in('session_id', rows.map((row) => row.id));
    if (setResult.error) throw setResult.error;
    sets = setResult.data ?? [];
  }
  const content = (documentResult.data?.content ?? null) as LegacyContent | null;
  const allWorkouts = mapWorkouts(content);
  const modality = profile?.modality === 'home' ? 'casa' : 'academia';
  const level = profile?.level === 'advanced' ? 'avancada' : profile?.level === 'intermediate' ? 'intermediaria' : 'iniciante';
  const selectedRawProgram = (content?.programas ?? []).find((program) => program.modalidade === modality && (program.niveis ?? []).includes(level));
  const program = mapProgram(content, selectedRawProgram);
  const preferred = program?.workouts ?? [];
  const savedSchedule = scheduleResult.data?.program_id === program?.id ? scheduleResult.data : null;
  const startsOn = savedSchedule?.starts_on ?? isoDate();
  const { currentWeek, phaseIndex } = scheduleProgress(program, startsOn);
  const schedule: WorkoutSchedule | null = program ? {
    programId: program.id,
    startsOn,
    weekdayPlan: savedSchedule ? objectRecord(savedSchedule.weekday_plan) : { ...(selectedRawProgram?.semana ?? {}) },
    currentWeek,
    phaseIndex,
    persisted: !!savedSchedule,
  } : null;
  const today = todayCode();
  const todayValue = schedule?.weekdayPlan[today] ?? '';
  const suggested = preferred.find((workout) => workout.letter === todayValue) ?? (!schedule ? preferred.find((workout) => workout.weekdays.includes(today)) : undefined);
  const todayCardio = todayValue.startsWith('cardio') ? todayValue.split('|')[1] ?? '' : '';
  const todayKind: TodayKind = suggested ? 'treino' : todayValue.startsWith('cardio') ? 'cardio' : todayValue === 'descanso' ? 'descanso' : 'livre';
  const todayPlan = suggested?.name ?? (todayKind === 'cardio' ? `Cardio${todayCardio ? ` · ${todayCardio}` : ''}` : todayKind === 'descanso' ? 'Descanso' : 'Sem atividade programada');
  const sessions = rows.map((row) => toSession(row, sets));
  const activeSession = sessions.find((session) => session.status === 'andamento') ?? null;
  const activeWorkout = activeSession ? allWorkouts.find((workout) => workout.id === activeSession.treinoId) : undefined;
  const visibleWorkouts = activeWorkout && !preferred.some((workout) => workout.id === activeWorkout.id) ? [activeWorkout, ...preferred] : preferred;
  return { workouts: visibleWorkouts, program, schedule, todayPlan, todayKind, todayCardio, suggestedWorkoutId: suggested?.id ?? null, activeSession, completedToday: sessions.filter((session) => session.status === 'concluido'), completedTotal: countResult.count ?? 0 };
}

/** Minutos de cardio dos dias sem treino, conforme a semana sugerida do programa. */
export function cardioMinutes(program: WorkoutProgramDetails): string {
  const value = Object.values(program.defaultWeek).find((item) => item.startsWith('cardio'));
  return value?.split('|')[1] ?? '30–40 min';
}

export function dayKindsFromPlan(weekdayPlan: Record<string, string>): Record<string, DayKind> {
  return Object.fromEntries(WEEK_DAYS.map((day) => {
    const value = weekdayPlan[day] ?? 'descanso';
    return [day, value.startsWith('cardio') ? 'cardio' : value === 'descanso' ? 'folga' : 'treino'];
  }));
}

/** Como no esboço: a participante escolhe o tipo de cada dia e os treinos entram em ordem (A, B, C…). */
export function distributeSchedule(program: WorkoutProgramDetails, kinds: Record<string, DayKind>): Record<string, string> {
  const letters = program.workouts.map((workout) => workout.letter);
  const cardio = `cardio|${cardioMinutes(program)}`;
  let next = 0;
  return Object.fromEntries(WEEK_DAYS.map((day) => {
    const kind = kinds[day] ?? 'folga';
    if (kind === 'treino') { const letter = letters[next]; next += 1; return [day, letter ?? 'descanso']; }
    return [day, kind === 'cardio' ? cardio : 'descanso'];
  }));
}

/** Perna e glúteo (treinos com mobilidade inferior) nunca em dias seguidos, incluindo domingo → segunda. */
export function checkWorkoutSchedule(program: WorkoutProgramDetails, weekdayPlan: Record<string, string>): ScheduleCheck {
  const letters = new Set(program.workouts.map((workout) => workout.letter));
  const trainingDays = WEEK_DAYS.filter((day) => letters.has(weekdayPlan[day] ?? '')).length;
  const required = program.workouts.length;
  const lower = new Set(program.workouts.filter((workout) => workout.mobilityGroup === 'inferior').map((workout) => workout.letter));
  let conflict: [string, string] | null = null;
  for (let index = 0; index < WEEK_DAYS.length && !conflict; index += 1) {
    const day = WEEK_DAYS[index] ?? 'seg';
    const nextDay = WEEK_DAYS[(index + 1) % WEEK_DAYS.length] ?? 'seg';
    if (lower.has(weekdayPlan[day] ?? '') && lower.has(weekdayPlan[nextDay] ?? '')) conflict = [day, nextDay];
  }
  const eachOnce = program.workouts.every((workout) => WEEK_DAYS.filter((day) => weekdayPlan[day] === workout.letter).length === 1);
  return { trainingDays, required, conflict, valid: trainingDays === required && eachOnce && !conflict };
}

export function validateWorkoutSchedule(program: WorkoutProgramDetails, weekdayPlan: Record<string, string>): string[] {
  const check = checkWorkoutSchedule(program, weekdayPlan);
  const errors: string[] = [];
  if (check.trainingDays !== check.required) errors.push(`O seu programa tem ${check.required} treinos por semana.`);
  else if (!check.valid && !check.conflict) errors.push('Cada treino precisa aparecer uma vez na semana.');
  if (check.conflict) errors.push('Perna e glúteo não podem ficar em dias seguidos.');
  return errors;
}

/** Volta para a semana sugerida do programa (apaga a personalização). */
export async function resetWorkoutSchedule(): Promise<void> {
  const userId = await currentUserId();
  const result = await supabase.from('user_workout_schedules').delete().eq('user_id', userId);
  if (result.error) throw result.error;
}

export async function saveWorkoutSchedule(program: WorkoutProgramDetails, weekdayPlan: Record<string, string>, startsOn?: string): Promise<void> {
  const errors = validateWorkoutSchedule(program, weekdayPlan);
  if (errors.length) throw new Error(errors.join('\n'));
  const userId = await currentUserId();
  const effectiveStart = startsOn ?? isoDate();
  const { currentWeek, phaseIndex } = scheduleProgress(program, effectiveStart);
  const result = await supabase.from('user_workout_schedules').upsert({ user_id: userId, program_id: program.id, starts_on: effectiveStart, weekday_plan: weekdayPlan, phase_index: phaseIndex, current_week: currentWeek }, { onConflict: 'user_id' });
  if (result.error) throw result.error;
}

export async function startWorkout(workout: NativeWorkout, options?: { phaseIndex?: number }): Promise<ActiveWorkoutSession> {
  const userId = await currentUserId();
  const existing = await supabase.from('workout_sessions').select('id').eq('user_id', userId).eq('status', 'in_progress').order('started_at', { ascending: false }).limit(1).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) { const current = await getSession(existing.data.id); if (current) return current; }
  const now = new Date();
  const id = `${now.getTime().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const items: ActiveWorkoutSession['itens'] = workout.items.map((item) => ({ id: item.id, exId: item.exerciseId, series: item.sets, reps: item.repetitions, carga: item.loadKg, descanso: item.restSeconds, obs: item.notes }));
  const exerciseMap = Object.fromEntries(workout.items.map((item) => [item.id, item.exerciseId]));
  const { error } = await supabase.from('workout_sessions').insert({ id, user_id: userId, workout_id: workout.id, program_id: workout.programId, name: workout.name, focus: workout.focus, started_at: now.toISOString(), running_since: now.toISOString(), scheduled_for: isoDate(now), phase_index: options?.phaseIndex ?? null, items, exercise_map: exerciseMap });
  if (error) throw error;
  const setRows = workout.items.flatMap((item) => Array.from({ length: item.sets }, (_, setIndex) => ({ session_id: id, item_id: item.id, set_index: setIndex, repetitions: Number.isFinite(parseInt(item.repetitions, 10)) ? parseInt(item.repetitions, 10) : null, load_kg: item.loadKg })));
  if (setRows.length) { const result = await supabase.from('workout_session_sets').insert(setRows); if (result.error) throw result.error; }
  const created = await getSession(id);
  if (!created) throw new Error('workout_session_not_created');
  return created;
}

export async function toggleWorkoutSet(sessionId: string, itemId: string, setIndex: number): Promise<ActiveWorkoutSession | null> {
  const current = await supabase.from('workout_session_sets').select('completed').eq('session_id', sessionId).eq('item_id', itemId).eq('set_index', setIndex).single();
  if (current.error) throw current.error;
  const completed = !current.data.completed;
  const updated = await supabase.from('workout_session_sets').update({ completed, completed_at: completed ? new Date().toISOString() : null }).eq('session_id', sessionId).eq('item_id', itemId).eq('set_index', setIndex);
  if (updated.error) throw updated.error;
  return getSession(sessionId);
}

/** Marca/desmarca um exercício da mobilidade. Quando todos estão feitos, grava `mobility_completed_at`. */
export async function toggleMobilityItem(sessionId: string, itemId: string, totalItems: number): Promise<ActiveWorkoutSession | null> {
  const current = await supabase.from('workout_sessions').select('mobility_items').eq('id', sessionId).single();
  if (current.error) throw current.error;
  const done = mobilityIds(current.data.mobility_items);
  const next = done.includes(itemId) ? done.filter((id) => id !== itemId) : [...done, itemId];
  const updated = await supabase.from('workout_sessions').update({ mobility_items: next, mobility_completed_at: totalItems > 0 && next.length >= totalItems ? new Date().toISOString() : null }).eq('id', sessionId);
  if (updated.error) throw updated.error;
  return getSession(sessionId);
}

export async function setWorkoutLoad(sessionId: string, itemId: string, loadKg: number): Promise<ActiveWorkoutSession | null> {
  const result = await supabase.from('workout_session_sets').update({ load_kg: Math.max(0, loadKg) }).eq('session_id', sessionId).eq('item_id', itemId).eq('completed', false);
  if (result.error) throw result.error;
  return getSession(sessionId);
}

export async function toggleWorkoutTimer(sessionId: string): Promise<ActiveWorkoutSession | null> {
  const session = await getSession(sessionId);
  if (!session) return null;
  const update = session.rodando ? { elapsed_ms: elapsed(session), is_running: false, running_since: null } : { is_running: true, running_since: new Date().toISOString() };
  const result = await supabase.from('workout_sessions').update(update).eq('id', sessionId);
  if (result.error) throw result.error;
  return getSession(sessionId);
}

export async function finishWorkout(sessionId: string): Promise<void> {
  const session = await getSession(sessionId);
  if (!session) return;
  const now = new Date().toISOString();
  const result = await supabase.from('workout_sessions').update({ status: 'completed', elapsed_ms: elapsed(session), is_running: false, running_since: null, finished_at: now }).eq('id', sessionId);
  if (result.error) throw result.error;
  await markTodayWorkoutCompleted();
}

export async function discardWorkout(sessionId: string): Promise<void> {
  const result = await supabase.from('workout_sessions').delete().eq('id', sessionId).eq('status', 'in_progress');
  if (result.error) throw result.error;
}

export function workoutProgress(session: ActiveWorkoutSession): { completed: number; total: number; percentage: number } {
  const sets = Object.values(session.series).flat();
  const completed = sets.filter((set) => set.feito).length;
  return { completed, total: sets.length, percentage: sets.length ? Math.round(completed / sets.length * 100) : 0 };
}

export function workoutElapsed(session: ActiveWorkoutSession): number { return elapsed(session); }
