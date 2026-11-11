import { useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../auth';
import { AppButton, AppCard, AppText, AppTextInput, FormScrollView, VemIcon } from '../components';
import { ACCOUNT_DELETION_URL } from '../config/links';
import { AccountDeletionError, deleteMyAccount } from '../services/account';
import { openSubscriptionManagement } from '../services/subscriptions';
import { useAppTheme } from '../theme';

const DELETED_ITEMS = [
  'Perfil, nome, e-mail e respostas do quiz',
  'Treinos, cargas, corridas e evolução',
  'Avaliações mensais, peso e medidas',
  'Cardápio, diário alimentar e fotos das refeições',
  'Lembretes e preferências',
];

export function DeleteAccountScreen() {
  const theme = useAppTheme();
  const { session } = useAuth();
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);

  const manage = (): void => {
    void openSubscriptionManagement().catch(() => Alert.alert('Não foi possível abrir', 'Abra as assinaturas pelos ajustes da sua conta na loja de apps.'));
  };

  const run = async (): Promise<void> => {
    setDeleting(true);
    setError('');
    try {
      await deleteMyAccount(password);
      // A sessão local é encerrada e o app volta sozinho para a tela de login.
      Alert.alert('Conta excluída', 'Sua conta e seus dados foram excluídos do VEM.');
    } catch (cause) {
      setError(cause instanceof AccountDeletionError ? cause.message : 'Não foi possível excluir sua conta agora. Tente novamente.');
    } finally {
      setDeleting(false);
    }
  };

  const confirm = (): void => {
    if (password.length < 6) { setError('Digite sua senha para confirmar.'); return; }
    Alert.alert(
      'Excluir conta definitivamente?',
      'Todos os seus dados serão apagados e não poderão ser recuperados.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Excluir', style: 'destructive', onPress: () => void run() },
      ],
    );
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.colors.background }]} edges={['left', 'right', 'bottom']}>
      <FormScrollView bottomOffset={32} contentContainerStyle={styles.content}>
        <AppCard style={styles.gap}>
          <AppText variant="title">O que será excluído</AppText>
          <AppText color={theme.colors.textMuted}>A exclusão da conta {session?.user.email ? <AppText weight="700">{session.user.email}</AppText> : null} é permanente e não pode ser desfeita. Serão apagados:</AppText>
          {DELETED_ITEMS.map((item) => (
            <View key={item} style={styles.row}>
              <VemIcon name="check" size={16} color={theme.colors.textMuted} />
              <AppText variant="caption" style={styles.flex}>{item}</AppText>
            </View>
          ))}
          <AppText variant="caption" color={theme.colors.textMuted}>
            Registros de pagamento podem ser mantidos pelo prazo exigido pela legislação fiscal, sem vínculo com o seu perfil.
          </AppText>
        </AppCard>

        <View style={[styles.warning, { backgroundColor: `${theme.colors.danger}12`, borderColor: `${theme.colors.danger}55` }]}>
          <AppText weight="700" color={theme.colors.danger}>Excluir a conta não cancela sua assinatura</AppText>
          <AppText variant="caption" color={theme.colors.danger}>
            Se você tem uma assinatura ativa, cancele-a antes no local onde assinou. Caso contrário, a cobrança continua mesmo depois da exclusão.
          </AppText>
          <AppButton label="Gerenciar assinatura" variant="secondary" onPress={manage} />
        </View>

        <AppCard style={styles.gap}>
          <AppText variant="title">Confirme sua senha</AppText>
          <AppTextInput
            label="Senha"
            value={password}
            onChangeText={(value) => { setPassword(value); setError(''); }}
            error={error}
            placeholder="Sua senha"
            secureTextEntry={!show}
            textContentType="password"
            autoCapitalize="none"
            returnKeyType="done"
            onSubmitEditing={confirm}
            rightAccessory={(
              <Pressable accessibilityRole="button" accessibilityLabel={show ? 'Ocultar senha' : 'Mostrar senha'} hitSlop={10} onPress={() => setShow((value) => !value)} style={styles.eye}>
                <VemIcon name={show ? 'eyeOff' : 'eye'} size={21} color={theme.colors.textMuted} />
              </Pressable>
            )}
          />
          <AppButton label="Excluir minha conta" variant="danger" loading={deleting} onPress={confirm} />
        </AppCard>

        <AppText variant="caption" color={theme.colors.textMuted} style={styles.center}>
          Esqueceu a senha ou não consegue entrar? Veja outras formas de solicitar a exclusão em{' '}
          <AppText variant="caption" color={theme.colors.primary} style={styles.underline} onPress={() => void Linking.openURL(ACCOUNT_DELETION_URL)}>
            {ACCOUNT_DELETION_URL.replace(/^https:\/\//, '')}
          </AppText>
        </AppText>
      </FormScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  content: { padding: 16, gap: 12, paddingBottom: 36 },
  gap: { gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  flex: { flex: 1 },
  warning: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 10 },
  eye: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center' },
  center: { textAlign: 'center' },
  underline: { textDecorationLine: 'underline' },
});
