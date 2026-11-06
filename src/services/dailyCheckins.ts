import type { Json, Database } from '../types/database';
import { supabase } from './supabase';

type DailyCheckinRow = Database['public']['Tables']['daily_checkins']['Row'];

export interface DailyCheckin {
  date: string;
  waterGlasses: number;
  mood: number | null;
  meals: Record<string, boolean>;
  choices: Record<string, Json | undefined>;
  customHabits: Record<string, boolean>;
  workoutCompleted: boolean;
}

async function currentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!data.user) throw new Error('not_authenticated');
  return data.user.id;
}

function objectValue(value: Json): Record<string, Json | undefined> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {};
}

function booleanRecord(value: Json): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  for (const [key, item] of Object.entries(objectValue(value))) {
    if (typeof item === 'boolean') result[key] = item;
  }
  return result;
}

function toDailyCheckin(row: DailyCheckinRow): DailyCheckin {
  return {
    date: row.checkin_date,
    waterGlasses: row.water_glasses,
    mood: row.mood,
    meals: booleanRecord(row.meals),
    choices: objectValue(row.choices),
    customHabits: booleanRecord(row.custom_habits),
    workoutCompleted: row.workout_completed,
  };
}

export async function getDailyCheckin(date: string): Promise<DailyCheckin | null> {
  const userId = await currentUserId();
  const { data, error } = await supabase
    .from('daily_checkins')
    .select('*')
    .eq('user_id', userId)
    .eq('checkin_date', date)
    .maybeSingle();
  if (error) throw error;
  return data ? toDailyCheckin(data) : null;
}

export async function listDailyCheckins(dateFrom: string, dateTo: string): Promise<DailyCheckin[]> {
  const userId = await currentUserId();
  const { data, error } = await supabase
    .from('daily_checkins')
    .select('*')
    .eq('user_id', userId)
    .gte('checkin_date', dateFrom)
    .lte('checkin_date', dateTo)
    .order('checkin_date', { ascending: true });
  if (error) throw error;
  return data.map(toDailyCheckin);
}

export async function saveDailyCheckin(checkin: DailyCheckin): Promise<void> {
  const userId = await currentUserId();
  const { error } = await supabase.from('daily_checkins').upsert({
    user_id: userId,
    checkin_date: checkin.date,
    water_glasses: checkin.waterGlasses,
    mood: checkin.mood,
    meals: checkin.meals,
    choices: checkin.choices,
    custom_habits: checkin.customHabits,
    workout_completed: checkin.workoutCompleted,
  }, { onConflict: 'user_id,checkin_date' });
  if (error) throw error;
}

/** Marca treino feito no check-in de uma data (`YYYY-MM-DD`), sem alterar os demais registros do dia. */
export async function markWorkoutCompletedOn(date: string): Promise<void> {
  const userId = await currentUserId();
  const { error } = await supabase.from('daily_checkins').upsert({ user_id: userId, checkin_date: date, workout_completed: true }, { onConflict: 'user_id,checkin_date' });
  if (error) throw error;
}

export async function markTodayWorkoutCompleted(): Promise<void> {
  const userId = await currentUserId();
  const now = new Date();
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const { error } = await supabase.from('daily_checkins').upsert({
    user_id: userId,
    checkin_date: date,
    workout_completed: true,
  }, { onConflict: 'user_id,checkin_date' });
  if (error) throw error;
}
