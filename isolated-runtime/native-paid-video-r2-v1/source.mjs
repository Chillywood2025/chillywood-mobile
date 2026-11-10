// Deterministic forward source. Every reused function is taken from an exact
// frozen file, then every live replacement is gated by its predecessor prosrc.
// This emits SQL only. It has no database URL, apply, network, or activation API.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const hash=v=>createHash('sha256').update(v).digest('hex');
const pins={
 'isolated-runtime/native-paid-video-authoring-v1/authoring.sql':'86eefa28bf38ca0ad8730786706dd7f1a03baa3a3ed88ceb61cee599d92a426e',
 'isolated-runtime/sandbox-commerce-v1/paid-video-media.sql':'ec98da0d9bbc3400d00a750bdea5aaf65b8a799ed08e2e85abe168d6e76404cf',
 'isolated-runtime/sandbox-commerce-v1/delivery-authority.sql':'49a92c9f810218dea66ea896e98f10a22ff34ef15af2f722f573ec3a85242545',
 'isolated-runtime/sandbox-commerce-v1/test-store-paid-video-core.sql':'b35ff1b171e78a20aee5e11eabb7dd6160db4d4cff2268aca20e00c5a47552ed',
 'isolated-runtime/native-store-sandbox-v1/native-access.sql':'88f33c4a051498359ca14e0dfcf83e17a8ff3320cc9b4420704f14b676a8dc24',
 'isolated-runtime/native-store-sandbox-v1/quote.sql':'0fa036a446433f8eb52d608bc21f478a476eb9b6c2daf4cc1893321aa7167410',
 'isolated-runtime/native-store-sandbox-v1/settlement-effects.sql':'3b56554f199e07cc0e0b346de08af3a5d15258f46b10ec1eafac4a63af0883a4',
 'ops/isolated-paid-video-operations-v2/operations.sql':'32f965cb5e8bb815b17c0958ddc8dc933f149918b89ce9e1a708de42f7973355',
 'ops/isolated-paid-video-operations-v2/monotonic-removal.sql':'3398dcc95cbce6e45a0bed9934f48ee859cece5ec96979ada8dd15ca95b4b5ee',
 'isolated-runtime/native-store-play-handoff-v1/settlement.sql':'37e7b062b19a221c35c971572c931d9dbe023e313bb5a6873198f200f0bca6a5',
};
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const one=(text,from,to)=>{if(text.split(from).length!==2)throw Error('r2_replacement_anchor:'+from);return text.replace(from,to);};
const definition=(source,name)=>{
 const match=source.match(new RegExp(`create (?:or replace )?function sandbox_commerce_v1\\.${name}\\([\\s\\S]*?\\$\\$;`,'u'));
 if(!match)throw Error('r2_function_missing:'+name);return match[0];
};
const body=sql=>sql.split('$$')[1];
export function nativeR2Source(){
 for(const [file,pin] of Object.entries(pins))if(hash(read(file))!==pin)throw Error('r2_predecessor_source_drift:'+file);
 const author=read(Object.keys(pins)[0]),media=read(Object.keys(pins)[1]),delivery=read(Object.keys(pins)[2]),v3=read(Object.keys(pins)[3]);
 const access=read(Object.keys(pins)[4]),quote=read(Object.keys(pins)[5]),operations=read(Object.keys(pins)[7]);
 const play=read('isolated-runtime/native-store-play-handoff-v1/settlement.sql');
 const replacements=[],clones=[];
 function replace(source,name,signature,transform){
  const previous=definition(source,name),next=transform(previous).replace(/^create (?:or replace )?function/u,'create or replace function');
  if(previous===next)throw Error('r2_empty_replacement');replacements.push({name,signature,previousSha256:hash(body(previous)),sql:next});
 }
 function clone(source,name,next,transform=x=>x){
  let sql=definition(source,name).replace(/^create (?:or replace )?function/u,'create function').replace(`sandbox_commerce_v1.${name}(`,`sandbox_commerce_v1.${next}(`);
  sql=transform(sql);clones.push(sql);return sql;
 }
 replace(author,'paid_video_gateway_ready','text,uuid',sql=>one(sql,'begin\n',`begin
 if exists(select 1 from sandbox_commerce_v1.r2_profiles where configuration_digest=p_configuration and (route_id=p_route or (p_route is null and enabled)))
 then return sandbox_commerce_v1.r2_ready(p_configuration,p_route); end if;
`));
 replace(author,'paid_video_native_command','text,jsonb,uuid,uuid',sql=>{
  sql=one(sql,'select * into route from sandbox_commerce_v1.paid_video_routes where active order by id limit 1 for share nowait;',`select rr.* into route from sandbox_commerce_v1.paid_video_routes rr where rr.active and
   (rr.id=(select p.route_id from sandbox_commerce_v1.r2_profiles p where p.configuration_digest='8e5c534276f2e9cc279cd5dbd629964c49124b6551d7829c3a29dbb6635f0dc0' and p.enabled)
    or (not exists(select 1 from sandbox_commerce_v1.r2_profiles where enabled) and rr.provider='s3'
     and rr.id=(select route_id from sandbox_commerce_v1.paid_video_native_authoring_profiles where enabled))) for share nowait;`);
  sql=one(sql,'or u.clean_result_sha256 is null or u.object_version is null',"or u.clean_result_sha256 is null or (route.provider='s3' and u.object_version is null) or (route.provider='cloudflare_r2' and not sandbox_commerce_v1.r2_identity_valid(u.r2_identity))");
  sql=one(sql,'object_key,object_version,\n     incarnation','object_key,object_version,r2_identity,\n     incarnation');
  sql=one(sql,'u.object_version,u.incarnation,u.expected_sha256', 'u.object_version,u.r2_identity,u.incarnation,u.expected_sha256');
  sql=one(sql,'object_key,object_version,sha256,byte_length,state,scanner_version,completed_at)', 'object_key,object_version,r2_identity,sha256,byte_length,state,scanner_version,completed_at)');
  sql=one(sql,'u.object_key,u.object_version,u.expected_sha256','u.object_key,u.object_version,u.r2_identity,u.expected_sha256');return sql;
 });
 replace(author,'paid_video_command_v2','text,jsonb,uuid,uuid,text',sql=>{
  sql=one(sql,"if not ready or (select id from sandbox_commerce_v1.paid_video_routes where active order by id limit 1)\n    is distinct from (select route_id from sandbox_commerce_v1.paid_video_gateway_controls where singleton)",`if not ready or (p_configuration<>'8e5c534276f2e9cc279cd5dbd629964c49124b6551d7829c3a29dbb6635f0dc0' and
    (select id from sandbox_commerce_v1.paid_video_routes where active order by id limit 1)
    is distinct from (select route_id from sandbox_commerce_v1.paid_video_gateway_controls where singleton))`);
  sql=one(sql,'or not exists(select 1 from sandbox_commerce_v1.paid_video_object_receipts r where r.upload_id=u.id and r.object_version=u.object_version)',`or not (exists(select 1 from sandbox_commerce_v1.paid_video_object_receipts r where r.upload_id=u.id and r.object_version=u.object_version)
    or exists(select 1 from sandbox_commerce_v1.r2_receipts r where r.upload_id=u.id and r.identity=u.r2_identity))`);
  sql=one(sql,'and not exists(select 1 from sandbox_commerce_v1.paid_video_transfers where upload_id=u.id);',`and not exists(select 1 from sandbox_commerce_v1.paid_video_transfers where upload_id=u.id)
   and not exists(select 1 from sandbox_commerce_v1.r2_bindings where upload_id=u.id and operation='upload');`);
  sql=one(sql,"body:=body||jsonb_build_object('transfer',transfer_descriptor);",`if transfer_descriptor is null then
    select jsonb_build_object('requestId',b.request_id,'originalSessionId',b.session_id,'configurationDigest',p.configuration_digest)
     into transfer_descriptor from sandbox_commerce_v1.r2_bindings b join sandbox_commerce_v1.r2_profiles p on p.id=b.profile_id
     where b.upload_id=u.id and b.operation='upload';
   end if;
   body:=body||jsonb_build_object('transfer',transfer_descriptor);`);return sql;
 });
 replace(delivery,'clean_resource_asset','uuid,uuid,bigint,uuid,text',sql=>sql.replaceAll('s.object_version,s.sha256','s.object_version,s.r2_identity,s.sha256').replaceAll('a.object_version,a.sha256','a.object_version,a.r2_identity,a.sha256'));
 clone(v3,'test_store_v3_assert_media','native_r2_assert_media',sql=>{
  sql=one(sql,"or not route.active or route.provider<>'s3'",`or not route.active or route.provider<>'cloudflare_r2'
  or not sandbox_commerce_v1.r2_ready('8e5c534276f2e9cc279cd5dbd629964c49124b6551d7829c3a29dbb6635f0dc0',route.id)
  or not exists(select 1 from sandbox_commerce_v1.r2_receipts rr where rr.upload_id=upload.id and rr.identity=upload.r2_identity)`);
  return sql.replaceAll('upload.object_version,upload.incarnation','upload.object_version,upload.r2_identity,upload.incarnation').replaceAll('asset.object_version,asset.incarnation','asset.object_version,asset.r2_identity,asset.incarnation');
 });
 // Native-only dispatcher. The original Test Store media helper stays S3-only.
 clones.push(`create function sandbox_commerce_v1.native_typed_assert_media(i sandbox_commerce_v1.intents) returns void language plpgsql volatile set search_path='' as $$begin
 if exists(select 1 from sandbox_commerce_v1.paid_video_uploads u join sandbox_commerce_v1.paid_video_routes r on r.id=u.route_id where u.resource_id=i.resource_id and r.provider='cloudflare_r2')
 then perform sandbox_commerce_v1.native_r2_assert_media(i);else perform sandbox_commerce_v1.test_store_v3_assert_media(i);end if;end $$;`);
 replace(quote,'native_store_quote_command_armed','uuid,uuid,text,uuid,jsonb',sql=>one(sql,'sandbox_commerce_v1.test_store_v3_assert_media(', 'sandbox_commerce_v1.native_typed_assert_media('));
 // The installed Play dispatcher is retained, including its exact budget and
 // source selection. Change only media admission in BOTH selected backends.
 for(const name of ['native_store_apply_effect_pre_play_handoff','native_store_play_apply_effect'])
  replace(play,name,'uuid,uuid,uuid,bigint,jsonb',sql=>one(sql,'sandbox_commerce_v1.test_store_v3_assert_media(intent)', 'sandbox_commerce_v1.native_typed_assert_media(intent)'));
 clone(access,'native_store_paid_video_access','native_store_paid_video_r2_access',sql=>{
  sql=one(sql,'perform sandbox_commerce_v1.assert_provider_service();perform sandbox_commerce_v1.assert_generation(true);','perform sandbox_commerce_v1.assert_generation(true);');
  sql=one(sql,'ctl sandbox_commerce_v1.paid_video_gateway_controls;', 'ctl sandbox_commerce_v1.r2_profiles;');
  sql=one(sql,'select * into strict ctl from sandbox_commerce_v1.paid_video_gateway_controls where singleton for share nowait;',`select * into strict ctl from sandbox_commerce_v1.r2_profiles where route_id=route.id for share nowait;
 if not sandbox_commerce_v1.r2_ready(ctl.configuration_digest,route.id) then raise exception 'native_video_r2_profile_unavailable';end if;`);
  sql=one(sql,"route.provider<>'s3'","route.provider<>'cloudflare_r2'");
  const start=sql.indexOf('  or not exists(select 1 from sandbox_commerce_v1.paid_video_object_receipts');
  const end=sql.indexOf("\n then raise exception 'native_video_current_object_required'",start);
  if(start<0||end<0)throw Error('r2_access_receipt_anchor');
  sql=sql.slice(0,start)+`  or not exists(select 1 from sandbox_commerce_v1.r2_receipts rr join sandbox_commerce_v1.r2_commits c on c.upload_id=rr.upload_id
    where rr.upload_id=upload.id and rr.verifier_id=ctl.verifier_id and rr.identity=upload.r2_identity and c.state='acknowledged' and c.identity=rr.identity)`+sql.slice(end);
  sql=sql.replaceAll('upload.object_version,upload.incarnation','upload.object_version,upload.r2_identity,upload.incarnation').replaceAll('asset.object_version,asset.incarnation','asset.object_version,asset.r2_identity,asset.incarnation');
  sql=one(sql,"'nssv1-current-access-gateway-v1'","'nssv1-current-access-gateway-r2-v1'");
  sql=one(sql,"'objectVersion',asset.object_version","'identity',asset.r2_identity");return sql;
 });
 replace(access,'native_store_paid_video_access','uuid,uuid,uuid,uuid',sql=>one(sql,'begin\n',`begin
 if exists(select 1 from sandbox_commerce_v1.paid_video_uploads u join sandbox_commerce_v1.paid_video_routes rr on rr.id=u.route_id
   where u.resource_id=p_resource and rr.provider='cloudflare_r2')
 then perform sandbox_commerce_v1.assert_provider_service();return sandbox_commerce_v1.native_store_paid_video_r2_access(p_user,p_session,p_resource,p_grant);end if;
`));
 replace(operations,'paid_video_review_snapshot','uuid',sql=>one(sql,"'object',jsonb_build_object(","'object',case when r.provider='cloudflare_r2' then sandbox_commerce_v1.r2_object(u.id) else jsonb_build_object(").replace("'objectVersion',u.object_version),\n  'lastReview'","'objectVersion',u.object_version) end,\n  'lastReview'"));
 replace(operations,'paid_video_review','text,text',sql=>one(sql,
  `  perform sandbox_commerce_v1.paid_video_operations_binding((select binding from sandbox_commerce_v1.paid_video_operations_config where singleton),true);
  perform sandbox_commerce_v1.paid_video_operations_object(upload,(select binding from sandbox_commerce_v1.paid_video_operations_config where singleton));`,
  `  if exists(select 1 from sandbox_commerce_v1.paid_video_uploads x join sandbox_commerce_v1.paid_video_routes rr on rr.id=x.route_id where x.id=upload and rr.provider='cloudflare_r2')
  then perform sandbox_commerce_v1.r2_review_object(upload);
  else
   perform sandbox_commerce_v1.paid_video_operations_binding((select binding from sandbox_commerce_v1.paid_video_operations_config where singleton),true);
   perform sandbox_commerce_v1.paid_video_operations_object(upload,(select binding from sandbox_commerce_v1.paid_video_operations_config where singleton));
  end if;`));
 // Reuse the complete scan freshness/codec/negative transition implementation,
 // changing only typed wire/receipt bindings and never synthesizing VersionId.
 clone(media,'paid_video_scan_ingest','r2_scan_ingest',sql=>{
  const start=sql.indexOf(" if body->>'protocol'");const end=sql.indexOf('\n -- Lifecycle',start);
  sql=sql.slice(0,start)+` if body->>'protocol' is distinct from 'scpv-worker-result-r2-v1' or jsonb_typeof(body)<>'object'
  or not(body ?& array['protocol','ticketId','uploadId','workerId','qualificationSha256','object','result'])
  or (body-array['protocol','ticketId','uploadId','workerId','qualificationSha256','object','result'])<>'{}'::jsonb
  or result->>'protocol' is distinct from 'scpv-byte-scan-v1' or result->>'profile' is distinct from 'scpv-mp4-h264-aac-v1'
  or result->>'moderation' is distinct from 'unreviewed' or result->>'verdict' not in('clean','rejected') or result->>'verdict' is null
 then raise exception 'paid_video_r2_result_invalid'; end if;`+sql.slice(end);
  sql=one(sql,"or body->>'incarnation' is distinct from u.incarnation::text",`or body->>'workerId' is distinct from w.id::text
  or not exists(select 1 from sandbox_commerce_v1.r2_tickets rt join sandbox_commerce_v1.r2_profiles p on p.id=rt.profile_id
   where rt.ticket_id=t.id and rt.object=body->'object' and p.worker_id=w.id and p.qualification_sha256=body->>'qualificationSha256')
  or body->'object' is distinct from sandbox_commerce_v1.r2_object(u.id)
  or not exists(select 1 from sandbox_commerce_v1.r2_receipts rr where rr.upload_id=u.id and rr.identity=body#>'{object,identity}')`);
  sql=one(sql,"  perform sandbox_commerce_v1.assert_generation(true);",`  perform sandbox_commerce_v1.assert_generation(true);
  if not sandbox_commerce_v1.r2_ready('8e5c534276f2e9cc279cd5dbd629964c49124b6551d7829c3a29dbb6635f0dc0',u.route_id) then raise exception 'paid_video_r2_profile_unavailable';end if;`);
  sql=one(sql,"set state='clean',object_version=body->>'objectVersion',","set state='clean',");return sql;
 });
 const retained=[['native_store_apply_effect','uuid,uuid,uuid,bigint,jsonb'],['native_store_assert_current_allocation','uuid,uuid'],['native_store_settlement_protocol','uuid,bigint']]
  .map(([name,signature])=>({name,signature,previousSha256:hash(body(definition(play,name)))}));
 const guards=[...replacements,...retained].map(r=>`do $guard$ begin if (select encode(sha256(convert_to(prosrc,'UTF8')),'hex') from pg_proc where oid='sandbox_commerce_v1.${r.name}(${r.signature})'::regprocedure) is distinct from '${r.previousSha256}' then raise exception 'r2_predecessor_function_drift:${r.name}';end if;end $guard$;`).join('\n');
 const privateFunctions=clones.map(sql=>{const match=sql.match(/create function ([^(]+)\(/iu);if(!match)throw Error('r2_private_function_parse');return match[1];});
 const lockdown=`do $lock$ declare f record;begin for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='sandbox_commerce_v1' and p.proname in (${privateFunctions.map(n=>`'${n.split('.')[1]}'`).join(',')}) loop
 execute format('revoke all on function %s from public,anon,authenticated,service_role,sbx_v1_operator,sbx_v1_r2_gateway,sbx_v1_r2_scanner',f.signature);end loop;end $lock$;`;
 const sql=[`-- Studio predecessor; all money and provider controls remain unchanged.\n${guards}`,read('isolated-runtime/native-paid-video-r2-v1/identity.sql'),
  'set local role sbx_v1_core_owner;',...clones,...replacements.map(r=>r.sql),'reset role;',read('isolated-runtime/native-paid-video-r2-v1/gateway.sql'),read('isolated-runtime/native-paid-video-r2-v1/scanner.sql'),
  'set local role sbx_v1_core_owner;',lockdown,'reset role;'].join('\n');
 return {protocol:'native-paid-video-r2-forward-source-v1',sql,sourceSha256:hash(sql),predecessors:pins,replacements:replacements.map(({sql,...r})=>r),retained,defaultOff:true};
}
