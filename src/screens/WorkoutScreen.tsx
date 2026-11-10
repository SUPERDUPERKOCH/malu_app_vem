import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  Alert,
  BackHandler,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Haptics from 'expo-haptics';
import { AppButton, AppCard, AppText, VemIcon } from '../components';
import {
  WEEK_DAYS,
  cardioMinutes,
  checkWorkoutSchedule,
  dayKindsFromPlan,
  discardWorkout,
  finishWorkout,
  loadWorkoutOverview,
  resetWorkoutSchedule,
  saveWorkoutSchedule,
  setWorkoutLoad,
  startWorkout,
  todayCode,
  toggleWorkoutSet,
  toggleWorkoutTimer,
  workoutElapsed,
  workoutProgress,
  type ActiveWorkoutSession,
  type DayKind,
  type NativeWorkout,
  type WorkoutItem,
  type WorkoutOverview,
  type WorkoutProfessional,
  type WorkoutProgramDetails,
} from '../services/workouts';
import { syncNotifications } from '../services/notifications';
import { dateKey } from '../services/activities';
import { ExternalActivityEditor, RunningTab } from './RunningSection';
import { serifFont, useAppTheme } from '../theme';

const DAY_SHORT: Record<string, string> = { seg: 'SEG', ter: 'TER', qua: 'QUA', qui: 'QUI', sex: 'SEX', sab: 'SÁB', dom: 'DOM' };
const DAY_NAME: Record<string, string> = { seg: 'Segunda', ter: 'Terça', qua: 'Quarta', qui: 'Quinta', sex: 'Sexta', sab: 'Sábado', dom: 'Domingo' };
const DAY_KINDS: Array<[DayKind, string]> = [['treino', 'Treino'], ['cardio', 'Cardio'], ['folga', 'Folga']];
const BLOCK_DESC: Record<string, string> = {
  Principal: 'os exercícios que mais constroem músculo: capricha na carga',
  'Acessórios': 'isola e dá forma',
  'Abdômen': 'centro forte e cintura firme',
  Cardio: 'logo depois do treino, sem pular',
};
const GLOSSARY: Array<[string, string]> = [
  ['Drop set', 'Termina a série, reduz a carga em cerca de 20% e continua sem descanso'],
  ['Rest-pause', 'Termina a série, descansa 10–15s e faz mais algumas repetições com a mesma carga'],
  ['Pirâmide', 'Cada série com menos repetições e mais carga (ex.: 12/10/8)'],
  ['1e½', 'Faz o movimento completo, volta até a metade e completa de novo: conta como 1 repetição'],
];
const SAFETY = [
  'Pare o treino na hora se sentir: dor aguda em articulação, dor no peito, tontura, falta de ar fora do normal ou visão escurecendo. Cansaço muscular e ardência são normais; dor pontuda não é.',
  'Antes de começar: procure avaliação médica se tiver pressão alta, problema cardíaco, diabetes, lesão recente, estiver grávida ou no pós-parto.',
  'Estes treinos são sugestões gerais para a comunidade VEM e não substituem acompanhamento individual. Na dúvida sobre a execução, peça ajuda a um profissional de educação física.',
];

function formatTimer(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  return hours
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
    : `${minutes}:${String(rest).padStart(2, '0')}`;
}

/** "3 × 12", ou só "30 min" para cardio de série única. */
function setsLabel(item: WorkoutItem): string {
  return item.sets === 1 && /min/.test(item.repetitions) ? item.repetitions : `${item.sets} × ${item.repetitions}`;
}

/** Insere cabeçalhos de bloco (Abdômen, Cardio…) como no esboço; Principal e Acessórios não têm cabeçalho. */
function withBlocks(items: WorkoutItem[], render: (item: WorkoutItem, index: number) => ReactNode, header: (block: string) => ReactNode): ReactNode[] {
  let previous: string | null = null;
  return items.flatMap((item, index) => {
    const nodes: ReactNode[] = [];
    if (item.block && item.block !== previous && !['Principal', 'Acessórios'].includes(item.block)) {
      previous = item.block;
      nodes.push(<View key={`block-${item.id}`}>{header(item.block)}</View>);
    }
    nodes.push(render(item, index));
    return nodes;
  });
}

function ExerciseCard({
  workout,
  session,
  itemIndex,
  onChanged,
  onRest,
}: {
  workout: NativeWorkout;
  session: ActiveWorkoutSession;
  itemIndex: number;
  onChanged: () => Promise<void>;
  onRest: (seconds: number) => void;
}) {
  const theme = useAppTheme();
  const item = workout.items[itemIndex];
  const sets = item ? session.series[item.id] ?? [] : [];
  const currentLoad = sets.find((set) => !set.feito)?.carga ?? sets.at(-1)?.carga ?? item?.loadKg ?? 0;
  const [load, setLoad] = useState(String(currentLoad));
  const [busy, setBusy] = useState(false);
  if (!item) return null;
  const completed = sets.filter((set) => set.feito).length;
  const done = sets.length > 0 && completed === sets.length;

  /** Evita toques simultâneos (ex.: dois toques rápidos na mesma série) e avisa quando falta conexão. */
  const guard = async (action: () => Promise<void>): Promise<void> => {
    if (busy) return;
    setBusy(true);
    try { await action(); }
    catch (error) { Alert.alert('Não foi possível salvar', error instanceof Error ? `${error.message}\n\nConfira a conexão e tente de novo.` : 'Confira a conexão e tente de novo.'); }
    finally { setBusy(false); }
  };

  const parsedLoad = (): number => { const value = Number(load.replace(',', '.')); return Number.isFinite(value) ? value : 0; };

  const saveLoad = (value: number): Promise<void> => guard(async () => {
    const normalized = Math.max(0, Math.round(value * 2) / 2);
    setLoad(String(normalized));
    await setWorkoutLoad(session.id, item.id, normalized);
    await onChanged();
  });

  return (
    <AppCard style={[styles.exerciseCard, done && { borderColor: theme.colors.success }]}>
      <View style={styles.exerciseTop}>
        <View style={[styles.exerciseNumber, { backgroundColor: done ? theme.colors.success : theme.colors.primary }]}>
          {done ? <AppText color="#fff" weight="800">✓</AppText> : <AppText color="#fff" weight="800">{itemIndex + 1}</AppText>}
        </View>
        <View style={styles.flex}>
          <AppText variant="subtitle" weight="700">{item.exercise.name}</AppText>
          <AppText variant="caption" color={theme.colors.textMuted}>
            {sets.length} × {item.repetitions} · descanso {formatTimer(item.restSeconds * 1000)} · {completed}/{sets.length}
          </AppText>
        </View>
      </View>

      {!!(item.notes || item.exercise.instructions) && (
        <View style={[styles.tip, { backgroundColor: `${theme.colors.secondary}14` }]}>
          <AppText variant="caption" color={theme.colors.textMuted}>{item.notes || item.exercise.instructions.split('. ')[0]}</AppText>
        </View>
      )}

      <View style={styles.exerciseBottom}>
        {item.supportsLoad || currentLoad > 0 ? (
          <View style={[styles.loadControl, { borderColor: theme.colors.border }]}>
            <Pressable accessibilityLabel="Diminuir 5 kg" onPress={() => void saveLoad(parsedLoad() - 5)} style={styles.loadButton}><AppText weight="700">−5</AppText></Pressable>
            <View style={styles.loadInputWrap}>
              <TextInput
                value={load}
                onChangeText={setLoad}
                onEndEditing={() => void saveLoad(parsedLoad())}
                accessibilityLabel={`Carga em kg de ${item.exercise.name}`}
                keyboardType="decimal-pad"
                selectTextOnFocus
                style={[styles.loadInput, { color: theme.colors.text }]}
              />
              <AppText variant="caption" weight="700">kg</AppText>
            </View>
            <Pressable accessibilityLabel="Aumentar 5 kg" onPress={() => void saveLoad(parsedLoad() + 5)} style={styles.loadButton}><AppText weight="700">+5</AppText></Pressable>
          </View>
        ) : (
          <AppText variant="caption" color={theme.colors.textMuted}>peso do corpo</AppText>
        )}

        <View style={styles.sets}>
          {sets.map((set, index) => (
            <Pressable
              key={`${item.id}-${index}`}
              accessibilityRole="checkbox"
              accessibilityLabel={`Série ${index + 1}`}
              accessibilityState={{ checked: set.feito }}
              disabled={busy}
              onPress={() => void guard(async () => {
                const willComplete = !set.feito;
                await toggleWorkoutSet(session.id, item.id, index);
                if (willComplete) {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  onRest(item.restSeconds);
                }
                await onChanged();
              })}
              style={[
                styles.setButton,
                {
                  borderColor: set.feito ? theme.colors.success : theme.colors.border,
                  backgroundColor: set.feito ? theme.colors.success : 'transparent',
                },
              ]}
            >
              <AppText color={set.feito ? '#fff' : theme.colors.text} weight="800">{set.feito ? '✓' : index + 1}</AppText>
            </Pressable>
          ))}
        </View>
      </View>
    </AppCard>
  );
}

function BlockHeader({ block }: { block: string }) {
  const theme = useAppTheme();
  return (
    <View style={styles.blockHeader}>
      <AppText variant="subtitle" weight="700" color={theme.colors.primary} style={styles.serif}>{block}</AppText>
      {!!BLOCK_DESC[block] && <AppText variant="caption" color={theme.colors.textMuted}>{BLOCK_DESC[block]}</AppText>}
    </View>
  );
}

function ResponsibleLine({ responsible }: { responsible: WorkoutProfessional }) {
  const theme = useAppTheme();
  const registry = responsible.registry ? (/^cref/i.test(responsible.registry) ? responsible.registry : `CREF ${responsible.registry}`) : 'CREF ________';
  return (
    <View style={[styles.responsible, { borderTopColor: theme.colors.border }]}>
      <AppText variant="caption" color={theme.colors.textMuted}>
        Treino revisado e aprovado por <AppText variant="caption" weight="700">{responsible.name || '____________'}</AppText> · {registry}
      </AppText>
    </View>
  );
}

function DetailRow({ title, subtitle, text }: { title: string; subtitle?: string; text?: string }) {
  const theme = useAppTheme();
  return (
    <View style={[styles.detailRow, { borderBottomColor: theme.colors.border }]}>
      <View style={styles.detailLeft}>
        <AppText variant="caption" weight="700">{title}</AppText>
        {!!subtitle && <AppText variant="caption" color={theme.colors.textMuted}>{subtitle}</AppText>}
      </View>
      {!!text && <AppText variant="caption" style={styles.flex}>{text}</AppText>}
    </View>
  );
}

/** Permite escolher o tipo de cada dia e também qual treino será feito nele. */
function ScheduleEditor({
  program,
  initialPlan,
  persisted,
  startsOn,
  onClose,
  onSaved,
}: {
  program: WorkoutProgramDetails;
  initialPlan: Record<string, string>;
  persisted: boolean;
  startsOn: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const theme = useAppTheme();
  const [plan, setPlan] = useState<Record<string, string>>(() => ({ ...initialPlan }));
  const [saving, setSaving] = useState(false);
  const kinds = dayKindsFromPlan(plan);
  const check = checkWorkoutSchedule(program, plan);
  const missing = check.required - check.trainingDays;
  const everyWorkoutOnce = program.workouts.every((workout) => WEEK_DAYS.filter((day) => plan[day] === workout.letter).length === 1);

  const chooseKind = (day: string, kind: DayKind): void => {
    setPlan((current) => {
      if (kind === 'cardio') return { ...current, [day]: `cardio|${cardioMinutes(program)}` };
      if (kind === 'folga') return { ...current, [day]: 'descanso' };
      if (program.workouts.some((workout) => workout.letter === current[day])) return current;
      const used = new Set(Object.entries(current).filter(([currentDay]) => currentDay !== day).map(([, value]) => value));
      const available = program.workouts.find((workout) => !used.has(workout.letter)) ?? program.workouts[0];
      return { ...current, [day]: available?.letter ?? 'descanso' };
    });
  };

  /** Ao escolher um treino já usado, troca os dois de lugar para não criar duplicidade. */
  const chooseWorkout = (day: string, letter: string): void => {
    setPlan((current) => {
      const previous = current[day];
      const otherDay = WEEK_DAYS.find((candidate) => candidate !== day && current[candidate] === letter);
      const next = { ...current, [day]: letter };
      if (otherDay && typeof previous === 'string' && program.workouts.some((workout) => workout.letter === previous)) next[otherDay] = previous;
      return next;
    });
  };

  const run = async (action: () => Promise<void>, failure: string): Promise<void> => {
    try {
      setSaving(true);
      await action();
      await onSaved();
    } catch (error) {
      Alert.alert('Não foi possível salvar', error instanceof Error ? error.message : failure);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.colors.background }]} edges={['top', 'left', 'right']}>
      <StatusBar style={theme.isDark ? 'light' : 'dark'} />
      <ScrollView automaticallyAdjustKeyboardInsets contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.sheetTop}>
          <Pressable accessibilityRole="button" accessibilityLabel="Voltar" onPress={onClose} style={[styles.backButton, { backgroundColor: theme.colors.surfaceElevated }]}>
            <AppText variant="subtitle" weight="700">‹</AppText>
          </Pressable>
          <View style={styles.flex}>
            <AppText variant="caption" color={theme.colors.textMuted} weight="700">{program.name}</AppText>
            <AppText variant="subtitle" weight="700">Meus dias de treino</AppText>
          </View>
        </View>
        <AppText variant="caption">
          Escolha <AppText variant="caption" weight="800">{check.required} dias de treino</AppText> e defina qual treino será feito em cada um. Nos outros dias, marque cardio ou folga.
        </AppText>

        <AppCard style={styles.dayList}>
          {WEEK_DAYS.map((day, index) => {
            const value = plan[day] ?? 'descanso';
            const workout = kinds[day] === 'treino' ? program.workouts.find((item) => item.letter === value) : undefined;
            const subtitle = workout ? workout.name : kinds[day] === 'cardio' ? `Cardio · ${cardioMinutes(program)}` : kinds[day] === 'treino' ? 'Treino a mais' : 'Sem treino e sem cardio';
            return (
              <View key={day} style={[styles.scheduleDay, index > 0 && { borderTopWidth: 1, borderTopColor: theme.colors.border }]}>
                <View style={styles.dayRow}>
                  <View style={styles.flex}>
                    <AppText weight="700">{DAY_NAME[day]}</AppText>
                    <AppText variant="caption" color={theme.colors.textMuted} numberOfLines={2}>{subtitle}</AppText>
                  </View>
                  <View style={styles.dayOptions} accessibilityRole="radiogroup" accessibilityLabel={DAY_NAME[day]}>
                    {DAY_KINDS.map(([kind, label]) => {
                      const selected = kinds[day] === kind;
                      return (
                        <Pressable
                          key={kind}
                          accessibilityRole="radio"
                          accessibilityState={{ checked: selected }}
                          onPress={() => chooseKind(day, kind)}
                          style={[styles.dayChip, { borderColor: selected ? theme.colors.primary : theme.colors.border, backgroundColor: selected ? theme.colors.primary : theme.colors.surface }]}
                        >
                          <AppText variant="caption" weight="700" color={selected ? '#fff' : theme.colors.text}>{label}</AppText>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
                {kinds[day] === 'treino' && (
                  <View style={styles.workoutChoices} accessibilityRole="radiogroup" accessibilityLabel={`Treino de ${DAY_NAME[day]}`}>
                    {program.workouts.map((option) => {
                      const selected = plan[day] === option.letter;
                      const shortName = option.name.replace(/^Treino\s*\d*\s*·?\s*/i, '') || option.focus;
                      return (
                        <Pressable
                          key={option.id}
                          accessibilityRole="radio"
                          accessibilityState={{ checked: selected }}
                          onPress={() => chooseWorkout(day, option.letter)}
                          style={[styles.workoutChoice, { borderColor: selected ? theme.colors.primary : theme.colors.border, backgroundColor: selected ? `${theme.colors.primary}16` : theme.colors.surface }]}
                        >
                          <AppText variant="caption" weight="800" color={selected ? theme.colors.primary : theme.colors.text}>Treino {option.letter}</AppText>
                          <AppText variant="caption" color={theme.colors.textMuted} numberOfLines={1}>{shortName}</AppText>
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              </View>
            );
          })}
        </AppCard>

        <View style={[styles.countBadge, { backgroundColor: check.trainingDays === check.required ? theme.colors.success : `${theme.colors.secondary}30` }]}>
          <AppText variant="caption" weight="700" color={check.trainingDays === check.required ? '#fff' : theme.colors.text}>{check.trainingDays} de {check.required} treinos</AppText>
        </View>
        {missing !== 0 && (
          <AppText variant="caption" color={theme.colors.danger}>
            {missing > 0
              ? `Falta${missing > 1 ? 'm' : ''} ${missing} dia${missing > 1 ? 's' : ''} de treino.`
              : `Tem ${-missing} dia${-missing > 1 ? 's' : ''} de treino a mais. O seu programa é de ${check.required} por semana.`}
          </AppText>
        )}
        {missing === 0 && !everyWorkoutOnce && (
          <AppText variant="caption" color={theme.colors.danger}>Escolha cada treino uma vez na semana, sem repetir.</AppText>
        )}
        {check.conflict && (
          <AppText variant="caption" color={theme.colors.danger}>
            Perna e glúteo ficaram em dias seguidos ({DAY_NAME[check.conflict[0]]} e {DAY_NAME[check.conflict[1]]}). O músculo precisa de pelo menos 48h pra se recuperar: troque um dos dias.
          </AppText>
        )}
        <AppButton
          label="Salvar meus dias"
          loading={saving}
          disabled={!check.valid}
          onPress={() => void run(() => saveWorkoutSchedule(program, plan, persisted ? startsOn : undefined), 'Tente novamente em instantes.')}
        />
        {persisted && (
          <AppButton
            label="Voltar pra semana sugerida"
            variant="ghost"
            disabled={saving}
            onPress={() => void run(resetWorkoutSchedule, 'Tente novamente em instantes.')}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function ProgramCard({ overview, onEditDays }: { overview: WorkoutOverview; onEditDays: () => void }) {
  const theme = useAppTheme();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const program = overview.program;
  const schedule = overview.schedule;
  if (!program || !schedule) return null;
  const today = todayCode();
  const currentPhase = program.phases[schedule.phaseIndex];
  return (
    <AppCard style={styles.programCard}>
      <View style={styles.programTitleRow}>
        <View style={styles.flex}>
          <AppText variant="caption" color={theme.colors.textMuted} weight="700">Seu programa · semana {schedule.currentWeek}</AppText>
          <AppText variant="title" weight="600">{program.name}</AppText>
        </View>
        <View style={[styles.weekBadge, { backgroundColor: theme.colors.primary }]}><AppText color="#fff" weight="800">{schedule.currentWeek}</AppText></View>
      </View>
      {!!program.description && <AppText variant="caption">{program.description}</AppText>}
      <View style={styles.pills}>
        {[program.frequency, program.duration.replace('Treino: ', '')].filter(Boolean).map((text) => (
          <View key={text} style={[styles.pill, { borderColor: theme.colors.border }]}><AppText variant="caption" weight="600">{text}</AppText></View>
        ))}
      </View>
      {currentPhase && (
        <View style={[styles.phaseCurrent, { backgroundColor: `${theme.colors.secondary}18` }]}>
          <AppText variant="caption" color={theme.colors.primary} weight="800">{currentPhase.name} · {currentPhase.label}</AppText>
          <AppText variant="caption" color={theme.colors.textMuted}>{currentPhase.description}</AppText>
        </View>
      )}

      <View style={styles.weekStrip} accessibilityLabel="Sua semana">
        {WEEK_DAYS.map((day) => {
          const value = schedule.weekdayPlan[day] ?? 'descanso';
          const cardio = value.startsWith('cardio');
          const rest = value === 'descanso' || !value;
          const training = !cardio && !rest;
          const isToday = day === today;
          const fg = training ? theme.colors.brandText : theme.colors.textMuted;
          return (
            <View
              key={day}
              style={[
                styles.dayCell,
                { backgroundColor: training ? theme.colors.brandSurface : theme.colors.surfaceElevated },
                isToday && { borderColor: theme.colors.accent, borderWidth: 2 },
              ]}
            >
              <AppText style={styles.dayCellLabel} color={fg}>{DAY_SHORT[day]}</AppText>
              <AppText style={cardio ? styles.dayCellSmall : styles.dayCellValue} weight="700" color={training ? theme.colors.brandText : theme.colors.text}>
                {cardio ? 'cardio' : rest ? '–' : value}
              </AppText>
              {!cardio && <AppText style={styles.dayCellLabel} color={fg} numberOfLines={1}>{rest ? 'folga' : 'treino'}</AppText>}
            </View>
          );
        })}
      </View>

      <AppButton label={schedule.persisted ? 'Mudar meus dias' : 'Escolher meus dias de treino'} variant="secondary" onPress={onEditDays} />
      <AppText variant="caption" color={theme.colors.textMuted}>
        Perna e glúteo nunca em dias seguidos: o músculo precisa de pelo menos 48h para se recuperar e crescer. O app avisa se a escolha quebrar essa regra.
      </AppText>

      <Pressable accessibilityRole="button" accessibilityState={{ expanded: detailsOpen }} onPress={() => setDetailsOpen((value) => !value)} style={styles.detailsToggle}>
        <AppText weight="700" color={theme.colors.primary}>Como funciona o programa</AppText>
        <View style={{ transform: [{ rotate: detailsOpen ? '90deg' : '0deg' }] }}><VemIcon name="chevronRight" size={16} color={theme.colors.primary} /></View>
      </Pressable>
      {detailsOpen && (
        <View style={styles.details}>
          {!!program.audience && <AppText variant="caption"><AppText variant="caption" weight="700">Pra quem: </AppText>{program.audience}</AppText>}
          {!!program.equipment && <AppText variant="caption"><AppText variant="caption" weight="700">Você vai precisar: </AppText>{program.equipment}</AppText>}
          <AppText variant="caption">
            <AppText variant="caption" weight="700">Todo treino segue a mesma ordem: </AppText>
            os exercícios do treino, abdômen (nos dias de parte de cima) e cardio. Não pule etapas.
          </AppText>
          {!!program.phases.length && <AppText variant="caption" weight="700" color={theme.colors.textMuted}>As 12 semanas do plano</AppText>}
          {program.phases.map((phase, index) => (
            <View key={`${phase.label}-${index}`} style={index === schedule.phaseIndex ? { backgroundColor: `${theme.colors.primary}10`, borderRadius: 8 } : undefined}>
              <DetailRow title={phase.name} subtitle={phase.label} text={phase.description} />
            </View>
          ))}
          {!!program.cardio.length && (
            <>
              <AppText variant="caption" weight="700" color={theme.colors.textMuted}>Cardio para emagrecer</AppText>
              <AppText variant="caption">Cardio depois de cada treino e sozinho nos dias sem musculação. Nos dias de descanso, nada.</AppText>
              {program.cardio.map((row, index) => <DetailRow key={`cardio-${index}`} title={row[0] ?? ''} subtitle={row[1]} text={row[2]} />)}
            </>
          )}
          {!!program.rules.length && (
            <>
              <AppText variant="caption" weight="700" color={theme.colors.textMuted}>Regras de ouro</AppText>
              {program.rules.map((row, index) => <DetailRow key={`rule-${index}`} title={row[0] ?? ''} text={row[1]} />)}
            </>
          )}
          <AppText variant="caption" weight="700" color={theme.colors.textMuted}>Glossário</AppText>
          {GLOSSARY.map(([term, meaning]) => <DetailRow key={term} title={term} text={meaning} />)}
          <AppText variant="caption" weight="700" color={theme.colors.textMuted}>Segurança</AppText>
          {SAFETY.map((text) => <AppText key={text} variant="caption">• {text}</AppText>)}
        </View>
      )}
      <ResponsibleLine responsible={program.responsible} />
    </AppCard>
  );
}

export function WorkoutScreen() {
  const theme = useAppTheme();
  const [overview, setOverview] = useState<WorkoutOverview | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [restUntil, setRestUntil] = useState<number | null>(null);
  const [editingSchedule, setEditingSchedule] = useState(false);
  const [starting, setStarting] = useState(false);
  const [section, setSection] = useState<'treinos' | 'corrida'>('treinos');
  const [externalType, setExternalType] = useState<string | null>(null);
  const navigation = useNavigation();
  const openSummary = useCallback(() => navigation.navigate('Compartilhar', { mode: 'treino' }), [navigation]);
  const closeExternal = useCallback(() => setExternalType(null), []);

  const [loadError, setLoadError] = useState('');
  const load = useCallback(async (): Promise<void> => {
    try { setOverview(await loadWorkoutOverview()); setLoadError(''); }
    catch (error) { setLoadError(error instanceof Error ? error.message : 'Confira a conexão.'); }
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  useEffect(() => {
    if (!editingSchedule) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => { setEditingSchedule(false); return true; });
    return () => subscription.remove();
  }, [editingSchedule]);

  useEffect(() => {
    if (!overview?.activeSession?.rodando && !restUntil) return;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [overview?.activeSession?.rodando, restUntil]);

  useEffect(() => {
    if (restUntil && now >= restUntil) {
      setRestUntil(null);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [now, restUntil]);

  const activeWorkout = overview?.activeSession
    ? overview.workouts.find((workout) => workout.id === overview.activeSession?.treinoId)
    : null;

  if (!overview) {
    return (
      <SafeAreaView style={[styles.loading, { backgroundColor: theme.colors.background }]}>
        <AppText color={loadError ? theme.colors.danger : theme.colors.textMuted} style={styles.loadingText}>{loadError ? 'Não foi possível carregar seus treinos. Confira a conexão.' : 'Carregando treinos…'}</AppText>
        {!!loadError && <AppButton label="Tentar novamente" onPress={() => void load()} />}
      </SafeAreaView>
    );
  }

  if (externalType !== null) {
    return (
      <ExternalActivityEditor
        initialType={externalType || undefined}
        onClose={closeExternal}
        onSaved={async (date) => { setExternalType(null); await load(); if (date === dateKey()) openSummary(); else Alert.alert('Atividade registrada', 'Ela já conta pra sua meta e pros seus prêmios.'); }}
      />
    );
  }

  const header = (
    <>
      <View style={[styles.header, { backgroundColor: theme.colors.brandSurface }]}>
        <View style={styles.logoRow}><View style={[styles.logoBadge, { borderColor: theme.colors.brandText }]}><AppText variant="caption" color={theme.colors.brandText} weight="800">VEM</AppText></View><AppText color={theme.colors.brandText}>Vida em Movimento</AppText></View>
        <AppText variant="title" color={theme.colors.brandText} weight="600">Treino</AppText>
      </View>
      <View style={[styles.sectionTabs, { borderBottomColor: theme.colors.border }]} accessibilityRole="tablist">
        {([['treinos', 'Treinos'], ['corrida', 'Corrida']] as const).map(([key, label]) => (
          <Pressable key={key} accessibilityRole="tab" accessibilityState={{ selected: section === key }} onPress={() => setSection(key)} style={[styles.sectionTab, section === key && { borderBottomColor: theme.colors.text }]}>
            <AppText weight="600" color={section === key ? theme.colors.text : theme.colors.textMuted}>{label}</AppText>
          </Pressable>
        ))}
      </View>
    </>
  );

  if (section === 'corrida' && !overview.activeSession) {
    return <RunningTab header={header} onShare={openSummary} />;
  }

  if (editingSchedule && overview.program && overview.schedule) {
    return (
      <ScheduleEditor
        program={overview.program}
        initialPlan={overview.schedule.weekdayPlan}
        persisted={overview.schedule.persisted}
        startsOn={overview.schedule.startsOn}
        onClose={() => setEditingSchedule(false)}
        onSaved={async () => { setEditingSchedule(false); await load(); void syncNotifications().catch(() => undefined); }}
      />
    );
  }

  const beginWorkout = async (workout: NativeWorkout): Promise<void> => {
    if (starting) return;
    setStarting(true);
    try {
      await startWorkout(workout, { phaseIndex: overview.schedule?.phaseIndex });
      await load();
    } catch (error) {
      Alert.alert('Não foi possível iniciar o treino', error instanceof Error ? error.message : 'Tente novamente em instantes.');
    } finally {
      setStarting(false);
    }
  };

  const finish = (): void => {
    const session = overview.activeSession;
    if (!session) return;
    const progress = workoutProgress(session);
    const confirm = async (): Promise<void> => {
      try { await finishWorkout(session.id); setRestUntil(null); await load(); openSummary(); }
      catch (error) { Alert.alert('Não foi possível finalizar', error instanceof Error ? error.message : 'Tente novamente.'); }
    };
    if (progress.percentage < 100) {
      Alert.alert(
        `Finalizar com ${progress.percentage}% das séries?`,
        'Tudo bem: o que você fez conta e entra na sua evolução.',
        [{ text: 'Continuar treinando', style: 'cancel' }, { text: 'Finalizar assim', onPress: () => void confirm() }]
      );
    } else void confirm();
  };

  const discard = (): void => {
    const session = overview.activeSession;
    if (!session) return;
    Alert.alert('Descartar este treino?', 'As séries marcadas hoje serão apagadas.', [
      { text: 'Voltar', style: 'cancel' },
      { text: 'Descartar', style: 'destructive', onPress: async () => {
        try { await discardWorkout(session.id); setRestUntil(null); await load(); }
        catch (error) { Alert.alert('Não foi possível descartar', error instanceof Error ? error.message : 'Confira a conexão e tente de novo.'); }
      } },
    ]);
  };

  if (overview.activeSession && activeWorkout) {
    const session = overview.activeSession;
    const progress = workoutProgress(session);
    const restSeconds = restUntil ? Math.max(0, Math.ceil((restUntil - now) / 1000)) : 0;
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.colors.background }]} edges={['top', 'left', 'right']}>
        <StatusBar style={theme.isDark ? 'light' : 'dark'} />
        <ScrollView automaticallyAdjustKeyboardInsets contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={[styles.sessionHero, { backgroundColor: theme.colors.brandSurface }]}>
            <View style={styles.heroTitleRow}>
              <View style={[styles.focusPill, { backgroundColor: 'rgba(255,255,255,0.14)' }]}><AppText variant="caption" color={theme.colors.brandText} weight="800">{session.foco.toUpperCase()}</AppText></View>
              <AppText variant="caption" color={theme.colors.brandText}>{progress.completed}/{progress.total} séries</AppText>
            </View>
            <AppText variant="title" color={theme.colors.brandText} weight="600">{session.nome}</AppText>
            <View style={styles.sessionStats}>
              <Pressable accessibilityRole="button" accessibilityLabel={session.rodando ? 'Pausar cronômetro' : 'Retomar cronômetro'} onPress={async () => {
                try { await toggleWorkoutTimer(session.id); await load(); }
                catch (error) { Alert.alert('Não foi possível pausar ou retomar', error instanceof Error ? error.message : 'Confira a conexão e tente de novo.'); }
              }} style={styles.sessionStat}>
                <AppText variant="title" color={theme.colors.brandText} weight="700">{formatTimer(workoutElapsed(session))}</AppText>
                <AppText variant="caption" color={theme.colors.brandText}>{session.rodando ? 'tocar para pausar' : 'pausado · tocar para seguir'}</AppText>
              </Pressable>
              <View style={styles.sessionStat}>
                <AppText variant="title" color={theme.colors.accent} weight="700">{progress.percentage}%</AppText>
                <AppText variant="caption" color={theme.colors.brandText}>concluído</AppText>
              </View>
            </View>
            <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${progress.percentage}%`, backgroundColor: theme.colors.accent }]} /></View>
          </View>

          {restUntil && (
            <View style={[styles.restCard, { backgroundColor: theme.colors.accent }]}>
              <VemIcon name="clock" size={24} color="#2E1A20" />
              <View style={styles.flex}><AppText variant="caption" color="#2E1A20" weight="800">DESCANSO</AppText><AppText variant="title" color="#2E1A20" weight="800">{formatTimer(restSeconds * 1000)}</AppText></View>
              <Pressable onPress={() => setRestUntil(null)}><AppText color="#2E1A20" weight="700">Pular</AppText></Pressable>
            </View>
          )}

          <AppText color={theme.colors.textMuted}>Digite a carga usada e marque cada série concluída.</AppText>
          {withBlocks(
            activeWorkout.items,
            (item, index) => (
              <ExerciseCard
                key={item.id}
                workout={activeWorkout}
                session={session}
                itemIndex={index}
                onChanged={load}
                onRest={(seconds) => setRestUntil(Date.now() + seconds * 1000)}
              />
            ),
            (block) => <BlockHeader block={block} />
          )}
          <AppButton label="Finalizar treino" variant={progress.percentage === 100 ? 'primary' : 'secondary'} onPress={finish} />
          <Pressable onPress={discard} style={styles.centerButton}><AppText variant="caption" color={theme.colors.danger} weight="700">Descartar este treino</AppText></Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  const suggested = overview.suggestedWorkoutId ? overview.workouts.find((workout) => workout.id === overview.suggestedWorkoutId) : undefined;
  const suggestedDone = !!suggested && overview.completedToday.some((session) => session.treinoId === suggested.id);
  const nothingDoneToday = overview.completedToday.length === 0;
  const cardioTip = overview.program?.cardio.find((row) => row[0] === 'Dias sem treino')?.[2] ?? '';

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.colors.background }]} edges={['top', 'left', 'right']}>
      <StatusBar style="light" />
      <ScrollView automaticallyAdjustKeyboardInsets contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
        {header}

        {overview.completedToday.length > 0 && (
          <AppCard style={[styles.completedCard, { borderColor: theme.colors.success }]}>
            <View style={[styles.completedIcon, { backgroundColor: theme.colors.success }]}><VemIcon name="check" size={20} color="#fff" /></View>
            <View style={styles.flex}><AppText weight="700">Treino concluído hoje</AppText><AppText variant="caption" color={theme.colors.textMuted}>{overview.completedToday.at(-1)?.nome}</AppText></View>
            <AppButton label="Ver imagem" variant="secondary" onPress={openSummary} />
          </AppCard>
        )}

        {suggested && !suggestedDone && (
          <View style={[styles.suggested, { backgroundColor: theme.colors.brandSurface }]}>
            <View style={[styles.focusPill, { backgroundColor: 'rgba(255,255,255,0.14)' }]}><AppText variant="caption" color={theme.colors.brandText} weight="800">SUGESTÃO DE HOJE · {suggested.focus.toUpperCase()}</AppText></View>
            <AppText variant="title" color={theme.colors.brandText} weight="600">{suggested.name}</AppText>
            <View style={styles.inline}><VemIcon name="clock" size={18} color={theme.colors.brandText} /><AppText variant="caption" color={theme.colors.brandText}>~{suggested.estimatedMinutes} min · {suggested.items.length} exercícios</AppText></View>
            <AppButton label="Começar treino" loading={starting} onPress={() => void beginWorkout(suggested)} style={{ backgroundColor: theme.colors.accent, borderColor: theme.colors.accent }} />
            {/* <Pressable onPress={() => setExpandedId(suggested.id)} style={styles.centerButton}><AppText variant="caption" color={theme.colors.brandText} weight="700">Ver exercícios</AppText></Pressable> */}
          </View>
        )}

        {!suggested && nothingDoneToday && overview.todayKind === 'cardio' && (
          <View style={[styles.suggested, { backgroundColor: theme.colors.brandSurface }]}>
            <View style={[styles.focusPill, { backgroundColor: 'rgba(255,255,255,0.14)' }]}><AppText variant="caption" color={theme.colors.brandText} weight="800">HOJE É DIA DE CARDIO</AppText></View>
            <AppText variant="title" color={theme.colors.brandText} weight="600">{overview.todayPlan}</AppText>
            {!!cardioTip && <AppText variant="caption" color={theme.colors.brandText}>{cardioTip}</AppText>}
            <AppButton label="Registrar cardio feito" onPress={() => setExternalType('Caminhada')} style={{ backgroundColor: theme.colors.accent, borderColor: theme.colors.accent }} />
          </View>
        )}

        {!suggested && nothingDoneToday && overview.todayKind === 'descanso' && (
          <AppCard style={styles.todayRest}>
            <AppText variant="caption" color={theme.colors.primary} weight="800">HOJE É DIA DE DESCANSO NO SEU PROGRAMA</AppText>
            <AppText variant="subtitle" weight="700">Hoje seu corpo recupera</AppText>
            <AppText variant="caption" color={theme.colors.textMuted}>Sem treino e sem cardio. É no descanso que o músculo se recupera e cresce.</AppText>
          </AppCard>
        )}

        {!suggested && nothingDoneToday && overview.todayKind === 'livre' && overview.program && (
          <AppCard style={styles.todayRest}><AppText variant="caption" color={theme.colors.primary} weight="800">PROGRAMAÇÃO DE HOJE</AppText><AppText variant="title" weight="600">{overview.todayPlan}</AppText><AppText variant="caption" color={theme.colors.textMuted}>Você pode iniciar outro treino abaixo se precisar ajustar sua rotina.</AppText></AppCard>
        )}

        <ProgramCard overview={overview} onEditDays={() => setEditingSchedule(true)} />

        <View style={styles.sectionHeader}>
          <AppText variant="title" weight="600">Treinos do seu programa</AppText>
          <AppText variant="caption" color={theme.colors.textMuted}>A sugestão segue a sua semana, mas você pode fazer o treino que quiser.</AppText>
        </View>

        {overview.workouts.map((workout) => {
          const expanded = expandedId === workout.id;
          const days = WEEK_DAYS.filter((day) => overview.schedule?.weekdayPlan[day] === workout.letter).map((day) => DAY_SHORT[day]?.charAt(0) + (DAY_SHORT[day]?.slice(1).toLowerCase() ?? ''));
          return (
            <AppCard key={workout.id} style={{ gap: theme.spacing.sm }}>
              <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpandedId(expanded ? null : workout.id)} style={styles.workoutRow}>
                <View style={[styles.workoutIcon, { backgroundColor: `${theme.colors.primary}14` }]}>
                  {workout.letter ? <AppText variant="title" weight="600" color={theme.colors.primary}>{workout.letter}</AppText> : <VemIcon name="workout" color={theme.colors.primary} />}
                </View>
                <View style={styles.flex}>
                  <AppText variant="caption" color={theme.colors.textMuted} weight="700">{workout.focus}</AppText>
                  <AppText weight="700">{workout.name}</AppText>
                  <AppText variant="caption" color={theme.colors.textMuted}>{days.length ? `${days.join(', ')} · ` : ''}{workout.items.length} exercícios · ~{workout.estimatedMinutes} min</AppText>
                </View>
                <View style={{ transform: [{ rotate: expanded ? '90deg' : '0deg' }] }}><VemIcon name="chevronRight" size={18} color={theme.colors.textMuted} /></View>
              </Pressable>
              {expanded && (
                <View style={styles.expanded}>
                  {withBlocks(
                    workout.items,
                    (item, index) => (
                      <View key={item.id} style={[styles.previewExercise, { borderTopColor: theme.colors.border }]}>
                        <AppText variant="caption" color={theme.colors.primary} weight="800">{index + 1}</AppText>
                        <View style={styles.flex}>
                          <AppText weight="600">{item.exercise.name}</AppText>
                          <AppText variant="caption" color={theme.colors.textMuted}>
                            {setsLabel(item)}{item.restSeconds ? ` · descanso ${formatTimer(item.restSeconds * 1000)}` : ''} · {item.supportsLoad ? (item.loadKg > 0 ? `${item.loadKg} kg` : 'carga a definir') : item.block === 'Cardio' ? 'cardio' : 'peso do corpo'}
                          </AppText>
                          {!!item.notes && <AppText variant="caption" color={theme.colors.textMuted}>{item.notes}</AppText>}
                        </View>
                      </View>
                    ),
                    (block) => <BlockHeader block={block} />
                  )}
                  {overview.program && <ResponsibleLine responsible={overview.program.responsible} />}
                  <AppButton label="Começar este treino" loading={starting} onPress={() => void beginWorkout(workout)} />
                </View>
              )}
            </AppCard>
          );
        })}

        {!overview.workouts.length && (
          <AppCard style={styles.empty}><AppText color={theme.colors.textMuted}>Nenhum treino foi indicado. Refaça o quiz no Painel para atualizar suas recomendações.</AppText></AppCard>
        )}
        <AppButton label="Registrar atividade feita fora do app" variant="secondary" style={styles.mx} onPress={() => setExternalType('')} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  serif: { fontFamily: serifFont },
  safeArea: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  loadingText: { textAlign: 'center' },
  content: { padding: 16, gap: 12, paddingBottom: 36 },
  listContent: { gap: 12, paddingBottom: 36 },
  header: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 18, gap: 12, borderBottomLeftRadius: 22, borderBottomRightRadius: 22 },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logoBadge: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  sessionHero: { borderRadius: 22, padding: 18, gap: 12 },
  heroTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  focusPill: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  sessionStats: { flexDirection: 'row', gap: 8 },
  sessionStat: { flex: 1, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 14, padding: 12 },
  progressTrack: { height: 7, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.18)', overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 8 },
  restCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, padding: 14 },
  exerciseCard: { gap: 12 },
  exerciseTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  exerciseNumber: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  tip: { borderRadius: 10, padding: 10 },
  exerciseBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' },
  loadControl: { flexDirection: 'row', borderWidth: 1, borderRadius: 10, overflow: 'hidden' },
  loadButton: { minWidth: 42, minHeight: 40, alignItems: 'center', justifyContent: 'center' },
  loadInputWrap: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6 },
  loadInput: { width: 42, textAlign: 'center', fontSize: 16, fontWeight: '700', paddingVertical: 6 },
  sets: { flexDirection: 'row', gap: 7, flexWrap: 'wrap' },
  setButton: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  centerButton: { alignSelf: 'center', padding: 10 },
  blockHeader: { marginTop: 6, gap: 1 },
  responsible: { borderTopWidth: 1, borderStyle: 'dashed', paddingTop: 10 },
  sheetTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  backButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  dayList: { gap: 0, paddingVertical: 4 },
  scheduleDay: { paddingVertical: 4 },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10 },
  dayOptions: { flexDirection: 'row', gap: 4 },
  dayChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 7, minHeight: 36, justifyContent: 'center' },
  workoutChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingBottom: 10 },
  workoutChoice: { minWidth: 112, maxWidth: 180, flexGrow: 1, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
  countBadge: { alignSelf: 'flex-start', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  completedCard: { marginHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  completedIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  suggested: { marginHorizontal: 16, borderRadius: 22, padding: 18, gap: 12 },
  programCard: { marginHorizontal: 16, gap: 12 },
  programTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  weekBadge: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pill: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  phaseCurrent: { borderRadius: 12, padding: 12, gap: 4 },
  weekStrip: { flexDirection: 'row', gap: 4 },
  dayCell: { flex: 1, minWidth: 0, borderRadius: 10, paddingVertical: 6, paddingHorizontal: 1, alignItems: 'center', borderWidth: 2, borderColor: 'transparent' },
  dayCellLabel: { fontSize: 10, lineHeight: 13 },
  dayCellValue: { fontSize: 16, lineHeight: 21, fontFamily: serifFont },
  dayCellSmall: { fontSize: 10, lineHeight: 21 },
  detailsToggle: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
  details: { gap: 8 },
  detailRow: { flexDirection: 'row', gap: 8, paddingVertical: 6, borderBottomWidth: 1 },
  detailLeft: { width: 96 },
  todayRest: { marginHorizontal: 16, gap: 6 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionHeader: { marginHorizontal: 16, marginTop: 8, gap: 2 },
  workoutRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  workoutIcon: { width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  expanded: { gap: 8 },
  previewExercise: { borderTopWidth: 1, paddingTop: 9, flexDirection: 'row', gap: 10 },
  empty: { marginHorizontal: 16, alignItems: 'center', gap: 12 },
  mx: { marginHorizontal: 16 },
  sectionTabs: { flexDirection: 'row', gap: 22, marginHorizontal: 16, borderBottomWidth: 1 },
  sectionTab: { paddingVertical: 10, minHeight: 44, justifyContent: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent', marginBottom: -1 },
});
