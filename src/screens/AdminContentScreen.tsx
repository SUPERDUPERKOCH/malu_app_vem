import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, TextInput, View, type KeyboardTypeOptions } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppButton, AppCard, AppText, FormScrollView } from '../components';
import type {
  CourseContentDocument,
  CourseLessonContent,
  GeneralContentDocument,
  MealPlansContentDocument,
  RunningPlanContent,
  TeamReminderContent,
  WorkoutExerciseContent,
  WorkoutItemContent,
  WorkoutsContentDocument,
} from '../models/content';
import {
  deleteMeeting,
  duplicatedMeetingWeeks,
  loadAdministration,
  loadContent,
  loadTeamIndicators,
  publishContent,
  saveMeeting,
  saveReward,
  saveVemSettings,
  type AdminMeeting,
  type AdminReward,
  type AdministrationData,
  type ContentKey,
  type TeamIndicators,
} from '../services/administration';
import { useAppTheme } from '../theme';

type Tab = 'indicadores' | 'exercicios' | 'treinos' | 'corrida' | 'cardapios' | 'agenda' | 'curso' | 'materiais' | 'lembretes' | 'avisos' | 'premios';
const TABS: Array<[Tab, string]> = [['indicadores', 'Indicadores'], ['exercicios', 'Exercícios'], ['treinos', 'Treinos'], ['corrida', 'Corrida'], ['cardapios', 'Cardápios'], ['agenda', 'Agenda e call'], ['curso', 'Curso'], ['materiais', 'Materiais'], ['lembretes', 'Lembretes'], ['avisos', 'Avisos e frases'], ['premios', 'Prêmios']];
const DAYS: Array<[string, string]> = [['seg', 'Seg'], ['ter', 'Ter'], ['qua', 'Qua'], ['qui', 'Qui'], ['sex', 'Sex'], ['sab', 'Sáb'], ['dom', 'Dom']];
const REMINDER_TYPES: Array<[string, string]> = [['agua', 'Beber água'], ['leitura', 'Leitura'], ['tarefa', 'Tarefa'], ['treino', 'Movimento'], ['autocuidado', 'Autocuidado'], ['outro', 'Outro']];
const BLOCKS = ['Principal', 'Acessórios', 'Abdômen', 'Cardio'];
const LEVELS: Record<string, string> = { beginner: 'Iniciante', intermediate: 'Intermediária', advanced: 'Avançada', '': 'Sem nível' };
const MODALITIES: Record<string, string> = { gym: 'Academia', home: 'Casa', '': 'Sem local' };
const WEEK_LETTERS = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'];
const LINK = /^https?:\/\//i;
/** Documento `agenda`: os encontros oficiais ficam na tabela `meetings`; aqui ficam as outras datas do calendário. */
interface AgendaDocument { eventos?: Array<{ id: string; data: string; hora?: string; titulo: string; local?: string }>; [key: string]: unknown }

const uid = (prefix: string): string => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const todayKey = (): string => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const planLabel = (id: string): string => { const match = /^(\d+)-(.+)$/.exec(id); return match ? `${match[1]} kcal · ${match[2]?.replace(/-/g, ' ')}` : id || 'Sem indicação automática'; };
const move = <T,>(list: T[], index: number, delta: number): T[] => { const next = [...list]; const target = index + delta; if (target < 0 || target >= next.length) return next; [next[index], next[target]] = [next[target] as T, next[index] as T]; return next; };

function Field({ label, value, onChange, multiline, keyboardType, placeholder }: { label: string; value: string; onChange: (value: string) => void; multiline?: boolean; keyboardType?: KeyboardTypeOptions; placeholder?: string }) {
  const theme = useAppTheme();
  return (
    <View style={styles.field}>
      <AppText variant="caption" weight="600" color={theme.colors.textMuted}>{label}</AppText>
      <TextInput value={value} onChangeText={onChange} multiline={multiline} keyboardType={keyboardType} placeholder={placeholder} autoCapitalize={keyboardType === 'url' ? 'none' : 'sentences'} placeholderTextColor={theme.colors.textMuted} style={[styles.input, multiline && styles.multiline, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface }]} />
    </View>
  );
}

function Chips({ options, selected, onToggle }: { options: Array<[string, string]>; selected: string[]; onToggle: (key: string) => void }) {
  const theme = useAppTheme();
  return (
    <View style={styles.chips}>
      {options.map(([key, label]) => {
        const active = selected.includes(key);
        return (
          <Pressable key={key} accessibilityRole="button" accessibilityState={{ selected: active }} onPress={() => onToggle(key)} style={[styles.chip, { borderColor: active ? theme.colors.primary : theme.colors.border, backgroundColor: active ? theme.colors.primary : 'transparent' }]}>
            <AppText variant="caption" weight="600" color={active ? '#fff' : theme.colors.text}>{label}</AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

function ItemActions({ index, count, onMove, onRemove }: { index: number; count: number; onMove: (delta: number) => void; onRemove: () => void }) {
  const theme = useAppTheme();
  return (
    <View style={styles.actions}>
      {index > 0 && <Pressable onPress={() => onMove(-1)} style={styles.action}><AppText variant="caption" weight="700">Subir</AppText></Pressable>}
      {index < count - 1 && <Pressable onPress={() => onMove(1)} style={styles.action}><AppText variant="caption" weight="700">Descer</AppText></Pressable>}
      <View style={styles.flex} />
      <Pressable onPress={() => Alert.alert('Remover este item?', 'A remoção só vale depois de publicar.', [{ text: 'Voltar', style: 'cancel' }, { text: 'Remover', style: 'destructive', onPress: onRemove }])} style={styles.action}>
        <AppText variant="caption" weight="700" color={theme.colors.danger}>Remover</AppText>
      </Pressable>
    </View>
  );
}

/** Rascunho local de um documento editorial com botão de publicação. */
function useContentDraft<T extends object>(key: ContentKey) {
  const [draft, setDraft] = useState<T | null>(null);
  const [dirty, setDirty] = useState(false);
  const [publishing, setPublishing] = useState(false);
  useEffect(() => {
    let alive = true;
    loadContent<T>(key).then((content) => { if (alive) setDraft(clone((content ?? {}) as T)); }).catch((error: unknown) => Alert.alert('Não foi possível carregar', error instanceof Error ? error.message : 'Confira sua conexão.'));
    return () => { alive = false; };
  }, [key]);
  const update = useCallback((mutate: (value: T) => void) => {
    setDraft((current) => { if (!current) return current; const next = clone(current); mutate(next); return next; });
    setDirty(true);
  }, []);
  const publish = async (): Promise<void> => {
    if (!draft) return;
    setPublishing(true);
    try { await publishContent(key, draft); setDirty(false); Alert.alert('Publicado', 'As participantes já veem a nova versão.'); }
    catch (error) { Alert.alert('Não foi possível publicar', error instanceof Error ? error.message : 'Sua conta precisa ser de administradora.'); }
    finally { setPublishing(false); }
  };
  return { draft, update, publish, publishing, dirty };
}

function PublishBar({ dirty, publishing, onPublish }: { dirty: boolean; publishing: boolean; onPublish: () => void }) {
  const theme = useAppTheme();
  return (
    <View style={styles.publish}>
      {dirty && <AppText variant="caption" color={theme.colors.danger}>Há alterações não publicadas.</AppText>}
      <AppButton label="Publicar alterações" loading={publishing} disabled={!dirty} onPress={onPublish} />
    </View>
  );
}

function Loading() { const theme = useAppTheme(); return <AppText color={theme.colors.textMuted}>Carregando…</AppText>; }

function IndicatorsTab() {
  const theme = useAppTheme();
  const [data, setData] = useState<TeamIndicators | null>(null);
  const [error, setError] = useState('');
  useFocusEffect(useCallback(() => { loadTeamIndicators().then(setData).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Não foi possível carregar.')); }, []));
  if (error) return <AppText color={theme.colors.danger}>{error}</AppText>;
  if (!data) return <Loading />;
  const max = Math.max(1, ...data.perDay);
  const list = (title: string, values: Record<string, number>, label: (key: string) => string): ReactNode => (
    <AppCard style={styles.card}>
      <AppText weight="700">{title}</AppText>
      {Object.entries(values).sort((a, b) => b[1] - a[1]).map(([key, count]) => (
        <View key={key || 'vazio'} style={styles.between}><AppText variant="caption" style={styles.flex}>{label(key)}</AppText><AppText variant="caption" weight="700">{count}</AppText></View>
      ))}
    </AppCard>
  );
  return (
    <>
      <View style={styles.tiles}>
        {[[data.quizzes, 'responderam o quiz'], [data.activeThisWeek, 'ativas nesta semana'], [data.workoutsThisWeek, 'treinos nesta semana'], [data.workoutsTotal.toLocaleString('pt-BR'), 'treinos no total']].map(([value, label]) => (
          <AppCard key={String(label)} style={styles.tile}><AppText variant="title" weight="700">{value}</AppText><AppText variant="caption" color={theme.colors.textMuted}>{label}</AppText></AppCard>
        ))}
      </View>
      <AppCard style={styles.card}>
        <AppText weight="700">Treinos por dia nesta semana</AppText>
        <View style={styles.bars}>
          {data.perDay.map((count, index) => (
            <View key={index} style={styles.barCol}>
              <AppText variant="caption">{count}</AppText>
              <View style={[styles.bar, { height: Math.max(2, (count / max) * 76), backgroundColor: theme.colors.secondary }]} />
              <AppText variant="caption" color={theme.colors.textMuted}>{WEEK_LETTERS[index]}</AppText>
            </View>
          ))}
        </View>
      </AppCard>
      {list('Cardápios indicados', data.mealPlans, planLabel)}
      {list('Objetivos', data.objectives, (key) => key || 'Sem objetivo')}
      {list('Nível', data.levels, (key) => LEVELS[key] ?? key)}
      {list('Local de treino', data.modalities, (key) => MODALITIES[key] ?? key)}
      <AppText variant="caption" color={theme.colors.textMuted}>Só aparece o que cada participante permitiu compartilhar. Peso, altura, idade, saúde e avaliações nunca chegam à equipe.</AppText>
      <AppCard style={styles.card}>
        <AppText weight="700">Como o quiz indica o cardápio</AppText>
        <AppText variant="caption">Gasto diário estimado pela fórmula de Mifflin-St Jeor (idade, altura e peso) × nível de atividade. Se o objetivo é emagrecer, a meta é o gasto menos 500 kcal. Meta a partir de 1.600 kcal indica o 1800; abaixo disso, o 1400. O tipo segue a resposta sobre alimentação. Quem responde gestação ou condição de saúde em acompanhamento não tem acesso aos cardápios.</AppText>
        <AppText variant="caption" color={theme.colors.textMuted}>Vale a nutricionista da VEM validar essa regra.</AppText>
      </AppCard>
    </>
  );
}

function ExercisePicker({ exercises, onPick, placeholder }: { exercises: WorkoutExerciseContent[]; onPick: (exercise: WorkoutExerciseContent) => void; placeholder: string }) {
  const theme = useAppTheme();
  const [query, setQuery] = useState('');
  const normalized = query.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const matches = normalized ? exercises.filter((exercise) => `${exercise.nome} ${exercise.grupo}`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(normalized)).slice(0, 8) : [];
  return (
    <View style={styles.field}>
      <TextInput value={query} onChangeText={setQuery} placeholder={placeholder} placeholderTextColor={theme.colors.textMuted} style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface }]} />
      {matches.map((exercise) => (
        <Pressable key={exercise.id} onPress={() => { onPick(exercise); setQuery(''); }} style={[styles.pickItem, { backgroundColor: theme.colors.surfaceElevated }]}>
          <AppText variant="caption" weight="700">{exercise.nome}</AppText><AppText variant="caption" color={theme.colors.textMuted}>{exercise.grupo}</AppText>
        </Pressable>
      ))}
    </View>
  );
}

function ExercisesTab() {
  const theme = useAppTheme();
  const { draft, update, publish, publishing, dirty } = useContentDraft<WorkoutsContentDocument>('workouts');
  const [selected, setSelected] = useState<string | null>(null);
  if (!draft) return <Loading />;
  const exercises = draft.exercicios ?? [];
  const index = exercises.findIndex((exercise) => exercise.id === selected);
  const exercise = exercises[index];
  const set = (patch: Partial<WorkoutExerciseContent>): void => update((doc) => { const target = doc.exercicios[index]; if (target) Object.assign(target, patch); });
  return (
    <>
      <AppText variant="caption" color={theme.colors.textMuted}>Biblioteca de exercícios: instruções, erros comuns, alternativa aprovada e link do vídeo. São {exercises.length} exercícios.</AppText>
      <ExercisePicker exercises={exercises} placeholder="Buscar exercício para editar" onPick={(item) => setSelected(item.id)} />
      <AppButton label="+ Novo exercício" variant="secondary" onPress={() => { const id = uid('e'); update((doc) => { doc.exercicios = [...(doc.exercicios ?? []), { id, nome: 'Novo exercício', grupo: '', dicas: '', erros: '', alternativa: '', video: '', videoLink: '' }]; }); setSelected(id); }} />
      {exercise ? (
        <AppCard style={styles.card}>
          <Field label="Nome" value={exercise.nome} onChange={(nome) => set({ nome })} />
          <Field label="Grupo muscular" value={exercise.grupo} onChange={(grupo) => set({ grupo })} />
          <Field label="Link do vídeo demonstrativo" value={exercise.videoLink ?? ''} onChange={(videoLink) => set({ videoLink })} keyboardType="url" placeholder="https://" />
          <Field label="Instruções de execução" value={exercise.dicas ?? ''} onChange={(dicas) => set({ dicas })} multiline />
          <Field label="Erros comuns (separe com ponto e vírgula)" value={exercise.erros ?? ''} onChange={(erros) => set({ erros })} multiline />
          <AppText variant="caption" weight="600" color={theme.colors.textMuted}>Alternativa aprovada: {exercises.find((item) => item.id === exercise.alternativa)?.nome ?? 'nenhuma'}</AppText>
          <ExercisePicker exercises={exercises.filter((item) => item.id !== exercise.id)} placeholder="Buscar alternativa" onPick={(item) => set({ alternativa: item.id })} />
          {!!exercise.alternativa && <Pressable onPress={() => set({ alternativa: '' })}><AppText variant="caption" weight="700" color={theme.colors.danger}>Remover alternativa</AppText></Pressable>}
        </AppCard>
      ) : <AppText variant="caption" color={theme.colors.textMuted}>Busque um exercício pelo nome ou grupo para editar.</AppText>}
      <PublishBar dirty={dirty} publishing={publishing} onPublish={() => void publish()} />
    </>
  );
}

function ProgramsTab() {
  const theme = useAppTheme();
  const { draft, update, publish, publishing, dirty } = useContentDraft<WorkoutsContentDocument>('workouts');
  const [programId, setProgramId] = useState<string | null>(null);
  const [workoutId, setWorkoutId] = useState<string | null>(null);
  if (!draft) return <Loading />;
  const programs = draft.programas ?? [];
  const programIndex = Math.max(0, programs.findIndex((program) => program.id === programId));
  const program = programs[programIndex];
  const workouts = program?.treinos ?? [];
  const workoutIndex = Math.max(0, workouts.findIndex((workout) => workout.id === workoutId));
  const workout = workouts[workoutIndex];
  const names = new Map((draft.exercicios ?? []).map((exercise) => [exercise.id, exercise.nome]));
  const setWorkout = (mutate: (items: WorkoutItemContent[]) => WorkoutItemContent[]): void => update((doc) => { const target = doc.programas[programIndex]?.treinos[workoutIndex]; if (target) target.itens = mutate(target.itens ?? []); });
  const setItem = (index: number, patch: Partial<WorkoutItemContent>): void => setWorkout((items) => items.map((item, position) => (position === index ? { ...item, ...patch } : item)));
  const responsible = draft.responsavel ?? { nome: '', cref: '' };
  return (
    <>
      <AppCard style={styles.card}>
        <AppText weight="700">Profissional responsável pelos treinos</AppText>
        <AppText variant="caption" color={theme.colors.textMuted}>Aparece em todos os treinos: “Treino revisado e aprovado por”.</AppText>
        <Field label="Nome" value={responsible.nome ?? ''} onChange={(nome) => update((doc) => { doc.responsavel = { ...(doc.responsavel ?? { nome: '' }), nome }; })} />
        <Field label="CREF" value={responsible.cref ?? ''} onChange={(cref) => update((doc) => { doc.responsavel = { ...(doc.responsavel ?? { nome: '' }), cref }; })} placeholder="ex: 000000-G/SP" />
      </AppCard>
      <AppText variant="caption" weight="700" color={theme.colors.textMuted}>Programa</AppText>
      <Chips options={programs.map((item) => [item.id, item.nome])} selected={program ? [program.id] : []} onToggle={(id) => { setProgramId(id); setWorkoutId(null); }} />
      {program && <>
        <AppText variant="caption" weight="700" color={theme.colors.textMuted}>Treino</AppText>
        <Chips options={workouts.map((item) => [item.id, item.letra ? `Treino ${item.letra}` : item.nome])} selected={workout ? [workout.id] : []} onToggle={setWorkoutId} />
      </>}
      {workout && (
        <>
          <AppCard style={styles.card}>
            <Field label="Nome do treino" value={workout.nome} onChange={(nome) => update((doc) => { const target = doc.programas[programIndex]?.treinos[workoutIndex]; if (target) target.nome = nome; })} />
            <Field label="Foco" value={workout.foco} onChange={(foco) => update((doc) => { const target = doc.programas[programIndex]?.treinos[workoutIndex]; if (target) target.foco = foco; })} />
          </AppCard>
          {(workout.itens ?? []).map((item, index, items) => (
            <AppCard key={item.id} style={styles.card}>
              <AppText weight="700">{index + 1}. {names.get(item.exId) ?? 'Exercício'}</AppText>
              <View style={styles.row}>
                <View style={styles.flex}><Field label="Séries" value={String(item.series ?? '')} onChange={(value) => setItem(index, { series: Math.max(1, Number(value) || 1) })} keyboardType="number-pad" /></View>
                <View style={styles.flex}><Field label="Repetições" value={item.reps} onChange={(reps) => setItem(index, { reps })} /></View>
                <View style={styles.flex}><Field label="Descanso (s)" value={String(item.descanso ?? '')} onChange={(value) => setItem(index, { descanso: Math.max(0, Number(value) || 0) })} keyboardType="number-pad" /></View>
              </View>
              <Field label="Observação curta" value={item.obs ?? ''} onChange={(obs) => setItem(index, { obs })} />
              <Chips options={BLOCKS.map((block) => [block, block])} selected={[item.bloco ?? 'Principal']} onToggle={(bloco) => setItem(index, { bloco })} />
              <View style={styles.between}><AppText variant="caption" style={styles.flex}>Registra carga (kg)</AppText><Switch value={item.kg === true} onValueChange={(kg) => setItem(index, { kg })} /></View>
              <ExercisePicker exercises={draft.exercicios ?? []} placeholder="Trocar o exercício" onPick={(exercise) => setItem(index, { exId: exercise.id })} />
              <ItemActions index={index} count={items.length} onMove={(delta) => setWorkout((list) => move(list, index, delta))} onRemove={() => setWorkout((list) => list.filter((_, position) => position !== index))} />
            </AppCard>
          ))}
          <AppText variant="caption" weight="700" color={theme.colors.textMuted}>Adicionar exercício neste treino</AppText>
          <ExercisePicker exercises={draft.exercicios ?? []} placeholder="Buscar exercício" onPick={(exercise) => setWorkout((items) => [...items, { id: uid(`${workout.id}-`), exId: exercise.id, series: 3, reps: '12', carga: 0, descanso: 60, obs: '', bloco: 'Acessórios', kg: true }])} />
        </>
      )}
      <PublishBar dirty={dirty} publishing={publishing} onPublish={() => void publish()} />
    </>
  );
}

function RunningTab() {
  const theme = useAppTheme();
  const { draft, update, publish, publishing, dirty } = useContentDraft<GeneralContentDocument>('general');
  if (!draft) return <Loading />;
  const plans = draft.corrida ?? [];
  const setPlan = (index: number, patch: Partial<RunningPlanContent>): void => update((doc) => { const target = doc.corrida?.[index]; if (target) Object.assign(target, patch, { exemplo: false }); });
  return (
    <>
      <AppText variant="caption" color={theme.colors.textMuted}>Planilhas da equipe aparecem na aba Corrida, abaixo da planilha VEM. Uma etapa com data de liberação fica bloqueada até esse dia. Planilhas marcadas como exemplo não aparecem para as participantes.</AppText>
      {plans.map((plan, index) => (
        <AppCard key={plan.id} style={styles.card}>
          {plan.exemplo && <AppText variant="caption" weight="700" color={theme.colors.accent}>Exemplo (oculta até ser editada)</AppText>}
          <Field label="Título" value={plan.titulo} onChange={(titulo) => setPlan(index, { titulo })} />
          <Field label="Descrição" value={plan.descricao ?? ''} onChange={(descricao) => setPlan(index, { descricao })} multiline />
          {(plan.semanas ?? []).map((week, weekIndex, weeks) => (
            <View key={week.id} style={[styles.nested, { borderLeftColor: theme.colors.border }]}>
              <Field label="Etapa" value={week.titulo} onChange={(titulo) => update((doc) => { const target = doc.corrida?.[index]?.semanas[weekIndex]; if (target) target.titulo = titulo; })} />
              <Field label="O que fazer" value={week.texto} onChange={(texto) => update((doc) => { const target = doc.corrida?.[index]?.semanas[weekIndex]; if (target) target.texto = texto; })} multiline />
              <Field label="Libera em (AAAA-MM-DD, vazio = liberada)" value={week.liberaEm ?? ''} onChange={(liberaEm) => update((doc) => { const target = doc.corrida?.[index]?.semanas[weekIndex]; if (target) target.liberaEm = liberaEm; })} keyboardType="numbers-and-punctuation" />
              <ItemActions index={weekIndex} count={weeks.length} onMove={(delta) => update((doc) => { const target = doc.corrida?.[index]; if (target) target.semanas = move(target.semanas, weekIndex, delta); })} onRemove={() => update((doc) => { const target = doc.corrida?.[index]; if (target) target.semanas = target.semanas.filter((_, position) => position !== weekIndex); })} />
            </View>
          ))}
          <AppButton label="+ Adicionar etapa" variant="secondary" onPress={() => update((doc) => { const target = doc.corrida?.[index]; if (target) target.semanas = [...(target.semanas ?? []), { id: uid('s'), titulo: 'Semana', texto: '', liberaEm: todayKey() }]; })} />
          <ItemActions index={index} count={plans.length} onMove={(delta) => update((doc) => { doc.corrida = move(doc.corrida ?? [], index, delta); })} onRemove={() => update((doc) => { doc.corrida = (doc.corrida ?? []).filter((_, position) => position !== index); })} />
        </AppCard>
      ))}
      <AppButton label="+ Nova planilha" variant="secondary" onPress={() => update((doc) => { doc.corrida = [...(doc.corrida ?? []), { id: uid('c'), titulo: 'Nova planilha', descricao: '', semanas: [] }]; })} />
      <PublishBar dirty={dirty} publishing={publishing} onPublish={() => void publish()} />
    </>
  );
}

function MealPlansTab() {
  const theme = useAppTheme();
  const { draft, update, publish, publishing, dirty } = useContentDraft<MealPlansContentDocument>('meal_plans');
  if (!draft) return <Loading />;
  const responsible = draft.responsavel ?? { nome: '', crn: '' };
  return (
    <>
      <AppCard style={styles.card}>
        <AppText weight="700">Nutricionista responsável</AppText>
        <AppText variant="caption" color={theme.colors.textMuted}>Aparece em todos os cardápios: “Cardápios elaborados por”.</AppText>
        <Field label="Nome" value={responsible.nome ?? ''} onChange={(nome) => update((doc) => { doc.responsavel = { ...(doc.responsavel ?? { nome: '' }), nome }; })} />
        <Field label="CRN" value={responsible.crn ?? ''} onChange={(crn) => update((doc) => { doc.responsavel = { ...(doc.responsavel ?? { nome: '' }), crn }; })} placeholder="ex: CRN-3 00000" />
      </AppCard>
      <AppText variant="caption" color={theme.colors.textMuted}>Os 8 cardápios já estão no app. Aqui você ajusta a descrição de cada um. Para trocar as refeições, envie os PDFs novos para gerar uma nova versão do conteúdo.</AppText>
      {(draft.lista ?? []).map((plan, index) => (
        <AppCard key={plan.id} style={styles.card}>
          <AppText weight="700">{plan.kcal} kcal · {plan.tipo}</AppText>
          <Field label="Descrição" value={plan.intro ?? ''} onChange={(intro) => update((doc) => { const target = doc.lista[index]; if (target) target.intro = intro; })} multiline />
        </AppCard>
      ))}
      <PublishBar dirty={dirty} publishing={publishing} onPublish={() => void publish()} />
    </>
  );
}

const newMeeting = (): AdminMeeting => ({ id: `meeting-${Date.now()}`, date: todayKey(), time: '20:00', topic: '', responsible: '', joinUrl: '', recordingUrl: '', materials: '', durationMinutes: 60, type: 'weekly', active: true });

function AgendaTab({ data, onReload }: { data: AdministrationData; onReload: () => Promise<void> }) {
  const theme = useAppTheme();
  const [meeting, setMeeting] = useState<AdminMeeting>(newMeeting);
  const [settings, setSettings] = useState(data.settings);
  const [saving, setSaving] = useState(false);
  const duplicated = duplicatedMeetingWeeks(data.meetings);
  const run = async (action: () => Promise<void>, success: string): Promise<void> => {
    setSaving(true);
    try { await action(); await onReload(); Alert.alert('Salvo', success); }
    catch (error) { Alert.alert('Não foi possível salvar', error instanceof Error ? error.message : 'Tente novamente.'); }
    finally { setSaving(false); }
  };
  return (
    <>
      <AppCard style={styles.card}>
        <AppText weight="700">Link da call (Google Meet)</AppText>
        <AppText variant="caption" color={theme.colors.textMuted}>Aparece para todas no Início e na aba VEM. Encontros sem link próprio usam este.</AppText>
        <Field label="Link" value={settings.callUrl} onChange={(callUrl) => setSettings({ ...settings, callUrl })} keyboardType="url" placeholder="https://meet.google.com/..." />
        <Field label="Nome que aparece" value={settings.callTitle} onChange={(callTitle) => setSettings({ ...settings, callTitle })} placeholder="Call da VEM" />
        <Field label="Quando acontece" value={settings.callInfo} onChange={(callInfo) => setSettings({ ...settings, callInfo })} placeholder="ex: toda segunda, 20h" />
        <AppButton label="Salvar call" loading={saving} onPress={() => void run(() => saveVemSettings(settings), 'Call atualizada.')} />
      </AppCard>
      {!!duplicated.length && <AppCard style={[styles.card, { borderColor: theme.colors.danger }]}><AppText variant="caption"><AppText variant="caption" weight="700">Atenção:</AppText> há mais de um encontro ativo na semana de {duplicated.join(', ')}. A VEM tem um encontro por semana.</AppText></AppCard>}
      <AppCard style={styles.card}>
        <AppText weight="700">{data.meetings.some((item) => item.id === meeting.id) ? 'Editar encontro' : 'Novo encontro'}</AppText>
        <Field label="Tema" value={meeting.topic} onChange={(topic) => setMeeting({ ...meeting, topic })} />
        <View style={styles.row}>
          <View style={styles.flex}><Field label="Data (AAAA-MM-DD)" value={meeting.date} onChange={(date) => setMeeting({ ...meeting, date })} keyboardType="numbers-and-punctuation" /></View>
          <View style={styles.short}><Field label="Horário" value={meeting.time} onChange={(time) => setMeeting({ ...meeting, time })} keyboardType="numbers-and-punctuation" /></View>
          <View style={styles.short}><Field label="Duração (min)" value={String(meeting.durationMinutes)} onChange={(value) => setMeeting({ ...meeting, durationMinutes: Number(value) || 60 })} keyboardType="number-pad" /></View>
        </View>
        <Field label="Pessoa responsável" value={meeting.responsible} onChange={(responsible) => setMeeting({ ...meeting, responsible })} />
        <Chips options={[['weekly', 'Encontro semanal'], ['specialist', 'Com especialista']]} selected={[meeting.type]} onToggle={(type) => setMeeting({ ...meeting, type: type === 'specialist' ? 'specialist' : 'weekly' })} />
        <Field label="Link de participação" value={meeting.joinUrl} onChange={(joinUrl) => setMeeting({ ...meeting, joinUrl })} keyboardType="url" placeholder="https://" />
        <Field label="Link da gravação" value={meeting.recordingUrl} onChange={(recordingUrl) => setMeeting({ ...meeting, recordingUrl })} keyboardType="url" placeholder="https://" />
        <Field label="Materiais (link ou texto)" value={meeting.materials} onChange={(materials) => setMeeting({ ...meeting, materials })} />
        <View style={styles.between}><AppText style={styles.flex}>Ativo</AppText><Switch value={meeting.active} onValueChange={(active) => setMeeting({ ...meeting, active })} /></View>
        <AppButton label="Salvar encontro" loading={saving} disabled={!meeting.topic.trim()} onPress={() => void run(async () => { await saveMeeting(meeting); setMeeting(newMeeting()); }, 'Encontro atualizado.')} />
        {data.meetings.some((item) => item.id === meeting.id) && <AppButton label="Cancelar edição" variant="ghost" onPress={() => setMeeting(newMeeting())} />}
      </AppCard>
      {data.meetings.map((item) => (
        <AppCard key={item.id} style={styles.listItem}>
          <View style={styles.flex}>
            <AppText weight="700">{item.topic}</AppText>
            <AppText variant="caption" color={theme.colors.textMuted}>{item.date} · {item.time || 'sem horário'} · {item.type === 'specialist' ? 'especialista' : 'semanal'} · {item.active ? 'ativo' : 'inativo'}{item.recordingUrl ? ' · com gravação' : ''}</AppText>
          </View>
          <Pressable onPress={() => setMeeting(item)} style={styles.action}><AppText variant="caption" weight="700" color={theme.colors.primary}>Editar</AppText></Pressable>
          <Pressable onPress={() => Alert.alert('Apagar este encontro?', item.topic, [{ text: 'Voltar', style: 'cancel' }, { text: 'Apagar', style: 'destructive', onPress: () => void run(() => deleteMeeting(item.id), 'Encontro apagado.') }])} style={styles.action}>
            <AppText variant="caption" weight="700" color={theme.colors.danger}>Apagar</AppText>
          </Pressable>
        </AppCard>
      ))}
      <EventsSection />
    </>
  );
}

function EventsSection() {
  const theme = useAppTheme();
  const { draft, update, publish, publishing, dirty } = useContentDraft<AgendaDocument>('agenda');
  if (!draft) return <Loading />;
  const events = draft.eventos ?? [];
  const set = (index: number, patch: Partial<NonNullable<AgendaDocument['eventos']>[number]>): void => update((doc) => { const target = doc.eventos?.[index]; if (target) Object.assign(target, patch); });
  return (
    <>
      <AppText weight="700">Outras datas do calendário</AppText>
      <AppText variant="caption" color={theme.colors.textMuted}>Eventos que não são o encontro da semana (aulão, desafio, live). Aparecem em “Outras datas” na aba VEM até o dia passar.</AppText>
      {events.map((event, index) => (
        <AppCard key={event.id} style={styles.card}>
          <Field label="Título" value={event.titulo} onChange={(titulo) => set(index, { titulo })} />
          <View style={styles.row}>
            <View style={styles.flex}><Field label="Data (AAAA-MM-DD)" value={event.data} onChange={(data) => set(index, { data })} keyboardType="numbers-and-punctuation" /></View>
            <View style={styles.short}><Field label="Horário" value={event.hora ?? ''} onChange={(hora) => set(index, { hora })} keyboardType="numbers-and-punctuation" /></View>
          </View>
          <Field label="Local ou formato" value={event.local ?? ''} onChange={(local) => set(index, { local })} placeholder="ex: online, parque Ibirapuera" />
          <ItemActions index={index} count={events.length} onMove={(delta) => update((doc) => { doc.eventos = move(doc.eventos ?? [], index, delta); })} onRemove={() => update((doc) => { doc.eventos = (doc.eventos ?? []).filter((_, position) => position !== index); })} />
        </AppCard>
      ))}
      <AppButton label="+ Nova data" variant="secondary" onPress={() => update((doc) => { doc.eventos = [...(doc.eventos ?? []), { id: uid('ev'), data: todayKey(), hora: '', titulo: 'Novo evento', local: '' }]; })} />
      <PublishBar dirty={dirty} publishing={publishing} onPublish={() => void publish()} />
    </>
  );
}

function CourseAdminTab() {
  const theme = useAppTheme();
  const { draft, update, publish, publishing, dirty } = useContentDraft<CourseContentDocument>('course');
  if (!draft) return <Loading />;
  const modules = draft.modulos ?? [];
  const setLesson = (moduleIndex: number, lessonIndex: number, patch: Partial<CourseLessonContent>): void => update((doc) => {
    const module = doc.modulos?.[moduleIndex];
    const lesson = module?.aulas[lessonIndex];
    if (module && lesson) { Object.assign(lesson, patch); module.exemplo = false; }
  });
  const invalid = modules.some((module) => (module.aulas ?? []).some((lesson) => [lesson.videoLink, lesson.pdf].some((url) => !!url && !LINK.test(url))));
  return (
    <>
      <Field label="Nome do curso" value={draft.titulo ?? ''} onChange={(titulo) => update((doc) => { doc.titulo = titulo; })} />
      <Field label="Subtítulo" value={draft.subtitulo ?? ''} onChange={(subtitulo) => update((doc) => { doc.subtitulo = subtitulo; })} />
      <AppText variant="caption" color={theme.colors.textMuted}>Módulos marcados como exemplo aparecem com a etiqueta “exemplo” até serem editados. Vídeos e PDFs entram por link (YouTube, Vimeo, Drive).</AppText>
      {modules.map((module, moduleIndex) => (
        <AppCard key={module.id} style={styles.card}>
          {module.exemplo && <AppText variant="caption" weight="700" color={theme.colors.accent}>Exemplo</AppText>}
          <Field label="Título do módulo" value={module.titulo} onChange={(titulo) => update((doc) => { const target = doc.modulos?.[moduleIndex]; if (target) { target.titulo = titulo; target.exemplo = false; } })} />
          <Field label="Descrição" value={module.descricao ?? ''} onChange={(descricao) => update((doc) => { const target = doc.modulos?.[moduleIndex]; if (target) { target.descricao = descricao; target.exemplo = false; } })} multiline />
          {(module.aulas ?? []).map((lesson, lessonIndex, lessons) => (
            <View key={lesson.id} style={[styles.nested, { borderLeftColor: theme.colors.border }]}>
              <Field label="Aula" value={lesson.titulo} onChange={(titulo) => setLesson(moduleIndex, lessonIndex, { titulo })} />
              <Field label="Duração" value={lesson.duracao ?? ''} onChange={(duracao) => setLesson(moduleIndex, lessonIndex, { duracao })} placeholder="12 min" />
              <Field label="Link da videoaula" value={lesson.videoLink ?? ''} onChange={(videoLink) => setLesson(moduleIndex, lessonIndex, { videoLink })} keyboardType="url" placeholder="https://" />
              <Field label="Link do material (PDF)" value={lesson.pdf ?? ''} onChange={(pdf) => setLesson(moduleIndex, lessonIndex, { pdf })} keyboardType="url" placeholder="https://" />
              <Field label="Nome do material" value={lesson.pdfNome ?? ''} onChange={(pdfNome) => setLesson(moduleIndex, lessonIndex, { pdfNome })} />
              <Field label="Atividade prática" value={lesson.atividade ?? ''} onChange={(atividade) => setLesson(moduleIndex, lessonIndex, { atividade })} multiline />
              <ItemActions index={lessonIndex} count={lessons.length} onMove={(delta) => update((doc) => { const target = doc.modulos?.[moduleIndex]; if (target) target.aulas = move(target.aulas, lessonIndex, delta); })} onRemove={() => update((doc) => { const target = doc.modulos?.[moduleIndex]; if (target) target.aulas = target.aulas.filter((_, position) => position !== lessonIndex); })} />
            </View>
          ))}
          <AppButton label="+ Adicionar aula" variant="secondary" onPress={() => update((doc) => { const target = doc.modulos?.[moduleIndex]; if (target) target.aulas = [...(target.aulas ?? []), { id: uid('a'), titulo: 'Nova aula', duracao: '', video: '', videoLink: '', pdf: '', pdfNome: '', atividade: '' }]; })} />
          <ItemActions index={moduleIndex} count={modules.length} onMove={(delta) => update((doc) => { doc.modulos = move(doc.modulos ?? [], moduleIndex, delta); })} onRemove={() => update((doc) => { doc.modulos = (doc.modulos ?? []).filter((_, position) => position !== moduleIndex); })} />
        </AppCard>
      ))}
      <AppButton label="+ Novo módulo" variant="secondary" onPress={() => update((doc) => { doc.modulos = [...(doc.modulos ?? []), { id: uid('m'), titulo: 'Novo módulo', descricao: '', aulas: [] }]; })} />
      {invalid && <AppText variant="caption" color={theme.colors.danger}>Há links que não começam com https://. Eles não vão abrir no app.</AppText>}
      <PublishBar dirty={dirty} publishing={publishing} onPublish={() => void publish()} />
    </>
  );
}

function MaterialsTab() {
  const theme = useAppTheme();
  const { draft, update, publish, publishing, dirty } = useContentDraft<GeneralContentDocument>('general');
  if (!draft) return <Loading />;
  const materials = draft.alimentacao ?? [];
  const set = (index: number, patch: Partial<NonNullable<GeneralContentDocument['alimentacao']>[number]>): void => update((doc) => { const target = doc.alimentacao?.[index]; if (target) Object.assign(target, patch, { exemplo: false }); });
  return (
    <>
      <AppText variant="caption" color={theme.colors.textMuted}>Materiais de apoio que aparecem em “Materiais” na aba VEM. Os materiais dos encontros entram sozinhos, pelo campo Materiais de cada encontro.</AppText>
      {materials.map((material, index) => (
        <AppCard key={material.id} style={styles.card}>
          {material.exemplo && <AppText variant="caption" weight="700" color={theme.colors.accent}>Exemplo</AppText>}
          <Field label="Título" value={material.titulo} onChange={(titulo) => set(index, { titulo })} />
          <Field label="Texto" value={material.texto} onChange={(texto) => set(index, { texto })} multiline />
          <Field label="Link do material (PDF)" value={material.pdf ?? ''} onChange={(pdf) => set(index, { pdf })} keyboardType="url" placeholder="https://" />
          <Field label="Nome do material" value={material.pdfNome ?? ''} onChange={(pdfNome) => set(index, { pdfNome })} />
          {!!material.pdf && !LINK.test(material.pdf) && <AppText variant="caption" color={theme.colors.danger}>O link precisa começar com https://</AppText>}
          <ItemActions index={index} count={materials.length} onMove={(delta) => update((doc) => { doc.alimentacao = move(doc.alimentacao ?? [], index, delta); })} onRemove={() => update((doc) => { doc.alimentacao = (doc.alimentacao ?? []).filter((_, position) => position !== index); })} />
        </AppCard>
      ))}
      <AppButton label="+ Novo material" variant="secondary" onPress={() => update((doc) => { doc.alimentacao = [...(doc.alimentacao ?? []), { id: uid('n'), titulo: 'Novo material', texto: '', pdf: '', pdfNome: '' }]; })} />
      <PublishBar dirty={dirty} publishing={publishing} onPublish={() => void publish()} />
    </>
  );
}


function TeamRemindersTab() {
  const theme = useAppTheme();
  const { draft, update, publish, publishing, dirty } = useContentDraft<GeneralContentDocument>('general');
  if (!draft) return <Loading />;
  const reminders = draft.lembretes ?? [];
  const set = (index: number, patch: Partial<TeamReminderContent>): void => update((doc) => { const target = doc.lembretes?.[index]; if (target) Object.assign(target, patch); });
  return (
    <>
      <AppText variant="caption" color={theme.colors.textMuted}>Lembretes para todas as participantes: aparecem na agenda do Início e como notificação no celular. Cada uma pode desligar os que não quiser.</AppText>
      {reminders.map((reminder, index) => (
        <AppCard key={reminder.id} style={styles.card}>
          <Field label="Lembrete" value={reminder.titulo} onChange={(titulo) => set(index, { titulo })} placeholder="ex: Beber água" />
          <Chips options={REMINDER_TYPES} selected={[reminder.tipo]} onToggle={(tipo) => set(index, { tipo })} />
          <View style={styles.row}>
            <View style={styles.short}><Field label="Horário" value={reminder.hora ?? ''} onChange={(hora) => set(index, { hora })} keyboardType="numbers-and-punctuation" placeholder="10:00" /></View>
            <View style={styles.flex}><Field label="Observação" value={reminder.nota ?? ''} onChange={(nota) => set(index, { nota })} /></View>
          </View>
          <AppText variant="caption" color={theme.colors.textMuted}>Dias (nenhum = todo dia)</AppText>
          <Chips options={DAYS} selected={reminder.dias ?? []} onToggle={(day) => set(index, { dias: (reminder.dias ?? []).includes(day) ? (reminder.dias ?? []).filter((item) => item !== day) : [...(reminder.dias ?? []), day] })} />
          <ItemActions index={index} count={reminders.length} onMove={(delta) => update((doc) => { doc.lembretes = move(doc.lembretes ?? [], index, delta); })} onRemove={() => update((doc) => { doc.lembretes = (doc.lembretes ?? []).filter((_, position) => position !== index); })} />
        </AppCard>
      ))}
      <AppButton label="+ Novo lembrete" variant="secondary" onPress={() => update((doc) => { doc.lembretes = [...(doc.lembretes ?? []), { id: uid('l'), titulo: 'Novo lembrete', tipo: 'agua', hora: '10:00', dias: [], nota: '' }]; })} />
      <PublishBar dirty={dirty} publishing={publishing} onPublish={() => void publish()} />
    </>
  );
}

function NoticesTab() {
  const theme = useAppTheme();
  const { draft, update, publish, publishing, dirty } = useContentDraft<GeneralContentDocument>('general');
  if (!draft) return <Loading />;
  const phrases = draft.frases ?? [];
  return (
    <>
      <AppCard style={styles.card}>
        <AppText weight="700">Lembrete importante</AppText>
        <AppText variant="caption" color={theme.colors.textMuted}>Aparece no Início até a participante dispensar.</AppText>
        <Field label="Texto do aviso" value={draft.aviso?.texto ?? ''} onChange={(texto) => update((doc) => { doc.aviso = { id: uid('a'), texto, exemplo: false }; })} multiline />
        <Field label="Meta semanal padrão (quando o programa não define)" value={String(draft.metaSemanalPadrao ?? 3)} onChange={(value) => update((doc) => { doc.metaSemanalPadrao = Math.min(4, Math.max(2, Number(value) || 3)); })} keyboardType="number-pad" />
      </AppCard>
      <AppText weight="700">Frase do dia</AppText>
      <AppText variant="caption" color={theme.colors.textMuted}>{phrases.filter((item) => !item.data).length >= 3 ? 'O app faz rodízio entre as frases sem dia fixo.' : 'Com menos de 3 frases sem dia fixo, o app usa as frases da VEM.'} Frase com dia fixo aparece só naquele dia.</AppText>
      {phrases.map((phrase, index) => (
        <AppCard key={phrase.id} style={styles.card}>
          <Field label="Frase" value={phrase.texto} onChange={(texto) => update((doc) => { const target = doc.frases?.[index]; if (target) target.texto = texto; })} multiline />
          <Field label="Dia fixo (AAAA-MM-DD, opcional)" value={phrase.data ?? ''} onChange={(data) => update((doc) => { const target = doc.frases?.[index]; if (target) target.data = data; })} keyboardType="numbers-and-punctuation" />
          <ItemActions index={index} count={phrases.length} onMove={(delta) => update((doc) => { doc.frases = move(doc.frases ?? [], index, delta); })} onRemove={() => update((doc) => { doc.frases = (doc.frases ?? []).filter((_, position) => position !== index); })} />
        </AppCard>
      ))}
      <AppButton label="+ Nova frase" variant="secondary" onPress={() => update((doc) => { doc.frases = [...(doc.frases ?? []), { id: uid('f'), texto: '', data: '' }]; })} />
      <PublishBar dirty={dirty} publishing={publishing} onPublish={() => void publish()} />
    </>
  );
}

const newReward = (): AdminReward => ({ id: `reward-${Date.now()}`, name: '', description: '', metric: 'workouts', target: 1, active: true });

function RewardsTab({ data, onReload }: { data: AdministrationData; onReload: () => Promise<void> }) {
  const theme = useAppTheme();
  const [reward, setReward] = useState<AdminReward>(newReward);
  const [saving, setSaving] = useState(false);
  const save = async (): Promise<void> => {
    setSaving(true);
    try { await saveReward(reward, data.rewards.findIndex((item) => item.id === reward.id) + 1 || data.rewards.length + 1); setReward(newReward()); await onReload(); }
    catch (error) { Alert.alert('Não foi possível salvar', error instanceof Error ? error.message : 'Tente novamente.'); }
    finally { setSaving(false); }
  };
  return (
    <>
      <AppCard style={styles.card}>
        <AppText weight="700">Recompensa</AppText>
        <Field label="Nome" value={reward.name} onChange={(name) => setReward({ ...reward, name })} />
        <Field label="Descrição" value={reward.description} onChange={(description) => setReward({ ...reward, description })} />
        <Chips options={[['workouts', 'Treinos'], ['streak', 'Sequência'], ['habits', 'Hábitos']]} selected={[reward.metric]} onToggle={(metric) => setReward({ ...reward, metric: metric as AdminReward['metric'] })} />
        <Field label="Libera com" value={String(reward.target)} onChange={(value) => setReward({ ...reward, target: Math.max(1, Number(value) || 1) })} keyboardType="number-pad" />
        <View style={styles.between}><AppText style={styles.flex}>Ativa</AppText><Switch value={reward.active} onValueChange={(active) => setReward({ ...reward, active })} /></View>
        <AppButton label="Salvar recompensa" loading={saving} disabled={!reward.name.trim()} onPress={() => void save()} />
      </AppCard>
      {data.rewards.map((item) => (
        <AppCard key={item.id} style={styles.listItem}>
          <View style={styles.flex}><AppText weight="700">{item.name}</AppText><AppText variant="caption" color={theme.colors.textMuted}>Meta {item.target} · {item.active ? 'ativa' : 'inativa'}</AppText></View>
          <Pressable onPress={() => setReward(item)} style={styles.action}><AppText variant="caption" weight="700" color={theme.colors.primary}>Editar</AppText></Pressable>
        </AppCard>
      ))}
    </>
  );
}

export function AdminContentScreen() {
  const theme = useAppTheme();
  const [tab, setTab] = useState<Tab>('indicadores');
  const [data, setData] = useState<AdministrationData | null>(null);
  const load = useCallback(async (): Promise<void> => {
    try { setData(await loadAdministration()); }
    catch (error) { Alert.alert('Não foi possível carregar', error instanceof Error ? error.message : 'Confira sua conexão.'); }
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.background }]} edges={['left', 'right', 'bottom']}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsScroll} contentContainerStyle={[styles.tabs, { borderBottomColor: theme.colors.border }]}>
        {TABS.map(([key, label]) => (
          <Pressable key={key} accessibilityRole="tab" accessibilityState={{ selected: tab === key }} onPress={() => setTab(key)} style={[styles.tab, tab === key && { borderBottomColor: theme.colors.text }]}>
            <AppText weight="600" color={tab === key ? theme.colors.text : theme.colors.textMuted}>{label}</AppText>
          </Pressable>
        ))}
      </ScrollView>
      <FormScrollView bottomOffset={32} contentContainerStyle={styles.content}>
        {tab === 'indicadores' && <IndicatorsTab />}
        {tab === 'exercicios' && <ExercisesTab />}
        {tab === 'treinos' && <ProgramsTab />}
        {tab === 'corrida' && <RunningTab />}
        {tab === 'cardapios' && <MealPlansTab />}
        {tab === 'agenda' && (data ? <AgendaTab key={data.settings.callUrl} data={data} onReload={load} /> : <Loading />)}
        {tab === 'curso' && <CourseAdminTab />}
        {tab === 'materiais' && <MaterialsTab />}
        {tab === 'lembretes' && <TeamRemindersTab />}
        {tab === 'avisos' && <NoticesTab />}
        {tab === 'premios' && (data ? <RewardsTab data={data} onReload={load} /> : <Loading />)}
      </FormScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  tabsScroll: { flexGrow: 0 },
  tabs: { gap: 20, paddingHorizontal: 16, borderBottomWidth: 1 },
  tab: { paddingVertical: 10, minHeight: 44, justifyContent: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent', marginBottom: -1 },
  content: { padding: 16, gap: 12, paddingBottom: 48 },
  card: { gap: 10 },
  flex: { flex: 1 },
  row: { flexDirection: 'row', gap: 8 },
  short: { width: 92 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  field: { gap: 4 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 11, paddingVertical: 10, fontSize: 16 },
  multiline: { minHeight: 76, textAlignVertical: 'top' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, minHeight: 36, justifyContent: 'center' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  action: { paddingHorizontal: 8, paddingVertical: 6 },
  pickItem: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  nested: { borderLeftWidth: 2, paddingLeft: 10, gap: 8 },
  publish: { gap: 6, marginTop: 4 },
  listItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: { width: '48%', flexGrow: 1, gap: 2 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 116 },
  barCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
  bar: { width: '100%', maxWidth: 28, borderTopLeftRadius: 6, borderTopRightRadius: 6 },
});
