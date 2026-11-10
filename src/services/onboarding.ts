import { supabase } from './supabase';
import type { Json } from '../types/database';

export type QuizObjective = 'weight_loss' | 'strength' | 'routine';
export type QuizActivity = 'sedentary' | 'light' | 'moderate' | 'high';
export type QuizExperience = 'beginner' | 'intermediate' | 'advanced';
export type QuizLocation = 'gym' | 'home';
export type QuizNutrition = 'traditional' | 'vegetarian' | 'gluten_free' | 'lactose_free';
export type QuizHealth = 'none' | 'pregnant' | 'condition' | 'injury';

export interface QuizAnswers {
  objective: QuizObjective;
  age: number;
  heightCm: number;
  weightKg: number;
  activity: QuizActivity;
  experience: QuizExperience;
  location: QuizLocation;
  daysPerWeek: number;
  nutrition: QuizNutrition;
  health: QuizHealth;
}

export interface QuizRecommendation {
  level: QuizExperience;
  modality: QuizLocation;
  weeklyGoal: number;
  caloriePlan: 1400 | 1800 | null;
  mealPlanId: string | null;
  estimatedExpenditure: number;
  calorieTarget: number | null;
  mealPlanBlocked: boolean;
  healthNotice?: string;
}

const objectiveLabels: Record<QuizObjective, string> = { weight_loss: 'Emagrecer com saúde', strength: 'Ganhar força e condicionamento', routine: 'Manter o peso e criar rotina' };
const nutritionIds: Record<QuizNutrition, string> = { traditional: 'tradicional', vegetarian: 'vegetariano', gluten_free: 'sem-gluten', lactose_free: 'sem-lactose' };

export function calculateRecommendation(answers: QuizAnswers): QuizRecommendation {
  const factor = { sedentary: 1.2, light: 1.375, moderate: 1.55, high: 1.725 }[answers.activity];
  const basal = 10 * answers.weightKg + 6.25 * answers.heightCm - 5 * answers.age - 161;
  const expenditure = Math.round(basal * factor);
  const target = answers.objective === 'weight_loss' ? expenditure - 500 : expenditure;
  const caloriePlan = target >= 1600 ? 1800 : 1400;
  const blocked = answers.health === 'pregnant' || answers.health === 'condition';
  const notices: Partial<Record<QuizHealth, string>> = {
    pregnant: 'Na gestação ou amamentação, alimentação e treino precisam de liberação e acompanhamento profissional.',
    condition: 'Como você informou uma condição de saúde em acompanhamento, o cardápio automático ficará indisponível.',
    injury: 'Respeite seus limites e interrompa qualquer exercício que provoque dor. Procure orientação profissional.',
  };
  const weeklyGoal = Math.min(4, Math.max(2, Math.round(answers.daysPerWeek)));
  return { level: answers.experience, modality: answers.location, weeklyGoal, caloriePlan: blocked ? null : caloriePlan, mealPlanId: blocked ? null : `${caloriePlan}-${nutritionIds[answers.nutrition]}`, estimatedExpenditure: expenditure, calorieTarget: blocked ? null : caloriePlan, mealPlanBlocked: blocked, ...(notices[answers.health] ? { healthNotice: notices[answers.health] } : {}) };
}

async function currentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser(); if (error) throw error; if (!data.user) throw new Error('not_authenticated'); return data.user.id;
}

export async function loadQuizAnswers(): Promise<QuizAnswers | null> {
  const userId = await currentUserId();
  const result = await supabase.from('onboarding_quizzes').select('answers').eq('user_id', userId).maybeSingle();
  if (result.error) throw result.error;
  const answers = result.data?.answers as unknown as QuizAnswers | null;
  return answers ? { ...answers, daysPerWeek: Math.min(4, Math.max(2, Math.round(answers.daysPerWeek))) } : null;
}

export async function saveQuizAnswers(answers: QuizAnswers): Promise<QuizRecommendation> {
  const userId = await currentUserId();
  const normalizedAnswers = { ...answers, daysPerWeek: Math.min(4, Math.max(2, Math.round(answers.daysPerWeek))) };
  const recommendation = calculateRecommendation(normalizedAnswers);
  const quiz = await supabase.from('onboarding_quizzes').upsert({ user_id: userId, answers: normalizedAnswers as unknown as Json, recommendations: recommendation as unknown as Json, completed_at: new Date().toISOString() }, { onConflict: 'user_id' });
  if (quiz.error) throw quiz.error;
  const profile = await supabase.from('profiles').update({ objective: objectiveLabels[answers.objective], weekly_goal: recommendation.weeklyGoal, level: recommendation.level, modality: recommendation.modality, meal_plan_id: recommendation.mealPlanId, calorie_goal: recommendation.calorieTarget, onboarding_completed: true }).eq('id', userId);
  if (profile.error) throw profile.error;
  return recommendation;
}
