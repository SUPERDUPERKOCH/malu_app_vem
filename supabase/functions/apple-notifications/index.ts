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

async function decodeApplePayload(signed: string) {
  const config = verifierConfig();
  const payload = await verifyAppleJws<Record<string, unknown>>(signed, config.rootsJson);
  if (payload.bundleId && payload.bundleId !== config.bundleId) throw new Error('apple_bundle_mismatch');
  if (payload.environment === 'Production' && payload.appAppleId && config.appAppleId && Number(payload.appAppleId) !== config.appAppleId) {
    throw new Error('apple_app_id_mismatch');
  }
  return payload;
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  const url = Deno.env.get('SUPABASE_URL');
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const expectedProduct = Deno.env.get('APPLE_SUBSCRIPTION_PRODUCT_ID');
  if (!url || !service || !expectedProduct) return json(500, { error: 'server_not_configured' });
  let signedPayload: string | undefined;
  try { signedPayload = (await request.json()).signedPayload; } catch { /* handled below */ }
  if (!signedPayload) return json(400, { error: 'signed_payload_required' });

  try {
    const notification = await decodeApplePayload(signedPayload);
    const data = notification.data as Record<string, unknown> | undefined;
    const signedTransaction = typeof data?.signedTransactionInfo === 'string' ? data.signedTransactionInfo : undefined;
    if (!signedTransaction || !notification.notificationUUID || !notification.notificationType) return json(200, { received: true, ignored: true });
    const transaction = await decodeApplePayload(signedTransaction);
    if (typeof transaction.appAccountToken !== 'string' || transaction.productId !== expectedProduct ||
      typeof transaction.transactionId !== 'string' || typeof transaction.originalTransactionId !== 'string') {
      return json(200, { received: true, ignored: true });
    }
    let willRenew: boolean | null = null;
    if (typeof data?.signedRenewalInfo === 'string') {
      const renewal = await decodeApplePayload(data.signedRenewalInfo);
      willRenew = renewal.autoRenewStatus === 1;
    }
    const expiresDate = typeof transaction.expiresDate === 'number' ? transaction.expiresDate : null;
    const expiresAt = expiresDate ? new Date(expiresDate).toISOString() : null;
    const revoked = !!transaction.revocationDate || ['REFUND', 'REVOKE'].includes(String(notification.notificationType));
    const billingRetry = ['DID_FAIL_TO_RENEW', 'GRACE_PERIOD_EXPIRED'].includes(String(notification.notificationType));
    const active = !revoked && !!expiresDate && expiresDate > Date.now();
    const status = billingRetry ? 'billing_retry' : active ? 'active' : 'expired';
    const admin = createClient(url, service);
    // O evento só é gravado depois do processamento: se algo falhar, a Apple reenvia
    // e o reenvio não pode ser descartado como duplicado.
    const seen = await admin.from('apple_notification_events').select('notification_uuid')
      .eq('notification_uuid', notification.notificationUUID).maybeSingle();
    if (seen.error) return json(500, { error: 'notification_lookup_failed' });
    if (seen.data) return json(200, { received: true, duplicate: true });
    const persistEvent = async () => {
      const persisted = await admin.from('apple_notification_events').insert({
        notification_uuid: notification.notificationUUID,
        notification_type: notification.notificationType,
        subtype: notification.subtype ?? null,
        payload: notification,
      });
      return !persisted.error || persisted.error.code === '23505';
    };
    // Após uma recuperação de conta, appAccountToken ainda aponta para a conta
    // original; originalTransactionId identifica o novo vínculo persistido.
    const stored = await admin.from('apple_subscriptions').select('user_id')
      .eq('original_transaction_id', transaction.originalTransactionId).maybeSingle();
    if (stored.error) return json(500, { error: 'subscription_lookup_failed' });
    const userId = stored.data?.user_id ?? transaction.appAccountToken;
    const profile = await admin.from('profiles').select('id').eq('id', userId).maybeSingle();
    if (profile.error) return json(500, { error: 'profile_lookup_failed' });
    if (!profile.data) {
      if (!await persistEvent()) return json(500, { error: 'notification_persist_failed' });
      return json(200, { received: true, ignored: true, reason: 'account_deleted' });
    }
    const { error } = await admin.rpc('record_apple_subscription', {
      p_user_id: userId,
      p_original_transaction_id: transaction.originalTransactionId,
      p_product_id: transaction.productId,
      p_environment: typeof transaction.environment === 'string' ? transaction.environment :
        typeof data?.environment === 'string' ? data.environment : 'Unknown',
      p_status: status,
      p_expires_at: expiresAt,
      p_will_renew: willRenew,
      p_last_transaction_id: transaction.transactionId,
    });
    if (error) return json(500, { error: 'subscription_update_failed' });
    if (!await persistEvent()) return json(500, { error: 'notification_persist_failed' });
    return json(200, { received: true });
  } catch (error) {
    console.error('Apple notification verification failed', error);
    return json(401, { error: 'invalid_apple_notification' });
  }
});
