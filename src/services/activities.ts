import { markWorkoutCompletedOn } from './dailyCheckins';
import { supabase } from './supabase';

/** Atividades feitas fora do app e o MET usado para estimar calorias, como no esboço VEM. */
export const ACTIVITY_TYPES: ReadonlyArray<readonly [string, number]> = [
  ['Musculação', 5], ['Corrida', 9.8], ['Caminhada', 3.5], ['Aula coletiva', 6.5], ['Pilates ou yoga', 3], ['Dança', 5.5], ['Bike', 7], ['Outra atividade', 4.5],
];
const DEFAULT_WEIGHT_KG = 65;

export interface ExternalActivityInput { type: string; minutes: number; date: string; notes: string }
export interface BodyWeight { kg: number; measured: boolean }

async function currentUserId(): Promise<string> { const { data, error } = await supabase.auth.getUser(); if (error) throw error; if (!data.user) throw new Error('not_authenticated'); return data.user.id; }

export function dateKey(date = new Date()): string { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }

/** Peso mais recente registrado em Evolução; sem registro, usa 65 kg para as estimativas. */
export async function latestBodyWeight(): Promise<BodyWeight> {
  const userId = await currentUserId();
  const { data, error } = await supabase.from('body_measurements').select('weight_kg').eq('user_id', userId).not('weight_kg', 'is', null).order('measured_on', { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data?.weight_kg ? { kg: Number(data.weight_kg), measured: true } : { kg: DEFAULT_WEIGHT_KG, measured: false };
}

export const estimateCalories = (met: number, weightKg: number, minutes: number): number => Math.round(met * weightKg * (minutes / 60));

export async function registerExternalActivity(input: ExternalActivityInput): Promise<void> {
  const userId = await currentUserId();
  const minutes = Math.round(input.minutes);
  if (!Number.isFinite(minutes) || minutes <= 0) throw new Error('Informe a duração em minutos.');
  if (input.date > dateKey()) throw new Error('A data não pode ser no futuro.');
  const met = ACTIVITY_TYPES.find(([type]) => type === input.type)?.[1] ?? 4.5;
  const weight = await latestBodyWeight();
  const { error } = await supabase.from('external_activities').insert({
    user_id: userId, activity_date: input.date, activity_type: input.type, duration_minutes: minutes,
    estimated_calories: estimateCalories(met, weight.kg, minutes), notes: input.notes.trim() || null,
  });
  if (error) throw error;
  await markWorkoutCompletedOn(input.date);
}
