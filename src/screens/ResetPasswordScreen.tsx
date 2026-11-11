import { useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, type TextInputInstance, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '../auth';
import { AppButton, AppText, AppTextInput, FormScrollView, VemIcon } from '../components';
import { useAppTheme } from '../theme';

export function ResetPasswordScreen() {
  const theme = useAppTheme();
  const { cancelPasswordRecovery, updateRecoveredPassword } = useAuth();
  const confirmationRef = useRef<TextInputInstance>(null);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const save = async (): Promise<void> => {
    if (password.length < 8) { setError('Use pelo menos 8 caracteres.'); return; }
    if (password !== confirmation) { setError('As senhas não são iguais.'); return; }
    setSubmitting(true); setError('');
    try {
      await updateRecoveredPassword(password);
      Alert.alert('Senha alterada', 'Sua nova senha foi salva. Entre novamente para continuar.');
    }
    catch { setError('Não foi possível atualizar a senha. Solicite um novo link e tente novamente.'); }
    finally { setSubmitting(false); }
  };

  const cancel = async (): Promise<void> => {
    setSubmitting(true); setError('');
    try { await cancelPasswordRecovery(); }
    catch { setError('Não foi possível sair da recuperação agora. Tente novamente.'); setSubmitting(false); }
  };

  const field = (label: string, value: string, confirmationField: boolean) => (
    <AppTextInput
      ref={confirmationField ? confirmationRef : undefined}
      label={label}
      value={value}
      onChangeText={(next) => { confirmationField ? setConfirmation(next) : setPassword(next); setError(''); }}
      placeholder="Mínimo de 8 caracteres"
      secureTextEntry={confirmationField ? !showConfirmation : !showPassword}
      textContentType="newPassword"
      returnKeyType={confirmationField ? 'done' : 'next'}
      onSubmitEditing={() => confirmationField ? void save() : confirmationRef.current?.focus()}
      rightAccessory={<Pressable accessibilityRole="button" accessibilityLabel="Mostrar ou ocultar senha" hitSlop={10} onPress={() => confirmationField ? setShowConfirmation((current) => !current) : setShowPassword((current) => !current)} style={styles.eye}>
        <VemIcon name={(confirmationField ? showConfirmation : showPassword) ? 'eyeOff' : 'eye'} size={21} color={theme.colors.textMuted} />
      </Pressable>}
    />
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.brandSurface }]}>
      <StatusBar style="light" />
      <FormScrollView bottomOffset={32} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={[styles.badge, { borderColor: theme.colors.brandText }]}><AppText color={theme.colors.brandText} weight="800" style={styles.badgeText}>VEM</AppText></View>
        <View style={[styles.card, { backgroundColor: theme.colors.surface, borderRadius: theme.radius.lg }]}>
          <View style={[styles.icon, { backgroundColor: `${theme.colors.primary}16` }]}><VemIcon name="lock" size={30} color={theme.colors.primary} /></View>
          <AppText variant="title" weight="700" style={styles.center}>Crie uma nova senha</AppText>
          <AppText color={theme.colors.textMuted} style={styles.center}>Escolha uma senha que você ainda não utiliza em outros serviços.</AppText>
          {field('Nova senha', password, false)}
          {field('Confirmar nova senha', confirmation, true)}
          {!!error && <AppText variant="caption" color={theme.colors.danger}>{error}</AppText>}
          <AppButton label="Salvar nova senha" loading={submitting} onPress={() => void save()} />
          <AppButton label="Cancelar e voltar ao login" variant="ghost" disabled={submitting} onPress={() => void cancel()} />
        </View>
      </FormScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 }, content: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  badge: { borderWidth: 1.5, borderRadius: 7, paddingHorizontal: 12, paddingVertical: 6, marginBottom: 22 }, badgeText: { letterSpacing: 4, marginLeft: 4 },
  card: { width: '100%', maxWidth: 400, padding: 20, gap: 14 }, icon: { width: 62, height: 62, borderRadius: 31, alignSelf: 'center', alignItems: 'center', justifyContent: 'center' },
  center: { textAlign: 'center' }, eye: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center' },
});
