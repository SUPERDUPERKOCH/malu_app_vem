import type { Json } from '../types/database';
import { supabase } from './supabase';

export type MeetingType = 'weekly' | 'specialist';
export interface AdminMeeting { id: string; date: string; time: string; topic: string; responsible: string; joinUrl: string; recordingUrl: string; materials: string; durationMinutes: number; type: MeetingType; active: boolean }
export interface AdminReward { id: string; name: string; description: string; metric: 'workouts' | 'streak' | 'habits'; target: number; active: boolean }
export interface AdminVemSettings { callTitle: string; callInfo: string; callUrl: string }
export interface AdministrationData { meetings: AdminMeeting[]; rewards: AdminReward[]; settings: AdminVemSettings }
export interface TeamIndicators {
  quizzes: number;
  activeThisWeek: number;
  workoutsThisWeek: number;
  workoutsTotal: number;
  /** Segunda a domingo da semana atual. */
  perDay: number[];
  mealPlans: Record<string, number>;
  objectives: Record<string, number>;
  levels: Record<string, number>;
  modalities: Record<string, number>;
}

/** Documentos editoriais em `content_documents` que a equipe pode publicar. */
export type ContentKey = 'workouts' | 'meal_plans' | 'general' | 'agenda' | 'course';

function objectValue(value: Json | undefined): Record<string, Json | undefined> { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
function numberRecord(value: Json | undefined): Record<string, number> {
  return Object.fromEntries(Object.entries(objectValue(value)).filter((entry): entry is [string, number] => typeof entry[1] === 'number'));
}

export async function loadAdministration(): Promise<AdministrationData> {
  const [meetings, rewards, settings] = await Promise.all([
    supabase.from('meetings').select('*').order('meeting_date', { ascending: false }),
    supabase.from('rewards').select('*').order('sort_order').order('target'),
    supabase.from('content_documents').select('content').eq('key', 'vem_settings').maybeSingle(),
  ]);
  if (meetings.error) throw meetings.error; if (rewards.error) throw rewards.error; if (settings.error) throw settings.error;
  const content = settings.data?.content as unknown as { call?: { titulo?: string; info?: string; link?: string } } | undefined;
  return {
    meetings: (meetings.data ?? []).map((item) => ({
      id: item.id, date: item.meeting_date, time: item.meeting_time?.slice(0, 5) ?? '', topic: item.topic, responsible: item.responsible ?? '', joinUrl: item.join_url ?? '',
      recordingUrl: item.recording_url ?? '', materials: item.materials_url ?? '', durationMinutes: item.duration_minutes, type: item.meeting_type === 'specialist' ? 'specialist' : 'weekly', active: item.active,
    })),
    rewards: (rewards.data ?? []).map((item) => ({ id: item.id, name: item.name, description: item.description ?? '', metric: item.metric as AdminReward['metric'], target: item.target, active: item.active })),
    settings: { callTitle: content?.call?.titulo ?? '', callInfo: content?.call?.info ?? '', callUrl: content?.call?.link ?? '' },
  };
}

export async function loadTeamIndicators(): Promise<TeamIndicators> {
  const { data, error } = await supabase.rpc('admin_team_indicators');
  if (error) throw error;
  const raw = objectValue(data);
  const count = (key: string): number => (typeof raw[key] === 'number' ? raw[key] as number : 0);
  const perDay = Array.isArray(raw.perDay) ? raw.perDay.map((item) => (typeof item === 'number' ? item : 0)) : [];
  return {
    quizzes: count('quizzes'), activeThisWeek: count('activeThisWeek'), workoutsThisWeek: count('workoutsThisWeek'), workoutsTotal: count('workoutsTotal'),
    perDay: Array.from({ length: 7 }, (_, index) => perDay[index] ?? 0),
    mealPlans: numberRecord(raw.mealPlans), objectives: numberRecord(raw.objectives), levels: numberRecord(raw.levels), modalities: numberRecord(raw.modalities),
  };
}

/** Lê o documento editorial cru, para editar sem perder campos desconhecidos. */
export async function loadContent<T>(key: ContentKey): Promise<T | null> {
  const { data, error } = await supabase.from('content_documents').select('content').eq('key', key).maybeSingle();
  if (error) throw error;
  return (data?.content ?? null) as T | null;
}

/** Publica o documento inteiro. O gatilho do banco guarda a versão anterior em `content_document_revisions`. */
export async function publishContent(key: ContentKey, content: object): Promise<void> {
  const { error } = await supabase.from('content_documents').upsert({ key, active: true, content: content as unknown as Json, published_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) throw error;
}

export async function saveMeeting(input: AdminMeeting): Promise<void> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new Error('Use a data no formato AAAA-MM-DD.');
  if (input.time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.time)) throw new Error('Use o horário no formato 20:00.');
  for (const url of [input.joinUrl, input.recordingUrl]) if (url.trim() && !/^https:\/\//.test(url.trim())) throw new Error('Os links precisam começar com https://');
  const result = await supabase.from('meetings').upsert({
    id: input.id, meeting_date: input.date, meeting_time: input.time || null, topic: input.topic.trim(), responsible: input.responsible.trim() || null,
    join_url: input.joinUrl.trim() || null, recording_url: input.recordingUrl.trim() || null, materials_url: input.materials.trim() || null,
    duration_minutes: Math.max(1, Math.round(input.durationMinutes) || 60), meeting_type: input.type, active: input.active,
  }, { onConflict: 'id' });
  if (result.error) throw result.error;
}

export async function deleteMeeting(id: string): Promise<void> {
  const result = await supabase.from('meetings').delete().eq('id', id);
  if (result.error) throw result.error;
}

export async function saveReward(input: AdminReward, sortOrder = 0): Promise<void> {
  const result = await supabase.from('rewards').upsert({ id: input.id, name: input.name.trim(), description: input.description.trim() || null, metric: input.metric, target: input.target, sort_order: sortOrder, active: input.active }, { onConflict: 'id' });
  if (result.error) throw result.error;
}

export async function saveVemSettings(input: AdminVemSettings): Promise<void> {
  if (input.callUrl.trim() && !/^https:\/\//.test(input.callUrl.trim())) throw new Error('O link da call precisa começar com https://');
  const result = await supabase.from('content_documents').upsert({ key: 'vem_settings', active: true, content: { call: { titulo: input.callTitle.trim(), info: input.callInfo.trim(), link: input.callUrl.trim() } } }, { onConflict: 'key' });
  if (result.error) throw result.error;
}

/** Semanas com mais de um encontro ativo: a VEM tem um encontro por semana. */
export function duplicatedMeetingWeeks(meetings: AdminMeeting[]): string[] {
  const counts = new Map<string, number>();
  for (const meeting of meetings.filter((item) => item.active)) {
    const [y, m, d] = meeting.date.split('-').map(Number);
    const date = new Date(y ?? 2026, (m ?? 1) - 1, d ?? 1);
    date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
    const key = `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].filter(([, count]) => count > 1).map(([week]) => week);
}
