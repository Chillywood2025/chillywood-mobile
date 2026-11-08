#!/usr/bin/env node
// Actual source SQL/account/session/media logic + HTTP handler, synthetic local
// Auth/provider/media facts only. No remote account, provider or purchase call.
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {fileURLToPath} from 'node:url';import {createRequire} from 'node:module';
import {spawnSync,spawn} from 'node:child_process';import {randomUUID,webcrypto} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';import process from 'node:process';
globalThis.crypto??=webcrypto;
assert.equal(process.argv[2],'--local-bin');assert.equal(process.argv.length,4);const bin=process.argv[3];assert.ok(path.isAbsolute(bin));
const here=path.dirname(fileURLToPath(import.meta.url)),runtime=path.resolve(here,'../sandbox-commerce-v1'),root=path.resolve(here,'../..');
const source=name=>fs.readFileSync(path.join(runtime,name),'utf8');
const declaration='create table sandbox_commerce_v1.declarations(user_id uuid primary key,session_id uuid,\n declared_18_plus boolean,country_code text,region_code text,declaration_version text,updated_at timestamptz);';
const authority=source('tests/authority.fixture.sql');assert.equal(authority.split(declaration).length,2);
const files=['premium-authority.sql','authority.sql','commands.sql','receipts.sql','test-store.sql','test-store-offerings-core.sql',
 'test-store-qualification.sql','test-store-offerings-provisioning.sql','test-store-offerings-commands.sql','test-store-offerings-receipts.sql',
 'history.sql','resource-graphs.sql','delivery-authority.sql','paid-video-media.sql','paid-video-upload.sql','paid-video-commands.sql',
 'test-store-paid-video-core.sql','test-store-paid-video-commands.sql','test-store-paid-video-provisioning.sql','test-store-paid-video-receipts.sql','paid-video-access.sql'];
const install='begin;create role anon nologin;create role authenticated nologin;create role service_role nologin;'
 +'alter default privileges for role postgres grant execute on functions to authenticated;'+source('core.sql')
 +source('tests/premium-authority.fixture.sql')+authority.replace(declaration,'-- declarations supplied by real core')
 +'create table public.channel_audience_blocks(channel_user_id text,blocked_user_id text);'+files.map(source).join('\n')
 +fs.readFileSync(path.join(here,'quote.sql'),'utf8')+source('permissions-finalize.sql')+'commit;';
const work=fs.mkdtempSync(path.join(os.tmpdir(),'native-store-quote-')),data=path.join(work,'data'),port='55490',db='quote_'+randomUUID().replaceAll('-','');
const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>!key.startsWith('PG')));
const args=database=>['-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p',port,'-U','postgres','-d',database];
const run=(tool,argv,input)=>spawnSync(path.join(bin,tool),argv,{input,encoding:'utf8',env,timeout:30000,maxBuffer:8*1024*1024});
const invoke=(tool,argv,input)=>{const r=run(tool,argv,input);assert.equal(r.status,0,r.stderr||r.error?.message);return r.stdout.trim();};
const q=sql=>invoke('psql',args(db),sql),literal=v=>"'"+String(v).replaceAll("'","''")+"'",json=v=>literal(JSON.stringify(v))+'::jsonb';
const rejects=(sql,pattern)=>{const r=run('psql',args(db),sql);assert.notEqual(r.status,0,'expected rejection');assert.match(r.stderr,pattern);};
const seller='11111111-1111-4111-8111-111111111111',sellerSession='22222222-2222-4222-8222-222222222222';
const buyer='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',session='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const actor={userId:buyer,accountId:buyer,sessionGeneration:session};
const service="set role service_role;set request.jwt.claims='{\"role\":\"service_role\"}';";
const expression=(command,payload,requestId=randomUUID(),who=actor)=>`public.native_store_sandbox_command_v1('${who.userId}','${who.sessionGeneration}',${literal(command)},'${requestId}',${json(payload)})`;
const call=(command,payload,requestId,who)=>JSON.parse(q(service+'select '+expression(command,payload,requestId,who)+';'));
const ts=createRequire(import.meta.url)('typescript');
const compiled=ts.transpileModule(fs.readFileSync(path.join(root,'supabase/functions/_shared/native-store-sandbox-command-v1.ts'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}});
const api={};new Function('exports',compiled.outputText)(api);
const handler=api.createNativeStoreSandboxCommandHandlerV1({authenticate:async()=>actor,execute:async({actor:a,request:r})=>call(r.command,r.payload,r.requestId,a)});
const http=async(command,payload,requestId=randomUUID())=>{const body={protocol:'native-store-sandbox-command-v1',command,requestId,payload};
 const response=await handler(new Request('https://local.invalid',{method:'POST',body:JSON.stringify(body)}));
 assert.equal(response.status,200,await response.clone().text());return response.json();};
let started=false,cases=0;const children=[];
try{
 assert.match(invoke('postgres',['--version']),/PostgreSQL\) 17\.6/u);
 invoke('initdb',['-D',data,'-U','postgres','--encoding=UTF8','--no-locale','--auth=trust']);
 invoke('pg_ctl',['-D',data,'-w','-t','15','-l',path.join(work,'server.log'),'-o',`-c listen_addresses=127.0.0.1 -c unix_socket_directories='' -p ${port} -c autovacuum=off`,'start']);started=true;
 invoke('psql',args('postgres'),`create database ${db};`);q(install);
 q(`select authority_fixture.reset();insert into auth.users(id,email_confirmed_at,raw_app_meta_data) values('${buyer}',clock_timestamp(),'{}');
 insert into auth.sessions values('${session}','${buyer}',clock_timestamp()+interval '1 hour');
 insert into public.wave1_legal_acceptances select '${buyer}','${session}',document_key,version,market,capability,'member',null from public.wave1_legal_document_versions where capability='account';
 update sandbox_commerce_v1.lifecycle set state='active';`);
 const resource=randomUUID(),asset=randomUUID(),offer=randomUUID(),catalog=randomUUID(),route=randomUUID(),incarnation=randomUUID(),binding=randomUUID();
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
 const payload={offerId:'scv1_offer_'+offer,store:'APP_STORE'};
 assert.equal((await http('offer',payload)).status,'held');cases++;
 const nativeCatalog={protocol:'native-store-sandbox-catalog-v1',bindingId:'nssv1_catalog_'+binding,revision:1,projectId:'synthetic-project',appId:'synthetic-app',store:'APP_STORE',environment:'SANDBOX',wireProductId:'synthetic-native-product',productType:'one_time',basePlanId:null,
 resourceId:'scv1_resource_'+resource,resourceRevision:1,creatorId:seller,amountMinor:199,currency:'usd',quantity:1,
 asset:{id:'scv1_asset_'+asset,incarnation,sha256:'a'.repeat(64),byteLength:100,resourceRevision:1,profile:'scpv-mp4-h264-aac-v1'}};
 q(`insert into sandbox_commerce_v1.native_store_catalog_bindings values('${binding}',1,'${offer}',1,'APP_STORE',${json(nativeCatalog)});`);
 const quote=(await http('offer',payload)).data.quote;assert.equal(quote.resourceId,nativeCatalog.resourceId);assert.equal(quote.catalog.wireProductId,nativeCatalog.wireProductId);cases++;
 const preparePayload={...payload,expectedQuote:quote};assert.equal((await http('prepare',preparePayload)).status,'held');cases++;
 q('update sandbox_commerce_v1.native_store_quote_controls set preparation_enabled=true;');
 const requestId=randomUUID(),prepared=await http('prepare',preparePayload,requestId);assert.equal(prepared.dispatchAllowed,false);
 assert.equal(prepared.correlation,'unsupported');assert.deepEqual(prepared.data.selection.quote,quote);
 assert.deepEqual((await http('prepare',preparePayload,requestId)).data.selection,prepared.data.selection);cases++;
 assert.deepEqual((await http('recover',{originalRequestId:requestId})).data.selection,prepared.data.selection);
 assert.equal((await http('recover',{originalRequestId:randomUUID()})).status,'unknown');cases++;
 rejects(service+'select '+expression('prepare',{...preparePayload,expectedQuote:{...quote,amountMinor:299}},requestId)+';',/native_store_quote_idempotency_conflict/u);
 rejects(service+'select '+expression('prepare',{...preparePayload,expectedQuote:{...quote,amountMinor:299}})+';',/native_store_quote_changed/u);cases++;
 for(const patch of [{projectId:' bad'},{appId:'bad\tvalue'},{wireProductId:'\u00a0bad'},
  {wireProductId:'😀'.repeat(257)},{revision:9007199254740992}]){
  const invalidBinding=randomUUID(),changed={...nativeCatalog,...patch,bindingId:'nssv1_catalog_'+invalidBinding};
  rejects(`begin;insert into sandbox_commerce_v1.native_store_catalog_retirements values('${binding}',1,'synthetic-rollback-retire');
   insert into sandbox_commerce_v1.native_store_catalog_bindings values('${invalidBinding}',${changed.revision},'${offer}',1,'APP_STORE',${json(changed)});`
   +service+'select '+expression('prepare',preparePayload)+';commit;',/native_store_catalog_mismatch/u);
 }
 assert.equal(q('select count(*) from sandbox_commerce_v1.native_store_selections;'),'1');cases++;
 const retired=JSON.parse(q(`begin;insert into sandbox_commerce_v1.native_store_catalog_retirements values('${binding}',1,'synthetic-retire');`+service+'select '+expression('offer',payload)+';rollback;'));
 assert.equal(retired.status,'held');
 q('update sandbox_commerce_v1.native_store_quote_controls set preparation_enabled=false;');
 assert.equal((await http('prepare',preparePayload)).status,'held');
 assert.deepEqual((await http('recover',{originalRequestId:requestId})).data.selection,prepared.data.selection);
 q('update sandbox_commerce_v1.native_store_quote_controls set preparation_enabled=true;');cases++;
 for(const role of ['anon','authenticated']){
  rejects(`set role ${role};select ${expression('offer',payload)};`,/permission denied/u);
  rejects(`set role ${role};select * from sandbox_commerce_v1.native_store_selections;`,/permission denied/u);
 }
 rejects('set role service_role;select * from sandbox_commerce_v1.native_store_selections;',/permission denied/u);cases++;
 rejects(service+'select '+expression('prepare',preparePayload,randomUUID(),{userId:seller,sessionGeneration:sellerSession})+';',/native_store_offer_unavailable/u);cases++;
 q(`update auth.sessions set not_after=clock_timestamp()-interval '1 second' where id='${session}';`);
 rejects(service+'select '+expression('offer',payload)+';',/sandbox_.*required/u);
 q(`update auth.sessions set not_after=clock_timestamp()+interval '1 hour' where id='${session}';`);cases++;
 q(`update sandbox_commerce_v1.delivery_assets set moderation='held' where id='${asset}';`);
 rejects(service+'select '+expression('prepare',preparePayload)+';',/sandbox_immutable_clean_asset_required/u);
 assert.deepEqual((await http('recover',{originalRequestId:requestId})).data.selection,prepared.data.selection);
 q(`update sandbox_commerce_v1.delivery_assets set moderation='clear' where id='${asset}';`);cases++;
 q(`update sandbox_commerce_v1.paid_video_routes set active=false where id='${route}';`);
 rejects(service+'select '+expression('offer',payload)+';',/test_store_v3_current_media_required/u);
 q(`update sandbox_commerce_v1.paid_video_routes set active=true where id='${route}';`);cases++;
 const other=randomUUID(),otherSession=randomUUID();q(`insert into auth.users(id,email_confirmed_at,raw_app_meta_data) values('${other}',clock_timestamp(),'{}');insert into auth.sessions values('${otherSession}','${other}',clock_timestamp()+interval '1 hour');
 insert into public.wave1_legal_acceptances select '${other}','${otherSession}',document_key,version,market,capability,'member',null from public.wave1_legal_document_versions where capability='account';`);
 assert.equal(call('recover',{originalRequestId:requestId},randomUUID(),{userId:other,sessionGeneration:otherSession}).status,'unknown');cases++;
 const newSession=randomUUID();q(`insert into auth.sessions values('${newSession}','${buyer}',clock_timestamp()+interval '1 hour');insert into public.wave1_legal_acceptances select '${buyer}','${newSession}',document_key,version,market,capability,'member',null from public.wave1_legal_document_versions where capability='account';`);
 const newActor={userId:buyer,sessionGeneration:newSession};assert.deepEqual(call('recover',{originalRequestId:requestId},randomUUID(),newActor).data.selection,prepared.data.selection);
 rejects(service+'select '+expression('prepare',preparePayload,requestId,newActor)+';',/native_store_quote_idempotency_conflict/u);cases++;
 let out='',err='';const child=spawn(path.join(bin,'psql'),args(db),{env,stdio:['pipe','pipe','pipe']});children.push(child);
 child.stdout.on('data',v=>out+=v);child.stderr.on('data',v=>err+=v);const done=new Promise(resolve=>child.once('exit',resolve));
 const raceId=randomUUID();child.stdin.write('begin;'+service+'select '+expression('prepare',preparePayload,raceId)+";select 'quote_ready';\n");
 const until=Date.now()+3000;while(!out.includes('quote_ready')&&Date.now()<until)await delay(10);assert.ok(out.includes('quote_ready'),err);
 rejects(service+'select '+expression('prepare',preparePayload,raceId)+';',/native_store_quote_busy/u);
 child.stdin.end('commit;\n');assert.equal(await done,0,err);assert.equal(call('prepare',preparePayload,raceId).data.selection.originalRequestId,raceId);cases++;
 // Exercise the real normal-app client and strict parser against actual SQL
 // responses through the real Edge handler. Only local auth/storage/transport
 // adapters are synthetic; no handwritten response replaces a database result.
 const authority={...actor,state:'ACTIVE',restoreOnly:false},memory=new Map(),clientApi={};
 const storage={getItem:async key=>memory.get(key)??null,setItem:async(key,value)=>{memory.set(key,value);}};
 const clientBindings={'@react-native-async-storage/async-storage':storage,'react-native-get-random-values':{},
  './accountSessionAuthority':{getCurrentAccountSessionAuthoritySnapshot:()=>authority,
   sameAccountSessionAuthority:(a,b)=>!!a&&!!b&&['userId','accountId','sessionGeneration','state','restoreOnly'].every(k=>a[k]===b[k]),subscribeToAccountSessionAuthority:()=>()=>{}},
  './accountBoundSupabaseMutation':{captureAccountBoundSupabaseMutationSubject:async()=>({authority,accessToken:'synthetic-local-auth'})},
  './supabase':{SUPABASE_URL:'https://local.invalid',SUPABASE_ANON_KEY:'synthetic-local-public'}};
 const clientSource=ts.transpileModule(fs.readFileSync(path.join(root,'_lib/nativeStoreSandboxQuote.ts'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 new Function('exports','require','fetch',clientSource)(clientApi,name=>{assert.ok(Object.hasOwn(clientBindings,name));return clientBindings[name];},async(url,options)=>handler(new Request(url,options)));
 const client=await clientApi.captureNativeSandboxQuoteClient(authority,payload.offerId,payload.store,{storage});
 try{
  const actualQuote=await client.offer();assert.deepEqual(actualQuote.data.quote,quote);
  const actualPrepared=await client.prepare(actualQuote.data.quote),actualRecovered=await client.recover();
  assert.deepEqual(actualRecovered.data.selection,actualPrepared.data.selection);assert.equal(memory.size,1);
  await assert.rejects(client.prepare(quote),e=>e.code==='saved_selection_requires_recovery');
 }finally{client.dispose();}cases++;
 q(`update sandbox_commerce_v1.offers set revision=2 where id='${offer}';`);
 assert.equal((await http('offer',payload)).status,'held');cases++;
 assert.equal(q('select count(*) from sandbox_commerce_v1.intents;'),'0');assert.equal(q('select count(*) from sandbox_commerce_v1.resource_grants;'),'0');cases++;
 console.log(JSON.stringify({protocol:'native-store-normal-quote-proof-v1',cases,passed:cases,providerQualified:false,dispatchAllowed:false}));
}finally{
 for(const child of children)if(child.exitCode===null)child.kill('SIGTERM');
 if(started)invoke('pg_ctl',['-D',data,'-m','immediate','-w','stop']);fs.rmSync(work,{recursive:true,force:true});
}
