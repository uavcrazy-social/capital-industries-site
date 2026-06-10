-- One Minecraft username per site account (case-insensitive)

create unique index if not exists profiles_minecraft_username_lower_unique
  on public.profiles (lower(minecraft_username));

create or replace function public.is_minecraft_username_available(p_username text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select not exists (
    select 1
    from public.profiles
    where lower(minecraft_username) = lower(trim(p_username))
      and id <> auth.uid()
  );
$$;

revoke all on function public.is_minecraft_username_available(text) from public;
grant execute on function public.is_minecraft_username_available(text) to authenticated;
