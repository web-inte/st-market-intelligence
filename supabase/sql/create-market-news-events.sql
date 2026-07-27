create table if not exists public.market_news_events (
  id uuid primary key default gen_random_uuid(),
  external_id text not null unique,
  symbol text not null,
  headline text not null,
  summary text,
  source text,
  source_url text,
  image_url text,

  event_type text not null default 'GENERAL'
    check (
      event_type in (
        'EARNINGS',
        'GUIDANCE',
        'CONTRACT',
        'ACQUISITION',
        'REGULATORY',
        'LEGAL',
        'MANAGEMENT',
        'PRODUCT',
        'ANALYST',
        'GENERAL'
      )
    ),

  impact text not null default 'NEUTRAL'
    check (
      impact in (
        'POSITIVE',
        'NEGATIVE',
        'NEUTRAL'
      )
    ),

  importance integer not null default 50
    check (
      importance between 0 and 100
    ),

  classification_reason text,
  published_at timestamptz not null,
  detected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  raw jsonb not null default '{}'::jsonb
);

create index if not exists
  market_news_events_published_at_idx
on public.market_news_events (published_at desc);

create index if not exists
  market_news_events_symbol_idx
on public.market_news_events (symbol, published_at desc);

create index if not exists
  market_news_events_importance_idx
on public.market_news_events (importance desc, published_at desc);

create index if not exists
  market_news_events_type_idx
on public.market_news_events (event_type, published_at desc);

alter table public.market_news_events
enable row level security;

drop policy if exists
  "Authenticated users can read market news"
on public.market_news_events;

create policy
  "Authenticated users can read market news"
on public.market_news_events
for select
to authenticated
using (true);

revoke insert, update, delete
on public.market_news_events
from anon, authenticated;

grant select
on public.market_news_events
to authenticated;
