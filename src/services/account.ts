import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from './supabase';

export class AccountDeletionError extends Error {}

async function functionErrorCode(error: unknown): Promise<string | null> {
  if (!(error instanceof FunctionsHttpError)) return null;
  try {
    const body = await (error.context as Response).json();
    return typeof body?.error === 'string' ? body.error : null;
  } catch {
    return null;
  }
}

/** Remove do aparelho tudo que pertence à conta: lembretes agendados e dados locais do VEM. */
async function clearLocalData(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync().catch(() => undefined);
  const keys = await AsyncStorage.getAllKeys().catch(() => [] as readonly string[]);
  const own = keys.filter((key) => key.startsWith('vem:') || key.startsWith('vem-'));
  if (own.length) await AsyncStorage.multiRemove(own).catch(() => undefined);
}

/**
 * Exclui definitivamente a conta: confirma a senha (reautenticação), pede a exclusão ao
 * servidor e encerra a sessão local. Não cancela assinaturas da Apple, Google ou Kiwify.
 */
export async function deleteMyAccount(password: string): Promise<void> {
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user?.email) throw new AccountDeletionError('Sua sessão expirou. Entre novamente e tente outra vez.');

  const reauth = await supabase.auth.signInWithPassword({ email: auth.user.email, password });
  if (reauth.error) {
    const invalid = reauth.error.message.toLowerCase().includes('invalid login credentials');
    throw new AccountDeletionError(invalid ? 'Senha incorreta.' : 'Não foi possível confirmar sua senha. Confira a conexão e tente novamente.');
  }

  const { data, error } = await supabase.functions.invoke<{ deleted?: boolean }>('delete-account', {
    body: { confirmation: 'EXCLUIR' },
  });
  if (error || !data?.deleted) {
    const code = await functionErrorCode(error);
    console.warn('delete-account failed', code ?? error);
    throw new AccountDeletionError('Não foi possível excluir sua conta agora. Confira a conexão e tente novamente. Se o problema continuar, fale com a equipe VEM.');
  }

  await clearLocalData();
  // O usuário já não existe no servidor; encerra só a sessão local.
  await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
}
