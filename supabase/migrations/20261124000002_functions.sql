-- Server-side functions. Errors are raised with a short code as the message, e.g. 'room_full'.

-- Adds a participant, or returns the existing seat of this user.
create function public.join_session(
  p_code text, p_user uuid, p_nickname text, p_avatar text, p_role text, p_seat_code text
) returns public.participants
language plpgsql security definer set search_path = '' as $$
declare
  s public.sessions;
  p public.participants;
  base text := left(trim(p_nickname), 20);
  candidate text := left(trim(p_nickname), 20);
  n integer := 1;
  is_late boolean;
begin
  select * into s from public.sessions where code = p_code for update;
  if not found then raise exception 'not_found'; end if;

  select * into p from public.participants where session_id = s.id and user_id = p_user;
  if found then
    if p.kicked_at is not null then raise exception 'kicked'; end if;
    return p;
  end if;

  if s.phase in ('completed', 'aborted') then raise exception 'ended'; end if;
  if p_role = 'spectator' then
    if not coalesce((s.config ->> 'spectators')::boolean, false) then raise exception 'no_spectators'; end if;
  else
    if s.locked then raise exception 'locked'; end if;
    is_late := s.phase not in ('lobby', 'selection');
    if is_late and s.config ->> 'lateJoin' <> 'host' then raise exception 'started'; end if;
    if (select count(*) from public.participants
        where session_id = s.id and role = 'player' and kicked_at is null) >= (s.config ->> 'maxPlayers')::integer then
      raise exception 'room_full';
    end if;
  end if;

  while exists (select 1 from public.participants
                where session_id = s.id and kicked_at is null and lower(nickname) = lower(candidate)) loop
    n := n + 1;
    candidate := left(base, 20 - length(' ' || n)) || ' ' || n;
  end loop;

  insert into public.participants (session_id, user_id, nickname, avatar, role, approved, seat_code, joined_at_k)
  values (s.id, p_user, candidate, p_avatar, p_role, not coalesce(is_late, false), p_seat_code,
          case when coalesce(is_late, false) then s.current_k else 0 end)
  returning * into p;
  update public.sessions set state_version = state_version + 1, updated_at = now() where id = s.id;
  return p;
end $$;

-- Records one ballot. Validates the round, the player and the selection rules.
create function public.cast_vote(
  p_round uuid, p_participant uuid, p_keys text[], p_confidence integer, p_prediction text
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r public.vote_rounds;
  s public.sessions;
  p public.participants;
  valid text[];
  pair jsonb;
begin
  select * into r from public.vote_rounds where id = p_round for share;
  if not found then raise exception 'not_found'; end if;
  select se.* into s from public.sessions se join public.dilemmas d on d.session_id = se.id where d.id = r.dilemma_id;
  select * into p from public.participants where id = p_participant and session_id = s.id;
  if not found or p.role <> 'player' or p.kicked_at is not null or not p.approved then
    raise exception 'not_eligible';
  end if;
  if r.status <> 'open' or s.phase not in ('voting', 'final_vote') then raise exception 'round_closed'; end if;
  if r.ends_at is not null and now() > r.ends_at + interval '2 seconds' then raise exception 'round_closed'; end if;

  select array_agg(case jsonb_typeof(c) when 'string' then c #>> '{}' else c ->> 'id' end)
    into valid from jsonb_array_elements(r.candidates) c;
  if p_keys is null or not (p_keys <@ valid) then raise exception 'unknown_option'; end if;
  if cardinality(p_keys) <> (select count(distinct x) from unnest(p_keys) x) then raise exception 'duplicate_option'; end if;
  if cardinality(p_keys) < r.min_select then raise exception 'too_few'; end if;
  if cardinality(p_keys) > r.max_select then raise exception 'too_many'; end if;
  for pair in select * from jsonb_array_elements(r.exclusive) loop
    if (pair ->> 0) = any (p_keys) and (pair ->> 1) = any (p_keys) then raise exception 'incompatible'; end if;
  end loop;

  begin
    insert into public.votes (round_id, participant_id, option_keys, confidence, prediction)
    values (p_round, p_participant, p_keys, p_confidence, p_prediction);
  exception when unique_violation then
    raise exception 'already_voted';
  end;
end $$;

-- Closes a round and records everyone who did not vote as abstained. Returns false if it was already closed.
create function public.close_round(p_round uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  r public.vote_rounds;
  sid uuid;
begin
  update public.vote_rounds set status = 'closed' where id = p_round and status = 'open' returning * into r;
  if not found then return false; end if;
  select session_id into sid from public.dilemmas where id = r.dilemma_id;
  insert into public.votes (round_id, participant_id, abstained)
  select p_round, p.id, true from public.participants p
  where p.session_id = sid and p.role = 'player' and p.kicked_at is null and p.approved
  on conflict (round_id, participant_id) do nothing;
  return true;
end $$;

-- Moves a session to another phase if nobody changed it first. The allowed edges are checked by the engine.
create function public.transition_phase(
  p_session uuid, p_expected integer, p_to text, p_actor text,
  p_ends_at timestamptz default null, p_k integer default null
) returns public.sessions
language plpgsql security definer set search_path = '' as $$
declare s public.sessions;
begin
  update public.sessions set
    paused_from = case when p_to = 'paused' then phase else null end,
    phase = p_to,
    ends_at = p_ends_at,
    current_k = coalesce(p_k, current_k),
    state_version = state_version + 1,
    updated_at = now()
  where id = p_session and state_version = p_expected
  returning * into s;
  if not found then raise exception 'conflict'; end if;
  insert into public.events_log (session_id, state_version, type, actor, payload)
  values (s.id, s.state_version, 'phase', p_actor, jsonb_build_object('to', p_to, 'k', s.current_k));
  return s;
end $$;

-- Announces new versions on the realtime channel of the session. Carries no content: clients refetch their snapshot.
create function public.announce_version() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.state_version is distinct from old.state_version then
    begin
      perform realtime.send(jsonb_build_object('v', new.state_version), 'changed', 'session:' || new.id, false);
    exception when others then null; -- realtime is not available in the embedded database
    end;
  end if;
  return new;
end $$;
create trigger sessions_announce after update on public.sessions
  for each row execute function public.announce_version();

do $$
declare f text;
begin
  for f in select oid::regprocedure::text from pg_proc where pronamespace = 'public'::regnamespace
           and proname in ('join_session', 'cast_vote', 'close_round', 'transition_phase', 'announce_version') loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
end $$;
