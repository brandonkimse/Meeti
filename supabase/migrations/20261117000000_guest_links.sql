-- Guest links: plans can be shared with a link, and friends can join as
-- guests without an account. Plans no longer need a group.

-- Plans without a group, each with a shareable code.
alter table public.hangouts alter column group_id drop not null;
alter table public.hangouts add column if not exists share_code text;
update public.hangouts
  set share_code = substr(md5(random()::text || id), 1, 10)
  where share_code is null;
alter table public.hangouts alter column share_code set not null;
create unique index if not exists idx_hangouts_share_code on public.hangouts(share_code);
create index if not exists idx_participants_user on public.participants(user_id);

-- Guests are profiles without a login, identified by a browser cookie.
alter table public.profiles add column if not exists is_guest integer not null default 0;

create table if not exists public.guest_sessions (
  token_hash text primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at bigint not null
);
alter table public.guest_sessions enable row level security;

-- Realtime: hangout events go to its participants, plus members of its group.
-- (Guests have no Supabase session, so they refresh by polling instead.)
create or replace function public.can_access_topic(topic text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case split_part(topic, ':', 1)
    when 'user' then split_part(topic, ':', 2) = (select auth.uid())::text
    when 'group' then exists (
      select 1 from public.memberships m
      where m.group_id = split_part(topic, ':', 2) and m.user_id = (select auth.uid())
    )
    when 'hangout' then exists (
      select 1 from public.participants p
      where p.hangout_id = split_part(topic, ':', 2) and p.user_id = (select auth.uid())
    ) or exists (
      select 1 from public.hangouts h
      join public.memberships m on m.group_id = h.group_id
      where h.id = split_part(topic, ':', 2) and m.user_id = (select auth.uid())
    )
    else false
  end;
$$;
