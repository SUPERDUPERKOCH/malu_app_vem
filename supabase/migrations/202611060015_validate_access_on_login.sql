-- Validação de acesso no login: primeiro a role; para participantes, as transações da Kiwify.
-- Os pedidos vêm do webhook assinado (kiwify_orders) e continuam inacessíveis diretamente pelo app.
create or replace function public.validate_my_access()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  me record;
  current_status public.subscription_status;
  last_order record;
begin
  if current_user_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select id, email, role, active, subscription_status
  into me
  from public.profiles
  where id = current_user_id;

  if not found then
    raise exception 'profile_not_found' using errcode = 'P0002';
  end if;

  -- 1. Admin e coach não dependem de compra.
  if me.role in ('admin', 'coach') then
    return jsonb_build_object(
      'role', me.role,
      'checkedKiwify', false,
      'hasAccess', me.active,
      'status', me.subscription_status,
      'order', null
    );
  end if;

  -- 2. Vincula pedidos feitos com o e-mail da conta que ainda não estavam ligados a ela
  --    (por exemplo, compra feita antes do cadastro ou webhook recebido antes do perfil existir).
  update public.kiwify_orders
  set user_id = current_user_id,
      updated_at = now()
  where user_id is null
    and lower(customer_email) = lower(me.email);

  -- 3. Recalcula o status com base nas transações (acesso ativo, prazo, pagamento pendente, reembolso).
  perform public.refresh_profile_subscription(current_user_id);

  select subscription_status into current_status
  from public.profiles
  where id = current_user_id;

  -- 4. Pedido mais relevante: um que dá acesso hoje; senão, o evento mais recente.
  select order_id, order_status, product_name, subscription_status, has_access, access_until, approved_at, refunded_at, event_occurred_at
  into last_order
  from public.kiwify_orders
  where user_id = current_user_id
  order by (has_access and (access_until is null or access_until > now())) desc, event_occurred_at desc
  limit 1;

  return jsonb_build_object(
    'role', me.role,
    'checkedKiwify', true,
    'hasAccess', me.active and current_status = 'active',
    'status', current_status,
    'order', case when last_order.order_id is null then null else jsonb_build_object(
      'orderId', last_order.order_id,
      'orderStatus', last_order.order_status,
      'productName', last_order.product_name,
      'subscriptionStatus', last_order.subscription_status,
      'hasAccess', last_order.has_access,
      'accessUntil', last_order.access_until,
      'approvedAt', last_order.approved_at,
      'refundedAt', last_order.refunded_at,
      'updatedAt', last_order.event_occurred_at
    ) end
  );
end;
$$;

revoke all on function public.validate_my_access() from public;
grant execute on function public.validate_my_access() to authenticated;
