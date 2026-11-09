-- SOURCE ONLY, dormant qualified dispatch. No qualification rows are seeded.
-- Trusted authenticated backend boundary, not client/SQL cryptographic attestation.
set local role sbx_v1_core_owner;
create function sandbox_commerce_v1.native_store_consume_attempt_armed(p_user uuid,p_session uuid,p_reservation uuid,p_request uuid,p_recover boolean)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare a sandbox_commerce_v1.native_store_dispatch_attempts;r sandbox_commerce_v1.native_store_reservations;
 buyer jsonb;seller jsonb;fresh jsonb;enabled boolean;newly boolean:=false;owner_until timestamptz;
begin
 if current_setting('transaction_timeout')::interval<=interval '0' or current_setting('transaction_timeout')::interval>interval '5 seconds' then raise exception 'native_store_attempt_budget_required';end if;
 perform sandbox_commerce_v1.assert_provider_service();perform sandbox_commerce_v1.assert_generation(false);
 if p_user is null or p_session is null or p_reservation is null or p_request is null or p_recover is null then raise exception 'native_store_attempt_invalid';end if;
 buyer:=sandbox_commerce_v1.assert_authority(p_user,p_session,'delivery');
 if not pg_try_advisory_xact_lock(hashtextextended('native-store-reserve:'||p_user,691)) then raise exception 'native_store_attempt_busy' using errcode='55P03';end if;
 if not pg_try_advisory_xact_lock(hashtextextended('native-store-consume:'||p_user,691)) then raise exception 'native_store_attempt_busy' using errcode='55P03';end if;
 select * into r from sandbox_commerce_v1.native_store_reservations where id=p_reservation and buyer_id=p_user;
 if r.id is null then raise exception 'native_store_attempt_unavailable';end if;
 perform sandbox_commerce_v1.native_store_lock_project(r.project_id);
 if exists(select 1 from sandbox_commerce_v1.native_store_reservation_terminals where selection_id=r.selection_id)
 then raise exception 'native_store_attempt_terminal';end if;
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

create or replace function sandbox_commerce_v1.native_store_consume_attempt(p_user uuid,p_session uuid,p_reservation uuid,p_request uuid,p_recover boolean)
returns jsonb language plpgsql security invoker set search_path='' as $$begin
 perform sandbox_commerce_v1.arm_transaction_timeout();
 return sandbox_commerce_v1.native_store_consume_attempt_armed(p_user,p_session,p_reservation,p_request,p_recover);
end $$;
revoke all on function sandbox_commerce_v1.native_store_consume_attempt_armed(uuid,uuid,uuid,uuid,boolean) from public,anon,authenticated,service_role;
create table sandbox_commerce_v1.native_store_protocol_qualifications(
 id uuid not null,revision bigint not null check(revision between 1 and 9007199254740991),primary key(id,revision),
 catalog_binding_id uuid not null,catalog_revision bigint not null,quote_digest text not null check(quote_digest~'^[a-f0-9]{64}$'),
 connection_id uuid not null,connection_revision bigint not null check(connection_revision between 1 and 9007199254740991),
 protocol_evidence_sha256 text not null check(protocol_evidence_sha256~'^[a-f0-9]{64}$'),
 platform text not null check(platform in('ios','android')),
 native_build text not null check(length(native_build) between 1 and 128 and native_build=btrim(native_build) and native_build!~'[[:cntrl:]]'),native_version text not null check(length(native_version) between 1 and 128 and native_version=btrim(native_version) and native_version!~'[[:cntrl:]]'),
 signed_app_version text not null check(length(signed_app_version) between 1 and 128 and signed_app_version=btrim(signed_app_version) and signed_app_version!~'[[:cntrl:]]'),
 sdk_version text not null check(length(sdk_version) between 1 and 128 and sdk_version=btrim(sdk_version) and sdk_version!~'[[:cntrl:]]'),
 no_charge_account_scope text not null check(no_charge_account_scope in('testflight_distribution','play_license_account')),
 account_evidence_sha256 text not null check(account_evidence_sha256~'^[a-f0-9]{64}$'),
 created_at timestamptz not null default clock_timestamp(),
 foreign key(catalog_binding_id,catalog_revision) references sandbox_commerce_v1.native_store_catalog_bindings(id,revision)
);
create table sandbox_commerce_v1.native_store_protocol_revocations(
 qualification_id uuid not null,qualification_revision bigint not null,
 reason text not null check(length(reason)>0),created_at timestamptz not null default clock_timestamp(),
 primary key(qualification_id,qualification_revision),foreign key(qualification_id,qualification_revision) references sandbox_commerce_v1.native_store_protocol_qualifications(id,revision)
);
create table sandbox_commerce_v1.native_store_qualified_attempts(
 attempt_id uuid primary key references sandbox_commerce_v1.native_store_dispatch_attempts,
 qualification_id uuid not null,qualification_revision bigint not null,
 created_at timestamptz not null default clock_timestamp(),
 foreign key(qualification_id,qualification_revision) references sandbox_commerce_v1.native_store_protocol_qualifications(id,revision)
);
do $$declare t text;begin
 foreach t in array array['native_store_protocol_qualifications','native_store_protocol_revocations','native_store_qualified_attempts'] loop
  execute format('alter table sandbox_commerce_v1.%I enable row level security',t);
  execute format('alter table sandbox_commerce_v1.%I force row level security',t);
  execute format('create policy owner_only on sandbox_commerce_v1.%I for all to sbx_v1_core_owner using(true) with check(true)',t);
  execute format('revoke all on sandbox_commerce_v1.%I from public,anon,authenticated,service_role',t);
  execute format('create trigger immutable before update or delete on sandbox_commerce_v1.%I for each row execute function sandbox_commerce_v1.native_store_quote_immutable()',t);
  execute format('create trigger immutable_truncate before truncate on sandbox_commerce_v1.%I for each statement execute function sandbox_commerce_v1.native_store_quote_immutable()',t);
 end loop;
end $$;
create function sandbox_commerce_v1.native_store_qualification_json(p_id uuid,p_revision bigint,p_quote jsonb) returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('id','nssv1_qualification_'||q.id,'revision',q.revision,
 'projectId',p_quote#>>'{catalog,projectId}','appId',p_quote#>>'{catalog,appId}','store',p_quote#>>'{catalog,store}',
 'environment','SANDBOX','wireProductId',p_quote#>>'{catalog,wireProductId}','catalogBindingId','nssv1_catalog_'||q.catalog_binding_id,
 'catalogRevision',q.catalog_revision,'quoteDigest',q.quote_digest,'connectionId',q.connection_id,'connectionRevision',q.connection_revision,
 'protocolEvidenceSha256',q.protocol_evidence_sha256,'platform',q.platform,'nativeBuild',q.native_build,'nativeVersion',q.native_version,'signedAppVersion',q.signed_app_version,
 'sdkVersion',q.sdk_version,'noChargeAccountScope',q.no_charge_account_scope,'accountEvidenceSha256',q.account_evidence_sha256)
 from sandbox_commerce_v1.native_store_protocol_qualifications q where q.id=p_id and q.revision=p_revision;
$$;
revoke all on function sandbox_commerce_v1.native_store_qualification_json(uuid,bigint,jsonb) from public,anon,authenticated,service_role;
reset role;
grant native_store_sandbox_v1_owner to postgres with inherit false,set true;
set local role native_store_sandbox_v1_owner;
-- Exact active registry only, no secret/key exposure or wildcard lookup.
create function native_store_sandbox_v1.dispatch_connection(p_id uuid,p_revision bigint) returns jsonb
language plpgsql security definer set search_path='' as $$declare c native_store_sandbox_v1.connections;begin
 if current_setting('transaction_isolation')<>'read committed' or current_setting('transaction_timeout')::interval not between interval '1 microsecond' and interval '5 seconds'
  or clock_timestamp()>=transaction_timestamp()+interval '5 seconds' then raise exception 'native_store_dispatch_context_required';end if;
 perform 1 from native_store_sandbox_v1.control where singleton and enabled for share nowait;if not found then return null;end if;
 lock table native_store_sandbox_v1.revocations in share mode nowait;
 select * into c from native_store_sandbox_v1.connections where id=p_id and revision=p_revision for share nowait;
 if c.id is null or exists(select 1 from native_store_sandbox_v1.revocations where connection_id=p_id and connection_revision=p_revision) then return null;end if;
 return jsonb_build_object('projectId',c.project_id,'appId',c.app_id,'store',c.store,'environment',c.environment);
end $$;
revoke all on function native_store_sandbox_v1.dispatch_connection(uuid,bigint) from public,anon,authenticated,service_role;
grant usage on schema native_store_sandbox_v1 to sbx_v1_core_owner;
grant execute on function native_store_sandbox_v1.dispatch_connection(uuid,bigint) to sbx_v1_core_owner;
reset role;
grant native_store_sandbox_v1_owner to postgres with inherit false,set false;
set local role sbx_v1_core_owner;
-- Single private resolver for read-only discovery and fresh consumption.
create function sandbox_commerce_v1.native_store_resolve_dispatch_qualification(p_quote jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare q sandbox_commerce_v1.native_store_protocol_qualifications;n integer;connection jsonb;reason text:='qualification_unavailable';qualification jsonb;
begin
 perform sandbox_commerce_v1.assert_generation(false);
 perform 1 from sandbox_commerce_v1.native_store_quote_controls where singleton and preparation_enabled for share nowait;
 if not found then return jsonb_build_object('qualification',null,'reason','preparation_disabled');end if;
 perform sandbox_commerce_v1.native_store_lock_project(p_quote#>>'{catalog,projectId}');
 if sandbox_commerce_v1.native_store_project_pending(p_quote#>>'{catalog,projectId}') then reason:='project_evidence_pending';
 else
  lock table sandbox_commerce_v1.native_store_protocol_qualifications,sandbox_commerce_v1.native_store_protocol_revocations in share mode nowait;
  select count(*) into n from sandbox_commerce_v1.native_store_protocol_qualifications x
   where x.catalog_binding_id=substring(p_quote#>>'{catalog,bindingId}' from 15)::uuid and x.catalog_revision=(p_quote#>>'{catalog,revision}')::bigint and x.quote_digest=p_quote->>'quoteDigest'
   and not exists(select 1 from sandbox_commerce_v1.native_store_protocol_revocations v where v.qualification_id=x.id and v.qualification_revision=x.revision);
  if n=1 then
   select x.* into strict q from sandbox_commerce_v1.native_store_protocol_qualifications x
    where x.catalog_binding_id=substring(p_quote#>>'{catalog,bindingId}' from 15)::uuid and x.catalog_revision=(p_quote#>>'{catalog,revision}')::bigint and x.quote_digest=p_quote->>'quoteDigest'
    and not exists(select 1 from sandbox_commerce_v1.native_store_protocol_revocations v where v.qualification_id=x.id and v.qualification_revision=x.revision) for share nowait;
   connection:=native_store_sandbox_v1.dispatch_connection(q.connection_id,q.connection_revision);
   if connection is distinct from jsonb_build_object('projectId',p_quote#>>'{catalog,projectId}','appId',p_quote#>>'{catalog,appId}','store',p_quote#>>'{catalog,store}','environment','SANDBOX') then reason:='connection_unavailable';
   elsif p_quote#>>'{catalog,store}'<>'APP_STORE' or q.platform<>'ios' or q.no_charge_account_scope<>'testflight_distribution' then reason:='platform_no_charge_proof_unsupported';
   else qualification:=sandbox_commerce_v1.native_store_qualification_json(q.id,q.revision,p_quote);reason:=null;end if;
  end if;
 end if;
 return jsonb_build_object('qualification',qualification,'reason',reason);
end $$;
revoke all on function sandbox_commerce_v1.native_store_resolve_dispatch_qualification(jsonb) from public,anon,authenticated,service_role;
create function sandbox_commerce_v1.native_store_dispatch_command(p_user uuid,p_session uuid,p_command text,p_request uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r sandbox_commerce_v1.native_store_reservations;s sandbox_commerce_v1.native_store_selections;
 a sandbox_commerce_v1.native_store_dispatch_attempts;qa sandbox_commerce_v1.native_store_qualified_attempts;
 auth jsonb;resolution jsonb;fresh jsonb;
 evidence jsonb;qualification jsonb;connection jsonb;newly boolean:=false;allowed boolean:=false;
 status text:='held';reason text:='qualification_unavailable';rid uuid;sid uuid;
begin
 perform sandbox_commerce_v1.arm_transaction_timeout();perform sandbox_commerce_v1.assert_provider_service();perform sandbox_commerce_v1.assert_generation(false);
 if p_user is null or p_session is null or p_request is null or p_command not in('dispatch-consume','dispatch-recover','dispatch-qualification')
  or p_command is null or jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>4096
  or jsonb_typeof(p_payload->'selectionId') is distinct from 'string'
  or (p_command='dispatch-qualification' and (p_payload-array['selectionId'])<>'{}'::jsonb)
  or (p_command<>'dispatch-qualification' and (not(p_payload ?& array['selectionId','reservationId']) or (p_payload-array['selectionId','reservationId'])<>'{}'::jsonb))
  or coalesce(p_payload->>'selectionId','') !~ '^nssv1_selection_[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
  or (p_command<>'dispatch-qualification' and (jsonb_typeof(p_payload->'reservationId') is distinct from 'string' or coalesce(p_payload->>'reservationId','') !~ '^nssv1_reservation_[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'))
 then raise exception 'native_store_dispatch_request_invalid';end if;
 rid:=case when p_command='dispatch-qualification' then null else substring(p_payload->>'reservationId' from 19)::uuid end;sid:=substring(p_payload->>'selectionId' from 17)::uuid;
 auth:=sandbox_commerce_v1.assert_authority(p_user,p_session,'delivery');
 if p_command='dispatch-qualification' then
  select * into s from sandbox_commerce_v1.native_store_selections where id=sid and buyer_id=p_user;
  if s.id is null then reason:='selection_unavailable';
  elsif exists(select 1 from sandbox_commerce_v1.native_store_reservation_terminals where selection_id=s.id) then reason:='selection_terminal';
  else
   fresh:=sandbox_commerce_v1.native_store_quote_command_armed(p_user,p_session,'offer',p_request,jsonb_build_object('offerId',s.quote->>'offerId','store',s.quote#>>'{catalog,store}'));
   if fresh->>'status'<>'ok' or fresh#>'{data,quote}' is distinct from s.quote then reason:='quote_unavailable';
   else resolution:=sandbox_commerce_v1.native_store_resolve_dispatch_qualification(s.quote);qualification:=nullif(resolution->'qualification','null'::jsonb);reason:=resolution->>'reason';
    if qualification is not null then status:='ok';end if;
   end if;
  end if;
  perform sandbox_commerce_v1.assert_fresh(auth);perform sandbox_commerce_v1.assert_generation(false);
  return jsonb_build_object('protocol','native-store-sandbox-command-v1','command',p_command,'requestId',p_request,
   'actor',jsonb_build_object('userId',p_user,'accountId',p_user,'sessionGeneration',p_session),'status',status,
   'data',jsonb_build_object('qualification',qualification,'reason',reason),'dispatchAllowed',false,'correlation','unsupported');
 end if;
 select * into r from sandbox_commerce_v1.native_store_reservations where id=rid and selection_id=sid and buyer_id=p_user;
 if r.id is null then status:=case when p_command='dispatch-recover' then 'unknown' else 'held' end;reason:='reservation_unavailable';
 elsif exists(select 1 from sandbox_commerce_v1.native_store_reservation_terminals where selection_id=sid) then reason:='selection_terminal';
 else
  select * into strict s from sandbox_commerce_v1.native_store_selections where id=sid and buyer_id=p_user;
  if r.quote is distinct from s.quote then raise exception 'native_store_dispatch_quote_mismatch';end if;
  perform sandbox_commerce_v1.native_store_lock_project(r.quote#>>'{catalog,projectId}');
  select * into a from sandbox_commerce_v1.native_store_dispatch_attempts where reservation_id=r.id;
  if a.id is not null then
   if p_command='dispatch-consume' and a.request_id<>p_request then raise exception 'native_store_attempt_conflict';end if;
   if a.request_id<>p_request then reason:='attempt_request_mismatch';
   else
    evidence:=sandbox_commerce_v1.native_store_consume_attempt_armed(p_user,p_session,r.id,p_request,true);
    select * into qa from sandbox_commerce_v1.native_store_qualified_attempts where attempt_id=a.id;
    qualification:=sandbox_commerce_v1.native_store_qualification_json(qa.qualification_id,qa.qualification_revision,r.quote);
    if qualification is null then evidence:=null;reason:='attempt_already_consumed';
    else status:='ok';reason:=null;end if;
   end if;
  elsif p_command='dispatch-recover' then status:='unknown';reason:='attempt_unknown';
  else
   resolution:=sandbox_commerce_v1.native_store_resolve_dispatch_qualification(r.quote);
   qualification:=nullif(resolution->'qualification','null'::jsonb);reason:=resolution->>'reason';
   if qualification is not null then
    evidence:=sandbox_commerce_v1.native_store_consume_attempt_armed(p_user,p_session,r.id,p_request,false);
    newly:=(evidence->>'newlyConsumed')::boolean;
    if newly then
     insert into sandbox_commerce_v1.native_store_qualified_attempts(attempt_id,qualification_id,qualification_revision)
      values(substring(evidence#>>'{attempt,id}' from 15)::uuid,replace(qualification->>'id','nssv1_qualification_','')::uuid,(qualification->>'revision')::bigint);
     allowed:=true;status:='ok';reason:=null;
    else evidence:=null;qualification:=null;reason:='attempt_already_consumed';end if;
   end if;
  end if;
 end if;
 perform sandbox_commerce_v1.assert_fresh(auth);perform sandbox_commerce_v1.assert_generation(false);
 return jsonb_build_object('protocol','native-store-sandbox-command-v1','command',p_command,'requestId',p_request,
  'actor',jsonb_build_object('userId',p_user,'accountId',p_user,'sessionGeneration',p_session),'status',status,
  'data',jsonb_build_object('attempt',evidence->'attempt','qualification',qualification,'newlyConsumed',newly,'reason',reason),
  'dispatchAllowed',allowed,'correlation','unsupported');
end $$;
revoke all on function sandbox_commerce_v1.native_store_dispatch_command(uuid,uuid,text,uuid,jsonb) from public,anon,authenticated,service_role;
reset role;
create function public.native_store_sandbox_dispatch_v1(p_user_id uuid,p_session_id uuid,p_command text,p_request_id uuid,p_payload jsonb) returns jsonb
language sql security definer set search_path='' as $$select sandbox_commerce_v1.native_store_dispatch_command(p_user_id,p_session_id,p_command,p_request_id,p_payload)$$;
alter function public.native_store_sandbox_dispatch_v1(uuid,uuid,text,uuid,jsonb) owner to sbx_v1_core_owner;
revoke all on function public.native_store_sandbox_dispatch_v1(uuid,uuid,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.native_store_sandbox_dispatch_v1(uuid,uuid,text,uuid,jsonb) to service_role;
