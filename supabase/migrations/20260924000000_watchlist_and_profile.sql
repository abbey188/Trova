-- Trova: per-device profile (nickname, alert preference) and watchlist.
--
-- Keyed by the SHA-256 of a random secret the browser generates and keeps. The secret itself never
-- reaches the database, so a leaked row cannot be used to write to someone's watchlist, and nothing
-- here is linked to a wallet address — reading a portfolio stays pubkey-only and signature-free
-- (CLAUDE.md principle 1). Trade-off, stated plainly: a watchlist lives on the device that made it.
--
-- RLS is ON with NO policies: the anon key can neither read nor write these tables. Only the route
-- handlers, using the service key server-side, touch them.

create table if not exists public.trova_profiles (
  key_hash          text        primary key check (key_hash ~ '^[0-9a-f]{64}$'),
  nickname          text        check (nickname is null or char_length(nickname) between 1 and 24),
  alert_untradable  boolean     not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table if not exists public.watchlist_items (
  key_hash   text        not null references public.trova_profiles (key_hash) on delete cascade,
  asset_id   text        not null check (char_length(asset_id) between 1 and 96),
  added_at   timestamptz not null default now(),
  primary key (key_hash, asset_id)
);

create index if not exists watchlist_items_key_added on public.watchlist_items (key_hash, added_at desc);

alter table public.trova_profiles  enable row level security;
alter table public.watchlist_items enable row level security;
-- Deliberately no policies. See header.
