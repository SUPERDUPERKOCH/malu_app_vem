import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Alert, BackHandler, Image, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import { AppButton, AppCard, AppText, VemIcon } from '../components';
import {
  FOOD_REFERENCES,
  MEAL_REFS,
  chooseMealOption,
  dateKey,
  deleteFoodEntry,
  loadCalorieCalendar,
  loadNutritionDashboard,
  preparePhoto,
  saveFoodEntry,
  setCalorieGoal,
  toggleMealDone,
  type CalorieDay,
  type FoodEntry,
  type FoodSource,
  type MealPlan,
  type MealProfessional,
  type NutritionDashboard,
  type PreparedPhoto,
} from '../services/nutrition';
import { useAppTheme } from '../theme';

type Tab = 'diario' | 'cardapio';
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const WEEK_HEADER = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'];
const BLOCKED_TEXT = 'Pela sua resposta de saúde no quiz, a alimentação precisa ser orientada por uma nutricionista que conheça o seu caso. Um cardápio padrão pode não ser seguro pra você.';

const formatNumber = (value: number): string => value.toLocaleString('pt-BR');
const mealLabel = (ref: string): string => MEAL_REFS.find((meal) => meal.id === ref)?.label ?? 'Outra refeição';
const parseDate = (key: string): Date => { const [y, m, d] = key.split('-').map(Number); return new Date(y ?? 2026, (m ?? 1) - 1, d ?? 1); };
const nowTime = (): string => { const now = new Date(); return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`; };
const normalize = (text: string): string => text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

function dayTitle(key: string): string {
  if (key === dateKey()) return 'Hoje';
  return new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).format(parseDate(key));
}

/** Refeição mais próxima do horário atual, como no esboço. */
function mealByTime(times: Record<string, string>): string {
  const now = new Date(); const minutes = now.getHours() * 60 + now.getMinutes();
  let best: string = 'lanche'; let distance = Number.POSITIVE_INFINITY;
  for (const meal of MEAL_REFS) {
    const [h, m] = (times[meal.id] ?? meal.defaultTime).split(':').map(Number);
    if (h === undefined || m === undefined || Number.isNaN(h) || Number.isNaN(m)) continue;
    const diff = Math.abs(h * 60 + m - minutes);
    if (diff < distance) { distance = diff; best = meal.id; }
  }
  return best;
}

function ResponsibleLine({ responsible }: { responsible: MealProfessional }) {
  const theme = useAppTheme();
  const registry = responsible.registry ? (/^crn/i.test(responsible.registry) ? responsible.registry : `CRN ${responsible.registry}`) : 'CRN ________';
  return (
    <View style={[styles.responsible, { borderTopColor: theme.colors.border }]}>
      <AppText variant="caption" color={theme.colors.textMuted}>
        Cardápios elaborados por <AppText variant="caption" weight="700">{responsible.name || '____________'}</AppText> · {registry}
      </AppText>
    </View>
  );
}

function Collapsible({ title, children }: { title: string; children: ReactNode }) {
  const theme = useAppTheme();
  const [open, setOpen] = useState(false);
  return (
    <AppCard style={styles.mx}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen((value) => !value)} style={styles.collapseHead}>
        <AppText weight="700" style={styles.flex}>{title}</AppText>
        <View style={{ transform: [{ rotate: open ? '90deg' : '0deg' }] }}><VemIcon name="chevronRight" size={16} color={theme.colors.textMuted} /></View>
      </Pressable>
      {open && <View style={styles.collapseBody}>{children}</View>}
    </AppCard>
  );
}

function CalorieCalendar({
  month,
  selected,
  days,
  goal,
  colored,
  onSelect,
  onMonth,
}: {
  month: string;
  selected: string;
  days: Record<string, CalorieDay>;
  goal: number;
  colored: boolean;
  onSelect: (date: string) => void;
  onMonth: (month: string) => void;
}) {
  const theme = useAppTheme();
  const today = dateKey();
  const [year, monthNumber] = month.split('-').map(Number) as [number, number];
  const first = new Date(year, monthNumber - 1, 1);
  const count = new Date(year, monthNumber, 0).getDate();
  const offset = (first.getDay() + 6) % 7;
  const cells: Array<string | null> = [...Array.from({ length: offset }, () => null), ...Array.from({ length: count }, (_, index) => dateKey(new Date(year, monthNumber - 1, index + 1)))];
  while (cells.length % 7) cells.push(null);
  const weeks = Array.from({ length: cells.length / 7 }, (_, index) => cells.slice(index * 7, index * 7 + 7));
  const shift = (delta: number): string => dateKey(new Date(year, monthNumber - 1 + delta, 1)).slice(0, 7);
  const levelColor = (calories: number): string | undefined => {
    if (!calories || !colored) return undefined;
    if (calories > goal * 1.1) return `${theme.colors.secondary}38`;
    if (calories >= goal * 0.8) return `${theme.colors.success}24`;
    return `${theme.colors.accent}2E`;
  };
  return (
    <AppCard style={[styles.mx, styles.calendar]}>
      <View style={styles.calendarTop}>
        <Pressable accessibilityRole="button" accessibilityLabel="Mês anterior" onPress={() => onMonth(shift(-1))} style={[styles.monthButton, { borderColor: theme.colors.border }]}><AppText variant="subtitle">‹</AppText></Pressable>
        <AppText weight="700">{MONTHS[monthNumber - 1]?.replace(/^./, (c) => c.toUpperCase())} {year}</AppText>
        <Pressable accessibilityRole="button" accessibilityLabel="Próximo mês" disabled={month >= today.slice(0, 7)} onPress={() => onMonth(shift(1))} style={[styles.monthButton, { borderColor: theme.colors.border, opacity: month >= today.slice(0, 7) ? 0.35 : 1 }]}><AppText variant="subtitle">›</AppText></Pressable>
      </View>
      <View style={styles.calendarRow}>{WEEK_HEADER.map((label, index) => <AppText key={`${label}-${index}`} variant="caption" weight="700" color={theme.colors.textMuted} style={styles.calendarHead}>{label}</AppText>)}</View>
      {weeks.map((week, row) => (
        <View key={`w-${row}`} style={styles.calendarRow}>
          {week.map((key, column) => {
            if (!key) return <View key={`e-${row}-${column}`} style={styles.calendarCell} />;
            const info = days[key];
            const future = key > today;
            const isSelected = key === selected;
            return (
              <Pressable
                key={key}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected, disabled: future }}
                accessibilityLabel={`${parseDate(key).getDate()} de ${MONTHS[monthNumber - 1]}${info?.calories ? `, ${info.calories} kcal` : ''}`}
                disabled={future}
                onPress={() => onSelect(key)}
                style={[
                  styles.calendarCell,
                  styles.calendarDay,
                  { backgroundColor: levelColor(info?.calories ?? 0) ?? theme.colors.surfaceElevated, opacity: future ? 0.35 : 1 },
                  isSelected && { borderColor: theme.colors.text, borderWidth: 2 },
                ]}
              >
                <AppText variant="caption" weight="700" color={key === today ? theme.colors.primary : theme.colors.text} style={key === today ? styles.underline : undefined}>{parseDate(key).getDate()}</AppText>
                <AppText style={styles.calendarKcal} color={theme.colors.textMuted} numberOfLines={1}>{info?.calories ? formatNumber(info.calories) : ' '}</AppText>
                {info?.hasPhoto && <View style={[styles.photoDot, { backgroundColor: theme.colors.accent }]} />}
              </Pressable>
            );
          })}
        </View>
      ))}
      <AppText variant="caption" color={theme.colors.textMuted}>Toque num dia pra ver o que você comeu e quantas calorias somou.</AppText>
      {colored && (
        <View style={styles.legend}>
          {[[`${theme.colors.success}55`, 'na meta'], [`${theme.colors.accent}66`, 'abaixo'], [`${theme.colors.secondary}77`, 'acima']].map(([color, label]) => (
            <View key={label} style={styles.legendItem}><View style={[styles.legendSwatch, { backgroundColor: color }]} /><AppText variant="caption" color={theme.colors.textMuted}>{label}</AppText></View>
          ))}
          <View style={styles.legendItem}><View style={[styles.photoDotStatic, { backgroundColor: theme.colors.accent }]} /><AppText variant="caption" color={theme.colors.textMuted}>tem foto</AppText></View>
        </View>
      )}
    </AppCard>
  );
}

function FoodEntryEditor({
  date,
  entry,
  initialRef,
  plan,
  times,
  onClose,
  onSaved,
}: {
  date: string;
  entry: FoodEntry | null;
  initialRef: string;
  plan: MealPlan | null;
  times: Record<string, string>;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const theme = useAppTheme();
  const [ref, setRef] = useState(entry?.ref ?? initialRef);
  const [time, setTime] = useState(entry?.hora ?? (date === dateKey() ? nowTime() : times[initialRef] ?? ''));
  const [description, setDescription] = useState(entry?.desc ?? '');
  const [calories, setCalories] = useState(entry ? String(entry.kcal) : '');
  const [source, setSource] = useState<FoodSource>(entry?.fonte ?? 'manual');
  const [photo, setPhoto] = useState<PreparedPhoto | null | undefined>(undefined);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [preparing, setPreparing] = useState(false);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => { onClose(); return true; });
    return () => subscription.remove();
  }, [onClose]);

  const photoUri = photo ? photo.uri : photo === null ? undefined : entry?.photoUrl;
  const menuMeal = plan?.refeicoes.find((meal) => meal.id === ref);
  const query = normalize(search.trim());
  const foods = FOOD_REFERENCES.filter(([name]) => !query || normalize(name).includes(query));
  const caloriesValue = (): number => Math.max(0, Math.round(Number(calories.replace(',', '.')) || 0));

  const pickPhoto = async (camera: boolean): Promise<void> => {
    try {
      if (camera) {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) { Alert.alert('Permissão necessária', 'Libere o acesso à câmera nas configurações do celular para fotografar o prato.'); return; }
      }
      const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1 };
      const result = camera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
      const asset = result.canceled ? undefined : result.assets[0];
      if (!asset) return;
      setPreparing(true);
      setPhoto(await preparePhoto(asset.uri, asset.width, asset.height));
    } catch (error) {
      Alert.alert('Não consegui abrir essa foto', error instanceof Error ? error.message : 'Tente outra imagem.');
    } finally {
      setPreparing(false);
    }
  };

  const addFood = (name: string, kcal: number): void => {
    const clean = name.replace(/\s*\(.*\)$/, '');
    setCalories(String(caloriesValue() + kcal));
    setDescription((current) => (current.trim() ? `${current.trim().replace(/[,.]$/, '')}, ${clean.toLowerCase()}` : clean));
  };

  const save = async (): Promise<void> => {
    if (!description.trim() && !caloriesValue() && !photoUri) {
      Alert.alert('Falta pouco', 'Adicione uma foto, o que comeu ou as calorias.');
      return;
    }
    if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
      Alert.alert('Confira o horário', 'Use o formato 12:30.');
      return;
    }
    setBusy(true);
    try {
      await saveFoodEntry({ date, ...(entry ? { previous: entry } : {}), ref, time, description, calories: caloriesValue(), source, ...(photo !== undefined ? { photo } : {}) });
      await onSaved();
    } catch (error) {
      Alert.alert('Não foi possível salvar', error instanceof Error ? error.message : 'Tente novamente em instantes.');
      setBusy(false);
    }
  };

  const remove = (): void => {
    if (!entry) return;
    Alert.alert('Apagar esta refeição?', 'A foto e as calorias deste registro serão apagadas.', [
      { text: 'Voltar', style: 'cancel' },
      {
        text: 'Apagar', style: 'destructive', onPress: async () => {
          setBusy(true);
          try { await deleteFoodEntry(entry); await onSaved(); }
          catch (error) { Alert.alert('Não foi possível apagar', error instanceof Error ? error.message : 'Tente novamente.'); setBusy(false); }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.background }]} edges={['top', 'left', 'right']}>
      <StatusBar style={theme.isDark ? 'light' : 'dark'} />
      <ScrollView automaticallyAdjustKeyboardInsets contentContainerStyle={styles.sheet} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.sheetTop}>
          <Pressable accessibilityRole="button" accessibilityLabel="Voltar" onPress={onClose} style={[styles.backButton, { backgroundColor: theme.colors.surfaceElevated }]}><AppText variant="subtitle" weight="700">‹</AppText></Pressable>
          <View style={styles.flex}>
            <AppText variant="caption" color={theme.colors.textMuted} weight="700">{dayTitle(date)}</AppText>
            <AppText variant="subtitle" weight="700">{entry ? 'Editar refeição' : 'Nova refeição'}</AppText>
          </View>
        </View>

        <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="Refeição">
          {MEAL_REFS.map((meal) => {
            const selected = ref === meal.id;
            return (
              <Pressable key={meal.id} accessibilityRole="radio" accessibilityState={{ checked: selected }} onPress={() => setRef(meal.id)} style={[styles.chip, { borderColor: selected ? theme.colors.text : theme.colors.border, backgroundColor: selected ? theme.colors.text : 'transparent' }]}>
                <AppText variant="caption" weight="600" color={selected ? theme.colors.background : theme.colors.text}>{meal.label}</AppText>
              </Pressable>
            );
          })}
        </View>

        <View style={[styles.photoBox, { backgroundColor: theme.colors.surfaceElevated, borderColor: theme.colors.border }]}>
          {photoUri ? <Image source={{ uri: photoUri }} style={styles.photo} resizeMode="cover" accessibilityLabel="Foto do prato" /> : (
            <View style={styles.photoEmpty}><VemIcon name="nutrition" size={28} color={theme.colors.textMuted} /><AppText variant="caption" color={theme.colors.textMuted}>Tire uma foto do prato ou escolha da galeria</AppText></View>
          )}
        </View>
        <View style={styles.row}>
          <AppButton label="Câmera" variant="secondary" loading={preparing} style={styles.flex} onPress={() => void pickPhoto(true)} />
          <AppButton label="Galeria" variant="secondary" disabled={preparing} style={styles.flex} onPress={() => void pickPhoto(false)} />
        </View>
        {!!photoUri && <Pressable onPress={() => setPhoto(null)} style={styles.linkButton}><AppText variant="caption" weight="700" color={theme.colors.danger}>Remover foto</AppText></Pressable>}

        <View style={styles.row}>
          <View style={styles.flex}>
            <AppText variant="caption" weight="600" color={theme.colors.textMuted}>Horário</AppText>
            <TextInput value={time} onChangeText={setTime} placeholder="12:30" keyboardType="numbers-and-punctuation" maxLength={5} placeholderTextColor={theme.colors.textMuted} style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface }]} />
          </View>
          <View style={styles.flex}>
            <AppText variant="caption" weight="600" color={theme.colors.textMuted}>Calorias (kcal)</AppText>
            <TextInput value={calories} onChangeText={setCalories} placeholder="0" keyboardType="number-pad" placeholderTextColor={theme.colors.textMuted} style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface }]} />
          </View>
        </View>
        <View>
          <AppText variant="caption" weight="600" color={theme.colors.textMuted}>O que você comeu</AppText>
          <TextInput value={description} onChangeText={setDescription} placeholder="ex: arroz, feijão, frango e salada" multiline placeholderTextColor={theme.colors.textMuted} style={[styles.input, styles.textArea, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface }]} />
        </View>

        {menuMeal && (
          <AppCard style={styles.gap8}>
            <AppText weight="700">Do seu cardápio</AppText>
            <AppText variant="caption" color={theme.colors.textMuted}>Toque pra preencher descrição e calorias.</AppText>
            {menuMeal.opcoes.map((option, index) => (
              <Pressable key={`${menuMeal.id}-${index}`} onPress={() => { setDescription(option.texto); setCalories(String(option.kcal)); setSource('cardapio'); }} style={[styles.option, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceElevated }]}>
                <AppText variant="caption">{option.texto}</AppText>
                <AppText variant="caption" color={theme.colors.textMuted}>{option.kcal} kcal</AppText>
              </Pressable>
            ))}
          </AppCard>
        )}

        <AppCard style={styles.gap8}>
          <AppText weight="700">Somar alimentos</AppText>
          <AppText variant="caption" color={theme.colors.textMuted}>Cada toque soma as calorias aproximadas e escreve o alimento.</AppText>
          <TextInput value={search} onChangeText={setSearch} placeholder="Buscar alimento" accessibilityLabel="Buscar alimento" placeholderTextColor={theme.colors.textMuted} style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface }]} />
          <ScrollView nestedScrollEnabled style={styles.foodList} keyboardShouldPersistTaps="handled">
            {foods.length ? foods.map(([name, kcal]) => (
              <Pressable key={name} onPress={() => addFood(name, kcal)} style={[styles.foodItem, { backgroundColor: theme.colors.surfaceElevated }]}>
                <AppText variant="caption" style={styles.flex}>{name}</AppText>
                <AppText variant="caption" weight="700" color={theme.colors.success}>+{kcal}</AppText>
              </Pressable>
            )) : <AppText variant="caption" color={theme.colors.textMuted}>Nada encontrado. Digite as calorias à mão.</AppText>}
          </ScrollView>
        </AppCard>

        <AppButton label="Salvar refeição" loading={busy} disabled={preparing} onPress={() => void save()} />
        {entry && <Pressable onPress={remove} disabled={busy} style={styles.linkButton}><AppText variant="caption" weight="700" color={theme.colors.danger}>Apagar esta refeição</AppText></Pressable>}
      </ScrollView>
    </SafeAreaView>
  );
}

function DiaryTab({
  data,
  calendar,
  month,
  onSelectDate,
  onMonth,
  onOpenEntry,
  onReload,
}: {
  data: NutritionDashboard;
  calendar: Record<string, CalorieDay>;
  month: string;
  onSelectDate: (date: string) => void;
  onMonth: (month: string) => void;
  onOpenEntry: (entry: FoodEntry | null, ref: string) => void;
  onReload: () => Promise<void>;
}) {
  const theme = useAppTheme();
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalText, setGoalText] = useState(String(data.calorieGoal));
  const [savingGoal, setSavingGoal] = useState(false);
  const goal = data.calorieGoal;
  const consumed = data.caloriesConsumed;
  const rest = goal - consumed;
  const groups = MEAL_REFS.map((meal) => ({ ...meal, entries: data.entries.filter((entry) => entry.ref === meal.id) }));
  const others = data.entries.filter((entry) => !MEAL_REFS.some((meal) => meal.id === entry.ref));

  const saveGoal = async (value: number | null): Promise<void> => {
    setSavingGoal(true);
    try { await setCalorieGoal(value); setEditingGoal(false); await onReload(); }
    catch (error) { Alert.alert('Meta não salva', error instanceof Error ? error.message : 'Tente novamente.'); }
    finally { setSavingGoal(false); }
  };

  const entryRow = (entry: FoodEntry) => (
    <Pressable key={entry.id} accessibilityRole="button" onPress={() => onOpenEntry(entry, entry.ref)} style={[styles.entry, { backgroundColor: theme.colors.surface }]}>
      <View style={[styles.entryPhoto, { backgroundColor: theme.colors.surfaceElevated }]}>
        {entry.photoUrl ? <Image source={{ uri: entry.photoUrl }} style={styles.photo} accessibilityLabel="Foto do prato" /> : <VemIcon name="nutrition" size={20} color={theme.colors.textMuted} />}
      </View>
      <View style={styles.flex}>
        <AppText weight="600" numberOfLines={2}>{entry.desc || 'Sem descrição'}</AppText>
        <AppText variant="caption" color={theme.colors.textMuted}>{entry.hora ? `${entry.hora} · ` : ''}{entry.fonte === 'cardapio' ? 'do cardápio' : 'registrado por você'}</AppText>
      </View>
      <View style={styles.entryKcal}><AppText weight="700">{formatNumber(entry.kcal)}</AppText><AppText variant="caption" color={theme.colors.textMuted}>kcal</AppText></View>
    </Pressable>
  );

  return (
    <View style={styles.tabContent}>
      <AppCard style={[styles.mx, styles.gap8]}>
        <AppText variant="caption" color={theme.colors.textMuted} weight="700">{dayTitle(data.date)}</AppText>
        {data.mealPlanBlocked ? (
          <>
            <View style={styles.baseline}><AppText variant="display" color={theme.colors.primary} weight="700">{formatNumber(consumed)}</AppText><AppText>kcal registradas</AppText></View>
            <AppText variant="caption" color={theme.colors.textMuted}>Sua meta de calorias deve ser definida pela nutricionista que te acompanha.</AppText>
          </>
        ) : (
          <>
            <View style={styles.baseline}><AppText variant="display" color={theme.colors.primary} weight="700">{formatNumber(consumed)}</AppText><AppText>de {formatNumber(goal)} kcal</AppText></View>
            <View style={[styles.track, { backgroundColor: theme.colors.border }]}><View style={[styles.fill, { width: `${Math.min(100, (consumed / Math.max(1, goal)) * 100)}%`, backgroundColor: consumed > goal * 1.1 ? theme.colors.danger : theme.colors.primary }]} /></View>
            <View style={styles.between}>
              <AppText variant="caption">{rest >= 0 ? <>Faltam <AppText variant="caption" weight="700">{formatNumber(rest)} kcal</AppText></> : <><AppText variant="caption" weight="700">{formatNumber(-rest)} kcal</AppText> acima da meta</>}</AppText>
              <Pressable onPress={() => { setGoalText(String(goal)); setEditingGoal((value) => !value); }}><AppText variant="caption" weight="700" color={theme.colors.primary} style={styles.underline}>ajustar meta</AppText></Pressable>
            </View>
            {editingGoal && (
              <View style={[styles.goalEditor, { borderTopColor: theme.colors.border }]}>
                <AppText variant="caption" color={theme.colors.textMuted}>{data.customGoal ? 'Você definiu sua meta.' : 'Hoje a meta vem do seu cardápio ou do quiz.'} Ajuste se a sua nutricionista indicou outro valor.</AppText>
                <TextInput value={goalText} onChangeText={setGoalText} keyboardType="number-pad" accessibilityLabel="Calorias por dia" style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surfaceElevated }]} />
                <View style={styles.row}>
                  <AppButton label="Salvar meta" loading={savingGoal} style={styles.flex} onPress={() => void saveGoal(Number(goalText))} />
                  {data.customGoal && <AppButton label="Usar a do cardápio" variant="secondary" disabled={savingGoal} style={styles.flex} onPress={() => void saveGoal(null)} />}
                </View>
              </View>
            )}
          </>
        )}
      </AppCard>

      <AppButton label="Adicionar refeição com foto" style={styles.mx} onPress={() => onOpenEntry(null, data.date === dateKey() ? mealByTime(data.times) : 'almoco')} />

      <CalorieCalendar month={month} selected={data.date} days={calendar} goal={goal} colored={!data.mealPlanBlocked} onSelect={onSelectDate} onMonth={onMonth} />

      {groups.map((group) => (
        <View key={group.id} style={[styles.mx, styles.gap8]}>
          <View style={styles.between}>
            <AppText variant="subtitle" weight="700">{group.label}</AppText>
            {!!group.entries.length && <AppText variant="caption" color={theme.colors.textMuted}>{formatNumber(group.entries.reduce((sum, entry) => sum + entry.kcal, 0))} kcal</AppText>}
          </View>
          {group.entries.map(entryRow)}
          <Pressable onPress={() => onOpenEntry(null, group.id)} style={styles.linkButtonStart}><AppText variant="caption" weight="700" color={theme.colors.primary}>+ adicionar em {group.label.toLowerCase()}</AppText></Pressable>
        </View>
      ))}
      {!!others.length && <View style={[styles.mx, styles.gap8]}><AppText variant="subtitle" weight="700">Outras</AppText>{others.map(entryRow)}</View>}
      <AppText variant="caption" color={theme.colors.textMuted} style={styles.mx}>As calorias são estimativas. Pra um plano individual, fale com a nutricionista.</AppText>
    </View>
  );
}

function MenuTab({ data, onReload }: { data: NutritionDashboard; onReload: () => Promise<void> }) {
  const theme = useAppTheme();
  const [busy, setBusy] = useState(false);
  const plan = data.selectedPlan;
  const run = async (action: () => Promise<void>): Promise<void> => {
    if (busy) return;
    setBusy(true);
    try { await action(); await onReload(); }
    catch (error) { Alert.alert('Não foi possível salvar', error instanceof Error ? error.message : 'Tente novamente.'); }
    finally { setBusy(false); }
  };

  if (data.mealPlanBlocked) {
    return (
      <View style={styles.tabContent}>
        <AppCard style={[styles.mx, styles.gap8, { borderColor: theme.colors.secondary }]}>
          <VemIcon name="lock" color={theme.colors.primary} />
          <AppText variant="subtitle" weight="700">Cardápios indisponíveis pra você</AppText>
          <AppText variant="caption">{BLOCKED_TEXT}</AppText>
          <AppText variant="caption" color={theme.colors.textMuted}>O diário continua disponível. Se sua situação mudou, refaça o quiz no Painel.</AppText>
        </AppCard>
      </View>
    );
  }
  if (!plan) {
    return (
      <View style={styles.tabContent}>
        <AppCard style={[styles.mx, styles.empty]}><VemIcon name="nutrition" color={theme.colors.primary} /><AppText color={theme.colors.textMuted}>Nenhum cardápio foi indicado. Refaça o quiz no Painel para atualizar suas recomendações.</AppText></AppCard>
      </View>
    );
  }
  const doneCount = MEAL_REFS.filter((meal) => data.day.refeicoes[meal.id]).length;
  return (
    <View style={styles.tabContent}>
      <AppCard style={[styles.mx, styles.gap8]}>
        <View style={styles.between}>
          <AppText variant="caption" color={theme.colors.textMuted} weight="700">Cardápio sugestivo</AppText>
          <View style={[styles.badge, { backgroundColor: theme.colors.accent }]}><AppText variant="caption" weight="700" color="#2E1A20">indicado pra você</AppText></View>
        </View>
        <AppText variant="title" weight="600">{plan.kcal} kcal · {plan.tipo}</AppText>
        {!!plan.media && <AppText variant="caption" color={theme.colors.textMuted}>Média do dia: {plan.media}</AppText>}
        {!!plan.intro && <AppText variant="caption">{plan.intro}</AppText>}
        <ResponsibleLine responsible={data.responsible} />
      </AppCard>

      <View style={[styles.mx, styles.between]}><AppText variant="title" weight="600">Hoje</AppText><AppText variant="caption" color={theme.colors.textMuted}>{doneCount} de 5 refeições</AppText></View>
      <AppText variant="caption" color={theme.colors.textMuted} style={styles.mx}>Escolha uma opção por refeição. Tocar numa opção marca a refeição como feita e soma as calorias no seu diário.</AppText>
      {plan.refeicoes.map((meal) => {
        const done = !!data.day.refeicoes[meal.id];
        const selected = data.day.escolhas[meal.id];
        return (
          <AppCard key={meal.id} style={[styles.mx, styles.mealCard, done && { borderColor: theme.colors.success }]}>
            <View style={styles.mealHead}>
              <View style={styles.flex}><AppText variant="subtitle" weight="700">{meal.nome}</AppText><AppText variant="caption" color={theme.colors.textMuted}>{data.times[meal.id] ? `${data.times[meal.id]} · ` : ''}{meal.faixa}</AppText></View>
              <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: done }} accessibilityLabel={`${done ? 'Desmarcar' : 'Marcar'} ${meal.nome} como feita`} onPress={() => void run(() => toggleMealDone(meal.id))} style={[styles.check, { backgroundColor: done ? theme.colors.success : 'transparent', borderColor: done ? theme.colors.success : theme.colors.border }]}>
                <VemIcon name="check" size={18} color={done ? '#fff' : theme.colors.textMuted} />
              </Pressable>
            </View>
            {meal.opcoes.map((option, index) => {
              const chosen = done && selected === index;
              return (
                <Pressable
                  key={`${meal.id}-${index}`}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: chosen }}
                  onPress={() => void run(() => (chosen ? toggleMealDone(meal.id) : chooseMealOption(plan, meal.id, index, data.times[meal.id])))}
                  style={[styles.option, { borderColor: chosen ? theme.colors.success : theme.colors.border, backgroundColor: chosen ? `${theme.colors.success}18` : theme.colors.surfaceElevated }]}
                >
                  <AppText variant="caption" color={theme.colors.accent} weight="800">{meal.opcoes.length > 1 ? `OPÇÃO ${index + 1}` : 'OPÇÃO ÚNICA'}</AppText>
                  <AppText>{option.texto}</AppText>
                  <AppText variant="caption" color={theme.colors.textMuted}>{option.kcal} kcal{option.prot ? ` · ${option.prot} g de proteína` : ''}</AppText>
                </Pressable>
              );
            })}
          </AppCard>
        );
      })}
      {!!plan.dicas?.length && <Collapsible title={`Dicas · ${plan.tipo}`}>{plan.dicas.map((tip) => <AppText key={tip} variant="caption">• {tip}</AppText>)}</Collapsible>}
      {!!plan.regras?.length && <Collapsible title="Regras do plano">{plan.regras.map((rule) => <AppText key={rule} variant="caption">• {rule}</AppText>)}</Collapsible>}
      {!!plan.trocas?.length && (
        <Collapsible title="Tabela de trocas">
          <AppText variant="caption" color={theme.colors.textMuted}>Troque alimentos dentro da mesma linha.</AppText>
          {plan.trocas.map((swap) => (
            <View key={swap.grupo} style={[styles.swapRow, { borderBottomColor: theme.colors.border }]}>
              <View style={styles.between}><AppText variant="caption" weight="700">{swap.grupo}</AppText><AppText variant="caption" color={theme.colors.textMuted}>{swap.kcal} kcal</AppText></View>
              <AppText variant="caption">{swap.equivale}</AppText>
            </View>
          ))}
        </Collapsible>
      )}
      <AppText variant="caption" color={theme.colors.textMuted} style={styles.mx}>Cardápio sugestivo com valores estimados pela Tabela TACO. Não substitui a avaliação individual de uma nutricionista.</AppText>
    </View>
  );
}

export function NutritionScreen() {
  const theme = useAppTheme();
  const [tab, setTab] = useState<Tab>('diario');
  const [date, setDate] = useState(dateKey());
  const [month, setMonth] = useState(dateKey().slice(0, 7));
  const [data, setData] = useState<NutritionDashboard | null>(null);
  const [calendar, setCalendar] = useState<Record<string, CalorieDay>>({});
  const [editor, setEditor] = useState<{ entry: FoodEntry | null; ref: string } | null>(null);

  const load = useCallback(async (): Promise<void> => {
    try {
      const [dashboard, days] = await Promise.all([loadNutritionDashboard(date), loadCalorieCalendar(month)]);
      setData(dashboard);
      setCalendar(days);
    } catch (error) {
      Alert.alert('Não foi possível carregar a dieta', error instanceof Error ? error.message : 'Confira sua conexão.');
    }
  }, [date, month]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const closeEditor = useCallback(() => setEditor(null), []);

  if (!data) return <SafeAreaView style={[styles.loading, { backgroundColor: theme.colors.background }]}><AppText color={theme.colors.textMuted}>Carregando dieta…</AppText></SafeAreaView>;

  if (editor) {
    return (
      <FoodEntryEditor
        date={data.date}
        entry={editor.entry}
        initialRef={editor.ref}
        plan={data.selectedPlan}
        times={data.times}
        onClose={closeEditor}
        onSaved={async () => { setEditor(null); await load(); }}
      />
    );
  }

  const switchTab = (next: Tab): void => {
    setTab(next);
    // O cardápio é sempre de hoje.
    if (next === 'cardapio' && date !== dateKey()) { setDate(dateKey()); setMonth(dateKey().slice(0, 7)); }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.background }]} edges={['top', 'left', 'right']}>
      <StatusBar style="light" />
      <ScrollView automaticallyAdjustKeyboardInsets contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.header, { backgroundColor: theme.colors.brandSurface }]}>
          <AppText color={theme.colors.brandText}>VEM · Vida em Movimento</AppText>
          <AppText variant="title" color={theme.colors.brandText} weight="600">Dieta</AppText>
        </View>
        <View style={[styles.tabs, { borderBottomColor: theme.colors.border }]} accessibilityRole="tablist">
          {([['diario', 'Diário e calorias'], ['cardapio', 'Cardápio']] as Array<[Tab, string]>).map(([key, label]) => (
            <Pressable key={key} accessibilityRole="tab" accessibilityState={{ selected: tab === key }} onPress={() => switchTab(key)} style={[styles.tab, tab === key && { borderBottomColor: theme.colors.text }]}>
              <AppText weight="600" color={tab === key ? theme.colors.text : theme.colors.textMuted}>{label}</AppText>
            </Pressable>
          ))}
        </View>
        {tab === 'diario' ? (
          <DiaryTab
            data={data}
            calendar={calendar}
            month={month}
            onSelectDate={setDate}
            onMonth={setMonth}
            onOpenEntry={(entry, ref) => setEditor({ entry, ref })}
            onReload={load}
          />
        ) : <MenuTab data={data} onReload={load} />}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { gap: 12, paddingBottom: 36 },
  header: { padding: 16, gap: 10, borderBottomLeftRadius: 22, borderBottomRightRadius: 22 },
  tabs: { flexDirection: 'row', gap: 22, marginHorizontal: 16, borderBottomWidth: 1 },
  tab: { paddingVertical: 10, minHeight: 44, justifyContent: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent', marginBottom: -1 },
  tabContent: { gap: 12 },
  mx: { marginHorizontal: 16 },
  flex: { flex: 1 },
  row: { flexDirection: 'row', gap: 8 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  gap8: { gap: 8 },
  baseline: { flexDirection: 'row', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' },
  track: { height: 7, borderRadius: 7, overflow: 'hidden' },
  fill: { height: '100%' },
  underline: { textDecorationLine: 'underline' },
  goalEditor: { borderTopWidth: 1, paddingTop: 10, gap: 8 },
  calendar: { gap: 6 },
  calendarTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  monthButton: { width: 38, height: 38, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  calendarRow: { flexDirection: 'row', gap: 4 },
  calendarHead: { flex: 1, textAlign: 'center' },
  calendarCell: { flex: 1, minWidth: 0 },
  calendarDay: { minHeight: 48, borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingVertical: 4, borderWidth: 2, borderColor: 'transparent' },
  calendarKcal: { fontSize: 9, lineHeight: 12 },
  photoDot: { position: 'absolute', top: 4, right: 4, width: 6, height: 6, borderRadius: 3 },
  photoDotStatic: { width: 7, height: 7, borderRadius: 4 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendSwatch: { width: 10, height: 10, borderRadius: 3 },
  entry: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 12, padding: 8 },
  entryPhoto: { width: 56, height: 56, borderRadius: 10, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  entryKcal: { alignItems: 'flex-end' },
  photo: { width: '100%', height: '100%' },
  linkButton: { alignSelf: 'center', padding: 8 },
  linkButtonStart: { alignSelf: 'flex-start', paddingVertical: 4 },
  sheet: { padding: 16, gap: 12, paddingBottom: 40 },
  sheetTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  backButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7, minHeight: 36, justifyContent: 'center' },
  photoBox: { aspectRatio: 4 / 3, borderRadius: 12, borderWidth: 1, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  photoEmpty: { alignItems: 'center', gap: 8, padding: 16 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 11, paddingVertical: 10, fontSize: 16, marginTop: 4 },
  textArea: { minHeight: 64, textAlignVertical: 'top' },
  option: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 4 },
  foodList: { maxHeight: 300 },
  foodItem: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 4, minHeight: 42 },
  mealCard: { gap: 12 },
  mealHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  check: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  badge: { borderRadius: 4, paddingHorizontal: 8, paddingVertical: 2 },
  responsible: { borderTopWidth: 1, borderStyle: 'dashed', paddingTop: 10 },
  collapseHead: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 28 },
  collapseBody: { gap: 6, marginTop: 10 },
  swapRow: { borderBottomWidth: 1, paddingVertical: 6, gap: 2 },
  empty: { alignItems: 'center', gap: 12 },
});
