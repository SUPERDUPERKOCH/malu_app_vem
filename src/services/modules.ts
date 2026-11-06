import { getCurrentUserProfile, updateMyProfile } from './users';
import type { TrainingLevel, TrainingModality } from '../models';
import { supabase } from './supabase';

interface Reward { id: string; nome: string; desc?: string; tipo: 'treinos' | 'sequencia' | 'habitos'; n: number }
interface Meeting { id: string; data: string; hora?: string; tema?: string; responsavel?: string; link?: string; gravacao?: string }
export interface VemData { rewards: Array<Reward & { value: number; status: 'locked' | 'available' | 'redeemed' }>; meetings: Meeting[]; call?: { link?: string; titulo?: string; info?: string } }
export interface PanelProfile { apelido?: string; objetivo?: string; metaPessoal?: string; metaSemanal?: number; nivel?: TrainingLevel; modalidade?: TrainingModality; notif: { treino: boolean; encontros: boolean; premios: boolean }; privacidade: { contarEquipe: boolean } }

function dateKey(date = new Date()): string { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
async function authenticatedUserId(): Promise<string> { const { data, error } = await supabase.auth.getUser(); if (error) throw error; if (!data.user) throw new Error('not_authenticated'); return data.user.id; }

export async function loadVem(): Promise<VemData> {
  const userId = await authenticatedUserId();
  const [rewardsResult, redemptionsResult, meetingsResult, settingsResult, sessionsResult, daysResult, runsResult, externalResult] = await Promise.all([
    supabase.from('rewards').select('*').eq('active', true).order('sort_order').order('target'),
    supabase.from('user_reward_redemptions').select('*').eq('user_id', userId),
    supabase.from('meetings').select('*').eq('active', true).order('meeting_date').order('meeting_time'),
    supabase.from('content_documents').select('content').eq('key', 'vem_settings').maybeSingle(),
    supabase.from('workout_sessions').select('started_at').eq('user_id', userId).eq('status', 'completed'),
    supabase.from('daily_checkins').select('checkin_date,water_glasses,meals').eq('user_id', userId),
    supabase.from('run_sessions').select('activity_date').eq('user_id', userId),
    supabase.from('external_activities').select('activity_date').eq('user_id', userId),
  ]);
  if (runsResult.error) throw runsResult.error; if (externalResult.error) throw externalResult.error;
  if (rewardsResult.error) throw rewardsResult.error; if (redemptionsResult.error) throw redemptionsResult.error; if (meetingsResult.error) throw meetingsResult.error; if (settingsResult.error) throw settingsResult.error; if (sessionsResult.error) throw sessionsResult.error; if (daysResult.error) throw daysResult.error;
  // Treinos do app, corridas e atividades externas contam para os prêmios, como no esboço.
  const workoutDates = [
    ...(sessionsResult.data ?? []).map((row) => dateKey(new Date(row.started_at))),
    ...(runsResult.data ?? []).map((row) => row.activity_date),
    ...(externalResult.data ?? []).map((row) => row.activity_date),
  ];
  const dateSet = new Set(workoutDates); let streak = 0; const cursor = new Date(); if (!dateSet.has(dateKey())) cursor.setDate(cursor.getDate() - 1);
  while (dateSet.has(dateKey(cursor))) { streak += 1; cursor.setDate(cursor.getDate() - 1); }
  const habitCount = (daysResult.data ?? []).filter((day) => day.water_glasses > 0 || (day.meals && typeof day.meals === 'object' && !Array.isArray(day.meals) && Object.values(day.meals).some(Boolean))).length;
  const redeemed = new Set((redemptionsResult.data ?? []).map((item) => item.reward_id));
  const rewards = (rewardsResult.data ?? []).map((row) => {
    const tipo: Reward['tipo'] = row.metric === 'streak' ? 'sequencia' : row.metric === 'habits' ? 'habitos' : 'treinos';
    const value = tipo === 'treinos' ? workoutDates.length : tipo === 'sequencia' ? streak : habitCount;
    return { id: row.id, nome: row.name, desc: row.description ?? undefined, tipo, n: row.target, value, status: redeemed.has(row.id) ? 'redeemed' as const : value >= row.target ? 'available' as const : 'locked' as const };
  });
  const meetings: Meeting[] = (meetingsResult.data ?? []).map((row) => ({ id: row.id, data: row.meeting_date, hora: row.meeting_time?.slice(0, 5), tema: row.topic, responsavel: row.responsible ?? undefined, link: row.join_url ?? undefined, gravacao: row.recording_url ?? undefined }));
  const settings = settingsResult.data?.content as unknown as { call?: VemData['call'] } | undefined;
  return { rewards, meetings, call: settings?.call };
}

export async function toggleReward(id: string): Promise<void> {
  const userId = await authenticatedUserId();
  const current = await supabase.from('user_reward_redemptions').select('reward_id').eq('user_id', userId).eq('reward_id', id).maybeSingle();
  if (current.error) throw current.error;
  if (current.data) { const result = await supabase.from('user_reward_redemptions').delete().eq('user_id', userId).eq('reward_id', id); if (result.error) throw result.error; }
  else { const result = await supabase.from('user_reward_redemptions').insert({ user_id: userId, reward_id: id }); if (result.error) throw result.error; }
}

export async function loadPanel(): Promise<PanelProfile> {
  const profile = await getCurrentUserProfile(); if (!profile) throw new Error('profile_not_found');
  return { apelido: profile.preferredName ?? profile.firstName, objetivo: profile.objective, metaPessoal: profile.personalGoal, metaSemanal: profile.weeklyGoal, nivel: profile.level, modalidade: profile.modality, notif: { treino: profile.notificationPreferences.workouts, encontros: profile.notificationPreferences.meetings, premios: profile.notificationPreferences.rewards }, privacidade: { contarEquipe: profile.shareProgressWithTeam } };
}

export async function savePanel(next: PanelProfile): Promise<void> {
  await updateMyProfile({ preferredName: next.apelido?.trim() || null, objective: next.objetivo?.trim() || null, personalGoal: next.metaPessoal?.trim() || null, weeklyGoal: next.metaSemanal ?? null, level: next.nivel ?? null, modality: next.modalidade ?? null, notifyWorkouts: next.notif.treino, notifyMeetings: next.notif.encontros, notifyRewards: next.notif.premios, shareProgressWithTeam: next.privacidade.contarEquipe });
}
