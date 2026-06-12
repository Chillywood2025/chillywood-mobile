-- Paid Watch-Party Seats V1 proof fix:
-- Metadata constraints intentionally reject secret/control words including
-- livekit and publish. The initial functions wrote false-valued safety flags
-- with those words in the key names, which prevented otherwise safe sandbox
-- rows from being inserted. Remove those metadata keys rather than weakening
-- the constraints.

do $$
declare
  function_row record;
  v_definition text;
  v_next_definition text;
begin
  for function_row in
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'set_paid_watch_party_offer',
        'create_paid_watch_party_ticket_purchase_intent',
        'sync_paid_watch_party_ticket_from_access_grant'
      )
  loop
    select pg_get_functiondef(function_row.oid) into v_definition;
    v_next_definition := v_definition;

    v_next_definition := replace(
      v_next_definition,
      ',
      ''grants_livekit_publish'', false,
      ''grants_host_authority'', false',
      ''
    );

    v_next_definition := replace(
      v_next_definition,
      ',
        ''grants_livekit_publish'', false,
        ''grants_host_authority'', false',
      ''
    );

    v_next_definition := replace(
      v_next_definition,
      ',
      ''grants_livekit_publish'', false',
      ''
    );

    v_next_definition := replace(
      v_next_definition,
      ',
        ''grants_livekit_publish'', false',
      ''
    );

    v_next_definition := replace(
      v_next_definition,
      ',
      ''grants_host_authority'', false',
      ''
    );

    v_next_definition := replace(
      v_next_definition,
      ',
        ''grants_host_authority'', false',
      ''
    );

    if v_next_definition <> v_definition then
      execute v_next_definition;
    end if;
  end loop;
end $$;

comment on table public."paid_watch_party_offers" is
  'Sandbox-only creator Watch-Party ticket offers. Creator writes are RPC-only; row metadata excludes secret/control key names and tickets do not grant Premium, Tips, Paid Videos, Live Stage, LiveKit authority, payouts, or live money.';
