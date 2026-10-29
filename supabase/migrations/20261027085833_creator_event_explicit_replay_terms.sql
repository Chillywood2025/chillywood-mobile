-- Live-only stays the default. New replay promises require a concrete supported
-- window; historical event tuples and purchased revisions are not rewritten.
create function private.guard_creator_event_explicit_replay_terms()
returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='UPDATE' and row(new.replay_policy,new.replay_available_at,new.replay_expires_at)
    is not distinct from row(old.replay_policy,old.replay_available_at,old.replay_expires_at)
  then return new; end if;
  if new.replay_policy='none' then return new; end if;
  if new.replay_policy is distinct from 'until_expiration' or new.ends_at is null
    or new.replay_available_at is null or new.replay_expires_at is null
    or not isfinite(new.ends_at) or not isfinite(new.replay_available_at) or not isfinite(new.replay_expires_at)
    or new.replay_available_at<new.ends_at or new.replay_expires_at<=new.replay_available_at
  then raise exception 'event_replay_explicit_window_required'; end if;
  return new;
end;
$$;
revoke all on function private.guard_creator_event_explicit_replay_terms() from public,anon,authenticated,service_role;
create trigger guard_creator_event_explicit_replay_terms
before insert or update of replay_policy,replay_available_at,replay_expires_at on public.creator_events
for each row execute function private.guard_creator_event_explicit_replay_terms();

-- This is the canonical immutable sale snapshot boundary, including calls from
-- older clients. It creates no replacement terms for already purchased tickets.
create function private.guard_creator_event_offer_explicit_replay_terms()
returns trigger language plpgsql set search_path='' as $$
declare available_at timestamptz; expires_at timestamptz; ends_at timestamptz;
begin
  if new.terms->>'replayPolicy'='none' then return new; end if;
  if new.terms->>'replayPolicy' is distinct from 'until_expiration'
    or jsonb_typeof(new.terms->'replayAvailableAt') is distinct from 'string'
    or jsonb_typeof(new.terms->'replayExpiresAt') is distinct from 'string'
    or jsonb_typeof(new.terms->'endsAt') is distinct from 'string'
  then raise exception 'event_replay_explicit_window_required'; end if;
  available_at:=(new.terms->>'replayAvailableAt')::timestamptz;
  expires_at:=(new.terms->>'replayExpiresAt')::timestamptz;
  ends_at:=(new.terms->>'endsAt')::timestamptz;
  if not isfinite(available_at) or not isfinite(expires_at) or not isfinite(ends_at)
    or available_at<ends_at or expires_at<=available_at
  then raise exception 'event_replay_explicit_window_required'; end if;
  return new;
end;
$$;
revoke all on function private.guard_creator_event_offer_explicit_replay_terms() from public,anon,authenticated,service_role;
create trigger guard_creator_event_offer_explicit_replay_terms
before insert on public.creator_event_offer_revisions
for each row execute function private.guard_creator_event_offer_explicit_replay_terms();

-- A historical offer may remain visible while older buyers retain its rights.
-- New checkout initiation must still meet today's explicit-window contract.
-- Existing intents and their legitimate callback settlement are not modified.
create function private.guard_event_ticket_explicit_replay_terms()
returns trigger language plpgsql security definer set search_path='' as $$
declare terms jsonb; available_at timestamptz; expires_at timestamptz; ends_at timestamptz;
begin
  if new.product_type is distinct from 'event_pass' then return new; end if;
  select v.terms into terms from public.creator_event_offer_revisions v
    where v.id=new.event_terms_revision_id and v.creator_event_id=new.source_id
      and v.creator_id=new.creator_id;
  if terms->>'replayPolicy'='none' then return new; end if;
  if terms->>'replayPolicy' is distinct from 'until_expiration'
    or jsonb_typeof(terms->'replayAvailableAt') is distinct from 'string'
    or jsonb_typeof(terms->'replayExpiresAt') is distinct from 'string'
    or jsonb_typeof(terms->'endsAt') is distinct from 'string'
  then raise exception 'event_replay_explicit_window_required'; end if;
  available_at:=(terms->>'replayAvailableAt')::timestamptz;
  expires_at:=(terms->>'replayExpiresAt')::timestamptz;
  ends_at:=(terms->>'endsAt')::timestamptz;
  if not isfinite(available_at) or not isfinite(expires_at) or not isfinite(ends_at)
    or available_at<ends_at or expires_at<=available_at
  then raise exception 'event_replay_explicit_window_required'; end if;
  return new;
end;
$$;
revoke all on function private.guard_event_ticket_explicit_replay_terms() from public,anon,authenticated,service_role;
-- PostgreSQL orders BEFORE triggers by name: bind_event_ticket_purchase_terms
-- first binds the immutable revision; this guard then validates that exact row.
create trigger guard_event_ticket_explicit_replay_terms
before insert on public.money_purchase_intents
for each row execute function private.guard_event_ticket_explicit_replay_terms();

-- A reservation created before this policy is not evidence that the store was
-- called. Guard its first dispatch claim too. Already-claimed uncertain calls
-- retain their identity and settlement path; this never authorizes a retry.
create function private.guard_event_checkout_explicit_replay_terms()
returns trigger language plpgsql security definer set search_path='' as $$
declare terms jsonb; available_at timestamptz; expires_at timestamptz; ends_at timestamptz;
begin
  if new.checkout_attempt_id is null then return new; end if;
  if tg_op='UPDATE' and old.checkout_attempt_id is not null then return new; end if;
  select v.terms into terms from public.creator_event_offer_revisions v
    where v.id=new.revision_id and v.creator_event_id=new.creator_event_id and v.offer_id=new.offer_id;
  if terms->>'replayPolicy'='none' then return new; end if;
  if terms->>'replayPolicy' is distinct from 'until_expiration'
    or jsonb_typeof(terms->'replayAvailableAt') is distinct from 'string'
    or jsonb_typeof(terms->'replayExpiresAt') is distinct from 'string'
    or jsonb_typeof(terms->'endsAt') is distinct from 'string'
  then raise exception 'event_replay_explicit_window_required'; end if;
  available_at:=(terms->>'replayAvailableAt')::timestamptz;
  expires_at:=(terms->>'replayExpiresAt')::timestamptz;
  ends_at:=(terms->>'endsAt')::timestamptz;
  if not isfinite(available_at) or not isfinite(expires_at) or not isfinite(ends_at)
    or available_at<ends_at or expires_at<=available_at
  then raise exception 'event_replay_explicit_window_required'; end if;
  return new;
end;
$$;
revoke all on function private.guard_event_checkout_explicit_replay_terms() from public,anon,authenticated,service_role;
create trigger guard_event_checkout_explicit_replay_terms
before insert or update of checkout_attempt_id on public.event_ticket_reservations
for each row execute function private.guard_event_checkout_explicit_replay_terms();
