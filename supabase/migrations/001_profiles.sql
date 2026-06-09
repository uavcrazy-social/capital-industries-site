-- Capital Industries profiles table (run in Supabase SQL editor)

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  minecraft_username text not null,
  username_confirmed boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own"
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = id);

create policy "profiles_insert_own"
  on public.profiles
  for insert
  to authenticated
  with check (auth.uid() = id);

create policy "profiles_update_own"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

create index if not exists profiles_minecraft_username_idx
  on public.profiles (minecraft_username);
