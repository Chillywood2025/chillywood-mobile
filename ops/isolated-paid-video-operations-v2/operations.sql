-- Inactive, fresh-install source only. After combined gateway/media, inside
-- paid-video-install-grant-v2.sql / revoke-v2.sql, before finalizer. No seeds.
set local role sbx_v1_core_owner;
create table sandbox_commerce_v1.paid_video_operations_config (
 singleton boolean primary key default true check(singleton),
 binding jsonb not null check(jsonb_typeof(binding)='object'), enabled boolean not null default false
);
create table sandbox_commerce_v1.paid_video_operations_requests (
 request_id uuid primary key, raw text not null, result jsonb not null,
 created_at timestamptz not null default clock_timestamp()
);
create table sandbox_commerce_v1.paid_video_reviewers (
 user_id uuid primary key, authorization_sha256 text not null check(authorization_sha256 ~ '^[a-f0-9]{64}$'),
 active boolean not null default false
);
create table sandbox_commerce_v1.paid_video_reviews (
 request_id uuid primary key, user_id uuid not null, session_id uuid not null,
 raw text not null, snapshot jsonb not null, decision text not null check(decision in ('clear','held','removed')),
 evidence_sha256 text not null, authorization_sha256 text not null, recorded_at timestamptz not null default clock_timestamp()
);
do $$ declare t text; begin
 foreach t in array array['paid_video_operations_config','paid_video_operations_requests','paid_video_reviewers','paid_video_reviews'] loop
  execute format('alter table sandbox_commerce_v1.%I enable row level security',t);
  execute format('alter table sandbox_commerce_v1.%I force row level security',t);
  execute format('create policy core_owner on sandbox_commerce_v1.%I for all to sbx_v1_core_owner using(true) with check(true)',t);
  execute format('revoke all on sandbox_commerce_v1.%I from public,anon,authenticated,service_role,sbx_v1_operator',t);
 end loop;
end $$;
create trigger immutable before update or delete on sandbox_commerce_v1.paid_video_operations_config
 for each row execute function sandbox_commerce_v1.protect_resource_identity('enabled');
create trigger immutable before update or delete on sandbox_commerce_v1.paid_video_operations_requests
 for each row execute function sandbox_commerce_v1.protect_resource_identity();
create trigger immutable before update or delete on sandbox_commerce_v1.paid_video_reviewers
 for each row execute function sandbox_commerce_v1.protect_resource_identity('active');
create trigger immutable before update or delete on sandbox_commerce_v1.paid_video_reviews
 for each row execute function sandbox_commerce_v1.protect_resource_identity();

create function sandbox_commerce_v1.paid_video_operations_binding(p_binding jsonb,p_positive boolean)
returns void language plpgsql volatile security invoker set search_path='' as $$
declare cfg sandbox_commerce_v1.paid_video_operations_config;
 ctl sandbox_commerce_v1.paid_video_gateway_controls; worker sandbox_commerce_v1.paid_video_workers;
 verifier sandbox_commerce_v1.paid_video_verifiers; required text[]:=array['protocol','projectRef','endpoint','installationId',
 'sourceSha256','workerId','workerSha256','verifierId','verifierEvidenceSha256','configurationDigest','routeId','qualificationSha256'];
begin
 perform sandbox_commerce_v1.assert_generation(p_positive);
 select * into strict cfg from sandbox_commerce_v1.paid_video_operations_config where singleton for share nowait;
 if p_binding is null or not(p_binding ?& required) or p_binding-required<>'{}'::jsonb or p_binding<>cfg.binding
  or p_binding->>'protocol' is distinct from 'scpv-operations-binding-v1'
  or p_binding->>'projectRef' !~ '^[a-z0-9]{20}$'
  or p_binding->>'endpoint' is distinct from 'https://'||(p_binding->>'projectRef')||'.supabase.co'
  or exists(select 1 from unnest(array['sourceSha256','workerSha256','verifierEvidenceSha256','configurationDigest','qualificationSha256']) k
    where (p_binding->>k) is null or (p_binding->>k) !~ '^[a-f0-9]{64}$')
  or (p_binding->>'installationId')::uuid is null then raise exception 'paid_video_operations_binding_invalid'; end if;
 if not p_positive then return; end if;
 if not cfg.enabled or not sandbox_commerce_v1.paid_video_gateway_ready(p_binding->>'configurationDigest',(p_binding->>'routeId')::uuid)
 then raise exception 'paid_video_operations_unavailable'; end if;
 select * into strict ctl from sandbox_commerce_v1.paid_video_gateway_controls where singleton for share nowait;
 if row(ctl.worker_id,ctl.verifier_id,ctl.route_id,ctl.qualification_sha256)
  is distinct from row((p_binding->>'workerId')::uuid,(p_binding->>'verifierId')::uuid,(p_binding->>'routeId')::uuid,p_binding->>'qualificationSha256')
 then raise exception 'paid_video_operations_binding_invalid'; end if;
 lock table sandbox_commerce_v1.paid_video_workers in share mode nowait;
 select * into strict worker from sandbox_commerce_v1.paid_video_workers where id=ctl.worker_id and active for share nowait;
 select * into strict verifier from sandbox_commerce_v1.paid_video_verifiers where id=ctl.verifier_id and active for share nowait;
 if worker.qualified_binary_sha256 is distinct from p_binding->>'workerSha256'
  or verifier.evidence_sha256 is distinct from p_binding->>'verifierEvidenceSha256'
  or exists(select 1 from sandbox_commerce_v1.paid_video_workers where hmac_key=verifier.hmac_key)
 then raise exception 'paid_video_operations_binding_invalid'; end if;
end $$;

-- Existing immutable verifier receipt is reauthenticated, including original
-- transfer/session/configuration. This is pre-scan admission, never clean proof.
create function sandbox_commerce_v1.paid_video_operations_object(p_upload uuid,p_binding jsonb)
returns text language plpgsql volatile security invoker set search_path='' as $$
declare u sandbox_commerce_v1.paid_video_uploads; r sandbox_commerce_v1.paid_video_object_receipts;
 v sandbox_commerce_v1.paid_video_verifiers; t sandbox_commerce_v1.paid_video_transfers;
 c sandbox_commerce_v1.paid_video_gateway_transfers; o jsonb;
begin
 select * into strict u from sandbox_commerce_v1.paid_video_uploads where id=p_upload for update nowait;
 select * into strict r from sandbox_commerce_v1.paid_video_object_receipts where upload_id=u.id for share nowait;
 select * into strict v from sandbox_commerce_v1.paid_video_verifiers where id=r.verifier_id and active for share nowait;
 select * into strict t from sandbox_commerce_v1.paid_video_transfers where id=r.transfer_id for share nowait;
 select * into strict c from sandbox_commerce_v1.paid_video_gateway_transfers where transfer_id=t.id for share nowait;
 o:=r.observation_raw::jsonb;
 if row(u.route_id,r.verifier_id,r.object_version) is distinct from row((p_binding->>'routeId')::uuid,(p_binding->>'verifierId')::uuid,u.object_version)
  or not sandbox_commerce_v1.paid_video_signature_matches(sandbox_commerce_v1.paid_video_hmac(v.hmac_key,r.observation_raw),r.signature)
  or row(t.upload_id,t.user_id) is distinct from row(u.id,u.creator_id)
  or row(o->>'protocol',o->>'uploadId',o->>'userId',o->>'requestId',o->>'transferId',o->>'originalSessionId',o->>'originalConfigurationDigest',
    o->>'verifierId',o->>'incarnation',o->>'sha256',o->>'objectVersion')
   is distinct from row('scpv-object-observation-v2','scpv_upload_'||u.id,u.creator_id::text,t.request_id::text,t.id::text,t.session_id::text,c.configuration_digest,
    v.id::text,u.incarnation::text,u.expected_sha256,u.object_version)
  or o->'byteLength' is distinct from to_jsonb(u.expected_byte_length)
 then raise exception 'paid_video_operations_object_invalid'; end if;
 return r.object_version;
end $$;

create function sandbox_commerce_v1.paid_video_operations(p_action text,p_raw text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare body jsonb; req uuid; old sandbox_commerce_v1.paid_video_operations_requests;
 lease sandbox_commerce_v1.paid_video_operations_requests; ticket jsonb; result jsonb; uid uuid; version text; authority jsonb;
begin
 perform sandbox_commerce_v1.assert_provider_service(); perform sandbox_commerce_v1.arm_transaction_timeout();
 if p_action is null or p_action not in ('execute','recover','check') or p_raw is null or octet_length(p_raw)>24576 then raise exception 'paid_video_operations_request_invalid'; end if;
 body:=p_raw::jsonb; req:=(body->>'requestId')::uuid;
 if req is null or body->>'protocol' is distinct from 'scpv-operations-request-v1'
  or body->>'command' is null or body->>'command' not in ('lease','lease-next','result')
  or not(body ?& array['protocol','requestId','command','binding'])
  or body-(array['protocol','requestId','command','binding']||case body->>'command' when 'lease' then array['uploadId'] when 'result' then array['leaseRequestId','raw','signature'] else array[]::text[] end)<>'{}'::jsonb
 then raise exception 'paid_video_operations_request_invalid'; end if;
 perform sandbox_commerce_v1.paid_video_operations_binding(body->'binding',false);
 if not pg_try_advisory_xact_lock(hashtextextended('paid-video-operations:'||req,687)) then raise exception 'paid_video_operations_busy'; end if;
 select * into old from sandbox_commerce_v1.paid_video_operations_requests where request_id=req;
 if found then
  if old.raw<>p_raw then raise exception 'paid_video_operations_request_conflict'; end if;
  if p_action='check' then
   if old.result->>'state' is distinct from 'leased' then raise exception 'paid_video_operations_lease_invalid'; end if;
   perform sandbox_commerce_v1.paid_video_operations_binding(body->'binding',true);
   uid:=sandbox_commerce_v1.paid_video_id(old.result#>>'{ticket,uploadId}');
   version:=sandbox_commerce_v1.paid_video_operations_object(uid,body->'binding');
   if version is distinct from old.result#>>'{ticket,objectVersion}' or not exists(
    select 1 from sandbox_commerce_v1.paid_video_uploads u join sandbox_commerce_v1.paid_video_tickets t on t.upload_id=u.id
    where u.id=uid and u.state='scan_pending' and u.expires_at>clock_timestamp()
     and t.id=(old.result#>>'{ticket,ticketId}')::uuid and t.expires_at>clock_timestamp() and t.positive_consumed_at is null)
   then raise exception 'paid_video_operations_lease_invalid'; end if;
   authority:=sandbox_commerce_v1.assert_authority((select creator_id from sandbox_commerce_v1.paid_video_uploads where id=uid),null,'creator_subject');
   perform sandbox_commerce_v1.assert_fresh(authority);
  end if;
  return jsonb_build_object('protocol','scpv-operations-response-v1','state','acknowledged','requestId',req,'requestSha256',encode(sha256(convert_to(p_raw,'UTF8')),'hex'),'result',old.result);
 end if;
 if p_action in ('recover','check') then return jsonb_build_object('protocol','scpv-operations-response-v1','state','unknown','requestId',req,'requestSha256',encode(sha256(convert_to(p_raw,'UTF8')),'hex')); end if;
 if body->>'command' in ('lease','lease-next') then
  perform sandbox_commerce_v1.paid_video_operations_binding(body->'binding',true);
  if body->>'command'='lease' then uid:=sandbox_commerce_v1.paid_video_id(body->>'uploadId');
  else
   select u.id into uid from sandbox_commerce_v1.paid_video_uploads u
    where u.route_id=(body#>>'{binding,routeId}')::uuid and u.state='scan_pending' and u.expires_at>clock_timestamp()
     and exists(select 1 from sandbox_commerce_v1.paid_video_object_receipts r where r.upload_id=u.id)
     and not exists(select 1 from sandbox_commerce_v1.paid_video_tickets t where t.upload_id=u.id and t.expires_at>clock_timestamp())
    order by u.created_at,u.id limit 1 for update of u skip locked;
  end if;
  if uid is null then result:=jsonb_build_object('state','empty');
  else
   version:=sandbox_commerce_v1.paid_video_operations_object(uid,body->'binding');
   ticket:=sandbox_commerce_v1.paid_video_lease(uid,(body#>>'{binding,workerId}')::uuid);
   result:=jsonb_build_object('state','leased','binding',body->'binding','ticket',ticket||jsonb_build_object('objectVersion',version));
  end if;
 else
  select * into strict lease from sandbox_commerce_v1.paid_video_operations_requests where request_id=(body->>'leaseRequestId')::uuid;
  ticket:=lease.result->'ticket';
  if lease.result->>'state' is distinct from 'leased' or lease.result->'binding' is distinct from body->'binding'
   or row((body->>'raw')::jsonb->>'ticketId',(body->>'raw')::jsonb->>'uploadId',(body->>'raw')::jsonb->>'objectVersion')
    is distinct from row(ticket->>'ticketId',ticket->>'uploadId',ticket->>'objectVersion')
  then raise exception 'paid_video_operations_lease_invalid'; end if;
  if (body->>'raw')::jsonb#>>'{result,verdict}'='clean' then
   perform sandbox_commerce_v1.paid_video_operations_binding(body->'binding',true);
   perform sandbox_commerce_v1.paid_video_operations_object(sandbox_commerce_v1.paid_video_id(ticket->>'uploadId'),body->'binding');
  end if;
  result:=sandbox_commerce_v1.paid_video_scan_ingest(body->>'raw',body->>'signature');
 end if;
 insert into sandbox_commerce_v1.paid_video_operations_requests values(req,p_raw,result,clock_timestamp());
 return jsonb_build_object('protocol','scpv-operations-response-v1','state','acknowledged','requestId',req,'requestSha256',encode(sha256(convert_to(p_raw,'UTF8')),'hex'),'result',result);
end $$;

create function sandbox_commerce_v1.paid_video_review_snapshot(p_upload uuid)
returns jsonb language sql volatile security invoker set search_path='' as $$
 select jsonb_build_object('uploadId','scpv_upload_'||u.id,'creatorId',u.creator_id,'incarnation',u.incarnation,
  'sha256',u.expected_sha256,'byteLength',u.expected_byte_length,'objectVersion',u.object_version,
  'cleanResultSha256',u.clean_result_sha256,'state',u.state,'moderation',u.moderation,
  'object',jsonb_build_object('provider',r.provider,'bucket',r.bucket,'routeId',r.id,'objectKey',u.object_key,
   'incarnation',u.incarnation,'expectedSha256',u.expected_sha256,'expectedByteLength',u.expected_byte_length,'objectVersion',u.object_version),
  'lastReview', (select m.id::text from sandbox_commerce_v1.paid_video_moderation m where m.upload_id=u.id order by recorded_at desc,id desc limit 1))
 from sandbox_commerce_v1.paid_video_uploads u join sandbox_commerce_v1.paid_video_routes r on r.id=u.route_id where u.id=p_upload;
$$;
create function sandbox_commerce_v1.paid_video_review(p_action text,p_raw text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare body jsonb; claims jsonb:=nullif(current_setting('request.jwt.claims',true),'')::jsonb;
 uid uuid; sid uuid; upload uuid; authority jsonb; reviewer sandbox_commerce_v1.paid_video_reviewers;
 prior sandbox_commerce_v1.paid_video_reviews; snapshot jsonb; req uuid;
begin
 if p_action is null or p_action not in ('inspect','decide','recover') or p_raw is null or octet_length(p_raw)>16384
  or claims->>'role' is distinct from 'authenticated' then raise exception 'paid_video_review_context_invalid'; end if;
 perform sandbox_commerce_v1.arm_transaction_timeout();
 perform sandbox_commerce_v1.assert_generation(false);
 body:=p_raw::jsonb; uid:=(claims->>'sub')::uuid; sid:=(claims->>'session_id')::uuid; req:=(body->>'requestId')::uuid;
 if uid is null or sid is null or req is null or body->>'protocol' is distinct from 'scpv-review-request-v1'
  or row(body->>'reviewerId',body->>'sessionId') is distinct from row(uid::text,sid::text)
  or body-(case when p_action='inspect' then array['protocol','requestId','reviewerId','sessionId','uploadId']
    else array['protocol','requestId','reviewerId','sessionId','uploadId','snapshot','decision','evidenceSha256','reviewedAt','humanReviewConfirmed'] end)<>'{}'::jsonb
 then raise exception 'paid_video_review_context_invalid'; end if;
 authority:=sandbox_commerce_v1.assert_authority(uid,sid,'delivery');
 select * into strict reviewer from sandbox_commerce_v1.paid_video_reviewers where user_id=uid and active for share nowait;
 upload:=sandbox_commerce_v1.paid_video_id(body->>'uploadId');
 perform 1 from sandbox_commerce_v1.paid_video_uploads where id=upload and creator_id<>uid for update nowait;
 if not found then raise exception 'paid_video_independent_reviewer_required'; end if;
 snapshot:=sandbox_commerce_v1.paid_video_review_snapshot(upload);
 if p_action='inspect' then
  perform sandbox_commerce_v1.assert_fresh(authority); return snapshot;
 end if;
 if not pg_try_advisory_xact_lock(hashtextextended('paid-video-review:'||req,687)) then raise exception 'paid_video_review_busy'; end if;
 select * into prior from sandbox_commerce_v1.paid_video_reviews where request_id=req;
 if found then
  if prior.raw<>p_raw or prior.user_id<>uid then raise exception 'paid_video_review_request_conflict'; end if;
  perform sandbox_commerce_v1.assert_fresh(authority);
  return jsonb_build_object('state','acknowledged','requestId',req,'decision',prior.decision,'snapshot',prior.snapshot);
 end if;
 if p_action='recover' then perform sandbox_commerce_v1.assert_fresh(authority); return jsonb_build_object('state','unknown','requestId',req); end if;
 if body->'snapshot' is distinct from snapshot or body->'humanReviewConfirmed' is distinct from 'true'::jsonb
  or body->>'evidenceSha256' is null or body->>'evidenceSha256' !~ '^[a-f0-9]{64}$'
  or (body->>'reviewedAt')::timestamptz is null or not isfinite((body->>'reviewedAt')::timestamptz)
  or (body->>'reviewedAt')::timestamptz not between clock_timestamp()-interval '10 minutes' and clock_timestamp()+interval '5 seconds'
 then raise exception 'paid_video_review_evidence_invalid'; end if;
 if body->>'decision'='clear' then
  perform sandbox_commerce_v1.paid_video_operations_binding((select binding from sandbox_commerce_v1.paid_video_operations_config where singleton),true);
  perform sandbox_commerce_v1.paid_video_operations_object(upload,(select binding from sandbox_commerce_v1.paid_video_operations_config where singleton));
 end if;
 -- Same monotonic moderation effect as the private operator API, in this
 -- already-armed transaction. Calling that API would try to rearm its timer.
 if body->>'decision' is null or body->>'decision' not in ('clear','held','removed')
  or (body->>'decision'='clear' and (snapshot->>'state'<>'clean' or snapshot->>'moderation'='removed'))
 then raise exception 'paid_video_moderation_invalid'; end if;
 insert into sandbox_commerce_v1.paid_video_moderation(upload_id,decision,evidence_sha256) values(upload,body->>'decision',body->>'evidenceSha256');
 update sandbox_commerce_v1.paid_video_uploads set moderation=body->>'decision' where id=upload;
 update sandbox_commerce_v1.delivery_assets set moderation=body->>'decision' where id=(select asset_id from sandbox_commerce_v1.paid_video_uploads where id=upload);
 insert into sandbox_commerce_v1.paid_video_reviews values(req,uid,sid,p_raw,snapshot,body->>'decision',body->>'evidenceSha256',reviewer.authorization_sha256,clock_timestamp());
 perform sandbox_commerce_v1.assert_fresh(authority);
 return jsonb_build_object('state','acknowledged','requestId',req,'decision',body->>'decision','snapshot',snapshot);
end $$;
revoke all on function sandbox_commerce_v1.paid_video_operations_binding(jsonb,boolean),sandbox_commerce_v1.paid_video_operations_object(uuid,jsonb),
 sandbox_commerce_v1.paid_video_operations(text,text),sandbox_commerce_v1.paid_video_review_snapshot(uuid),sandbox_commerce_v1.paid_video_review(text,text)
 from public,anon,authenticated,service_role,sbx_v1_operator;
reset role;
create function public.isolated_paid_video_operations_v1(p_action text,p_raw text) returns jsonb
 language sql volatile security definer set search_path='' as $$select sandbox_commerce_v1.paid_video_operations(p_action,p_raw)$$;
alter function public.isolated_paid_video_operations_v1(text,text) owner to sbx_v1_core_owner;
revoke all on function public.isolated_paid_video_operations_v1(text,text) from public,anon,authenticated,service_role;
grant execute on function public.isolated_paid_video_operations_v1(text,text) to service_role;
create function public.isolated_paid_video_review_v1(p_action text,p_raw text) returns jsonb
 language sql volatile security definer set search_path='' as $$select sandbox_commerce_v1.paid_video_review(p_action,p_raw)$$;
alter function public.isolated_paid_video_review_v1(text,text) owner to sbx_v1_core_owner;
revoke all on function public.isolated_paid_video_review_v1(text,text) from public,anon,authenticated,service_role;
grant execute on function public.isolated_paid_video_review_v1(text,text) to authenticated;
-- Close alternate public worker entry; scanner must consume current operations
-- binding. Direct moderation remains an explicitly provisioned operator action.
revoke all on function public.isolated_paid_video_worker_v1(text,uuid,uuid,text,text) from service_role;
