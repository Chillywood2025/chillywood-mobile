-- SOURCE ONLY: NOT INSTALLED, NOT ENABLED. No provider or purchase action.
-- Forward-only extension of the immutable native-store-sandbox-v1 closure.
-- Apply only in a separately authorized explicit transaction. No enrollment,
-- setup, connection, receipt, settlement, or grant is seeded by this source.
grant sbx_v1_core_owner to postgres with inherit false,set true;
-- Temporary managed-installer capability for replacing the owned public wrapper.
-- Revoked in this same transaction, and checked by the install commit fence.
grant create on schema public to sbx_v1_core_owner;
set local role sbx_v1_core_owner;

create table sandbox_commerce_v1.native_store_play_handoff_control(
 singleton boolean primary key default true check(singleton),
 enabled boolean not null default false
);
create table sandbox_commerce_v1.native_store_play_handoff_setups(
 id uuid not null,revision bigint not null check(revision between 1 and 9007199254740991),
 primary key(id,revision),
 catalog_binding_id uuid not null,catalog_revision bigint not null check(catalog_revision between 1 and 9007199254740991),
 quote_digest text not null check(quote_digest~'^[a-f0-9]{64}$'),
 connection_id uuid not null,connection_revision bigint not null check(connection_revision between 1 and 9007199254740991),
 protocol_evidence_sha256 text not null check(protocol_evidence_sha256~'^[a-f0-9]{64}$'),
 platform text not null default 'android' check(platform='android'),
 native_build text not null check(length(native_build) between 1 and 128 and native_build=btrim(native_build) and native_build!~'[[:cntrl:]]'),
 native_version text not null check(length(native_version) between 1 and 128 and native_version=btrim(native_version) and native_version!~'[[:cntrl:]]'),
 sdk_version text not null default '10.15.1' check(sdk_version='10.15.1'),
 created_at timestamptz not null default clock_timestamp(),
 foreign key(catalog_binding_id,catalog_revision) references sandbox_commerce_v1.native_store_catalog_bindings(id,revision)
);
create table sandbox_commerce_v1.native_store_play_setup_revocations(
 setup_id uuid not null,setup_revision bigint not null,reason text not null check(length(reason)>0),
 created_at timestamptz not null default clock_timestamp(),primary key(setup_id,setup_revision),
 foreign key(setup_id,setup_revision) references sandbox_commerce_v1.native_store_play_handoff_setups(id,revision)
);
-- Any ordinary active buyer may be enrolled by the trusted operator. These are
-- setup-review records, not attestations of the phone's Google account/payment
-- instrument and not automatic proof that a future sheet cannot charge money.
create table sandbox_commerce_v1.native_store_play_enrollments(
 id uuid not null,revision bigint not null check(revision between 1 and 9007199254740991),
 primary key(id,revision),buyer_id uuid not null,
 setup_id uuid not null,setup_revision bigint not null,
 account_evidence_sha256 text not null check(account_evidence_sha256~'^[a-f0-9]{64}$'),
 expires_at timestamptz not null check(isfinite(expires_at)),
 created_at timestamptz not null default clock_timestamp(),
 foreign key(setup_id,setup_revision) references sandbox_commerce_v1.native_store_play_handoff_setups(id,revision)
);
create table sandbox_commerce_v1.native_store_play_enrollment_revocations(
 enrollment_id uuid not null,enrollment_revision bigint not null,reason text not null check(length(reason)>0),
 created_at timestamptz not null default clock_timestamp(),primary key(enrollment_id,enrollment_revision),
 foreign key(enrollment_id,enrollment_revision) references sandbox_commerce_v1.native_store_play_enrollments(id,revision)
);
create table sandbox_commerce_v1.native_store_play_handoff_attempts(
 attempt_id uuid primary key references sandbox_commerce_v1.native_store_dispatch_attempts,
 enrollment_id uuid not null,enrollment_revision bigint not null,
 created_at timestamptz not null default clock_timestamp(),
 foreign key(enrollment_id,enrollment_revision) references sandbox_commerce_v1.native_store_play_enrollments(id,revision)
);
create index native_store_play_setup_quote on sandbox_commerce_v1.native_store_play_handoff_setups(catalog_binding_id,catalog_revision,quote_digest);
create index native_store_play_buyer_enrollment on sandbox_commerce_v1.native_store_play_enrollments(buyer_id,setup_id,setup_revision);
do $$declare t text;begin
 foreach t in array array['native_store_play_handoff_control','native_store_play_handoff_setups',
  'native_store_play_setup_revocations','native_store_play_enrollments','native_store_play_enrollment_revocations','native_store_play_handoff_attempts'] loop
  execute format('alter table sandbox_commerce_v1.%I enable row level security',t);
  execute format('alter table sandbox_commerce_v1.%I force row level security',t);
  execute format('create policy owner_only on sandbox_commerce_v1.%I for all to sbx_v1_core_owner using(true) with check(true)',t);
  execute format('revoke all on sandbox_commerce_v1.%I from public,anon,authenticated,service_role',t);
  if t<>'native_store_play_handoff_control' then
   execute format('create trigger immutable before update or delete on sandbox_commerce_v1.%I for each row execute function sandbox_commerce_v1.native_store_quote_immutable()',t);
   execute format('create trigger immutable_truncate before truncate on sandbox_commerce_v1.%I for each statement execute function sandbox_commerce_v1.native_store_quote_immutable()',t);
  end if;
 end loop;
end $$;

create function sandbox_commerce_v1.native_store_play_qualification_json(p_id uuid,p_revision bigint,p_quote jsonb,p_session uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('id','nssv1_play_qualification_'||e.id,'revision',e.revision,
  'projectId',p_quote#>>'{catalog,projectId}','appId',p_quote#>>'{catalog,appId}','store','PLAY_STORE','environment','SANDBOX',
  'wireProductId',p_quote#>>'{catalog,wireProductId}','catalogBindingId','nssv1_catalog_'||s.catalog_binding_id,
  'catalogRevision',s.catalog_revision,'quoteDigest',s.quote_digest,'connectionId',s.connection_id,'connectionRevision',s.connection_revision,
  'protocolEvidenceSha256',s.protocol_evidence_sha256,'platform',s.platform,'nativeBuild',s.native_build,'nativeVersion',s.native_version,
  'sdkVersion',s.sdk_version,'noChargeAccountScope','play_test_sheet_handoff','accountEvidenceSha256',e.account_evidence_sha256,
  'handoffMode','play_test_sheet_handoff_v1','automaticNoChargeProof',false,'userStoreConfirmationRequired',true,
  'buyerId',e.buyer_id,'sessionGeneration',p_session,'enrollmentExpiresAt',e.expires_at)
 from sandbox_commerce_v1.native_store_play_enrollments e
 join sandbox_commerce_v1.native_store_play_handoff_setups s on s.id=e.setup_id and s.revision=e.setup_revision
 where e.id=p_id and e.revision=p_revision;
$$;

create function sandbox_commerce_v1.native_store_resolve_play_handoff(p_user uuid,p_session uuid,p_quote jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare e sandbox_commerce_v1.native_store_play_enrollments;s sandbox_commerce_v1.native_store_play_handoff_setups;
 n integer;connection jsonb;qualification jsonb;reason text:='play_enrollment_unavailable';
begin
 perform sandbox_commerce_v1.assert_generation(false);
 perform 1 from sandbox_commerce_v1.native_store_play_handoff_control where singleton and enabled for share nowait;
 if not found then return jsonb_build_object('qualification',null,'reason','play_handoff_disabled');end if;
 perform 1 from sandbox_commerce_v1.native_store_quote_controls where singleton and preparation_enabled for share nowait;
 if not found then return jsonb_build_object('qualification',null,'reason','preparation_disabled');end if;
 if p_user is null or p_session is null or p_quote#>>'{catalog,store}' is distinct from 'PLAY_STORE'
  or p_quote#>>'{catalog,environment}' is distinct from 'SANDBOX'
 then return jsonb_build_object('qualification',null,'reason','play_scope_unavailable');end if;
 perform sandbox_commerce_v1.native_store_lock_project(p_quote#>>'{catalog,projectId}');
 if sandbox_commerce_v1.native_store_project_pending(p_quote#>>'{catalog,projectId}') then
  return jsonb_build_object('qualification',null,'reason','project_evidence_pending');end if;
 -- Prevent enrollment, revocation, and duplicate races until the consume commits.
 lock table sandbox_commerce_v1.native_store_play_handoff_setups,sandbox_commerce_v1.native_store_play_setup_revocations,
  sandbox_commerce_v1.native_store_play_enrollments,sandbox_commerce_v1.native_store_play_enrollment_revocations in share mode nowait;
 select count(*) into n from sandbox_commerce_v1.native_store_play_enrollments x
  join sandbox_commerce_v1.native_store_play_handoff_setups y on y.id=x.setup_id and y.revision=x.setup_revision
  where x.buyer_id=p_user and y.catalog_binding_id=substring(p_quote#>>'{catalog,bindingId}' from 15)::uuid
  and y.catalog_revision=(p_quote#>>'{catalog,revision}')::bigint and y.quote_digest=p_quote->>'quoteDigest'
  and not exists(select 1 from sandbox_commerce_v1.native_store_play_enrollment_revocations v where v.enrollment_id=x.id and v.enrollment_revision=x.revision)
  and not exists(select 1 from sandbox_commerce_v1.native_store_play_setup_revocations v where v.setup_id=y.id and v.setup_revision=y.revision);
 -- Expired but unrevoked duplicate records also fail closed. Operators must
 -- explicitly revoke the superseded revision before enrolling another one.
 if n<>1 then return jsonb_build_object('qualification',null,'reason',reason);end if;
 select x.* into strict e from sandbox_commerce_v1.native_store_play_enrollments x
  join sandbox_commerce_v1.native_store_play_handoff_setups y on y.id=x.setup_id and y.revision=x.setup_revision
  where x.buyer_id=p_user and y.catalog_binding_id=substring(p_quote#>>'{catalog,bindingId}' from 15)::uuid
  and y.catalog_revision=(p_quote#>>'{catalog,revision}')::bigint and y.quote_digest=p_quote->>'quoteDigest'
  and not exists(select 1 from sandbox_commerce_v1.native_store_play_enrollment_revocations v where v.enrollment_id=x.id and v.enrollment_revision=x.revision)
  and not exists(select 1 from sandbox_commerce_v1.native_store_play_setup_revocations v where v.setup_id=y.id and v.setup_revision=y.revision);
 select * into strict s from sandbox_commerce_v1.native_store_play_handoff_setups where id=e.setup_id and revision=e.setup_revision;
 if clock_timestamp()>=e.expires_at then reason:='play_enrollment_expired';
 elsif e.expires_at<transaction_timestamp()+interval '5 seconds' then reason:='play_enrollment_expiring';
 else
  connection:=native_store_sandbox_v1.dispatch_connection(s.connection_id,s.connection_revision);
  if connection is distinct from jsonb_build_object('projectId',p_quote#>>'{catalog,projectId}','appId',p_quote#>>'{catalog,appId}','store','PLAY_STORE','environment','SANDBOX')
  then reason:='connection_unavailable';
  else qualification:=sandbox_commerce_v1.native_store_play_qualification_json(e.id,e.revision,p_quote,p_session);reason:=null;end if;
 end if;
 return jsonb_build_object('qualification',qualification,'reason',reason);
end $$;

-- Require every time-based authority to outlive the already-armed absolute
-- transaction budget. Never reset transaction_timeout: a changed visible GUC
-- need not move its already-running alarm. The deferred check is additional
-- defense; SET CONSTRAINTS ALL IMMEDIATE cannot allow expiry before commit.
create function sandbox_commerce_v1.native_store_play_assert_attempt(p_attempt uuid)
returns void language plpgsql security invoker set search_path='' as $$
declare a sandbox_commerce_v1.native_store_dispatch_attempts;r sandbox_commerce_v1.native_store_reservations;
 h sandbox_commerce_v1.native_store_play_handoff_attempts;resolution jsonb;qualification jsonb;buyer jsonb;seller jsonb;
 fresh jsonb;deadline timestamptz;
begin
 perform sandbox_commerce_v1.assert_provider_service();perform sandbox_commerce_v1.assert_generation(true);
 select * into strict a from sandbox_commerce_v1.native_store_dispatch_attempts where id=p_attempt;
 select * into strict h from sandbox_commerce_v1.native_store_play_handoff_attempts where attempt_id=a.id;
 select * into strict r from sandbox_commerce_v1.native_store_reservations where id=a.reservation_id and buyer_id=a.buyer_id;
 buyer:=sandbox_commerce_v1.assert_authority(a.buyer_id,a.session_id,'buyer');
 seller:=sandbox_commerce_v1.assert_authority((r.quote->>'creatorId')::uuid,null,'creator_subject');
 fresh:=sandbox_commerce_v1.native_store_quote_command_armed(a.buyer_id,a.session_id,'offer',a.request_id,
  jsonb_build_object('offerId',r.quote->>'offerId','store','PLAY_STORE'));
 if fresh->>'status'<>'ok' or fresh#>'{data,quote}' is distinct from r.quote
  or exists(select 1 from sandbox_commerce_v1.native_store_reservation_terminals where selection_id=r.selection_id)
 then raise exception 'native_store_play_attempt_quote_changed';end if;
 resolution:=sandbox_commerce_v1.native_store_resolve_play_handoff(a.buyer_id,a.session_id,r.quote);
 qualification:=nullif(resolution->'qualification','null'::jsonb);
 if qualification is null or qualification->>'id'<>'nssv1_play_qualification_'||h.enrollment_id
  or (qualification->>'revision')::bigint<>h.enrollment_revision
 then raise exception 'native_store_play_attempt_qualification_changed';end if;
 deadline:=least(transaction_timestamp()+interval '5 seconds',(buyer->>'valid_until')::timestamptz,
  (seller->>'valid_until')::timestamptz,(qualification->>'enrollmentExpiresAt')::timestamptz,
  sandbox_commerce_v1.resource_owner_delivery_deadline((r.quote->>'creatorId')::uuid,a.buyer_id));
 perform sandbox_commerce_v1.assert_fresh(buyer);perform sandbox_commerce_v1.assert_fresh(seller);
 if deadline<transaction_timestamp()+interval '5 seconds' then raise exception 'native_store_play_attempt_expiring';end if;
 if clock_timestamp()>=deadline then raise exception 'native_store_play_attempt_expired';end if;
end $$;
create function sandbox_commerce_v1.native_store_play_attempt_commit_check() returns trigger
language plpgsql security definer set search_path='' as $$begin
 perform sandbox_commerce_v1.native_store_play_assert_attempt(new.attempt_id);return null;
end $$;
create constraint trigger play_handoff_fresh_before_commit after insert on sandbox_commerce_v1.native_store_play_handoff_attempts
 deferrable initially deferred for each row execute function sandbox_commerce_v1.native_store_play_attempt_commit_check();

create function sandbox_commerce_v1.native_store_play_dispatch_command(p_user uuid,p_session uuid,p_command text,p_request uuid,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r sandbox_commerce_v1.native_store_reservations;s sandbox_commerce_v1.native_store_selections;
 a sandbox_commerce_v1.native_store_dispatch_attempts;h sandbox_commerce_v1.native_store_play_handoff_attempts;
 auth jsonb;resolution jsonb;fresh jsonb;evidence jsonb;qualification jsonb;
 newly boolean:=false;allowed boolean:=false;status text:='held';reason text:='play_enrollment_unavailable';rid uuid;sid uuid;
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
 rid:=case when p_command='dispatch-qualification' then null else substring(p_payload->>'reservationId' from 19)::uuid end;
 sid:=substring(p_payload->>'selectionId' from 17)::uuid;
 auth:=sandbox_commerce_v1.assert_authority(p_user,p_session,'delivery');
 select * into s from sandbox_commerce_v1.native_store_selections where id=sid and buyer_id=p_user;
 if p_command='dispatch-qualification' then
  if s.id is null then reason:='selection_unavailable';
  elsif exists(select 1 from sandbox_commerce_v1.native_store_reservation_terminals where selection_id=s.id) then reason:='selection_terminal';
  else
   fresh:=sandbox_commerce_v1.native_store_quote_command_armed(p_user,p_session,'offer',p_request,jsonb_build_object('offerId',s.quote->>'offerId','store','PLAY_STORE'));
   if fresh->>'status'<>'ok' or fresh#>'{data,quote}' is distinct from s.quote then reason:='quote_unavailable';
   else
    resolution:=sandbox_commerce_v1.native_store_resolve_play_handoff(p_user,p_session,s.quote);
    qualification:=nullif(resolution->'qualification','null'::jsonb);reason:=resolution->>'reason';
    if qualification is not null then status:='ok';end if;
   end if;
  end if;
  perform sandbox_commerce_v1.assert_fresh(auth);perform sandbox_commerce_v1.assert_generation(false);
  return jsonb_build_object('protocol','native-store-sandbox-command-v1','command',p_command,'requestId',p_request,
   'actor',jsonb_build_object('userId',p_user,'accountId',p_user,'sessionGeneration',p_session),'status',status,
   'data',jsonb_build_object('qualification',qualification,'reason',reason),'dispatchAllowed',false,'correlation','unsupported');
 end if;
 select * into r from sandbox_commerce_v1.native_store_reservations where id=rid and selection_id=sid and buyer_id=p_user and store='PLAY_STORE';
 if r.id is null then status:=case when p_command='dispatch-recover' then 'unknown' else 'held' end;reason:='reservation_unavailable';
 elsif exists(select 1 from sandbox_commerce_v1.native_store_reservation_terminals where selection_id=sid) then reason:='selection_terminal';
 else
  if r.quote is distinct from s.quote then raise exception 'native_store_dispatch_quote_mismatch';end if;
  perform sandbox_commerce_v1.native_store_lock_project(r.project_id);
  select * into a from sandbox_commerce_v1.native_store_dispatch_attempts where reservation_id=r.id and buyer_id=p_user;
  if a.id is not null then
   if p_command='dispatch-consume' and a.request_id<>p_request then raise exception 'native_store_attempt_conflict';end if;
   if a.request_id<>p_request then reason:='attempt_request_mismatch';
   else
    evidence:=sandbox_commerce_v1.native_store_consume_attempt_armed(p_user,p_session,r.id,p_request,true);
    select * into h from sandbox_commerce_v1.native_store_play_handoff_attempts where attempt_id=a.id;
    qualification:=sandbox_commerce_v1.native_store_play_qualification_json(h.enrollment_id,h.enrollment_revision,r.quote,a.session_id);
    if qualification is null then evidence:=null;reason:='attempt_already_consumed';
    else status:='ok';reason:=null;end if;
   end if;
  elsif p_command='dispatch-recover' then status:='unknown';reason:='attempt_unknown';
  else
   resolution:=sandbox_commerce_v1.native_store_resolve_play_handoff(p_user,p_session,r.quote);
   qualification:=nullif(resolution->'qualification','null'::jsonb);reason:=resolution->>'reason';
   if qualification is not null then
    evidence:=sandbox_commerce_v1.native_store_consume_attempt_armed(p_user,p_session,r.id,p_request,false);
    newly:=(evidence->>'newlyConsumed')::boolean;
    if newly then
     insert into sandbox_commerce_v1.native_store_play_handoff_attempts(attempt_id,enrollment_id,enrollment_revision)
      values(substring(evidence#>>'{attempt,id}' from 15)::uuid,substring(qualification->>'id' from 26)::uuid,(qualification->>'revision')::bigint);
     perform sandbox_commerce_v1.native_store_play_assert_attempt(substring(evidence#>>'{attempt,id}' from 15)::uuid);
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

-- Route by the buyer-owned, server-stored selection. No client store/build flag.
-- The installed APP_STORE implementation is neither renamed nor replaced.
create function sandbox_commerce_v1.native_store_dispatch_with_play_handoff(p_user uuid,p_session uuid,p_command text,p_request uuid,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare previous_lock_timeout text:=current_setting('lock_timeout');remaining_ms integer;lock_ms integer;is_play boolean:=false;
begin
 perform sandbox_commerce_v1.assert_provider_service();
 -- Routing precedes the one and only downstream transaction-timeout arm.
 -- Bound every pre-routing lock by that same absolute deadline, retaining any
 -- stricter caller lock timeout. Never arm/reset the legacy Apple alarm twice.
 if current_setting('transaction_timeout') is distinct from '0'
  or current_setting('transaction_isolation') is distinct from 'read committed'
 then raise exception 'sandbox_timeout_context_invalid' using errcode='42501';end if;
 remaining_ms:=floor(extract(epoch from(transaction_timestamp()+interval '5 seconds'-clock_timestamp()))*1000);
 if remaining_ms<1 or remaining_ms>5000 then raise exception 'sandbox_transaction_context_invalid' using errcode='42501';end if;
 lock_ms:=case when previous_lock_timeout::interval>interval '0' then least(remaining_ms,
  floor(extract(epoch from previous_lock_timeout::interval)*1000)::integer) else remaining_ms end;
 perform set_config('lock_timeout',lock_ms::text,true);
 perform sandbox_commerce_v1.assert_generation(false);
 if jsonb_typeof(p_payload)='object' and jsonb_typeof(p_payload->'selectionId')='string'
  and p_payload->>'selectionId' ~ '^nssv1_selection_[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
 then
  remaining_ms:=floor(extract(epoch from(transaction_timestamp()+interval '5 seconds'-clock_timestamp()))*1000);
  if remaining_ms<1 or remaining_ms>5000 then raise exception 'sandbox_transaction_context_invalid' using errcode='42501';end if;
  lock_ms:=case when previous_lock_timeout::interval>interval '0' then least(remaining_ms,
   floor(extract(epoch from previous_lock_timeout::interval)*1000)::integer) else remaining_ms end;
  perform set_config('lock_timeout',lock_ms::text,true);
  lock table sandbox_commerce_v1.native_store_selections in access share mode nowait;
  select exists(select 1 from sandbox_commerce_v1.native_store_selections where id=substring(p_payload->>'selectionId' from 17)::uuid
   and buyer_id=p_user and quote#>>'{catalog,store}'='PLAY_STORE') into is_play;
 end if;
 perform set_config('lock_timeout',previous_lock_timeout,true);
 if is_play then return sandbox_commerce_v1.native_store_play_dispatch_command(p_user,p_session,p_command,p_request,p_payload);end if;
 return sandbox_commerce_v1.native_store_dispatch_command(p_user,p_session,p_command,p_request,p_payload);
end $$;

create function sandbox_commerce_v1.native_store_play_install_check() returns trigger
language plpgsql security definer set search_path='' as $$begin
 if (select enabled from sandbox_commerce_v1.native_store_play_handoff_control where singleton) is distinct from false
  or has_schema_privilege('sbx_v1_core_owner','public','CREATE')
  or exists(select 1 from sandbox_commerce_v1.native_store_play_handoff_setups)
  or exists(select 1 from sandbox_commerce_v1.native_store_play_enrollments)
  or exists(select 1 from sandbox_commerce_v1.native_store_play_handoff_attempts)
  or exists(select 1 from pg_auth_members m join pg_roles r on r.oid=m.roleid join pg_roles member_role on member_role.oid=m.member
   where member_role.rolname='postgres' and r.rolname='sbx_v1_core_owner' and (m.set_option or m.inherit_option))
 then raise exception 'native_store_play_install_finalization_required';end if;
 return null;
end $$;
create constraint trigger play_handoff_default_off_before_commit after insert on sandbox_commerce_v1.native_store_play_handoff_control
 deferrable initially deferred for each row execute function sandbox_commerce_v1.native_store_play_install_check();
insert into sandbox_commerce_v1.native_store_play_handoff_control values(true,false);

revoke all on function sandbox_commerce_v1.native_store_play_qualification_json(uuid,bigint,jsonb,uuid),
 sandbox_commerce_v1.native_store_resolve_play_handoff(uuid,uuid,jsonb),sandbox_commerce_v1.native_store_play_assert_attempt(uuid),
 sandbox_commerce_v1.native_store_play_attempt_commit_check(),sandbox_commerce_v1.native_store_play_dispatch_command(uuid,uuid,text,uuid,jsonb),
 sandbox_commerce_v1.native_store_dispatch_with_play_handoff(uuid,uuid,text,uuid,jsonb),sandbox_commerce_v1.native_store_play_install_check()
 from public,anon,authenticated,service_role;
create or replace function public.native_store_sandbox_dispatch_v1(p_user_id uuid,p_session_id uuid,p_command text,p_request_id uuid,p_payload jsonb)
returns jsonb language sql security definer set search_path='' as $$
 select sandbox_commerce_v1.native_store_dispatch_with_play_handoff(p_user_id,p_session_id,p_command,p_request_id,p_payload)
$$;
revoke all on function public.native_store_sandbox_dispatch_v1(uuid,uuid,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.native_store_sandbox_dispatch_v1(uuid,uuid,text,uuid,jsonb) to service_role;
reset role;
revoke create on schema public from sbx_v1_core_owner;
grant sbx_v1_core_owner to postgres with inherit false,set false;
