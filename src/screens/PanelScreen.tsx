import { useCallback, useEffect, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import { useFocusEffect, useNavigation, type NavigationProp } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '../auth';
import { AppButton, AppCard, AppText } from '../components';
import type { RootStackParamList } from '../navigation/types';
import { loadPanel, savePanel, type PanelProfile } from '../services/modules';
import { syncNotifications } from '../services/notifications';
import { useAppTheme } from '../theme';

interface ToggleProps {
  label: string;
  description?: string;
  value: boolean;
  onChange: (value: boolean) => void;
}

function Toggle({ label, description, value, onChange }: ToggleProps) {
  const theme = useAppTheme();
  return (
    <View style={[styles.toggle, { borderBottomColor: theme.colors.border }]}>
      <View style={styles.flex}>
        <AppText weight="700">{label}</AppText>
        {!!description && <AppText variant="caption" color={theme.colors.textMuted}>{description}</AppText>}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
      />
    </View>
  );
}

export function PanelScreen() {
  const theme = useAppTheme();
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { profile, refreshProfile, session, signOut } = useAuth();
  const [panel, setPanel] = useState<PanelProfile | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (): Promise<void> => {
    setError('');
    try {
      setPanel(await loadPanel());
    } catch {
      setError('Não foi possível carregar seu perfil. Confira a conexão e tente novamente.');
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  useEffect(() => {
    if (!saved) return;
    const timeout = setTimeout(() => setSaved(false), 1800);
    return () => clearTimeout(timeout);
  }, [saved]);

  const save = async (): Promise<void> => {
    if (!panel) return;
    setSaving(true);
    setError('');
    try {
      await savePanel(panel);
      await refreshProfile();
      setSaved(true);
      // Liga/desliga os avisos de treino e de encontros conforme as preferências salvas.
      void syncNotifications().catch(() => undefined);
    } catch {
      setError('Não foi possível salvar suas alterações. Tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  if (!panel) {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: theme.colors.background }]}>
        <AppText color={error ? theme.colors.danger : theme.colors.textMuted} style={styles.centerText}>
          {error || 'Carregando painel…'}
        </AppText>
        {!!error && <AppButton label="Tentar novamente" onPress={load} />}
      </SafeAreaView>
    );
  }

  const updateText = (key: 'apelido' | 'objetivo' | 'metaPessoal', value: string): void => {
    setPanel({ ...panel, [key]: value });
    setSaved(false);
  };

  const displayName = panel.apelido || profile?.firstName || 'Participante';

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.colors.background }]} edges={['top', 'left', 'right']}>
      <StatusBar style="light" />
      <ScrollView automaticallyAdjustKeyboardInsets contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={[styles.header, { backgroundColor: theme.colors.brandSurface }]}>
          <AppText color={theme.colors.brandText}>VEM · Vida em Movimento</AppText>
          <AppText variant="title" color={theme.colors.brandText}>Painel</AppText>
        </View>

        <AppCard style={styles.cardGap}>
          <AppText variant="title">Perfil</AppText>
          <View style={styles.identity}>
            <View style={[styles.avatar, { backgroundColor: theme.colors.secondary }]}>
              <AppText color="#fff" variant="title">{displayName.charAt(0).toUpperCase()}</AppText>
            </View>
            <View style={styles.flex}>
              <AppText weight="700">{displayName}</AppText>
              <AppText variant="caption" color={theme.colors.textMuted}>{session?.user.email}</AppText>
            </View>
          </View>
          <AppText variant="caption" color={theme.colors.textMuted}>COMO QUER SER CHAMADA</AppText>
          <TextInput
            value={panel.apelido ?? ''}
            onChangeText={(value) => updateText('apelido', value)}
            placeholder="Seu nome"
            placeholderTextColor={theme.colors.textMuted}
            style={[styles.input, { color: theme.colors.text, borderColor: theme.colors.border }]}
          />
        </AppCard>

        <AppCard style={styles.cardGap}>
          <AppText variant="title">Objetivo e metas</AppText>
          <AppText variant="caption" color={theme.colors.textMuted}>SEU OBJETIVO</AppText>
          <TextInput
            value={panel.objetivo ?? ''}
            onChangeText={(value) => updateText('objetivo', value)}
            placeholder="ex: ter mais energia"
            placeholderTextColor={theme.colors.textMuted}
            multiline
            style={[styles.input, { color: theme.colors.text, borderColor: theme.colors.border }]}
          />
          <AppText variant="caption" color={theme.colors.textMuted}>META PARA OS PRÓXIMOS 3 MESES</AppText>
          <TextInput
            value={panel.metaPessoal ?? ''}
            onChangeText={(value) => updateText('metaPessoal', value)}
            placeholder="ex: correr 5 km"
            placeholderTextColor={theme.colors.textMuted}
            style={[styles.input, { color: theme.colors.text, borderColor: theme.colors.border }]}
          />
          <AppText variant="caption" color={theme.colors.textMuted}>TREINOS POR SEMANA</AppText>
          <View style={styles.goals}>
            {[2, 3, 4].map((amount) => (
              <AppButton
                key={amount}
                label={String(amount)}
                variant={panel.metaSemanal === amount ? 'primary' : 'secondary'}
                onPress={() => { setPanel({ ...panel, metaSemanal: amount }); setSaved(false); }}
                style={styles.goalButton}
              />
            ))}
          </View>
        </AppCard>

        {profile?.role === 'participant' && <AppButton label="Refazer quiz e recomendações" variant="secondary" onPress={() => navigation.navigate('Quiz', { refazer: true })} />}

        <AppCard>
          <AppText variant="title">Notificações</AppText>
          <Toggle
            label="Lembrete de treino"
            description="Nos dias do seu programa"
            value={panel.notif.treino}
            onChange={(value) => setPanel({ ...panel, notif: { ...panel.notif, treino: value } })}
          />
          <Toggle
            label="Encontro da semana"
            value={panel.notif.encontros}
            onChange={(value) => setPanel({ ...panel, notif: { ...panel.notif, encontros: value } })}
          />
          <Toggle
            label="Prêmios liberados"
            value={panel.notif.premios}
            onChange={(value) => setPanel({ ...panel, notif: { ...panel.notif, premios: value } })}
          />
          <AppText variant="caption" color={theme.colors.textMuted}>As notificações chegam no celular mesmo com o app fechado.</AppText>
          <AppButton label="Horários e lembretes" variant="secondary" onPress={() => navigation.navigate('Lembretes')} />
        </AppCard>

        <AppCard>
          <AppText variant="title">Privacidade</AppText>
          <Toggle
            label="Compartilhar meus números com a equipe"
            description="A equipe vê treinos e plano. Nunca peso, medidas ou saúde."
            value={panel.privacidade.contarEquipe}
            onChange={(value) => setPanel({ ...panel, privacidade: { contarEquipe: value } })}
          />
        </AppCard>

        {!!error && <AppText color={theme.colors.danger} style={styles.centerText}>{error}</AppText>}
        <AppButton label={saved ? 'Alterações salvas ✓' : 'Salvar alterações'} loading={saving} onPress={save} />

        <AppCard style={styles.cardGap}>
          <AppText variant="title">Suporte</AppText>
          <AppButton label="Instagram @vem.clube" variant="secondary" onPress={() => void Linking.openURL('https://www.instagram.com/vem.clube/')} />
          <AppButton label="vemclube.com.br" variant="secondary" onPress={() => void Linking.openURL('https://vemclube.com.br')} />
        </AppCard>

        {profile?.role === 'admin' && <AppButton label="Conteúdo administrativo" variant="secondary" onPress={() => navigation.navigate('AdminContent')} />}
        <AppButton label="Sair da conta" variant="ghost" onPress={() => void signOut()} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24 },
  centerText: { textAlign: 'center' },
  content: { padding: 16, gap: 12, paddingBottom: 36 },
  header: { margin: -16, marginBottom: 4, padding: 16, gap: 10, borderBottomLeftRadius: 22, borderBottomRightRadius: 22 },
  cardGap: { gap: 12 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  input: { borderWidth: 1, borderRadius: 10, minHeight: 48, padding: 12, fontSize: 16 },
  goals: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  goalButton: { minWidth: 42, paddingHorizontal: 8 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1 },
  flex: { flex: 1 },
});
