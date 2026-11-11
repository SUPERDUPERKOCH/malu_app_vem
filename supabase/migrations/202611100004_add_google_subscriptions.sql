-- Assinaturas do Google Play Billing, validadas no servidor pela Google Play Developer API.
-- Mesmo vocabulário de status das assinaturas Apple: active | billing_retry | paused | expired.

create table public.google_subscriptions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  purchase_token text not null unique,
  linked_purchase_token text,
  product_id text not null,
  base_plan_id text,
  order_id text,
  status text not null,
  subscription_state text not null,
  expires_at timestamptz,
  will_renew boolean,
  acknowledged boolean not null default false,
  test_purchase boolean not null default false,
  updated_at timestamptz not null default now()
);

create table public.google_notification_events (
  message_id text primary key,
  notification_type integer,
  purchase_token text,
  payload jsonb not null,
  received_at timestamptz not null default now()
);

alter table public.google_subscriptions enable row level security;
alter table public.google_notification_events enable row level security;
revoke all on public.google_subscriptions, public.google_notification_events from anon, authenticated;

-- Recalcula o status do perfil considerando Kiwify, Apple e Google Play.
create or replace function public.refresh_profile_subscription(p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare next_status public.subscription_status;
begin
  if p_user_id is null then return; end if;
  select case
    when exists (select 1 from public.kiwify_orders where user_id=p_user_id and has_access=true and (access_until is null or access_until>now()))
      or exists (select 1 from public.apple_subscriptions where user_id=p_user_id and status='active' and expires_at>now())
      or exists (select 1 from public.google_subscriptions where user_id=p_user_id and status='active' and expires_at>now())
      then 'active'::public.subscription_status
    when exists (select 1 from public.kiwify_orders where user_id=p_user_id and subscription_status in ('waiting_payment','late','past_due'))
      or exists (select 1 from public.apple_subscriptions where user_id=p_user_id and status='billing_retry')
      or exists (select 1 from public.google_subscriptions where user_id=p_user_id and status in ('billing_retry','paused'))
      then 'suspended'::public.subscription_status
    when exists (select 1 from public.kiwify_orders where user_id=p_user_id)
      or exists (select 1 from public.apple_subscriptions where user_id=p_user_id)
      or exists (select 1 from public.google_subscriptions where user_id=p_user_id)
      then 'cancelled'::public.subscription_status
    else 'pending'::public.subscription_status end into next_status;
  update public.profiles set subscription_status=next_status
    where id=p_user_id and subscription_status is distinct from next_status;
end $$;
revoke all on function public.refresh_profile_subscription(uuid) from public;

create or replace function public.record_google_subscription(
  p_user_id uuid, p_purchase_token text, p_linked_purchase_token text, p_product_id text,
  p_base_plan_id text, p_order_id text, p_status text, p_subscription_state text,
  p_expires_at timestamptz, p_will_renew boolean, p_acknowledged boolean, p_test_purchase boolean
) returns void language plpgsql security definer set search_path = '' as $$
declare current_row public.google_subscriptions;
begin
  if not exists(select 1 from public.profiles where id=p_user_id) then raise exception 'profile_not_found'; end if;
  select * into current_row from public.google_subscriptions where user_id=p_user_id;
  -- Notificação atrasada de um token antigo (substituído por upgrade/reassinatura ou ainda
  -- inativo enquanto outro está ativo) não pode sobrescrever a assinatura vigente.
  if found and current_row.purchase_token<>p_purchase_token and (
    current_row.linked_purchase_token=p_purchase_token
    or (current_row.status='active' and current_row.expires_at>now() and p_status<>'active')
  ) then
    return;
  end if;
  -- Um token só pode pertencer a uma conta: remove registros antigos do mesmo token em outra conta.
  delete from public.google_subscriptions where purchase_token=p_purchase_token and user_id<>p_user_id;
  insert into public.google_subscriptions(
    user_id, purchase_token, linked_purchase_token, product_id, base_plan_id, order_id, status,
    subscription_state, expires_at, will_renew, acknowledged, test_purchase
  ) values (
    p_user_id, p_purchase_token, p_linked_purchase_token, p_product_id, p_base_plan_id, p_order_id, p_status,
    p_subscription_state, p_expires_at, p_will_renew, p_acknowledged, p_test_purchase
  )
  on conflict(user_id) do update set
    purchase_token=excluded.purchase_token, linked_purchase_token=excluded.linked_purchase_token,
    product_id=excluded.product_id, base_plan_id=excluded.base_plan_id, order_id=excluded.order_id,
    status=excluded.status, subscription_state=excluded.subscription_state, expires_at=excluded.expires_at,
    will_renew=excluded.will_renew, acknowledged=excluded.acknowledged, test_purchase=excluded.test_purchase,
    updated_at=now();
  perform public.refresh_profile_subscription(p_user_id);
end $$;
revoke all on function public.record_google_subscription(uuid,text,text,text,text,text,text,text,timestamptz,boolean,boolean,boolean) from public;
grant execute on function public.record_google_subscription(uuid,text,text,text,text,text,text,text,timestamptz,boolean,boolean,boolean) to service_role;
