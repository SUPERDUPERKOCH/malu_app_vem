import {
  getDailyCheckin,
  listDailyCheckins,
  saveDailyCheckin,
  type DailyCheckin,
} from './dailyCheckins';
import { getCurrentUserProfile } from './users';
import type { Json } from '../types/database';
import { supabase } from './supabase';
import { todayCode } from './workouts';
import { loadReminders, remindersForDay, type Reminder } from './reminders';

const DEFAULT_PHRASES = [
  'Você não precisa ter vontade. Precisa ter compromisso com você.',
  'A mulher que você quer ser já está nas escolhas que você faz hoje.',
  'Ninguém vai fazer por você. Mas você não está sozinha.',
  'Você não está atrasada. Está no seu tempo, e ele é seu.',
  'Disciplina é lembrar do que você quer, mesmo quando a vontade passa.',
];

export const MEALS = [
  { id: 'cafe', label: 'Café', defaultTime: '07:30' },
  { id: 'almoco', label: 'Almoço', defaultTime: '12:30' },
  { id: 'lanche', label: 'Lanche', defaultTime: '16:00' },
  { id: 'jantar', label: 'Jantar', defaultTime: '20:00' },
  { id: 'ceia', label: 'Ceia', defaultTime: '22:00' },
] as const;

interface LegacyProfile {
  apelido?: string;
  metaSemanal?: number;
  nivel?: string;
  modalidade?: string;
  horarios?: Record<string, string>;
  lembretes?: { agua?: boolean; aguaIntervalo?: number; refeicoes?: boolean };
}

interface LegacySession {
  status?: string;
  nome?: string;
}

export interface LegacyDay {
  sessoes: LegacySession[];
  agua: number;
  humor: number | null;
  refeicoes: Record<string, boolean>;
  escolhas: Record<string, Json | undefined>;
  custom: Record<string, boolean>;
  concluido?: boolean;
}

interface LegacyTraining {
  id: string;
  letra?: string;
  nome: string;
  foco?: string;
  dias?: string[];
  itens?: Array<{ series?: number; descanso?: number }>;
}

interface LegacyProgram {
  id?: string;
  modalidade?: string;
  semana?: Record<string, string>;
  cardio?: string[][];
  niveis?: string[];
  treinos?: LegacyTraining[];
}

interface LegacyTrainingContent {
  programas?: LegacyProgram[];
}

interface LegacyGeneralContent {
  metaSemanalPadrao?: number;
  frases?: Array<{ texto?: string; data?: string }>;
}

export interface HomeMeeting {
  id: string;
  date: string;
  time: string;
  title: string;
  responsible?: string;
  link?: string;
}

export interface HomeWorkout {
  title: string;
  focus: string;
  estimatedMinutes: number;
  exerciseCount: number;
  restDay: boolean;
  description?: string;
}

export interface HomeDashboard {
  displayName: string;
  dateLabel: string;
  greeting: string;
  phrases: string[];
  weeklyCompleted: number;
  weeklyGoal: number;
  streak: number;
  completedWeekdays: boolean[];
  workout: HomeWorkout;
  today: LegacyDay;
  nextMealLabel: string;
  waterReminder: string;
  meeting: HomeMeeting | null;
  /** Lembretes ativos de hoje (pessoais + equipe). */
  reminders: Reminder[];
  call: { link: string; title: string; info: string } | null;
  caloriesToday: number;
  /** Último encontro com gravação publicada. */
  recording: { title: string; date: string; url: string } | null;
}

function localDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function emptyDay(): LegacyDay {
  return { sessoes: [], agua: 0, humor: null, refeicoes: {}, escolhas: {}, custom: {} };
}

function checkinToDay(checkin: DailyCheckin | null): LegacyDay {
  if (!checkin) return emptyDay();
  return {
    sessoes: [],
    agua: checkin.waterGlasses,
    humor: checkin.mood,
    refeicoes: checkin.meals,
    escolhas: checkin.choices,
    custom: checkin.customHabits,
    ...(checkin.workoutCompleted ? { concluido: true } : {}),
  };
}

function dayToCheckin(date: string, day: LegacyDay): DailyCheckin {
  return {
    date,
    waterGlasses: day.agua,
    mood: day.humor,
    meals: day.refeicoes,
    choices: day.escolhas,
    customHabits: day.custom,
    workoutCompleted: isCompleted(day),
  };
}

function isCompleted(day: LegacyDay): boolean {
  return !!day.concluido || day.sessoes.some((session) => session.status === 'concluido');
}

function startOfWeek(date: Date): Date {
  const result = new Date(date);
  const offset = (result.getDay() + 6) % 7;
  result.setDate(result.getDate() - offset);
  result.setHours(0, 0, 0, 0);
  return result;
}

function addDays(date: Date, amount: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + amount);
  return result;
}

function selectWorkout(content: LegacyTrainingContent | null, profile: LegacyProfile | null, schedule: { programId: string; plan: Record<string, string> } | null): HomeWorkout {
  const programs = content?.programas ?? [];
  const modality = profile?.modalidade ?? 'academia';
  const level = profile?.nivel ?? 'iniciante';
  const program =
    programs.find((item) => item.modalidade === modality && item.niveis?.includes(level)) ??
    programs.find((item) => item.modalidade === modality) ??
    programs[0];
  const today = todayCode();
  // A agenda personalizada vale só para o programa atual; senão, a semana sugerida do programa.
  const plan = schedule && schedule.programId === program?.id ? schedule.plan : program?.semana;
  const planned = plan?.[today] ?? '';
  const workout = plan
    ? program?.treinos?.find((item) => !!item.letra && item.letra === planned)
    : program?.treinos?.find((item) => item.dias?.includes(today));
  if (!workout) {
    if (planned.startsWith('cardio')) {
      const tip = program?.cardio?.find((row) => row[0] === 'Dias sem treino')?.[2];
      return { title: `Cardio · ${planned.split('|')[1] ?? ''}`.trim(), focus: 'Dia de cardio', estimatedMinutes: 0, exerciseCount: 0, restDay: true, description: tip };
    }
    return { title: 'Hoje seu corpo recupera', focus: 'Descanso', estimatedMinutes: 0, exerciseCount: 0, restDay: true, description: 'Sem treino e sem cardio. É no descanso que o músculo se recupera e cresce.' };
  }
  const estimatedSeconds = (workout.itens ?? []).reduce(
    (total, item) => total + (item.series ?? 0) * ((item.descanso ?? 60) + 40),
    0
  );
  return {
    title: workout.nome,
    focus: workout.foco ?? 'Treino',
    estimatedMinutes: Math.max(5, Math.round(estimatedSeconds / 60)),
    exerciseCount: workout.itens?.length ?? 0,
    restDay: false,
  };
}

/** Frase do dia (a primeira da lista mostrada no Início). */
export async function loadPhraseOfDay(): Promise<string> {
  const { data, error } = await supabase.from('content_documents').select('content').eq('key', 'general').maybeSingle();
  if (error) throw error;
  return getPhrases(data?.content as unknown as LegacyGeneralContent | null, localDateKey())[0] ?? DEFAULT_PHRASES[0] ?? '';
}

function getPhrases(content: LegacyGeneralContent | null, today: string): string[] {
  const configured = (content?.frases ?? []).filter((item) => item.texto?.trim());
  const fixed = configured.filter((item) => item.data === today).flatMap((item) => item.texto?.trim() ?? []);
  const rotating = configured.filter((item) => !item.data).flatMap((item) => item.texto?.trim() ?? []);
  const pool = rotating.length >= 3 ? rotating : DEFAULT_PHRASES;
  const dayNumber = Math.floor(new Date(`${today}T00:00:00`).getTime() / 86_400_000);
  const result = [...fixed];
  for (let index = 0; result.length < Math.max(3, fixed.length) && index < pool.length; index += 1) {
    const phrase = pool[((dayNumber * 3 + index) % pool.length + pool.length) % pool.length];
    if (phrase && !result.includes(phrase)) result.push(phrase);
  }
  return result;
}

function nextMeal(profile: LegacyProfile | null, day: LegacyDay): string {
  const now = new Date().getHours() * 60 + new Date().getMinutes();
  const upcoming = MEALS.map((meal) => {
    const time = profile?.horarios?.[meal.id] ?? meal.defaultTime;
    const [hours = 0, minutes = 0] = time.split(':').map(Number);
    return { ...meal, time, minutes: hours * 60 + minutes };
  })
    .filter((meal) => !day.refeicoes[meal.id] && meal.minutes >= now)
    .sort((left, right) => left.minutes - right.minutes)[0];
  return upcoming ? `${upcoming.label} às ${upcoming.time}` : 'Refeições registradas ou horários passados';
}

export async function loadHomeDashboard(): Promise<HomeDashboard> {
  const today = localDateKey();
  const historyStart = localDateKey(addDays(new Date(), -370));
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id ?? '';
  const [userProfile, currentCheckin, checkins, trainingResult, generalResult, meetingsResult, vemSettingsResult, scheduleResult, reminderBundle, foodsResult, recordingResult] = await Promise.all([
    getCurrentUserProfile(),
    getDailyCheckin(today),
    listDailyCheckins(historyStart, today),
    supabase.from('content_documents').select('content').eq('key', 'workouts').maybeSingle(),
    supabase.from('content_documents').select('content').eq('key', 'general').maybeSingle(),
    supabase.from('meetings').select('*').eq('active', true).gte('meeting_date', today).order('meeting_date').order('meeting_time').limit(1),
    supabase.from('content_documents').select('content').eq('key', 'vem_settings').maybeSingle(),
    supabase.from('user_workout_schedules').select('program_id, weekday_plan').eq('user_id', userId).maybeSingle(),
    loadReminders(),
    supabase.from('food_entries').select('calories').eq('user_id', userId).eq('entry_date', today),
    supabase.from('meetings').select('topic, meeting_date, recording_url').eq('active', true).lt('meeting_date', today).not('recording_url', 'is', null).order('meeting_date', { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (recordingResult.error) throw recordingResult.error;
  if (foodsResult.error) throw foodsResult.error;
  if (!userProfile) throw new Error('profile_not_found');
  if (trainingResult.error) throw trainingResult.error;
  if (generalResult.error) throw generalResult.error;
  if (meetingsResult.error) throw meetingsResult.error;
  if (vemSettingsResult.error) throw vemSettingsResult.error;
  if (scheduleResult.error) throw scheduleResult.error;
  const savedPlan = scheduleResult.data?.weekday_plan;
  const schedule = scheduleResult.data && savedPlan && typeof savedPlan === 'object' && !Array.isArray(savedPlan)
    ? { programId: scheduleResult.data.program_id, plan: Object.fromEntries(Object.entries(savedPlan).filter((entry): entry is [string, string] => typeof entry[1] === 'string')) }
    : null;
  const trainingContent = trainingResult.data?.content as unknown as LegacyTrainingContent | null;
  const generalContent = generalResult.data?.content as unknown as LegacyGeneralContent | null;
  const vemSettings = vemSettingsResult.data?.content as unknown as { call?: { link?: string; titulo?: string; info?: string } } | null;
  const profile: LegacyProfile = {
    apelido: userProfile.preferredName ?? userProfile.firstName,
    metaSemanal: userProfile.weeklyGoal,
    nivel: userProfile.level === 'advanced' ? 'avancada' : userProfile.level === 'intermediate' ? 'intermediaria' : 'iniciante',
    modalidade: userProfile.modality === 'home' ? 'casa' : 'academia',
    horarios: userProfile.mealTimes,
  };
  const days = new Map(checkins.map((checkin) => [checkin.date, checkinToDay(checkin)]));
  const weekStart = startOfWeek(new Date());
  const completedWeekdays = Array.from({ length: 7 }, (_, index) => isCompleted(days.get(localDateKey(addDays(weekStart, index))) ?? emptyDay()));
  const weeklyCompleted = completedWeekdays.filter(Boolean).length;
  let streak = 0;
  let cursor = new Date();
  if (!isCompleted(days.get(localDateKey(cursor)) ?? emptyDay())) cursor = addDays(cursor, -1);
  while (isCompleted(days.get(localDateKey(cursor)) ?? emptyDay())) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  const now = new Date();
  const hour = now.getHours();
  const agenda = meetingsResult.data?.[0];
  const day = checkinToDay(currentCheckin);
  const profileName = profile?.apelido?.trim();
  const displayName = profileName || 'Participante';
  const dateLabel = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).format(now);

  return {
    displayName,
    dateLabel,
    greeting: hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite',
    phrases: getPhrases(generalContent, today),
    weeklyCompleted,
    weeklyGoal: profile?.metaSemanal ?? generalContent?.metaSemanalPadrao ?? 3,
    streak,
    completedWeekdays,
    workout: selectWorkout(trainingContent, profile, schedule),
    today: day,
    nextMealLabel: nextMeal(profile, day),
    waterReminder: reminderBundle.settings.water
      ? `Água: lembrete a cada ${String(reminderBundle.settings.waterIntervalHours).replace('.', ',')} h, das ${reminderBundle.settings.waterStart} às ${reminderBundle.settings.waterEnd}`
      : 'Lembrete de água desligado',
    reminders: remindersForDay(reminderBundle, now),
    call: vemSettings?.call?.link?.trim() ? { link: vemSettings.call.link.trim(), title: vemSettings.call.titulo?.trim() || 'Call da VEM', info: vemSettings.call.info?.trim() ?? '' } : null,
    caloriesToday: (foodsResult.data ?? []).reduce((sum, row) => sum + row.calories, 0),
    recording: recordingResult.data?.recording_url && /^https?:\/\//i.test(recordingResult.data.recording_url)
      ? { title: recordingResult.data.topic, date: recordingResult.data.meeting_date, url: recordingResult.data.recording_url }
      : null,
    meeting: agenda?.meeting_date
      ? {
          id: agenda.id,
          date: agenda.meeting_date,
          time: agenda.meeting_time?.slice(0, 5) ?? '',
          title: agenda.topic,
          responsible: agenda.responsible ?? undefined,
          link: agenda.join_url || vemSettings?.call?.link,
        }
      : null,
  };
}

export async function saveToday(day: LegacyDay): Promise<void> {
  await saveDailyCheckin(dayToCheckin(localDateKey(), day));
}
