import { SignJWT, createRemoteJWKSet, importPKCS8, jwtVerify } from 'npm:jose@5';

/**
 * Integração com a Google Play Developer API (androidpublisher v3), usada por
 * `verify-google-purchase` e `google-notifications`. Nunca confia em dados enviados pelo app:
 * todo status vem da consulta `purchases.subscriptionsv2.get` feita aqui no servidor.
 */

const API = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/androidpublisher';

export type GoogleStatus = 'active' | 'billing_retry' | 'paused' | 'expired' | 'pending';

export interface GoogleSubscriptionInfo {
  status: GoogleStatus;
  subscriptionState: string;
  userId: string | null;
  productId: string | null;
  basePlanId: string | null;
  orderId: string | null;
  linkedPurchaseToken: string | null;
  expiresAt: string | null;
  willRenew: boolean | null;
  acknowledged: boolean;
  testPurchase: boolean;
}

interface ServiceAccount { client_email: string; private_key: string }

export function googleConfig() {
  const packageName = Deno.env.get('GOOGLE_PLAY_PACKAGE_NAME');
  const productId = Deno.env.get('GOOGLE_PLAY_SUBSCRIPTION_ID');
  const rawAccount = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON');
  if (!packageName || !productId || !rawAccount) throw new Error('google_play_not_configured');
  const account = JSON.parse(rawAccount) as ServiceAccount;
  if (!account.client_email || !account.private_key) throw new Error('google_service_account_invalid');
  return { packageName, productId, account };
}

let cachedToken: { value: string; expiresAt: number } | null = null;

async function accessToken(account: ServiceAccount): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  const key = await importPKCS8(account.private_key, 'RS256');
  const now = Math.floor(Date.now() / 1000);
  const assertion = await new SignJWT({ scope: SCOPE })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(account.client_email)
    .setAudience(TOKEN_URL)
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  if (!response.ok) throw new Error(`google_oauth_failed_${response.status}`);
  const body = await response.json() as { access_token: string; expires_in: number };
  cachedToken = { value: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
  return body.access_token;
}

interface SubscriptionV2 {
  subscriptionState?: string;
  latestOrderId?: string;
  linkedPurchaseToken?: string;
  acknowledgementState?: string;
  testPurchase?: Record<string, unknown>;
  externalAccountIdentifiers?: { obfuscatedExternalAccountId?: string };
  lineItems?: Array<{
    productId?: string;
    expiryTime?: string;
    latestSuccessfulOrderId?: string;
    autoRenewingPlan?: { autoRenewEnabled?: boolean };
    offerDetails?: { basePlanId?: string };
  }>;
}

function mapStatus(state: string, expiresAt: string | null): GoogleStatus {
  const notExpired = !!expiresAt && new Date(expiresAt).getTime() > Date.now();
  switch (state) {
    case 'SUBSCRIPTION_STATE_ACTIVE':
    case 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD':
      return 'active';
    // Cancelada pela pessoa: o acesso continua até o fim do período já pago.
    case 'SUBSCRIPTION_STATE_CANCELED':
      return notExpired ? 'active' : 'expired';
    case 'SUBSCRIPTION_STATE_ON_HOLD':
      return 'billing_retry';
    case 'SUBSCRIPTION_STATE_PAUSED':
      return 'paused';
    case 'SUBSCRIPTION_STATE_PENDING':
      return 'pending';
    default:
      return 'expired';
  }
}

/** Consulta a assinatura na Google e devolve o status já normalizado. */
export async function fetchSubscription(purchaseToken: string, expectedProductId: string): Promise<GoogleSubscriptionInfo> {
  const { packageName, account } = googleConfig();
  const token = await accessToken(account);
  const response = await fetch(`${API}/${encodeURIComponent(packageName)}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (response.status === 404 || response.status === 410) throw new Error('google_purchase_not_found');
  if (!response.ok) throw new Error(`google_api_failed_${response.status}`);
  const data = await response.json() as SubscriptionV2;
  const item = data.lineItems?.find((line) => line.productId === expectedProductId) ?? data.lineItems?.[0];
  const expiresAt = item?.expiryTime ? new Date(item.expiryTime).toISOString() : null;
  const state = data.subscriptionState ?? 'SUBSCRIPTION_STATE_UNSPECIFIED';
  return {
    status: mapStatus(state, expiresAt),
    subscriptionState: state,
    userId: data.externalAccountIdentifiers?.obfuscatedExternalAccountId ?? null,
    productId: item?.productId ?? null,
    basePlanId: item?.offerDetails?.basePlanId ?? null,
    orderId: item?.latestSuccessfulOrderId ?? data.latestOrderId ?? null,
    linkedPurchaseToken: data.linkedPurchaseToken ?? null,
    expiresAt,
    willRenew: item?.autoRenewingPlan ? item.autoRenewingPlan.autoRenewEnabled !== false : null,
    acknowledged: data.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',
    testPurchase: !!data.testPurchase,
  };
}

/**
 * Confirma (acknowledge) a compra. Sem isso, o Google reembolsa e revoga a assinatura em 3 dias.
 * Feito no servidor para funcionar mesmo se o app fechar logo após a compra.
 */
export async function acknowledgeSubscription(purchaseToken: string, productId: string): Promise<void> {
  const { packageName, account } = googleConfig();
  const token = await accessToken(account);
  const response = await fetch(
    `${API}/${encodeURIComponent(packageName)}/purchases/subscriptions/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}:acknowledge`,
    { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: '{}' },
  );
  // 400 aqui costuma indicar compra já confirmada.
  if (!response.ok && response.status !== 400) throw new Error(`google_acknowledge_failed_${response.status}`);
}

/** Parâmetros na ordem de `public.record_google_subscription`. */
export function recordParams(userId: string, purchaseToken: string, info: GoogleSubscriptionInfo, productId: string, acknowledged: boolean) {
  return {
    p_user_id: userId,
    p_purchase_token: purchaseToken,
    p_linked_purchase_token: info.linkedPurchaseToken,
    p_product_id: info.productId ?? productId,
    p_base_plan_id: info.basePlanId,
    p_order_id: info.orderId,
    p_status: info.status,
    p_subscription_state: info.subscriptionState,
    p_expires_at: info.expiresAt,
    p_will_renew: info.willRenew,
    p_acknowledged: acknowledged,
    p_test_purchase: info.testPurchase,
  };
}

const googleJwks = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

/**
 * Autentica o push do Pub/Sub. Aceita o token OIDC assinado pelo Google (recomendado) e/ou
 * um segredo na URL (`?token=`), conforme as variáveis configuradas.
 */
export async function verifyPubSubRequest(request: Request): Promise<boolean> {
  const audience = Deno.env.get('GOOGLE_PUBSUB_AUDIENCE');
  const serviceAccount = Deno.env.get('GOOGLE_PUBSUB_SERVICE_ACCOUNT');
  const sharedToken = Deno.env.get('GOOGLE_RTDN_TOKEN');
  if (!audience && !sharedToken) throw new Error('google_rtdn_auth_not_configured');

  if (sharedToken && new URL(request.url).searchParams.get('token') !== sharedToken) return false;

  if (audience) {
    const bearer = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
    if (!bearer) return false;
    try {
      const { payload } = await jwtVerify(bearer, googleJwks, {
        issuer: ['https://accounts.google.com', 'accounts.google.com'],
        audience,
      });
      if (serviceAccount && (payload.email !== serviceAccount || payload.email_verified !== true)) return false;
    } catch {
      return false;
    }
  }
  return true;
}
