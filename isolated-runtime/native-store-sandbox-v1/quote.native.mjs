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
 +fs.readFileSync(path.join(here,'quote.sql'),'utf8')+fs.readFileSync(path.join(here,'claim.sql'),'utf8')+source('permissions-finalize.sql')+'commit;';
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
 let clientClaim;
 try{
  const actualQuote=await client.offer();assert.deepEqual(actualQuote.data.quote,quote);
  const actualPrepared=await client.prepare(actualQuote.data.quote),actualRecovered=await client.recover();
  assert.deepEqual(actualRecovered.data.selection,actualPrepared.data.selection);assert.equal(memory.size,1);
  await assert.rejects(client.prepare(quote),e=>e.code==='saved_selection_requires_recovery');
  clientClaim=await client.captureCallback(actualPrepared.data.selection.id,{productIdentifier:nativeCatalog.wireProductId,
   transaction:{productIdentifier:nativeCatalog.wireProductId,transactionIdentifier:'synthetic-client-callback',purchaseToken:'synthetic-secret-token',originalJson:'synthetic-private-receipt',signature:'synthetic-private-signature'},customerInfo:{private:'synthetic-private-customer'}});
  assert.equal(clientClaim.data.claim.evidence,'client_assertion');assert.equal(clientClaim.data.claim.settlementAllowed,false);
  assert.equal(clientClaim.dispatchAllowed,false);assert.equal(clientClaim.correlation,'unsupported');
  assert.deepEqual((await client.recoverClaim()).data.claim,clientClaim.data.claim);assert.equal(memory.size,2);
  for(const secret of ['synthetic-secret-token','synthetic-private-receipt','synthetic-private-signature','synthetic-private-customer'])assert.equal([...memory.values()].join('').includes(secret),false);
  await assert.rejects(client.captureCallback(actualPrepared.data.selection.id,{productIdentifier:nativeCatalog.wireProductId,transaction:{productIdentifier:nativeCatalog.wireProductId,transactionIdentifier:'synthetic-client-callback'}}),e=>e.code==='saved_selection_requires_recovery');
 }finally{client.dispose();}cases++;
 const restartedClient=await clientApi.captureNativeSandboxQuoteClient(authority,payload.offerId,payload.store,{storage});
 try{assert.deepEqual((await restartedClient.recoverClaim()).data.claim,clientClaim.data.claim);}
 finally{restartedClient.dispose();}cases++;
 // Both sides of an uncertain claim write, through the actual client after a
 // same-account session change. Retry sends only the persisted assertion.
 for(const committed of [false,true]){
  const savedMemory=new Map(),savedStorage={getItem:async key=>savedMemory.get(key)??null,setItem:async(key,value)=>{savedMemory.set(key,value);}};
  let liveAuthority={...authority},dropClaim=true;const retryApi={};let assertionSends=0;
  const retryBindings={...clientBindings,'./accountSessionAuthority':{...clientBindings['./accountSessionAuthority'],getCurrentAccountSessionAuthoritySnapshot:()=>liveAuthority},
   './accountBoundSupabaseMutation':{captureAccountBoundSupabaseMutationSubject:async()=>({authority:liveAuthority,accessToken:'synthetic-local-auth'})}};
  const retryHandler=api.createNativeStoreSandboxCommandHandlerV1({authenticate:async()=>({userId:liveAuthority.userId,accountId:liveAuthority.accountId,sessionGeneration:liveAuthority.sessionGeneration}),execute:async({actor:a,request:r})=>call(r.command,r.payload,r.requestId,a)});
  new Function('exports','require','fetch',clientSource)(retryApi,name=>{assert.ok(Object.hasOwn(retryBindings,name));return retryBindings[name];},async(url,options)=>{
   const command=JSON.parse(options.body).command;
   if(command==='claim'){assertionSends++;if(dropClaim){if(committed)await retryHandler(new Request(url,options));throw Error('synthetic interrupted transport');}}
   return retryHandler(new Request(url,options));
  });
  const before=await retryApi.captureNativeSandboxQuoteClient(liveAuthority,payload.offerId,payload.store,{storage:savedStorage});
  try{
   const selection=(await before.prepare((await before.offer()).data.quote)).data.selection;
   await assert.rejects(before.captureCallback(selection.id,{productIdentifier:nativeCatalog.wireProductId,transaction:{productIdentifier:nativeCatalog.wireProductId,transactionIdentifier:'synthetic-unknown-'+committed}}),e=>e.code==='outcome_unknown');
  }finally{before.dispose();}
  liveAuthority={...authority,sessionGeneration:newSession};dropClaim=false;
  const after=await retryApi.captureNativeSandboxQuoteClient(liveAuthority,payload.offerId,payload.store,{storage:savedStorage});
  try{
   const recovered=await after.recoverClaim();assert.equal(recovered.status,committed?'ok':'unknown');
   const retry=await after.retrySavedClaim();assert.equal(retry.data.claim.originalSessionGeneration,committed?session:newSession);
   assert.equal(retry.actor.sessionGeneration,newSession);assert.equal(retry.dispatchAllowed,false);assert.equal(retry.data.claim.settlementAllowed,false);
   assert.deepEqual((await after.retrySavedClaim()).data.claim,retry.data.claim);
   assert.deepEqual((await after.recoverClaim()).data.claim,retry.data.claim);assert.equal(assertionSends,3);
  }finally{after.dispose();}cases++;
 }
 // Assertions capture uncertainty; they cannot reserve/allocate any purchase.
 const priorClaimCount=Number(q('select count(*) from sandbox_commerce_v1.native_store_claims;'));
 const claimPayload={selectionId:prepared.data.selection.id,transactionIdentifier:'synthetic-transaction',productIdentifier:nativeCatalog.wireProductId},claimRequest=randomUUID();
 assert.equal((await http('claim-recover',{selectionId:claimPayload.selectionId})).status,'unknown');
 const claimed=await http('claim',claimPayload,claimRequest);assert.equal(claimed.data.claim.evidence,'client_assertion');
 assert.equal(claimed.data.claim.settlementAllowed,false);assert.deepEqual((await http('claim',claimPayload,claimRequest)).data.claim,claimed.data.claim);
 assert.deepEqual((await http('claim-recover',{selectionId:claimPayload.selectionId})).data.claim,claimed.data.claim);cases++;
 rejects(service+'select '+expression('claim',{...claimPayload,transactionIdentifier:'different'},claimRequest)+';',/native_store_claim_conflict/u);
 rejects(service+'select '+expression('claim',claimPayload,randomUUID())+';',/native_store_claim_conflict/u);
 assert.deepEqual(call('claim-recover',{selectionId:claimPayload.selectionId},randomUUID(),newActor).data.claim,claimed.data.claim);
 assert.deepEqual(call('claim',claimPayload,claimRequest,newActor).data.claim,claimed.data.claim);cases++;
 const another=(await http('prepare',preparePayload)).data.selection;
 rejects(service+'select '+expression('claim',{...claimPayload,selectionId:another.id,productIdentifier:'wrong'})+';',/native_store_claim_product_mismatch/u);
 for(const transactionIdentifier of [' bad','bad\tvalue','\u00a0bad','😀'.repeat(257)])rejects(service+'select '+expression('claim',{...claimPayload,selectionId:another.id,transactionIdentifier})+';',/native_store_claim_invalid/u);
 assert.equal(Number(q('select count(*) from sandbox_commerce_v1.native_store_claims;')),priorClaimCount+1);cases++;
 const historicalSelection=(await http('prepare',preparePayload)).data.selection;
 const historical=call('claim',{...claimPayload,selectionId:historicalSelection.id},randomUUID(),newActor);
 assert.equal(historical.data.claim.originalSessionGeneration,newSession);assert.equal(historical.dispatchAllowed,false);assert.equal(historical.data.claim.settlementAllowed,false);cases++;
 // A different account's fabricated same-ID assertion does not squat the ID,
 // and neither account may recover/read the other account's assertion.
 const otherActor={userId:other,sessionGeneration:otherSession};
 assert.equal(call('claim-recover',{selectionId:claimPayload.selectionId},randomUUID(),otherActor).status,'unknown');
 rejects(service+'select '+expression('claim',claimPayload,randomUUID(),otherActor)+';',/native_store_selection_unavailable/u);
 const otherSelection=call('prepare',preparePayload,randomUUID(),otherActor).data.selection;
 const otherClaim=call('claim',{...claimPayload,selectionId:otherSelection.id},randomUUID(),otherActor).data.claim;
 const rightfulAgain=await http('claim',{...claimPayload,selectionId:another.id});
 assert.notEqual(otherClaim.id,rightfulAgain.data.claim.id);assert.equal(rightfulAgain.data.claim.settlementAllowed,false);cases++;
 const readClaim=id=>JSON.parse(q(service+`select public.native_store_sandbox_claim_read_v1('${id.slice('nssv1_claim_'.length)}');`));
 const retained=readClaim(claimed.data.claim.id);assert.deepEqual(retained.quote,quote);assert.equal(retained.buyerId,buyer);assert.deepEqual(retained.claim,claimed.data.claim);
 assert.equal(readClaim(historical.data.claim.id).selectionSessionGeneration,session);
 for(const role of ['anon','authenticated']){
  rejects(`set role ${role};select public.native_store_sandbox_claim_read_v1('${randomUUID()}');`,/permission denied/u);
  rejects(`set role ${role};select ${expression('claim',claimPayload)};`,/permission denied/u);
 }
 rejects('set role service_role;select * from sandbox_commerce_v1.native_store_claims;',/permission denied/u);
 rejects(`update sandbox_commerce_v1.native_store_claims set transaction_identifier='changed';`,/native_store_quote_immutable/u);cases++;
 q(`update auth.sessions set not_after=clock_timestamp()-interval '1 second' where id='${session}';`);
 rejects(service+'select '+expression('claim-recover',{selectionId:claimPayload.selectionId})+';',/sandbox_.*required/u);
 q(`update auth.sessions set not_after=clock_timestamp()+interval '1 hour' where id='${session}';`);cases++;
 // Actual persisted claim -> real authenticated envelope -> original decrypt
 // and comparison. Provider bytes/config here are explicitly synthetic.
 const modules=new Map();function load(name){if(modules.has(name))return modules.get(name);const result={};modules.set(name,result);
  new Function('exports','require',ts.transpileModule(fs.readFileSync(path.join(root,'supabase/functions/_shared',name),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(result,s=>load(s.replace(/^\.\//u,'')));return result;}
 const conf={bridgeProtocol:'native-store-sandbox-v1',connectionId:randomUUID(),connectionRevision:1,projectId:nativeCatalog.projectId,appId:nativeCatalog.appId,store:'APP_STORE',environment:'SANDBOX',
  authentication:{method:'shared_secret',keyVersion:'synthetic-v1',secret:'synthetic-not-a-real-secret-'.repeat(2)},encryption:{keyId:'synthetic-key',key:new Uint8Array(32).fill(17)}};
 const envelope=(await load('native-store-sandbox-bridge-v1.ts').prepareNativeStoreSandboxIntakeV1(new Request('https://local.invalid',{method:'POST',headers:{authorization:conf.authentication.secret},body:JSON.stringify({api_version:'1.0',event:{id:'synthetic-event',type:'NON_RENEWING_PURCHASE',app_id:conf.appId,store:conf.store,environment:'SANDBOX',app_user_id:buyer,original_app_user_id:buyer,transaction_id:claimPayload.transactionIdentifier,original_transaction_id:claimPayload.transactionIdentifier,product_id:claimPayload.productIdentifier,event_timestamp_ms:1794139200000}})}),conf)).envelope;
 const row={id:randomUUID(),project_id:conf.projectId,connection_id:conf.connectionId,connection_revision:1,raw_sha256:envelope.rawSha256,raw_byte_length:envelope.rawByteLength,envelope};
 const reconcile=load('native-store-sandbox-reconcile-v1.ts').reconcileNativeStoreSandboxClaimV1;
 const match=await reconcile(retained,row,conf,false);assert.equal(match.oneTimeCandidate,true);assert.equal(match.settlementAllowed,false);
 const squat=await reconcile(readClaim(otherClaim.id),row,conf,false);assert.equal(squat.oneTimeCandidate,false);assert.ok(squat.reasons.includes('buyer_mismatch'));
 assert.equal((await reconcile(readClaim(rightfulAgain.data.claim.id),row,conf,false)).settlementAllowed,false);cases++;
 // Claim retries are nonwaiting and exactly recoverable after commit.
 const raceSelection=(await http('prepare',preparePayload)).data.selection,raceClaimId=randomUUID(),racePayload={...claimPayload,selectionId:raceSelection.id};
 let claimOut='',claimErr='';const claimant=spawn(path.join(bin,'psql'),args(db),{env,stdio:['pipe','pipe','pipe']});children.push(claimant);
 claimant.stdout.on('data',v=>claimOut+=v);claimant.stderr.on('data',v=>claimErr+=v);const claimDone=new Promise(resolve=>claimant.once('exit',resolve));
 claimant.stdin.write('begin;'+service+'select '+expression('claim',racePayload,raceClaimId)+";select 'claim_ready';\n");
 const claimUntil=Date.now()+3000;while(!claimOut.includes('claim_ready')&&Date.now()<claimUntil)await delay(10);assert.ok(claimOut.includes('claim_ready'),claimErr);
 rejects(service+'select '+expression('claim',racePayload,raceClaimId)+';',/native_store_claim_busy/u);
 claimant.stdin.end('commit;\n');assert.equal(await claimDone,0,claimErr);assert.equal(call('claim',racePayload,raceClaimId).data.claim.originalRequestId,raceClaimId);cases++;
 q(`update sandbox_commerce_v1.offers set revision=2 where id='${offer}';`);
 assert.equal((await http('offer',payload)).status,'held');cases++;
 assert.equal(q('select count(*) from sandbox_commerce_v1.intents;'),'0');assert.equal(q('select count(*) from sandbox_commerce_v1.resource_grants;'),'0');cases++;
 console.log(JSON.stringify({protocol:'native-store-normal-quote-proof-v1',cases,passed:cases,providerQualified:false,dispatchAllowed:false}));
}finally{
 for(const child of children)if(child.exitCode===null)child.kill('SIGTERM');
 if(started)invoke('pg_ctl',['-D',data,'-m','immediate','-w','stop']);fs.rmSync(work,{recursive:true,force:true});
}
