-- Estado consolidado de cada pedido da Kiwify.
create table public.kiwify_orders (
  order_id text primary key,
  user_id uuid references auth.users (id) on delete set null,
  customer_email text not null,
  product_id text,
  product_name text,
  order_status text,
  event_type text not null,
  subscription_id text,
  subscription_status text,
  has_access boolean not null default false,
  access_until timestamptz,
  approved_at timestamptz,
  refunded_at timestamptz,
  event_occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint kiwify_orders_order_not_blank check (length(trim(order_id)) > 0),
  constraint kiwify_orders_email_not_blank check (length(trim(customer_email)) > 3)
);

create index kiwify_orders_user_id_idx on public.kiwify_orders (user_id);
create index kiwify_orders_customer_email_idx on public.kiwify_orders (lower(customer_email));
create index kiwify_orders_subscription_id_idx on public.kiwify_orders (subscription_id);

alter table public.kiwify_orders enable row level security;
revoke all on table public.kiwify_orders from anon, authenticated;

create or replace function public.refresh_profile_subscription(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_status public.subscription_status;
begin
  if p_user_id is null then
    return;
  end if;

  select case
    when exists (
      select 1
      from public.kiwify_orders
      where user_id = p_user_id
        and has_access = true
        and (access_until is null or access_until > now())
    ) then 'active'::public.subscription_status
    when exists (
      select 1
      from public.kiwify_orders
      where user_id = p_user_id
        and subscription_status in ('waiting_payment', 'late', 'past_due')
    ) then 'suspended'::public.subscription_status
    when exists (
      select 1 from public.kiwify_orders where user_id = p_user_id
    ) then 'cancelled'::public.subscription_status
    else 'pending'::public.subscription_status
  end
  into next_status;

  update public.profiles
  set subscription_status = next_status
  where id = p_user_id
    and subscription_status is distinct from next_status;
end;
$$;

revoke all on function public.refresh_profile_subscription(uuid) from public;

create or replace function public.link_kiwify_orders_to_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.kiwify_orders
  set user_id = new.id,
      updated_at = now()
  where lower(customer_email) = lower(new.email)
    and user_id is distinct from new.id;

  perform public.refresh_profile_subscription(new.id);
  return new;
end;
$$;

create trigger profiles_link_kiwify_orders
after insert or update of email on public.profiles
for each row execute function public.link_kiwify_orders_to_profile();

create or replace function public.record_kiwify_order(
  p_order_id text,
  p_customer_email text,
  p_product_id text,
  p_product_name text,
  p_order_status text,
  p_event_type text,
  p_subscription_id text,
  p_subscription_status text,
  p_has_access boolean,
  p_access_until timestamptz,
  p_approved_at timestamptz,
  p_refunded_at timestamptz,
  p_event_occurred_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  matched_user_id uuid;
  previous_user_id uuid;
begin
  select id
  into matched_user_id
  from public.profiles
  where lower(email) = lower(trim(p_customer_email))
  limit 1;

  select user_id into previous_user_id
  from public.kiwify_orders
  where order_id = p_order_id;

  insert into public.kiwify_orders (
    order_id,
    user_id,
    customer_email,
    product_id,
    product_name,
    order_status,
    event_type,
    subscription_id,
    subscription_status,
    has_access,
    access_until,
    approved_at,
    refunded_at,
    event_occurred_at
  ) values (
    trim(p_order_id),
    matched_user_id,
    lower(trim(p_customer_email)),
    p_product_id,
    p_product_name,
    p_order_status,
    p_event_type,
    p_subscription_id,
    p_subscription_status,
    coalesce(p_has_access, false),
    p_access_until,
    p_approved_at,
    p_refunded_at,
    coalesce(p_event_occurred_at, now())
  )
  on conflict (order_id) do update
  set user_id = coalesce(excluded.user_id, public.kiwify_orders.user_id),
      customer_email = excluded.customer_email,
      product_id = coalesce(excluded.product_id, public.kiwify_orders.product_id),
      product_name = coalesce(excluded.product_name, public.kiwify_orders.product_name),
      order_status = excluded.order_status,
      event_type = excluded.event_type,
      subscription_id = coalesce(excluded.subscription_id, public.kiwify_orders.subscription_id),
      subscription_status = coalesce(excluded.subscription_status, public.kiwify_orders.subscription_status),
      has_access = excluded.has_access,
      access_until = excluded.access_until,
      approved_at = coalesce(excluded.approved_at, public.kiwify_orders.approved_at),
      refunded_at = coalesce(excluded.refunded_at, public.kiwify_orders.refunded_at),
      event_occurred_at = excluded.event_occurred_at,
      updated_at = now()
  where excluded.event_occurred_at >= public.kiwify_orders.event_occurred_at;

  perform public.refresh_profile_subscription(coalesce(matched_user_id, previous_user_id));
end;
$$;

revoke all on function public.record_kiwify_order(
  text, text, text, text, text, text, text, text, boolean,
  timestamptz, timestamptz, timestamptz, timestamptz
) from public;
grant execute on function public.record_kiwify_order(
  text, text, text, text, text, text, text, text, boolean,
  timestamptz, timestamptz, timestamptz, timestamptz
) to service_role;

-- Vincula pedidos que chegaram antes desta migration.
update public.kiwify_orders as orders
set user_id = profiles.id
from public.profiles as profiles
where lower(orders.customer_email) = lower(profiles.email)
  and orders.user_id is null;

