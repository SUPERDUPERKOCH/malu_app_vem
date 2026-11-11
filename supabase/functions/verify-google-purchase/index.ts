import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { acknowledgeSubscription, fetchSubscription, googleConfig, recordParams } from '../_shared/google-play.ts';

const json = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json' },
});

/**
 * Valida uma compra do Google Play enviada pelo app autenticado.
 * O app manda apenas o purchaseToken; produto, dono e status vêm da API do Google.
 */
Deno.serve(async (request) => {
  if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  const url = Deno.env.get('SUPABASE_URL');
  const anon = Deno.env.get('SUPABASE_ANON_KEY');
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authorization = request.headers.get('Authorization');
  if (!url || !anon || !service) return json(500, { error: 'server_not_configured' });
  if (!authorization) return json(401, { error: 'not_authenticated' });

  let config: ReturnType<typeof googleConfig>;
  try { config = googleConfig(); } catch (error) {
    console.error('Google Play not configured', error);
    return json(500, { error: 'server_not_configured' });
  }

  const authClient = createClient(url, anon, { global: { headers: { Authorization: authorization } } });
  const { data: auth, error: authError } = await authClient.auth.getUser();
  if (authError || !auth.user) return json(401, { error: 'not_authenticated' });

  let purchaseToken: string | undefined;
  try { purchaseToken = (await request.json()).purchaseToken; } catch { /* validado abaixo */ }
  if (!purchaseToken || typeof purchaseToken !== 'string' || purchaseToken.length > 4096) {
    return json(400, { error: 'purchase_token_required' });
  }

  try {
    const info = await fetchSubscription(purchaseToken, config.productId);
    if (info.productId !== config.productId) return json(403, { error: 'unexpected_product' });
    // obfuscatedAccountId é definido pelo app com o UUID do Supabase no momento da compra.
    if (info.userId !== auth.user.id) return json(403, { error: 'purchase_account_mismatch' });
    if (info.status === 'pending') return json(200, { active: false, pending: true });

    let acknowledged = info.acknowledged;
    if (!acknowledged && info.status === 'active') {
      await acknowledgeSubscription(purchaseToken, config.productId);
      acknowledged = true;
    }

    const admin = createClient(url, service);
    const { error } = await admin.rpc('record_google_subscription', recordParams(auth.user.id, purchaseToken, info, config.productId, acknowledged));
    if (error) {
      console.error('record_google_subscription failed', error);
      return json(500, { error: 'subscription_update_failed' });
    }
    return json(200, { active: info.status === 'active', status: info.status, expiresAt: info.expiresAt });
  } catch (error) {
    console.error('Google purchase verification failed', error);
    const message = error instanceof Error ? error.message : '';
    if (message === 'google_purchase_not_found') return json(404, { error: 'invalid_google_purchase' });
    return json(502, { error: 'google_verification_failed' });
  }
});
