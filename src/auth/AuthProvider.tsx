import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
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
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (input: RegisterUserInput) => Promise<RegisterUserResult>;
  resetPassword: (email: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [access, setAccess] = useState<AccessCheck | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) setProfileError(error.message);
      setSession(data.session);
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
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase());
    if (error) throw error;
  }, []);

  const refreshProfile = useCallback(async (): Promise<void> => {
    if (!session?.user.id) return;
    await loadProfile(session.user.id);
  }, [loadProfile, session?.user.id]);

  const signOut = useCallback(async (): Promise<void> => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setProfile(null);
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    session,
    profile,
    access,
    loading: initializing || (!!session && profileLoading),
    profileError,
    signIn,
    signUp,
    resetPassword,
    refreshProfile,
    signOut,
  }), [
    access,
    initializing,
    profile,
    profileError,
    profileLoading,
    refreshProfile,
    resetPassword,
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
