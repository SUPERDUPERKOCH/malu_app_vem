import type { Json } from '../types/database';
import type { RunningPlanContent } from '../models/content';
import { markWorkoutCompletedOn } from './dailyCheckins';
import { supabase } from './supabase';

export interface RunStep { action: string; time: string; pace: string }
export type RunBlock = RunStep | { repeat: number; steps: RunStep[] };
export interface VemRunSession { id: string; number: number; week: string; type: 'Walk & Run' | 'Intervalado'; km?: string; minMinutes?: number; blocks: RunBlock[]; tip: string }
export interface RunRecord { id: string; date: string; km: number; durationSeconds: number; minutes: number; pace: number; effort: number | null; pain: boolean; notes: string }
export type ChallengeType = 'inicio' | 'recuperar' | 'retorno' | 'consolidar' | 'constancia' | 'ritmo' | 'distancia';
export interface Challenge { type: ChallengeType; title: string; km: number; minutes: number | null; pace: number | null; times?: number; text: string }
export interface CoachAdvice extends Challenge { reading: string[]; safety: string }
export interface RunningState { active: (Challenge & { acceptedOn: string }) | null; history: Array<{ type: ChallengeType; km: number; date: string }> }
export interface TeamRunningPlan { id: string; title: string; description: string; weeks: Array<{ id: string; title: string; text: string; releasesOn: string | null }> }
export interface RunningData { vemPlan: VemRunSession[]; progress: Record<string, Record<string, string>>; runs: RunRecord[]; state: RunningState; coach: CoachAdvice; teamPlans: TeamRunningPlan[] }
export interface RunInput { km: number; durationSeconds: number; effort: number; pain: boolean; date: string; notes: string }

export const VEM_PLAN_ID = 'vem-corrida';
export const EFFORT_OPTIONS: ReadonlyArray<readonly [number, string]> = [[3, 'Leve'], [5, 'Confortável'], [7, 'Puxado'], [9, 'No limite']];

/** Planilha de corrida VEM do esboço: 4 semanas, 3 treinos por semana, liberados em sequência. */
export const VEM_RUNNING_PLAN: VemRunSession[] = (() => {
  const walk = 'ritmo 10:30–12:00 min/km · 5,0–5,7 km/h'; const r1 = 'ritmo 7:30–9:00 min/km · 6,7–8,0 km/h'; const r2 = 'ritmo 7:40–9:00 min/km · 6,7–7,8 km/h'; const r3 = 'ritmo 7:30–8:50 min/km · 6,8–8,0 km/h';
  const easy = 'Comece no ritmo mais leve e só acelere se estiver muito confortável.';
  const hard = 'Correr no seu máximo (intensidade forte). Aqui não há ritmo programado: é o seu limite de hoje.';
  const w = (minutes: number): RunStep => ({ action: 'Caminhar', time: `${minutes} min`, pace: walk });
  const r = (minutes: number, pace: string): RunStep => ({ action: 'Correr', time: `${minutes} min`, pace });
  const sprint: RunStep = { action: 'Correr', time: '200 m', pace: 'forte, no seu máximo' };
  const rep = (repeat: number, ...steps: RunStep[]): RunBlock => ({ repeat, steps });
  type Draft = Omit<VemRunSession, 'id' | 'number' | 'week'>;
  const wr = (km: string, minMinutes: number, blocks: RunBlock[], tip = false): Draft => ({ type: 'Walk & Run', km, minMinutes, blocks, tip: tip ? easy : '' });
  const iv = (blocks: RunBlock[]): Draft => ({ type: 'Intervalado', blocks, tip: hard });
  const weeks: Draft[][] = [
    [wr('3,1', 35, [w(5), rep(6, r(1, r1), w(4))], true), wr('3,3', 35, [w(5), rep(6, r(2, r2), w(3))], true), wr('3,4', 37, [w(5), rep(4, r(1, r2), w(2)), rep(4, r(2, r2), w(3))], true)],
    [wr('3,2', 35, [w(5), rep(5, r(2, r2), w(4))], true), wr('3,5', 37, [w(5), rep(8, r(2, r2), w(2))], true), wr('3,8', 41, [w(5), rep(6, r(2, r2), w(4))], true)],
    [iv([w(5), rep(8, sprint, { action: 'Descansar parada', time: '1 min', pace: '' }), w(5)]), wr('3,3', 35, [w(5), rep(5, r(3, r2), w(3))]), wr('3,4', 35, [w(5), rep(6, r(3, r1), w(2))])],
    [iv([w(5), rep(10, sprint, w(2))]), wr('3,1', 30, [rep(5, w(2), r(4, r3))], true), wr('3,2', 30, [rep(6, w(1), r(4, r3))], true)],
  ];
  let number = 0;
  return weeks.flatMap((sessions, index) => sessions.map((session) => { number += 1; return { ...session, id: `vc${number}`, number, week: `Semana ${index + 1}` }; }));
})();

const r1 = (value: number): number => Math.round(value * 10) / 10;
export const formatKm = (value: number): string => `${value.toLocaleString('pt-BR', { maximumFractionDigits: 3 })} km`;
export function formatPace(pace: number | null | undefined): string {
  if (!pace || !Number.isFinite(pace)) return '–';
  const total = Math.round(pace * 60);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')} /km`;
}
/** Pace em minutos por quilômetro: tempo total dividido pela distância. */
export function calculatePace(durationSeconds: number, distanceKm: number): number | null {
  if (!(durationSeconds > 0) || !(distanceKm > 0)) return null;
  return durationSeconds / distanceKm / 60;
}
export function formatRunTime(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const rest = safe % 60;
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}` : `${minutes}:${String(rest).padStart(2, '0')}`;
}
export function dateKey(date = new Date()): string { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
const parseDate = (key: string): Date => { const [y, m, d] = key.split('-').map(Number); return new Date(y ?? 2026, (m ?? 1) - 1, d ?? 1); };
const daysBetween = (from: string, to: string): number => Math.round((parseDate(to).getTime() - parseDate(from).getTime()) / 86_400_000);
const addDays = (date: Date, days: number): Date => { const next = new Date(date); next.setDate(next.getDate() + days); return next; };

async function currentUserId(): Promise<string> { const { data, error } = await supabase.auth.getUser(); if (error) throw error; if (!data.user) throw new Error('not_authenticated'); return data.user.id; }
function objectValue(value: Json | undefined): Record<string, Json | undefined> { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }

function parseState(value: Json | undefined): RunningState {
  const raw = objectValue(value);
  const active = objectValue(raw.active);
  const history = Array.isArray(raw.history) ? raw.history.flatMap((item) => {
    const entry = objectValue(item);
    return typeof entry.type === 'string' && typeof entry.km === 'number' && typeof entry.date === 'string' ? [{ type: entry.type as ChallengeType, km: entry.km, date: entry.date }] : [];
  }) : [];
  const hasActive = typeof active.title === 'string' && typeof active.km === 'number';
  return {
    active: hasActive ? {
      type: (active.type as ChallengeType) ?? 'distancia', title: active.title as string, km: active.km as number,
      minutes: typeof active.minutes === 'number' ? active.minutes : null, pace: typeof active.pace === 'number' ? active.pace : null,
      ...(typeof active.times === 'number' ? { times: active.times } : {}), text: typeof active.text === 'string' ? active.text : '', acceptedOn: typeof active.acceptedOn === 'string' ? active.acceptedOn : dateKey(),
    } : null,
    history,
  };
}

/**
 * Coach de corrida do esboço: lê distância, ritmo, frequência, esforço e dor.
 * Aumenta no máximo 10% por vez, segura quando o esforço está alto e recua se houve dor.
 */
export function coachAdvice(runs: RunRecord[], state: RunningState): CoachAdvice {
  const safety = 'Aqueça 5 min caminhando. Se sentir dor que não passa, pare e procure um profissional.';
  if (!runs.length) {
    return { type: 'inicio', title: 'Primeiro passo: 20 minutos', km: 2, minutes: 20, pace: null, text: 'Alterne 1 min de corrida leve com 1min30 de caminhada, por 20 minutos. Pode caminhar mais se precisar.', reading: ['Ainda não tenho corridas suas. Registre a primeira e eu começo a entender seu ritmo.'], safety: 'Comece sempre com 5 min de caminhada pra aquecer.' };
  }
  const today = dateKey();
  const last = runs[runs.length - 1] as RunRecord;
  const days = daysBetween(last.date, today);
  const since28 = dateKey(addDays(new Date(), -28));
  const recent = runs.filter((run) => run.date >= since28);
  const weeks = Math.max(1, Math.min(4, Math.ceil((daysBetween(recent[0]?.date ?? today, today) + 1) / 7)));
  const frequency = recent.length / weeks;
  const weeklyVolume = recent.reduce((sum, run) => sum + run.km, 0) / weeks;
  const longest = Math.max(0, ...recent.map((run) => run.km));
  const efforts = runs.slice(-3).flatMap((run) => (run.effort ? [run.effort] : []));
  const effort = efforts.length ? efforts.reduce((sum, value) => sum + value, 0) / efforts.length : 5;
  const half = Math.floor(runs.length / 2);
  const paceBefore = half ? runs.slice(0, half).reduce((sum, run) => sum + run.pace, 0) / half : null;
  const paceAfter = runs.slice(half).reduce((sum, run) => sum + run.pace, 0) / (runs.length - half);
  const reading = [
    `${runs.length} ${runs.length === 1 ? 'corrida registrada' : 'corridas registradas'}; ${recent.length} nas últimas 4 semanas (${String(r1(frequency)).replace('.', ',')} por semana).`,
    `Volume médio: ${formatKm(weeklyVolume)} por semana. Mais longa recente: ${formatKm(longest)}.`,
    `Última: ${formatKm(last.km)} em ${formatRunTime(last.durationSeconds)} (${formatPace(last.pace)}), há ${days === 0 ? 'menos de 1 dia' : days === 1 ? '1 dia' : `${days} dias`}.`,
  ];
  if (paceBefore && runs.length >= 4) {
    const diff = Math.round((paceBefore - paceAfter) * 60);
    reading.push(diff > 3 ? `Seu ritmo melhorou cerca de ${diff} s/km desde as primeiras corridas.` : diff < -3 ? `Seu ritmo ficou ${-diff} s/km mais lento: pode ser cansaço, calor ou percursos diferentes.` : 'Seu ritmo está estável.');
  }
  if (efforts.length) reading.push(`Esforço das últimas corridas: ${effort <= 4 ? 'leve' : effort <= 6 ? 'confortável' : effort <= 7.5 ? 'puxado' : 'no limite'}.`);
  const base = { reading, safety };
  if (last.pain) {
    const km = r1(Math.max(1, last.km * 0.7));
    return { ...base, type: 'recuperar', title: 'Recuperar antes de avançar', km, minutes: null, pace: null, text: `Você marcou dor ou incômodo na última corrida. Faça ${formatKm(km)} bem leve (dá pra conversar) ou troque por caminhada. Só avançamos quando o corpo estiver bem.` };
  }
  if (days > 14) {
    const km = r1(Math.max(1, last.km * 0.7));
    return { ...base, type: 'retorno', title: 'Voltando com calma', km, minutes: null, pace: null, text: `Faz ${days} dias desde a última corrida. Volte com ${formatKm(km)} num ritmo confortável. Em 1 ou 2 corridas você retoma o nível de antes.` };
  }
  if (effort >= 8) {
    const pace = r1(last.pace + 0.25);
    return { ...base, type: 'consolidar', title: 'Consolidar o que você já conquistou', km: r1(last.km), minutes: null, pace, text: `As últimas corridas foram no limite. Repita ${formatKm(last.km)} uns 15 s/km mais devagar (${formatPace(pace)}). Ficar confortável nessa distância é o que libera o próximo passo.` };
  }
  if (frequency < 1.5 && runs.length >= 2) {
    return { ...base, type: 'constancia', title: 'Desafio de constância', km: r1(last.km), minutes: null, pace: null, times: 2, text: `Faça 2 corridas de ${formatKm(last.km)} nos próximos 7 dias. Correr com frequência rende mais do que correr longe de vez em quando.` };
  }
  const lastChallenge = state.history[state.history.length - 1];
  if (lastChallenge?.type === 'distancia' && effort <= 6 && runs.length >= 3) {
    const target = Math.max(last.pace * 0.97, last.pace - 1 / 6);
    return { ...base, type: 'ritmo', title: 'Desafio de ritmo', km: r1(last.km), minutes: Math.round(target * last.km), pace: Math.round(target * 1000) / 1000, text: `Você já fecha ${formatKm(last.km)} bem. Agora tente essa mesma distância em ${formatPace(target)} (cerca de ${Math.round((last.pace - target) * 60)} s/km mais rápido). Comece leve e acelere só na segunda metade.` };
  }
  const reference = Math.max(last.km, longest * 0.9);
  const km = r1(Math.max(reference + 0.2, reference + Math.min(reference * 0.1, 1)));
  const cap = weeklyVolume > 0 ? r1(weeklyVolume * 1.1) : km;
  return { ...base, type: 'distancia', title: effort <= 5 ? 'Hora de ir um pouco mais longe' : 'Mais um passo de distância', km, minutes: null, pace: null, text: `Corra ${formatKm(km)} num ritmo confortável (perto de ${formatPace(last.pace + 0.15)}). É um aumento de ${Math.round((km / reference - 1) * 100)}%, dentro do limite seguro de até 10% por vez.${weeklyVolume > 0 ? ` Na semana, tente não passar de ${formatKm(cap)} no total.` : ''}` };
}

const challengeDone = (challenge: Challenge, run: { km: number; pace: number }): boolean => run.km >= challenge.km * 0.95 && (!challenge.pace || run.pace <= challenge.pace * 1.02);

export async function loadRunning(): Promise<RunningData> {
  const userId = await currentUserId();
  const [runsResult, progressResult, profileResult, generalResult] = await Promise.all([
    supabase.from('run_sessions').select('*').eq('user_id', userId).not('distance_km', 'is', null).order('activity_date').order('completed_at'),
    supabase.from('running_plan_progress').select('*').eq('user_id', userId),
    supabase.from('profiles').select('running_state').eq('id', userId).single(),
    supabase.from('content_documents').select('content').eq('key', 'general').maybeSingle(),
  ]);
  if (runsResult.error) throw runsResult.error; if (progressResult.error) throw progressResult.error; if (profileResult.error) throw profileResult.error; if (generalResult.error) throw generalResult.error;
  const runs: RunRecord[] = (runsResult.data ?? []).flatMap((row) => {
    const km = Number(row.distance_km); const durationSeconds = row.duration_seconds; const minutes = durationSeconds / 60; const pace = calculatePace(durationSeconds, km);
    return km > 0 && durationSeconds > 0 && pace ? [{ id: row.id, date: row.activity_date, km, durationSeconds, minutes, pace, effort: row.perceived_effort, pain: row.pain, notes: row.notes ?? '' }] : [];
  });
  const progress: Record<string, Record<string, string>> = {};
  for (const row of progressResult.data ?? []) (progress[row.plan_id] ??= {})[row.session_id] = row.completed_on;
  const state = parseState(profileResult.data.running_state);
  const plans = (objectValue(generalResult.data?.content).corrida ?? []) as unknown as RunningPlanContent[];
  const teamPlans: TeamRunningPlan[] = (Array.isArray(plans) ? plans : []).filter((plan) => plan && !plan.exemplo && plan.titulo).map((plan) => ({
    id: plan.id, title: plan.titulo, description: plan.descricao ?? '',
    weeks: (plan.semanas ?? []).map((week) => ({ id: week.id, title: week.titulo, text: week.texto, releasesOn: week.liberaEm || null })),
  }));
  return { vemPlan: VEM_RUNNING_PLAN, progress, runs, state, coach: coachAdvice(runs, state), teamPlans };
}

/** Marca (ou desmarca) uma sessão de planilha. Na planilha VEM, só libera em sequência. */
export async function togglePlanSession(planId: string, sessionId: string, done: boolean, date = dateKey()): Promise<void> {
  const userId = await currentUserId();
  if (done) {
    const result = await supabase.from('running_plan_progress').upsert({ user_id: userId, plan_id: planId, session_id: sessionId, completed_on: date }, { onConflict: 'user_id,plan_id,session_id' });
    if (result.error) throw result.error;
    await markWorkoutCompletedOn(date);
  } else {
    const result = await supabase.from('running_plan_progress').delete().eq('user_id', userId).eq('plan_id', planId).eq('session_id', sessionId);
    if (result.error) throw result.error;
  }
}

async function saveState(state: RunningState): Promise<void> {
  const userId = await currentUserId();
  const result = await supabase.from('profiles').update({ running_state: state as unknown as Json }).eq('id', userId);
  if (result.error) throw result.error;
}

export async function acceptChallenge(challenge: Challenge, state: RunningState): Promise<void> {
  const { type, title, km, minutes, pace, times, text } = challenge;
  await saveState({ ...state, active: { type, title, km, minutes, pace, ...(times ? { times } : {}), text, acceptedOn: dateKey() } });
}

export async function dropChallenge(state: RunningState): Promise<void> { await saveState({ ...state, active: null }); }

/** Registra a corrida. Retorna o desafio cumprido, se houver. */
export async function registerRun(input: RunInput, state: RunningState): Promise<Challenge | null> {
  const userId = await currentUserId();
  if (!(input.km > 0) || !(input.durationSeconds > 0)) throw new Error('Preencha a distância e o tempo.');
  const pace = calculatePace(input.durationSeconds, input.km);
  if (!pace) throw new Error('Preencha a distância e o tempo.');
  if (pace < 2.5 || pace > 20) throw new Error('Confira os números: o ritmo ficou fora do normal.');
  if (input.date > dateKey()) throw new Error('A data não pode ser no futuro.');
  const result = await supabase.from('run_sessions').insert({
    user_id: userId, activity_date: input.date, distance_km: Math.round(input.km * 1000) / 1000, duration_seconds: Math.round(input.durationSeconds),
    perceived_effort: input.effort, pain: input.pain, notes: input.notes.trim() || null,
  });
  if (result.error) throw result.error;
  await markWorkoutCompletedOn(input.date);
  const active = state.active;
  if (active && challengeDone(active, { km: input.km, pace })) {
    await saveState({ active: null, history: [...state.history, { type: active.type, km: active.km, date: input.date }].slice(-20) });
    return active;
  }
  return null;
}

/** Etapa liberada se não tem data ou se a data já chegou. */
export const weekReleased = (releasesOn: string | null): boolean => !releasesOn || releasesOn <= dateKey();
