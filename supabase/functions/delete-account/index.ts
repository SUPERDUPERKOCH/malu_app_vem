import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * Exclui definitivamente a conta da pessoa autenticada (Apple 5.1.1(v) e Google Play).
 *
 * 1. Valida o JWT da própria pessoa — ninguém exclui a conta de outra.
 * 2. Apaga os arquivos dela no Storage (não são removidos por cascade).
 * 3. Exclui o usuário do Supabase Auth; perfil, treinos, dieta, evolução, corridas,
 *    lembretes e assinatura Apple saem por `on delete cascade`.
 *    Pedidos da Kiwify ficam desvinculados (`set null`) por obrigação fiscal.
 *
 * Excluir a conta NÃO cancela assinaturas na Apple, no Google Play ou na Kiwify.
 */

const STORAGE_BUCKETS = ['food-photos'];

const headers = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (status: number, body: Record<string, unknown>): Response =>
  new Response(JSON.stringify(body), { status, headers });

/** Lista recursivamente todos os arquivos abaixo de `prefix` (pastas no Storage são virtuais). */
async function listFiles(admin: SupabaseClient, bucket: string, prefix: string): Promise<string[]> {
  const files: string[] = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await admin.storage.from(bucket).list(prefix, { limit: pageSize, offset });
    if (error) throw error;
    if (!data?.length) break;
    for (const item of data) {
      const path = `${prefix}/${item.name}`;
      // Itens sem `id` são pastas.
      if (item.id) files.push(path);
      else files.push(...await listFiles(admin, bucket, path));
    }
    if (data.length < pageSize) break;
  }
  return files;
}

async function removeUserFiles(admin: SupabaseClient, userId: string): Promise<number> {
  let removed = 0;
  for (const bucket of STORAGE_BUCKETS) {
    const files = await listFiles(admin, bucket, userId);
    for (let index = 0; index < files.length; index += 100) {
      const chunk = files.slice(index, index + 100);
      const { error } = await admin.storage.from(bucket).remove(chunk);
      if (error) throw error;
      removed += chunk.length;
    }
  }
  return removed;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers });
  if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const url = Deno.env.get('SUPABASE_URL');
  const anon = Deno.env.get('SUPABASE_ANON_KEY');
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authorization = request.headers.get('Authorization');
  if (!url || !anon || !service) return json(500, { error: 'server_not_configured' });
  if (!authorization) return json(401, { error: 'not_authenticated' });

  let confirmation = '';
  try { confirmation = String((await request.json())?.confirmation ?? ''); } catch { /* validado abaixo */ }
  if (confirmation !== 'EXCLUIR') return json(400, { error: 'confirmation_required' });

  const authClient = createClient(url, anon, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: auth, error: authError } = await authClient.auth.getUser();
  if (authError || !auth.user) return json(401, { error: 'not_authenticated' });
  const userId = auth.user.id;

  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });

  try {
    const removedFiles = await removeUserFiles(admin, userId);
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) throw error;
    console.log(`Account deleted: ${userId} (${removedFiles} files removed)`);
    return json(200, { deleted: true });
  } catch (error) {
    console.error('Account deletion failed', userId, error);
    return json(500, { error: 'account_deletion_failed' });
  }
});
