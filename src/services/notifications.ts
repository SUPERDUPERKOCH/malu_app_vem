import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { MEAL_SLOTS, loadReminders, minutesOf, waterSlots, type ReminderBundle } from './reminders';
import { WEEK_DAYS, loadWorkoutOverview } from './workouts';
import { supabase } from './supabase';

const CHANNEL_ID = 'lembretes-vem';
const JS_WEEKDAY: Record<string, number> = { dom: 1, seg: 2, ter: 3, qua: 4, qui: 5, sex: 6, sab: 7 };

export type NotificationPermission = 'granted' | 'denied' | 'undetermined';

interface PlannedNotification {
  title: string;
  body: string;
  trigger: Notifications.NotificationTriggerInput;
}

// Registrado ao carregar o módulo (como no minha-rotina): o aviso aparece mesmo com o app aberto.
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

let configured = false;

/**
 * Cria o canal do Android. Com a permissão USE_EXACT_ALARM declarada no app.json, os gatilhos
 * diários, semanais e de data usam `setExactAndAllowWhileIdle()` e disparam no minuto agendado.
 */
export async function configureNotifications(): Promise<void> {
  if (configured) return;
  configured = true;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Lembretes VEM',
      description: 'Lembretes de treino, água, refeições, encontros e os seus lembretes',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#C49A45',
    });
  }
}

export async function notificationPermission(): Promise<NotificationPermission> {
  const { status } = await Notifications.getPermissionsAsync();
  return status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'undetermined';
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  // No Android 13+, o aviso do sistema só aparece se já existir um canal de notificação.
  await configureNotifications();
  const { status } = await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: false } });
  return status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'undetermined';
}

function daily(time: string): Notifications.NotificationTriggerInput | null {
  const minutes = minutesOf(time);
  if (minutes === null) return null;
  return { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: Math.floor(minutes / 60), minute: minutes % 60, channelId: CHANNEL_ID };
}

function weekly(weekday: number, time: string): Notifications.NotificationTriggerInput | null {
  const minutes = minutesOf(time);
  if (minutes === null) return null;
  return { type: Notifications.SchedulableTriggerInputTypes.WEEKLY, weekday, hour: Math.floor(minutes / 60), minute: minutes % 60, channelId: CHANNEL_ID };
}

function remindersPlan(bundle: ReminderBundle): PlannedNotification[] {
  const plan: PlannedNotification[] = [];
  for (const reminder of [...bundle.team, ...bundle.personal]) {
    if (!reminder.enabled || !reminder.time) continue;
    const body = reminder.note || 'Lembrete VEM';
    if (!reminder.weekdays.length) {
      const trigger = daily(reminder.time);
      if (trigger) plan.push({ title: reminder.title, body, trigger });
    } else {
      for (const day of reminder.weekdays) {
        const trigger = weekly(day, reminder.time);
        if (trigger) plan.push({ title: reminder.title, body, trigger });
      }
    }
  }
  if (bundle.settings.meals) {
    for (const meal of MEAL_SLOTS) {
      const trigger = daily(bundle.mealTimes[meal.id] ?? '');
      if (trigger) plan.push({ title: meal.title, body: 'Registre o prato no diário da Dieta.', trigger });
    }
  }
  if (bundle.settings.water) {
    for (const time of waterSlots(bundle.settings)) {
      const trigger = daily(time);
      if (trigger) plan.push({ title: 'Hora de beber água', body: 'Um copo agora ajuda a bater a meta de 8 por dia.', trigger });
    }
  }
  return plan;
}

async function workoutsPlan(time: string): Promise<PlannedNotification[]> {
  const overview = await loadWorkoutOverview();
  const plan = overview.schedule?.weekdayPlan ?? {};
  const workouts = overview.program?.workouts ?? [];
  return WEEK_DAYS.flatMap((day) => {
    const workout = workouts.find((item) => item.letter === plan[day]);
    const trigger = workout ? weekly(JS_WEEKDAY[day] ?? 2, time) : null;
    return workout && trigger ? [{ title: 'Hoje tem treino', body: `${workout.name} · ~${workout.estimatedMinutes} min. Bora?`, trigger }] : [];
  });
}

async function meetingsPlan(): Promise<PlannedNotification[]> {
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const result = await supabase.from('meetings').select('id, meeting_date, meeting_time, topic').eq('active', true).gte('meeting_date', today).order('meeting_date').limit(3);
  if (result.error) throw result.error;
  return (result.data ?? []).flatMap((meeting) => {
    const minutes = minutesOf(meeting.meeting_time?.slice(0, 5) ?? '');
    if (minutes === null) return [];
    const [year, month, day] = meeting.meeting_date.split('-').map(Number);
    const at = new Date(year ?? 2026, (month ?? 1) - 1, day ?? 1, 0, minutes - 30);
    if (at <= now) return [];
    return [{ title: 'Encontro VEM em 30 minutos', body: meeting.topic, trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at, channelId: CHANNEL_ID } }];
  });
}

/**
 * Reagenda todas as notificações locais a partir do estado atual.
 * Não pede permissão: só agenda quando ela já foi concedida.
 * Retorna a quantidade agendada (0 sem permissão).
 */
export async function syncNotifications(bundle?: ReminderBundle): Promise<number> {
  await configureNotifications();
  if ((await notificationPermission()) !== 'granted') return 0;
  const data = bundle ?? await loadReminders();
  const planned = remindersPlan(data);
  // Treino e encontros dependem de outras consultas; uma falha nelas não impede os demais lembretes.
  if (data.notifyWorkouts) planned.push(...await workoutsPlan(data.settings.workoutTime).catch(() => []));
  if (data.notifyMeetings) planned.push(...await meetingsPlan().catch(() => []));
  await Notifications.cancelAllScheduledNotificationsAsync();
  // iOS limita a 64 notificações agendadas por app.
  const limited = Platform.OS === 'ios' ? planned.slice(0, 60) : planned;
  for (const item of limited) {
    await Notifications.scheduleNotificationAsync({ content: { title: item.title, body: item.body, sound: true }, trigger: item.trigger });
  }
  return limited.length;
}
