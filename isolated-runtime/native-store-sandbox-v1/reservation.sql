-- Default-off source module installed after quote/claim in the pinned profile.
-- A server-side shared-SKU fence, never no-charge admission or dispatch proof.
set local role sbx_v1_core_owner;
create table sandbox_commerce_v1.native_store_reservations(
 id uuid primary key default gen_random_uuid(),
 selection_id uuid not null unique references sandbox_commerce_v1.native_store_selections,
 buyer_id uuid not null,session_id uuid not null,request_id uuid not null,
 project_id text not null,app_id text not null,store text not null check(store in('APP_STORE','PLAY_STORE')),
 environment text not null check(environment='SANDBOX'),product_id text not null,quote jsonb not null,
 created_at timestamptz not null default clock_timestamp(),unique(buyer_id,request_id)
);
alter table sandbox_commerce_v1.native_store_reservations enable row level security;
alter table sandbox_commerce_v1.native_store_reservations force row level security;
create policy owner_only on sandbox_commerce_v1.native_store_reservations for all to sbx_v1_core_owner using(true) with check(true);
revoke all on sandbox_commerce_v1.native_store_reservations from public,anon,authenticated,service_role;
create trigger immutable before update or delete on sandbox_commerce_v1.native_store_reservations for each row execute function sandbox_commerce_v1.native_store_quote_immutable();
create trigger immutable_truncate before truncate on sandbox_commerce_v1.native_store_reservations for each statement execute function sandbox_commerce_v1.native_store_quote_immutable();
create function sandbox_commerce_v1.native_store_reservation_json(r sandbox_commerce_v1.native_store_reservations)
returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id','nssv1_reservation_'||r.id,'selectionId','nssv1_selection_'||r.selection_id,
 'originalRequestId',r.request_id,'originalSessionGeneration',r.session_id,'createdAt',r.created_at,
 'quoteDigest',r.quote->>'quoteDigest','state','dispatch_reserved','dispatchAllowed',false,'providerQualified',false);
$$;
create function sandbox_commerce_v1.native_store_reservation_command(p_user uuid,p_session uuid,p_command text,p_request uuid,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare buyer jsonb;seller jsonb;s sandbox_commerce_v1.native_store_selections;r sandbox_commerce_v1.native_store_reservations;
 sid uuid;fresh jsonb;enabled boolean;status text:='ok';body jsonb;owner_until timestamptz;
begin
 perform sandbox_commerce_v1.arm_transaction_timeout();perform sandbox_commerce_v1.assert_provider_service();perform sandbox_commerce_v1.assert_generation(false);
 if p_user is null or p_session is null or p_request is null or p_command not in('reserve','reserve-recover') or p_command is null
  or jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>4096 or not(p_payload ? 'selectionId') or p_payload-array['selectionId']<>'{}'::jsonb
  or jsonb_typeof(p_payload->'selectionId') is distinct from 'string'
  or p_payload->>'selectionId' !~ '^nssv1_selection_[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
 then raise exception 'native_store_reservation_invalid';end if;
 buyer:=sandbox_commerce_v1.assert_authority(p_user,p_session,'delivery');
 sid:=substring(p_payload->>'selectionId' from 17)::uuid;
 if p_command='reserve' and not pg_try_advisory_xact_lock(hashtextextended('native-store-reserve:'||p_user,691))
 then raise exception 'native_store_reservation_busy' using errcode='55P03';end if;
 select * into s from sandbox_commerce_v1.native_store_selections where id=sid and buyer_id=p_user;
 if s.id is null then
  if p_command='reserve' then raise exception 'native_store_selection_unavailable';end if;
  status:='unknown';body:=jsonb_build_object('reservation',null,'reason','reservation_unknown');
 elsif exists(select 1 from sandbox_commerce_v1.native_store_reservation_terminals where selection_id=sid) then
  status:='held';body:=jsonb_build_object('reservation',null,'reason','selection_terminal');
 else
  if p_command='reserve' then perform sandbox_commerce_v1.native_store_lock_project(s.quote#>>'{catalog,projectId}');end if;
  select * into r from sandbox_commerce_v1.native_store_reservations where buyer_id=p_user and selection_id=sid;
  if p_command='reserve' then
   if r.id is not null then
    if r.request_id<>p_request then raise exception 'native_store_reservation_conflict';end if;
   else
    if exists(select 1 from sandbox_commerce_v1.native_store_reservations where buyer_id=p_user and request_id=p_request)
    then raise exception 'native_store_reservation_conflict';end if;
    -- Full server-owned quote comparison reuses retained asset, media scan,
    -- resource/offer and catalog locks. Never trust client SKU/scope claims.
    fresh:=sandbox_commerce_v1.native_store_quote_command_armed(p_user,p_session,'offer',p_request,
      jsonb_build_object('offerId',s.quote->>'offerId','store',s.quote#>>'{catalog,store}'));
    if fresh->>'status'<>'ok' or fresh#>'{data,quote}' is distinct from s.quote then raise exception 'native_store_reservation_quote_changed';end if;
    select preparation_enabled into strict enabled from sandbox_commerce_v1.native_store_quote_controls where singleton for share nowait;
    if not enabled then raise exception 'native_store_reservation_disabled';end if;
    perform sandbox_commerce_v1.assert_generation(true);
    buyer:=sandbox_commerce_v1.assert_authority(p_user,p_session,'buyer');
    seller:=sandbox_commerce_v1.assert_authority((s.quote->>'creatorId')::uuid,null,'creator_subject');
    owner_until:=sandbox_commerce_v1.resource_owner_delivery_deadline((s.quote->>'creatorId')::uuid,p_user);
    if exists(select 1 from sandbox_commerce_v1.native_store_reservations x where x.buyer_id=p_user
      and x.project_id=s.quote#>>'{catalog,projectId}' and x.app_id=s.quote#>>'{catalog,appId}' and x.store=s.quote#>>'{catalog,store}'
      and x.environment=s.quote#>>'{catalog,environment}' and x.product_id=s.quote#>>'{catalog,wireProductId}'
      and not exists(select 1 from sandbox_commerce_v1.native_store_reservation_terminals t where t.reservation_id=x.id))
    then raise exception 'native_store_shared_sku_reserved';end if;
    perform sandbox_commerce_v1.assert_fresh(buyer);perform sandbox_commerce_v1.assert_fresh(seller);
    if clock_timestamp()>=owner_until then raise exception 'native_store_owner_expired';end if;
    insert into sandbox_commerce_v1.native_store_reservations(selection_id,buyer_id,session_id,request_id,project_id,app_id,store,environment,product_id,quote)
    values(sid,p_user,p_session,p_request,s.quote#>>'{catalog,projectId}',s.quote#>>'{catalog,appId}',s.quote#>>'{catalog,store}',s.quote#>>'{catalog,environment}',s.quote#>>'{catalog,wireProductId}',s.quote)
    returning * into r;
   end if;
  end if;
  if r.id is null then status:='unknown';body:=jsonb_build_object('reservation',null,'reason','reservation_unknown');
  else body:=jsonb_build_object('reservation',sandbox_commerce_v1.native_store_reservation_json(r),'reason',null);end if;
 end if;
 perform sandbox_commerce_v1.assert_fresh(buyer);
 if seller is not null then perform sandbox_commerce_v1.assert_fresh(seller);end if;
 if owner_until is not null and clock_timestamp()>=owner_until then raise exception 'native_store_owner_expired';end if;
 return jsonb_build_object('protocol','native-store-sandbox-reservation-v1','command',p_command,'requestId',p_request,
  'actor',jsonb_build_object('userId',p_user,'accountId',p_user,'sessionGeneration',p_session),'status',status,'data',body,'dispatchAllowed',false,'providerQualified',false);
end $$;
revoke all on function sandbox_commerce_v1.native_store_reservation_json(sandbox_commerce_v1.native_store_reservations),
 sandbox_commerce_v1.native_store_reservation_command(uuid,uuid,text,uuid,jsonb) from public,anon,authenticated,service_role;
reset role;
create function public.native_store_sandbox_reservation_v1(p_user_id uuid,p_session_id uuid,p_command text,p_request_id uuid,p_payload jsonb)
returns jsonb language sql security definer set search_path='' as $$select sandbox_commerce_v1.native_store_reservation_command(p_user_id,p_session_id,p_command,p_request_id,p_payload)$$;
alter function public.native_store_sandbox_reservation_v1(uuid,uuid,text,uuid,jsonb) owner to sbx_v1_core_owner;
revoke all on function public.native_store_sandbox_reservation_v1(uuid,uuid,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.native_store_sandbox_reservation_v1(uuid,uuid,text,uuid,jsonb) to service_role;
