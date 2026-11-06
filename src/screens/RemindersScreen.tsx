import { useCallback, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppButton, AppCard, AppText } from '../components';
import type { RootStackParamList } from '../navigation/types';
import {
  MEAL_SLOTS,
  REMINDER_KINDS,
  WEEKDAY_OPTIONS,
  describeWeekdays,
  loadReminders,
  newReminder,
  savePersonalReminders,
  saveReminderPreferences,
  type Reminder,
  type ReminderBundle,
  type ReminderKind,
} from '../services/reminders';
import { notificationPermission, requestNotificationPermission, syncNotifications, type NotificationPermission } from '../services/notifications';
import { useAppTheme } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Lembretes'>;
const WATER_INTERVALS = [1, 1.5, 2, 3];

export function RemindersScreen({ navigation, route }: Props) {
  const theme = useAppTheme();
  const [bundle, setBundle] = useState<ReminderBundle | null>(null);
  const [permission, setPermission] = useState<NotificationPermission>('undetermined');
  const [saving, setSaving] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    try {
      const [data, status] = await Promise.all([loadReminders(), notificationPermission().catch(() => 'undetermined' as const)]);
      if (route.params?.novo) {
        const created = newReminder();
        data.personal = [...data.personal, created];
        setFocusId(created.id);
        navigation.setParams({ novo: undefined });
      }
      setBundle(data);
      setPermission(status);
    } catch (error) {
      Alert.alert('Não foi possível carregar os lembretes', error instanceof Error ? error.message : 'Confira sua conexão.');
    }
  }, [navigation, route.params?.novo]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  if (!bundle) return <SafeAreaView style={[styles.center, { backgroundColor: theme.colors.background }]}><AppText color={theme.colors.textMuted}>Carregando lembretes…</AppText></SafeAreaView>;

  const inputStyle = [styles.input, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface }];
  const setSettings = (patch: Partial<ReminderBundle['settings']>): void => setBundle({ ...bundle, settings: { ...bundle.settings, ...patch } });
  const setPersonal = (id: string, patch: Partial<Reminder>): void => setBundle({ ...bundle, personal: bundle.personal.map((item) => (item.id === id ? { ...item, ...patch } : item)) });
  const toggleTeam = (id: string): void => {
    const off = bundle.settings.teamOff.includes(id) ? bundle.settings.teamOff.filter((item) => item !== id) : [...bundle.settings.teamOff, id];
    setBundle({ ...bundle, settings: { ...bundle.settings, teamOff: off }, team: bundle.team.map((item) => (item.id === id ? { ...item, enabled: !off.includes(id) } : item)) });
  };

  const askPermission = async (): Promise<void> => {
    if (permission === 'denied') { void Linking.openSettings(); return; }
    setPermission(await requestNotificationPermission());
  };

  const save = async (): Promise<void> => {
    setSaving(true);
    try {
      await saveReminderPreferences(bundle.settings, bundle.mealTimes);
      await savePersonalReminders(bundle.personal);
      let status = permission;
      if (status === 'undetermined') { status = await requestNotificationPermission(); setPermission(status); }
      const count = status === 'granted' ? await syncNotifications().catch(() => 0) : 0;
      const semHora = bundle.personal.filter((item) => item.title.trim() && !item.time).length;
      Alert.alert(
        'Lembretes salvos',
        status === 'granted'
          ? `${count} ${count === 1 ? 'notificação agendada' : 'notificações agendadas'} no celular.${semHora ? ' Lembretes sem horário aparecem só na agenda do Início.' : ''}`
          : 'Os lembretes aparecem na agenda do Início. Para receber notificações, permita nas configurações do celular.',
      );
      navigation.goBack();
    } catch (error) {
      Alert.alert('Não foi possível salvar', error instanceof Error ? error.message : 'Tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.background }]} edges={['left', 'right', 'bottom']}>
      <ScrollView automaticallyAdjustKeyboardInsets contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {permission !== 'granted' && (
          <AppCard style={[styles.card, { borderColor: theme.colors.accent }]}>
            <AppText weight="700">Notificações desligadas</AppText>
            <AppText variant="caption" color={theme.colors.textMuted}>
              {permission === 'denied' ? 'Você bloqueou as notificações do VEM. Libere nas configurações do celular para receber os lembretes.' : 'Permita as notificações para receber os lembretes no celular, mesmo com o app fechado.'}
            </AppText>
            <AppButton label={permission === 'denied' ? 'Abrir configurações' : 'Permitir notificações'} variant="secondary" onPress={() => void askPermission()} />
          </AppCard>
        )}

        <AppCard style={styles.card}>
          <AppText variant="subtitle" weight="700">Refeições</AppText>
          <AppText variant="caption" color={theme.colors.textMuted}>Preencha os horários em que você costuma comer.</AppText>
          {MEAL_SLOTS.map((meal) => (
            <View key={meal.id} style={styles.timeRow}>
              <AppText weight="600" style={styles.flex}>{meal.label}</AppText>
              <TextInput value={bundle.mealTimes[meal.id] ?? ''} onChangeText={(value) => setBundle({ ...bundle, mealTimes: { ...bundle.mealTimes, [meal.id]: value } })} placeholder="12:30" maxLength={5} keyboardType="numbers-and-punctuation" accessibilityLabel={`Horário de ${meal.label}`} placeholderTextColor={theme.colors.textMuted} style={[inputStyle, styles.timeInput]} />
            </View>
          ))}
          <View style={styles.switchRow}>
            <View style={styles.flex}><AppText weight="700">Lembrete das refeições</AppText><AppText variant="caption" color={theme.colors.textMuted}>Um aviso no horário de cada refeição</AppText></View>
            <Switch value={bundle.settings.meals} onValueChange={(meals) => setSettings({ meals })} />
          </View>
        </AppCard>

        <AppCard style={styles.card}>
          <View style={styles.switchRow}>
            <AppText variant="subtitle" weight="700" style={styles.flex}>Água</AppText>
            <Switch value={bundle.settings.water} onValueChange={(water) => setSettings({ water })} accessibilityLabel="Lembrete de água" />
          </View>
          <AppText variant="caption" color={theme.colors.textMuted}>A cada</AppText>
          <View style={styles.chips}>
            {WATER_INTERVALS.map((hours) => {
              const selected = bundle.settings.waterIntervalHours === hours;
              return (
                <Pressable key={hours} accessibilityRole="radio" accessibilityState={{ checked: selected }} onPress={() => setSettings({ waterIntervalHours: hours })} style={[styles.chip, { borderColor: selected ? theme.colors.text : theme.colors.border, backgroundColor: selected ? theme.colors.text : 'transparent' }]}>
                  <AppText variant="caption" weight="600" color={selected ? theme.colors.background : theme.colors.text}>{String(hours).replace('.', ',')} hora{hours > 1 ? 's' : ''}</AppText>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.row}>
            <View style={styles.flex}><AppText variant="caption" color={theme.colors.textMuted}>Das</AppText><TextInput value={bundle.settings.waterStart} onChangeText={(waterStart) => setSettings({ waterStart })} maxLength={5} keyboardType="numbers-and-punctuation" style={inputStyle} /></View>
            <View style={styles.flex}><AppText variant="caption" color={theme.colors.textMuted}>Até</AppText><TextInput value={bundle.settings.waterEnd} onChangeText={(waterEnd) => setSettings({ waterEnd })} maxLength={5} keyboardType="numbers-and-punctuation" style={inputStyle} /></View>
          </View>
        </AppCard>

        <AppCard style={styles.card}>
          <AppText variant="subtitle" weight="700">Treino</AppText>
          <AppText variant="caption" color={theme.colors.textMuted}>
            {bundle.notifyWorkouts ? 'Aviso nos dias com treino na sua semana.' : 'O lembrete de treino está desligado no Painel.'}
          </AppText>
          <View style={styles.timeRow}>
            <AppText weight="600" style={styles.flex}>Horário do aviso</AppText>
            <TextInput value={bundle.settings.workoutTime} onChangeText={(workoutTime) => setSettings({ workoutTime })} maxLength={5} keyboardType="numbers-and-punctuation" accessibilityLabel="Horário do lembrete de treino" style={[inputStyle, styles.timeInput]} />
          </View>
        </AppCard>

        <AppText variant="title" weight="600">Meus lembretes</AppText>
        <AppText variant="caption" color={theme.colors.textMuted}>Crie lembretes pro que quiser: beber água, ler, tarefas do dia. Eles aparecem na agenda do Início e como notificação no celular.</AppText>
        {bundle.personal.map((reminder) => (
          <AppCard key={reminder.id} style={styles.card}>
            <TextInput
              value={reminder.title}
              autoFocus={focusId === reminder.id}
              onChangeText={(title) => setPersonal(reminder.id, { title })}
              placeholder="ex: Ler 10 páginas"
              accessibilityLabel="Lembrete"
              maxLength={120}
              placeholderTextColor={theme.colors.textMuted}
              style={inputStyle}
            />
            <View style={styles.chips}>
              {REMINDER_KINDS.map(([kind, label, suggestion]) => {
                const selected = reminder.kind === kind;
                return (
                  <Pressable
                    key={kind}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                    onPress={() => setPersonal(reminder.id, { kind: kind as ReminderKind, ...(!reminder.title.trim() && suggestion ? { title: suggestion } : {}) })}
                    style={[styles.chip, { borderColor: selected ? theme.colors.text : theme.colors.border, backgroundColor: selected ? theme.colors.text : 'transparent' }]}
                  >
                    <AppText variant="caption" weight="600" color={selected ? theme.colors.background : theme.colors.text}>{label}</AppText>
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.row}>
              <View style={styles.timeCol}><AppText variant="caption" color={theme.colors.textMuted}>Horário</AppText><TextInput value={reminder.time} onChangeText={(time) => setPersonal(reminder.id, { time })} placeholder="10:00" maxLength={5} keyboardType="numbers-and-punctuation" placeholderTextColor={theme.colors.textMuted} style={inputStyle} /></View>
              <View style={styles.flex}><AppText variant="caption" color={theme.colors.textMuted}>Observação</AppText><TextInput value={reminder.note} onChangeText={(note) => setPersonal(reminder.id, { note })} placeholder="opcional" placeholderTextColor={theme.colors.textMuted} style={inputStyle} /></View>
            </View>
            <AppText variant="caption" color={theme.colors.textMuted}>Dias (nenhum marcado = todo dia)</AppText>
            <View style={styles.chips}>
              {WEEKDAY_OPTIONS.map(([day, label]) => {
                const selected = reminder.weekdays.includes(day);
                return (
                  <Pressable
                    key={day}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: selected }}
                    onPress={() => setPersonal(reminder.id, { weekdays: selected ? reminder.weekdays.filter((item) => item !== day) : [...reminder.weekdays, day] })}
                    style={[styles.dayChip, { borderColor: selected ? theme.colors.primary : theme.colors.border, backgroundColor: selected ? theme.colors.primary : 'transparent' }]}
                  >
                    <AppText variant="caption" weight="600" color={selected ? '#fff' : theme.colors.text}>{label}</AppText>
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.switchRow}>
              <AppText weight="600" style={styles.flex}>Ativo</AppText>
              <Switch value={reminder.enabled} onValueChange={(enabled) => setPersonal(reminder.id, { enabled })} accessibilityLabel="Lembrete ativo" />
            </View>
            <Pressable onPress={() => setBundle({ ...bundle, personal: bundle.personal.filter((item) => item.id !== reminder.id) })} style={styles.linkStart}>
              <AppText variant="caption" weight="700" color={theme.colors.danger}>Apagar lembrete</AppText>
            </Pressable>
          </AppCard>
        ))}
        <AppButton label="+ Adicionar lembrete" variant="secondary" onPress={() => { const created = newReminder(); setFocusId(created.id); setBundle({ ...bundle, personal: [...bundle.personal, created] }); }} />

        {!!bundle.team.length && (
          <AppCard style={styles.card}>
            <AppText variant="subtitle" weight="700">Lembretes da equipe VEM</AppText>
            <AppText variant="caption" color={theme.colors.textMuted}>A equipe criou estes pra todas. Desligue os que não quiser receber.</AppText>
            {bundle.team.map((reminder) => (
              <View key={reminder.id} style={styles.switchRow}>
                <View style={styles.flex}>
                  <AppText weight="700">{reminder.title}</AppText>
                  <AppText variant="caption" color={theme.colors.textMuted}>{reminder.time || 'sem horário'} · {describeWeekdays(reminder.weekdays)}{reminder.note ? ` · ${reminder.note}` : ''}</AppText>
                </View>
                <Switch value={reminder.enabled} onValueChange={() => toggleTeam(reminder.id)} accessibilityLabel={reminder.title} />
              </View>
            ))}
          </AppCard>
        )}

        <AppButton label="Salvar lembretes" loading={saving} onPress={() => void save()} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  card: { gap: 10 },
  flex: { flex: 1 },
  row: { flexDirection: 'row', gap: 8 },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  timeCol: { width: 96 },
  timeInput: { width: 92, textAlign: 'center' },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 11, paddingVertical: 10, fontSize: 16, marginTop: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7, minHeight: 36, justifyContent: 'center' },
  dayChip: { borderWidth: 1, borderRadius: 8, minWidth: 42, minHeight: 36, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  linkStart: { alignSelf: 'flex-start', paddingVertical: 4 },
});
