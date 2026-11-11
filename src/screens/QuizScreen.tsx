import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppButton, AppCard, AppText, FormScrollView, useVemLoader } from '../components';
import type { RootStackParamList } from '../navigation/types';
import { calculateRecommendation, loadQuizAnswers, saveQuizAnswers, type QuizAnswers } from '../services/onboarding';
import { useAuth } from '../auth';
import { useAppTheme } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Quiz'>;
type AnswersDraft = Partial<QuizAnswers>;
const totalQuestions = 8;

interface Choice { value: string | number; label: string; description?: string }

export function QuizScreen({ navigation, route }: Props) {
  const theme = useAppTheme();
  const { refreshProfile } = useAuth();
  const { showVemLoader } = useVemLoader();
  const refazer = !!route.params?.refazer;
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<AnswersDraft>({});
  const [numbers, setNumbers] = useState({ age: '', heightCm: '', weightKg: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!refazer) return;
    void loadQuizAnswers().then((current) => {
      if (!current) return;
      setAnswers(current);
      setNumbers({ age: String(current.age), heightCm: String(current.heightCm), weightKg: String(current.weightKg).replace('.', ',') });
    });
  }, [refazer]);

  const recommendation = useMemo(() => step === totalQuestions ? calculateRecommendation(answers as QuizAnswers) : null, [answers, step]);
  const choose = (key: keyof QuizAnswers, value: string | number) => { setAnswers((current) => ({ ...current, [key]: value })); setStep((current) => current + 1); };
  const choices: Array<{ key: keyof QuizAnswers; title: string; subtitle?: string; options: Choice[] } | null> = [
    { key: 'objective', title: 'Qual é o seu principal objetivo agora?', options: [{ value: 'weight_loss', label: 'Emagrecer com saúde' }, { value: 'strength', label: 'Ganhar força e condicionamento' }, { value: 'routine', label: 'Manter o peso e criar rotina' }] },
    null,
    { key: 'activity', title: 'Como é sua rotina hoje, sem contar os treinos da VEM?', options: [{ value: 'sedentary', label: 'Passo a maior parte do dia sentada' }, { value: 'light', label: 'Ando um pouco, mas me exercito pouco' }, { value: 'moderate', label: 'Exercito-me 3 a 4 vezes por semana' }, { value: 'high', label: 'Exercito-me 5 vezes ou mais por semana' }] },
    { key: 'experience', title: 'Qual sua experiência com musculação?', options: [{ value: 'beginner', label: 'Iniciante', description: 'Nunca treinei ou estou voltando agora' }, { value: 'intermediate', label: 'Intermediária', description: 'Treino há menos de um ano' }, { value: 'advanced', label: 'Avançada', description: 'Treino há mais de um ano com constância' }] },
    { key: 'location', title: 'Onde você vai treinar?', options: [{ value: 'gym', label: 'Na academia' }, { value: 'home', label: 'Em casa' }] },
    { key: 'daysPerWeek', title: 'Quantos dias por semana você consegue treinar?', options: [2, 3, 4].map((value) => ({ value, label: `${value} dias` })) },
    { key: 'nutrition', title: 'Como é a sua alimentação?', options: [{ value: 'traditional', label: 'Como de tudo' }, { value: 'vegetarian', label: 'Sou vegetariana' }, { value: 'gluten_free', label: 'Não consumo glúten' }, { value: 'lactose_free', label: 'Não consumo lactose' }] },
    { key: 'health', title: 'Alguma dessas situações vale para você?', subtitle: 'Essa resposta é privada e não fica disponível para a equipe.', options: [{ value: 'none', label: 'Nenhuma delas' }, { value: 'pregnant', label: 'Estou grávida ou amamentando' }, { value: 'condition', label: 'Tenho uma condição de saúde em acompanhamento' }, { value: 'injury', label: 'Tenho lesão ou dor que limita movimentos' }] },
  ];

  const save = async () => {
    setSaving(true);
    try {
      await saveQuizAnswers(answers as QuizAnswers);
      const loaderFinished = showVemLoader();
      await refreshProfile();
      if (refazer && navigation.canGoBack()) navigation.goBack();
      await loaderFinished;
    }
    catch { Alert.alert('Não foi possível salvar', 'Confira sua conexão e tente novamente.'); }
    finally { setSaving(false); }
  };

  const submitNumbers = () => {
    const age = Number(numbers.age); const heightCm = Number(numbers.heightCm); const weightKg = Number(numbers.weightKg.replace(',', '.'));
    if (!Number.isFinite(age) || age < 16 || age > 90) return Alert.alert('Confira a idade', 'Informe uma idade entre 16 e 90 anos.');
    if (!Number.isFinite(heightCm) || heightCm < 130 || heightCm > 210) return Alert.alert('Confira a altura', 'Informe a altura em centímetros, entre 130 e 210.');
    if (!Number.isFinite(weightKg) || weightKg < 35 || weightKg > 250) return Alert.alert('Confira o peso', 'Informe o peso em kg, entre 35 e 250.');
    setAnswers((current) => ({ ...current, age, heightCm, weightKg })); setStep(2);
  };

  const question = choices[step];
  return <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.background }]}><FormScrollView bottomOffset={32} contentContainerStyle={styles.content}>
    <View style={styles.top}><AppText variant="caption" color={theme.colors.primary} weight="800">VEM · SEU PLANO</AppText>{step < totalQuestions && <AppText variant="caption" color={theme.colors.textMuted}>{step + 1} de {totalQuestions}</AppText>}</View>
    <View style={[styles.track, { backgroundColor: theme.colors.border }]}><View style={[styles.progress, { backgroundColor: theme.colors.primary, width: `${Math.min(100, step / totalQuestions * 100)}%` }]} /></View>
    {step === 1 ? <><AppText variant="title" weight="700">Para calcular seu cardápio</AppText><AppText color={theme.colors.textMuted}>Esses números são privados. A equipe não vê seu peso, altura ou idade.</AppText><AppCard style={styles.form}><TextInput style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text }]} value={numbers.age} onChangeText={(age) => setNumbers({ ...numbers, age })} placeholder="Idade" keyboardType="number-pad" placeholderTextColor={theme.colors.textMuted}/><TextInput style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text }]} value={numbers.heightCm} onChangeText={(heightCm) => setNumbers({ ...numbers, heightCm })} placeholder="Altura em cm" keyboardType="number-pad" placeholderTextColor={theme.colors.textMuted}/><TextInput style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text }]} value={numbers.weightKg} onChangeText={(weightKg) => setNumbers({ ...numbers, weightKg })} placeholder="Peso em kg" keyboardType="decimal-pad" placeholderTextColor={theme.colors.textMuted}/><AppButton label="Continuar" onPress={submitNumbers}/></AppCard></> : question ? <><AppText variant="title" weight="700">{question.title}</AppText>{question.subtitle && <AppText color={theme.colors.textMuted}>{question.subtitle}</AppText>}<View style={styles.options}>{question.options.map((option) => <Pressable key={String(option.value)} onPress={() => choose(question.key, option.value)} style={({ pressed }) => [styles.option, { backgroundColor: theme.colors.surface, borderColor: answers[question.key] === option.value ? theme.colors.primary : theme.colors.border, opacity: pressed ? .75 : 1 }]}><AppText weight="700">{option.label}</AppText>{option.description && <AppText variant="caption" color={theme.colors.textMuted}>{option.description}</AppText>}</Pressable>)}</View></> : recommendation ? <><AppText variant="display" weight="700">Seu plano está pronto</AppText><AppCard style={styles.result}><AppText variant="caption" color={theme.colors.primary} weight="800">TREINO INDICADO</AppText><AppText variant="title" weight="700">{recommendation.modality === 'gym' ? 'Academia' : 'Em casa'} · {recommendation.level === 'beginner' ? 'Iniciante' : recommendation.level === 'intermediate' ? 'Intermediária' : 'Avançada'}</AppText><AppText>{recommendation.weeklyGoal} treinos por semana</AppText></AppCard><AppCard style={styles.result}><AppText variant="caption" color={theme.colors.primary} weight="800">CARDÁPIO INDICADO</AppText><AppText variant="title" weight="700">{recommendation.mealPlanBlocked ? 'Orientação profissional necessária' : `${recommendation.caloriePlan} kcal`}</AppText>{recommendation.healthNotice && <AppText color={theme.colors.textMuted}>{recommendation.healthNotice}</AppText>}</AppCard><AppText variant="caption" color={theme.colors.textMuted}>Você poderá alterar essas preferências e refazer o quiz pelo Painel.</AppText><AppButton label="Salvar meu plano" loading={saving} onPress={save}/></> : null}
    {step > 0 && step < totalQuestions ? <AppButton label="Voltar" variant="ghost" onPress={() => setStep((current) => current - 1)}/> : null}
    {refazer && step === 0 ? <AppButton label="Cancelar" variant="ghost" onPress={() => navigation.goBack()}/> : null}
  </FormScrollView></SafeAreaView>;
}

const styles = StyleSheet.create({ safe: { flex: 1 }, content: { padding: 20, gap: 16, flexGrow: 1, justifyContent: 'center' }, top: { flexDirection: 'row', justifyContent: 'space-between' }, track: { height: 6, borderRadius: 6, overflow: 'hidden' }, progress: { height: '100%' }, options: { gap: 10 }, option: { borderWidth: 1.5, borderRadius: 14, padding: 16, gap: 4, minHeight: 58, justifyContent: 'center' }, form: { gap: 12 }, input: { borderWidth: 1, borderRadius: 10, minHeight: 50, paddingHorizontal: 12, fontSize: 16 }, result: { gap: 8 } });
