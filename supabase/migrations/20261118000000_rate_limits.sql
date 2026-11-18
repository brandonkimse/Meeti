-- Fixed-window request counters, shared by every server instance.
create table if not exists public.rate_limits (
  key text not null,
  window_start bigint not null,
  count integer not null default 1,
  expires_at bigint not null,
  primary key (key, window_start)
);
create index if not exists rate_limits_expires_idx on public.rate_limits (expires_at);
alter table public.rate_limits enable row level security;
