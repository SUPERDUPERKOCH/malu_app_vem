import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Alert, BackHandler, Pressable, StyleSheet, Switch, TextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { AppButton, AppCard, AppText, FormScrollView, LineChart, VemIcon } from '../components';
import { ACTIVITY_TYPES, dateKey, registerExternalActivity } from '../services/activities';
import {
  EFFORT_OPTIONS,
  VEM_PLAN_ID,
  acceptChallenge,
  calculatePace,
  dropChallenge,
  formatKm,
  formatPace,
  formatRunTime,
  loadRunning,
  registerRun,
  togglePlanSession,
  weekReleased,
  type Challenge,
  type RunBlock,
  type RunningData,
  type RunningState,
} from '../services/running';
import { useAppTheme } from '../theme';

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const shortDate = (key: string): string => { const [, m, d] = key.split('-').map(Number); return `${d} ${MONTHS[(m ?? 1) - 1]}`; };
const toBrDate = (key: string): string => { const [y, m, d] = key.split('-'); return `${d}/${m}/${y}`; };
function fromBrDate(value: string): string | null {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value.trim());
  if (!match) return null;
  const date = new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
  return date.getDate() === Number(match[1]) ? dateKey(date) : null;
}
const parseNumber = (value: string): number => Number(value.replace(',', '.'));
function maskDistance(value: string): string {
  const normalized = value.replace('.', ',').replace(/[^\d,]/g, '');
  const [integer = '', ...decimals] = normalized.split(',');
  const whole = integer.replace(/^0+(?=\d)/, '').slice(0, 3);
  if (!normalized.includes(',')) return whole;
  return `${whole || '0'},${decimals.join('').slice(0, 2)}`;
}
const maskTimePart = (value: string): string => value.replace(/\D/g, '').slice(0, 2);

function useBack(onBack: () => void): void {
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => { onBack(); return true; });
    return () => subscription.remove();
  }, [onBack]);
}

function SheetHeader({ title, eyebrow, onClose }: { title: string; eyebrow?: string; onClose: () => void }) {
  const theme = useAppTheme();
  return (
    <View style={styles.sheetTop}>
      <Pressable accessibilityRole="button" accessibilityLabel="Voltar" onPress={onClose} style={[styles.backButton, { backgroundColor: theme.colors.surfaceElevated }]}><AppText variant="subtitle" weight="700">‹</AppText></Pressable>
      <View style={styles.flex}>
        {!!eyebrow && <AppText variant="caption" color={theme.colors.textMuted} weight="700">{eyebrow}</AppText>}
        <AppText variant="subtitle" weight="700">{title}</AppText>
      </View>
    </View>
  );
}

function Chips<T extends string | number>({ options, value, onChange }: { options: ReadonlyArray<readonly [T, string]>; value: T; onChange: (value: T) => void }) {
  const theme = useAppTheme();
  return (
    <View style={styles.chips}>
      {options.map(([key, label]) => {
        const selected = key === value;
        return (
          <Pressable key={String(key)} accessibilityRole="radio" accessibilityState={{ checked: selected }} onPress={() => onChange(key)} style={[styles.chip, { borderColor: selected ? theme.colors.text : theme.colors.border, backgroundColor: selected ? theme.colors.text : 'transparent' }]}>
            <AppText variant="caption" weight="600" color={selected ? theme.colors.background : theme.colors.text}>{label}</AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Folha "Registrar atividade" do esboço: treino fora do app, aula, caminhada, corrida sem distância etc. */
export function ExternalActivityEditor({ initialType, onClose, onSaved }: { initialType?: string; onClose: () => void; onSaved: (date: string) => Promise<void> }) {
  const theme = useAppTheme();
  const [type, setType] = useState(initialType ?? ACTIVITY_TYPES[0]?.[0] ?? 'Musculação');
  const [minutes, setMinutes] = useState('40');
  const [date, setDate] = useState(toBrDate(dateKey()));
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  useBack(onClose);
  const inputStyle = [styles.input, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface }];
  const save = async (): Promise<void> => {
    const key = fromBrDate(date);
    if (!key) { Alert.alert('Confira a data', 'Use o formato 06/11/2026.'); return; }
    setSaving(true);
    try { await registerExternalActivity({ type, minutes: parseNumber(minutes), date: key, notes }); await onSaved(key); }
    catch (error) { Alert.alert('Atividade não registrada', error instanceof Error ? error.message : 'Tente novamente.'); setSaving(false); }
  };
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.background }]} edges={['top', 'left', 'right']}>
      <StatusBar style={theme.isDark ? 'light' : 'dark'} />
      <FormScrollView bottomOffset={32} contentContainerStyle={styles.sheet}>
        <SheetHeader title="Registrar atividade" onClose={onClose} />
        <AppText variant="caption" color={theme.colors.textMuted}>Treinou fora do app, fez aula ou caminhou? Registre aqui. Conta pra sua meta e pros seus prêmios.</AppText>
        <AppText variant="caption" weight="600" color={theme.colors.textMuted}>O que você fez</AppText>
        <Chips options={ACTIVITY_TYPES.map(([name]) => [name, name] as const)} value={type} onChange={setType} />
        <View style={styles.row}>
          <View style={styles.flex}><AppText variant="caption" color={theme.colors.textMuted}>Duração (min)</AppText><TextInput value={minutes} onChangeText={setMinutes} keyboardType="number-pad" style={inputStyle} /></View>
          <View style={styles.flex}><AppText variant="caption" color={theme.colors.textMuted}>Data</AppText><TextInput value={date} onChangeText={setDate} keyboardType="numbers-and-punctuation" placeholder="dd/mm/aaaa" placeholderTextColor={theme.colors.textMuted} style={inputStyle} /></View>
        </View>
        <AppText variant="caption" color={theme.colors.textMuted}>Observação (opcional)</AppText>
        <TextInput value={notes} onChangeText={setNotes} placeholder="ex: aula de spinning" placeholderTextColor={theme.colors.textMuted} style={inputStyle} />
        <AppButton label="Registrar" loading={saving} onPress={() => void save()} />
      </FormScrollView>
    </SafeAreaView>
  );
}

function RunEditor({ state, onClose, onSaved }: { state: RunningState; onClose: () => void; onSaved: (completed: Challenge | null, run: { date: string; km: number; durationSeconds: number; pace: number }) => Promise<void> }) {
  const theme = useAppTheme();
  const [km, setKm] = useState('');
  const [hours, setHours] = useState('');
  const [minutes, setMinutes] = useState('');
  const [seconds, setSeconds] = useState('');
  const [effort, setEffort] = useState(5);
  const [pain, setPain] = useState(false);
  const [date, setDate] = useState(toBrDate(dateKey()));
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  useBack(onClose);
  const inputStyle = [styles.input, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface }];
  const distance = parseNumber(km);
  const hoursValue = Number(hours || 0);
  const minutesValue = Number(minutes || 0);
  const secondsValue = Number(seconds || 0);
  const validTime = minutesValue <= 59 && secondsValue <= 59;
  const durationSeconds = validTime ? hoursValue * 3600 + minutesValue * 60 + secondsValue : 0;
  const pace = calculatePace(durationSeconds, distance);
  const save = async (): Promise<void> => {
    const key = fromBrDate(date);
    if (!key) { Alert.alert('Confira a data', 'Use o formato 06/11/2026.'); return; }
    if (!validTime) { Alert.alert('Confira o tempo', 'Minutos e segundos precisam estar entre 00 e 59.'); return; }
    if (durationSeconds <= 0) { Alert.alert('Confira o tempo', 'Informe a duração da corrida.'); return; }
    setSaving(true);
    try { const completed = await registerRun({ km: distance, durationSeconds, effort, pain, date: key, notes }, state); await onSaved(completed, { date: key, km: distance, durationSeconds, pace: calculatePace(durationSeconds, distance) ?? 0 }); }
    catch (error) { Alert.alert('Corrida não registrada', error instanceof Error ? error.message : 'Tente novamente.'); setSaving(false); }
  };
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.background }]} edges={['top', 'left', 'right']}>
      <StatusBar style={theme.isDark ? 'light' : 'dark'} />
      <FormScrollView bottomOffset={32} contentContainerStyle={styles.sheet}>
        <SheetHeader title="Registrar corrida" onClose={onClose} />
        <AppText variant="caption" color={theme.colors.textMuted}>Distância (km)</AppText>
        <TextInput value={km} onChangeText={(value) => setKm(maskDistance(value))} keyboardType="decimal-pad" placeholder="0,00" placeholderTextColor={theme.colors.textMuted} maxLength={6} style={inputStyle} />
        <AppText variant="caption" color={theme.colors.textMuted}>Tempo da corrida</AppText>
        <View style={styles.timeRow}>
          <View style={styles.timeField}><TextInput value={hours} onChangeText={(value) => setHours(maskTimePart(value))} keyboardType="number-pad" placeholder="00" placeholderTextColor={theme.colors.textMuted} maxLength={2} style={[inputStyle, styles.timeInput]} /><AppText variant="caption" color={theme.colors.textMuted}>horas</AppText></View>
          <AppText variant="title" color={theme.colors.textMuted}>:</AppText>
          <View style={styles.timeField}><TextInput value={minutes} onChangeText={(value) => setMinutes(maskTimePart(value))} keyboardType="number-pad" placeholder="00" placeholderTextColor={theme.colors.textMuted} maxLength={2} style={[inputStyle, styles.timeInput]} /><AppText variant="caption" color={theme.colors.textMuted}>min</AppText></View>
          <AppText variant="title" color={theme.colors.textMuted}>:</AppText>
          <View style={styles.timeField}><TextInput value={seconds} onChangeText={(value) => setSeconds(maskTimePart(value))} keyboardType="number-pad" placeholder="00" placeholderTextColor={theme.colors.textMuted} maxLength={2} style={[inputStyle, styles.timeInput]} /><AppText variant="caption" color={theme.colors.textMuted}>seg</AppText></View>
        </View>
        <View style={[styles.pacePreview, { backgroundColor: theme.colors.surfaceElevated }]}><AppText variant="caption" color={theme.colors.textMuted}>PACE CALCULADO</AppText><AppText variant="title" weight="700" color={theme.colors.primary}>{formatPace(pace)}</AppText></View>
        <AppText variant="caption" weight="600" color={theme.colors.textMuted}>Como foi o esforço?</AppText>
        <Chips options={EFFORT_OPTIONS} value={effort} onChange={setEffort} />
        <View style={styles.between}><AppText style={styles.flex}>Senti dor ou incômodo</AppText><Switch value={pain} onValueChange={setPain} /></View>
        <AppText variant="caption" color={theme.colors.textMuted}>Data</AppText>
        <TextInput value={date} onChangeText={setDate} keyboardType="numbers-and-punctuation" placeholder="dd/mm/aaaa" placeholderTextColor={theme.colors.textMuted} style={inputStyle} />
        <AppText variant="caption" color={theme.colors.textMuted}>Observação (opcional)</AppText>
        <TextInput value={notes} onChangeText={setNotes} placeholder="ex: subida no fim, calor" placeholderTextColor={theme.colors.textMuted} style={inputStyle} />
        <AppButton label="Salvar corrida" loading={saving} onPress={() => void save()} />
      </FormScrollView>
    </SafeAreaView>
  );
}

function Blocks({ blocks }: { blocks: RunBlock[] }) {
  const theme = useAppTheme();
  return (
    <View style={styles.steps}>
      {blocks.map((block, index) => ('repeat' in block ? (
        <View key={index} style={styles.gap4}>
          <AppText variant="caption" weight="700">{index + 1}. Repetir {block.repeat}x</AppText>
          {block.steps.map((step, stepIndex) => <AppText key={stepIndex} variant="caption" style={styles.indent}>• <AppText variant="caption" weight="700">{step.action} {step.time}</AppText>{step.pace ? <AppText variant="caption" color={theme.colors.textMuted}> · {step.pace}</AppText> : null}</AppText>)}
        </View>
      ) : (
        <AppText key={index} variant="caption">{index + 1}. <AppText variant="caption" weight="700">{block.action} {block.time}</AppText>{block.pace ? <AppText variant="caption" color={theme.colors.textMuted}> · {block.pace}</AppText> : null}</AppText>
      )))}
    </View>
  );
}

/** Aba Corrida: planilha VEM, coach, histórico e planilhas publicadas pela equipe. */
export function RunningTab({ onShare, header }: { onShare: (run: { date: string; km: number; durationSeconds: number; pace: number }) => void; header: ReactNode }) {
  const theme = useAppTheme();
  const [data, setData] = useState<RunningData | null>(null);
  const [editor, setEditor] = useState<'run' | null>(null);
  const [busy, setBusy] = useState(false);
  const [readingOpen, setReadingOpen] = useState(false);
  const [openSession, setOpenSession] = useState<string | null>(null);
  const load = useCallback(async (): Promise<void> => {
    try { setData(await loadRunning()); }
    catch (error) { Alert.alert('Não foi possível carregar a corrida', error instanceof Error ? error.message : 'Confira sua conexão.'); }
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  const closeEditor = useCallback(() => setEditor(null), []);

  if (!data) return <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.background }]} edges={['top', 'left', 'right']}><FormScrollView contentContainerStyle={styles.screen}>{header}<AppText color={theme.colors.textMuted} style={styles.mx}>Carregando corrida…</AppText></FormScrollView></SafeAreaView>;
  if (editor === 'run') {
    return (
      <RunEditor state={data.state} onClose={closeEditor} onSaved={async (completed, registered) => {
        setEditor(null); await load();
        if (registered.date === dateKey()) Alert.alert(completed ? 'Desafio cumprido!' : 'Corrida registrada', `${completed ? `${completed.title}. ` : ''}Quer criar sua imagem com distância, tempo e pace?`, [{ text: 'Agora não', style: 'cancel' }, { text: 'Criar imagem', onPress: () => onShare(registered) }]);
        else if (completed) Alert.alert('Desafio cumprido!', `${completed.title}. Seu coach já preparou o próximo passo.`);
      }} />
    );
  }

  const run = async (action: () => Promise<void>): Promise<void> => {
    if (busy) return;
    setBusy(true);
    try { await action(); await load(); }
    catch (error) { Alert.alert('Não foi possível salvar', error instanceof Error ? error.message : 'Tente novamente.'); }
    finally { setBusy(false); }
  };

  const vemDone = data.progress[VEM_PLAN_ID] ?? {};
  const total = data.vemPlan.length;
  const doneCount = data.vemPlan.filter((session) => vemDone[session.id]).length;
  const current = data.vemPlan.find((session, index) => !vemDone[session.id] && (index === 0 || !!vemDone[data.vemPlan[index - 1]?.id ?? '']));
  const challenge = data.state.active ?? data.coach;
  const lastRuns = data.runs.slice(-10);
  const weeks = [...new Set(data.vemPlan.map((session) => session.week))];

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.background }]} edges={['top', 'left', 'right']}>
    <StatusBar style="light" />
    <FormScrollView contentContainerStyle={styles.screen} showsVerticalScrollIndicator={false}>
    {header}
    <View style={styles.tab}>
      <AppCard style={styles.card}>
        <View style={styles.between}>
          <View style={styles.flex}>
            <AppText variant="caption" color={theme.colors.textMuted} weight="700">Planilha de corrida VEM</AppText>
            <AppText variant="title" weight="600">{current ? `Treino ${current.number} de ${total}` : 'Planilha concluída!'}</AppText>
          </View>
          <View style={[styles.badge, { backgroundColor: doneCount === total ? theme.colors.success : `${theme.colors.secondary}30` }]}><AppText variant="caption" weight="700" color={doneCount === total ? '#fff' : theme.colors.text}>{doneCount}/{total} treinos</AppText></View>
        </View>
        <AppText variant="caption">3 treinos por semana, com um dia de descanso entre eles (por exemplo: segunda, quarta e sexta). O próximo treino só libera quando você conclui o anterior.</AppText>
        <View style={[styles.track, { backgroundColor: theme.colors.border }]}><View style={[styles.fill, { width: `${(doneCount / total) * 100}%`, backgroundColor: theme.colors.primary }]} /></View>
      </AppCard>

      {weeks.map((week) => (
        <View key={week} style={[styles.mx, styles.gap8]}>
          <View style={styles.between}><AppText weight="700">{week}</AppText><AppText variant="caption" color={theme.colors.textMuted}>{data.vemPlan.filter((session) => session.week === week && vemDone[session.id]).length}/{data.vemPlan.filter((session) => session.week === week).length}</AppText></View>
          {data.vemPlan.filter((session) => session.week === week).map((session) => {
            const index = data.vemPlan.indexOf(session);
            const done = !!vemDone[session.id];
            const unlocked = done || index === 0 || !!vemDone[data.vemPlan[index - 1]?.id ?? ''];
            const isCurrent = current?.id === session.id;
            const open = openSession === session.id || (openSession === null && isCurrent);
            if (!unlocked) {
              return (
                <AppCard key={session.id} style={[styles.session, { opacity: 0.6 }]}>
                  <View style={[styles.sessionNo, { backgroundColor: theme.colors.surfaceElevated }]}><VemIcon name="lock" size={18} color={theme.colors.textMuted} /></View>
                  <View style={styles.flex}><AppText weight="700">Treino {session.number} · {session.type}</AppText><AppText variant="caption" color={theme.colors.textMuted}>Libera quando você concluir o Treino {session.number - 1}</AppText></View>
                </AppCard>
              );
            }
            return (
              <AppCard key={session.id} style={[styles.card, styles.noMargin, isCurrent && { borderColor: theme.colors.accent, borderWidth: 2 }, done && { backgroundColor: `${theme.colors.success}14` }]}>
                <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpenSession(open ? '' : session.id)} style={styles.session}>
                  <View style={[styles.sessionNo, { backgroundColor: done ? theme.colors.success : theme.colors.surfaceElevated }]}>
                    {done ? <VemIcon name="check" size={18} color="#fff" /> : <AppText weight="700" color={theme.colors.primary}>{session.number}</AppText>}
                  </View>
                  <View style={styles.flex}>
                    <AppText weight="700">Treino {session.number} · {session.type}</AppText>
                    <AppText variant="caption" color={theme.colors.textMuted}>{done ? `feito em ${shortDate(vemDone[session.id] ?? dateKey())}` : [session.km ? `~${session.km} km` : '', session.minMinutes ? `mínimo ${session.minMinutes} min` : ''].filter(Boolean).join(' · ') || 'treino de tiros curtos'}</AppText>
                  </View>
                </Pressable>
                {open && (
                  <>
                    <Blocks blocks={session.blocks} />
                    {!!session.tip && <View style={[styles.tip, { backgroundColor: theme.colors.surfaceElevated }]}><AppText variant="caption">{session.tip}</AppText></View>}
                    <View style={styles.row}>
                      {done ? <AppButton label="Desmarcar" variant="secondary" disabled={busy} onPress={() => void run(() => togglePlanSession(VEM_PLAN_ID, session.id, false))} /> : (
                        <>
                          <AppButton label="Treino concluído" loading={busy} style={styles.flex} onPress={() => void run(() => togglePlanSession(VEM_PLAN_ID, session.id, true))} />
                          <AppButton label="Registrar distância" variant="secondary" style={styles.flex} onPress={() => setEditor('run')} />
                        </>
                      )}
                    </View>
                  </>
                )}
              </AppCard>
            );
          })}
        </View>
      ))}

      <AppText variant="title" weight="600" style={styles.mx}>Suas corridas</AppText>
      <View style={[styles.coach, { backgroundColor: theme.colors.brandSurface }]}>
        <View style={styles.between}>
          <AppText variant="caption" color={theme.colors.accent} weight="700">Coach de corrida</AppText>
          {data.state.active && <View style={[styles.badge, { backgroundColor: theme.colors.accent }]}><AppText variant="caption" weight="700" color="#2E1A20">desafio aceito</AppText></View>}
        </View>
        <AppText variant="title" color={theme.colors.brandText} weight="600">{challenge.title}</AppText>
        <View style={styles.coachStats}>
          <View style={styles.coachStat}><AppText variant="subtitle" weight="700" color={theme.colors.brandText}>{formatKm(challenge.km)}</AppText><AppText variant="caption" color={theme.colors.brandText}>distância</AppText></View>
          {!!challenge.pace && <View style={styles.coachStat}><AppText variant="subtitle" weight="700" color={theme.colors.brandText}>{formatPace(challenge.pace)}</AppText><AppText variant="caption" color={theme.colors.brandText}>ritmo alvo</AppText></View>}
          {!!challenge.times && <View style={styles.coachStat}><AppText variant="subtitle" weight="700" color={theme.colors.brandText}>{challenge.times}×</AppText><AppText variant="caption" color={theme.colors.brandText}>na semana</AppText></View>}
          {!!challenge.minutes && !challenge.pace && <View style={styles.coachStat}><AppText variant="subtitle" weight="700" color={theme.colors.brandText}>{challenge.minutes} min</AppText><AppText variant="caption" color={theme.colors.brandText}>duração</AppText></View>}
        </View>
        <AppText color={theme.colors.brandText}>{challenge.text}</AppText>
        {data.state.active ? (
          <View style={styles.row}>
            <AppButton label="Registrar corrida" style={{ flex: 1, backgroundColor: theme.colors.accent, borderColor: theme.colors.accent }} onPress={() => setEditor('run')} />
            <AppButton label="Pedir outro" variant="ghost" disabled={busy} onPress={() => void run(() => dropChallenge(data.state))} />
          </View>
        ) : (
          <View style={styles.row}>
            <AppButton label="Aceitar desafio" loading={busy} style={{ flex: 1, backgroundColor: theme.colors.accent, borderColor: theme.colors.accent }} onPress={() => void run(() => acceptChallenge(data.coach, data.state))} />
            <AppButton label="Só registrar" variant="ghost" onPress={() => setEditor('run')} />
          </View>
        )}
        <AppText variant="caption" color={theme.colors.brandText}>{data.coach.safety}</AppText>
      </View>
      <AppCard style={styles.card}>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: readingOpen }} onPress={() => setReadingOpen((value) => !value)} style={styles.between}>
          <AppText weight="700" style={styles.flex}>Como o coach leu seu progresso</AppText>
          <View style={{ transform: [{ rotate: readingOpen ? '90deg' : '0deg' }] }}><VemIcon name="chevronRight" size={16} color={theme.colors.textMuted} /></View>
        </Pressable>
        {readingOpen && (
          <>
            {data.coach.reading.map((line) => <AppText key={line} variant="caption">• {line}</AppText>)}
            <AppText variant="caption" color={theme.colors.textMuted}>O coach analisa distância, ritmo, frequência, esforço e dor de cada corrida. Ele só aumenta até 10% por vez, segura quando o esforço está alto e recua se você sentir dor.</AppText>
          </>
        )}
      </AppCard>
      <AppButton label="Registrar corrida" style={styles.mx} onPress={() => setEditor('run')} />
      {data.runs.length ? (
        <AppCard style={styles.card}>
          <View style={styles.between}><AppText weight="700">Histórico</AppText><AppText variant="caption" weight="700">{formatKm(data.runs.reduce((sum, item) => sum + item.km, 0))} no total</AppText></View>
          {lastRuns.length > 1 && <LineChart values={lastRuns.map((item) => item.km)} labels={[shortDate(lastRuns[0]?.date ?? dateKey()), shortDate(lastRuns.at(-1)?.date ?? dateKey())]} accessibilityLabel="Distância por corrida" />}
          {data.runs.slice(-8).reverse().map((item) => (
            <View key={item.id} style={[styles.historyRow, { borderBottomColor: theme.colors.border }]}>
              <AppText variant="caption" weight="700" style={styles.dateCell}>{shortDate(item.date)}</AppText>
              <AppText variant="caption" style={styles.flex}>{formatKm(item.km)} · {formatRunTime(item.durationSeconds)} · {formatPace(item.pace)}</AppText>
              <AppText variant="caption" color={item.pain ? theme.colors.danger : theme.colors.textMuted}>{item.pain ? 'dor' : EFFORT_OPTIONS.find(([value]) => value === item.effort)?.[1] ?? '–'}</AppText>
            </View>
          ))}
        </AppCard>
      ) : <AppCard style={styles.card}><AppText variant="caption" color={theme.colors.textMuted}>Registre sua primeira corrida pra o coach acompanhar sua evolução.</AppText></AppCard>}

      {!!data.teamPlans.length && <AppText variant="title" weight="600" style={styles.mx}>Planilha da equipe</AppText>}
      {data.teamPlans.map((plan) => {
        const progress = data.progress[plan.id] ?? {};
        const done = plan.weeks.filter((week) => progress[week.id]).length;
        return (
          <AppCard key={plan.id} style={styles.card}>
            <View style={styles.between}><AppText weight="700" style={styles.flex}>{plan.title}</AppText><AppText variant="caption" weight="700">{done}/{plan.weeks.length} etapas</AppText></View>
            {!!plan.description && <AppText variant="caption">{plan.description}</AppText>}
            {plan.weeks.map((week, index) => {
              const released = weekReleased(week.releasesOn);
              const checked = !!progress[week.id];
              return (
                <View key={week.id} style={[styles.session, { borderTopColor: theme.colors.border, borderTopWidth: 1, paddingTop: 10, opacity: released ? 1 : 0.7 }]}>
                  <View style={[styles.sessionNo, { backgroundColor: checked ? theme.colors.success : theme.colors.surfaceElevated }]}>
                    {checked ? <VemIcon name="check" size={16} color="#fff" /> : released ? <AppText weight="700">{index + 1}</AppText> : <VemIcon name="lock" size={16} color={theme.colors.textMuted} />}
                  </View>
                  <View style={styles.flex}>
                    <AppText weight="700">{week.title}</AppText>
                    {released ? <AppText variant="caption">{week.text}</AppText> : <AppText variant="caption" color={theme.colors.textMuted}>Libera em {shortDate(week.releasesOn ?? dateKey())}</AppText>}
                    {checked && <AppText variant="caption" color={theme.colors.textMuted}>feito em {shortDate(progress[week.id] ?? dateKey())}</AppText>}
                  </View>
                  {released && (
                    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked }} accessibilityLabel={week.title} disabled={busy} onPress={() => void run(() => togglePlanSession(plan.id, week.id, !checked))} style={[styles.check, { borderColor: checked ? theme.colors.success : theme.colors.border, backgroundColor: checked ? theme.colors.success : 'transparent' }]}>
                      <VemIcon name="check" size={18} color={checked ? '#fff' : theme.colors.textMuted} />
                    </Pressable>
                  )}
                </View>
              );
            })}
          </AppCard>
        );
      })}
      {!!data.teamPlans.length && <AppText variant="caption" color={theme.colors.textMuted} style={styles.mx}>A equipe libera as próximas etapas conforme a planilha avança.</AppText>}
    </View>
    </FormScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  sheet: { padding: 16, gap: 12, paddingBottom: 40 },
  sheetTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  backButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  tab: { gap: 12 },
  screen: { gap: 12, paddingBottom: 36 },
  mx: { marginHorizontal: 16 },
  card: { marginHorizontal: 16, gap: 10 },
  noMargin: { marginHorizontal: 0 },
  flex: { flex: 1 },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  timeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  timeField: { flex: 1, alignItems: 'center', gap: 3 },
  timeInput: { width: '100%', textAlign: 'center', fontSize: 20, fontWeight: '700' },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  gap4: { gap: 4 },
  gap8: { gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7, minHeight: 36, justifyContent: 'center' },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 11, paddingVertical: 10, fontSize: 16, marginTop: 4 },
  badge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  pacePreview: { alignItems: 'center', borderRadius: 12, padding: 12, gap: 2 },
  track: { height: 6, borderRadius: 6, overflow: 'hidden' },
  fill: { height: '100%' },
  session: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sessionNo: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  steps: { gap: 6 },
  indent: { marginLeft: 14 },
  tip: { borderRadius: 12, padding: 12 },
  coach: { marginHorizontal: 16, borderRadius: 16, padding: 18, gap: 12 },
  coachStats: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  coachStat: { flexGrow: 1, minWidth: 90, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 8, padding: 10 },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7, borderBottomWidth: 1 },
  dateCell: { width: 52 },
  check: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
});
