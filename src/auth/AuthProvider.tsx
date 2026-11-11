import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import { Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@supabase/supabase-js';
import type { UserProfile } from '../models';
import { supabase } from '../services/supabase';
import {
  getUserProfileById,
  registerUser,
  validateMyAccess,
  type AccessCheck,
  type RegisterUserInput,
  type RegisterUserResult,
} from '../services/users';
import { importLegacyDataOnce } from '../services/legacyImport';

export type AuthSession = Session;

interface AuthContextValue {
  session: AuthSession | null;
  profile: UserProfile | null;
  /** Resultado da última validação de acesso (role + transações da Kiwify). */
  access: AccessCheck | null;
  loading: boolean;
  profileError: string | null;
  recoveringPassword: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (input: RegisterUserInput) => Promise<RegisterUserResult>;
  resetPassword: (email: string) => Promise<void>;
  updateRecoveredPassword: (password: string) => Promise<void>;
  cancelPasswordRecovery: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const PASSWORD_RECOVERY_KEY = '@vem/password-recovery';

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [access, setAccess] = useState<AccessCheck | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [recoveringPassword, setRecoveringPassword] = useState(false);

  useEffect(() => {
    let active = true;

    Promise.all([supabase.auth.getSession(), AsyncStorage.getItem(PASSWORD_RECOVERY_KEY)]).then(([{ data, error }, recovery]) => {
      if (!active) return;
      if (error) setProfileError(error.message);
      setSession(data.session);
      setRecoveringPassword(recovery === 'active' && !!data.session);
      setInitializing(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      setSession(nextSession);
      if (!nextSession) {
        setProfile(null);
        setAccess(null);
        setProfileError(null);
      }
      setInitializing(false);
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    const handled = new Set<string>();
    const handleRecoveryUrl = async (url: string | null | undefined): Promise<void> => {
      if (!url || handled.has(url)) return;
      const parsed = new URL(url);
      if (parsed.protocol !== 'vem:' || (parsed.hostname !== 'reset-password' && parsed.pathname !== '/reset-password')) return;
      handled.add(url);
      const hash = new URLSearchParams(parsed.hash.replace(/^#/, ''));
      const type = parsed.searchParams.get('type') ?? hash.get('type');
      const error = parsed.searchParams.get('error_description') ?? hash.get('error_description');
      if (error) throw new Error(decodeURIComponent(error.replace(/\+/g, ' ')));
      if (type && type !== 'recovery') throw new Error('invalid_recovery_link');
      await AsyncStorage.setItem(PASSWORD_RECOVERY_KEY, 'active');
      if (mounted) setRecoveringPassword(true);
      const code = parsed.searchParams.get('code');
      try {
        if (code) {
          const result = await supabase.auth.exchangeCodeForSession(code);
          if (result.error) throw result.error;
        } else {
          const accessToken = hash.get('access_token') ?? parsed.searchParams.get('access_token');
          const refreshToken = hash.get('refresh_token') ?? parsed.searchParams.get('refresh_token');
          if (!accessToken || !refreshToken) throw new Error('recovery_session_missing');
          const result = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
          if (result.error) throw result.error;
        }
      } catch (recoveryError) {
        await AsyncStorage.removeItem(PASSWORD_RECOVERY_KEY);
        if (mounted) setRecoveringPassword(false);
        throw recoveryError;
      }
    };
    const open = ({ url }: { url: string }) => { void handleRecoveryUrl(url).catch((error) => {
      if (mounted) setProfileError(error instanceof Error ? error.message : 'password_recovery_failed');
    }); };
    void Linking.getInitialURL().then(handleRecoveryUrl).catch((error) => {
      if (mounted) setProfileError(error instanceof Error ? error.message : 'password_recovery_failed');
    });
    const subscription = Linking.addEventListener('url', open);
    return () => { mounted = false; subscription.remove(); };
  }, []);

  const loadProfile = useCallback(async (userId: string): Promise<void> => {
    setProfileLoading(true);
    setProfileError(null);
    try {
      let nextProfile = await getUserProfileById(userId);
      // 1. Role primeiro: admin e coach entram sem depender de compra.
      // 2. Demais roles: o servidor vincula e reavalia as transações da Kiwify antes de liberar o app.
      if (nextProfile && nextProfile.role !== 'admin' && nextProfile.role !== 'coach') {
        try {
          const check = await validateMyAccess();
          setAccess(check);
          nextProfile = { ...nextProfile, subscriptionStatus: check.status };
        } catch (error) {
          // Sem conexão com a validação, vale o último status salvo no perfil (o conteúdo continua protegido pelo RLS).
          setAccess(null);
          setProfileError(error instanceof Error ? `access_check_failed: ${error.message}` : 'access_check_failed');
        }
      } else {
        setAccess(null);
      }
      const canImport = nextProfile?.active && (nextProfile.role === 'admin' || nextProfile.role === 'coach' || nextProfile.subscriptionStatus === 'active');
      if (nextProfile && canImport && await importLegacyDataOnce(userId, nextProfile.legacyImportedAt)) {
        nextProfile = await getUserProfileById(userId);
      }
      setProfile(nextProfile);
      if (!nextProfile) setProfileError('profile_not_found');
    } catch (error) {
      setProfile(null);
      setProfileError(error instanceof Error ? error.message : 'profile_load_failed');
    } finally {
      setProfileLoading(false);
    }
  }, []);

  useEffect(() => {
    const userId = session?.user.id;
    if (!userId) return;
    void loadProfile(userId);
  }, [loadProfile, session?.user.id]);

  const signIn = useCallback(async (email: string, password: string): Promise<void> => {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (error) throw error;
  }, []);

  const signUp = useCallback(async (input: RegisterUserInput): Promise<RegisterUserResult> => {
    return registerUser(input);
  }, []);

  const resetPassword = useCallback(async (email: string): Promise<void> => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: 'vem://reset-password',
    });
    if (error) throw error;
  }, []);

  const updateRecoveredPassword = useCallback(async (password: string): Promise<void> => {
    if (!recoveringPassword) throw new Error('password_recovery_not_active');
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
    const signOutResult = await supabase.auth.signOut();
    if (signOutResult.error) throw signOutResult.error;
    await AsyncStorage.removeItem(PASSWORD_RECOVERY_KEY);
    setRecoveringPassword(false);
    setProfile(null);
  }, [recoveringPassword]);

  const cancelPasswordRecovery = useCallback(async (): Promise<void> => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    await AsyncStorage.removeItem(PASSWORD_RECOVERY_KEY);
    setRecoveringPassword(false);
    setProfile(null);
  }, []);

  const refreshProfile = useCallback(async (): Promise<void> => {
    if (!session?.user.id) return;
    await loadProfile(session.user.id);
  }, [loadProfile, session?.user.id]);

  const signOut = useCallback(async (): Promise<void> => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    await AsyncStorage.removeItem(PASSWORD_RECOVERY_KEY);
    setRecoveringPassword(false);
    setProfile(null);
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    session,
    profile,
    access,
    loading: initializing || (!!session && profileLoading),
    profileError,
    recoveringPassword,
    signIn,
    signUp,
    resetPassword,
    updateRecoveredPassword,
    cancelPasswordRecovery,
    refreshProfile,
    signOut,
  }), [
    access,
    initializing,
    profile,
    profileError,
    recoveringPassword,
    profileLoading,
    refreshProfile,
    resetPassword,
    updateRecoveredPassword,
    cancelPasswordRecovery,
    session,
    signIn,
    signOut,
    signUp,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth deve ser usado dentro de AuthProvider');
  return context;
}
