-- Forward source only, after the installed combined paid-video gateway and
-- native quote modules. No route, credentials, qualification or product seeded.
-- A separately reviewed installation must bind exact predecessor definitions.
set local role sbx_v1_core_owner;
create table sandbox_commerce_v1.paid_video_native_authoring_profiles (
 configuration_digest text primary key check(configuration_digest='8e5c534276f2e9cc279cd5dbd629964c49124b6551d7829c3a29dbb6635f0dc0'),
 route_id uuid not null references sandbox_commerce_v1.paid_video_routes,
 worker_id uuid not null references sandbox_commerce_v1.paid_video_workers,
 verifier_id uuid not null references sandbox_commerce_v1.paid_video_verifiers,
 qualification_sha256 text not null check(qualification_sha256 ~ '^[a-f0-9]{64}$'),
 enabled boolean not null default false
);
-- One core price anchor, with independently reviewed store-specific templates.
-- No caller can select a product, project, app, bucket, URL or qualification.
create table sandbox_commerce_v1.paid_video_native_catalog_templates (
 id uuid not null, revision bigint not null check(revision between 1 and 9007199254740991),
 catalog_id uuid not null references sandbox_commerce_v1.catalog,
 store text not null check(store in ('APP_STORE','PLAY_STORE')),
 project_id text not null, app_id text not null, wire_product_id text not null,
 qualification_sha256 text not null check(qualification_sha256 ~ '^[a-f0-9]{64}$'),
 enabled boolean not null default false, primary key(id,revision),
 check(octet_length(project_id) between 1 and 512 and project_id=btrim(project_id,E' \t\n\r\f'||chr(11)||U&'\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF') and project_id !~ '[[:cntrl:]]'),
 check(octet_length(app_id) between 1 and 512 and app_id=btrim(app_id,E' \t\n\r\f'||chr(11)||U&'\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF') and app_id !~ '[[:cntrl:]]'),
 check(octet_length(wire_product_id) between 1 and 512 and wire_product_id=btrim(wire_product_id,E' \t\n\r\f'||chr(11)||U&'\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF') and wire_product_id !~ '[[:cntrl:]]')
);
create table sandbox_commerce_v1.paid_video_native_template_retirements (
 template_id uuid not null,template_revision bigint not null,reason text not null check(length(reason)>0),
 primary key(template_id,template_revision),
 foreign key(template_id,template_revision) references sandbox_commerce_v1.paid_video_native_catalog_templates(id,revision)
);
create table sandbox_commerce_v1.paid_video_native_publications (
 binding_id uuid not null,binding_revision bigint not null,template_id uuid not null,template_revision bigint not null,
 primary key(binding_id,binding_revision),
 foreign key(binding_id,binding_revision) references sandbox_commerce_v1.native_store_catalog_bindings(id,revision),
 foreign key(template_id,template_revision) references sandbox_commerce_v1.paid_video_native_catalog_templates(id,revision)
);
do $$ declare t text; begin
 foreach t in array array['paid_video_native_authoring_profiles','paid_video_native_catalog_templates','paid_video_native_template_retirements','paid_video_native_publications'] loop
  execute format('alter table sandbox_commerce_v1.%I enable row level security',t);
  execute format('alter table sandbox_commerce_v1.%I force row level security',t);
  execute format('create policy core_owner on sandbox_commerce_v1.%I for all to sbx_v1_core_owner using(true) with check(true)',t);
  execute format('revoke all on sandbox_commerce_v1.%I from public,anon,authenticated,service_role,sbx_v1_operator',t);
  execute format('create trigger immutable_truncate before truncate on sandbox_commerce_v1.%I for each statement execute function sandbox_commerce_v1.native_store_quote_immutable()',t);
 end loop;
end $$;
create trigger immutable before update or delete on sandbox_commerce_v1.paid_video_native_authoring_profiles
 for each row execute function sandbox_commerce_v1.protect_resource_identity('enabled');
create trigger immutable before update or delete on sandbox_commerce_v1.paid_video_native_catalog_templates
 for each row execute function sandbox_commerce_v1.protect_resource_identity('enabled');
create trigger immutable before update or delete on sandbox_commerce_v1.paid_video_native_template_retirements
 for each row execute function sandbox_commerce_v1.native_store_quote_immutable();
create trigger immutable before update or delete on sandbox_commerce_v1.paid_video_native_publications
 for each row execute function sandbox_commerce_v1.native_store_quote_immutable();

create function sandbox_commerce_v1.paid_video_assert_authoring_mode(p_upload uuid,p_configuration text)
returns void language plpgsql volatile security invoker set search_path='' as $$
declare original text; native constant text:='8e5c534276f2e9cc279cd5dbd629964c49124b6551d7829c3a29dbb6635f0dc0';
begin
 select g.configuration_digest into original from sandbox_commerce_v1.paid_video_requests r
 join sandbox_commerce_v1.paid_video_gateway_requests g on g.user_id=r.user_id and g.request_id=r.request_id
 where r.upload_id=p_upload and r.command='upload.reserve';
 if (p_configuration=native and original is distinct from native) or (original=native and p_configuration is distinct from native)
  or (p_configuration=native and exists(select 1 from sandbox_commerce_v1.test_store_v3_native_profiles where configuration_digest=native))
 then raise exception 'paid_video_authoring_mode_conflict'; end if;
end $$;
create function sandbox_commerce_v1.paid_video_native_transfer_mode() returns trigger
language plpgsql set search_path='' as $$ declare upload uuid; begin
 select upload_id into strict upload from sandbox_commerce_v1.paid_video_transfers where id=new.transfer_id;
 perform sandbox_commerce_v1.paid_video_assert_authoring_mode(upload,new.configuration_digest);
 return new;
end $$;
create trigger authoring_mode before insert on sandbox_commerce_v1.paid_video_gateway_transfers
 for each row execute function sandbox_commerce_v1.paid_video_native_transfer_mode();

create function sandbox_commerce_v1.paid_video_native_catalog(p_amount bigint,p_currency text)
returns sandbox_commerce_v1.catalog language plpgsql volatile security invoker set search_path='' as $$
declare c sandbox_commerce_v1.catalog;
begin
 lock table sandbox_commerce_v1.paid_video_native_catalog_templates,sandbox_commerce_v1.paid_video_native_template_retirements in share mode nowait;
 select * into c from sandbox_commerce_v1.catalog cat where cat.kind='paid_content' and cat.provider='revenuecat'
  and cat.store in ('APP_STORE','PLAY_STORE') and cat.amount_minor=p_amount and cat.currency='usd' and p_currency='usd'
  and not exists(select 1 from sandbox_commerce_v1.paid_video_catalog v where v.catalog_id=cat.id)
  and not exists(select 1 from sandbox_commerce_v1.test_store_v3_products v where v.catalog_id=cat.id) for share nowait;
 if c.id is null then return null; end if;
 if not exists(select 1 from sandbox_commerce_v1.paid_video_native_catalog_templates t where t.catalog_id=c.id and t.enabled
   and not exists(select 1 from sandbox_commerce_v1.paid_video_native_template_retirements r where r.template_id=t.id and r.template_revision=t.revision))
  or exists(select 1 from sandbox_commerce_v1.paid_video_native_catalog_templates t where t.catalog_id=c.id and t.enabled
   and not exists(select 1 from sandbox_commerce_v1.paid_video_native_template_retirements r where r.template_id=t.id and r.template_revision=t.revision)
   group by t.store having count(*)<>1)
 then return null; end if;
 return c;
end $$;
create function sandbox_commerce_v1.paid_video_native_bind_offer(o sandbox_commerce_v1.offers)
returns void language plpgsql volatile security invoker set search_path='' as $$
declare t sandbox_commerce_v1.paid_video_native_catalog_templates; r sandbox_commerce_v1.resources;
 c sandbox_commerce_v1.catalog; asset jsonb; binding uuid;
begin
 select * into strict r from sandbox_commerce_v1.resources where id=o.resource_id;
 select * into strict c from sandbox_commerce_v1.catalog where id=o.catalog_id;
 if (sandbox_commerce_v1.paid_video_native_catalog(c.amount_minor,c.currency)).id is distinct from c.id
 then raise exception 'paid_video_native_catalog_unavailable'; end if;
 asset:=sandbox_commerce_v1.paid_video_offer_json(o)->'asset';
 for t in select x.* from sandbox_commerce_v1.paid_video_native_catalog_templates x where x.catalog_id=c.id and x.enabled
  and not exists(select 1 from sandbox_commerce_v1.paid_video_native_template_retirements z where z.template_id=x.id and z.template_revision=x.revision)
  order by x.store loop
  binding:=gen_random_uuid();
  insert into sandbox_commerce_v1.native_store_catalog_bindings(id,revision,offer_id,offer_revision,store,catalog)
   values(binding,1,o.id,o.revision,t.store,jsonb_build_object('protocol','native-store-sandbox-catalog-v1',
    'bindingId','nssv1_catalog_'||binding,'revision',1,'projectId',t.project_id,'appId',t.app_id,'store',t.store,'environment','SANDBOX',
    'wireProductId',t.wire_product_id,'productType','one_time','basePlanId',null,'resourceId','scv1_resource_'||r.id,
    'resourceRevision',o.resource_revision,'creatorId',r.creator_id,'amountMinor',c.amount_minor,'currency','usd','quantity',1,'asset',asset));
  insert into sandbox_commerce_v1.paid_video_native_publications values(binding,1,t.id,t.revision);
 end loop;
end $$;
-- The native command retains the original ownership, request-journal, scan,
-- moderation and publication logic. Only catalog admission/binding differs.
create function sandbox_commerce_v1.paid_video_native_command(p_command text,p_payload jsonb,p_expected_account_id uuid,p_expected_session_generation uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare claims jsonb:=nullif(current_setting('request.jwt.claims',true),'')::jsonb; uid uuid; sid uuid; req uuid;
 allowed text[]; authority jsonb; creator_authority jsonb; prior sandbox_commerce_v1.paid_video_requests;
 u sandbox_commerce_v1.paid_video_uploads; r sandbox_commerce_v1.resources; route sandbox_commerce_v1.paid_video_routes;
 o sandbox_commerce_v1.offers; c sandbox_commerce_v1.catalog; result jsonb; body jsonb; state text:='ok';
 upload uuid; rid uuid; asset uuid; incarnation uuid; page jsonb; next_cursor text; cursor_row sandbox_commerce_v1.paid_video_uploads;
 mutation boolean; replay boolean:=false;
begin
 if claims->>'role' is distinct from 'authenticated' or claims->>'sub' is null or claims->>'session_id' is null
  or p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>8192
  or p_payload->>'protocol' is distinct from 'isolated-paid-video-v1' or p_expected_account_id is null or p_expected_session_generation is null
 then raise exception 'paid_video_request_invalid' using errcode='42501'; end if;
 uid:=(claims->>'sub')::uuid; sid:=(claims->>'session_id')::uuid; req:=(p_payload->>'requestId')::uuid;
 if uid is distinct from p_expected_account_id or sid is distinct from p_expected_session_generation or req is null
 then raise exception 'paid_video_actor_binding_invalid' using errcode='42501'; end if;
 allowed:=array['protocol','requestId']||case p_command
  when 'capability.read' then array[]::text[] when 'studio.read' then array['limit','cursor']
  when 'upload.reserve' then array['title','expectedSha256','expectedByteLength']
  when 'upload.read' then array['uploadId'] when 'upload.finalize' then array['uploadId']
  when 'upload.recover' then array['originalRequestId'] when 'resource.read' then array['resourceId']
  when 'offer.publish' then array['uploadId','expectedRevision','amountMinor','currency']
  when 'offer.retire' then array['offerId','expectedRevision'] when 'offer.read' then array['offerId'] else null end;
 if allowed is null or not(p_payload ?& allowed) or (p_payload-allowed)<>'{}'::jsonb
  or jsonb_typeof(p_payload->'requestId') is distinct from 'string'
  or (p_payload ? 'expectedRevision' and (jsonb_typeof(p_payload->'expectedRevision') is distinct from 'number' or p_payload->>'expectedRevision' !~ '^[1-9][0-9]{0,14}$'))
  or (p_payload ? 'amountMinor' and (jsonb_typeof(p_payload->'amountMinor') is distinct from 'number' or p_payload->>'amountMinor' !~ '^[1-9][0-9]{0,8}$'))
  or (p_payload ? 'currency' and (jsonb_typeof(p_payload->'currency') is distinct from 'string' or p_payload->>'currency' !~ '^[a-z]{3}$'))
 then raise exception 'paid_video_payload_invalid'; end if;
 perform sandbox_commerce_v1.assert_generation(false);
 authority:=sandbox_commerce_v1.assert_authority(uid,sid,'delivery');
 mutation:=p_command in ('upload.reserve','upload.finalize','offer.publish','offer.retire');
 if mutation then
  if not pg_try_advisory_xact_lock(hashtextextended('isolated-paid-video-v1:'||uid||':'||req,687)) then raise exception 'paid_video_request_busy' using errcode='55P03'; end if;
  select * into prior from sandbox_commerce_v1.paid_video_requests where user_id=uid and request_id=req;
  if found then
   if prior.command is distinct from p_command or prior.payload is distinct from p_payload or prior.session_id is distinct from sid
    then raise exception 'paid_video_idempotency_conflict'; end if;
   replay:=true; select * into strict u from sandbox_commerce_v1.paid_video_uploads where id=prior.upload_id and creator_id=uid;
  end if;
 end if;
 if replay then
  body:=jsonb_build_object('upload',sandbox_commerce_v1.paid_video_upload_json(u));
  if p_command in ('offer.publish','offer.retire') then
   select * into strict o from sandbox_commerce_v1.offers where resource_id=u.resource_id;
   body:=body||jsonb_build_object('offer',sandbox_commerce_v1.paid_video_offer_json(o));
  end if;
 elsif p_command='upload.recover' then
  if jsonb_typeof(p_payload->'originalRequestId') is distinct from 'string' then raise exception 'paid_video_payload_invalid'; end if;
  select * into prior from sandbox_commerce_v1.paid_video_requests where user_id=uid and request_id=(p_payload->>'originalRequestId')::uuid;
  if not found then state:='unknown'; body:=jsonb_build_object('recovery',jsonb_build_object('state','unknown','originalRequestId',p_payload->>'originalRequestId'));
  else
   select * into strict u from sandbox_commerce_v1.paid_video_uploads where id=prior.upload_id and creator_id=uid;
   body:=jsonb_build_object('recovery',jsonb_build_object('state','recorded','originalRequestId',prior.request_id,
    'originalCommand',prior.command,'originalSessionGeneration',prior.session_id,'originalPayload',prior.payload),
    'upload',sandbox_commerce_v1.paid_video_upload_json(u));
   if prior.command in ('offer.publish','offer.retire') then
    select * into strict o from sandbox_commerce_v1.offers where resource_id=u.resource_id;
    body:=body||jsonb_build_object('offer',sandbox_commerce_v1.paid_video_offer_json(o));
   end if;
  end if;
 elsif p_command='capability.read' then
  begin
   perform sandbox_commerce_v1.assert_generation(true);
   creator_authority:=sandbox_commerce_v1.assert_authority(uid,sid,'creator');
  exception when insufficient_privilege then creator_authority:=null;
  end;
  body:=jsonb_build_object('creatorEligible',creator_authority is not null,'uploadRouteAvailable',
   exists(select 1 from sandbox_commerce_v1.paid_video_routes where active),'transferAvailable',false,'checkoutAvailable',false,
   'profile',jsonb_build_object('id','scpv-mp4-h264-aac-v1','maxBytes',16777216,'maxDurationMs',60000,'maxWidth',1920,'maxHeight',1080,
    'maxFramesPerSecond',60,'videoCodec','h264','pixelFormat','yuv420p','optionalAudioCodec','aac','maxAudioChannels',2,'maxAudioSampleRate',48000));
 elsif p_command='studio.read' then
  if jsonb_typeof(p_payload->'limit') is distinct from 'number' or p_payload->>'limit' !~ '^([1-9]|[1-4][0-9]|50)$'
   or jsonb_typeof(p_payload->'cursor') not in ('null','string') then raise exception 'paid_video_pagination_invalid'; end if;
  if p_payload->>'cursor' is not null then
   select * into strict cursor_row from sandbox_commerce_v1.paid_video_uploads where id=sandbox_commerce_v1.paid_video_id(p_payload->>'cursor') and creator_id=uid;
  end if;
  select coalesce(jsonb_agg(sandbox_commerce_v1.paid_video_upload_json(x) order by x.created_at desc,x.id desc),'[]'::jsonb) into page
   from (select * from sandbox_commerce_v1.paid_video_uploads where creator_id=uid
    and (cursor_row.id is null or (created_at,id)<(cursor_row.created_at,cursor_row.id))
    order by created_at desc,id desc limit (p_payload->>'limit')::integer+1) x;
  if jsonb_array_length(page)>(p_payload->>'limit')::integer then
   page:=page-(p_payload->>'limit')::integer; next_cursor:=page->(jsonb_array_length(page)-1)->>'id';
  end if;
  body:=jsonb_build_object('uploads',page,'nextCursor',next_cursor);
 elsif p_command='upload.reserve' then
  perform sandbox_commerce_v1.assert_generation(true); creator_authority:=sandbox_commerce_v1.assert_authority(uid,sid,'creator');
  if jsonb_typeof(p_payload->'title') is distinct from 'string' or length(btrim(p_payload->>'title')) not between 1 and 200
   or jsonb_typeof(p_payload->'expectedSha256') is distinct from 'string' or p_payload->>'expectedSha256' !~ '^[a-f0-9]{64}$'
   or jsonb_typeof(p_payload->'expectedByteLength') is distinct from 'number' or p_payload->>'expectedByteLength' !~ '^[1-9][0-9]{0,7}$'
   or (p_payload->>'expectedByteLength')::integer>16777216 then raise exception 'paid_video_expectation_invalid'; end if;
  select * into route from sandbox_commerce_v1.paid_video_routes where active order by id limit 1 for share nowait;
  if not found then state:='held'; body:=jsonb_build_object('reason','immutable_upload_route_unavailable');
  else
   if not pg_try_advisory_xact_lock(hashtextextended('paid-video-reservation:'||uid,687)) then raise exception 'paid_video_reservation_busy' using errcode='55P03'; end if;
   if (select count(*) from sandbox_commerce_v1.paid_video_uploads where creator_id=uid and created_at>clock_timestamp()-interval '1 day')>=20
    then raise exception 'paid_video_reservation_limit'; end if;
   rid:=gen_random_uuid(); asset:=gen_random_uuid(); incarnation:=gen_random_uuid();
   insert into sandbox_commerce_v1.resources(id,creator_id,kind,title) values(rid,uid,'paid_content',btrim(p_payload->>'title'));
   insert into sandbox_commerce_v1.paid_video_uploads(creator_id,resource_id,asset_id,incarnation,route_id,object_key,expected_sha256,expected_byte_length)
    values(uid,rid,asset,incarnation,route.id,'sandbox-commerce-v1/'||uid||'/scv1_resource_'||rid||'/scv1_asset_'||asset||'/'||incarnation||'.mp4',
    p_payload->>'expectedSha256',(p_payload->>'expectedByteLength')::integer) returning * into u;
   body:=jsonb_build_object('upload',sandbox_commerce_v1.paid_video_upload_json(u));
  end if;
 elsif p_command in ('upload.read','upload.finalize','offer.publish') then
  select * into strict u from sandbox_commerce_v1.paid_video_uploads where id=sandbox_commerce_v1.paid_video_id(p_payload->>'uploadId') and creator_id=uid for update nowait;
  select * into strict r from sandbox_commerce_v1.resources where id=u.resource_id for update nowait;
  if p_command<>'upload.read' then
   perform sandbox_commerce_v1.assert_generation(true); creator_authority:=sandbox_commerce_v1.assert_authority(uid,sid,'creator');
  end if;
  if p_command='upload.finalize' then
   if u.state<>'reserved' or u.expires_at<=clock_timestamp() or r.status<>'draft' then raise exception 'paid_video_finalize_unavailable'; end if;
   update sandbox_commerce_v1.paid_video_uploads set state='scan_pending' where id=u.id returning * into u;
  elsif p_command='offer.publish' then
   select * into strict route from sandbox_commerce_v1.paid_video_routes where id=u.route_id and active for share nowait;
   if r.revision<>(p_payload->>'expectedRevision')::bigint or r.status<>'draft' or u.state<>'clean' or u.moderation<>'clear'
    or u.clean_result_sha256 is null or u.object_version is null or u.daily_definitions_at<clock_timestamp()-interval '48 hours'
    or not exists(select 1 from sandbox_commerce_v1.paid_video_scan_results where sha256=u.clean_result_sha256 and accepted_positive)
    then raise exception 'paid_video_publication_evidence_unavailable'; end if;
   c:=sandbox_commerce_v1.paid_video_native_catalog((p_payload->>'amountMinor')::bigint,p_payload->>'currency');
   if c.id is null then state:='held'; body:=jsonb_build_object('reason','native_catalog_unavailable');
   else
    insert into sandbox_commerce_v1.resource_versions(resource_id,revision,creator_id,kind,title,price_minor,currency)
     values(r.id,r.revision,r.creator_id,'paid_content',r.title,c.amount_minor,c.currency);
    insert into sandbox_commerce_v1.delivery_assets(id,resource_id,resource_revision,owner_id,purpose,provider,bucket,object_key,object_version,
     incarnation,sha256,byte_length,state,moderation) values(u.asset_id,r.id,r.revision,uid,'video',route.provider,route.bucket,u.object_key,
     u.object_version,u.incarnation,u.expected_sha256,u.expected_byte_length,'retained','clear');
    insert into sandbox_commerce_v1.delivery_asset_scans(asset_id,incarnation,provider,bucket,object_key,object_version,sha256,byte_length,state,scanner_version,completed_at)
     select u.asset_id,u.incarnation,route.provider,route.bucket,u.object_key,u.object_version,u.expected_sha256,u.expected_byte_length,'clean',
      'scpv-byte-scan-v1:'||u.clean_result_sha256,(raw_body::jsonb#>>'{result,checkedAt}')::timestamptz
      from sandbox_commerce_v1.paid_video_scan_results where sha256=u.clean_result_sha256;
    insert into sandbox_commerce_v1.video_terms values(r.id,r.revision,u.asset_id,'paid');
    insert into sandbox_commerce_v1.offers(resource_id,resource_revision,catalog_id) values(r.id,r.revision,c.id) returning * into o;
    perform sandbox_commerce_v1.paid_video_native_bind_offer(o);
    update sandbox_commerce_v1.resources set status='published' where id=r.id;
    body:=jsonb_build_object('offer',sandbox_commerce_v1.paid_video_offer_json(o),'upload',sandbox_commerce_v1.paid_video_upload_json(u));
   end if;
  end if;
  if p_command<>'offer.publish' then body:=jsonb_build_object('upload',sandbox_commerce_v1.paid_video_upload_json(u)); end if;
 elsif p_command='resource.read' then
  select * into strict r from sandbox_commerce_v1.resources where id=sandbox_commerce_v1.identifier(p_payload->>'resourceId','resource') and creator_id=uid;
  select * into strict u from sandbox_commerce_v1.paid_video_uploads where resource_id=r.id and creator_id=uid;
  body:=jsonb_build_object('resource',sandbox_commerce_v1.resource_json(r)||jsonb_build_object('title',r.title),'upload',sandbox_commerce_v1.paid_video_upload_json(u));
 elsif p_command in ('offer.read','offer.retire') then
  select * into strict o from sandbox_commerce_v1.offers where id=sandbox_commerce_v1.identifier(p_payload->>'offerId','offer') for update nowait;
  select * into strict r from sandbox_commerce_v1.resources where id=o.resource_id for update nowait;
  select * into strict u from sandbox_commerce_v1.paid_video_uploads where resource_id=r.id for update nowait;
  if p_command='offer.retire' then
   if r.creator_id<>uid or o.revision<>(p_payload->>'expectedRevision')::bigint then raise exception 'paid_video_offer_unavailable'; end if;
   update sandbox_commerce_v1.offers set status='retired' where id=o.id returning * into o;
   update sandbox_commerce_v1.resources set status='retired' where id=r.id;
   update sandbox_commerce_v1.paid_video_uploads x set state=case when x.state='rejected' then x.state else 'retired' end where id=u.id returning * into u;
   update sandbox_commerce_v1.delivery_assets set moderation=case when moderation='removed' then moderation else 'held' end where id=u.asset_id;
  elsif r.creator_id<>uid and (o.status<>'published' or r.status<>'published' or u.state<>'clean' or u.moderation<>'clear')
   then raise exception 'paid_video_offer_unavailable'; end if;
  body:=jsonb_build_object('offer',sandbox_commerce_v1.paid_video_offer_json(o));
  if r.creator_id=uid then body:=body||jsonb_build_object('upload',sandbox_commerce_v1.paid_video_upload_json(u)); end if;
 end if;
 if mutation and not replay and state='ok' then
  insert into sandbox_commerce_v1.paid_video_requests(user_id,request_id,session_id,command,payload,upload_id) values(uid,req,sid,p_command,p_payload,u.id);
 end if;
 perform sandbox_commerce_v1.assert_fresh(authority);
 if creator_authority is not null then perform sandbox_commerce_v1.assert_fresh(creator_authority); end if;
 result:=jsonb_build_object('protocol','isolated-paid-video-v1','command',p_command,'requestId',req,'status',state,
  'actor',jsonb_build_object('userId',uid,'accountId',uid,'sessionGeneration',sid),'data',body);
 return result;
end $$;

-- Native authoring does not require or activate Test Store checkout. The
-- existing V3 branch and common S3/verifier/scanner qualification remain.
create or replace function sandbox_commerce_v1.paid_video_gateway_ready(p_configuration text,p_route uuid default null)
returns boolean language plpgsql volatile security invoker set search_path='' as $$
declare ctl sandbox_commerce_v1.paid_video_gateway_controls; native sandbox_commerce_v1.test_store_v3_native_profiles;
 profile sandbox_commerce_v1.paid_video_native_authoring_profiles;
 conn sandbox_commerce_v1.test_store_v3_connections; checkout sandbox_commerce_v1.test_store_v3_controls;
begin
 perform 1 from sandbox_commerce_v1.lifecycle where singleton and state='active' for share nowait;
 if not found then return false; end if;
 select * into strict ctl from sandbox_commerce_v1.paid_video_gateway_controls where singleton for share nowait;
 if p_configuration='8e5c534276f2e9cc279cd5dbd629964c49124b6551d7829c3a29dbb6635f0dc0' then
  lock table sandbox_commerce_v1.test_store_v3_native_profiles in share mode nowait;
  if exists(select 1 from sandbox_commerce_v1.test_store_v3_native_profiles where configuration_digest=p_configuration) then return false; end if;
  select * into profile from sandbox_commerce_v1.paid_video_native_authoring_profiles where configuration_digest=p_configuration and enabled for share nowait;
  if not found or not ctl.enabled or (p_route is not null and ctl.route_id<>p_route)
   or row(profile.route_id,profile.worker_id,profile.verifier_id,profile.qualification_sha256)
    is distinct from row(ctl.route_id,ctl.worker_id,ctl.verifier_id,ctl.qualification_sha256) then return false; end if;
 else
 select * into native from sandbox_commerce_v1.test_store_v3_native_profiles where configuration_digest=p_configuration and qualified for share nowait;
 if not found or not ctl.enabled or (p_route is not null and ctl.route_id<>p_route) then return false; end if;
 select * into strict conn from sandbox_commerce_v1.test_store_v3_connections where id=native.connection_id and revision=native.connection_revision for share nowait;
 select * into strict checkout from sandbox_commerce_v1.test_store_v3_controls where singleton for share nowait;
 if not conn.qualified or not checkout.ingress_enabled or not checkout.provisioning_enabled or not checkout.initiation_enabled
  or row(checkout.connection_id,checkout.connection_revision) is distinct from row(conn.id,conn.revision) then return false; end if;
 perform sandbox_commerce_v1.test_store_v3_scope_exclusive(conn.project_id);
 end if;
 perform 1 from sandbox_commerce_v1.paid_video_routes where id=ctl.route_id and active and provider='s3' for share nowait;
 if not found then return false; end if;
 perform 1 from sandbox_commerce_v1.paid_video_workers where id=ctl.worker_id and active for share nowait;
 if not found then return false; end if;
 perform 1 from sandbox_commerce_v1.paid_video_verifiers v where v.id=ctl.verifier_id and v.active
  and not exists(select 1 from sandbox_commerce_v1.paid_video_workers w where w.hmac_key=v.hmac_key) for share of v nowait;
 return found;
end $$;

create or replace function sandbox_commerce_v1.paid_video_probe_admit(p_upload uuid,p_user uuid,p_session uuid,p_request uuid,p_configuration text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare u sandbox_commerce_v1.paid_video_uploads; t sandbox_commerce_v1.paid_video_transfers;
 ctl sandbox_commerce_v1.paid_video_gateway_controls; route sandbox_commerce_v1.paid_video_routes; authority jsonb; deadline timestamptz;
 receipt sandbox_commerce_v1.paid_video_object_receipts;
 original_configuration text;
begin
 perform sandbox_commerce_v1.assert_provider_service(); perform sandbox_commerce_v1.assert_generation(false);
 authority:=sandbox_commerce_v1.assert_authority(p_user,p_session,'delivery');
 select * into strict u from sandbox_commerce_v1.paid_video_uploads where id=p_upload and creator_id=p_user for share nowait;
 select * into strict t from sandbox_commerce_v1.paid_video_transfers where upload_id=u.id and user_id=p_user and request_id=p_request;
 perform sandbox_commerce_v1.paid_video_assert_authoring_mode(u.id,p_configuration);
 select configuration_digest into strict original_configuration from sandbox_commerce_v1.paid_video_gateway_transfers where transfer_id=t.id;
 select * into receipt from sandbox_commerce_v1.paid_video_object_receipts where upload_id=u.id and transfer_id=t.id;
 if found then
  perform sandbox_commerce_v1.assert_fresh(authority);
  return jsonb_build_object('protocol','scpv-object-receipt-v2','state','recorded','uploadId','scpv_upload_'||u.id,
   'userId',p_user,'originalSessionId',t.session_id,'originalConfigurationDigest',original_configuration,'requestId',t.request_id,'transferId',t.id,'incarnation',u.incarnation,'sha256',u.expected_sha256,'byteLength',u.expected_byte_length,
   'objectVersion',receipt.object_version);
 end if;
 perform sandbox_commerce_v1.assert_generation(true);
 authority:=sandbox_commerce_v1.assert_authority(p_user,p_session,'creator');
 if u.state<>'reserved' or u.expires_at<=clock_timestamp() or not sandbox_commerce_v1.paid_video_gateway_ready(p_configuration,u.route_id)
 then raise exception 'paid_video_probe_unavailable'; end if;
 select * into strict ctl from sandbox_commerce_v1.paid_video_gateway_controls where singleton;
 select * into strict route from sandbox_commerce_v1.paid_video_routes where id=u.route_id;
 deadline:=least(clock_timestamp()+interval '5 seconds',(authority->>'valid_until')::timestamptz,u.expires_at);
 perform sandbox_commerce_v1.assert_fresh(authority);
 return jsonb_build_object('protocol','scpv-probe-admission-v2','actor',jsonb_build_object('userId',p_user,'sessionGeneration',p_session),
  'uploadId','scpv_upload_'||u.id,'requestId',p_request,'transferId',t.id,'originalSessionId',t.session_id,
  'configurationDigest',p_configuration,'originalConfigurationDigest',original_configuration,'verifierId',ctl.verifier_id,'validUntilMs',floor(extract(epoch from deadline)*1000),
  'object',jsonb_build_object('provider','s3','bucket',route.bucket,'routeId',route.id,'objectKey',u.object_key,'incarnation',u.incarnation,
   'expectedSha256',u.expected_sha256,'expectedByteLength',u.expected_byte_length));
end $$;

create or replace function sandbox_commerce_v1.paid_video_command_v2(p_command text,p_payload jsonb,p_user uuid,p_session uuid,p_configuration text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare result jsonb; u sandbox_commerce_v1.paid_video_uploads; ready boolean; transfer boolean; body jsonb; authority jsonb; creator boolean:=false;
 claims jsonb:=nullif(current_setting('request.jwt.claims',true),'')::jsonb; o sandbox_commerce_v1.offers;
 context sandbox_commerce_v1.paid_video_gateway_requests; mutation boolean; req uuid; transfer_descriptor jsonb;
begin
 if claims->>'role' is distinct from 'authenticated' or p_user is null or p_session is null
  or claims->>'sub' is distinct from p_user::text or claims->>'session_id' is distinct from p_session::text
 then raise exception 'paid_video_actor_binding_invalid' using errcode='42501'; end if;
 authority:=sandbox_commerce_v1.assert_authority(p_user,p_session,'delivery');
 if p_configuration is null or p_configuration !~ '^[a-f0-9]{64}$' then raise exception 'paid_video_configuration_invalid'; end if;
 mutation:=p_command in ('upload.reserve','upload.finalize','offer.publish','offer.retire');
 if mutation then
  req:=(p_payload->>'requestId')::uuid;
  if req is null then raise exception 'paid_video_request_invalid'; end if;
  if not pg_try_advisory_xact_lock(hashtextextended('isolated-paid-video-v1:'||p_user||':'||req,687))
  then raise exception 'paid_video_request_busy' using errcode='55P03'; end if;
  select * into context from sandbox_commerce_v1.paid_video_gateway_requests where user_id=p_user and request_id=req;
  if found then
   if row(context.session_id,context.configuration_digest,context.command,context.payload)
    is distinct from row(p_session,p_configuration,p_command,p_payload) then raise exception 'paid_video_v2_context_conflict'; end if;
  elsif exists(select 1 from sandbox_commerce_v1.paid_video_requests where user_id=p_user and request_id=req)
   then raise exception 'paid_video_v2_context_required';
  end if;
 end if;
 if p_configuration='8e5c534276f2e9cc279cd5dbd629964c49124b6551d7829c3a29dbb6635f0dc0' and exists(select 1 from sandbox_commerce_v1.test_store_v3_native_profiles where configuration_digest=p_configuration)
 then raise exception 'paid_video_authoring_mode_conflict'; end if;
 ready:=sandbox_commerce_v1.paid_video_gateway_ready(p_configuration);
 if p_command='upload.reserve' then
  if not ready or (select id from sandbox_commerce_v1.paid_video_routes where active order by id limit 1)
    is distinct from (select route_id from sandbox_commerce_v1.paid_video_gateway_controls where singleton)
  then raise exception 'paid_video_gateway_unavailable'; end if;
 elsif p_command in ('upload.finalize','offer.publish') then
  select * into strict u from sandbox_commerce_v1.paid_video_uploads where id=sandbox_commerce_v1.paid_video_id(p_payload->>'uploadId') and creator_id=p_user for update nowait;
  if not ready or not sandbox_commerce_v1.paid_video_gateway_ready(p_configuration,u.route_id)
   or not exists(select 1 from sandbox_commerce_v1.paid_video_object_receipts r where r.upload_id=u.id and r.object_version=u.object_version)
  then raise exception 'paid_video_object_receipt_required'; end if;
 end if;
 if p_configuration='8e5c534276f2e9cc279cd5dbd629964c49124b6551d7829c3a29dbb6635f0dc0' then
  result:=sandbox_commerce_v1.paid_video_native_command(p_command,p_payload,p_user,p_session);
 else
 result:=sandbox_commerce_v1.paid_video_command(p_command,p_payload,p_user,p_session);
 end if;
 body:=result->'data';
 if mutation and result->>'status'='ok' and context.request_id is null then
  insert into sandbox_commerce_v1.paid_video_gateway_requests values(p_user,req,p_session,p_configuration,p_command,p_payload);
 end if;
 if p_command='upload.recover' and result->>'status'='ok' then
  select * into strict context from sandbox_commerce_v1.paid_video_gateway_requests
   where user_id=p_user and request_id=(p_payload->>'originalRequestId')::uuid;
  body:=jsonb_set(body,'{recovery}',(body->'recovery')||jsonb_build_object('originalConfigurationDigest',context.configuration_digest));
 end if;
 if p_command='resource.read' then
  select * into o from sandbox_commerce_v1.offers where resource_id=sandbox_commerce_v1.identifier(p_payload->>'resourceId','resource');
  if found then body:=body||jsonb_build_object('offer',sandbox_commerce_v1.paid_video_offer_json(o)); end if;
 end if;
 if p_command='capability.read' then
  body:=body||jsonb_build_object('uploadRouteAvailable',ready,'transferAvailable',ready and (body->>'creatorEligible')::boolean,
   'checkoutAvailable',ready and p_configuration<>'8e5c534276f2e9cc279cd5dbd629964c49124b6551d7829c3a29dbb6635f0dc0');
 end if;
 if body ? 'upload' then
  select * into strict u from sandbox_commerce_v1.paid_video_uploads where id=sandbox_commerce_v1.paid_video_id(body#>>'{upload,id}');
  perform sandbox_commerce_v1.paid_video_assert_authoring_mode(u.id,p_configuration);
  if ready then
   begin
    perform sandbox_commerce_v1.assert_fresh(sandbox_commerce_v1.assert_authority(p_user,p_session,'creator')); creator:=true;
   exception when insufficient_privilege then creator:=false;
   end;
  end if;
  transfer:=ready and creator and u.creator_id=p_user and u.state='reserved' and u.expires_at>clock_timestamp()
   and sandbox_commerce_v1.paid_video_gateway_ready(p_configuration,u.route_id)
   and not exists(select 1 from sandbox_commerce_v1.paid_video_transfers where upload_id=u.id);
  body:=jsonb_set(body,'{upload}',(body->'upload')||jsonb_build_object('transferAvailable',transfer,'checkoutAvailable',false));
  if p_command='upload.read' then
   select jsonb_build_object('requestId',t.request_id,'originalSessionId',t.session_id,'configurationDigest',ct.configuration_digest)
    into transfer_descriptor from sandbox_commerce_v1.paid_video_transfers t
    join sandbox_commerce_v1.paid_video_gateway_transfers ct on ct.transfer_id=t.id where t.upload_id=u.id and t.user_id=p_user;
   if transfer_descriptor is null and exists(select 1 from sandbox_commerce_v1.paid_video_transfers where upload_id=u.id)
   then raise exception 'paid_video_v2_transfer_context_required'; end if;
   body:=body||jsonb_build_object('transfer',transfer_descriptor);
  end if;
 end if;
 if body ? 'offer' then
  select * into strict u from sandbox_commerce_v1.paid_video_uploads where resource_id=sandbox_commerce_v1.identifier(body#>>'{offer,resourceId}','resource');
  perform sandbox_commerce_v1.paid_video_assert_authoring_mode(u.id,p_configuration);
  body:=jsonb_set(body,'{offer}',(body->'offer')||jsonb_build_object('checkoutAvailable',ready and body#>>'{offer,status}'='published'
   and exists(select 1 from sandbox_commerce_v1.offers offer_row join sandbox_commerce_v1.test_store_v3_products p on p.catalog_id=offer_row.catalog_id
    join sandbox_commerce_v1.test_store_v3_native_profiles n on n.configuration_digest=p_configuration
    where offer_row.id=sandbox_commerce_v1.identifier(body#>>'{offer,id}','offer') and p.qualified
     and row(p.connection_id,p.connection_revision)=row(n.connection_id,n.connection_revision))));
 end if;
 -- Studio entries are status/history; transfer still requires upload.read and
 -- a fresh bounded gateway admission. They never advertise reusable authority.
 authority:=sandbox_commerce_v1.assert_authority(p_user,p_session,'delivery');
 perform sandbox_commerce_v1.assert_fresh(authority);
 return result||jsonb_build_object('protocol','isolated-paid-video-v2','configurationDigest',p_configuration,
  'capabilityExpiresAtMs',floor(extract(epoch from least(clock_timestamp()+interval '5 seconds',(authority->>'valid_until')::timestamptz))*1000),'data',body);
end $$;

revoke all on function sandbox_commerce_v1.paid_video_assert_authoring_mode(uuid,text),
 sandbox_commerce_v1.paid_video_native_transfer_mode(),sandbox_commerce_v1.paid_video_native_catalog(bigint,text),
 sandbox_commerce_v1.paid_video_native_bind_offer(sandbox_commerce_v1.offers),sandbox_commerce_v1.paid_video_native_command(text,jsonb,uuid,uuid)
 from public,anon,authenticated,service_role,sbx_v1_operator;
reset role;
