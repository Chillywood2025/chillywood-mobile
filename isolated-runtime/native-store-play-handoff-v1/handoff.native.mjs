#!/usr/bin/env node
// Real PostgreSQL 17.6 and exact immutable 48-module base. Only external
// account/provider/media facts are synthetic. No hosted database/network work.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {spawnSync,spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {createServer} from 'node:net';
import {nativeStoreInstallProfile} from '../native-store-sandbox-v1/install-profile.mjs';

assert.ok([4,5].includes(process.argv.length));assert.equal(process.argv[2],'--local-bin');
const settlementProof=process.argv.length===5;
if(settlementProof)assert.equal(process.argv[4],'--settlement-proof');
const bin=process.argv[3];assert.ok(path.isAbsolute(bin));
const here=path.dirname(fileURLToPath(import.meta.url));
const runtime=path.resolve(here,'../sandbox-commerce-v1');
const source=name=>fs.readFileSync(path.join(runtime,name),'utf8');
const profile=nativeStoreInstallProfile();
const extension=fs.readFileSync(path.join(here,'handoff.sql'),'utf8');
const declaration='create table sandbox_commerce_v1.declarations(user_id uuid primary key,session_id uuid,\n declared_18_plus boolean,country_code text,region_code text,declaration_version text,updated_at timestamptz);';
const authoritySource=source('tests/authority.fixture.sql');assert.equal(authoritySource.split(declaration).length,2);
const externalFixtures='create role supabase_read_only_user login nosuperuser nocreaterole nocreatedb noreplication bypassrls;create role anon nologin;create role authenticated nologin;create role service_role nologin;'
 +source('tests/premium-authority.fixture.sql')+authoritySource.replace(declaration,'-- declarations supplied by real core')
 +'create table public.channel_audience_blocks(channel_user_id text,blocked_user_id text);';
const port=await new Promise((resolve,reject)=>{
 const server=createServer();server.once('error',reject);server.listen({host:'127.0.0.1',port:0,exclusive:true},()=>{
  const address=server.address();server.close(error=>error?reject(error):resolve(String(address.port)));
 });
});
const work=fs.mkdtempSync(path.join(os.tmpdir(),'play-handoff-')),data=path.join(work,'data'),db='handoff_'+randomUUID().replaceAll('-','');
const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>!key.startsWith('PG')));
const args=(database=db,user='fixture_admin')=>['-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p',port,'-U',user,'-d',database];
const run=(tool,argv,input)=>spawnSync(path.join(bin,tool),argv,{input,encoding:'utf8',env,timeout:30000,maxBuffer:8*1024*1024});
const invoke=(tool,argv,input)=>{const result=run(tool,argv,input);assert.equal(result.status,0,result.stderr||result.error?.message);return result.stdout.trim();};
const q=sql=>invoke('psql',args(),sql);
const literal=value=>"'"+String(value).replaceAll("'","''")+"'";
const json=value=>literal(JSON.stringify(value))+'::jsonb';
const rejected=(sql,pattern)=>{const result=run('psql',args(),sql);assert.notEqual(result.status,0,'expected SQL rejection');assert.match(result.stderr,pattern);};
const buyer=randomUUID(),session=randomUUID(),other=randomUUID(),otherSession=randomUUID(),newSession=randomUUID();
const seller='11111111-1111-4111-8111-111111111111';
const actor={userId:buyer,sessionGeneration:session},otherActor={userId:other,sessionGeneration:otherSession};
const service="set role service_role;set request.jwt.claims='{\"role\":\"service_role\"}';";
const rpc=(command,payload,request=randomUUID(),who=actor)=>{
 const name=command.startsWith('dispatch-')?'dispatch':command.startsWith('reserve')?'reservation':command==='cancel-preparation'?'terminal':'command';
 return `public.native_store_sandbox_${name}_v1('${who.userId}','${who.sessionGeneration}',${literal(command)},'${request}',${json(payload)})`;
};
const ts=createRequire(import.meta.url)('typescript'),modules=new Map();
function load(name){
 if(modules.has(name))return modules.get(name);
 const result={};modules.set(name,result);
 new Function('exports','require',ts.transpileModule(fs.readFileSync(path.resolve(here,'../../supabase/functions/_shared',name),'utf8'),
  {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(result,specifier=>load(specifier.replace(/^\.\//u,'')));
 return result;
}
const api=load('native-store-sandbox-command-v1.ts');
const call=(command,payload,request=randomUUID(),who=actor)=>{
 const result=JSON.parse(q(service+'select '+rpc(command,payload,request,who)+';'));
 if(command.startsWith('dispatch-'))assert.equal(api.validateNativeStoreSandboxResultV1(result,{...who,accountId:who.userId},
  {protocol:'native-store-sandbox-command-v1',command,requestId:request,payload}),true,JSON.stringify(result));
 return result;
};
const counts=()=>q('select (select count(*) from sandbox_commerce_v1.native_store_selections),(select count(*) from sandbox_commerce_v1.native_store_reservations),(select count(*) from sandbox_commerce_v1.native_store_dispatch_attempts),(select count(*) from sandbox_commerce_v1.native_store_play_handoff_attempts),(select count(*) from sandbox_commerce_v1.intents),(select count(*) from sandbox_commerce_v1.resource_grants);');
const children=[];const cases=[];let uncertain=false;
const test=async(name,body)=>{await body();cases.push(name);};
try{
 assert.match(invoke('postgres',['--version']),/PostgreSQL\) 17\.6/u);
 invoke('initdb',['-D',data,'-U','fixture_admin','--encoding=UTF8','--no-locale','--auth=trust']);
 const start=run('pg_ctl',['-D',data,'-w','-t','15','-l',path.join(work,'server.log'),'-o',`-c listen_addresses=127.0.0.1 -c unix_socket_directories='' -p ${port} -c autovacuum=off`,'start']);
 uncertain=!!start.error||start.status===null;assert.equal(start.status,0,start.stderr||start.error?.message);
 invoke('psql',args('postgres'),`create role postgres login createrole bypassrls nosuperuser nocreatedb noinherit;create database ${db} owner postgres;`);
 q(externalFixtures+`grant usage on schema auth to postgres;do $$declare t record;begin
  for t in select n.nspname,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in('auth','public') and c.relkind='r' loop
   execute format('grant select,maintain on table %I.%I to postgres',t.nspname,t.relname);
   execute format('alter table %I.%I enable row level security',t.nspname,t.relname);
   execute format('alter table %I.%I force row level security',t.nspname,t.relname);end loop;end$$;
   alter default privileges for role postgres grant execute on functions to authenticated;`);
 invoke('psql',args(db,'postgres'),profile.sql);
 const oldFunction=q("select pg_get_functiondef('sandbox_commerce_v1.native_store_dispatch_command(uuid,uuid,text,uuid,jsonb)'::regprocedure);");
 await test('forward extension installs under managed nonsuper owner and remains empty/default-off',()=>{
  invoke('psql',args(db,'postgres'),'begin;\n'+extension+'\ncommit;');
  assert.equal(q("select rolsuper,rolcreaterole,rolbypassrls from pg_roles where rolname='postgres';"),'f|t|t');
  assert.equal(q('select enabled,(select count(*) from sandbox_commerce_v1.native_store_play_handoff_setups),(select count(*) from sandbox_commerce_v1.native_store_play_enrollments) from sandbox_commerce_v1.native_store_play_handoff_control;'),'f|0|0');
  assert.equal(q("select pg_get_functiondef('sandbox_commerce_v1.native_store_dispatch_command(uuid,uuid,text,uuid,jsonb)'::regprocedure);"),oldFunction);
 });
 if(settlementProof)await test('settlement extension preserves existing OIDs and exact Apple compatibility bodies',()=>{
  const signatures=['native_store_settlement_protocol(uuid,bigint)','native_store_assert_current_allocation(uuid,uuid)',
   'native_store_apply_effect(uuid,uuid,uuid,bigint,jsonb)','native_store_effect_candidate(uuid)'];
  const originals=signatures.map(signature=>({signature,
   oid:q(`select 'sandbox_commerce_v1.${signature}'::regprocedure::oid;`),
   definition:q(`select pg_get_functiondef('sandbox_commerce_v1.${signature}'::regprocedure);`)}));
  invoke('psql',args(db,'postgres'),'begin;\n'+fs.readFileSync(path.join(here,'settlement.sql'),'utf8')+'\ncommit;');
  for(const original of originals){
   const name=original.signature.split('(')[0],compatibility=original.signature.replace('(','_pre_play_handoff(');
   assert.equal(q(`select 'sandbox_commerce_v1.${original.signature}'::regprocedure::oid;`),original.oid);
   const definition=q(`select pg_get_functiondef('sandbox_commerce_v1.${compatibility}'::regprocedure);`);
   assert.equal(definition.replace('FUNCTION sandbox_commerce_v1.'+name+'_pre_play_handoff(',
    'FUNCTION sandbox_commerce_v1.'+name+'('),original.definition);
  }
 });
 q(`select authority_fixture.reset();update sandbox_commerce_v1.lifecycle set state='active';
  insert into auth.users(id,email_confirmed_at,raw_app_meta_data) values('${buyer}',clock_timestamp(),'{}'),('${other}',clock_timestamp(),'{}');
  insert into auth.sessions values('${session}','${buyer}',clock_timestamp()+interval '1 hour'),('${newSession}','${buyer}',clock_timestamp()+interval '1 hour'),('${otherSession}','${other}',clock_timestamp()+interval '1 hour');
  insert into public.wave1_legal_acceptances select u,s,document_key,version,market,capability,'member',null
   from (values('${buyer}'::uuid,'${session}'),('${buyer}'::uuid,'${newSession}'),('${other}'::uuid,'${otherSession}')) a(u,s),public.wave1_legal_document_versions where capability='account';
  update sandbox_commerce_v1.native_store_quote_controls set preparation_enabled=true;`);
 const resource=randomUUID(),asset=randomUUID(),offer=randomUUID(),catalog=randomUUID(),route=randomUUID(),incarnation=randomUUID();
 const objectKey=`sandbox-commerce-v1/${seller}/scv1_resource_${resource}/scv1_asset_${asset}/${incarnation}.mp4`;
 q(`insert into sandbox_commerce_v1.resources(id,creator_id,kind,title,status) values('${resource}','${seller}','paid_content','Synthetic source media','published');
  insert into sandbox_commerce_v1.resource_versions(resource_id,revision,creator_id,kind,title,price_minor,currency) values('${resource}',1,'${seller}','paid_content','Synthetic source media',199,'usd');
  insert into sandbox_commerce_v1.catalog(id,kind,provider,scope_key,store,product_id,amount_minor,currency) values('${catalog}','paid_content','revenuecat','synthetic-existing-catalog','test_store','synthetic-product',199,'usd');
  insert into sandbox_commerce_v1.offers(id,resource_id,resource_revision,catalog_id) values('${offer}','${resource}',1,'${catalog}');
  insert into sandbox_commerce_v1.delivery_assets(id,resource_id,resource_revision,owner_id,purpose,provider,bucket,object_key,object_version,incarnation,sha256,byte_length,state,moderation)
   values('${asset}','${resource}',1,'${seller}','video','s3','synthetic-bucket',${literal(objectKey)},'synthetic-version','${incarnation}',repeat('a',64),100,'retained','clear');
  insert into sandbox_commerce_v1.delivery_asset_scans select id,incarnation,provider,bucket,object_key,object_version,sha256,byte_length,'clean','synthetic-scanner',clock_timestamp() from sandbox_commerce_v1.delivery_assets;
  insert into sandbox_commerce_v1.video_terms values('${resource}',1,'${asset}','paid');
  insert into sandbox_commerce_v1.paid_video_routes values('${route}','s3','synthetic-bucket',repeat('b',64),true);
  insert into sandbox_commerce_v1.paid_video_uploads(creator_id,resource_id,asset_id,incarnation,route_id,object_key,expected_sha256,expected_byte_length,state,object_version,moderation)
   values('${seller}','${resource}','${asset}','${incarnation}','${route}',${literal(objectKey)},repeat('a',64),100,'clean','synthetic-version','clear');`);
 const connection=randomUUID(),appleConnection=randomUUID();
 q(`insert into native_store_sandbox_v1.connections values('${connection}',1,'synthetic-project','synthetic-app','PLAY_STORE','SANDBOX','synthetic-v1','synthetic-key'),
  ('${appleConnection}',1,'synthetic-project','synthetic-app','APP_STORE','SANDBOX','synthetic-v1','synthetic-key');update native_store_sandbox_v1.control set enabled=true;`);
 const fresh=(who=actor,store='PLAY_STORE')=>{
  const binding=randomUUID(),freshOffer=randomUUID();
  const nativeCatalog={protocol:'native-store-sandbox-catalog-v1',bindingId:'nssv1_catalog_'+binding,revision:1,projectId:'synthetic-project',appId:'synthetic-app',store,environment:'SANDBOX',wireProductId:'synthetic-'+randomUUID(),productType:'one_time',basePlanId:null,
   resourceId:'scv1_resource_'+resource,resourceRevision:1,creatorId:seller,amountMinor:199,currency:'usd',quantity:1,
   asset:{id:'scv1_asset_'+asset,incarnation,sha256:'a'.repeat(64),byteLength:100,resourceRevision:1,profile:'scpv-mp4-h264-aac-v1'}};
  q(`insert into sandbox_commerce_v1.offers(id,resource_id,resource_revision,catalog_id) select '${freshOffer}',resource_id,resource_revision,catalog_id from sandbox_commerce_v1.offers where id='${offer}';
   insert into sandbox_commerce_v1.native_store_catalog_bindings values('${binding}',1,'${freshOffer}',1,${literal(store)},${json(nativeCatalog)});`);
  const payload={offerId:'scv1_offer_'+freshOffer,store},quote=call('offer',payload,undefined,who).data.quote;
  const selection=call('prepare',{...payload,expectedQuote:quote},undefined,who).data.selection;
  const reservation=call('reserve',{selectionId:selection.id},undefined,who).data.reservation;
  return {binding,nativeCatalog,quote,selection,reservation,who,payload};
 };
 const setup=(f,patch={})=>{
  const id=randomUUID(),v={binding:f.binding,catalogRevision:1,digest:f.quote.quoteDigest,connection,connectionRevision:1,platform:'android',build:'101',version:'1.0.0',sdk:'10.15.1',...patch};
  q(`insert into sandbox_commerce_v1.native_store_play_handoff_setups(id,revision,catalog_binding_id,catalog_revision,quote_digest,connection_id,connection_revision,protocol_evidence_sha256,platform,native_build,native_version,sdk_version)
   values('${id}',1,'${v.binding}',${v.catalogRevision},${literal(v.digest)},'${v.connection}',${v.connectionRevision},repeat('a',64),${literal(v.platform)},${literal(v.build)},${literal(v.version)},${literal(v.sdk)});`);return id;
 };
 const enroll=(f,patch={})=>{
  const id=patch.id??randomUUID(),setupId=patch.setup??setup(f,patch),revision=patch.revision??1;
  q(`insert into sandbox_commerce_v1.native_store_play_enrollments(id,revision,buyer_id,setup_id,setup_revision,account_evidence_sha256,expires_at)
   values('${id}',${revision},'${patch.buyer??f.who.userId}','${setupId}',1,repeat('b',64),${patch.expires??"clock_timestamp()+interval '1 hour'"});`);
  return {id,setupId,revision};
 };
 const payload=f=>({selectionId:f.selection.id,reservationId:f.reservation.id});
 const dispatch=(f,command='dispatch-consume',request=randomUUID(),who=f.who)=>call(command,command==='dispatch-qualification'?{selectionId:f.selection.id}:payload(f),request,who);
 const dispatchSQL=(f,command='dispatch-consume',request=randomUUID(),who=f.who)=>rpc(command,command==='dispatch-qualification'?{selectionId:f.selection.id}:payload(f),request,who);
 const revoke=e=>q(`insert into sandbox_commerce_v1.native_store_play_enrollment_revocations values('${e.id}',${e.revision},'synthetic revocation',clock_timestamp());`);
 const initial=fresh();enroll(initial);
 await test('default-off blocks fresh consume despite enrollment without changing retained rows',()=>{
  const before=counts();assert.equal(dispatch(initial).data.reason,'play_handoff_disabled');assert.equal(dispatch(initial,'dispatch-qualification').data.reason,'play_handoff_disabled');assert.equal(counts(),before);
 });
 q('update sandbox_commerce_v1.native_store_play_handoff_control set enabled=true;');
 await test('missing enrollment and legacy quote-wide Play license account cannot qualify',()=>{
  const f=fresh(),before=counts();assert.equal(dispatch(f).data.reason,'play_enrollment_unavailable');
  q(`insert into sandbox_commerce_v1.native_store_protocol_qualifications values('${randomUUID()}',1,'${f.binding}',1,${literal(f.quote.quoteDigest)},'${connection}',1,repeat('a',64),'android','101','1.0.0','irrelevant','10.15.1','play_license_account',repeat('b',64),clock_timestamp());`);
  assert.equal(dispatch(f).data.reason,'play_enrollment_unavailable');assert.equal(counts(),before);
 });
 await test('ordinary nonadmin accounts receive exact buyer/session-bound discovery and one committed consume',()=>{
  assert.equal(q(`select count(*) from public.user_profiles where user_id in('${buyer}','${other}');`),'0');
  for(const who of [actor,otherActor]){
   const f=fresh(who),e=enroll(f),before=counts(),discovery=dispatch(f,'dispatch-qualification');
   assert.equal(discovery.status,'ok');assert.equal(discovery.dispatchAllowed,false);assert.equal(counts(),before);
   assert.equal(discovery.data.qualification.buyerId,who.userId);assert.equal(discovery.data.qualification.sessionGeneration,who.sessionGeneration);
   assert.equal(discovery.data.qualification.id,'nssv1_play_qualification_'+e.id);assert.equal(discovery.data.qualification.automaticNoChargeProof,false);
   assert.equal(discovery.data.qualification.userStoreConfirmationRequired,true);assert.equal(discovery.data.qualification.signedAppVersion,undefined);
   assert.equal(discovery.data.qualification.nativeBuild,'101');assert.equal(discovery.data.qualification.nativeVersion,'1.0.0');assert.equal(discovery.data.qualification.sdkVersion,'10.15.1');
   const request=randomUUID(),first=dispatch(f,'dispatch-consume',request),after=counts();assert.equal(first.dispatchAllowed,true);assert.equal(first.data.newlyConsumed,true);assert.equal(first.data.attempt.dispatchAllowed,false);
   const retry=dispatch(f,'dispatch-consume',request),recovered=dispatch(f,'dispatch-recover',request);assert.equal(retry.dispatchAllowed,false);assert.equal(recovered.dispatchAllowed,false);
   assert.deepEqual(retry.data.qualification,first.data.qualification);assert.deepEqual(recovered.data.attempt,first.data.attempt);assert.equal(counts(),after);
  }
 });
 await test('wrong buyer or session and cross-account identifiers fail closed',()=>{
  const f=fresh();enroll(f,{buyer:other});const before=counts();assert.equal(dispatch(f).status,'held');
  assert.equal(dispatch(f,'dispatch-qualification',undefined,otherActor).status,'held');assert.equal(dispatch(f,'dispatch-recover',undefined,otherActor).status,'unknown');
  rejected(service+'select '+dispatchSQL(f,'dispatch-consume',randomUUID(),{userId:buyer,sessionGeneration:otherSession})+';',/sandbox_current_session_required/u);
  assert.equal(counts(),before);
 });
 await test('expired revoked duplicate and superseded revisions remain blocked',()=>{
  const expired=fresh();enroll(expired,{expires:"clock_timestamp()-interval '1 second'"});assert.equal(dispatch(expired).data.reason,'play_enrollment_expired');
  const revoked=fresh(),e=enroll(revoked);revoke(e);assert.equal(dispatch(revoked).status,'held');
  const duplicate=fresh();enroll(duplicate);enroll(duplicate);assert.equal(dispatch(duplicate).status,'held');
  const revisions=fresh(),old=enroll(revisions);enroll(revisions,{id:old.id,revision:2,setup:old.setupId});assert.equal(dispatch(revisions).status,'held');
  revoke(old);assert.equal(dispatch(revisions,'dispatch-qualification').data.qualification.revision,2);
  const retired=fresh(),retiredEnrollment=enroll(retired);q(`insert into sandbox_commerce_v1.native_store_play_setup_revocations values('${retiredEnrollment.setupId}',1,'synthetic',clock_timestamp());`);assert.equal(dispatch(retired).status,'held');
 });
 await test('malformed build wrong platform SDK catalog digest and connection fail closed',()=>{
  for(const patch of [{platform:'ios'},{sdk:'10.15.2'},{build:' 101'},{version:'1.0.0\n'}])assert.throws(()=>setup(initial,patch),/check constraint/u);
  const wrongDigest=fresh();enroll(wrongDigest,{digest:'d'.repeat(64)});assert.equal(dispatch(wrongDigest).status,'held');
  const wrongCatalog=fresh();enroll(wrongCatalog,{binding:initial.binding});assert.equal(dispatch(wrongCatalog).status,'held');
  for(const patch of [{connection:randomUUID()},{connection:appleConnection},{connectionRevision:2}]){const f=fresh();enroll(f,patch);assert.equal(dispatch(f).data.reason,'connection_unavailable');}
  const f=fresh();enroll(f);const before=counts();
  for(const change of ["update native_store_sandbox_v1.control set enabled=false;",`insert into native_store_sandbox_v1.revocations values('${connection}',1,'synthetic',clock_timestamp());`]){
   assert.equal(JSON.parse(q('begin;'+change+service+'select '+dispatchSQL(f)+';rollback;')).data.reason,'connection_unavailable');
  }assert.equal(counts(),before);
 });
 await test('recovery preserves original enrollment session after refresh expiry revocation and disablement',()=>{
  const f=fresh(),e=enroll(f),request=randomUUID(),first=dispatch(f,'dispatch-consume',request);revoke(e);
  const before=counts(),newActor={userId:buyer,sessionGeneration:newSession};
  const recovered=JSON.parse(q('begin;update sandbox_commerce_v1.native_store_play_handoff_control set enabled=false;'+service+'select '+dispatchSQL(f,'dispatch-recover',request,newActor)+';rollback;'));
  assert.equal(recovered.actor.sessionGeneration,newSession);assert.equal(recovered.data.qualification.sessionGeneration,session);
  assert.deepEqual(recovered.data.qualification,first.data.qualification);assert.equal(recovered.dispatchAllowed,false);assert.equal(counts(),before);
  const refreshedRetry=dispatch(f,'dispatch-consume',request,newActor);assert.equal(refreshedRetry.dispatchAllowed,false);assert.deepEqual(refreshedRetry.data.qualification,first.data.qualification);
  const oldSessionExpired=JSON.parse(q(`begin;update auth.sessions set not_after=clock_timestamp()-interval '1 second' where id='${session}';`+service+'select '+dispatchSQL(f,'dispatch-recover',request,newActor)+';rollback;'));
  assert.deepEqual(oldSessionExpired.data.qualification,first.data.qualification);assert.equal(oldSessionExpired.dispatchAllowed,false);assert.equal(counts(),before);
  rejected(service+'select '+dispatchSQL(f,'dispatch-consume',randomUUID())+';',/native_store_attempt_conflict/u);
 });
 await test('discovery on a new current session uses that session and unknown recovery is read-only',()=>{
  const f=fresh();enroll(f);const before=counts();
  assert.equal(dispatch(f,'dispatch-qualification',randomUUID(),{userId:buyer,sessionGeneration:newSession}).data.qualification.sessionGeneration,newSession);
  assert.equal(dispatch(f,'dispatch-recover').status,'unknown');assert.equal(counts(),before);
 });
 await test('unchanged account legal financial lifecycle and media controls still block consumption',()=>{
  const f=fresh();enroll(f);const before=counts();
  for(const change of [
   `update auth.users set deleted_at=clock_timestamp() where id='${buyer}';`,
   `update auth.users set banned_until=clock_timestamp()+interval '1 hour' where id='${buyer}';`,
   `update public.wave1_legal_acceptances set invalidated_at=clock_timestamp() where user_id='${buyer}';`,
   "update public.platform_money_kill_switches set state='on' where key='live_money_enabled';",
   "update sandbox_commerce_v1.lifecycle set state='disabled';",
   `update sandbox_commerce_v1.paid_video_routes set active=false where id='${route}';`,
   `update sandbox_commerce_v1.delivery_assets set moderation='held' where id='${asset}';`
  ])rejected('begin;'+change+service+'select '+dispatchSQL(f)+';commit;',/sandbox_|native_store_|test_store_/u);
  assert.equal(counts(),before);
  rejected(service+'select '+rpc('dispatch-qualification',{selectionId:f.selection.id,store:'PLAY_STORE'})+';',/native_store_dispatch_request_invalid/u);
 });
 await test('rollback/lost reply retry can consume only once after commit',()=>{
  const f=fresh();enroll(f);const request=randomUUID(),before=counts();
  q('begin;'+service+'select '+dispatchSQL(f,'dispatch-consume',request)+';rollback;');assert.equal(counts(),before);assert.equal(dispatch(f,'dispatch-recover',request).status,'unknown');
  q(service+'select '+dispatchSQL(f,'dispatch-consume',request)+';');assert.equal(dispatch(f,'dispatch-consume',request).dispatchAllowed,false);
 });
 await test('committed consumed/cancelled uncertainty never automatically releases reservation',()=>{
  const f=fresh();enroll(f);const request=randomUUID();dispatch(f,'dispatch-consume',request);
  const before=counts(),cancel=call('cancel-preparation',{selectionId:f.selection.id});assert.equal(cancel.status,'held');
  const another=call('prepare',{...f.payload,expectedQuote:f.quote}).data.selection;
  rejected(service+'select '+rpc('reserve',{selectionId:another.id})+';',/native_store_shared_sku_reserved/u);
  assert.equal(dispatch(f,'dispatch-recover',request).dispatchAllowed,false);assert.equal(counts().split('|').slice(1).join('|'),before.split('|').slice(1).join('|'));
 });
 await test('concurrent consume is fenced and concurrent revocation/default-off changes cannot cross commit',async()=>{
  const f=fresh(),e=enroll(f),request=randomUUID();let out='',err='';
  const child=spawn(path.join(bin,'psql'),args(),{env,stdio:['pipe','pipe','pipe']});children.push(child);
  child.stdout.on('data',value=>out+=value);child.stderr.on('data',value=>err+=value);const done=new Promise(resolve=>child.once('exit',resolve));
  child.stdin.write('begin;'+service+'select '+dispatchSQL(f,'dispatch-consume',request)+";select 'handoff_ready';\n");
  const until=Date.now()+3000;while(!out.includes('handoff_ready')&&Date.now()<until)await delay(10);assert.ok(out.includes('handoff_ready'),err);
  try{
   rejected(service+'select '+dispatchSQL(f,'dispatch-consume',request)+';',/native_store_fence_busy|native_store_attempt_busy/u);
   rejected(`begin;set lock_timeout='50ms';update sandbox_commerce_v1.native_store_play_handoff_control set enabled=false;commit;`,/lock timeout/u);
   rejected(`begin;set lock_timeout='50ms';insert into sandbox_commerce_v1.native_store_play_enrollment_revocations values('${e.id}',1,'synthetic',clock_timestamp());commit;`,/lock timeout/u);
  }finally{child.stdin.end('commit;\n');assert.equal(await done,0,err);}
  assert.equal(dispatch(f,'dispatch-consume',request).dispatchAllowed,false);
 });
 await test('routing rejects blocked relations and invalid contexts before unbounded access',async()=>{
  const f=fresh();enroll(f);let out='',err='';
  const child=spawn(path.join(bin,'psql'),args(),{env,stdio:['pipe','pipe','pipe']});children.push(child);
  child.stdout.on('data',value=>out+=value);child.stderr.on('data',value=>err+=value);const done=new Promise(resolve=>child.once('exit',resolve));
  child.stdin.write("begin;lock table sandbox_commerce_v1.native_store_selections in access exclusive mode;select 'route_lock_ready';\n");
  const until=Date.now()+3000;while(!out.includes('route_lock_ready')&&Date.now()<until)await delay(10);assert.ok(out.includes('route_lock_ready'),err);
  try{
   const started=Date.now();rejected(service+'select '+dispatchSQL(f,'dispatch-qualification')+';',/could not obtain lock on relation|lock timeout/u);
   assert.ok(Date.now()-started<2000,'routing relation lock must reject promptly');
  }finally{child.stdin.end('rollback;\n');assert.equal(await done,0,err);}
  for(const context of ["set local transaction_timeout='1s';",'set transaction isolation level repeatable read;'])
   rejected('begin;'+context+service+'select '+dispatchSQL(f,'dispatch-qualification')+';commit;',/sandbox_timeout_context_invalid/u);
  const bounded=q("begin;set local lock_timeout='10ms';"+service+'select '+dispatchSQL(f,'dispatch-qualification')+';show lock_timeout;commit;').split('\n');
  assert.equal(JSON.parse(bounded[0]).status,'ok');assert.equal(bounded[1],'10ms');
  assert.equal(dispatch(f,'dispatch-qualification').status,'ok');
 });
 await test('short-lived enrollment/session cannot outlive transaction budget even with immediate constraints',()=>{
  for(const immediate of [false,true]){
   const f=fresh();enroll(f,{expires:"clock_timestamp()+interval '1 second'"});const before=counts();
   const held=JSON.parse(q('begin;'+(immediate?'set constraints all immediate;':'')+service+'select '+dispatchSQL(f)+';commit;'));
   assert.equal(held.data.reason,'play_enrollment_expiring');assert.equal(counts(),before);
  }
  const f=fresh();enroll(f);const before=counts();
  rejected(`begin;update auth.sessions set not_after=clock_timestamp()+interval '1 second' where id='${session}';set constraints all immediate;`+service+'select '+dispatchSQL(f)+';commit;',/native_store_play_attempt_expiring/u);assert.equal(counts(),before);
  rejected('begin;set constraints all immediate;'+service+'select '+dispatchSQL(f)+";select pg_sleep(6);commit;",/transaction timeout/u);assert.equal(counts(),before);
 });
 await test('same-transaction disablement or revocation after consume is rejected at commit',()=>{
  for(const change of ['update sandbox_commerce_v1.native_store_play_handoff_control set enabled=false;',"update sandbox_commerce_v1.native_store_quote_controls set preparation_enabled=false;"]){
   const f=fresh();enroll(f);const before=counts();rejected('begin;'+service+'select '+dispatchSQL(f)+';reset role;'+change+'commit;',/native_store_play_attempt_qualification_changed/u);assert.equal(counts(),before);
  }
 });
 await test('private raw rows RLS and invocable surface exclude every app role',()=>{
  const tables=['native_store_play_handoff_control','native_store_play_handoff_setups','native_store_play_setup_revocations','native_store_play_enrollments','native_store_play_enrollment_revocations','native_store_play_handoff_attempts'];
  for(const table of tables){
   assert.equal(q(`select relrowsecurity,relforcerowsecurity from pg_class where oid='sandbox_commerce_v1.${table}'::regclass;`),'t|t');
   for(const role of ['anon','authenticated','service_role']){
    rejected(`set role ${role};select * from sandbox_commerce_v1.${table};`,/permission denied/u);
    rejected(`set role ${role};delete from sandbox_commerce_v1.${table};`,/permission denied/u);
   }
  }
  for(const role of ['anon','authenticated'])rejected(`set role ${role};select ${dispatchSQL(initial,'dispatch-qualification')};`,/permission denied/u);
  rejected('set role service_role;select '+dispatchSQL(initial,'dispatch-qualification')+';',/sandbox_provider_service_required/u);
  assert.equal(q("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='sandbox_commerce_v1' and p.proname like '%play%' and (has_function_privilege('anon',p.oid,'execute') or has_function_privilege('authenticated',p.oid,'execute') or has_function_privilege('service_role',p.oid,'execute'));"),'0');
 });
 await test('immutable enrollment/setup/attempt history cannot update delete or truncate',()=>{
  for(const table of ['native_store_play_handoff_setups','native_store_play_enrollments','native_store_play_handoff_attempts']){
   rejected(`update sandbox_commerce_v1.${table} set created_at=clock_timestamp();`,/native_store_quote_immutable/u);
   rejected(`delete from sandbox_commerce_v1.${table};`,/native_store_quote_immutable/u);
   rejected(`truncate sandbox_commerce_v1.${table} cascade;`,/native_store_quote_immutable/u);
  }
 });
 await test('Apple legacy path retains qualification/consume/recovery byte-for-byte',()=>{
  const f=fresh(actor,'APP_STORE'),id=randomUUID();
  q(`insert into sandbox_commerce_v1.native_store_protocol_qualifications values('${id}',1,'${f.binding}',1,${literal(f.quote.quoteDigest)},'${appleConnection}',1,repeat('a',64),'ios','101','1.0.0','100.7','10.15.1','testflight_distribution',repeat('b',64),clock_timestamp());`);
  const discovery=dispatch(f,'dispatch-qualification');assert.equal(discovery.status,'ok');assert.equal(discovery.data.qualification.id,'nssv1_qualification_'+id);
  const request=randomUUID(),first=dispatch(f,'dispatch-consume',request);assert.equal(first.dispatchAllowed,true);assert.equal(first.data.qualification.signedAppVersion,'100.7');
  assert.equal(dispatch(f,'dispatch-consume',request).dispatchAllowed,false);assert.deepEqual(dispatch(f,'dispatch-recover',request).data.qualification,first.data.qualification);
  assert.equal(q("select pg_get_functiondef('sandbox_commerce_v1.native_store_dispatch_command(uuid,uuid,text,uuid,jsonb)'::regprocedure);"),oldFunction);
 });
 assert.equal(q('select count(*) from sandbox_commerce_v1.intents;'),'0');assert.equal(q('select count(*) from sandbox_commerce_v1.resource_grants;'),'0');
 if(settlementProof){
  const {runPlaySettlementCases}=await import('./settlement.native-cases.mjs');
  await runPlaySettlementCases({q,call,rpc,run,args,bin,env,children,db,literal,json,actor,buyer,session,seller,other,otherSession,otherActor,newSession,
   fresh,setup,enroll,dispatch,dispatchSQL,payload,revoke,resource,asset,offer,catalog,route,incarnation,objectKey,connection,appleConnection,here,
   root:path.resolve(here,'../..'),counts,rejected,service});
 }
 console.log(JSON.stringify({protocol:'native-store-play-handoff-local-proof-v1',cases:cases.length,passed:cases.length,names:cases,postgres:'17.6',managedInstall:true,baseSourceDigest:profile.sourceDigest,
  syntheticFactsOnly:true,providerObserved:false,sdkInvoked:false,automaticNoChargeProof:false,productionInstalled:false,productionEnabled:false}));
}finally{
 for(const child of children)if(child.exitCode===null)child.kill('SIGTERM');
 const status=run('pg_ctl',['-D',data,'status']);
 if(status.status===0){const stopped=run('pg_ctl',['-D',data,'-m','immediate','-w','stop']);if(stopped.status===0)uncertain=false;else{uncertain=true;console.error('play_handoff_cleanup_failed: '+(stopped.stderr||stopped.error?.message));process.exitCode=1;}}
 if(uncertain||status.error||![0,3,4].includes(status.status)||fs.existsSync(path.join(data,'postmaster.pid'))){console.error('play_handoff_cluster_retained: '+work);process.exitCode=1;}
 else fs.rmSync(work,{recursive:true,force:true});
}
