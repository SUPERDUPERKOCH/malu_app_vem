import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '../auth';
import { AppButton, AppCard, AppText, VemIcon } from '../components';
import type { MainTabParamList } from '../navigation/types';
import { loadHomeDashboard, MEALS, saveToday, type HomeDashboard, type LegacyDay } from '../services/home';
import { REMINDER_KINDS, minutesOf, reminderDoneKey } from '../services/reminders';
import { googleCalendarUrl } from '../services/community';
import { useAppTheme } from '../theme';

type Props = BottomTabScreenProps<MainTabParamList, 'Inicio'>;

const moodLabels = ['Pesado', 'Baixo', 'Ok', 'Bem', 'Ótimo'];
const weekdayLabels = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'];

export function HomeScreen({ navigation }: Props) {
  const theme = useAppTheme();
  const { profile, session, signOut } = useAuth();
  const [dashboard, setDashboard] = useState<HomeDashboard | null>(null);
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (): Promise<void> => {
    if (!session) return;
    setError('');
    try {
      const next = await loadHomeDashboard();
      setDashboard(next);
      setPhraseIndex((current) => Math.min(current, Math.max(0, next.phrases.length - 1)));
    } catch {
      setError('Não foi possível sincronizar sua Home. Confira a conexão e tente novamente.');
    }
  }, [session]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const refresh = async (): Promise<void> => {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  };

  // Fila de gravação: toques rápidos (copos, refeições, lembretes) são gravados um por vez e na ordem.
  // Cada estado novo já contém os toques anteriores, então só o mais recente precisa ser enviado.
  const saveQueue = useRef<{ running: boolean; next: LegacyDay | null }>({ running: false, next: null });
  const queueSave = useCallback((day: LegacyDay): void => {
    const queue = saveQueue.current;
    queue.next = day;
    if (queue.running) return;
    queue.running = true;
    void (async () => {
      while (queue.next) {
        const pending = queue.next;
        queue.next = null;
        try { await saveToday(pending); }
        catch { setError('Não foi possível salvar seu registro diário. Tente novamente.'); }
      }
      queue.running = false;
    })();
  }, []);

  const updateDay = (updater: (day: LegacyDay) => LegacyDay): void => {
    setDashboard((current) => {
      if (!current) return current;
      const today = updater(current.today);
      queueSave(today);
      return { ...current, today };
    });
  };

  useEffect(() => {
    if (!dashboard) return;
    const finishedMeals = MEALS.filter((meal) => dashboard.today.refeicoes[meal.id]).length;
    if (finishedMeals === MEALS.length && dashboard.nextMealLabel !== 'Refeições registradas ou horários passados') {
      setDashboard((current) => current ? { ...current, nextMealLabel: 'Refeições registradas ou horários passados' } : current);
    }
  }, [dashboard]);

  if (!dashboard) {
    return (
      <SafeAreaView style={[styles.loading, { backgroundColor: theme.colors.background }]}>
        <AppText color={error ? theme.colors.danger : theme.colors.textMuted} style={styles.errorText}>
          {error || 'Preparando seu dia…'}
        </AppText>
        {!!error && <AppButton label="Tentar novamente" onPress={load} />}
      </SafeAreaView>
    );
  }

  const weeklyGoal = profile?.weeklyGoal ?? dashboard.weeklyGoal;
  const percentage = Math.min(100, Math.round((dashboard.weeklyCompleted / Math.max(1, weeklyGoal)) * 100));
  const phrase = dashboard.phrases[phraseIndex] ?? '';
  const completedMeals = MEALS.filter((meal) => dashboard.today.refeicoes[meal.id]).length;

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.colors.brandSurface }]} edges={['top', 'left', 'right']}>
      <StatusBar style="light" />
      <ScrollView
        style={{ backgroundColor: theme.colors.background }}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.colors.primary} />}
      >
        <View style={[styles.hero, { backgroundColor: theme.colors.brandSurface }]}>
          <View style={styles.brandRow}>
            <View style={styles.logoRow}>
              <View style={[styles.logoBadge, { borderColor: theme.colors.brandText }]}>
                <AppText variant="caption" color={theme.colors.brandText} weight="800" style={styles.logoLetters}>VEM</AppText>
              </View>
              <AppText color={theme.colors.brandText} weight="600">Vida em Movimento</AppText>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Sair" hitSlop={10} onPress={() => void signOut()} style={styles.logout}>
              <VemIcon name="logout" size={20} color={theme.colors.brandText} />
            </Pressable>
          </View>

          <AppText variant="caption" color={theme.colors.brandText} style={styles.dateLabel}>
            {dashboard.dateLabel.toUpperCase()}
          </AppText>
          <AppText variant="title" color={theme.colors.brandText} weight="600" style={styles.greeting}>
            {dashboard.greeting}, {profile?.preferredName || profile?.firstName || 'participante'}.{' '}
            <AppText variant="title" color={theme.colors.accent} style={styles.italic}>Bora?</AppText>
          </AppText>

          <View style={[styles.phraseBox, { borderLeftColor: theme.colors.accent }]}>
            <View style={styles.phraseHeader}>
              <AppText variant="caption" color={theme.colors.brandText} style={styles.phraseCaption}>
                FRASE DO DIA · {phraseIndex + 1} DE {dashboard.phrases.length}
              </AppText>
              <View style={styles.phraseControls}>
                <Pressable
                  accessibilityLabel="Frase anterior"
                  onPress={() => setPhraseIndex((phraseIndex - 1 + dashboard.phrases.length) % dashboard.phrases.length)}
                  style={styles.phraseArrow}
                >
                  <AppText color={theme.colors.brandText} variant="subtitle">‹</AppText>
                </Pressable>
                <Pressable
                  accessibilityLabel="Próxima frase"
                  onPress={() => setPhraseIndex((phraseIndex + 1) % dashboard.phrases.length)}
                  style={styles.phraseArrow}
                >
                  <AppText color={theme.colors.brandText} variant="subtitle">›</AppText>
                </Pressable>
              </View>
            </View>
            <AppText variant="subtitle" color={theme.colors.brandText} style={styles.italic}>{phrase}</AppText>
            <Pressable accessibilityRole="button" onPress={() => navigation.getParent()?.navigate('Compartilhar', { mode: 'frase', phrase })} hitSlop={8}>
              <AppText variant="caption" weight="700" color={theme.colors.accent} style={styles.underline}>Criar imagem da frase →</AppText>
            </Pressable>
          </View>

          <View style={styles.goalRow}>
            <AppText variant="caption" color={theme.colors.brandText}>
              Meta da semana: <AppText variant="caption" color={theme.colors.brandText} weight="800">{dashboard.weeklyCompleted} de {weeklyGoal}</AppText> treinos
            </AppText>
            <View style={styles.weekDots}>
              {dashboard.completedWeekdays.map((completed, index) => (
                <View key={`${weekdayLabels[index]}-${index}`} style={styles.weekDay}>
                  <View style={[styles.weekDot, { borderColor: theme.colors.brandText, backgroundColor: completed ? theme.colors.accent : 'transparent' }]} />
                </View>
              ))}
            </View>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${percentage}%`, backgroundColor: theme.colors.accent }]} />
          </View>
        </View>

        <View style={[styles.body, { gap: theme.spacing.lg }]}>
          {!!error && (
            <AppCard style={[styles.syncError, { borderColor: theme.colors.danger }]}>
              <AppText variant="caption" color={theme.colors.danger}>{error}</AppText>
              <AppButton label="Sincronizar novamente" variant="secondary" onPress={load} />
            </AppCard>
          )}
          <View style={styles.summary}>
            {[
              [`${dashboard.weeklyCompleted}/${weeklyGoal}`, 'treinos na semana'],
              [String(dashboard.streak), dashboard.streak === 1 ? 'dia seguido' : 'dias seguidos'],
              [`${percentage}%`, 'da meta semanal'],
            ].map(([value, label]) => (
              <AppCard key={label} style={styles.summaryCard}>
                <AppText variant="title" color={theme.colors.primary} weight="700">{value}</AppText>
                <AppText variant="caption" color={theme.colors.textMuted}>{label}</AppText>
              </AppCard>
            ))}
          </View>

          <View style={styles.section}>
            <AppText variant="title" weight="600">Treino do dia</AppText>
            <Pressable
              accessibilityRole="button"
              onPress={() => navigation.navigate('Treino')}
              style={({ pressed }) => [styles.workoutCard, { backgroundColor: theme.colors.brandSurface, opacity: pressed ? 0.86 : 1 }]}
            >
              <View style={[styles.focusPill, { backgroundColor: 'rgba(255,255,255,0.14)' }]}>
                <AppText variant="caption" color={theme.colors.brandText} weight="800">{dashboard.workout.focus.toUpperCase()}</AppText>
              </View>
              <AppText variant="title" color={theme.colors.brandText} weight="600">{dashboard.workout.title}</AppText>
              {dashboard.workout.restDay ? (
                <AppText color={theme.colors.brandText}>{dashboard.workout.description ?? 'Se quiser se mexer, escolha um treino ou faça uma caminhada leve.'}</AppText>
              ) : (
                <View style={styles.workoutMeta}>
                  <View style={styles.inline}><VemIcon name="clock" size={18} color={theme.colors.brandText} /><AppText variant="caption" color={theme.colors.brandText}>~{dashboard.workout.estimatedMinutes} min</AppText></View>
                  <AppText variant="caption" color={theme.colors.brandText}>{dashboard.workout.exerciseCount} exercícios</AppText>
                </View>
              )}
              <AppButton
                label={dashboard.workout.restDay ? 'Ver meus treinos' : 'Começar treino'}
                onPress={() => navigation.navigate('Treino')}
                style={{ backgroundColor: theme.colors.accent, borderColor: theme.colors.accent }}
              />
            </Pressable>
          </View>

          <View style={styles.section}>
            <View style={styles.habitHeader}>
              <AppText variant="title" weight="600">Agenda de hoje</AppText>
              <Pressable accessibilityRole="button" onPress={() => navigation.getParent()?.navigate('Lembretes')} hitSlop={8}>
                <AppText variant="caption" weight="700" color={theme.colors.primary} style={styles.underline}>editar lembretes</AppText>
              </Pressable>
            </View>
            {dashboard.call && (
              <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(dashboard.call?.link ?? '')} style={[styles.callCard, { backgroundColor: theme.colors.brandSurface }]}>
                <View style={[styles.iconBox, { backgroundColor: 'rgba(255,255,255,0.14)' }]}><VemIcon name="calendar" size={22} color={theme.colors.brandText} /></View>
                <View style={styles.cardText}>
                  <AppText variant="caption" color={theme.colors.accent} weight="700">{dashboard.call.title}</AppText>
                  <AppText weight="700" color={theme.colors.brandText}>Entrar na call</AppText>
                  {!!dashboard.call.info && <AppText variant="caption" color={theme.colors.brandText}>{dashboard.call.info}</AppText>}
                </View>
                <VemIcon name="chevronRight" size={18} color={theme.colors.brandText} />
              </Pressable>
            )}
            <AppCard style={{ gap: theme.spacing.sm }}>
              {dashboard.reminders.length ? (
                <>
                  <AppText variant="caption" color={theme.colors.textMuted}>
                    {dashboard.reminders.filter((item) => dashboard.today.custom[reminderDoneKey(item.id)]).length} de {dashboard.reminders.length} feitos
                  </AppText>
                  {dashboard.reminders.map((reminder) => {
                    const done = !!dashboard.today.custom[reminderDoneKey(reminder.id)];
                    const minutes = minutesOf(reminder.time);
                    const late = !done && minutes !== null && minutes < new Date().getHours() * 60 + new Date().getMinutes();
                    return (
                      <Pressable
                        key={reminder.id}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: done }}
                        onPress={() => updateDay((day) => {
                          const custom = { ...day.custom };
                          if (done) delete custom[reminderDoneKey(reminder.id)]; else custom[reminderDoneKey(reminder.id)] = true;
                          return { ...day, custom, agua: !done && reminder.kind === 'water' ? Math.min(10, day.agua + 1) : day.agua };
                        })}
                        style={[styles.agendaRow, { backgroundColor: theme.colors.surfaceElevated, opacity: done ? 0.7 : 1 }]}
                      >
                        <AppText variant="caption" weight="700" color={theme.colors.textMuted} style={styles.agendaTime}>{reminder.time || '—'}</AppText>
                        <View style={styles.cardText}>
                          <AppText weight="700" style={done ? styles.strike : undefined}>{reminder.title}</AppText>
                          <AppText variant="caption" color={theme.colors.textMuted}>
                            {reminder.note || REMINDER_KINDS.find(([kind]) => kind === reminder.kind)?.[1]}{reminder.team ? ' · da equipe VEM' : ''}{late ? ' · passou do horário' : ''}
                          </AppText>
                        </View>
                        <View style={[styles.checkbox, styles.checkboxLarge, { borderColor: done ? theme.colors.success : theme.colors.border, backgroundColor: done ? theme.colors.success : 'transparent' }]}>
                          {done && <VemIcon name="check" size={14} color="#fff" />}
                        </View>
                      </Pressable>
                    );
                  })}
                </>
              ) : (
                <AppText variant="caption" color={theme.colors.textMuted}>Nenhum lembrete pra hoje. Crie o seu: beber água, ler, tarefas, o que quiser.</AppText>
              )}
              <AppButton label="+ Novo lembrete" variant="secondary" onPress={() => navigation.getParent()?.navigate('Lembretes', { novo: true })} />
            </AppCard>
            <Pressable accessibilityRole="button" onPress={() => navigation.navigate('Dieta')}>
              <AppCard style={styles.reminderCard}>
                <View style={[styles.iconBox, { backgroundColor: `${theme.colors.primary}12` }]}><VemIcon name="nutrition" size={22} color={theme.colors.primary} /></View>
                <View style={styles.cardText}>
                  <AppText variant="caption" color={theme.colors.textMuted} weight="800">DIETA</AppText>
                  <AppText weight="700">{dashboard.caloriesToday.toLocaleString('pt-BR')} kcal registradas hoje</AppText>
                  <AppText variant="caption" color={theme.colors.textMuted}>Registre o que comeu com foto</AppText>
                </View>
                <VemIcon name="chevronRight" size={18} color={theme.colors.textMuted} />
              </AppCard>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => navigation.getParent()?.navigate('Lembretes')}>
            <AppCard style={styles.reminderCard}>
              <View style={[styles.iconBox, { backgroundColor: `${theme.colors.primary}12` }]}>
                <VemIcon name="clock" size={22} color={theme.colors.primary} />
              </View>
              <View style={styles.cardText}>
                <AppText variant="caption" color={theme.colors.textMuted} weight="800">HOJE</AppText>
                <AppText weight="700">{dashboard.nextMealLabel}</AppText>
                <AppText variant="caption" color={theme.colors.textMuted}>{dashboard.waterReminder}</AppText>
              </View>
              <VemIcon name="chevronRight" size={18} color={theme.colors.textMuted} />
            </AppCard>
            </Pressable>
            {dashboard.meeting && (
              <AppCard style={{ gap: theme.spacing.sm }}>
                <View style={styles.inline}>
                  <VemIcon name="calendar" size={22} color={theme.colors.primary} />
                  <AppText variant="caption" color={theme.colors.primary} weight="800">PRÓXIMO ENCONTRO</AppText>
                </View>
                <AppText variant="subtitle" weight="700">{dashboard.meeting.title}</AppText>
                <AppText color={theme.colors.textMuted}>
                  {new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${dashboard.meeting.date}T12:00:00`))} · {dashboard.meeting.time}
                  {dashboard.meeting.responsible ? ` · com ${dashboard.meeting.responsible}` : ''}
                </AppText>
                {dashboard.meeting.link && <AppButton label="Entrar no encontro" onPress={() => void Linking.openURL(dashboard.meeting?.link ?? '')} />}
                <AppButton
                  label="Adicionar ao calendário"
                  variant="secondary"
                  onPress={() => {
                    const meeting = dashboard.meeting;
                    if (!meeting) return;
                    void Linking.openURL(googleCalendarUrl({ id: meeting.id, date: meeting.date, time: meeting.time, durationMinutes: 60, topic: meeting.title, responsible: meeting.responsible ?? '', type: 'weekly', joinUrl: meeting.link ?? '', recordingUrl: '', materials: '' }));
                  }}
                />
              </AppCard>
            )}
            {dashboard.recording && (
              <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(dashboard.recording?.url ?? '')}>
                <AppCard style={styles.reminderCard}>
                  <View style={[styles.iconBox, { backgroundColor: `${theme.colors.primary}12` }]}><VemIcon name="play" size={18} color={theme.colors.primary} /></View>
                  <View style={styles.cardText}>
                    <AppText variant="caption" color={theme.colors.textMuted} weight="800">GRAVAÇÃO DISPONÍVEL</AppText>
                    <AppText weight="700">{dashboard.recording.title}</AppText>
                    <AppText variant="caption" color={theme.colors.textMuted}>{new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short' }).format(new Date(`${dashboard.recording.date}T12:00:00`))}</AppText>
                  </View>
                  <VemIcon name="chevronRight" size={18} color={theme.colors.textMuted} />
                </AppCard>
              </Pressable>
            )}
          </View>

          <View style={styles.section}>
            <AppText variant="title" weight="600">Hábitos do dia</AppText>
            <AppCard style={{ gap: theme.spacing.lg }}>
              <View style={styles.habitHeader}>
                <View style={styles.inline}><VemIcon name="droplet" size={20} color={theme.colors.primary} /><AppText weight="700">Água</AppText></View>
                <AppText variant="caption" color={theme.colors.textMuted}>{dashboard.today.agua} de 8 copos (2 L)</AppText>
              </View>
              <View style={styles.waterRow}>
                {Array.from({ length: 10 }, (_, index) => index + 1).map((amount) => (
                  <Pressable
                    key={amount}
                    accessibilityRole="button"
                    accessibilityLabel={`${amount} ${amount === 1 ? 'copo' : 'copos'} de água`}
                    onPress={() => updateDay((day) => ({ ...day, agua: day.agua === amount ? amount - 1 : amount }))}
                    style={[
                      styles.waterCup,
                      {
                        borderColor: theme.colors.primary,
                        backgroundColor: amount <= dashboard.today.agua ? theme.colors.primary : 'transparent',
                      },
                    ]}
                  />
                ))}
              </View>

              <View style={styles.habitHeader}>
                <AppText weight="700">Refeições</AppText>
                <AppText variant="caption" color={theme.colors.textMuted}>{completedMeals} de 5</AppText>
              </View>
              <View style={styles.mealsGrid}>
                {MEALS.map((meal) => {
                  const selected = !!dashboard.today.refeicoes[meal.id];
                  return (
                    <Pressable
                      key={meal.id}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: selected }}
                      onPress={() => updateDay((day) => ({ ...day, refeicoes: { ...day.refeicoes, [meal.id]: !day.refeicoes[meal.id] } }))}
                      style={[styles.meal, { borderColor: selected ? theme.colors.success : theme.colors.border, backgroundColor: selected ? `${theme.colors.success}18` : theme.colors.surface }]}
                    >
                      <View style={[styles.checkbox, { borderColor: selected ? theme.colors.success : theme.colors.border, backgroundColor: selected ? theme.colors.success : 'transparent' }]}>
                        {selected && <AppText variant="caption" color="#fff" weight="800">✓</AppText>}
                      </View>
                      <AppText variant="caption" weight="700">{meal.label}</AppText>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.inline}><VemIcon name="heart" size={20} color={theme.colors.primary} /><AppText weight="700">Humor</AppText></View>
              <View style={styles.moodRow}>
                {moodLabels.map((label, index) => {
                  const value = index + 1;
                  const selected = dashboard.today.humor === value;
                  return (
                    <Pressable
                      key={label}
                      onPress={() => updateDay((day) => ({ ...day, humor: selected ? null : value }))}
                      style={[styles.mood, { backgroundColor: selected ? theme.colors.secondary : 'transparent', borderColor: selected ? theme.colors.secondary : theme.colors.border }]}
                    >
                      <AppText variant="caption" color={selected ? '#fff' : theme.colors.text}>{label}</AppText>
                    </Pressable>
                  );
                })}
              </View>
            </AppCard>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorText: { textAlign: 'center', marginHorizontal: 24, marginBottom: 12 },
  syncError: { gap: 10 },
  scrollContent: { paddingBottom: 32 },
  hero: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 20, borderBottomLeftRadius: 26, borderBottomRightRadius: 26 },
  brandRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logoBadge: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  logoLetters: { letterSpacing: 3, marginLeft: 3 },
  logout: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  dateLabel: { letterSpacing: 1.2, opacity: 0.82, marginTop: 14 },
  greeting: { marginTop: 8 },
  italic: { fontStyle: 'italic' },
  phraseBox: { borderLeftWidth: 2, paddingLeft: 14, marginTop: 20, gap: 6 },
  phraseHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  phraseCaption: { opacity: 0.75, letterSpacing: 0.6 },
  phraseControls: { flexDirection: 'row', gap: 4 },
  phraseArrow: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  goalRow: { marginTop: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  weekDots: { flexDirection: 'row', gap: 6 },
  weekDay: { alignItems: 'center' },
  weekDot: { width: 11, height: 11, borderRadius: 6, borderWidth: 1.5 },
  progressTrack: { height: 6, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 9, overflow: 'hidden', marginTop: 10 },
  progressFill: { height: '100%', borderRadius: 9 },
  body: { padding: 16 },
  summary: { flexDirection: 'row', gap: 8 },
  summaryCard: { flex: 1, minWidth: 0, paddingHorizontal: 10, paddingVertical: 12 },
  section: { gap: 12 },
  workoutCard: { borderRadius: 22, padding: 18, gap: 12, overflow: 'hidden' },
  focusPill: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  workoutMeta: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  reminderCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  iconBox: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  cardText: { flex: 1, minWidth: 0 },
  habitHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  waterRow: { flexDirection: 'row', gap: 7, flexWrap: 'wrap' },
  waterCup: { width: 22, height: 28, borderWidth: 1.5, borderTopWidth: 0, borderBottomLeftRadius: 7, borderBottomRightRadius: 7 },
  mealsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  meal: { minWidth: '30%', flexGrow: 1, flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1, borderRadius: 10, padding: 9 },
  checkbox: { width: 20, height: 20, borderRadius: 6, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  checkboxLarge: { width: 24, height: 24, borderRadius: 7, borderWidth: 1.5 },
  underline: { textDecorationLine: 'underline' },
  strike: { textDecorationLine: 'line-through' },
  callCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, padding: 14 },
  agendaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 10, padding: 10, minHeight: 52 },
  agendaTime: { width: 44 },
  moodRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  mood: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 7 },
});
