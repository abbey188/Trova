-- Trova: daily variant snapshots — the history behind "what changed" signals for long-term holders.
-- Stores computed scores AND raw tokens.xyz inputs, so history can be re-scored when the method changes.

create table if not exists public.variant_snapshots (
  id                bigint generated always as identity primary key,
  snapshot_date     date        not null,
  taken_at          timestamptz not null default now(),
  method_version    text        not null,

  asset_id          text        not null,
  asset_class       text,                        -- stock | etf | metal | rwa
  mint              text        not null,
  symbol            text        not null,
  issuer            text,
  issuer_confirmed  boolean     not null default false,

  instrument_class  text        not null,        -- direct-share | backed-tracker | ... | pre-ipo-exposure
  speculative       boolean     not null,
  score             smallint,                    -- null = not rated (NR)
  grade             text        not null,        -- A | B | C | D | NR
  borderline        boolean     not null default false,
  structure         smallint    not null,
  market            smallint    not null,
  confidence        text        not null,        -- high | medium | low
  routable          boolean     not null,
  not_routable_reason text,

  tier                text,                      -- tokens.xyz liquidity tier (neutral label)
  stock_variant_tier  text,
  advisory_status     text,
  advisory_reason     text,
  liquidity_usd       numeric,
  volume_24h_usd      numeric,
  trades_24h          integer,
  holders             integer,
  execution_score     numeric,
  bot_volume_ratio    numeric,
  flags               text[]  not null default '{}',

  raw               jsonb       not null,        -- tokens.xyz variant as received

  unique (mint, snapshot_date)
);

create index if not exists variant_snapshots_asset_date on public.variant_snapshots (asset_id, snapshot_date desc);
create index if not exists variant_snapshots_mint_date  on public.variant_snapshots (mint, snapshot_date desc);

create table if not exists public.snapshot_runs (
  id              bigint generated always as identity primary key,
  started_at      timestamptz not null,
  finished_at     timestamptz not null default now(),
  snapshot_date   date        not null,
  method_version  text        not null,
  assets          integer     not null,
  variants        integer     not null,
  errors          jsonb       not null default '[]'
);

-- Snapshots are public market data: anyone may read; only the service role (bypasses RLS) writes.
alter table public.variant_snapshots enable row level security;
alter table public.snapshot_runs     enable row level security;

drop policy if exists "variant_snapshots are publicly readable" on public.variant_snapshots;
create policy "variant_snapshots are publicly readable"
  on public.variant_snapshots for select using (true);
