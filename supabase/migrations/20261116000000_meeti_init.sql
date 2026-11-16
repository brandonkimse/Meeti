-- Meeti schema for Supabase.
-- Run this once in the Supabase SQL editor (or `supabase db push`).
--
-- Security model
-- * The Next.js server talks to Postgres directly (DATABASE_URL) and enforces
--   all permissions in code.
-- * Every public table has RLS enabled with NO policies, so the public anon key
--   cannot read or write anything through the Supabase REST API.
-- * Realtime uses private channels. Policies on realtime.messages only let a
--   signed-in user receive events for themselves, their groups, and hangouts in
--   their groups.

-- ---------------------------------------------------------------- tables

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  name text not null,
  avatar_url text,
  is_demo integer not null default 0,
  created_at bigint not null default (extract(epoch from now()) * 1000)::bigint
);

create table if not exists public.groups (
  id text primary key,
  name text not null,
  description text,
  image_url text,
  emoji text,
  invite_code text not null unique,
  owner_id uuid not null references public.profiles(id),
  created_at bigint not null
);

create table if not exists public.memberships (
  group_id text not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member',
  joined_at bigint not null,
  primary key (group_id, user_id)
);

create table if not exists public.hangouts (
  id text primary key,
  group_id text not null references public.groups(id) on delete cascade,
  created_by uuid not null references public.profiles(id),
  title text not null,
  starts_at bigint not null,
  ends_at bigint not null,
  mode text not null,
  category text,
  status text not null default 'planning',
  final_suggestion_id text,
  dest_name text,
  dest_address text,
  dest_lat double precision,
  dest_lng double precision,
  dest_image_url text,
  poll_closes_at bigint,
  recommendations_json text,
  recommendations_key text,
  created_at bigint not null,
  finalized_at bigint,
  completed_at bigint
);

create table if not exists public.participants (
  hangout_id text not null references public.hangouts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  seq bigserial,
  rsvp text not null default 'going',
  origin_lat double precision,
  origin_lng double precision,
  origin_label text,
  origin_source text,
  mode text,
  updated_at bigint not null,
  primary key (hangout_id, user_id)
);

create table if not exists public.suggestions (
  id text primary key,
  hangout_id text not null references public.hangouts(id) on delete cascade,
  added_by uuid references public.profiles(id) on delete set null,
  source text not null,
  name text not null,
  address text,
  lat double precision not null,
  lng double precision not null,
  category text,
  image_url text,
  rating double precision,
  rating_count integer,
  external_id text,
  travel_json text,
  travel_key text,
  created_at bigint not null
);

create table if not exists public.votes (
  hangout_id text not null references public.hangouts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  suggestion_id text not null references public.suggestions(id) on delete cascade,
  updated_at bigint not null,
  primary key (hangout_id, user_id)
);

create table if not exists public.location_shares (
  hangout_id text not null references public.hangouts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null,
  consented_at bigint not null,
  expires_at bigint not null,
  lat double precision,
  lng double precision,
  accuracy double precision,
  updated_at bigint,
  eta_s double precision,
  distance_m double precision,
  eta_source text,
  eta_computed_at bigint,
  started_moving_at bigint,
  arrived_at bigint,
  primary key (hangout_id, user_id)
);

-- Demo mode only: precomputed simulated journeys, advanced by the browser.
create table if not exists public.demo_journeys (
  hangout_id text not null references public.hangouts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  path_json text not null,
  start_at bigint not null,
  duration_ms bigint not null,
  primary key (hangout_id, user_id)
);

create index if not exists idx_memberships_user on public.memberships(user_id);
create index if not exists idx_hangouts_group on public.hangouts(group_id, starts_at);
create index if not exists idx_suggestions_hangout on public.suggestions(hangout_id);

-- ---------------------------------------------------------------- lock down the REST API

alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.memberships enable row level security;
alter table public.hangouts enable row level security;
alter table public.participants enable row level security;
alter table public.suggestions enable row level security;
alter table public.votes enable row level security;
alter table public.location_shares enable row level security;
alter table public.demo_journeys enable row level security;

-- ---------------------------------------------------------------- profiles for new auth users

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, name)
  values (
    new.id,
    new.email,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'name'), ''), split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- realtime authorization

-- Topics: user:<uuid>, group:<id>, hangout:<id>.
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
      select 1 from public.hangouts h
      join public.memberships m on m.group_id = h.group_id
      where h.id = split_part(topic, ':', 2) and m.user_id = (select auth.uid())
    )
    else false
  end;
$$;

revoke all on function public.can_access_topic(text) from public;
grant execute on function public.can_access_topic(text) to authenticated;

drop policy if exists "meeti: members receive events" on realtime.messages;
create policy "meeti: members receive events"
  on realtime.messages for select
  to authenticated
  using (public.can_access_topic(realtime.topic()));

-- Presence (who's online) on group channels. Clients never send broadcasts;
-- only the server does, via realtime.send().
drop policy if exists "meeti: members share presence" on realtime.messages;
create policy "meeti: members share presence"
  on realtime.messages for insert
  to authenticated
  with check (
    realtime.messages.extension = 'presence'
    and split_part(realtime.topic(), ':', 1) = 'group'
    and public.can_access_topic(realtime.topic())
  );
