-- Dormant owner-private evidence primitive. NOT a dispatch admission gate.
-- No public wrapper, service_role grant, qualification flag, or SDK invocation.
set local role sbx_v1_core_owner;
create table sandbox_commerce_v1.native_store_dispatch_attempts(
 id uuid primary key default gen_random_uuid(),
 reservation_id uuid not null unique references sandbox_commerce_v1.native_store_reservations,
 buyer_id uuid not null,session_id uuid not null,request_id uuid not null,
 created_at timestamptz not null default clock_timestamp(),unique(buyer_id,request_id)
);
alter table sandbox_commerce_v1.native_store_dispatch_attempts enable row level security;
alter table sandbox_commerce_v1.native_store_dispatch_attempts force row level security;
create policy owner_only on sandbox_commerce_v1.native_store_dispatch_attempts for all to sbx_v1_core_owner using(true) with check(true);
revoke all on sandbox_commerce_v1.native_store_dispatch_attempts from public,anon,authenticated,service_role;
create trigger immutable before update or delete on sandbox_commerce_v1.native_store_dispatch_attempts for each row execute function sandbox_commerce_v1.native_store_quote_immutable();
create trigger immutable_truncate before truncate on sandbox_commerce_v1.native_store_dispatch_attempts for each statement execute function sandbox_commerce_v1.native_store_quote_immutable();
create function sandbox_commerce_v1.native_store_consume_attempt(p_user uuid,p_session uuid,p_reservation uuid,p_request uuid,p_recover boolean)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare a sandbox_commerce_v1.native_store_dispatch_attempts;r sandbox_commerce_v1.native_store_reservations;
 buyer jsonb;seller jsonb;fresh jsonb;enabled boolean;newly boolean:=false;owner_until timestamptz;
begin
 perform sandbox_commerce_v1.arm_transaction_timeout();perform sandbox_commerce_v1.assert_provider_service();perform sandbox_commerce_v1.assert_generation(false);
 if p_user is null or p_session is null or p_reservation is null or p_request is null or p_recover is null then raise exception 'native_store_attempt_invalid';end if;
 buyer:=sandbox_commerce_v1.assert_authority(p_user,p_session,'delivery');
 if not pg_try_advisory_xact_lock(hashtextextended('native-store-consume:'||p_user,691)) then raise exception 'native_store_attempt_busy' using errcode='55P03';end if;
 select * into r from sandbox_commerce_v1.native_store_reservations where id=p_reservation and buyer_id=p_user;
 if r.id is null then raise exception 'native_store_attempt_unavailable';end if;
 select * into a from sandbox_commerce_v1.native_store_dispatch_attempts where reservation_id=r.id and buyer_id=p_user;
 if a.id is not null and not p_recover and a.request_id<>p_request then raise exception 'native_store_attempt_conflict';end if;
 if a.id is null and not p_recover then
  if exists(select 1 from sandbox_commerce_v1.native_store_dispatch_attempts where buyer_id=p_user and request_id=p_request) then raise exception 'native_store_attempt_conflict';end if;
  perform sandbox_commerce_v1.assert_generation(true);
  buyer:=sandbox_commerce_v1.assert_authority(p_user,p_session,'buyer');
  fresh:=sandbox_commerce_v1.native_store_quote_command_armed(p_user,p_session,'offer',p_request,jsonb_build_object('offerId',r.quote->>'offerId','store',r.store));
  if fresh->>'status'<>'ok' or fresh#>'{data,quote}' is distinct from r.quote then raise exception 'native_store_attempt_quote_changed';end if;
  select preparation_enabled into strict enabled from sandbox_commerce_v1.native_store_quote_controls where singleton for share nowait;
  if not enabled then raise exception 'native_store_attempt_disabled';end if;
  seller:=sandbox_commerce_v1.assert_authority((r.quote->>'creatorId')::uuid,null,'creator_subject');
  owner_until:=sandbox_commerce_v1.resource_owner_delivery_deadline((r.quote->>'creatorId')::uuid,p_user);
  perform sandbox_commerce_v1.assert_fresh(buyer);perform sandbox_commerce_v1.assert_fresh(seller);
  if clock_timestamp()>=owner_until then raise exception 'native_store_owner_expired';end if;
  insert into sandbox_commerce_v1.native_store_dispatch_attempts(reservation_id,buyer_id,session_id,request_id) values(r.id,p_user,p_session,p_request) returning * into a;
  newly:=true;
 end if;
 perform sandbox_commerce_v1.assert_fresh(buyer);
 if seller is not null then perform sandbox_commerce_v1.assert_fresh(seller);end if;
 if owner_until is not null and clock_timestamp()>=owner_until then raise exception 'native_store_owner_expired';end if;
 -- This result is meaningful only after transaction commit. Even the first
 -- observation is consumption evidence, never permission to invoke the SDK.
 return jsonb_build_object('newlyConsumed',newly,'dispatchAllowed',false,'providerQualified',false,'attempt',case when a.id is null then null else
  jsonb_build_object('id','nssv1_attempt_'||a.id,'reservationId','nssv1_reservation_'||r.id,'selectionId','nssv1_selection_'||r.selection_id,
   'originalRequestId',a.request_id,'originalSessionGeneration',a.session_id,'quoteDigest',r.quote->>'quoteDigest','createdAt',a.created_at,
   'state','consumed','dispatchAllowed',false,'providerQualified',false) end);
end $$;
revoke all on function sandbox_commerce_v1.native_store_consume_attempt(uuid,uuid,uuid,uuid,boolean) from public,anon,authenticated,service_role;
reset role;
