import { useCallback, useState, type ReactNode } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { AppButton, AppCard, AppText, FormScrollView, LineChart, VemIcon } from '../components';
import {
  LIFE_AREAS,
  MILESTONE_TYPES,
  averageScore,
  dateKey,
  deleteMeasurement,
  deleteMilestone,
  evaluationMessage,
  loadEvolution,
  parseDate,
  saveEvaluation,
  saveMeasurement,
  saveMilestone,
  type AreaScores,
  type EvolutionData,
  type Measurement,
  type MilestoneType,
} from '../services/evolution';
import { serifFont, useAppTheme } from '../theme';
import { syncNotifications } from '../services/notifications';

type Tab = 'mapa' | 'cargas' | 'medidas' | 'habitos' | 'marcos';
const TABS: Array<[Tab, string]> = [['mapa', 'Mapa da evolução'], ['cargas', 'Cargas'], ['medidas', 'Peso e medidas'], ['habitos', 'Hábitos'], ['marcos', 'Marcos']];
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MONTHS_LONG = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const WEEKDAY_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MOODS: Record<number, string> = { 1: 'Pesado', 2: 'Baixo', 3: 'Ok', 4: 'Bem', 5: 'Ótimo' };

const shortDate = (key: string): string => { const date = parseDate(key); return `${date.getDate()} ${MONTHS[date.getMonth()]}`; };
const monthName = (month: string): string => { const [y, m] = month.split('-').map(Number); return `${MONTHS_LONG[(m ?? 1) - 1]} de ${y}`; };
const monthShort = (month: string): string => { const [y, m] = month.split('-').map(Number); return `${MONTHS[(m ?? 1) - 1]}/${String(y).slice(2)}`; };
const decimal = (value: number): string => String(Math.round(value * 10) / 10).replace('.', ',');
const toBrDate = (key: string): string => { const [y, m, d] = key.split('-'); return `${d}/${m}/${y}`; };
function fromBrDate(value: string): string | null {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value.trim());
  if (!match) return null;
  const date = new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
  return date.getDate() === Number(match[1]) ? dateKey(date) : null;
}
const parseNumber = (value: string): number | undefined => { const parsed = Number(value.replace(',', '.')); return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined; };

function Section({ title, badge, children }: { title: string; badge?: string; children: ReactNode }) {
  const theme = useAppTheme();
  return (
    <AppCard style={styles.card}>
      <View style={styles.between}>
        <AppText variant="subtitle" weight="700" style={styles.flex}>{title}</AppText>
        {!!badge && <View style={[styles.badge, { backgroundColor: theme.colors.surfaceElevated }]}><AppText variant="caption" weight="700">{badge}</AppText></View>}
      </View>
      {children}
    </AppCard>
  );
}

function Chips<T extends string>({ options, value, onChange }: { options: ReadonlyArray<readonly [T, string]>; value: T; onChange: (value: T) => void }) {
  const theme = useAppTheme();
  return (
    <View style={styles.chips}>
      {options.map(([key, label]) => {
        const selected = key === value;
        return (
          <Pressable key={key} accessibilityRole="radio" accessibilityState={{ checked: selected }} onPress={() => onChange(key)} style={[styles.chip, { borderColor: selected ? theme.colors.text : theme.colors.border, backgroundColor: selected ? theme.colors.text : 'transparent' }]}>
            <AppText variant="caption" weight="600" color={selected ? theme.colors.background : theme.colors.text}>{label}</AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

function Diff({ from, to }: { from?: number | null; to?: number | null }) {
  const theme = useAppTheme();
  if (from == null || to == null) return <AppText variant="caption" color={theme.colors.textMuted}>–</AppText>;
  const diff = Math.round((to - from) * 10) / 10;
  return (
    <View style={[styles.badge, { backgroundColor: diff > 0 ? `${theme.colors.success}22` : diff < 0 ? `${theme.colors.secondary}30` : theme.colors.surfaceElevated }]}>
      <AppText variant="caption" weight="700" color={diff > 0 ? theme.colors.success : theme.colors.text}>{diff > 0 ? '+' : ''}{decimal(diff)}</AppText>
    </View>
  );
}

function ScoreSlider({ label, value, onChange }: { label: string; value?: number; onChange: (value: number) => void }) {
  const theme = useAppTheme();
  const [width, setWidth] = useState(0);
  const position = value ?? 0;
  const updateFromPosition = (x: number): void => {
    if (width <= 0) return;
    onChange(Math.max(0, Math.min(10, Math.round((x / width) * 10))));
  };
  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 10, now: value, text: value === undefined ? 'Não respondido' : `${value} de 10` }}
      accessibilityActions={[{ name: 'increment', label: 'Aumentar nota' }, { name: 'decrement', label: 'Diminuir nota' }]}
      onAccessibilityAction={(event) => onChange(Math.max(0, Math.min(10, (value ?? 5) + (event.nativeEvent.actionName === 'increment' ? 1 : -1))))}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={(event) => updateFromPosition(event.nativeEvent.locationX)}
      onResponderMove={(event) => updateFromPosition(event.nativeEvent.locationX)}
      style={styles.sliderTouch}
    >
      <View style={[styles.sliderTrack, { backgroundColor: theme.colors.surfaceElevated }]}>
        <View style={[styles.sliderFill, { width: `${position * 10}%`, backgroundColor: theme.colors.primary }]} />
        <View style={[styles.sliderThumb, { left: `${position * 10}%`, backgroundColor: theme.colors.primary, borderColor: theme.colors.surface }]} />
      </View>
      <View style={styles.sliderLabels}>
        <AppText variant="caption" color={theme.colors.textMuted}>0</AppText>
        <AppText variant="caption" color={theme.colors.textMuted}>5</AppText>
        <AppText variant="caption" color={theme.colors.textMuted}>10</AppText>
      </View>
    </View>
  );
}

function JourneyTab({ data, onRegisterVictory, onReload }: { data: EvolutionData; onRegisterVictory: () => void; onReload: () => Promise<void> }) {
  const theme = useAppTheme();
  const next = data.upcoming[0];
  const title = data.activities === 0 ? 'Sua jornada começa no primeiro treino' : data.journeyDays < 7 ? 'Você deu a largada' : data.achievements.length >= 6 ? 'Olha o tanto que você já andou' : 'Você está avançando';
  return (
    <View style={styles.tabContent}>
      <View style={[styles.hero, { backgroundColor: theme.colors.brandSurface }]}>
        <AppText variant="caption" color={theme.colors.brandText}>Mapa da evolução</AppText>
        <AppText variant="title" color={theme.colors.brandText} weight="600">{title}</AppText>
        <View style={styles.heroStats}>
          {[[data.activities, 'treinos'], [data.journeyDays, 'dias de jornada'], [data.achievements.length, 'conquistas']].map(([value, label]) => (
            <AppText key={String(label)} variant="caption" color={theme.colors.brandText}><AppText variant="subtitle" weight="700" color={theme.colors.accent}>{value}</AppText> {label}</AppText>
          ))}
        </View>
        {next && (
          <>
            <AppText variant="caption" color={theme.colors.brandText}>Próximo marco: <AppText variant="caption" weight="700" color={theme.colors.brandText}>{next.title}</AppText> · {next.remaining}</AppText>
            <View style={styles.heroTrack}><View style={[styles.fill, { width: `${Math.round(Math.max(0, next.progress) * 100)}%`, backgroundColor: theme.colors.accent }]} /></View>
          </>
        )}
      </View>

      <View style={styles.timeline} accessibilityLabel="Linha do tempo da sua jornada">
        <TimelineItem icon="flag" title="Início da jornada" subtitle={data.startDate ? `${shortDate(data.startDate)} de ${data.startDate.slice(0, 4)}` : 'quando você fizer o primeiro treino'} />
        {data.achievements.map((step, index) => (
          <TimelineItem key={`${step.title}-${index}`} icon={step.victory ? 'star' : 'check'} title={step.title} subtitle={`${shortDate(step.date)}${step.victory ? ' · vitória' : ''}`} gold={step.victory} />
        ))}
        <TimelineItem
          icon="now"
          title={`${data.activities} ${data.activities === 1 ? 'treino' : 'treinos'}${data.journeyDays ? ` em ${data.journeyDays} ${data.journeyDays === 1 ? 'dia' : 'dias'}` : ''}`}
          subtitle={`${data.streak > 1 ? `${data.streak} dias seguidos treinando · ` : ''}${data.weekCount} de ${data.weeklyGoal} treinos nesta semana`}
          eyebrow="Você está aqui"
        />
        {data.upcoming.map((step) => <TimelineItem key={step.title} icon="next" title={step.title} subtitle={step.remaining} />)}
      </View>
      <AppButton label="+ Registrar uma vitória" variant="secondary" style={styles.mx} onPress={onRegisterVictory} />
      <MonthlyEvaluation data={data} onReload={onReload} />
    </View>
  );
}

function TimelineItem({ icon, title, subtitle, eyebrow, gold }: { icon: 'flag' | 'check' | 'star' | 'now' | 'next'; title: string; subtitle: string; eyebrow?: string; gold?: boolean }) {
  const theme = useAppTheme();
  const now = icon === 'now'; const next = icon === 'next';
  const background = now || next ? theme.colors.surface : gold ? theme.colors.accent : theme.colors.primary;
  return (
    <View style={[styles.timelineRow, next && { opacity: 0.8 }]}>
      <View style={[styles.node, { backgroundColor: background, borderColor: now ? theme.colors.accent : next ? theme.colors.border : background, borderWidth: now ? 3 : 2, borderStyle: next ? 'dashed' : 'solid' }]}>
        {icon === 'flag' && <AppText color="#fff" weight="800">⚑</AppText>}
        {icon === 'check' && <VemIcon name="check" size={18} color="#fff" />}
        {icon === 'star' && <VemIcon name="star" size={18} color="#2E1A20" />}
      </View>
      <View style={[styles.flex, now && [styles.nowBox, { borderColor: theme.colors.accent, backgroundColor: theme.colors.surface }]]}>
        {!!eyebrow && <AppText variant="caption" color={theme.colors.textMuted} weight="700">{eyebrow}</AppText>}
        <AppText weight="700">{title}</AppText>
        <AppText variant="caption" color={theme.colors.textMuted}>{subtitle}</AppText>
      </View>
    </View>
  );
}

function MonthlyEvaluation({ data, onReload }: { data: EvolutionData; onReload: () => Promise<void> }) {
  const theme = useAppTheme();
  const currentMonth = dateKey().slice(0, 7);
  const [scores, setScores] = useState<AreaScores>({});
  const [saving, setSaving] = useState(false);
  const savedMonths = data.evaluations.map((item) => item.month);
  const previous = data.evaluations.at(-1);
  const [compareFrom, setCompareFrom] = useState<string | null>(null);
  const [compareTo, setCompareTo] = useState<string | null>(null);
  const from = compareFrom && savedMonths.includes(compareFrom) ? compareFrom : savedMonths.at(-2);
  const to = compareTo && savedMonths.includes(compareTo) ? compareTo : savedMonths.at(-1);
  const fromScores = data.evaluations.find((item) => item.month === from)?.scores;
  const toScores = data.evaluations.find((item) => item.month === to)?.scores;
  const averages = data.evaluations.map((item) => averageScore(item.scores) ?? 0);

  const setScore = (area: (typeof LIFE_AREAS)[number], value: number): void => setScores((current) => ({ ...current, [area]: value }));
  const save = async (): Promise<void> => {
    setSaving(true);
    try { await saveEvaluation(scores); setScores({}); await onReload(); void syncNotifications().catch(() => undefined); }
    catch (error) { Alert.alert('Avaliação não salva', error instanceof Error ? error.message : 'Confira sua conexão.'); }
    finally { setSaving(false); }
  };
  const complete = LIFE_AREAS.every((area) => scores[area] !== undefined);
  const nextDate = new Date(data.evaluationStatus.nextEvaluationAt).toLocaleDateString('pt-BR');

  return (
    <>
      <Section title="Avaliação do mês" badge={data.evaluationStatus.available ? 'disponível' : `libera em ${nextDate}`}>
        {!data.evaluationStatus.available ? (
          <>
            <AppText weight="700">Sua próxima avaliação será liberada em {nextDate}.</AppText>
            <AppText variant="caption" color={theme.colors.textMuted}>A avaliação é liberada um mês após sua entrada no VEM e, depois disso, um mês após cada resposta. As avaliações salvas ficam no seu histórico e não podem ser alteradas ou apagadas.</AppText>
          </>
        ) : (
          <>
            <AppText variant="caption" color={theme.colors.textMuted}>Dê uma nota de 0 a 10 pra cada área da sua vida. Depois de salvar, esta avaliação entrará no seu histórico e a próxima será liberada daqui a um mês.</AppText>
            {LIFE_AREAS.map((area) => (
              <View key={area} style={styles.areaRow}>
                <View style={styles.between}><AppText variant="caption" weight="700">{area}</AppText><AppText variant="caption" weight="700" color={theme.colors.primary}>{scores[area] ?? '–'}</AppText></View>
                <ScoreSlider label={area} value={scores[area]} onChange={(value) => setScore(area, value)} />
              </View>
            ))}
            <AppText style={styles.quote} color={theme.colors.primary}>{evaluationMessage(scores, previous?.scores)}</AppText>
            <AppButton label={`Salvar avaliação de ${monthName(currentMonth)}`} loading={saving} disabled={!complete} onPress={() => void save()} />
          </>
        )}
      </Section>

      {data.evaluations.length >= 2 && from && to && fromScores && toScores ? (
        <Section title="Comparar meses">
          <AppText variant="caption" color={theme.colors.textMuted}>De</AppText>
          <Chips options={savedMonths.map((item) => [item, monthShort(item)] as const)} value={from} onChange={setCompareFrom} />
          <AppText variant="caption" color={theme.colors.textMuted}>Para</AppText>
          <Chips options={savedMonths.map((item) => [item, monthShort(item)] as const)} value={to} onChange={setCompareTo} />
          <View style={[styles.tableRow, { borderBottomColor: theme.colors.border }]}>
            <AppText variant="caption" weight="700" color={theme.colors.textMuted} style={styles.flex}>Área</AppText>
            <AppText variant="caption" weight="700" color={theme.colors.textMuted} style={styles.cell}>{monthShort(from)}</AppText>
            <AppText variant="caption" weight="700" color={theme.colors.textMuted} style={styles.cell}>{monthShort(to)}</AppText>
            <View style={styles.cellWide}><AppText variant="caption" weight="700" color={theme.colors.textMuted}>Mudança</AppText></View>
          </View>
          {LIFE_AREAS.map((area) => (
            <View key={area} style={[styles.tableRow, { borderBottomColor: theme.colors.border }]}>
              <AppText variant="caption" style={styles.flex}>{area}</AppText>
              <AppText variant="caption" style={styles.cell}>{fromScores[area] ?? '–'}</AppText>
              <AppText variant="caption" style={styles.cell}>{toScores[area] ?? '–'}</AppText>
              <View style={styles.cellWide}><Diff from={fromScores[area]} to={toScores[area]} /></View>
            </View>
          ))}
          <View style={styles.tableRow}>
            <AppText variant="caption" weight="700" style={styles.flex}>Média</AppText>
            <AppText variant="caption" weight="700" style={styles.cell}>{decimal(averageScore(fromScores) ?? 0)}</AppText>
            <AppText variant="caption" weight="700" style={styles.cell}>{decimal(averageScore(toScores) ?? 0)}</AppText>
            <View style={styles.cellWide}><Diff from={averageScore(fromScores)} to={averageScore(toScores)} /></View>
          </View>
          <AppText style={styles.quote} color={theme.colors.primary}>{evaluationMessage(toScores, fromScores)}</AppText>
          <View style={styles.between}><AppText weight="700">Média mês a mês</AppText><AppText variant="caption" weight="700">{decimal(averages.at(-1) ?? 0)}</AppText></View>
          <LineChart values={averages} labels={[monthShort(data.evaluations[0]?.month ?? from), monthShort(data.evaluations.at(-1)?.month ?? to)]} accessibilityLabel="Média da avaliação por mês" />
        </Section>
      ) : (
        <AppText variant="caption" color={theme.colors.textMuted} style={styles.mx}>
          {data.evaluations.length === 1 ? `Avaliação de ${monthName(data.evaluations[0]?.month ?? currentMonth)} salva. Com mais um mês, a comparação aparece aqui.` : 'Com dois meses salvos, a comparação aparece aqui.'}
        </AppText>
      )}
    </>
  );
}

function LoadsTab({ data }: { data: EvolutionData }) {
  const theme = useAppTheme();
  const [showAll, setShowAll] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  if (!data.loads.length) return <View style={styles.tabContent}><AppCard style={[styles.mx, styles.empty]}><AppText color={theme.colors.textMuted}>Conforme você registra as séries no treino, as cargas aparecem aqui com gráfico e histórico.</AppText></AppCard></View>;
  const visible = showAll ? data.loads : data.loads.slice(0, 6);
  return (
    <View style={styles.tabContent}>
      {visible.map((exercise) => {
        const values = exercise.sessions.map((session) => session.max);
        const first = values[0] ?? 0; const last = values.at(-1) ?? 0; const diff = Math.round((last - first) * 10) / 10;
        const open = openId === exercise.exerciseId;
        return (
          <Section key={exercise.exerciseId} title={exercise.name} badge={diff > 0 ? `+${decimal(diff)} kg` : `${decimal(last)} kg`}>
            <AppText variant="caption" color={theme.colors.textMuted}>começou com {decimal(first)} kg → agora <AppText variant="caption" weight="700">{decimal(last)} kg</AppText> · {exercise.sessions.length} {exercise.sessions.length === 1 ? 'treino' : 'treinos'}</AppText>
            {values.length > 1 && <LineChart values={values} labels={[shortDate(exercise.sessions[0]?.date ?? dateKey()), shortDate(exercise.sessions.at(-1)?.date ?? dateKey())]} accessibilityLabel={`Carga máxima por treino em ${exercise.name}`} />}
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpenId(open ? null : exercise.exerciseId)}>
              <AppText variant="caption" weight="700" color={theme.colors.primary}>{open ? 'Esconder comparação' : 'Comparar treinos'}</AppText>
            </Pressable>
            {open && exercise.sessions.slice(-8).reverse().map((session, index) => (
              <View key={`${session.date}-${index}`} style={[styles.tableRow, { borderBottomColor: theme.colors.border }]}>
                <AppText variant="caption" style={styles.dateCell}>{shortDate(session.date)}</AppText>
                <AppText variant="caption" style={styles.flex}>{session.sets.map((set) => `${set.reps ?? '–'}×${decimal(set.load)}`).join(' · ')}</AppText>
                <AppText variant="caption" color={theme.colors.textMuted}>{Math.round(session.volume).toLocaleString('pt-BR')} kg</AppText>
              </View>
            ))}
          </Section>
        );
      })}
      {data.loads.length > 6 && <AppButton label={showAll ? 'Mostrar menos' : `Ver todos os ${data.loads.length} exercícios`} variant="secondary" style={styles.mx} onPress={() => setShowAll((value) => !value)} />}
    </View>
  );
}

function MeasurementsTab({ data, onReload }: { data: EvolutionData; onReload: () => Promise<void> }) {
  const theme = useAppTheme();
  const [form, setForm] = useState({ date: toBrDate(dateKey()), weight: '', waist: '', hip: '', arm: '' });
  const [saving, setSaving] = useState(false);
  const inputStyle = [styles.input, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surfaceElevated }];
  const save = async (): Promise<void> => {
    const date = fromBrDate(form.date);
    if (!date) { Alert.alert('Confira a data', 'Use o formato 06/11/2026.'); return; }
    setSaving(true);
    try {
      await saveMeasurement({ date, weight: parseNumber(form.weight), waist: parseNumber(form.waist), hip: parseNumber(form.hip), arm: parseNumber(form.arm) });
      setForm({ date: toBrDate(dateKey()), weight: '', waist: '', hip: '', arm: '' });
      await onReload();
    } catch (error) { Alert.alert('Registro não salvo', error instanceof Error ? error.message : 'Tente novamente.'); }
    finally { setSaving(false); }
  };
  const remove = (item: Measurement): void => Alert.alert(`Excluir o registro de ${shortDate(item.date)}?`, '', [
    { text: 'Voltar', style: 'cancel' },
    { text: 'Excluir', style: 'destructive', onPress: async () => { try { await deleteMeasurement(item.id); await onReload(); } catch { Alert.alert('Não consegui excluir.'); } } },
  ]);
  const chart = (field: 'weight' | 'waist' | 'hip' | 'arm', label: string, unit: string): ReactNode => {
    const series = data.measurements.filter((item) => item[field] != null);
    if (!series.length) return null;
    const values = series.map((item) => item[field] as number);
    const first = values[0] ?? 0; const last = values.at(-1) ?? 0;
    return (
      <Section key={field} title={label} badge={`${decimal(last)} ${unit}`}>
        {series.length > 1 ? (
          <>
            <AppText variant="caption" color={theme.colors.textMuted}>{shortDate(series[0]?.date ?? '')}: {decimal(first)} {unit} → {shortDate(series.at(-1)?.date ?? '')}: {decimal(last)} {unit} ({last - first > 0 ? '+' : ''}{decimal(last - first)})</AppText>
            <LineChart values={values} labels={[shortDate(series[0]?.date ?? ''), shortDate(series.at(-1)?.date ?? '')]} accessibilityLabel={`Evolução de ${label}`} />
          </>
        ) : <AppText variant="caption" color={theme.colors.textMuted}>Registre de novo daqui a alguns dias pra ver a linha.</AppText>}
      </Section>
    );
  };
  return (
    <View style={styles.tabContent}>
      <Section title="Novo registro">
        <View style={styles.grid}>
          {([['weight', 'Peso (kg)'], ['date', 'Data'], ['waist', 'Cintura (cm)'], ['hip', 'Quadril (cm)'], ['arm', 'Braço (cm)']] as const).map(([field, label]) => (
            <View key={field} style={styles.gridField}>
              <AppText variant="caption" color={theme.colors.textMuted}>{label}</AppText>
              <TextInput value={form[field]} onChangeText={(value) => setForm({ ...form, [field]: value })} keyboardType={field === 'date' ? 'numbers-and-punctuation' : 'decimal-pad'} placeholder={field === 'date' ? 'dd/mm/aaaa' : field === 'weight' ? 'opcional' : ''} placeholderTextColor={theme.colors.textMuted} style={inputStyle} />
            </View>
          ))}
        </View>
        <AppButton label="Salvar registro" loading={saving} onPress={() => void save()} />
        <AppText variant="caption" color={theme.colors.textMuted}>Tudo aqui é opcional e privado. Cargas e fotos também mostram a sua evolução.</AppText>
      </Section>
      {chart('weight', 'Peso', 'kg')}{chart('waist', 'Cintura', 'cm')}{chart('hip', 'Quadril', 'cm')}{chart('arm', 'Braço', 'cm')}
      {!!data.measurements.length && (
        <Section title="Registros">
          {[...data.measurements].reverse().map((item) => (
            <View key={item.id} style={[styles.tableRow, { borderBottomColor: theme.colors.border }]}>
              <AppText variant="caption" weight="700" style={styles.dateCell}>{shortDate(item.date)}</AppText>
              <AppText variant="caption" style={styles.flex}>
                {[item.weight != null ? `${decimal(item.weight)} kg` : '', item.waist != null ? `cint. ${decimal(item.waist)}` : '', item.hip != null ? `quadr. ${decimal(item.hip)}` : '', item.arm != null ? `braço ${decimal(item.arm)}` : ''].filter(Boolean).join(' · ')}
              </AppText>
              <Pressable accessibilityLabel={`Excluir registro de ${shortDate(item.date)}`} onPress={() => remove(item)} hitSlop={8}><AppText variant="caption" weight="700" color={theme.colors.danger}>excluir</AppText></Pressable>
            </View>
          ))}
        </Section>
      )}
    </View>
  );
}

function HabitsTab({ data }: { data: EvolutionData }) {
  const theme = useAppTheme();
  const maxWeek = Math.max(data.weeklyGoal, ...data.weeks.map((week) => week.count), 1);
  const goalWeeks = data.weeks.filter((week) => week.count >= data.weeklyGoal).length;
  const average = (values: number[]): string => decimal(values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length));
  const water = data.habits.map((day) => day.water); const meals = data.habits.map((day) => day.meals);
  const moodDays = data.habits.filter((day) => day.mood); const moods = moodDays.map((day) => day.mood as number);
  const labels: [string, string] = [shortDate(data.habits[0]?.date ?? dateKey()), shortDate(data.habits.at(-1)?.date ?? dateKey())];
  const last7 = data.habits.slice(-7);
  return (
    <View style={styles.tabContent}>
      <View style={[styles.tiles, styles.mx]}>
        {[[data.trainedLast30, 'dias com treino (30 dias)'], [`${Math.round((data.habitDaysLast30 / 30) * 100)}%`, 'dos dias com hábitos registrados'], [`${goalWeeks}/6`, 'semanas com a meta batida'], [data.bestStreak, 'maior sequência de dias']].map(([value, label]) => (
          <AppCard key={String(label)} style={styles.tile}><AppText variant="title" weight="700">{value}</AppText><AppText variant="caption" color={theme.colors.textMuted}>{label}</AppText></AppCard>
        ))}
      </View>
      <Section title="Treinos por semana" badge={`meta ${data.weeklyGoal}`}>
        <View style={styles.bars}>
          {data.weeks.map((week) => (
            <View key={week.start} style={styles.barCol}>
              <AppText variant="caption">{week.count}</AppText>
              <View style={[styles.bar, { height: Math.max(2, (week.count / maxWeek) * 80), backgroundColor: week.count >= data.weeklyGoal ? theme.colors.success : theme.colors.secondary }]} />
              <AppText style={styles.barLabel} color={theme.colors.textMuted}>{shortDate(week.start)}</AppText>
            </View>
          ))}
        </View>
      </Section>
      <Section title="Água · 14 dias" badge={`média ${average(water)} copos`}>
        {water.some(Boolean) ? <LineChart values={water} labels={labels} accessibilityLabel="Copos de água por dia" /> : <AppText variant="caption" color={theme.colors.textMuted}>Registre a água no Início.</AppText>}
      </Section>
      <Section title="Refeições · 14 dias" badge={`média ${average(meals)} de 5`}>
        {meals.some(Boolean) ? <LineChart values={meals} labels={labels} accessibilityLabel="Refeições registradas por dia" /> : <AppText variant="caption" color={theme.colors.textMuted}>Registre as refeições no Início ou na Dieta.</AppText>}
      </Section>
      <Section title="Humor" badge={moods.length ? MOODS[Math.round(moods.reduce((sum, value) => sum + value, 0) / moods.length)] : undefined}>
        {moods.length > 1 ? <LineChart values={moods} labels={[shortDate(moodDays[0]?.date ?? ''), shortDate(moodDays.at(-1)?.date ?? '')]} accessibilityLabel="Humor por dia, de 1 a 5" /> : <AppText variant="caption" color={theme.colors.textMuted}>Registre o humor em pelo menos dois dias pra ver a linha.</AppText>}
      </Section>
      <Section title="Últimos 7 dias">
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View>
            <View style={styles.weekRow}><AppText variant="caption" style={styles.weekHead}> </AppText>{last7.map((day) => <AppText key={day.date} variant="caption" weight="700" style={styles.weekCell}>{WEEKDAY_SHORT[parseDate(day.date).getDay()]}{'\n'}{parseDate(day.date).getDate()}</AppText>)}</View>
            {([['Treino', (day) => (day.trained ? '✓' : '–')], ['Refeições', (day) => `${day.meals}/5`], ['Água', (day) => String(day.water)], ['Humor', (day) => (day.mood ? MOODS[day.mood] ?? '–' : '–')]] as Array<[string, (day: EvolutionData['habits'][number]) => string]>).map(([label, value]) => (
              <View key={label} style={[styles.weekRow, { borderTopColor: theme.colors.border, borderTopWidth: 1 }]}>
                <AppText variant="caption" weight="700" style={styles.weekHead}>{label}</AppText>
                {last7.map((day) => <AppText key={day.date} variant="caption" style={styles.weekCell}>{value(day)}</AppText>)}
              </View>
            ))}
          </View>
        </ScrollView>
      </Section>
    </View>
  );
}

function MilestonesTab({ data, onReload }: { data: EvolutionData; onReload: () => Promise<void> }) {
  const theme = useAppTheme();
  const [title, setTitle] = useState('');
  const [type, setType] = useState<MilestoneType>('vitoria');
  const [date, setDate] = useState(toBrDate(dateKey()));
  const [saving, setSaving] = useState(false);
  const inputStyle = [styles.input, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surfaceElevated }];
  const typeLabel = (value: MilestoneType): string => MILESTONE_TYPES.find(([key]) => key === value)?.[1] ?? '';
  const auto = data.achievements.filter((item) => !item.victory).map((item) => ({ id: null as string | null, date: item.date, title: item.title, label: 'Marco da jornada' }));
  const all = [...auto, ...data.milestones.map((item) => ({ id: item.id as string | null, date: item.date, title: item.title, label: typeLabel(item.type) }))].sort((a, b) => (a.date < b.date ? 1 : -1));
  const save = async (): Promise<void> => {
    const key = fromBrDate(date);
    if (!key) { Alert.alert('Confira a data', 'Use o formato 06/11/2026.'); return; }
    setSaving(true);
    try { await saveMilestone(title, type, key); setTitle(''); setDate(toBrDate(dateKey())); await onReload(); }
    catch (error) { Alert.alert('Vitória não salva', error instanceof Error ? error.message : 'Tente novamente.'); }
    finally { setSaving(false); }
  };
  const remove = (id: string, label: string): void => Alert.alert(`Excluir “${label}”?`, '', [
    { text: 'Voltar', style: 'cancel' },
    { text: 'Excluir', style: 'destructive', onPress: async () => { try { await deleteMilestone(id); await onReload(); } catch { Alert.alert('Não consegui excluir.'); } } },
  ]);
  return (
    <View style={styles.tabContent}>
      <Section title="Registrar uma vitória">
        <AppText variant="caption" color={theme.colors.textMuted}>O que você conquistou</AppText>
        <TextInput value={title} onChangeText={setTitle} placeholder="ex: subi a escada do trabalho sem cansar" maxLength={180} placeholderTextColor={theme.colors.textMuted} style={inputStyle} />
        <Chips options={MILESTONE_TYPES} value={type} onChange={setType} />
        <AppText variant="caption" color={theme.colors.textMuted}>Data</AppText>
        <TextInput value={date} onChangeText={setDate} keyboardType="numbers-and-punctuation" placeholder="dd/mm/aaaa" placeholderTextColor={theme.colors.textMuted} style={inputStyle} />
        <AppButton label="Salvar vitória" loading={saving} disabled={!title.trim()} onPress={() => void save()} />
      </Section>
      {all.length ? all.map((item, index) => (
        <AppCard key={`${item.id ?? item.title}-${index}`} style={[styles.mx, styles.milestone]}>
          <View style={[styles.dateBox, { backgroundColor: theme.colors.surfaceElevated }]}><AppText variant="subtitle" weight="700">{parseDate(item.date).getDate()}</AppText><AppText variant="caption" color={theme.colors.textMuted}>{MONTHS[parseDate(item.date).getMonth()]}</AppText></View>
          <View style={styles.flex}><AppText weight="700">{item.title}</AppText><AppText variant="caption" color={theme.colors.textMuted}>{item.label}</AppText></View>
          {item.id ? <Pressable onPress={() => remove(item.id as string, item.title)} hitSlop={8}><AppText variant="caption" weight="700" color={theme.colors.danger}>excluir</AppText></Pressable> : <VemIcon name="star" size={18} color={theme.colors.accent} />}
        </AppCard>
      )) : <AppCard style={[styles.mx, styles.empty]}><AppText color={theme.colors.textMuted}>Seus marcos aparecem aqui: primeiro treino, primeira semana, primeiro mês e as vitórias que você registrar.</AppText></AppCard>}
    </View>
  );
}

export function EvolutionScreen() {
  const theme = useAppTheme();
  const [data, setData] = useState<EvolutionData | null>(null);
  const [tab, setTab] = useState<Tab>('mapa');
  const load = useCallback(async (): Promise<void> => {
    try { setData(await loadEvolution()); }
    catch (error) { Alert.alert('Não foi possível carregar a evolução', error instanceof Error ? error.message : 'Confira sua conexão.'); }
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  if (!data) return <SafeAreaView style={[styles.center, { backgroundColor: theme.colors.background }]}><AppText color={theme.colors.textMuted}>Carregando evolução…</AppText></SafeAreaView>;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.background }]} edges={['top', 'left', 'right']}>
      <StatusBar style="light" />
      <FormScrollView bottomOffset={32} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.header, { backgroundColor: theme.colors.brandSurface }]}>
          <AppText color={theme.colors.brandText}>VEM · Vida em Movimento</AppText>
          <AppText variant="title" color={theme.colors.brandText} weight="600">Evolução</AppText>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.tabs, { borderBottomColor: theme.colors.border }]} accessibilityRole="tablist">
          {TABS.map(([key, label]) => (
            <Pressable key={key} accessibilityRole="tab" accessibilityState={{ selected: tab === key }} onPress={() => setTab(key)} style={[styles.tab, tab === key && { borderBottomColor: theme.colors.text }]}>
              <AppText weight="600" color={tab === key ? theme.colors.text : theme.colors.textMuted}>{label}</AppText>
            </Pressable>
          ))}
        </ScrollView>
        {tab === 'mapa' && <JourneyTab data={data} onRegisterVictory={() => setTab('marcos')} onReload={load} />}
        {tab === 'cargas' && <LoadsTab data={data} />}
        {tab === 'medidas' && <MeasurementsTab data={data} onReload={load} />}
        {tab === 'habitos' && <HabitsTab data={data} />}
        {tab === 'marcos' && <MilestonesTab data={data} onReload={load} />}
      </FormScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { gap: 12, paddingBottom: 40 },
  header: { padding: 16, gap: 10, borderBottomLeftRadius: 22, borderBottomRightRadius: 22 },
  tabs: { gap: 20, paddingHorizontal: 16, borderBottomWidth: 1 },
  tab: { paddingVertical: 10, minHeight: 44, justifyContent: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent', marginBottom: -1 },
  tabContent: { gap: 12 },
  mx: { marginHorizontal: 16 },
  card: { marginHorizontal: 16, gap: 10 },
  flex: { flex: 1 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  badge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7, minHeight: 36, justifyContent: 'center' },
  hero: { marginHorizontal: 16, borderRadius: 16, padding: 18, gap: 10 },
  heroStats: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  heroTrack: { height: 8, borderRadius: 8, backgroundColor: 'rgba(255,255,255,.18)', overflow: 'hidden' },
  fill: { height: '100%' },
  timeline: { marginHorizontal: 16, gap: 4 },
  timelineRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 6 },
  node: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  nowBox: { borderWidth: 1, borderRadius: 14, padding: 12 },
  areaRow: { gap: 6 },
  sliderTouch: { minHeight: 50, justifyContent: 'center', paddingTop: 5 },
  sliderTrack: { height: 8, borderRadius: 999, marginHorizontal: 10 },
  sliderFill: { height: 8, borderRadius: 999 },
  sliderThumb: { position: 'absolute', top: -7, width: 22, height: 22, marginLeft: -11, borderRadius: 11, borderWidth: 3 },
  sliderLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 7 },
  quote: { fontStyle: 'italic', fontSize: 17, lineHeight: 24, fontFamily: serifFont },
  linkCenter: { alignSelf: 'center', padding: 8 },
  tableRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7, borderBottomWidth: 1 },
  cell: { width: 44, textAlign: 'center' },
  cellWide: { width: 66, alignItems: 'flex-end' },
  dateCell: { width: 52 },
  empty: { alignItems: 'center' },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 11, paddingVertical: 10, fontSize: 16, marginTop: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  gridField: { width: '47%', flexGrow: 1 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: { width: '48%', flexGrow: 1, gap: 2 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 124 },
  barCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
  bar: { width: '100%', maxWidth: 28, borderTopLeftRadius: 6, borderTopRightRadius: 6, borderBottomLeftRadius: 2, borderBottomRightRadius: 2 },
  barLabel: { fontSize: 10 },
  weekRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  weekHead: { width: 78 },
  weekCell: { width: 46, textAlign: 'center' },
  milestone: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dateBox: { width: 52, borderRadius: 10, alignItems: 'center', paddingVertical: 6 },
});
