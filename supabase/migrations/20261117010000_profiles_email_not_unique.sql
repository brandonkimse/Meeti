-- Supabase Auth already keeps emails unique. A unique email on profiles only
-- caused trouble: a profile left behind by a deleted login blocked anyone from
-- signing up again with that address.
alter table public.profiles drop constraint if exists profiles_email_key;
create index if not exists idx_profiles_email on public.profiles(email);
