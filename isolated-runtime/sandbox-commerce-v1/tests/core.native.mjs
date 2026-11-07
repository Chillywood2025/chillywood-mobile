#!/usr/bin/env node
// Actual install/command SQL on disposable minimum-schema fixtures. No remote
// database argument, provider request, Supabase bootstrap or deployment claim.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn,spawnSync} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
assert.equal(process.argv.length,4);assert.equal(process.argv[2],'--local-bin');
const bin=process.argv[3];assert.ok(path.isAbsolute(bin));
const here=path.dirname(fileURLToPath(import.meta.url));
const work=fs.mkdtempSync(path.join(os.tmpdir(),'sandbox-core-native-'));
const data=path.join(work,'data'),port='55461',db='core_'+randomUUID().replaceAll('-','');
const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>!k.startsWith('PG')));
const args=d=>['-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p',port,'-U','postgres','-d',d];
const run=(tool,a,input)=>spawnSync(path.join(bin,tool),a,{input,encoding:'utf8',env,timeout:30000,maxBuffer:4*1024*1024});
const invoke=(tool,a,input)=>{const r=run(tool,a,input);assert.equal(r.status,0,[r.error?.message,r.stderr].filter(Boolean).join('\n'));return r.stdout.trim();};
const q=sql=>invoke('psql',args(db),sql);
const literal=s=>"'"+s.replaceAll("'","''")+"'";
const creator='11111111-1111-4111-8111-111111111111',creatorSession='22222222-2222-4222-8222-222222222222';
const buyer='66666666-6666-4666-8666-666666666666',buyerSession='77777777-7777-4777-8777-777777777777';
const payload=(values={})=>({protocol:'sandbox-commerce-v1',requestId:randomUUID(),...values});
const command=(kind,p,actor=creator,sid=creatorSession,expected=sid)=>
 `set role authenticated;set request.jwt.claims=${literal(JSON.stringify({role:'authenticated',sub:actor,session_id:sid}))};select public.isolated_sandbox_commerce_v1(${literal(kind)},${literal(JSON.stringify(p))},'${actor}','${expected}');`;
const captures=[],checkoutCaptures=[];
const call=(...a)=>{
 const response=JSON.parse(q(command(...a)));
 if(!a[2]||a[2]===creator){const {protocol,requestId,...fields}=a[1];captures.push({command:a[0],requestId,payload:fields,response});}
 return response;
};
const rejects=(sql,re)=>{const r=run('psql',args(db),sql);assert.notEqual(r.status,0);assert.match(r.stderr,re);};
const sourceFiles=['core.sql','premium-authority.sql','authority.sql','commands.sql','permissions-finalize.sql'];
const sources=Object.fromEntries(sourceFiles.map(f=>[f,fs.readFileSync(path.join(here,'..',f),'utf8')]));
const fixtureFiles=['premium-authority.fixture.sql','authority.fixture.sql'];
const fixtures=Object.fromEntries(fixtureFiles.map(f=>[f,fs.readFileSync(path.join(here,f),'utf8')]));
const digest=value=>createHash('sha256').update(value).digest('hex');
const read=f=>sources[f];
let startAttempted=false,started=false,report;
const sessions=[],cases=[];
const cleanup={sessionsClosed:false,clusterStopped:false,clusterNotRunningVerified:false,directoryRemoved:false};
const startedAt=Date.now();
try{
 const engine=invoke('postgres',['--version']);assert.match(engine,/PostgreSQL\) 17\.6/u);
 invoke('initdb',['-D',data,'-U','postgres','--encoding=UTF8','--no-locale','--auth=trust']);
 startAttempted=true;invoke('pg_ctl',['-D',data,'-w','-t','15','-l',path.join(work,'server.log'),'-o',`-c listen_addresses=127.0.0.1 -c unix_socket_directories='' -p ${port} -c max_prepared_transactions=0 -c autovacuum=off`,'start']);started=true;
 invoke('psql',args('postgres'),`create database ${db};`);
 q('create role anon nologin;create role authenticated nologin;create role service_role nologin;alter default privileges for role postgres grant execute on functions to authenticated;');
 q(fixtures['premium-authority.fixture.sql']);
 const fixture=fixtures['authority.fixture.sql'];
 const ownDeclaration=/create table sandbox_commerce_v1\.declarations\([\s\S]*?\);\n/u;
 assert.equal([...fixture.matchAll(new RegExp(ownDeclaration.source,'gu'))].length,1);
 q('begin;'+read('core.sql')+fixture.replace(ownDeclaration,'')+read('premium-authority.sql')+read('authority.sql')+read('commands.sql')+read('permissions-finalize.sql')+'commit;');
 q('select authority_fixture.reset();');
 q(`insert into auth.users(id,email_confirmed_at,raw_app_meta_data)values('${buyer}',clock_timestamp(),'{}');
 insert into auth.sessions values('${buyerSession}','${buyer}',clock_timestamp()+interval '1 hour');
 insert into public.wave1_legal_acceptances select '${buyer}','${buyerSession}',document_key,version,market,capability,'member',null from public.wave1_legal_document_versions;`);
 // Simulate protected shared facts. Only the closed new authority boundary reads them.
 q('alter table auth.users enable row level security;alter table auth.users force row level security;alter table auth.sessions enable row level security;alter table auth.sessions force row level security;');
 const create=payload({kind:'creator_tip',title:'Sandbox creator tip'});
 rejects(command('resource.create',create),/sandbox_generation_inactive/u);
 q("set role sbx_v1_operator;select sandbox_commerce_v1.transition('disabled','active');");
 const r=call('resource.create',create);assert.equal(r.status,'ok');assert.equal(r.actor.sessionGeneration,creatorSession);const resourceId=r.data.resource.id;
 assert.equal(call('resource.create',create).data.resource.id,resourceId);
 rejects(command('resource.create',{...create,title:'different'}),/sandbox_idempotency_conflict/u);
 cases.push('Disabled install, explicit activation, UUID session binding and exact mutation idempotency execute through real SQL.');
 const kinds=['creator_tip','paid_content','event','watch_party_live','live_watch_party_access','live_watch_party_seat',
  'channel_subscription','vip_pass','physical_merch','event_auction','room_seat_auction:party_admission','room_seat_auction:stage_reserved_seat'];
 for(const kind of kinds){assert.equal(call('resource.create',payload({kind,title:'Fixture '+kind})).data.resource.kind,kind);}
 cases.push('All twelve source product kinds create only isolated draft metadata with exact response discriminants.');
 rejects(command('resource.create',payload({kind:'creator_tip',title:'Free cannot sell'}),buyer,buyerSession),/sandbox_creator_authority_required/u);
 rejects(command('resource.read',payload({resourceId}),buyer,buyerSession),/sandbox_resource_unavailable/u);
 rejects(command('resource.create',payload({kind:'creator_tip',title:'Wrong session'}),creator,creatorSession,buyerSession),/sandbox_account_binding_invalid/u);
 rejects(command('resource.read',payload({resourceId:resourceId.replace('scv1_resource_','')})),/sandbox_versioned_identifier_required/u);
  rejects(command('resource.read',payload({resourceId,creatorId:buyer})),/sandbox_command_payload_invalid/u);
  rejects(command('offer.publish',payload({resourceId,expectedRevision:'1',amountMinor:100,currency:'usd'})),/sandbox_command_payload_invalid/u);
  rejects(command('delivery.resolve',payload({resourceId,expectedRevision:1}),buyer,buyerSession),/sandbox_resource_unavailable/u);
 cases.push('Free creator, cross-account draft read, wrong exact session and bare legacy IDs reject.');
 const unavailable=call('offer.publish',payload({resourceId,expectedRevision:1,amountMinor:100,currency:'usd'}));
 assert.equal(unavailable.status,'held');assert.match(unavailable.data.reason,/binding_unavailable/u);
 // Synthetic catalog binding for local SQL behavior ONLY: no provider evidence.
 q("insert into sandbox_commerce_v1.catalog values('88888888-8888-4888-8888-888888888888','creator_tip','stripe','local-test-platform','STRIPE','local-test-tip',100,'usd');");
 const offer=call('offer.publish',payload({resourceId,expectedRevision:1,amountMinor:100,currency:'usd'})).data.offer;
 const checkout=payload({offerId:offer.id,expectedRevision:offer.revision});
 const prepared=call('checkout.prepare',checkout,buyer,buyerSession);
 assert.equal(prepared.status,'ok');assert.equal(prepared.data.intent.providerDispatchAllowed,false);
 // Capture the actual buyer response separately from the existing creator
 // contract cases. The quote is read from this exact persisted synthetic intent;
 // no response, actor, price or revision is invented by a JS mock.
 const quote=JSON.parse(q(`select jsonb_build_object('offerId','scv1_offer_'||offer_id,'offerRevision',offer_revision,
  'resourceId','scv1_resource_'||resource_id,'resourceRevision',resource_revision,'creatorId',creator_id,
  'kind',kind,'amountMinor',amount_minor,'currency',currency) from sandbox_commerce_v1.intents
  where id='${prepared.data.intent.id.replace('scv1_intent_','')}';`));
 assert.equal(prepared.actor.userId,buyer);assert.equal(prepared.actor.accountId,buyer);
 assert.equal(prepared.actor.sessionGeneration,buyerSession);assert.equal(quote.offerId,checkout.offerId);
 assert.equal(quote.offerRevision,checkout.expectedRevision);assert.equal(quote.resourceId,prepared.data.intent.resourceId);
 assert.equal(quote.kind,'creator_tip');assert.equal(prepared.data.intent.status,'prepared');
 checkoutCaptures.push({actor:{...prepared.actor,state:'ACTIVE',restoreOnly:false},command:'checkout.prepare',
  requestId:checkout.requestId,payload:{offerId:checkout.offerId,expectedRevision:checkout.expectedRevision},quote,response:prepared});
 assert.equal(call('checkout.prepare',checkout,buyer,buyerSession).data.intent.id,prepared.data.intent.id);
 assert.equal(q(`select count(*) from public.user_entitlements where user_id='${buyer}';`),'0');
  const rid=resourceId.replace('scv1_resource_','');
  q(`update sandbox_commerce_v1.resources set status='quarantined' where id='${rid}';`);
  rejects(command('offer.read',payload({offerId:offer.id}),buyer,buyerSession),/sandbox_offer_unavailable/u);
  q(`update sandbox_commerce_v1.resources set status='published' where id='${rid}';`);
 cases.push('Missing provider binding holds publication; synthetic exact catalog permits free-buyer preparation without any dispatch authority.');
 rejects(command('checkout.read',payload({intentId:prepared.data.intent.id})),/query returned no rows/u);
 const movie=call('resource.create',payload({kind:'paid_content',title:'Unbound media'})).data.resource;
 assert.equal(call('offer.publish',payload({resourceId:movie.id,expectedRevision:1,amountMinor:100,currency:'usd'})).data.reason,'mode_integration_unavailable');
 assert.equal(call('delivery.resolve',payload({resourceId,expectedRevision:1}),buyer,buyerSession).data.reason,'mode_delivery_adapter_unavailable');
 cases.push('Other buyers cannot inspect intents; unimplemented product and delivery contracts remain explicitly held.');
  const negativePayload=payload({declared18Plus:false,countryCode:'US',regionCode:'CA',declarationVersion:'adult-us-creator-v1'});
  const neg=call('creator.declare',negativePayload);
 assert.equal(neg.data.eligible,false);
 rejects(command('resource.create',payload({kind:'creator_tip',title:'Negative declaration'})),/sandbox_creator_authority_required/u);
 assert.equal(call('creator.declare',payload({declared18Plus:true,countryCode:'US',regionCode:'CA',declarationVersion:'adult-us-creator-v1'})).data.eligible,true);
  assert.equal(call('creator.declare',negativePayload).data.eligible,true);
  assert.equal(q(`select declared_18_plus from sandbox_commerce_v1.declarations where user_id='${creator}';`),'t');
 cases.push('Negative declaration persists without accepting terms and blocks further creator action.');
  // Delay only the request-log write to prove final seller expiry aborts the
  // entire checkout even while the buyer's independent deadline remains valid.
  q(`create function authority_fixture.slow_request()returns trigger language plpgsql as $$begin perform pg_sleep(2);return new;end$$;
    create trigger test_delay before insert on sandbox_commerce_v1.requests for each row execute function authority_fixture.slow_request();
    do $$declare expiry timestamptz:=clock_timestamp()+interval '1.5 seconds';begin
      update public.user_entitlements set expires_at=expiry;
      update public.access_grants set expires_at=expiry;
    end$$;`);
  const before=q('select count(*) from sandbox_commerce_v1.intents;');
  rejects(command('checkout.prepare',payload({offerId:offer.id,expectedRevision:1}),buyer,buyerSession),/sandbox_authority_expired/u);
  assert.equal(q('select count(*) from sandbox_commerce_v1.intents;'),before);
  q(`drop trigger test_delay on sandbox_commerce_v1.requests;drop function authority_fixture.slow_request();
    do $$declare expiry timestamptz:=clock_timestamp()+interval '10 days';begin
      update public.user_entitlements set expires_at=expiry;
      update public.access_grants set expires_at=expiry;
    end$$;`);
  cases.push('Seller deadline expiry during final request persistence rolls back the intent even though buyer authority remains current.');
 for(const role of ['anon','authenticated','service_role']){
  rejects(`set role ${role};select * from sandbox_commerce_v1.intents;`,/permission denied/u);
  rejects(`set role ${role};select sandbox_commerce_v1.transition('active','retired');`,/permission denied/u);
  rejects(`set role ${role};select sandbox_commerce_v1.assert_authority('${creator}','${creatorSession}','creator');`,/permission denied/u);
 }
 rejects("set role service_role;select public.isolated_sandbox_commerce_v1('resource.create','{}',null,null);",/permission denied/u);
 assert.equal(q("select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='sandbox_commerce_v1' and c.relkind='r' and (not c.relrowsecurity or not c.relforcerowsecurity);"),'0');
 cases.push('Actual runtime roles cannot read/write private tables, call authority helpers or retire generations; all own tables FORCE RLS.');
 const child=spawn(path.join(bin,'psql'),args(db),{env,stdio:['pipe','pipe','pipe']});sessions.push(child);
 let stdout='';child.stdout.on('data',s=>stdout+=s);const done=new Promise(resolve=>child.on('close',code=>resolve(code)));
 child.stdin.write("begin;set idle_in_transaction_session_timeout='10s';set role sbx_v1_core_owner;select sandbox_commerce_v1.assert_generation(true);select 'HELD';\n");
 const end=Date.now()+3000;while(!stdout.includes('HELD')&&Date.now()<end)await delay(10);assert.ok(stdout.includes('HELD'));
 rejects("set role sbx_v1_operator;select sandbox_commerce_v1.transition('active','retired');",/could not obtain lock on row/u);
 child.stdin.end('commit;\n');assert.equal(await done,0);
 q("set role sbx_v1_operator;select sandbox_commerce_v1.transition('active','retired');");
 rejects("set role sbx_v1_operator;select sandbox_commerce_v1.transition('retired','active');",/sandbox_generation_transition_rejected/u);
 rejects(command('checkout.prepare',payload({offerId:offer.id,expectedRevision:1}),buyer,buyerSession),/sandbox_generation_inactive/u);
 assert.equal(call('checkout.read',payload({intentId:prepared.data.intent.id}),buyer,buyerSession).data.intent.id,prepared.data.intent.id);
  q(`update sandbox_commerce_v1.intents set expires_at=clock_timestamp()-interval '1 second' where id='${prepared.data.intent.id.replace('scv1_intent_','')}';
    update sandbox_commerce_v1.resources set status='quarantined' where id='${rid}';truncate public.user_entitlements;`);
  assert.equal(call('checkout.prepare',checkout,buyer,buyerSession).data.intent.status,'expired');
  assert.equal(call('resource.create',create).data.resource.status,'quarantined');
  assert.equal(call('creator.declare',negativePayload).data.eligible,false);
  assert.equal(q(`select count(*) from sandbox_commerce_v1.resources where id='${rid}';`),'1');
 cases.push('Retirement fails immediately behind admitted work, then succeeds; permanent retirement blocks new initiation but preserves historical status.');
  cases.push('Same-request reconciliation after retirement/Premium loss returns current expired/quarantined state without reexecuting mutation or reporting creator eligibility.');
 assert.equal(q("select string_agg(state,',' order by key) from public.platform_money_kill_switches;"),'off,off,off');
 assert.equal(q('select count(*) from sandbox_commerce_v1.grants;'),'0');
 assert.equal(q(`select count(*) from public.access_grants where user_id='${buyer}';`),'0');
 cases.push('No new grant, live-money switch change, buyer Premium or legacy paid right is created.');
 for(const f of sourceFiles)assert.equal(digest(fs.readFileSync(path.join(here,'..',f))),digest(read(f)),`Source changed during run: ${f}`);
 for(const f of fixtureFiles)assert.equal(digest(fs.readFileSync(path.join(here,f))),digest(fixtures[f]),`Fixture changed during run: ${f}`);
 report={status:'passed',engine,scope:'Actual source SQL on synthetic minimal authority tables and synthetic catalog; no provider or media integration, deployed schema, device or live behavior proof.',caseCount:cases.length,cases,
  sourceHashes:Object.fromEntries(sourceFiles.map(f=>[f,digest(read(f))])),fixtureHashes:Object.fromEntries(fixtureFiles.map(f=>[f,digest(fixtures[f])])),
  captureCounts:{creator:captures.length,checkout:checkoutCaptures.length}};
}finally{
 for(const child of sessions)if(child.exitCode===null){child.stdin.end('rollback;\n');child.kill('SIGTERM');}
 cleanup.sessionsClosed=sessions.every(s=>s.exitCode!==null);
 if(startAttempted){let s=run('pg_ctl',['-D',data,'status']);if(s.status===0){invoke('pg_ctl',['-D',data,'-m','immediate','-w','-t','15','stop']);cleanup.clusterStopped=true;s=run('pg_ctl',['-D',data,'status']);}else if(started&&s.status===3)cleanup.clusterStopped=true;
  assert.equal(s.status,3,'Uncertain cluster state; retain directory');assert.ok(started,'Uncertain startup; retain directory');cleanup.clusterNotRunningVerified=true;
 }else{cleanup.clusterStopped=true;cleanup.clusterNotRunningVerified=true;}
 assert.ok(cleanup.sessionsClosed);fs.rmSync(work,{recursive:true});cleanup.directoryRemoved=true;
}
assert.ok(report);
if(process.env.ISOLATED_SANDBOX_COMMAND_FIXTURE){
 assert.ok(path.isAbsolute(process.env.ISOLATED_SANDBOX_COMMAND_FIXTURE));
 fs.writeFileSync(process.env.ISOLATED_SANDBOX_COMMAND_FIXTURE,JSON.stringify({protocol:'sandbox-commerce-v1',
  actor:{userId:creator,accountId:creator,sessionGeneration:creatorSession,state:'ACTIVE',restoreOnly:false},cases:captures,
  checkoutCases:checkoutCaptures,provenance:{fixture:'core.native.mjs',synthetic:true,providerOrProductionCalls:false,
   quoteSource:'persisted synthetic sandbox_commerce_v1.intents row',sourceHashes:report.sourceHashes,fixtureHashes:report.fixtureHashes}},null,2)+'\n');
}
process.stdout.write(JSON.stringify({...report,durationMs:Date.now()-startedAt,cleanup},null,2)+'\n');
