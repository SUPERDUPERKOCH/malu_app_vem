import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type JsonObject = Record<string, unknown>;

const jsonHeaders = { 'Content-Type': 'application/json; charset=utf-8' };

function json(status: number, body: JsonObject): Response {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

function object(value: unknown): JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonObject
    : {};
}

function textValue(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function booleanValue(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function dateValue(...values: unknown[]): string | null {
  const raw = textValue(...values);
  if (!raw) return null;

  const withTimezone = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(raw)
    ? `${raw.replace(' ', 'T')}-03:00`
    : raw;
  const parsed = new Date(withTimezone);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function bytesToHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;

  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

async function expectedSignature(rawBody: Uint8Array, token: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(token),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  );
  return bytesToHex(await crypto.subtle.sign('HMAC', key, rawBody));
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') {
    return json(405, { ok: false, error: 'method_not_allowed' });
  }

  const webhookToken = Deno.env.get('KIWIFY_WEBHOOK_TOKEN');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!webhookToken || !supabaseUrl || !serviceRoleKey) {
    console.error('Missing required server configuration.');
    return json(500, { ok: false, error: 'server_not_configured' });
  }

  const receivedSignature = new URL(request.url).searchParams.get('signature') ?? '';
  const rawBody = new Uint8Array(await request.arrayBuffer());
  const calculatedSignature = await expectedSignature(rawBody, webhookToken);

  if (!constantTimeEqual(receivedSignature.toLowerCase(), calculatedSignature)) {
    return json(401, { ok: false, error: 'invalid_signature' });
  }

  let payload: JsonObject;
  try {
    payload = object(JSON.parse(new TextDecoder().decode(rawBody)));
  } catch {
    return json(400, { ok: false, error: 'invalid_json' });
  }

  const product = object(payload.Product ?? payload.product);
  const customer = object(payload.Customer ?? payload.customer);
  const subscription = object(payload.Subscription ?? payload.subscription);
  const customerAccess = object(subscription.customer_access ?? payload.customer_access);

  const orderId = textValue(payload.order_id, payload.id);
  const eventType = textValue(payload.webhook_event_type);
  const productId = textValue(product.product_id, product.id, payload.product_id);
  const customerEmail = textValue(customer.email)?.toLowerCase() ?? null;

  if (!orderId || !eventType || !customerEmail) {
    return json(422, { ok: false, error: 'missing_order_event_or_customer' });
  }

  const allowedProducts = (Deno.env.get('KIWIFY_PRODUCT_IDS') ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  if (allowedProducts.length > 0 && (!productId || !allowedProducts.includes(productId))) {
    return json(403, { ok: false, error: 'product_not_allowed' });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error } = await supabase
    .from('kiwify_webhook_events')
    .upsert({
      order_id: orderId,
      event_type: eventType,
      order_status: textValue(payload.order_status, payload.status),
      product_id: productId,
      product_name: textValue(product.product_name, product.name),
      customer_email: customerEmail,
      subscription_id: textValue(payload.subscription_id, subscription.id),
      payload,
      last_received_at: new Date().toISOString(),
    }, { onConflict: 'order_id,event_type' });

  if (error) {
    console.error('Could not persist Kiwify webhook:', error);
    return json(500, { ok: false, error: 'persistence_failed' });
  }

  const accessUntil = dateValue(customerAccess.access_until);
  const reportedAccess = booleanValue(customerAccess.has_access);
  const orderStatus = textValue(payload.order_status, payload.status);
  const subscriptionStatus = textValue(subscription.status, payload.subscription_status);
  const deniedEvents = new Set(['order_rejected', 'order_refunded', 'chargeback']);
  const grantedEvents = new Set(['order_approved', 'subscription_renewed']);

  let hasAccess = reportedAccess ?? grantedEvents.has(eventType);
  if (deniedEvents.has(eventType)) hasAccess = false;
  if (eventType === 'subscription_canceled' && reportedAccess === null) hasAccess = false;
  if (eventType === 'subscription_late' && reportedAccess === null) hasAccess = false;

  const { error: orderError } = await supabase.rpc('record_kiwify_order', {
    p_order_id: orderId,
    p_customer_email: customerEmail,
    p_product_id: productId,
    p_product_name: textValue(product.product_name, product.name),
    p_order_status: orderStatus,
    p_event_type: eventType,
    p_subscription_id: textValue(payload.subscription_id, subscription.id),
    p_subscription_status: subscriptionStatus,
    p_has_access: hasAccess,
    p_access_until: accessUntil,
    p_approved_at: dateValue(payload.approved_date),
    p_refunded_at: dateValue(payload.refunded_at),
    p_event_occurred_at: dateValue(
      payload.refunded_at,
      payload.updated_at,
      payload.approved_date,
      payload.created_at,
    ) ?? new Date().toISOString(),
  });

  if (orderError) {
    console.error('Could not consolidate Kiwify order:', orderError);
    return json(500, { ok: false, error: 'order_processing_failed' });
  }

  return json(200, {
    ok: true,
    received: { order_id: orderId, event_type: eventType },
  });
});

