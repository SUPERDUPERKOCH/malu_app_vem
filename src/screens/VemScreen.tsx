import { useCallback, useEffect, useState } from 'react';
import { Alert, BackHandler, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { AppButton, AppCard, AppText, VemIcon } from '../components';
import { dateKey, googleCalendarUrl, isLink, loadCommunity, setLessonCompleted, shareMeetingInvite, type CommunityData, type CourseModule, type Lesson, type Meeting } from '../services/community';
import { loadVem, toggleReward, type VemData } from '../services/modules';
import { useAppTheme } from '../theme';

type Tab = 'premios' | 'encontros' | 'curso';
const TABS: Array<[Tab, string]> = [['premios', 'Prêmios'], ['encontros', 'Encontros e call'], ['curso', 'Curso e materiais']];
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const WEEKDAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const parseDate = (key: string): Date => { const [y, m, d] = key.split('-').map(Number); return new Date(y ?? 2026, (m ?? 1) - 1, d ?? 1); };
const daysUntil = (key: string): number => Math.round((parseDate(key).getTime() - parseDate(dateKey()).getTime()) / 86_400_000);
const relative = (key: string): string => { const days = daysUntil(key); return days === 0 ? 'hoje' : days === 1 ? 'amanhã' : `em ${days} dias`; };

function open(url: string): void {
  Linking.openURL(url).catch(() => Alert.alert('Não foi possível abrir o link', url));
}

function ExampleTag() {
  const theme = useAppTheme();
  return <View style={[styles.tag, { backgroundColor: `${theme.colors.accent}38` }]}><AppText style={styles.tagText} weight="600">exemplo</AppText></View>;
}

function DateBox({ date, highlight }: { date: string; highlight?: boolean }) {
  const theme = useAppTheme();
  const value = parseDate(date);
  return (
    <View style={[styles.dateBox, { backgroundColor: highlight ? `${theme.colors.accent}40` : theme.colors.surfaceElevated }]}>
      <AppText variant="subtitle" weight="700">{value.getDate()}</AppText>
      <AppText variant="caption" color={theme.colors.textMuted}>{MONTHS[value.getMonth()]}</AppText>
    </View>
  );
}

function RewardsTab({ data, onReload }: { data: VemData | null; onReload: () => Promise<void> }) {
  const theme = useAppTheme();
  const [busy, setBusy] = useState<string | null>(null);
  if (!data) return <AppText color={theme.colors.textMuted} style={styles.mx}>Carregando prêmios…</AppText>;
  const unlocked = data.rewards.filter((reward) => reward.status !== 'locked').length;
  const next = data.rewards.filter((reward) => reward.status === 'locked').sort((a, b) => (a.n - a.value) - (b.n - b.value))[0];
  const label = (tipo: string): string => (tipo === 'treinos' ? 'treinos' : tipo === 'sequencia' ? 'dias seguidos' : 'dias com hábitos');
  return (
    <View style={styles.list}>
      <AppCard style={[styles.card, { borderColor: theme.colors.accent }]}>
        <AppText variant="caption" color={theme.colors.textMuted} weight="700">Seus prêmios</AppText>
        <View style={styles.baseline}><AppText variant="display" weight="700" color={theme.colors.primary}>{unlocked}</AppText><AppText>de {data.rewards.length} liberados</AppText></View>
        <View style={[styles.track, { backgroundColor: theme.colors.border }]}><View style={[styles.fill, { width: `${data.rewards.length ? (unlocked / data.rewards.length) * 100 : 0}%`, backgroundColor: theme.colors.primary }]} /></View>
        <AppText variant="caption">{next ? <>Próximo: <AppText variant="caption" weight="700">{next.nome}</AppText> · faltam {next.n - next.value} {label(next.tipo)}</> : 'Você liberou todos os prêmios.'}</AppText>
        <AppText variant="caption" color={theme.colors.textMuted}>Cada conquista libera um presente seu, pra você. Quando aproveitar, marque como resgatado.</AppText>
      </AppCard>
      {data.rewards.map((reward) => (
        <AppCard key={reward.id} style={[styles.card, styles.reward, reward.status === 'available' && { borderColor: theme.colors.accent }, reward.status === 'redeemed' && { borderColor: theme.colors.success }]}>
          <View style={[styles.rewardIcon, { backgroundColor: reward.status === 'locked' ? theme.colors.surfaceElevated : reward.status === 'redeemed' ? theme.colors.success : theme.colors.accent }]}>
            <VemIcon name={reward.status === 'locked' ? 'lock' : reward.status === 'redeemed' ? 'check' : 'gift'} size={22} color={reward.status === 'locked' ? theme.colors.textMuted : reward.status === 'redeemed' ? '#fff' : '#2E1A20'} />
          </View>
          <View style={styles.flexGap}>
            <AppText weight="700">{reward.nome}</AppText>
            {!!reward.desc && <AppText variant="caption" color={theme.colors.textMuted}>{reward.desc}</AppText>}
            <AppText variant="caption" weight="700">{reward.n} {label(reward.tipo)}</AppText>
            {reward.status === 'locked' && <View style={styles.row}><View style={[styles.track, styles.flex, { backgroundColor: theme.colors.border }]}><View style={[styles.fill, { width: `${Math.min(100, (reward.value / reward.n) * 100)}%`, backgroundColor: theme.colors.secondary }]} /></View><AppText variant="caption">{reward.value}/{reward.n}</AppText></View>}
            {reward.status !== 'locked' && (
              <AppButton
                label={reward.status === 'redeemed' ? 'Desfazer resgate' : 'Já me dei esse presente'}
                variant={reward.status === 'redeemed' ? 'ghost' : 'primary'}
                loading={busy === reward.id}
                onPress={async () => { setBusy(reward.id); try { await toggleReward(reward.id); await onReload(); } catch { Alert.alert('Não foi possível salvar.'); } finally { setBusy(null); } }}
              />
            )}
          </View>
        </AppCard>
      ))}
    </View>
  );
}

function MeetingActions({ meeting, callLink }: { meeting: Meeting; callLink: string }) {
  const link = meeting.joinUrl || callLink;
  return (
    <View style={styles.actions}>
      {!!link && <AppButton label="Entrar" onPress={() => open(link)} />}
      <AppButton label="Adicionar ao calendário" variant="secondary" onPress={() => open(googleCalendarUrl(meeting, callLink))} />
      <AppButton label="Convite" variant="ghost" onPress={() => void shareMeetingInvite(meeting, callLink).catch((error: unknown) => Alert.alert('Não foi possível gerar o convite', error instanceof Error ? error.message : 'Use Adicionar ao calendário.'))} />
    </View>
  );
}

function MeetingsTab({ data }: { data: CommunityData }) {
  const theme = useAppTheme();
  const callLink = data.call?.link ?? '';
  const [first, ...rest] = data.upcoming;
  return (
    <View style={styles.list}>
      {data.call ? (
        <View style={[styles.hero, { backgroundColor: theme.colors.brandSurface }]}>
          <View style={[styles.pill, { backgroundColor: 'rgba(255,255,255,0.14)' }]}><AppText variant="caption" color={theme.colors.brandText} weight="700">{data.call.title}</AppText></View>
          <AppText variant="title" color={theme.colors.brandText} weight="600">Entre na call do grupo</AppText>
          {!!data.call.info && <AppText variant="caption" color={theme.colors.brandText}>{data.call.info}</AppText>}
          <AppButton label="Entrar na call" onPress={() => open(data.call?.link ?? '')} style={{ backgroundColor: theme.colors.accent, borderColor: theme.colors.accent }} />
        </View>
      ) : <AppCard style={styles.card}><AppText variant="caption" color={theme.colors.textMuted}>A equipe ainda não colocou o link da call. Assim que publicar, ele aparece aqui e no Início.</AppText></AppCard>}

      <AppText variant="title" weight="600" style={styles.mx}>Próximos encontros</AppText>
      {first ? (
        <AppCard style={[styles.card, { borderColor: theme.colors.accent }]}>
          <View style={styles.between}>
            <AppText variant="caption" weight="700" color={theme.colors.textMuted}>{daysUntil(first.date) === 0 ? 'Encontro hoje' : first.type === 'specialist' ? 'Encontro com especialista' : 'Encontro da semana'}</AppText>
            <View style={[styles.tag, { backgroundColor: theme.colors.surfaceElevated }]}><AppText style={styles.tagText} weight="700">{relative(first.date)}</AppText></View>
          </View>
          <AppText variant="subtitle" weight="700">{first.topic}</AppText>
          <AppText variant="caption">{WEEKDAYS[parseDate(first.date).getDay()]}, {parseDate(first.date).getDate()} de {MONTHS[parseDate(first.date).getMonth()]} · <AppText variant="caption" weight="700">{first.time}</AppText>{first.responsible ? ` · com ${first.responsible}` : ''}</AppText>
          {!first.joinUrl && !callLink && <AppText variant="caption" color={theme.colors.textMuted}>O link aparece aqui antes do horário.</AppText>}
          <MeetingActions meeting={first} callLink={callLink} />
        </AppCard>
      ) : <AppCard style={styles.card}><AppText variant="caption" color={theme.colors.textMuted}>A equipe ainda não publicou os próximos encontros.</AppText></AppCard>}
      {rest.map((meeting) => (
        <AppCard key={meeting.id} style={[styles.card, styles.meeting]}>
          <DateBox date={meeting.date} highlight={meeting.type === 'specialist'} />
          <View style={styles.flexGap}>
            <AppText weight="700">{meeting.topic}</AppText>
            <AppText variant="caption" color={theme.colors.textMuted}>{WEEKDAYS[parseDate(meeting.date).getDay()]} · {meeting.time}{meeting.responsible ? ` · com ${meeting.responsible}` : ''} · {relative(meeting.date)}</AppText>
            <MeetingActions meeting={meeting} callLink={callLink} />
          </View>
        </AppCard>
      ))}

      {!!data.events.length && (
        <AppCard style={styles.card}>
          <AppText weight="700">Outras datas</AppText>
          {data.events.map((event) => (
            <View key={event.id} style={[styles.meeting, styles.eventRow, { borderTopColor: theme.colors.border }]}>
              <DateBox date={event.date} />
              <View style={styles.flex}><AppText variant="caption" weight="700">{event.title}</AppText><AppText variant="caption" color={theme.colors.textMuted}>{WEEKDAYS[parseDate(event.date).getDay()]}{event.time ? ` · ${event.time}` : ''}{event.place ? ` · ${event.place}` : ''}</AppText></View>
            </View>
          ))}
        </AppCard>
      )}

      {!!data.past.length && <AppText variant="title" weight="600" style={styles.mx}>Encontros anteriores</AppText>}
      {data.past.slice(0, 6).map((meeting) => (
        <AppCard key={meeting.id} style={[styles.card, styles.meeting, { opacity: 0.92 }]}>
          <DateBox date={meeting.date} />
          <View style={styles.flexGap}>
            <AppText weight="700">{meeting.topic}</AppText>
            {isLink(meeting.recordingUrl) ? <AppButton label="Ver gravação" variant="secondary" onPress={() => open(meeting.recordingUrl)} /> : <AppText variant="caption" color={theme.colors.textMuted}>Gravação ainda não disponível</AppText>}
            {!!meeting.materials && (isLink(meeting.materials)
              ? <Pressable onPress={() => open(meeting.materials)}><AppText variant="caption" weight="700" color={theme.colors.primary}>Abrir materiais</AppText></Pressable>
              : <AppText variant="caption">Materiais: {meeting.materials}</AppText>)}
          </View>
        </AppCard>
      ))}
    </View>
  );
}

function LessonView({ module, lesson, onClose, onToggle }: { module: CourseModule; lesson: Lesson; onClose: () => void; onToggle: () => Promise<void> }) {
  const theme = useAppTheme();
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => { onClose(); return true; });
    return () => subscription.remove();
  }, [onClose]);
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.background }]} edges={['top', 'left', 'right']}>
      <StatusBar style={theme.isDark ? 'light' : 'dark'} />
      <ScrollView automaticallyAdjustKeyboardInsets contentContainerStyle={styles.sheet}>
        <View style={styles.sheetTop}>
          <Pressable accessibilityRole="button" accessibilityLabel="Voltar" onPress={onClose} style={[styles.backButton, { backgroundColor: theme.colors.surfaceElevated }]}><AppText variant="subtitle" weight="700">‹</AppText></Pressable>
          <View style={styles.flex}><AppText variant="caption" color={theme.colors.textMuted} weight="700">{module.title}</AppText><AppText variant="subtitle" weight="700">{lesson.title}</AppText></View>
        </View>
        <View style={[styles.video, { backgroundColor: '#160b0e' }]}>
          <VemIcon name="play" size={36} color="#e9d8d2" />
          <AppText variant="caption" color="#e9d8d2" style={styles.centerText}>{lesson.videoUrl ? 'A videoaula abre no aplicativo de vídeo do celular.' : 'Videoaula em produção. Assim que a equipe publicar, ela aparece aqui.'}</AppText>
          {!!lesson.videoUrl && <AppButton label="Assistir aula" onPress={() => open(lesson.videoUrl)} style={{ backgroundColor: theme.colors.accent, borderColor: theme.colors.accent }} />}
        </View>
        {!!lesson.duration && <AppText variant="caption" color={theme.colors.textMuted}>Duração: {lesson.duration}</AppText>}
        {!!lesson.pdfUrl && <AppButton label={`Abrir material${lesson.pdfName ? `: ${lesson.pdfName}` : ''}`} variant="secondary" onPress={() => open(lesson.pdfUrl)} />}
        {!!lesson.activity && (
          <View style={[styles.tip, { backgroundColor: theme.colors.surfaceElevated }]}>
            <AppText variant="caption" weight="700" color={theme.colors.textMuted}>Atividade prática</AppText>
            <AppText>{lesson.activity}</AppText>
          </View>
        )}
        <AppButton
          label={lesson.completedAt ? 'Aula concluída · desmarcar' : 'Marcar aula como concluída'}
          variant={lesson.completedAt ? 'secondary' : 'primary'}
          loading={busy}
          onPress={async () => { setBusy(true); try { await onToggle(); } finally { setBusy(false); } }}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

function CourseTab({ data, onOpenLesson }: { data: CommunityData; onOpenLesson: (module: CourseModule, lesson: Lesson) => void }) {
  const theme = useAppTheme();
  const [openModule, setOpenModule] = useState<string | null>(null);
  const { course } = data;
  return (
    <View style={styles.list}>
      <AppCard style={styles.card}>
        <AppText variant="caption" color={theme.colors.textMuted} weight="700">Curso</AppText>
        <AppText variant="title" weight="600">{course.title}</AppText>
        {!!course.subtitle && <AppText variant="caption">{course.subtitle}</AppText>}
        {course.total > 0 && (
          <>
            <View style={[styles.track, { backgroundColor: theme.colors.border }]}><View style={[styles.fill, { width: `${(course.completed / course.total) * 100}%`, backgroundColor: theme.colors.primary }]} /></View>
            <AppText variant="caption" color={theme.colors.textMuted}>{course.completed} de {course.total} aulas concluídas</AppText>
          </>
        )}
      </AppCard>
      {course.modules.map((module) => {
        const done = module.lessons.filter((lesson) => lesson.completedAt).length;
        const expanded = openModule === module.id;
        return (
          <AppCard key={module.id} style={styles.card}>
            <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setOpenModule(expanded ? null : module.id)} style={styles.between}>
              <View style={styles.flexGap}>
                <View style={styles.row}><AppText weight="700" style={styles.flexShrink}>{module.title}</AppText>{module.example && <ExampleTag />}</View>
                {!!module.description && <AppText variant="caption" color={theme.colors.textMuted}>{module.description}</AppText>}
              </View>
              <View style={[styles.tag, { backgroundColor: done === module.lessons.length && done ? theme.colors.success : theme.colors.surfaceElevated }]}>
                <AppText style={styles.tagText} weight="700" color={done === module.lessons.length && done ? '#fff' : theme.colors.text}>{done}/{module.lessons.length}</AppText>
              </View>
            </Pressable>
            {expanded && module.lessons.map((lesson) => (
              <Pressable key={lesson.id} accessibilityRole="button" onPress={() => onOpenLesson(module, lesson)} style={[styles.lesson, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceElevated }]}>
                <View style={[styles.lessonIcon, { borderColor: lesson.completedAt ? theme.colors.success : theme.colors.border, backgroundColor: lesson.completedAt ? theme.colors.success : 'transparent' }]}>
                  {lesson.completedAt ? <VemIcon name="check" size={14} color="#fff" /> : <VemIcon name="play" size={12} color={theme.colors.textMuted} />}
                </View>
                <View style={styles.flex}><AppText variant="caption" weight="700">{lesson.title}</AppText>{!!lesson.duration && <AppText variant="caption" color={theme.colors.textMuted}>{lesson.duration}</AppText>}</View>
                <VemIcon name="chevronRight" size={16} color={theme.colors.textMuted} />
              </Pressable>
            ))}
          </AppCard>
        );
      })}
      {!course.modules.length && <AppCard style={styles.card}><AppText variant="caption" color={theme.colors.textMuted}>A equipe ainda não publicou as aulas do curso.</AppText></AppCard>}

      <AppText variant="title" weight="600" style={styles.mx}>Materiais</AppText>
      {data.materials.length ? data.materials.map((material) => (
        <AppCard key={material.id} style={styles.card}>
          <View style={styles.row}>
            <AppText weight="700" style={styles.flexShrink}>{material.title}</AppText>
            {material.example && <ExampleTag />}
          </View>
          {material.source === 'encontro' && <AppText variant="caption" color={theme.colors.textMuted}>Material do encontro</AppText>}
          {!!material.text && <AppText variant="caption">{material.text}</AppText>}
          {!!material.url && <AppButton label={`Abrir material${material.urlName ? `: ${material.urlName}` : ''}`} variant="secondary" onPress={() => open(material.url)} />}
        </AppCard>
      )) : <AppCard style={styles.card}><AppText variant="caption" color={theme.colors.textMuted}>Os materiais publicados pela equipe aparecem aqui.</AppText></AppCard>}
    </View>
  );
}

export function VemScreen() {
  const theme = useAppTheme();
  const [tab, setTab] = useState<Tab>('premios');
  const [rewards, setRewards] = useState<VemData | null>(null);
  const [community, setCommunity] = useState<CommunityData | null>(null);
  const [lesson, setLesson] = useState<{ moduleId: string; lessonId: string } | null>(null);
  const load = useCallback(async (): Promise<void> => {
    try {
      const [vem, data] = await Promise.all([loadVem(), loadCommunity()]);
      setRewards(vem);
      setCommunity(data);
    } catch (error) {
      Alert.alert('Não foi possível carregar a VEM', error instanceof Error ? error.message : 'Confira sua conexão.');
    }
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  const closeLesson = useCallback(() => setLesson(null), []);

  const openModule = community?.course.modules.find((module) => module.id === lesson?.moduleId);
  const openLesson = openModule?.lessons.find((item) => item.id === lesson?.lessonId);
  if (openModule && openLesson) {
    return (
      <LessonView
        module={openModule}
        lesson={openLesson}
        onClose={closeLesson}
        onToggle={async () => {
          try { await setLessonCompleted(openModule.id, openLesson.id, !openLesson.completedAt); await load(); }
          catch (error) { Alert.alert('Não foi possível salvar', error instanceof Error ? error.message : 'Tente novamente.'); }
        }}
      />
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.background }]} edges={['top', 'left', 'right']}>
      <StatusBar style="light" />
      <ScrollView automaticallyAdjustKeyboardInsets contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.header, { backgroundColor: theme.colors.brandSurface }]}>
          <AppText color={theme.colors.brandText}>VEM · Vida em Movimento</AppText>
          <AppText variant="title" color={theme.colors.brandText} weight="600">VEM</AppText>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.tabs, { borderBottomColor: theme.colors.border }]} accessibilityRole="tablist">
          {TABS.map(([key, label]) => (
            <Pressable key={key} accessibilityRole="tab" accessibilityState={{ selected: tab === key }} onPress={() => setTab(key)} style={[styles.tab, tab === key && { borderBottomColor: theme.colors.text }]}>
              <AppText weight="600" color={tab === key ? theme.colors.text : theme.colors.textMuted}>{label}</AppText>
            </Pressable>
          ))}
        </ScrollView>
        {tab === 'premios' && <RewardsTab data={rewards} onReload={load} />}
        {tab !== 'premios' && !community && <AppText color={theme.colors.textMuted} style={styles.mx}>Carregando…</AppText>}
        {tab === 'encontros' && community && <MeetingsTab data={community} />}
        {tab === 'curso' && community && <CourseTab data={community} onOpenLesson={(module, item) => setLesson({ moduleId: module.id, lessonId: item.id })} />}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { gap: 12, paddingBottom: 40 },
  header: { padding: 16, gap: 10, borderBottomLeftRadius: 22, borderBottomRightRadius: 22 },
  tabs: { gap: 20, paddingHorizontal: 16, borderBottomWidth: 1 },
  tab: { paddingVertical: 10, minHeight: 44, justifyContent: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent', marginBottom: -1 },
  list: { gap: 12 },
  mx: { marginHorizontal: 16 },
  card: { marginHorizontal: 16, gap: 8 },
  flex: { flex: 1 },
  flexShrink: { flexShrink: 1 },
  flexGap: { flex: 1, gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  baseline: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  track: { height: 6, borderRadius: 6, overflow: 'hidden' },
  fill: { height: '100%' },
  reward: { flexDirection: 'row', gap: 12 },
  rewardIcon: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  hero: { marginHorizontal: 16, borderRadius: 16, padding: 18, gap: 10 },
  pill: { alignSelf: 'flex-start', borderRadius: 4, paddingHorizontal: 8, paddingVertical: 2 },
  tag: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 1 },
  tagText: { fontSize: 11 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  meeting: { flexDirection: 'row', gap: 12 },
  eventRow: { borderTopWidth: 1, paddingTop: 8, alignItems: 'center' },
  dateBox: { width: 52, borderRadius: 8, alignItems: 'center', paddingVertical: 6, alignSelf: 'flex-start' },
  lesson: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 12, padding: 10 },
  lessonIcon: { width: 30, height: 30, borderRadius: 15, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  sheet: { padding: 16, gap: 12, paddingBottom: 40 },
  sheetTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  backButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  video: { borderRadius: 16, aspectRatio: 16 / 9, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 16 },
  centerText: { textAlign: 'center' },
  tip: { borderRadius: 12, padding: 12, gap: 4 },
});
