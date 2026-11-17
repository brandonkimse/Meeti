-- Per-person archive: hiding an old hangout from your own lists doesn't hide it for anyone else.
create table if not exists public.hangout_archives (
  user_id uuid not null references public.profiles(id) on delete cascade,
  hangout_id text not null references public.hangouts(id) on delete cascade,
  archived_at bigint not null default (extract(epoch from now()) * 1000)::bigint,
  primary key (user_id, hangout_id)
);
create index if not exists hangout_archives_hangout_idx on public.hangout_archives (hangout_id);
alter table public.hangout_archives enable row level security;
