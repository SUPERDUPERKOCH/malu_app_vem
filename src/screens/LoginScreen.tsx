import { useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  type TextInputInstance,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '../auth';
import { AppButton, AppText, AppTextInput, VemIcon } from '../components';
import { useAppTheme } from '../theme';

type FieldError = {
  email?: string;
  password?: string;
  firstName?: string;
  lastName?: string;
};

function authErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  if (message.includes('invalid login credentials')) return 'E-mail ou senha incorretos.';
  if (message.includes('email not confirmed')) return 'Confirme seu e-mail antes de entrar.';
  if (message.includes('user already registered')) return 'Este e-mail já possui uma conta. Tente entrar.';
  if (message.includes('password')) return 'A senha não atende aos requisitos de segurança.';
  return 'Não foi possível concluir agora. Verifique os dados e tente novamente.';
}

export function LoginScreen() {
  const theme = useAppTheme();
  const { resetPassword, signIn, signUp } = useAuth();
  const passwordRef = useRef<TextInputInstance>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [registering, setRegistering] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<FieldError>({});
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const validate = (): boolean => {
    const next: FieldError = {};
    if (registering && !firstName.trim()) next.firstName = 'Digite seu nome.';
    if (registering && !lastName.trim()) next.lastName = 'Digite seu sobrenome.';
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) next.email = 'Confira o e-mail: parece que falta algo.';
    if (password.length < 6) next.password = 'A senha precisa ter pelo menos 6 caracteres.';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async (): Promise<void> => {
    setMessage('');
    if (!validate()) return;
    setSubmitting(true);
    try {
      if (registering) {
        const result = await signUp({ email, password, firstName, lastName });
        if (result.requiresEmailConfirmation) {
          setRegistering(false);
          setMessage('Conta criada. Confirme o link enviado ao seu e-mail e depois entre no app.');
        }
      } else {
        await signIn(email, password);
      }
      setPassword('');
    } catch (error) {
      setMessage(authErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const forgotPassword = async (): Promise<void> => {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setErrors({ email: 'Digite seu e-mail para receber o link.' });
      return;
    }
    setErrors({});
    try {
      await resetPassword(email);
      setMessage('Se esse e-mail estiver cadastrado, você receberá um link para criar uma nova senha.');
    } catch (error) {
      setMessage(authErrorMessage(error));
    }
  };

  const toggleMode = (): void => {
    setRegistering((current) => !current);
    setErrors({});
    setMessage('');
    setPassword('');
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.colors.brandSurface }]}>
      <StatusBar style="light" />
      <View style={[styles.ring, styles.ringOuter, { borderColor: `${theme.colors.accent}66` }]} />
      <View style={[styles.ring, styles.ringInner, { borderColor: `${theme.colors.accent}44` }]} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.brand}>
            <View style={[styles.brandBadge, { borderColor: theme.colors.brandText }]}>
              <AppText color={theme.colors.brandText} weight="800" style={styles.brandBadgeText}>VEM</AppText>
            </View>
            <AppText variant="title" color={theme.colors.brandText} weight="600">Vida em Movimento</AppText>
            <View style={[styles.goldLine, { backgroundColor: theme.colors.accent }]} />
            <AppText color={theme.colors.brandText} style={styles.tagline}>Bora juntas?</AppText>
          </View>

          <View style={[styles.card, { backgroundColor: theme.colors.surface, borderRadius: theme.radius.lg }]}>
            <View style={styles.cardHeading}>
              <AppText variant="title" weight="700">{registering ? 'Crie sua conta' : 'Que bom te ver aqui'}</AppText>
              <AppText color={theme.colors.textMuted}>Use o mesmo e-mail informado na compra da Kiwify.</AppText>
            </View>

            {!!message && (
              <View style={[styles.message, { backgroundColor: `${theme.colors.primary}14` }]}>
                <AppText variant="caption">{message}</AppText>
              </View>
            )}

            {registering && (
              <>
                <AppTextInput
                  label="Nome"
                  value={firstName}
                  onChangeText={(value) => { setFirstName(value); setErrors((current) => ({ ...current, firstName: undefined })); }}
                  error={errors.firstName}
                  placeholder="Seu nome"
                  autoCapitalize="words"
                  textContentType="givenName"
                />
                <AppTextInput
                  label="Sobrenome"
                  value={lastName}
                  onChangeText={(value) => { setLastName(value); setErrors((current) => ({ ...current, lastName: undefined })); }}
                  error={errors.lastName}
                  placeholder="Seu sobrenome"
                  autoCapitalize="words"
                  textContentType="familyName"
                />
              </>
            )}

            <AppTextInput
              label="E-mail"
              value={email}
              onChangeText={(value) => { setEmail(value); setErrors((current) => ({ ...current, email: undefined })); }}
              error={errors.email}
              placeholder="voce@email.com"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="username"
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
            />

            <AppTextInput
              ref={passwordRef}
              label="Senha"
              value={password}
              onChangeText={(value) => { setPassword(value); setErrors((current) => ({ ...current, password: undefined })); }}
              error={errors.password}
              placeholder="Sua senha"
              secureTextEntry={!showPassword}
              textContentType={registering ? 'newPassword' : 'password'}
              returnKeyType="done"
              onSubmitEditing={submit}
              rightAccessory={(
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  hitSlop={10}
                  onPress={() => setShowPassword((visible) => !visible)}
                  style={styles.eyeButton}
                >
                  <VemIcon name={showPassword ? 'eyeOff' : 'eye'} size={21} color={theme.colors.textMuted} />
                </Pressable>
              )}
            />

            <AppButton label={registering ? 'Criar conta' : 'Entrar'} loading={submitting} onPress={submit} />
            {!registering && (
              <Pressable accessibilityRole="button" onPress={forgotPassword} style={styles.linkButton}>
                <AppText variant="caption" color={theme.colors.textMuted} weight="700" style={styles.underline}>
                  Esqueci minha senha
                </AppText>
              </Pressable>
            )}
            <Pressable accessibilityRole="button" onPress={toggleMode} style={styles.linkButton}>
              <AppText variant="caption" color={theme.colors.primary} weight="800" style={styles.underline}>
                {registering ? 'Já tenho conta' : 'Primeiro acesso? Criar conta'}
              </AppText>
            </Pressable>
          </View>

          <Pressable onPress={() => Linking.openURL('https://pay.kiwify.com.br/MNAyuDA')} style={styles.footerLink}>
            <AppText variant="caption" color={theme.colors.brandText}>Ainda não faz parte? </AppText>
            <AppText variant="caption" color={theme.colors.accent} weight="800">Quero entrar na VEM</AppText>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safeArea: { flex: 1, overflow: 'hidden' },
  content: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 20, paddingVertical: 28 },
  ring: { position: 'absolute', borderWidth: 1.5, borderRadius: 999 },
  ringOuter: { width: 620, height: 620, top: '12%', left: '50%', marginLeft: -310 },
  ringInner: { width: 420, height: 420, top: '23%', left: '50%', marginLeft: -210 },
  brand: { alignItems: 'center', gap: 8, zIndex: 1 },
  brandBadge: { borderWidth: 1.5, borderRadius: 7, paddingHorizontal: 10, paddingVertical: 4 },
  brandBadgeText: { letterSpacing: 4, marginLeft: 4 },
  goldLine: { width: 54, height: 2, marginTop: 4 },
  tagline: { fontStyle: 'italic' },
  card: { width: '100%', maxWidth: 400, marginTop: 24, padding: 20, gap: 14, zIndex: 1 },
  cardHeading: { gap: 4 },
  message: { borderRadius: 10, padding: 10 },
  eyeButton: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center' },
  linkButton: { alignSelf: 'center', padding: 4 },
  underline: { textDecorationLine: 'underline' },
  footerLink: { flexDirection: 'row', marginTop: 18, padding: 8, zIndex: 1 },
});
