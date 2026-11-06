import { useCallback, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import type Svg from 'react-native-svg';
import { AppButton, AppCard, AppText, STORY_POSITIONS, STORY_SIZE, STORY_STYLES, StoryArt, VemIcon, type StoryPosition, type StoryStyle } from '../components';
import type { RootStackParamList } from '../navigation/types';
import { loadPhraseOfDay } from '../services/home';
import { COMPLETION_PHRASES, loadDaySummary, savePngToGallery, sharePng, type DaySummary } from '../services/share';
import { serifFont, useAppTheme } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Compartilhar'>;
const PREVIEW_WIDTH = 240;

function Options<T extends string>({ options, value, onChange }: { options: ReadonlyArray<readonly [T, string]>; value: T; onChange: (value: T) => void }) {
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

export function ShareScreen({ navigation, route }: Props) {
  const theme = useAppTheme();
  const mode = route.params.mode;
  const svgRef = useRef<Svg>(null);
  const [summary, setSummary] = useState<DaySummary | null>(null);
  const [phrase, setPhrase] = useState(route.params.phrase ?? '');
  const [style, setStyle] = useState<StoryStyle>('branco');
  const [position, setPosition] = useState<StoryPosition>(mode === 'frase' ? 'centro' : 'base');
  const [withPhrase, setWithPhrase] = useState(false);
  const [dark, setDark] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [completion] = useState(() => COMPLETION_PHRASES[(new Date().getDate() + new Date().getMonth()) % COMPLETION_PHRASES.length] ?? '');

  useFocusEffect(useCallback(() => {
    if (mode === 'treino') loadDaySummary().then(setSummary).catch((error: unknown) => Alert.alert('Não foi possível carregar o resumo', error instanceof Error ? error.message : 'Confira sua conexão.'));
    if (!route.params.phrase) loadPhraseOfDay().then(setPhrase).catch(() => undefined);
  }, [mode, route.params.phrase]));

/** Gera o PNG 1080×1920 a partir da prévia e entrega para salvar ou compartilhar. */
  const exportImage = (action: 'share' | 'save'): void => {
    if (!svgRef.current) { Alert.alert('A imagem ainda está sendo gerada.'); return; }
    if (action === 'share') setSharing(true); else setSaving(true);
    svgRef.current.toDataURL((base64: string) => {
      const data = base64.replace(/^data:image\/png;base64,/, '');
      const name = `vem-${mode}-${Date.now()}`;
      (action === 'share' ? sharePng(data, name) : savePngToGallery(data, name).then(() => Alert.alert('Imagem salva', 'Ela já está na galeria do seu celular.')))
        .catch((error: unknown) => Alert.alert(action === 'share' ? 'Não foi possível compartilhar' : 'Não foi possível salvar', error instanceof Error ? error.message : 'Tente novamente.'))
        .finally(() => { setSharing(false); setSaving(false); });
    }, STORY_SIZE);
  };

  if (mode === 'treino' && !summary) return <SafeAreaView style={[styles.center, { backgroundColor: theme.colors.background }]}><AppText color={theme.colors.textMuted}>Montando seu resumo…</AppText></SafeAreaView>;

  const storySummary = summary ? { names: summary.names, count: summary.count, minutes: summary.minutes, volumeKg: summary.volumeKg, calories: summary.calories } : undefined;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.background }]} edges={['left', 'right', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        {mode === 'treino' && summary && (
          <>
            <View style={styles.top}>
              <View style={[styles.doneIcon, { backgroundColor: theme.colors.success }]}><VemIcon name="check" size={32} color="#fff" /></View>
              <AppText variant="title" weight="600" style={styles.centerText}>{summary.count > 1 ? `${summary.count} treinos hoje` : summary.names[0] ?? 'Treino'}</AppText>
              <AppText style={styles.quote} color={theme.colors.primary}>{completion}</AppText>
            </View>
            <View style={styles.stats}>
              {[[summary.minutes < 1 && summary.count ? '<1' : String(summary.minutes), 'min no total'], [`${summary.volumeKg.toLocaleString('pt-BR')} kg`, 'volume de carga'], [`~${summary.calories.toLocaleString('pt-BR')}`, 'kcal (estimativa)'], [String(summary.sets), 'séries feitas']].map(([value, label]) => (
                <AppCard key={label} style={styles.stat}><AppText variant="title" weight="700">{value}</AppText><AppText variant="caption" color={theme.colors.textMuted}>{label}</AppText></AppCard>
              ))}
            </View>
          </>
        )}

        <AppCard style={styles.card}>
          <View style={styles.between}><AppText variant="subtitle" weight="700">{mode === 'treino' ? 'Sua imagem para os stories' : 'Frase do dia'}</AppText><AppText variant="caption" color={theme.colors.textMuted}>PNG transparente</AppText></View>
          <AppText variant="caption" color={theme.colors.textMuted}>Estilo</AppText>
          <Options options={STORY_STYLES} value={style} onChange={setStyle} />
          <AppText variant="caption" color={theme.colors.textMuted}>Posição no story</AppText>
          <Options options={STORY_POSITIONS} value={position} onChange={setPosition} />
          {mode === 'treino' && <View style={styles.between}><AppText style={styles.flex}>Incluir a frase do dia</AppText><Switch value={withPhrase} onValueChange={setWithPhrase} /></View>}
          <View style={[styles.phone, { backgroundColor: dark ? '#3d2a2b' : '#e7d6c6' }]} accessible accessibilityLabel="Prévia da imagem em formato de story">
            <View style={[styles.glow, { backgroundColor: dark ? '#8a5d55' : '#fff8ef' }]} />
            <StoryArt svgRef={svgRef} width={PREVIEW_WIDTH} style={style} position={position} phrase={mode === 'frase' || withPhrase ? phrase : undefined} summary={mode === 'treino' ? storySummary : undefined} />
          </View>
          <View style={styles.previewToggle}>
            <AppText variant="caption" color={theme.colors.textMuted}>Prévia sobre foto</AppText>
            <Options options={[['escura', 'escura'], ['clara', 'clara']] as const} value={dark ? 'escura' : 'clara'} onChange={(value) => setDark(value === 'escura')} />
          </View>
          <AppButton label="Compartilhar nos stories" loading={sharing} disabled={saving} onPress={() => exportImage('share')} />
          <AppButton label="Salvar imagem" variant="secondary" loading={saving} disabled={sharing} onPress={() => exportImage('save')} />
          <AppText variant="caption" color={theme.colors.textMuted} style={styles.centerText}>
            “Salvar imagem” guarda o PNG na galeria; “Compartilhar” abre as opções do celular. No Instagram, crie um story com sua foto e adicione a imagem por cima: ela já está no tamanho da tela.
            {mode === 'treino' && summary && !summary.weightMeasured ? ' As calorias são estimadas com 65 kg; registre seu peso em Evolução pra mais precisão.' : ''}
          </AppText>
        </AppCard>
        <AppButton label={mode === 'treino' ? 'Voltar ao início' : 'Fechar'} variant="secondary" onPress={() => (mode === 'treino' ? navigation.navigate('Principal', { screen: 'Inicio' }) : navigation.goBack())} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, gap: 14, paddingBottom: 40 },
  top: { alignItems: 'center', gap: 8 },
  doneIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  centerText: { textAlign: 'center' },
  quote: { fontStyle: 'italic', fontSize: 18, lineHeight: 25, textAlign: 'center', fontFamily: serifFont },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stat: { width: '48%', flexGrow: 1, gap: 2 },
  card: { gap: 10 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  flex: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7, minHeight: 36, justifyContent: 'center' },
  phone: { alignSelf: 'center', width: PREVIEW_WIDTH, aspectRatio: 9 / 16, borderRadius: 18, overflow: 'hidden' },
  glow: { position: 'absolute', width: 260, height: 260, borderRadius: 130, top: -60, left: -40, opacity: 0.55 },
  previewToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, flexWrap: 'wrap' },
});
