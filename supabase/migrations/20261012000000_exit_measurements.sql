-- Trova: measured exit, stored. One row per token, per day, per market session, per trade size.
--
-- A round trip is quoted through Jupiter on the better of its two routes (pools, or a market maker's
-- quote) and the result kept. This is the part of Trova's record that cannot be rebuilt later: a
-- quote exists only when it is taken, so nobody can go back and measure what it cost to leave a
-- token on a given day. Before 2026-10-12 exit was quoted on pools alone and never stored.

create table if not exists public.exit_measurements (
  id                    bigint generated always as identity primary key,
  mint                  text        not null,
  symbol                text,
  snapshot_date         date        not null,
  taken_at              timestamptz not null default now(),
  session               text        not null,        -- open | closed (US market hours when quoted)
  size_usd              integer     not null,
  status                text        not null,        -- ok | no-route | market-closed
  round_trip_pct        numeric,                     -- cost of buying and selling straight back, in %
  liquidity             text,                        -- pools | market-maker (what filled the way out)
  pools_round_trip_pct  numeric,                     -- the same round trip through pools alone, when quoted
  route_labels          text[]      not null default '{}',

  unique (mint, snapshot_date, session, size_usd)
);

create index if not exists exit_measurements_mint_taken on public.exit_measurements (mint, taken_at desc);
create index if not exists exit_measurements_date on public.exit_measurements (snapshot_date desc);

-- Measurements are public market data: anyone may read; only the service role (bypasses RLS) writes.
alter table public.exit_measurements enable row level security;

drop policy if exists "exit_measurements are publicly readable" on public.exit_measurements;
create policy "exit_measurements are publicly readable"
  on public.exit_measurements for select using (true);

-- What the issuer can do to the token on-chain (Token-2022 extensions and authorities), as read from
-- the mint on the snapshot day. Null for rows written before 2026-10-12.
alter table public.variant_snapshots add column if not exists controls jsonb;
