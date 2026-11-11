create table public.apple_subscriptions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  original_transaction_id text not null unique,
  product_id text not null,
  environment text not null,
  status text not null,
  expires_at timestamptz,
  will_renew boolean,
  last_transaction_id text not null,
  updated_at timestamptz not null default now()
);

create table public.apple_notification_events (
  notification_uuid uuid primary key,
  notification_type text not null,
  subtype text,
  payload jsonb not null,
  received_at timestamptz not null default now()
);

alter table public.apple_subscriptions enable row level security;
alter table public.apple_notification_events enable row level security;
revoke all on public.apple_subscriptions, public.apple_notification_events from anon, authenticated;

create or replace function public.refresh_profile_subscription(p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare next_status public.subscription_status;
begin
  if p_user_id is null then return; end if;
  select case
    when exists (select 1 from public.kiwify_orders where user_id=p_user_id and has_access=true and (access_until is null or access_until>now()))
      or exists (select 1 from public.apple_subscriptions where user_id=p_user_id and status='active' and expires_at>now())
      then 'active'::public.subscription_status
    when exists (select 1 from public.kiwify_orders where user_id=p_user_id and subscription_status in ('waiting_payment','late','past_due'))
      or exists (select 1 from public.apple_subscriptions where user_id=p_user_id and status='billing_retry')
      then 'suspended'::public.subscription_status
    when exists (select 1 from public.kiwify_orders where user_id=p_user_id)
      or exists (select 1 from public.apple_subscriptions where user_id=p_user_id)
      then 'cancelled'::public.subscription_status
    else 'pending'::public.subscription_status end into next_status;
  update public.profiles set subscription_status=next_status
    where id=p_user_id and subscription_status is distinct from next_status;
end $$;
revoke all on function public.refresh_profile_subscription(uuid) from public;

create or replace function public.record_apple_subscription(
  p_user_id uuid, p_original_transaction_id text, p_product_id text, p_environment text,
  p_status text, p_expires_at timestamptz, p_will_renew boolean, p_last_transaction_id text
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists(select 1 from public.profiles where id=p_user_id) then raise exception 'profile_not_found'; end if;
  insert into public.apple_subscriptions(user_id,original_transaction_id,product_id,environment,status,expires_at,will_renew,last_transaction_id)
  values(p_user_id,p_original_transaction_id,p_product_id,p_environment,p_status,p_expires_at,p_will_renew,p_last_transaction_id)
  on conflict(user_id) do update set
    original_transaction_id=excluded.original_transaction_id, product_id=excluded.product_id,
    environment=excluded.environment, status=excluded.status, expires_at=excluded.expires_at,
    will_renew=excluded.will_renew, last_transaction_id=excluded.last_transaction_id, updated_at=now();
  perform public.refresh_profile_subscription(p_user_id);
end $$;
revoke all on function public.record_apple_subscription(uuid,text,text,text,text,timestamptz,boolean,text) from public;
grant execute on function public.record_apple_subscription(uuid,text,text,text,text,timestamptz,boolean,text) to service_role;
