-- Dormant append-only terminal dispositions. Installed after settlement effects.
-- No timeout, client cancellation result, or unknown consumed outcome releases a slot.
set local role sbx_v1_core_owner;
create table sandbox_commerce_v1.native_store_reservation_terminals(
 id uuid primary key default gen_random_uuid(),
 reservation_id uuid unique references sandbox_commerce_v1.native_store_reservations,
 selection_id uuid not null unique references sandbox_commerce_v1.native_store_selections,
 buyer_id uuid not null,kind text not null,
 allocation_id uuid unique references sandbox_commerce_v1.native_store_allocations,
 tombstone_id uuid references sandbox_commerce_v1.native_store_negative_tombstones,
 grant_id uuid unique references sandbox_commerce_v1.resource_grants,
 request_id uuid,session_id uuid,created_at timestamptz not null default clock_timestamp(),
 unique(buyer_id,request_id),
 check((kind='allocated' and reservation_id is not null and allocation_id is not null and grant_id is not null and tombstone_id is null and request_id is null and session_id is null)
 or(kind='cancelled_before_consume' and allocation_id is null and tombstone_id is null and grant_id is null and request_id is not null and session_id is not null)
 or(kind='refunded_before_allocation' and reservation_id is not null and tombstone_id is not null and allocation_id is null and grant_id is null and request_id is null and session_id is null))
);
alter table sandbox_commerce_v1.native_store_reservation_terminals enable row level security;
alter table sandbox_commerce_v1.native_store_reservation_terminals force row level security;
create policy owner_only on sandbox_commerce_v1.native_store_reservation_terminals for all to sbx_v1_core_owner using(true) with check(true);
revoke all on sandbox_commerce_v1.native_store_reservation_terminals from public,anon,authenticated,service_role;
create trigger immutable before update or delete on sandbox_commerce_v1.native_store_reservation_terminals for each row execute function sandbox_commerce_v1.native_store_quote_immutable();
create trigger immutable_truncate before truncate on sandbox_commerce_v1.native_store_reservation_terminals for each statement execute function sandbox_commerce_v1.native_store_quote_immutable();
create function sandbox_commerce_v1.native_store_record_allocated_terminal(p_reservation uuid,p_allocation uuid)
returns void language plpgsql security invoker set search_path='' as $$
declare r sandbox_commerce_v1.native_store_reservations;a sandbox_commerce_v1.native_store_allocations;g uuid;t sandbox_commerce_v1.native_store_reservation_terminals;
begin
 select * into strict r from sandbox_commerce_v1.native_store_reservations where id=p_reservation;
 if not pg_try_advisory_xact_lock(hashtextextended('native-store-reserve:'||r.buyer_id,691)) then raise exception 'native_store_terminal_busy' using errcode='55P03';end if;
 perform sandbox_commerce_v1.native_store_lock_project(r.project_id);
 select * into strict a from sandbox_commerce_v1.native_store_allocations where id=p_allocation;
 select id into g from sandbox_commerce_v1.resource_grants where receipt_id=a.core_receipt_id and buyer_id=r.buyer_id;
 if a.reservation_id<>r.id or a.selection_id<>r.selection_id or a.buyer_id<>r.buyer_id or g is null
 or not exists(select 1 from sandbox_commerce_v1.native_store_dispatch_attempts x where x.id=a.attempt_id and x.reservation_id=r.id and x.buyer_id=r.buyer_id)
 or not exists(select 1 from sandbox_commerce_v1.native_store_claims c where c.id=a.claim_id and c.selection_id=r.selection_id and c.buyer_id=r.buyer_id)
 or not exists(select 1 from sandbox_commerce_v1.native_store_raw_effects e where e.raw_receipt_id=a.raw_receipt_id and e.kind='positive_applied' and e.claim_id=a.claim_id and e.core_receipt_id=a.core_receipt_id and e.protocol_id=a.protocol_id and e.protocol_revision=a.protocol_revision)
 then raise exception 'native_store_terminal_allocation_mismatch';end if;
 select * into t from sandbox_commerce_v1.native_store_reservation_terminals where selection_id=r.selection_id;
 if t.id is not null then
  if t.kind<>'allocated' or t.allocation_id<>a.id or t.reservation_id<>r.id or t.grant_id<>g then raise exception 'native_store_terminal_conflict';end if;
  return;
 end if;
 insert into sandbox_commerce_v1.native_store_reservation_terminals(reservation_id,selection_id,buyer_id,kind,allocation_id,grant_id)
 values(r.id,r.selection_id,r.buyer_id,'allocated',a.id,g);
end $$;
create function sandbox_commerce_v1.native_store_record_refunded_terminal(p_reservation uuid,p_tombstone uuid)
returns void language plpgsql security invoker set search_path='' as $$
declare r sandbox_commerce_v1.native_store_reservations;n sandbox_commerce_v1.native_store_negative_tombstones;t sandbox_commerce_v1.native_store_reservation_terminals;
begin
 select * into strict r from sandbox_commerce_v1.native_store_reservations where id=p_reservation;
 if not pg_try_advisory_xact_lock(hashtextextended('native-store-reserve:'||r.buyer_id,691)) then raise exception 'native_store_terminal_busy' using errcode='55P03';end if;
 perform sandbox_commerce_v1.native_store_lock_project(r.project_id);
 select * into strict n from sandbox_commerce_v1.native_store_negative_tombstones where id=p_tombstone;
 if n.buyer_id<>r.buyer_id or n.product_id<>r.product_id
 or n.scope_key is distinct from jsonb_build_array('native-store-sandbox-v1','revenuecat',r.project_id,r.app_id,r.store,r.environment)::text
 or not exists(select 1 from sandbox_commerce_v1.native_store_dispatch_attempts where reservation_id=r.id and buyer_id=r.buyer_id)
 or not exists(select 1 from sandbox_commerce_v1.native_store_claims c where c.selection_id=r.selection_id and c.buyer_id=r.buyer_id and c.product_identifier=r.product_id and c.transaction_identifier in(n.transaction_id,n.original_transaction_id))
 or not exists(select 1 from sandbox_commerce_v1.native_store_raw_effects e where e.tombstone_id=n.id and e.kind in('negative_applied','purchase_tombstoned'))
 or exists(select 1 from sandbox_commerce_v1.native_store_allocations where reservation_id=r.id)
 then raise exception 'native_store_terminal_refund_mismatch';end if;
 select * into t from sandbox_commerce_v1.native_store_reservation_terminals where selection_id=r.selection_id;
 if t.id is not null then
  if t.kind<>'refunded_before_allocation' or t.tombstone_id<>n.id or t.reservation_id<>r.id then raise exception 'native_store_terminal_conflict';end if;
  return;
 end if;
 insert into sandbox_commerce_v1.native_store_reservation_terminals(reservation_id,selection_id,buyer_id,kind,tombstone_id)
 values(r.id,r.selection_id,r.buyer_id,'refunded_before_allocation',n.id);
end $$;
revoke all on function sandbox_commerce_v1.native_store_record_allocated_terminal(uuid,uuid),sandbox_commerce_v1.native_store_record_refunded_terminal(uuid,uuid) from public,anon,authenticated,service_role;
create function sandbox_commerce_v1.native_store_terminal_json(t sandbox_commerce_v1.native_store_reservation_terminals)
returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id','nssv1_terminal_'||t.id,'selectionId','nssv1_selection_'||t.selection_id,
 'reservationId','nssv1_reservation_'||t.reservation_id,'kind',t.kind,'allocationId','nssv1_allocation_'||t.allocation_id,
 'grantId','scv1_grant_'||t.grant_id,'originalRequestId',t.request_id,'createdAt',t.created_at)
$$;
create function sandbox_commerce_v1.native_store_terminal_command(p_user uuid,p_session uuid,p_command text,p_request uuid,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare auth jsonb;s sandbox_commerce_v1.native_store_selections;r sandbox_commerce_v1.native_store_reservations;
 t sandbox_commerce_v1.native_store_reservation_terminals;sid uuid;status text:='ok';reason text;
begin
 perform sandbox_commerce_v1.arm_transaction_timeout();perform sandbox_commerce_v1.assert_provider_service();perform sandbox_commerce_v1.assert_generation(false);
 if p_user is null or p_session is null or p_request is null or p_command is null or p_command not in('cancel-preparation','terminal-recover')
 or jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>4096 or not(p_payload ? 'selectionId') or p_payload-array['selectionId']<>'{}'::jsonb
 or jsonb_typeof(p_payload->'selectionId') is distinct from 'string'
 or p_payload->>'selectionId' !~ '^nssv1_selection_[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
 then raise exception 'native_store_terminal_invalid';end if;
 auth:=sandbox_commerce_v1.assert_authority(p_user,p_session,'delivery');sid:=substring(p_payload->>'selectionId' from 17)::uuid;
 if p_command='cancel-preparation' and not pg_try_advisory_xact_lock(hashtextextended('native-store-reserve:'||p_user,691))
 then raise exception 'native_store_terminal_busy' using errcode='55P03';end if;
 select * into s from sandbox_commerce_v1.native_store_selections where id=sid and buyer_id=p_user;
 if s.id is null then status:='unknown';reason:='selection_unknown';
 else
  if p_command='cancel-preparation' then perform sandbox_commerce_v1.native_store_lock_project(s.quote#>>'{catalog,projectId}');end if;
  select * into t from sandbox_commerce_v1.native_store_reservation_terminals where selection_id=sid and buyer_id=p_user;
  if t.id is not null then
   if p_command='cancel-preparation' and t.kind='cancelled_before_consume' and t.request_id<>p_request then raise exception 'native_store_terminal_conflict';end if;
  elsif p_command='terminal-recover' then status:='unknown';reason:='terminal_unknown';
  else
   select * into r from sandbox_commerce_v1.native_store_reservations where selection_id=sid and buyer_id=p_user;
   if exists(select 1 from sandbox_commerce_v1.native_store_dispatch_attempts where reservation_id=r.id)
   then status:='held';reason:='consumption_unresolved';
   else
    if exists(select 1 from sandbox_commerce_v1.native_store_reservation_terminals where buyer_id=p_user and request_id=p_request)
    then raise exception 'native_store_terminal_conflict';end if;
    perform sandbox_commerce_v1.assert_fresh(auth);
    insert into sandbox_commerce_v1.native_store_reservation_terminals(reservation_id,selection_id,buyer_id,kind,request_id,session_id)
    values(r.id,sid,p_user,'cancelled_before_consume',p_request,p_session) returning * into t;
   end if;
  end if;
 end if;
 perform sandbox_commerce_v1.assert_fresh(auth);perform sandbox_commerce_v1.assert_generation(false);
 return jsonb_build_object('protocol','native-store-sandbox-command-v1','command',p_command,'requestId',p_request,
 'actor',jsonb_build_object('userId',p_user,'accountId',p_user,'sessionGeneration',p_session),'status',status,
 'data',jsonb_build_object('terminal',case when t.id is null then null else sandbox_commerce_v1.native_store_terminal_json(t) end,'reason',reason),
 'dispatchAllowed',false,'correlation','unsupported');
end $$;
revoke all on function sandbox_commerce_v1.native_store_terminal_json(sandbox_commerce_v1.native_store_reservation_terminals),
 sandbox_commerce_v1.native_store_terminal_command(uuid,uuid,text,uuid,jsonb) from public,anon,authenticated,service_role;
reset role;
create function public.native_store_sandbox_terminal_v1(p_user_id uuid,p_session_id uuid,p_command text,p_request_id uuid,p_payload jsonb)
returns jsonb language sql security definer set search_path='' as $$select sandbox_commerce_v1.native_store_terminal_command(p_user_id,p_session_id,p_command,p_request_id,p_payload)$$;
alter function public.native_store_sandbox_terminal_v1(uuid,uuid,text,uuid,jsonb) owner to sbx_v1_core_owner;
revoke all on function public.native_store_sandbox_terminal_v1(uuid,uuid,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.native_store_sandbox_terminal_v1(uuid,uuid,text,uuid,jsonb) to service_role;
