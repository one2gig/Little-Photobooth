create extension if not exists pgcrypto;

create type booth_status as enum ('waiting', 'active', 'completed', 'expired');
create type participant_slot as enum ('host', 'guest');
create type shot_status as enum ('pending', 'capturing', 'review', 'kept', 'retry');
create type capture_status as enum ('pending', 'captured', 'failed');
create type shot_vote as enum ('keep', 'retake');

create table booth_sessions (
  id uuid primary key,
  room_code_hash text not null unique,
  name text not null default '',
  status booth_status not null default 'waiting',
  shot_index integer not null default 0,
  shot_count integer not null default 4,
  theme_id text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_activity_at timestamptz not null default now(),
  version integer not null default 1,
  state jsonb not null
);

create table booth_participants (
  id uuid primary key,
  session_id uuid not null references booth_sessions (id) on delete cascade,
  slot participant_slot not null,
  token_hash text not null,
  is_ready boolean not null default false,
  camera_ready boolean not null default false,
  is_connected boolean not null default false,
  last_seen_at timestamptz not null default now(),
  unique (session_id, slot)
);

create table booth_shots (
  session_id uuid not null references booth_sessions (id) on delete cascade,
  shot_index integer not null,
  capture_at timestamptz,
  host_status capture_status not null default 'pending',
  guest_status capture_status not null default 'pending',
  host_vote shot_vote,
  guest_vote shot_vote,
  status shot_status not null default 'pending',
  primary key (session_id, shot_index)
);

create table booth_signals (
  id uuid primary key,
  session_id uuid not null references booth_sessions (id) on delete cascade,
  from_slot participant_slot not null,
  to_slot participant_slot not null,
  kind text not null check (kind in ('offer', 'answer', 'ice')),
  payload text not null,
  created_at timestamptz not null default now()
);

create table rate_limits (
  key text primary key,
  window_start timestamptz not null,
  count integer not null
);

create index booth_sessions_status_idx on booth_sessions (status, expires_at);
create index booth_signals_session_idx on booth_signals (session_id);

alter table booth_sessions enable row level security;
alter table booth_participants enable row level security;
alter table booth_shots enable row level security;
alter table booth_signals enable row level security;
alter table rate_limits enable row level security;

create or replace function save_booth_bundle(
  p_expected_version integer,
  p_state jsonb,
  p_rates jsonb
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  session_id uuid := (p_state->>'id')::uuid;
  updated integer := 0;
begin
  if p_expected_version = 0 then
    insert into booth_sessions (
      id, room_code_hash, name, status, shot_index, shot_count, theme_id,
      created_at, expires_at, last_activity_at, version, state
    ) values (
      session_id,
      p_state->>'roomCodeHash',
      coalesce(p_state->>'name', ''),
      (p_state->>'status')::booth_status,
      (p_state->>'shotIndex')::integer,
      (p_state->>'shotCount')::integer,
      p_state->>'themeId',
      to_timestamp((p_state->>'createdAt')::double precision / 1000.0),
      to_timestamp((p_state->>'expiresAt')::double precision / 1000.0),
      to_timestamp((p_state->>'lastActivityAt')::double precision / 1000.0),
      (p_state->>'version')::integer,
      p_state
    );
  else
    update booth_sessions set
      name = coalesce(p_state->>'name', ''),
      status = (p_state->>'status')::booth_status,
      shot_index = (p_state->>'shotIndex')::integer,
      shot_count = (p_state->>'shotCount')::integer,
      theme_id = p_state->>'themeId',
      expires_at = to_timestamp((p_state->>'expiresAt')::double precision / 1000.0),
      last_activity_at = to_timestamp((p_state->>'lastActivityAt')::double precision / 1000.0),
      version = (p_state->>'version')::integer,
      state = p_state
    where id = session_id and version = p_expected_version;
    get diagnostics updated = row_count;
    if updated = 0 then
      return false;
    end if;
  end if;

  delete from booth_participants where session_id = session_id;
  insert into booth_participants (
    id, session_id, slot, token_hash, is_ready, camera_ready, is_connected, last_seen_at
  )
  select
    (item->>'id')::uuid,
    session_id,
    (item->>'slot')::participant_slot,
    item->>'tokenHash',
    (item->>'isReady')::boolean,
    (item->>'cameraReady')::boolean,
    (item->>'isConnected')::boolean,
    to_timestamp((item->>'lastSeenAt')::double precision / 1000.0)
  from jsonb_array_elements(coalesce(p_state->'participants', '[]'::jsonb)) item;

  delete from booth_shots where session_id = session_id;
  insert into booth_shots (
    session_id, shot_index, capture_at, host_status, guest_status, host_vote, guest_vote, status
  )
  select
    session_id,
    (item->>'shotIndex')::integer,
    case when item->>'captureAt' is null or item->>'captureAt' = 'null' then null
      else to_timestamp((item->>'captureAt')::double precision / 1000.0) end,
    (item->>'hostStatus')::capture_status,
    (item->>'guestStatus')::capture_status,
    case when item->>'hostVote' is null or item->>'hostVote' = 'null' then null else (item->>'hostVote')::shot_vote end,
    case when item->>'guestVote' is null or item->>'guestVote' = 'null' then null else (item->>'guestVote')::shot_vote end,
    (item->>'status')::shot_status
  from jsonb_array_elements(coalesce(p_state->'shots', '[]'::jsonb)) item;

  delete from booth_signals where session_id = session_id;
  insert into booth_signals (id, session_id, from_slot, to_slot, kind, payload, created_at)
  select
    (item->>'id')::uuid,
    session_id,
    (item->>'fromSlot')::participant_slot,
    (item->>'toSlot')::participant_slot,
    item->>'kind',
    item->>'payload',
    to_timestamp((item->>'createdAt')::double precision / 1000.0)
  from jsonb_array_elements(coalesce(p_state->'signals', '[]'::jsonb)) item;

  insert into rate_limits (key, window_start, count)
  select
    item->>'key',
    to_timestamp((item->>'windowStart')::double precision / 1000.0),
    (item->>'count')::integer
  from jsonb_array_elements(coalesce(p_rates, '[]'::jsonb)) item
  on conflict (key) do update set
    window_start = excluded.window_start,
    count = excluded.count;

  return true;
end;
$$;

create or replace function expire_booths()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  updated integer := 0;
begin
  update booth_sessions
  set
    status = 'expired',
    version = version + 1,
    state = jsonb_set(
      jsonb_set(state, '{status}', '"expired"'::jsonb),
      '{signals}',
      '[]'::jsonb
    )
  where (status = 'waiting' and expires_at <= now())
     or (status = 'active' and last_activity_at <= now() - interval '30 minutes');
  get diagnostics updated = row_count;

  delete from booth_signals
  where session_id in (select id from booth_sessions where status = 'expired');

  return updated;
end;
$$;

create or replace function save_rate_limits(p_rates jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into rate_limits (key, window_start, count)
  select
    item->>'key',
    to_timestamp((item->>'windowStart')::double precision / 1000.0),
    (item->>'count')::integer
  from jsonb_array_elements(coalesce(p_rates, '[]'::jsonb)) item
  on conflict (key) do update set
    window_start = excluded.window_start,
    count = excluded.count;
end;
$$;

revoke all on function save_booth_bundle(integer, jsonb, jsonb) from public, anon, authenticated;
revoke all on function expire_booths() from public, anon, authenticated;
revoke all on function save_rate_limits(jsonb) from public, anon, authenticated;
grant execute on function save_booth_bundle(integer, jsonb, jsonb) to service_role;
grant execute on function expire_booths() to service_role;
grant execute on function save_rate_limits(jsonb) to service_role;
