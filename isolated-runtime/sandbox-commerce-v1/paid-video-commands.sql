-- Additive disabled source after paid-video-media.sql. No checkout or delivery
-- command is exposed: protocol-3 receipts/current Test Store holds are required.
set local role sbx_v1_core_owner;
create function sandbox_commerce_v1.paid_video_id(p_value text)
returns uuid language plpgsql immutable security invoker set search_path='' as $$
begin
 if p_value is null or p_value !~ '^scpv_upload_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
 then raise exception 'paid_video_identifier_invalid'; end if;
 return substring(p_value from 13)::uuid;
end $$;
create function sandbox_commerce_v1.paid_video_offer_json(o sandbox_commerce_v1.offers)
returns jsonb language sql stable security invoker set search_path='' as $$
 select sandbox_commerce_v1.offer_json(o)||jsonb_build_object('resourceRevision',o.resource_revision,
  'asset',jsonb_build_object('id','scv1_asset_'||a.id,'incarnation',a.incarnation,'sha256',a.sha256,
  'byteLength',a.byte_length,'resourceRevision',a.resource_revision,'profile','scpv-mp4-h264-aac-v1'),
  'checkoutAvailable',false)
 from sandbox_commerce_v1.video_terms v join sandbox_commerce_v1.delivery_assets a on a.id=v.asset_id
 where v.resource_id=o.resource_id and v.revision=o.resource_revision;
$$;
create function sandbox_commerce_v1.paid_video_command(p_command text,p_payload jsonb,p_expected_account_id uuid,p_expected_session_generation uuid)
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
   select cat.* into c from sandbox_commerce_v1.catalog cat join sandbox_commerce_v1.paid_video_catalog pc on pc.catalog_id=cat.id
    where cat.kind='paid_content' and cat.provider='revenuecat' and cat.store='test_store' and pc.protocol=3
     and cat.amount_minor=(p_payload->>'amountMinor')::bigint and cat.currency=p_payload->>'currency' for share of cat,pc nowait;
   if not found then state:='held'; body:=jsonb_build_object('reason','protocol3_catalog_unavailable');
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
revoke all on function sandbox_commerce_v1.paid_video_id(text),sandbox_commerce_v1.paid_video_offer_json(sandbox_commerce_v1.offers),
 sandbox_commerce_v1.paid_video_command(text,jsonb,uuid,uuid) from public,anon,authenticated,service_role;
reset role;
create function public.isolated_paid_video_v1(p_command text,p_payload jsonb,p_expected_account_id uuid,p_expected_session_generation uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
begin
 perform sandbox_commerce_v1.arm_transaction_timeout();
 return sandbox_commerce_v1.paid_video_command(p_command,p_payload,p_expected_account_id,p_expected_session_generation);
end $$;
alter function public.isolated_paid_video_v1(text,jsonb,uuid,uuid) owner to sbx_v1_core_owner;
revoke all on function public.isolated_paid_video_v1(text,jsonb,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.isolated_paid_video_v1(text,jsonb,uuid,uuid) to authenticated;
