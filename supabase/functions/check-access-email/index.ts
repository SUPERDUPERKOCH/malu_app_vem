import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const headers = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const response = (status: number, body: Record<string, unknown>): Response =>
  new Response(JSON.stringify(body), { status, headers });

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers });
  if (request.method !== 'POST') return response(405, { error: 'method_not_allowed' });

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) return response(500, { error: 'server_not_configured' });

  let email = '';
  let allowPendingRegistration = false;
  try {
    const body = await request.json();
    email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    allowPendingRegistration = body?.allowPendingRegistration === true;
  } catch {
    return response(400, { error: 'invalid_body' });
  }
  if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254) return response(400, { error: 'invalid_email' });

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

  // Contas existentes sempre seguem para a senha; a autorizacao de conteudo continua
  // sendo revalidada depois do login pelo validate_my_access().
  const profile = await admin.from('profiles').select('id').ilike('email', email).limit(1).maybeSingle();
  if (profile.error) {
    console.error('Profile lookup failed:', profile.error.message);
    return response(500, { error: 'access_check_failed' });
  }
  if (profile.data) return response(200, { flow: 'sign_in' });

  // Para primeiro acesso, so permite cadastro quando o webhook autenticado da Kiwify
  // registrou uma compra que concede acesso e ainda esta vigente.
  const order = await admin
    .from('kiwify_orders')
    .select('order_id')
    .ilike('customer_email', email)
    .eq('has_access', true)
    .or(`access_until.is.null,access_until.gt.${new Date().toISOString()}`)
    .order('event_occurred_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (order.error) {
    console.error('Order lookup failed:', order.error.message);
    return response(500, { error: 'access_check_failed' });
  }

  // No iOS, a pessoa cria a conta primeiro e assina pelo StoreKit já
  // identificada pelo UUID do Supabase. Criar a conta não libera conteúdo.
  return response(200, { flow: order.data || allowPendingRegistration ? 'register' : 'pending' });
});
