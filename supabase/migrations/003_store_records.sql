-- Tebex purchase + subscription records (written by webhook, read by owner)

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  minecraft_username text not null,
  rank_key text not null check (rank_key in ('member', 'premium', 'elite')),
  tebex_transaction_id text,
  tebex_recurring_reference text,
  status text not null default 'active'
    check (status in ('active', 'canceled', 'expired', 'past_due', 'refunded')),
  package_name text,
  price_amount numeric(10, 2),
  price_currency text,
  started_at timestamptz not null default now(),
  current_period_end timestamptz,
  canceled_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  subscription_id uuid references public.subscriptions (id) on delete set null,
  minecraft_username text not null,
  rank_key text check (rank_key in ('member', 'premium', 'elite')),
  tebex_transaction_id text not null,
  event_type text not null,
  status text not null,
  amount numeric(10, 2),
  currency text,
  purchased_at timestamptz not null default now(),
  raw_payload jsonb
);

create unique index if not exists purchases_tebex_transaction_id_unique
  on public.purchases (tebex_transaction_id);

create unique index if not exists subscriptions_one_active_per_user
  on public.subscriptions (user_id)
  where status = 'active' and user_id is not null;

create unique index if not exists subscriptions_one_active_per_username
  on public.subscriptions (lower(minecraft_username))
  where status = 'active';

create index if not exists purchases_user_id_purchased_at_idx
  on public.purchases (user_id, purchased_at desc);

create index if not exists subscriptions_user_id_idx
  on public.subscriptions (user_id);

alter table public.subscriptions enable row level security;
alter table public.purchases enable row level security;

create policy "subscriptions_select_own"
  on public.subscriptions
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "purchases_select_own"
  on public.purchases
  for select
  to authenticated
  using (auth.uid() = user_id);
