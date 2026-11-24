-- The Collective Story: schema (design §10).
-- Browsers never read these tables. RLS is on with no client policies, so only the server
-- (direct database connection) has access. Votes and profiles stay private by construction.

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  stage_token text not null default replace(gen_random_uuid()::text, '-', ''),
  host_user_id uuid not null,
  phase text not null default 'lobby',
  paused_from text,
  state_version integer not null default 1,
  config jsonb not null,
  dilemma_count integer not null check (dilemma_count between 3 and 15),
  current_k integer not null default 0,
  ends_at timestamptz,
  paused_remaining_ms integer,
  locked boolean not null default false,
  content_source text not null default 'ai' check (content_source in ('ai', 'default')),
  fallback_from_k integer,
  content_rating text check (content_rating in ('family', 'teen', 'mature')),
  rating_lowered boolean not null default false,
  universe_regenerated boolean not null default false,
  tone jsonb,
  derived_from jsonb,
  scene_index integer not null default 0,
  auto_advance boolean not null default false,
  share_slug text unique,
  shared boolean not null default false,
  host_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.participants (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions on delete cascade,
  user_id uuid not null,
  nickname text not null,
  avatar text not null default '🙂',
  role text not null default 'player' check (role in ('player', 'spectator')),
  is_cohost boolean not null default false,
  approved boolean not null default true,
  seat_code text not null,
  joined_at_k integer not null default 0,
  kicked_at timestamptz,
  persona_key text,
  share_profile boolean not null default false,
  nudged_at timestamptz,
  ready boolean not null default false,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (session_id, user_id)
);
create unique index participants_seat on public.participants (session_id, seat_code);
create unique index participants_nickname on public.participants (session_id, lower(nickname)) where kicked_at is null;

create table public.title_catalog (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  external_id text not null,
  title text not null,
  year integer,
  kind text not null check (kind in ('book', 'movie', 'series')),
  cover_url text,
  themes jsonb,
  rating_level text check (rating_level in ('family', 'teen', 'mature')),
  rating_source text check (rating_source in ('metadata', 'ai', 'builtin')),
  tone jsonb,
  themes_version text,
  created_at timestamptz not null default now(),
  unique (source, external_id)
);

create table public.selections (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions on delete cascade,
  participant_id uuid not null references public.participants on delete cascade,
  title_id uuid not null references public.title_catalog,
  is_favorite boolean not null default false,
  love_tags text[] not null default '{}',
  unverified boolean not null default false,
  created_at timestamptz not null default now(),
  unique (participant_id, title_id)
);
create index selections_session on public.selections (session_id);
create index selections_title on public.selections (title_id);

create table public.story_bibles (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions on delete cascade,
  version integer not null,
  bible jsonb not null,
  created_at timestamptz not null default now(),
  unique (session_id, version)
);

create table public.assets (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions on delete cascade,
  role text not null,
  kind text not null check (kind in ('image', 'pdf')),
  url text not null,
  alt text not null default '',
  blurhash text,
  width integer,
  height integer,
  provider text not null,
  prompt text,
  cost_usd numeric not null default 0,
  created_at timestamptz not null default now()
);
create index assets_session on public.assets (session_id, role, created_at);

create table public.characters (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions on delete cascade,
  bible_key text not null,
  name text not null,
  kind text not null check (kind in ('npc', 'persona')),
  participant_id uuid references public.participants on delete set null,
  portrait_asset_id uuid references public.assets on delete set null,
  created_at timestamptz not null default now(),
  unique (session_id, bible_key)
);
create index characters_participant on public.characters (participant_id);
create index characters_asset on public.characters (portrait_asset_id);

create table public.dilemmas (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions on delete cascade,
  k integer not null,
  source text not null check (source in ('ai', 'default')),
  status text not null default 'generating' check (status in ('generating', 'ready', 'presented', 'closed')),
  payload jsonb not null,
  format text not null check (format in ('single', 'multiple')),
  min_select integer not null,
  max_select integer not null,
  image_asset_id uuid references public.assets on delete set null,
  created_at timestamptz not null default now(),
  unique (session_id, k)
);
create index dilemmas_asset on public.dilemmas (image_asset_id);

create table public.dilemma_options (
  id uuid primary key default gen_random_uuid(),
  dilemma_id uuid not null references public.dilemmas on delete cascade,
  key text not null,
  label text not null,
  description text not null,
  visible_consequence text not null,
  hidden_consequence text not null,
  value_tags jsonb not null,
  origin text not null default 'ai' check (origin in ('ai', 'write_in')),
  proposed_by uuid references public.participants on delete set null,
  unique (dilemma_id, key)
);
create index dilemma_options_proposer on public.dilemma_options (proposed_by);

create table public.vote_rounds (
  id uuid primary key default gen_random_uuid(),
  dilemma_id uuid not null references public.dilemmas on delete cascade,
  round_no integer not null,
  kind text not null check (kind in ('initial', 'final', 'revote')),
  status text not null default 'open' check (status in ('open', 'closed', 'superseded')),
  -- initial rounds: option keys. final rounds: [{id, optionKeys}]
  candidates jsonb not null,
  min_select integer not null default 1,
  max_select integer not null default 1,
  exclusive jsonb not null default '[]',
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  unique (dilemma_id, round_no)
);

create table public.votes (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.vote_rounds on delete cascade,
  participant_id uuid not null references public.participants on delete cascade,
  option_keys text[] not null default '{}',
  confidence integer check (confidence between 1 and 3),
  prediction text,
  abstained boolean not null default false,
  created_at timestamptz not null default now(),
  unique (round_id, participant_id)
);
create index votes_participant on public.votes (participant_id);

create table public.write_ins (
  id uuid primary key default gen_random_uuid(),
  dilemma_id uuid not null references public.dilemmas on delete cascade,
  participant_id uuid not null references public.participants on delete cascade,
  raw_text text not null check (char_length(raw_text) between 3 and 140),
  status text not null default 'checking' check (status in ('checking', 'open', 'approved', 'rejected')),
  reason text,
  option jsonb,
  option_key text,
  endorsements uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (dilemma_id, participant_id)
);
create index write_ins_participant on public.write_ins (participant_id);

create table public.group_decisions (
  id uuid primary key default gen_random_uuid(),
  dilemma_id uuid not null unique references public.dilemmas on delete cascade,
  option_keys text[] not null,
  resolved_by text not null check (resolved_by in ('final_vote', 'unanimous', 'revote', 'fate')),
  tally jsonb not null,
  leaders text[] not null default '{}',
  split_index numeric not null,
  created_at timestamptz not null default now()
);

create table public.consequences (
  id uuid primary key default gen_random_uuid(),
  dilemma_id uuid not null unique references public.dilemmas on delete cascade,
  narrative text not null,
  revealed_hidden jsonb not null default '[]',
  minority_echo text not null default '',
  diff jsonb not null default '[]',
  rejected jsonb not null default '[]',
  image_asset_id uuid references public.assets on delete set null,
  bible_version integer,
  created_at timestamptz not null default now()
);
create index consequences_asset on public.consequences (image_asset_id);

create table public.turn_summaries (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions on delete cascade,
  k integer not null,
  summary text not null,
  unique (session_id, k)
);

create table public.player_profiles (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions on delete cascade,
  participant_id uuid not null unique references public.participants on delete cascade,
  scores jsonb not null,
  archetype text not null,
  secondary_archetype text not null,
  narrative jsonb not null,
  created_at timestamptz not null default now()
);
create index player_profiles_session on public.player_profiles (session_id);

create table public.group_analyses (
  session_id uuid primary key references public.sessions on delete cascade,
  metrics jsonb not null,
  narrative jsonb not null,
  created_at timestamptz not null default now()
);

create table public.final_stories (
  session_id uuid primary key references public.sessions on delete cascade,
  title text not null,
  logline text not null,
  ending_id text not null,
  scenes jsonb not null,
  epilogue jsonb not null default '[]',
  created_at timestamptz not null default now()
);

create table public.ai_calls (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.sessions on delete cascade,
  task text not null,
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cached_tokens integer not null default 0,
  latency_ms integer not null default 0,
  cost_usd numeric not null default 0,
  status text not null check (status in ('ok', 'repaired', 'fallback')),
  error text,
  created_at timestamptz not null default now()
);
create index ai_calls_session on public.ai_calls (session_id);

-- One row per background job; the unique key makes retries and double clicks harmless.
create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions on delete cascade,
  kind text not null,
  k integer not null default 0,
  attempt integer not null default 0,
  status text not null default 'running' check (status in ('running', 'done', 'failed')),
  started_at timestamptz not null default now(),
  unique (session_id, kind, k, attempt)
);

create table public.events_log (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.sessions on delete cascade,
  state_version integer not null,
  type text not null,
  actor text not null,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index events_log_session on public.events_log (session_id);

do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;
