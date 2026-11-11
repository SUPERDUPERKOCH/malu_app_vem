import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { verifyAppleJws } from '../_shared/apple-jws.ts';

const json = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json' },
});

function verifierConfig() {
  const bundleId = Deno.env.get('APPLE_BUNDLE_ID');
  const rootsJson = Deno.env.get('APPLE_ROOT_CERTIFICATES_BASE64');
  const appAppleId = Number(Deno.env.get('APPLE_APP_ID')) || undefined;
  if (!bundleId || !rootsJson) throw new Error('apple_verifier_not_configured');
  return { bundleId, rootsJson, appAppleId };
}

async function verifyTransaction(signed: string) {
  const config = verifierConfig();
  const transaction = await verifyAppleJws<Record<string, unknown>>(signed, config.rootsJson);
  if (transaction.bundleId !== config.bundleId) throw new Error('apple_bundle_mismatch');
  if (transaction.environment === 'Production' && config.appAppleId && Number(transaction.appAppleId) !== config.appAppleId) {
    throw new Error('apple_app_id_mismatch');
  }
  return transaction;
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  const url = Deno.env.get('SUPABASE_URL');
  const anon = Deno.env.get('SUPABASE_ANON_KEY');
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const expectedProduct = Deno.env.get('APPLE_SUBSCRIPTION_PRODUCT_ID');
  const authorization = request.headers.get('Authorization');
  if (!url || !anon || !service || !expectedProduct || !authorization) return json(500, { error: 'server_not_configured' });

  const authClient = createClient(url, anon, { global: { headers: { Authorization: authorization } } });
  const { data: auth, error: authError } = await authClient.auth.getUser();
  if (authError || !auth.user) return json(401, { error: 'not_authenticated' });

  let signedTransaction: string | undefined;
  try { signedTransaction = (await request.json()).signedTransaction; } catch { /* handled below */ }
  if (!signedTransaction) return json(400, { error: 'signed_transaction_required' });

  try {
    const transaction = await verifyTransaction(signedTransaction);
    if (transaction.productId !== expectedProduct) return json(403, { error: 'unexpected_product' });
    if (typeof transaction.transactionId !== 'string' || typeof transaction.originalTransactionId !== 'string' || typeof transaction.expiresDate !== 'number') {
      return json(422, { error: 'incomplete_transaction' });
    }
    const expiresAt = new Date(transaction.expiresDate).toISOString();
    const active = !transaction.revocationDate && transaction.expiresDate > Date.now();
    const admin = createClient(url, service);
    if (transaction.appAccountToken !== auth.user.id) {
      if (typeof transaction.appAccountToken !== 'string') return json(403, { error: 'purchase_account_mismatch' });
      // Recuperação após exclusão da conta VEM original: a loja prova a posse da
      // assinatura, mas nunca transferimos enquanto o perfil/registro antigo existir.
      const [originalProfile, existingPurchase] = await Promise.all([
        admin.from('profiles').select('id').eq('id', transaction.appAccountToken).maybeSingle(),
        admin.from('apple_subscriptions').select('user_id').eq('original_transaction_id', transaction.originalTransactionId).maybeSingle(),
      ]);
      if (originalProfile.error || existingPurchase.error) return json(500, { error: 'subscription_lookup_failed' });
      if (originalProfile.data || (existingPurchase.data && existingPurchase.data.user_id !== auth.user.id)) {
        return json(403, { error: 'purchase_account_mismatch' });
      }
    }
    const { error } = await admin.rpc('record_apple_subscription', {
      p_user_id: auth.user.id,
      p_original_transaction_id: transaction.originalTransactionId,
      p_product_id: transaction.productId,
      p_environment: typeof transaction.environment === 'string' ? transaction.environment : 'Unknown',
      p_status: active ? 'active' : 'expired',
      p_expires_at: expiresAt,
      p_will_renew: true,
      p_last_transaction_id: transaction.transactionId,
    });
    if (error) return json(500, { error: 'subscription_update_failed' });
    return json(200, { active, expiresAt });
  } catch (error) {
    console.error('Apple transaction verification failed', error);
    return json(401, { error: 'invalid_apple_transaction' });
  }
});
