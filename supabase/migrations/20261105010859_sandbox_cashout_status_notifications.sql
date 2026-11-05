-- Observe only the existing isolated test execution. This migration cannot
-- create provider objects, change payout authority, enable delivery, or backfill.
do $$ declare d text; begin
  select pg_get_constraintdef(oid) into d from pg_constraint
    where conrelid='public.notifications'::regclass and conname='notifications_notification_type_check';
  if d is null then raise exception 'notification_type_constraint_missing'; end if;
  alter table public.notifications drop constraint notifications_notification_type_check;
  execute 'alter table public.notifications add constraint notifications_notification_type_check check ('
    ||substring(d from 7)||' or notification_type = ''sandbox_cashout_status_updated'')';
end $$;

-- Collapse internal dispatch/recovery steps into useful creator milestones.
-- The provider observation RPC remains the sole existing payment-state authority.
create function private.sandbox_cashout_notification_state(p_phase text)
returns text language sql immutable set search_path='' as $$
  select case
    when p_phase='prepared' then 'requested'
    when p_phase in ('funding_unknown','funded','payout_unknown','payout_pending') then 'processing'
    when p_phase='paid' then 'test_paid'
    when p_phase in ('return_pending','return_confirmed','reversal_unknown','funding_return_pending','funding_return_unknown') then 'returning'
    when p_phase='returned' then 'returned'
    when p_phase='canceled' then 'canceled'
    when p_phase='needs_review' then 'needs_review'
    else null end;
$$;
revoke all on function private.sandbox_cashout_notification_state(text) from public,anon,authenticated,service_role;

create function private.enqueue_sandbox_cashout_notification()
returns trigger language plpgsql security definer set search_path='' as $$
declare state text:=private.sandbox_cashout_notification_state(new.phase);
begin
  if state is null then return new; end if;
  if tg_op='UPDATE' and state is not distinct from private.sandbox_cashout_notification_state(old.phase)
    then return new; end if;
  -- Same transaction as the execution. If enqueue fails the RPC fails and the
  -- existing reconciliation retry can recover; never silently lose the notice.
  perform private.enqueue_notification_activity('sandbox-cashout:'||new.id::text||':'||state,
    'sandbox_cashout_status_updated',new.id::text,null,new.creator_id,
    jsonb_build_object('state',state,'environment','test'),clock_timestamp(),clock_timestamp()+interval '7 days');
  return new;
end $$;
revoke all on function private.enqueue_sandbox_cashout_notification() from public,anon,authenticated,service_role;
create trigger sandbox_cashout_status_notification after insert or update of phase on private.sandbox_cashout_executions
  for each row execute function private.enqueue_sandbox_cashout_notification();

-- Preserve moderation/owner notices and all common account, deletion, expiry,
-- preferences, session-bound device ownership and retry checks in the outbox.
alter function private.resolve_account_notification_activity(public.notification_activity_events)
  rename to resolve_account_notification_before_sandbox_cashout;
create function private.resolve_account_notification_activity(p_event public.notification_activity_events)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare e private.sandbox_cashout_executions; state text;
begin
  if p_event.event_kind<>'sandbox_cashout_status_updated' then
    return private.resolve_account_notification_before_sandbox_cashout(p_event);
  end if;
  select * into e from private.sandbox_cashout_executions
    where id=private.seat_notification_uuid(p_event.source_id);
  state:=private.sandbox_cashout_notification_state(e.phase);
  if e.id is null or state is null or e.creator_id is distinct from p_event.recipient_user_id
    or p_event.actor_user_id is not null or p_event.context->>'environment' is distinct from 'test'
    or p_event.context->>'state' is distinct from state
    or p_event.event_key is distinct from 'sandbox-cashout:'||e.id::text||':'||state
    then return '{"eligible":false}'; end if;
  return jsonb_build_object('eligible',true,'category','creator_money_sale',
    'notification_type','sandbox_cashout_status_updated','preference_key','account_activity_enabled',
    'title',case state when 'requested' then 'Test cashout requested' when 'processing' then 'Test cashout processing'
      when 'test_paid' then 'Test provider reported payout paid' when 'returning' then 'Test cashout return pending'
      when 'returned' then 'Test cashout returned' when 'canceled' then 'Test cashout canceled'
      else 'Test cashout needs review' end,
    'body','Request '||left(e.id::text,8)||'. '||case state
      when 'test_paid' then 'The test provider reported paid. No real bank payment occurred.'
      when 'returning' then 'Return reconciliation is pending. Open your cashout status before taking another action.'
      when 'returned' then 'The test return was reconciled. No real funds moved.'
      when 'canceled' then 'The test request was canceled before dispatch. No real funds moved.'
      when 'needs_review' then 'Open your cashout status for the next step. Do not submit a duplicate payout.'
      else 'Open your cashout status to review progress. This is a test, not a real bank payment.' end,
    'target_route','/channel-studio','target_entity_id',null,
    'target_context',jsonb_build_object('cashoutRequestId',e.id,'cashoutState',state,'environment','test','financialAuthority',false));
end $$;
revoke all on function private.resolve_account_notification_activity(public.notification_activity_events),
  private.resolve_account_notification_before_sandbox_cashout(public.notification_activity_events)
  from public,anon,authenticated,service_role;

-- In-app copy is owner-only. Never export payout state, request/provider IDs,
-- amounts, bank information or account identity to a phone notification.
-- Keep the prior reservation implementation intact, including live-room guards.
alter function public.reserve_notification_activity_push(uuid,uuid,uuid)
  rename to reserve_notification_activity_push_before_sandbox_cashout;
revoke all on function public.reserve_notification_activity_push_before_sandbox_cashout(uuid,uuid,uuid)
  from public,anon,authenticated,service_role;
create function public.reserve_notification_activity_push(p_event_id uuid,p_lease_token uuid,p_push_token_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  result:=public.reserve_notification_activity_push_before_sandbox_cashout(p_event_id,p_lease_token,p_push_token_id);
  if result->>'eligible'='true' and exists(select 1 from public.notification_activity_events
    where id=p_event_id and event_kind='sandbox_cashout_status_updated') then
    result:=result||jsonb_build_object('title','Account update','body','Open Chi''llywood to review your latest update.',
      'data',jsonb_strip_nulls(jsonb_build_object('notificationId',result#>'{data,notificationId}',
        'route','/channel-studio','targetRoute','/channel-studio')));
  end if;
  return result;
end $$;
revoke all on function public.reserve_notification_activity_push(uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.reserve_notification_activity_push(uuid,uuid,uuid) to service_role;
