import type { Json } from '../types/database';
import { getCurrentUserProfile, updateMyProfile } from './users';
import { supabase } from './supabase';

export type ReminderKind = 'water' | 'reading' | 'task' | 'movement' | 'self_care' | 'other';

export const REMINDER_KINDS: ReadonlyArray<readonly [ReminderKind, string, string]> = [
  ['water', 'Beber água', 'Beber um copo de água'],
  ['reading', 'Leitura', 'Ler 10 páginas'],
  ['task', 'Tarefa', ''],
  ['movement', 'Movimento', 'Me alongar 5 minutos'],
  ['self_care', 'Autocuidado', 'Um momento pra mim'],
  ['other', 'Outro', ''],
];

/** Dias no formato do banco e do expo-notifications: 1 = domingo … 7 = sábado. */
export const WEEKDAY_OPTIONS: ReadonlyArray<readonly [number, string]> = [[2, 'Seg'], [3, 'Ter'], [4, 'Qua'], [5, 'Qui'], [6, 'Sex'], [7, 'Sáb'], [1, 'Dom']];
const PT_WEEKDAYS: Record<string, number> = { dom: 1, seg: 2, ter: 3, qua: 4, qui: 5, sex: 6, sab: 7 };
const PT_KINDS: Record<string, ReminderKind> = { agua: 'water', leitura: 'reading', tarefa: 'task', treino: 'movement', autocuidado: 'self_care', outro: 'other' };

export const MEAL_SLOTS = [
  { id: 'cafe', label: 'Café da manhã', defaultTime: '07:30', title: 'Hora do café da manhã' },
  { id: 'almoco', label: 'Almoço', defaultTime: '12:30', title: 'Hora do almoço' },
  { id: 'lanche', label: 'Lanche da tarde', defaultTime: '16:00', title: 'Hora do lanche da tarde' },
  { id: 'jantar', label: 'Jantar', defaultTime: '19:30', title: 'Hora do jantar' },
  { id: 'ceia', label: 'Ceia', defaultTime: '21:30', title: 'Hora da ceia' },
] as const;

export interface Reminder {
  id: string;
  title: string;
  kind: ReminderKind;
  /** `HH:MM`, ou vazio para aparecer só na agenda. */
  time: string;
  /** Vazio = todo dia. */
  weekdays: number[];
  note: string;
  enabled: boolean;
  team: boolean;
}

export interface ReminderSettings {
  meals: boolean;
  water: boolean;
  waterIntervalHours: number;
  waterStart: string;
  waterEnd: string;
  workoutTime: string;
  teamOff: string[];
}

export interface ReminderBundle {
  settings: ReminderSettings;
  mealTimes: Record<string, string>;
  personal: Reminder[];
  team: Reminder[];
  notifyWorkouts: boolean;
  notifyMeetings: boolean;
}

export const DEFAULT_REMINDER_SETTINGS: ReminderSettings = { meals: true, water: true, waterIntervalHours: 2, waterStart: '08:00', waterEnd: '21:00', workoutTime: '07:00', teamOff: [] };

export const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
export const isValidTime = (value: string): boolean => TIME_PATTERN.test(value);
export const minutesOf = (value: string): number | null => {
  if (!isValidTime(value)) return null;
  const [hours, minutes] = value.split(':').map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
};
export const timeOf = (minutes: number): string => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

async function currentUserId(): Promise<string> { const { data, error } = await supabase.auth.getUser(); if (error) throw error; if (!data.user) throw new Error('not_authenticated'); return data.user.id; }

function objectValue(value: Json | undefined): Record<string, Json | undefined> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export function parseReminderSettings(value: Json | undefined): ReminderSettings {
  const raw = objectValue(value);
  const text = (key: string, fallback: string): string => (typeof raw[key] === 'string' && isValidTime(raw[key] as string) ? raw[key] as string : fallback);
  const interval = typeof raw.waterIntervalHours === 'number' && raw.waterIntervalHours > 0 ? raw.waterIntervalHours : DEFAULT_REMINDER_SETTINGS.waterIntervalHours;
  return {
    meals: raw.meals !== false,
    water: raw.water !== false,
    waterIntervalHours: interval,
    waterStart: text('waterStart', DEFAULT_REMINDER_SETTINGS.waterStart),
    waterEnd: text('waterEnd', DEFAULT_REMINDER_SETTINGS.waterEnd),
    workoutTime: text('workoutTime', DEFAULT_REMINDER_SETTINGS.workoutTime),
    teamOff: Array.isArray(raw.teamOff) ? raw.teamOff.filter((item): item is string => typeof item === 'string') : [],
  };
}

/** Lembretes publicados pela equipe em `content_documents.general.lembretes` (formato do esboço). */
function parseTeamReminders(content: Json | undefined, off: string[]): Reminder[] {
  const list = objectValue(content).lembretes;
  if (!Array.isArray(list)) return [];
  return list.flatMap((item) => {
    const raw = objectValue(item);
    const id = typeof raw.id === 'string' ? raw.id : '';
    const title = typeof raw.titulo === 'string' ? raw.titulo.trim() : '';
    if (!id || !title) return [];
    const days = Array.isArray(raw.dias) ? raw.dias.flatMap((day) => (typeof day === 'string' && PT_WEEKDAYS[day] ? [PT_WEEKDAYS[day] as number] : [])) : [];
    const time = typeof raw.hora === 'string' && isValidTime(raw.hora) ? raw.hora : '';
    return [{ id, title, kind: PT_KINDS[typeof raw.tipo === 'string' ? raw.tipo : ''] ?? 'other', time, weekdays: days.length === 7 ? [] : days, note: typeof raw.nota === 'string' ? raw.nota : '', enabled: !off.includes(id), team: true }];
  });
}

export async function loadReminders(): Promise<ReminderBundle> {
  const userId = await currentUserId();
  const [profile, personalResult, generalResult] = await Promise.all([
    getCurrentUserProfile(),
    supabase.from('user_reminders').select('*').eq('user_id', userId).eq('source', 'user').order('reminder_time', { nullsFirst: false }).order('created_at'),
    supabase.from('content_documents').select('content').eq('key', 'general').maybeSingle(),
  ]);
  if (!profile) throw new Error('profile_not_found');
  if (personalResult.error) throw personalResult.error;
  if (generalResult.error) throw generalResult.error;
  const settingsRow = await supabase.from('profiles').select('reminder_settings').eq('id', userId).single();
  if (settingsRow.error) throw settingsRow.error;
  const settings = parseReminderSettings(settingsRow.data.reminder_settings);
  const mealTimes = { ...Object.fromEntries(MEAL_SLOTS.map((meal) => [meal.id, meal.defaultTime])), ...profile.mealTimes };
  return {
    settings,
    mealTimes,
    personal: (personalResult.data ?? []).map((row) => ({
      id: row.id, title: row.title, kind: (REMINDER_KINDS.some(([kind]) => kind === row.kind) ? row.kind : 'other') as ReminderKind,
      time: row.reminder_time?.slice(0, 5) ?? '', weekdays: row.weekdays ?? [], note: row.body ?? '', enabled: row.enabled, team: false,
    })),
    team: parseTeamReminders(generalResult.data?.content, settings.teamOff),
    notifyWorkouts: profile.notificationPreferences.workouts,
    notifyMeetings: profile.notificationPreferences.meetings,
  };
}

export async function saveReminderPreferences(settings: ReminderSettings, mealTimes: Record<string, string>): Promise<void> {
  const userId = await currentUserId();
  for (const [key, value] of Object.entries({ ...mealTimes, waterStart: settings.waterStart, waterEnd: settings.waterEnd, workoutTime: settings.workoutTime })) {
    if (value && !isValidTime(value)) throw new Error(`Confira o horário ${value}: use o formato 12:30.`);
    if (!value && key.startsWith('water')) throw new Error('Preencha o horário de início e de fim da água.');
  }
  if ((minutesOf(settings.waterStart) ?? 0) >= (minutesOf(settings.waterEnd) ?? 0)) throw new Error('O horário final da água precisa ser depois do inicial.');
  const result = await supabase.from('profiles').update({ reminder_settings: settings as unknown as Json }).eq('id', userId);
  if (result.error) throw result.error;
  await updateMyProfile({ mealTimes: Object.fromEntries(Object.entries(mealTimes).filter(([, value]) => !!value)) });
}

/** Salva a lista completa de lembretes pessoais (cria, atualiza e apaga os removidos). */
export async function savePersonalReminders(reminders: Reminder[]): Promise<void> {
  const userId = await currentUserId();
  const valid = reminders.filter((reminder) => reminder.title.trim());
  for (const reminder of valid) {
    if (reminder.time && !isValidTime(reminder.time)) throw new Error(`Confira o horário de “${reminder.title.trim()}”: use o formato 12:30.`);
  }
  const existing = await supabase.from('user_reminders').select('id').eq('user_id', userId).eq('source', 'user');
  if (existing.error) throw existing.error;
  const keep = new Set(valid.map((reminder) => reminder.id));
  const removed = (existing.data ?? []).map((row) => row.id).filter((id) => !keep.has(id));
  if (removed.length) {
    const result = await supabase.from('user_reminders').delete().eq('user_id', userId).in('id', removed);
    if (result.error) throw result.error;
  }
  if (!valid.length) return;
  const result = await supabase.from('user_reminders').upsert(valid.map((reminder) => ({
    id: reminder.id, user_id: userId, title: reminder.title.trim().slice(0, 120), body: reminder.note.trim() || null, kind: reminder.kind,
    reminder_time: reminder.time || null, weekdays: reminder.weekdays.length === 7 ? [] : [...reminder.weekdays].sort(), source: 'user', enabled: reminder.enabled,
  })), { onConflict: 'id' });
  if (result.error) throw result.error;
}

export function newReminder(): Reminder {
  // UUID v4 simples; o banco aceita o id gerado no app para permitir edição antes de salvar.
  const hex = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${'89ab'[Math.floor(Math.random() * 4)]}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
  return { id, title: '', kind: 'task', time: '', weekdays: [], note: '', enabled: true, team: false };
}

/** Lembretes ativos de um dia (pessoais + equipe), ordenados por horário. */
export function remindersForDay(bundle: Pick<ReminderBundle, 'personal' | 'team'>, date: Date): Reminder[] {
  const weekday = date.getDay() + 1;
  return [...bundle.team, ...bundle.personal]
    .filter((reminder) => reminder.enabled && (!reminder.weekdays.length || reminder.weekdays.includes(weekday)))
    .sort((a, b) => (minutesOf(a.time) ?? 9999) - (minutesOf(b.time) ?? 9999));
}

/** Chave usada em `daily_checkins.custom_habits` para marcar um lembrete como feito no dia. */
export const reminderDoneKey = (id: string): string => `lembrete:${id}`;

/** Horários do lembrete de água entre início e fim, como no esboço (no máximo 16 por dia). */
export function waterSlots(settings: ReminderSettings): string[] {
  const start = minutesOf(settings.waterStart); const end = minutesOf(settings.waterEnd);
  const interval = Math.round(settings.waterIntervalHours * 60);
  if (start === null || end === null || interval <= 0) return [];
  const slots: string[] = [];
  for (let minute = start + interval; minute <= end && slots.length < 16; minute += interval) slots.push(timeOf(minute));
  return slots;
}

export function describeWeekdays(weekdays: number[]): string {
  if (!weekdays.length || weekdays.length === 7) return 'todo dia';
  return WEEKDAY_OPTIONS.filter(([day]) => weekdays.includes(day)).map(([, label]) => label).join(', ');
}
