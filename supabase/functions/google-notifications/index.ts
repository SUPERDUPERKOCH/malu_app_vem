import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { acknowledgeSubscription, fetchSubscription, googleConfig, recordParams, verifyPubSubRequest } from '../_shared/google-play.ts';

const json = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json' },
});

interface DeveloperNotification {
  packageName?: string;
  eventTimeMillis?: string;
  subscriptionNotification?: { notificationType?: number; purchaseToken?: string; subscriptionId?: string };
  voidedPurchaseNotification?: { purchaseToken?: string; orderId?: string; productType?: number; refundType?: number };
  testNotification?: Record<string, unknown>;
}

/**
 * Real-time developer notifications (RTDN) do Google Play, entregues por push do Pub/Sub.
 * A notificação só avisa que algo mudou; o status real é sempre consultado na API do Google.
 * Respostas não-2xx fazem o Pub/Sub reenviar, por isso erros de validação respondem 200.
 */
Deno.serve(async (request) => {
  if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  const url = Deno.env.get('SUPABASE_URL');
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !service) return json(500, { error: 'server_not_configured' });

  let config: ReturnType<typeof googleConfig>;
  try {
    config = googleConfig();
    if (!await verifyPubSubRequest(request)) return json(401, { error: 'unauthorized' });
  } catch (error) {
    console.error('Google RTDN not configured', error);
    return json(500, { error: 'server_not_configured' });
  }

  let messageId = '';
  let notification: DeveloperNotification = {};
  try {
    const body = await request.json();
    messageId = String(body?.message?.messageId ?? body?.message?.message_id ?? '');
    const data = body?.message?.data;
    notification = JSON.parse(atob(String(data ?? ''))) as DeveloperNotification;
  } catch {
    return json(200, { received: true, ignored: true, reason: 'invalid_payload' });
  }

  if (notification.packageName !== config.packageName) return json(200, { received: true, ignored: true, reason: 'other_package' });
  if (notification.testNotification) return json(200, { received: true, test: true });

  const purchaseToken = notification.subscriptionNotification?.purchaseToken ?? notification.voidedPurchaseNotification?.purchaseToken;
  const subscriptionId = notification.subscriptionNotification?.subscriptionId;
  if (!purchaseToken) return json(200, { received: true, ignored: true, reason: 'no_purchase_token' });
  if (subscriptionId && subscriptionId !== config.productId) return json(200, { received: true, ignored: true, reason: 'other_product' });

  const admin = createClient(url, service);
  if (messageId) {
    const seen = await admin.from('google_notification_events').select('message_id').eq('message_id', messageId).maybeSingle();
    if (seen.data) return json(200, { received: true, duplicate: true });
  }

  const stored = await admin.from('google_subscriptions').select('user_id').eq('purchase_token', purchaseToken).maybeSingle();

  try {
    let info;
    try {
      info = await fetchSubscription(purchaseToken, config.productId);
    } catch (error) {
      // Token antigo que o Google já não retorna: encerra o acesso ligado a ele, se houver.
      if (!(error instanceof Error && error.message === 'google_purchase_not_found')) throw error;
      if (stored.data?.user_id) {
        await admin.rpc('record_google_subscription', {
          p_user_id: stored.data.user_id, p_purchase_token: purchaseToken, p_linked_purchase_token: null,
          p_product_id: config.productId, p_base_plan_id: null, p_order_id: null, p_status: 'expired',
          p_subscription_state: 'SUBSCRIPTION_STATE_EXPIRED', p_expires_at: null, p_will_renew: false,
          p_acknowledged: true, p_test_purchase: false,
        });
      }
      return json(200, { received: true, expired: true });
    }

    if (info.productId !== config.productId) return json(200, { received: true, ignored: true, reason: 'other_product' });
    const userId = info.userId ?? stored.data?.user_id ?? null;
    if (!userId) return json(200, { received: true, ignored: true, reason: 'no_account' });
    if (info.status === 'pending') return json(200, { received: true, pending: true });

    // Conta excluída com assinatura ainda ativa no Google: nada a atualizar.
    const profile = await admin.from('profiles').select('id').eq('id', userId).maybeSingle();
    if (profile.error) throw profile.error;
    if (!profile.data) return json(200, { received: true, ignored: true, reason: 'account_deleted' });

    let acknowledged = info.acknowledged;
    if (!acknowledged && info.status === 'active') {
      await acknowledgeSubscription(purchaseToken, config.productId);
      acknowledged = true;
    }

    const { error } = await admin.rpc('record_google_subscription', recordParams(userId, purchaseToken, info, config.productId, acknowledged));
    if (error) throw error;

    if (messageId) {
      await admin.from('google_notification_events').insert({
        message_id: messageId,
        notification_type: notification.subscriptionNotification?.notificationType ?? null,
        purchase_token: purchaseToken,
        payload: notification,
      });
    }
    return json(200, { received: true, status: info.status });
  } catch (error) {
    // Falha temporária (API do Google ou banco): 500 para o Pub/Sub tentar de novo.
    console.error('Google RTDN processing failed', error);
    return json(500, { error: 'processing_failed' });
  }
});
