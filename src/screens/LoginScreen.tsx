import { useRef, useState } from 'react';
import { Pressable, StyleSheet, type TextInputInstance, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '../auth';
import { AppButton, AppText, AppTextInput, FormScrollView, VemIcon } from '../components';
import { checkEmailAccess, type EmailAccessFlow } from '../services/users';
import { useAppTheme } from '../theme';

type Step = 'email' | EmailAccessFlow;
type FieldError = { email?: string; password?: string; firstName?: string; lastName?: string };

function authErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  if (message.includes('invalid login credentials')) return 'E-mail ou senha incorretos.';
  if (message.includes('email not confirmed')) return 'Confirme seu e-mail antes de entrar.';
  if (message.includes('user already registered')) return 'Este e-mail já possui uma conta. Volte e tente entrar.';
  if (message.includes('password')) return 'A senha não atende aos requisitos de segurança.';
  return 'Não foi possível concluir agora. Confira sua conexão e tente novamente.';
}

export function LoginScreen() {
  const theme = useAppTheme();
  const { resetPassword, signIn, signUp } = useAuth();
  const passwordRef = useRef<TextInputInstance>(null);
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<FieldError>({});
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const validEmail = (): boolean => {
    if (/^\S+@\S+\.\S+$/.test(email.trim())) return true;
    setErrors({ email: 'Confira o e-mail: parece que falta algo.' });
    return false;
  };

  const checkEmail = async (): Promise<void> => {
    setMessage('');
    if (!validEmail()) return;
    setSubmitting(true);
    try {
      setStep(await checkEmailAccess(email, true));
      setErrors({}); setPassword('');
    } catch (error) { setMessage(authErrorMessage(error)); }
    finally { setSubmitting(false); }
  };

  const enter = async (): Promise<void> => {
    if (password.length < 6) { setErrors({ password: 'A senha precisa ter pelo menos 6 caracteres.' }); return; }
    setSubmitting(true); setMessage('');
    try { await signIn(email, password); setPassword(''); }
    catch (error) { setMessage(authErrorMessage(error)); }
    finally { setSubmitting(false); }
  };

  const register = async (): Promise<void> => {
    const next: FieldError = {};
    if (!firstName.trim()) next.firstName = 'Digite seu nome.';
    if (!lastName.trim()) next.lastName = 'Digite seu sobrenome.';
    if (password.length < 6) next.password = 'A senha precisa ter pelo menos 6 caracteres.';
    setErrors(next);
    if (Object.keys(next).length) return;
    setSubmitting(true); setMessage('');
    try {
      const result = await signUp({ email, password, firstName, lastName });
      if (result.requiresEmailConfirmation) {
        setStep('email'); setPassword(''); setFirstName(''); setLastName('');
        setMessage('Conta criada. Confirme o link enviado ao seu e-mail e depois continue por aqui.');
      }
    } catch (error) { setMessage(authErrorMessage(error)); }
    finally { setSubmitting(false); }
  };

  const forgotPassword = async (): Promise<void> => {
    setSubmitting(true); setMessage('');
    try { await resetPassword(email); setMessage('Se esse e-mail estiver cadastrado, você receberá um link para criar uma nova senha.'); }
    catch (error) { setMessage(authErrorMessage(error)); }
    finally { setSubmitting(false); }
  };

  const restart = (): void => { setStep('email'); setPassword(''); setFirstName(''); setLastName(''); setErrors({}); setMessage(''); };
  const heading = step === 'email' ? 'Vamos começar pelo seu e-mail' : step === 'sign_in' ? 'Digite sua senha' : step === 'register' ? 'Complete seu cadastro' : 'Compra não validada';

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.colors.brandSurface }]}>
      <StatusBar style="light" />
      <View style={[styles.ring, styles.ringOuter, { borderColor: `${theme.colors.accent}66` }]} />
      <View style={[styles.ring, styles.ringInner, { borderColor: `${theme.colors.accent}44` }]} />
        <FormScrollView bottomOffset={32} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.brand}>
            <View style={[styles.brandBadge, { borderColor: theme.colors.brandText }]}><AppText color={theme.colors.brandText} weight="800" style={styles.brandBadgeText}>VEM</AppText></View>
            <AppText variant="title" color={theme.colors.brandText} weight="600">Vida em Movimento</AppText>
            <View style={[styles.goldLine, { backgroundColor: theme.colors.accent }]} />
            <AppText color={theme.colors.brandText} style={styles.tagline}>Bora juntas?</AppText>
          </View>

          <View style={[styles.card, { backgroundColor: theme.colors.surface, borderRadius: theme.radius.lg }]}>
            <View style={styles.cardHeading}>
              <AppText variant="title" weight="700">{heading}</AppText>
              <AppText color={theme.colors.textMuted}>
                {step === 'email' && 'Use seu melhor e-mail para entrar ou criar sua conta.'}
                {step === 'sign_in' && email}
                {step === 'register' && 'Informe seu nome, sobrenome e crie uma senha. A assinatura será feita depois do login.'}
                {step === 'pending' && `Não encontramos uma compra ativa vinculada a ${email}.`}
              </AppText>
            </View>

            {!!message && <View style={[styles.message, { backgroundColor: `${theme.colors.primary}14` }]}><AppText variant="caption">{message}</AppText></View>}

            {step === 'email' && <><AppTextInput label="E-mail" value={email} onChangeText={(value) => { setEmail(value); setErrors({}); }} error={errors.email} placeholder="voce@email.com" autoCapitalize="none" autoCorrect={false} keyboardType="email-address" textContentType="username" returnKeyType="go" onSubmitEditing={() => void checkEmail()} /><AppButton label="Continuar" loading={submitting} onPress={() => void checkEmail()} /></>}

            {step === 'sign_in' && <><PasswordField inputRef={passwordRef} password={password} show={showPassword} error={errors.password} onChange={(value) => { setPassword(value); setErrors({}); }} onToggle={() => setShowPassword((value) => !value)} onSubmit={() => void enter()} /><AppButton label="Entrar" loading={submitting} onPress={() => void enter()} /><Pressable accessibilityRole="button" onPress={() => void forgotPassword()} style={styles.linkButton}><AppText variant="caption" color={theme.colors.textMuted} weight="700" style={styles.underline}>Esqueci minha senha</AppText></Pressable><BackLink onPress={restart} /></>}

            {step === 'register' && <><AppTextInput label="Nome" value={firstName} onChangeText={(value) => { setFirstName(value); setErrors((current) => ({ ...current, firstName: undefined })); }} error={errors.firstName} placeholder="Seu nome" autoCapitalize="words" textContentType="givenName" /><AppTextInput label="Sobrenome" value={lastName} onChangeText={(value) => { setLastName(value); setErrors((current) => ({ ...current, lastName: undefined })); }} error={errors.lastName} placeholder="Seu sobrenome" autoCapitalize="words" textContentType="familyName" /><PasswordField inputRef={passwordRef} password={password} show={showPassword} error={errors.password} newPassword onChange={(value) => { setPassword(value); setErrors((current) => ({ ...current, password: undefined })); }} onToggle={() => setShowPassword((value) => !value)} onSubmit={() => void register()} /><AppButton label="Criar minha conta" loading={submitting} onPress={() => void register()} /><BackLink onPress={restart} /></>}

            {step === 'pending' && <><View style={[styles.warning, { backgroundColor: `${theme.colors.danger}12`, borderColor: `${theme.colors.danger}55` }]}><VemIcon name="lock" size={22} color={theme.colors.danger} /><AppText variant="caption" color={theme.colors.danger} style={styles.flex}>O cadastro permanece bloqueado enquanto não houver uma compra ativa vinculada a este e-mail.</AppText></View><AppButton label="Verificar novamente" loading={submitting} onPress={() => void checkEmail()} /><BackLink onPress={restart} /></>}
          </View>
        </FormScrollView>
    </SafeAreaView>
  );
}

function PasswordField({ inputRef, password, show, error, newPassword, onChange, onToggle, onSubmit }: { inputRef: React.RefObject<TextInputInstance | null>; password: string; show: boolean; error?: string; newPassword?: boolean; onChange: (value: string) => void; onToggle: () => void; onSubmit: () => void }) {
  const theme = useAppTheme();
  return <AppTextInput ref={inputRef} label={newPassword ? 'Crie uma senha' : 'Senha'} value={password} onChangeText={onChange} error={error} placeholder={newPassword ? 'Mínimo de 6 caracteres' : 'Sua senha'} secureTextEntry={!show} textContentType={newPassword ? 'newPassword' : 'password'} returnKeyType="done" onSubmitEditing={onSubmit} rightAccessory={<Pressable accessibilityRole="button" accessibilityLabel={show ? 'Ocultar senha' : 'Mostrar senha'} hitSlop={10} onPress={onToggle} style={styles.eyeButton}><VemIcon name={show ? 'eyeOff' : 'eye'} size={21} color={theme.colors.textMuted} /></Pressable>} />;
}

function BackLink({ onPress }: { onPress: () => void }) { const theme = useAppTheme(); return <Pressable accessibilityRole="button" onPress={onPress} style={styles.linkButton}><AppText variant="caption" color={theme.colors.primary} weight="800" style={styles.underline}>Usar outro e-mail</AppText></Pressable>; }

const styles = StyleSheet.create({
  flex: { flex: 1 }, safeArea: { flex: 1, overflow: 'hidden' }, content: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 20, paddingVertical: 28 },
  ring: { position: 'absolute', borderWidth: 1.5, borderRadius: 999 }, ringOuter: { width: 620, height: 620, top: '12%', left: '50%', marginLeft: -310 }, ringInner: { width: 420, height: 420, top: '23%', left: '50%', marginLeft: -210 },
  brand: { alignItems: 'center', gap: 8, zIndex: 1 }, brandBadge: { borderWidth: 1.5, borderRadius: 7, paddingHorizontal: 10, paddingVertical: 4 }, brandBadgeText: { letterSpacing: 4, marginLeft: 4 }, goldLine: { width: 54, height: 2, marginTop: 4 }, tagline: { fontStyle: 'italic' },
  card: { width: '100%', maxWidth: 400, marginTop: 24, padding: 20, gap: 14, zIndex: 1 }, cardHeading: { gap: 4 }, message: { borderRadius: 10, padding: 10 }, eyeButton: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center' }, linkButton: { alignSelf: 'center', padding: 4 }, underline: { textDecorationLine: 'underline' }, footerLink: { flexDirection: 'row', marginTop: 18, padding: 8, zIndex: 1 }, warning: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 14, padding: 14 },
});
