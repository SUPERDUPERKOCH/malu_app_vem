import { Linking, Platform } from 'react-native';
import { FunctionsHttpError } from '@supabase/supabase-js';
import {
  ErrorCode,
  deepLinkToSubscriptions,
  fetchProducts,
  finishTransaction,
  getAvailablePurchases,
  initConnection,
  purchaseErrorListener,
  purchaseUpdatedListener,
  requestPurchase,
  showManageSubscriptionsIOS,
  type ProductSubscription,
  type Purchase,
  type SubscriptionPeriodUnit,
} from 'expo-iap';
import { supabase } from './supabase';

/**
 * Assinatura pelas lojas: StoreKit (iOS) e Google Play Billing (Android).
 * O app nunca libera acesso sozinho: toda compra é validada nas Edge Functions
 * `verify-apple-purchase` / `verify-google-purchase`, que atualizam o perfil no Supabase.
 */

const IS_IOS = Platform.OS === 'ios';
const IS_ANDROID = Platform.OS === 'android';
const PRODUCT_ID = (IS_IOS
  ? process.env.EXPO_PUBLIC_APPLE_SUBSCRIPTION_PRODUCT_ID
  : process.env.EXPO_PUBLIC_GOOGLE_SUBSCRIPTION_PRODUCT_ID)?.trim();
const ANDROID_PACKAGE = 'com.gkvidotto.vemvidaemmovimento';
const APPLE_SUBSCRIPTIONS_URL = 'https://apps.apple.com/account/subscriptions';
const GOOGLE_SUBSCRIPTIONS_URL = `https://play.google.com/store/account/subscriptions?package=${ANDROID_PACKAGE}`;

/** Nome da loja do aparelho, para os textos da interface. */
export const STORE_NAME = IS_IOS ? 'App Store' : 'Google Play';

export interface SubscriptionOffer {
  title: string;
  description: string;
  price: string;
  period: string;
  productId: string;
  /** Android: token da oferta do plano base, exigido pelo Google Play Billing. */
  offerToken?: string;
}

export interface PurchaseResult { active: boolean; cancelled: boolean; pending?: boolean }

/** Erro com mensagem já pronta para exibir ao usuário. */
export class SubscriptionError extends Error {
  constructor(public readonly code: string, message: string) { super(message); }
}

const FRIENDLY: Record<string, string> = {
  subscription_not_configured: 'A assinatura ainda não está disponível. Tente novamente mais tarde.',
  subscription_unavailable: `A assinatura ainda não está disponível na ${STORE_NAME}. Tente novamente mais tarde.`,
  store_unavailable: `Não foi possível conectar à ${STORE_NAME}. Confira a conexão e tente novamente.`,
  purchase_data_missing: `A ${STORE_NAME} não retornou os dados da compra. Tente restaurar as compras.`,
  subscription_inactive: 'Esta assinatura não está mais ativa. Assine novamente para voltar a acessar o VEM.',
  purchase_account_mismatch: `Esta assinatura da ${STORE_NAME} pertence a outra conta VEM. Entre com a conta usada na assinatura.`,
  unexpected_product: 'A compra encontrada não corresponde à assinatura do VEM.',
  invalid_purchase: `Não foi possível validar a compra com a ${STORE_NAME}. Tente restaurar as compras.`,
  subscription_update_failed: 'A compra foi feita, mas não conseguimos liberar o acesso agora. Toque em Restaurar compras em alguns instantes.',
  not_authenticated: 'Sua sessão expirou. Entre novamente e tente outra vez.',
  [ErrorCode.NetworkError]: `Sem conexão com a ${STORE_NAME}. Confira a internet e tente novamente.`,
  [ErrorCode.ServiceError]: `A ${STORE_NAME} está indisponível no momento. Tente novamente em instantes.`,
  [ErrorCode.ServiceDisconnected]: `A ${STORE_NAME} está indisponível no momento. Tente novamente em instantes.`,
  [ErrorCode.BillingUnavailable]: 'Compras não estão disponíveis neste aparelho. Confira se a Google Play Store está atualizada e se você entrou com uma conta Google.',
  [ErrorCode.ItemUnavailable]: `A assinatura não está disponível para a sua conta ${IS_IOS ? 'Apple' : 'Google'}.`,
  [ErrorCode.SkuNotFound]: `A assinatura ainda não está disponível na ${STORE_NAME}.`,
  [ErrorCode.AlreadyOwned]: 'Você já tem esta assinatura. Toque em Restaurar compras.',
  [ErrorCode.IapNotAvailable]: IS_IOS
    ? 'Compras estão desativadas neste aparelho. Verifique as restrições em Ajustes > Tempo de Uso.'
    : 'Compras não estão disponíveis neste aparelho.',
};

/** Códigos devolvidos pelas Edge Functions → códigos de mensagem. */
const SERVER_CODES: Record<string, string> = {
  apple_subscription_inactive: 'subscription_inactive',
  invalid_apple_transaction: 'invalid_purchase',
  incomplete_transaction: 'invalid_purchase',
  invalid_google_purchase: 'invalid_purchase',
  google_verification_failed: 'invalid_purchase',
  purchase_token_required: 'purchase_data_missing',
  signed_transaction_required: 'purchase_data_missing',
};
const DEFAULT_MESSAGE = 'Não foi possível concluir agora. Confira a conexão e tente novamente.';

function codeOf(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') return error.code;
  return error instanceof Error ? error.message : '';
}

function toSubscriptionError(error: unknown): SubscriptionError {
  if (error instanceof SubscriptionError) return error;
  const raw = codeOf(error);
  const code = SERVER_CODES[raw] ?? raw;
  return new SubscriptionError(code || 'unknown', FRIENDLY[code] ?? DEFAULT_MESSAGE);
}

const fail = (code: string): SubscriptionError => toSubscriptionError(new Error(code));

/** Mensagem segura para exibir ao usuário a partir de qualquer erro do fluxo de assinatura. */
export function subscriptionErrorMessage(error: unknown): string {
  return toSubscriptionError(error).message;
}

let connected = false;

async function connect(): Promise<void> {
  if (!connected) connected = await initConnection().catch(() => false);
  if (!connected) throw fail('store_unavailable');
}

async function currentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw fail('not_authenticated');
  return data.user.id;
}

const UNIT_LABELS: Record<string, [string, string]> = {
  day: ['dia', 'dias'], week: ['semana', 'semanas'], month: ['mês', 'meses'], year: ['ano', 'anos'],
};

function formatPeriod(unit: string | null | undefined, count: number): string {
  const labels = UNIT_LABELS[String(unit ?? '').toLowerCase()];
  if (!labels) return '';
  return count === 1 ? `por ${labels[0]}` : `a cada ${count} ${labels[1]}`;
}

/** Converte períodos ISO 8601 do Google ("P1M", "P1Y", "P1W") em unidade + quantidade. */
function parseIsoPeriod(value: string | undefined): [SubscriptionPeriodUnit, number] | null {
  const match = /^P(\d+)([DWMY])$/.exec(value ?? '');
  if (!match) return null;
  const units: Record<string, SubscriptionPeriodUnit> = { D: 'day', W: 'week', M: 'month', Y: 'year' };
  return [units[match[2]!]!, Number(match[1])];
}

function toOffer(product: ProductSubscription): SubscriptionOffer {
  const base = {
    title: product.title || 'Clube VEM',
    description: product.description || 'Acesso completo ao VEM.',
    productId: product.id,
  };
  if (product.platform === 'ios') {
    return {
      ...base,
      price: product.displayPrice,
      period: formatPeriod(product.subscriptionPeriodUnitIOS, Number(product.subscriptionPeriodNumberIOS ?? '1') || 1),
    };
  }
  // Android: usa o plano base (uma única fase de preço recorrente), sem ofertas promocionais.
  const offers = (product.subscriptionOffers ?? []).filter((offer) => !!offer.offerTokenAndroid);
  const offer = offers.find((item) => (item.pricingPhasesAndroid?.pricingPhaseList.length ?? 0) === 1) ?? offers[0];
  if (!offer?.offerTokenAndroid) throw fail('subscription_unavailable');
  const phases = offer.pricingPhasesAndroid?.pricingPhaseList ?? [];
  const recurring = phases[phases.length - 1];
  const period = offer.period
    ? [offer.period.unit, offer.period.value || 1] as const
    : parseIsoPeriod(recurring?.billingPeriod);
  return {
    ...base,
    title: product.nameAndroid || base.title,
    price: recurring?.formattedPrice || offer.displayPrice || product.displayPrice,
    period: period ? formatPeriod(period[0], period[1]) : '',
    offerToken: offer.offerTokenAndroid,
  };
}

async function serverErrorCode(error: unknown, fallback: string): Promise<string> {
  if (!(error instanceof FunctionsHttpError)) return fallback;
  try { return (await (error.context as Response).json())?.error ?? fallback; } catch { return fallback; }
}

/** Valida a compra no servidor e, se a loja confirmou, finaliza a transação no aparelho. */
async function validateAndFinish(purchase: Purchase): Promise<PurchaseResult> {
  if (!purchase.purchaseToken) throw fail('purchase_data_missing');
  const { data, error } = IS_IOS
    ? await supabase.functions.invoke<{ active?: boolean; error?: string }>('verify-apple-purchase', {
      body: { signedTransaction: purchase.purchaseToken },
    })
    : await supabase.functions.invoke<{ active?: boolean; pending?: boolean; error?: string }>('verify-google-purchase', {
      body: { purchaseToken: purchase.purchaseToken },
    });
  if (error) throw fail(await serverErrorCode(error, 'invalid_purchase'));
  if (data && 'pending' in data && data.pending) return { active: false, cancelled: false, pending: true };
  // Validada no servidor (ativa ou expirada): finaliza para não ficar pendente na fila da loja.
  // No Android, o servidor já confirma (acknowledge) a compra; aqui é só redundância.
  await finishTransaction({ purchase, isConsumable: false }).catch(() => undefined);
  if (!data?.active) throw fail(data?.error ?? 'subscription_inactive');
  return { active: true, cancelled: false };
}

export function canUseStoreSubscriptions(): boolean {
  return (IS_IOS || IS_ANDROID) && !!PRODUCT_ID;
}

export async function loadSubscriptionOffer(): Promise<SubscriptionOffer> {
  if (!PRODUCT_ID) throw fail('subscription_not_configured');
  await connect();
  const products = await fetchProducts({ skus: [PRODUCT_ID], type: 'subs' }).catch((error: unknown) => { throw toSubscriptionError(error); });
  const found = products?.find((item) => item.id === PRODUCT_ID && item.type === 'subs');
  if (!found) throw fail('subscription_unavailable');
  return toOffer(found as ProductSubscription);
}

export async function purchaseSubscription(offer: SubscriptionOffer): Promise<PurchaseResult> {
  await connect();
  // UUID do Supabase: liga a compra à conta (appAccountToken na Apple, obfuscatedAccountId no Google).
  const userId = await currentUserId();
  if (IS_ANDROID && !offer.offerToken) throw fail('subscription_unavailable');
  return new Promise((resolve, reject) => {
    let updated: ReturnType<typeof purchaseUpdatedListener>;
    let failed: ReturnType<typeof purchaseErrorListener>;
    const cleanup = () => { updated?.remove(); failed?.remove(); };
    updated = purchaseUpdatedListener(async (purchase) => {
      if (purchase.productId !== offer.productId) return;
      cleanup();
      // Pagamento pendente (boleto, aprovação familiar): o servidor libera quando o Google confirmar.
      if (purchase.purchaseState === 'pending') { resolve({ active: false, cancelled: false, pending: true }); return; }
      try { resolve(await validateAndFinish(purchase)); }
      catch (error) { reject(toSubscriptionError(error)); }
    });
    failed = purchaseErrorListener((error) => {
      cleanup();
      if (error.code === ErrorCode.UserCancelled) resolve({ active: false, cancelled: true });
      // "Pedir para comprar" (Compartilhamento Familiar) ou pagamento em análise: aguarda aprovação.
      else if (error.code === ErrorCode.DeferredPayment || error.code === ErrorCode.Pending) resolve({ active: false, cancelled: false, pending: true });
      else reject(toSubscriptionError(error));
    });
    requestPurchase({
      request: {
        apple: { sku: offer.productId, appAccountToken: userId },
        google: {
          skus: [offer.productId],
          subscriptionOffers: offer.offerToken ? [{ sku: offer.productId, offerToken: offer.offerToken }] : undefined,
          obfuscatedAccountId: userId,
        },
      },
      type: 'subs',
    }).catch((error: unknown) => { cleanup(); reject(toSubscriptionError(error)); });
  });
}

/** Restaura a assinatura da conta da loja (Apple ID ou conta Google) do aparelho. */
export async function restorePurchases(): Promise<boolean> {
  if (!PRODUCT_ID) return false;
  await connect();
  const purchases = await getAvailablePurchases().catch((error: unknown) => { throw toSubscriptionError(error); });
  const purchase = purchases.find((item) => item.productId === PRODUCT_ID && item.purchaseState !== 'pending');
  if (!purchase) return false;
  return (await validateAndFinish(purchase)).active;
}

/** Abre o gerenciamento/cancelamento de assinaturas da loja do aparelho. */
export async function openSubscriptionManagement(): Promise<void> {
  if (IS_IOS) {
    try {
      await connect();
      await showManageSubscriptionsIOS();
    } catch {
      await Linking.openURL(APPLE_SUBSCRIPTIONS_URL);
    }
    return;
  }
  if (IS_ANDROID) {
    try {
      if (!PRODUCT_ID) throw new Error('subscription_not_configured');
      await connect();
      await deepLinkToSubscriptions({ skuAndroid: PRODUCT_ID, packageNameAndroid: ANDROID_PACKAGE });
    } catch {
      await Linking.openURL(GOOGLE_SUBSCRIPTIONS_URL);
    }
  }
}
