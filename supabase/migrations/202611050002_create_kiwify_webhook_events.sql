-- Recebimentos da Kiwify. A tabela e privada e somente o backend usa service_role.
create table public.kiwify_webhook_events (
  id bigint generated always as identity primary key,
  order_id text not null,
  event_type text not null,
  order_status text,
  product_id text,
  product_name text,
  customer_email text,
  subscription_id text,
  payload jsonb not null,
  first_received_at timestamptz not null default now(),
  last_received_at timestamptz not null default now(),

  constraint kiwify_webhook_events_order_not_blank check (length(trim(order_id)) > 0),
  constraint kiwify_webhook_events_type_not_blank check (length(trim(event_type)) > 0),
  constraint kiwify_webhook_events_order_event_unique unique (order_id, event_type)
);

create index kiwify_webhook_events_customer_email_idx
  on public.kiwify_webhook_events (lower(customer_email));

create index kiwify_webhook_events_product_id_idx
  on public.kiwify_webhook_events (product_id);

alter table public.kiwify_webhook_events enable row level security;

revoke all on table public.kiwify_webhook_events from anon, authenticated;
revoke all on sequence public.kiwify_webhook_events_id_seq from anon, authenticated;

comment on table public.kiwify_webhook_events is
  'Eventos autenticados recebidos dos webhooks da Kiwify; acessivel somente pelo backend.';

