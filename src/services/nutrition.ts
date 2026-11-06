import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import type { LegacyDay } from './home';
import { getDailyCheckin, saveDailyCheckin, type DailyCheckin } from './dailyCheckins';
import { getCurrentUserProfile, updateMyProfile } from './users';
import { supabase } from './supabase';

export interface MealOption { texto: string; kcal: number; prot?: number }
export interface MenuMeal { id: string; nome: string; faixa?: string; opcoes: MealOption[] }
export interface FoodSwap { grupo: string; equivale: string; kcal: number }
export interface MealPlan { id: string; kcal: number; tipo: string; media?: string; intro?: string; refeicoes: MenuMeal[]; dicas?: string[]; regras?: string[]; trocas?: FoodSwap[] }
export interface MealProfessional { name: string; registry: string }
export type FoodSource = 'cardapio' | 'manual';
export interface FoodEntry { id: string; date: string; ref: string; hora?: string; desc: string; kcal: number; fonte: FoodSource; photoPath?: string; photoUrl?: string }
export interface CalorieDay { calories: number; hasPhoto: boolean }
export interface NutritionDashboard {
  date: string;
  plans: MealPlan[];
  selectedPlan: MealPlan | null;
  responsible: MealProfessional;
  /** Resposta de saúde do quiz (gestação/condição): cardápios e meta de calorias ficam indisponíveis. */
  mealPlanBlocked: boolean;
  day: LegacyDay;
  entries: FoodEntry[];
  calorieGoal: number;
  customGoal: boolean;
  caloriesConsumed: number;
  times: Record<string, string>;
}
export interface PreparedPhoto { uri: string; base64: string }
export interface SaveFoodEntryInput {
  date: string;
  previous?: FoodEntry;
  ref: string;
  time: string;
  description: string;
  calories: number;
  source: FoodSource;
  /** `undefined` mantém a foto atual; `null` remove; objeto envia uma nova. */
  photo?: PreparedPhoto | null;
}

interface PlansDocument { lista?: Array<Omit<MealPlan, 'refeicoes'> & { refeicoes?: Array<Omit<MenuMeal, 'id'>> }>; responsavel?: { nome?: string; crn?: string } }

export const MEAL_REFS = [
  { id: 'cafe', label: 'Café da manhã', defaultTime: '07:30' },
  { id: 'almoco', label: 'Almoço', defaultTime: '12:30' },
  { id: 'lanche', label: 'Lanche da tarde', defaultTime: '16:00' },
  { id: 'jantar', label: 'Jantar', defaultTime: '19:30' },
  { id: 'ceia', label: 'Ceia', defaultTime: '21:30' },
] as const;

/** Calorias aproximadas por porção, as mesmas do esboço VEM. */
export const FOOD_REFERENCES: ReadonlyArray<readonly [string, number]> = [
  ['Pão francês (1 un.)', 150], ['Pão integral (2 fatias)', 120], ['Tapioca (1 média)', 140], ['Ovo cozido (1 un.)', 75], ['Ovos mexidos (2 ovos)', 180],
  ['Queijo minas (1 fatia)', 80], ['Requeijão light (1 col. sopa)', 40], ['Manteiga (1 col. chá)', 35], ['Leite desnatado (1 copo)', 70], ['Leite integral (1 copo)', 120],
  ['Iogurte natural (1 pote)', 100], ['Café sem açúcar (1 xíc.)', 5], ['Açúcar (1 col. chá)', 20], ['Banana (1 média)', 90], ['Maçã (1 média)', 70],
  ['Mamão (1 fatia)', 50], ['Aveia (2 col. sopa)', 75], ['Arroz branco (4 col. sopa)', 130], ['Arroz integral (4 col. sopa)', 125], ['Feijão (1 concha)', 70],
  ['Frango grelhado (1 filé, 100 g)', 160], ['Carne magra (100 g)', 220], ['Peixe grelhado (100 g)', 130], ['Batata-doce (100 g)', 80], ['Macarrão (1 pegador)', 140],
  ['Salada de folhas', 15], ['Legumes cozidos (1 xíc.)', 50], ['Azeite (1 col. sopa)', 90], ['Castanhas (1 punhado)', 120], ['Pão de queijo (1 médio)', 100],
  ['Whey (1 dose)', 120], ['Chocolate (2 quadradinhos)', 110], ['Suco natural (1 copo)', 100], ['Refrigerante (1 lata)', 140], ['Cerveja (1 lata)', 150],
  ['Pizza (1 fatia)', 280], ['Hambúrguer (1 sanduíche)', 500], ['Açaí com granola (300 ml)', 450],
];

const PHOTO_BUCKET = 'food-photos';
const DEFAULT_GOAL = 1600;

export function dateKey(date = new Date()): string { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
function mealId(name: string): string {
  const value = name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  if (value.includes('manha')) return 'cafe'; if (value.includes('almoco')) return 'almoco'; if (value.includes('lanche')) return 'lanche'; if (value.includes('jantar')) return 'jantar'; if (value.includes('ceia')) return 'ceia';
  return value.replace(/\W+/g, '-');
}
async function currentUserId(): Promise<string> { const { data, error } = await supabase.auth.getUser(); if (error) throw error; if (!data.user) throw new Error('not_authenticated'); return data.user.id; }
function emptyCheckin(date: string): DailyCheckin { return { date, waterGlasses: 0, mood: null, meals: {}, choices: {}, customHabits: {}, workoutCompleted: false }; }
function toLegacyDay(checkin: DailyCheckin): LegacyDay { return { sessoes: [], agua: checkin.waterGlasses, humor: checkin.mood, refeicoes: checkin.meals, escolhas: checkin.choices, custom: checkin.customHabits, ...(checkin.workoutCompleted ? { concluido: true } : {}) }; }
function newEntryId(): string { return `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`; }
function shortTime(value: string | null | undefined): string | undefined { return value ? value.slice(0, 5) : undefined; }

async function signedUrls(paths: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(paths)];
  if (!unique.length) return new Map();
  const { data, error } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(unique, 3600);
  if (error) throw error;
  return new Map((data ?? []).flatMap((item) => (item.path && item.signedUrl ? [[item.path, item.signedUrl] as [string, string]] : [])));
}

async function mealPlanBlocked(userId: string): Promise<boolean> {
  const result = await supabase.from('onboarding_quizzes').select('recommendations').eq('user_id', userId).maybeSingle();
  if (result.error) throw result.error;
  const recommendations = result.data?.recommendations;
  return !!recommendations && typeof recommendations === 'object' && !Array.isArray(recommendations) && recommendations.mealPlanBlocked === true;
}

export async function loadNutritionDashboard(date = dateKey()): Promise<NutritionDashboard> {
  const userId = await currentUserId();
  const [documentResult, profile, checkin, foodsResult, blocked] = await Promise.all([
    supabase.from('content_documents').select('content').eq('key', 'meal_plans').maybeSingle(), getCurrentUserProfile(), getDailyCheckin(date),
    supabase.from('food_entries').select('*').eq('user_id', userId).eq('entry_date', date).order('eaten_at', { nullsFirst: false }).order('created_at'),
    mealPlanBlocked(userId),
  ]);
  if (documentResult.error) throw documentResult.error; if (foodsResult.error) throw foodsResult.error;
  const document = documentResult.data?.content as unknown as PlansDocument | undefined;
  const plans: MealPlan[] = (document?.lista ?? []).map((plan) => ({ ...plan, refeicoes: (plan.refeicoes ?? []).map((meal) => ({ ...meal, id: mealId(meal.nome) })) }));
  const selectedPlan = !blocked && profile?.mealPlanId ? plans.find((plan) => plan.id === profile.mealPlanId) ?? null : null;
  const rows = foodsResult.data ?? [];
  const urls = await signedUrls(rows.flatMap((row) => (row.photo_path ? [row.photo_path] : [])));
  const entries: FoodEntry[] = rows.map((food) => ({
    id: food.id, date: food.entry_date, ref: food.meal_ref, hora: shortTime(food.eaten_at), desc: food.description, kcal: food.calories,
    fonte: food.source === 'cardapio' ? 'cardapio' : 'manual', photoPath: food.photo_path ?? undefined, photoUrl: food.photo_path ? urls.get(food.photo_path) : undefined,
  }));
  return {
    date,
    plans: selectedPlan ? [selectedPlan] : [],
    selectedPlan,
    responsible: { name: document?.responsavel?.nome?.trim() ?? '', registry: document?.responsavel?.crn?.trim() ?? '' },
    mealPlanBlocked: blocked,
    day: toLegacyDay(checkin ?? emptyCheckin(date)),
    entries,
    calorieGoal: profile?.calorieGoal ?? selectedPlan?.kcal ?? DEFAULT_GOAL,
    customGoal: !!profile?.calorieGoal && profile.calorieGoal !== selectedPlan?.kcal,
    caloriesConsumed: entries.reduce((sum, food) => sum + food.kcal, 0),
    times: { ...Object.fromEntries(MEAL_REFS.map((meal) => [meal.id, meal.defaultTime])), ...(profile?.mealTimes ?? {}) },
  };
}

/** Soma de calorias e presença de foto por dia, para o calendário do mês (`YYYY-MM`). */
export async function loadCalorieCalendar(month: string): Promise<Record<string, CalorieDay>> {
  const userId = await currentUserId();
  const [year, monthNumber] = month.split('-').map(Number);
  const start = `${month}-01`;
  const end = dateKey(new Date(year ?? 2026, monthNumber ?? 1, 0));
  const result = await supabase.from('food_entries').select('entry_date, calories, photo_path').eq('user_id', userId).gte('entry_date', start).lte('entry_date', end);
  if (result.error) throw result.error;
  const days: Record<string, CalorieDay> = {};
  for (const row of result.data ?? []) {
    const day = (days[row.entry_date] ??= { calories: 0, hasPhoto: false });
    day.calories += row.calories;
    if (row.photo_path) day.hasPhoto = true;
  }
  return days;
}

export async function chooseMealOption(plan: MealPlan, mealRef: string, optionIndex: number, time?: string): Promise<void> {
  const userId = await currentUserId(); const date = dateKey(); const option = plan.refeicoes.find((item) => item.id === mealRef)?.opcoes[optionIndex]; if (!option) return;
  const checkin = await getDailyCheckin(date) ?? emptyCheckin(date); checkin.choices[mealRef] = optionIndex; checkin.meals[mealRef] = true;
  const result = await supabase.from('food_entries').upsert({ user_id: userId, entry_date: date, id: `card-${mealRef}`, meal_ref: mealRef, eaten_at: time || null, description: option.texto, calories: Number(option.kcal) || 0, source: 'cardapio', option_index: optionIndex }, { onConflict: 'user_id,entry_date,id' });
  if (result.error) throw result.error; await saveDailyCheckin(checkin);
}

export async function toggleMealDone(mealRef: string): Promise<void> {
  const userId = await currentUserId(); const date = dateKey(); const checkin = await getDailyCheckin(date) ?? emptyCheckin(date); const wasDone = !!checkin.meals[mealRef]; checkin.meals[mealRef] = !wasDone;
  if (wasDone) { delete checkin.choices[mealRef]; const result = await supabase.from('food_entries').delete().eq('user_id', userId).eq('entry_date', date).eq('id', `card-${mealRef}`); if (result.error) throw result.error; }
  await saveDailyCheckin(checkin);
}

/** Redimensiona para no máximo 1080 px e comprime em JPEG antes do upload. */
export async function preparePhoto(uri: string, width: number, height: number): Promise<PreparedPhoto> {
  const max = 1080;
  const context = ImageManipulator.manipulate(uri);
  if (Math.max(width, height) > max) context.resize(width >= height ? { width: max } : { height: max });
  const image = await context.renderAsync();
  const result = await image.saveAsync({ compress: 0.7, format: SaveFormat.JPEG, base64: true });
  if (!result.base64) throw new Error('photo_without_data');
  return { uri: result.uri, base64: result.base64 };
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = globalThis.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function uploadPhoto(userId: string, date: string, photo: PreparedPhoto): Promise<string> {
  const path = `${userId}/${date}/${newEntryId()}.jpg`;
  const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(path, base64ToBytes(photo.base64), { contentType: 'image/jpeg', upsert: false });
  if (error) throw error;
  return path;
}

async function removePhoto(path: string | undefined): Promise<void> {
  if (!path) return;
  // Falha ao apagar a foto antiga não deve impedir o registro; o arquivo fica órfão no bucket.
  await supabase.storage.from(PHOTO_BUCKET).remove([path]).catch(() => undefined);
}

async function syncMealDone(date: string, mealRef: string, done: boolean, removeChoiceFor?: string): Promise<void> {
  const checkin = await getDailyCheckin(date) ?? emptyCheckin(date);
  checkin.meals[mealRef] = done;
  if (removeChoiceFor) delete checkin.choices[removeChoiceFor];
  await saveDailyCheckin(checkin);
}

export async function saveFoodEntry(input: SaveFoodEntryInput): Promise<void> {
  const userId = await currentUserId();
  const previous = input.previous;
  // Um registro do cardápio que muda de refeição vira registro próprio, para não ser sobrescrito pela próxima escolha.
  const movedFromMenu = !!previous && previous.id.startsWith('card-') && previous.ref !== input.ref;
  const id = previous && !movedFromMenu ? previous.id : newEntryId();
  let photoPath = previous?.photoPath ?? null;
  if (input.photo) photoPath = await uploadPhoto(userId, input.date, input.photo);
  else if (input.photo === null) photoPath = null;

  const result = await supabase.from('food_entries').upsert({
    user_id: userId, entry_date: input.date, id, meal_ref: input.ref, eaten_at: input.time || null,
    description: input.description.trim(), calories: Math.max(0, Math.round(input.calories)), source: movedFromMenu ? 'manual' : input.source,
    photo_path: photoPath, ...(movedFromMenu ? { option_index: null } : {}),
  }, { onConflict: 'user_id,entry_date,id' });
  if (result.error) throw result.error;

  if (movedFromMenu && previous) {
    const removed = await supabase.from('food_entries').delete().eq('user_id', userId).eq('entry_date', input.date).eq('id', previous.id);
    if (removed.error) throw removed.error;
  }
  if (previous?.photoPath && previous.photoPath !== photoPath) await removePhoto(previous.photoPath);
  await syncMealDone(input.date, input.ref, true, movedFromMenu ? previous?.ref : undefined);
}

export async function deleteFoodEntry(entry: FoodEntry): Promise<void> {
  const userId = await currentUserId();
  const result = await supabase.from('food_entries').delete().eq('user_id', userId).eq('entry_date', entry.date).eq('id', entry.id);
  if (result.error) throw result.error;
  await removePhoto(entry.photoPath);
  const remaining = await supabase.from('food_entries').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('entry_date', entry.date).eq('meal_ref', entry.ref);
  if (remaining.error) throw remaining.error;
  if (!remaining.count) await syncMealDone(entry.date, entry.ref, false, entry.id.startsWith('card-') ? entry.ref : undefined);
}

/** `null` volta para a meta do cardápio indicado. */
export async function setCalorieGoal(value: number | null): Promise<void> {
  if (value !== null && (!Number.isFinite(value) || value < 800 || value > 5000)) throw new Error('Use um valor entre 800 e 5000 kcal.');
  await updateMyProfile({ calorieGoal: value === null ? null : Math.round(value) });
}
