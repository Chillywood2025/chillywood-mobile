// Local, disposable PostgreSQL 17.6 only. No hosted URL or provider access.
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {spawnSync,spawn} from 'node:child_process';import {createServer} from 'node:net';
import {createHash} from 'node:crypto';
import {createDatabase} from '../../tests/helpers/database-runtime-authority-fixture.mjs';
import {nativeStoreInstallProfile} from '../native-store-sandbox-v1/install-profile.mjs';
import {appleSandboxOwnershipSQL} from './source.mjs';
assert.equal(process.argv.length,4);assert.equal(process.argv[2],'--local-bin');
const bin=process.argv[3];assert.ok(path.isAbsolute(bin));
const here=import.meta.dirname,work=fs.mkdtempSync(path.join(os.tmpdir(),'apple-ownership-'));
const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const port=String(server.address().port);await new Promise(resolve=>server.close(resolve));
const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>!k.startsWith('PG')&&k!=='DATABASE_URL'));
const run=(tool,args,input)=>spawnSync(path.join(bin,tool),args,{env,input,encoding:'utf8',timeout:1200000,maxBuffer:32*1024*1024});
const invoke=(tool,args,input)=>{const r=run(tool,args,input);assert.equal(r.status,0,r.stderr||r.error?.message);return r.stdout.trim();};
const args=(user='postgres',db='apple_ownership')=>['-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p',port,'-U',user,'-d',db];
const q=(sql,user='postgres')=>invoke('psql',args(user),sql);
let started=false;
try{
 assert.match(invoke('postgres',['--version']),/PostgreSQL\) 17\.6/u);
 invoke('initdb',['-D',path.join(work,'data'),'-U','fixture_admin','--encoding=UTF8','--no-locale','--auth=trust']);
 invoke('pg_ctl',['-D',path.join(work,'data'),'-w','-t','30','-l',path.join(work,'server.log'),'-o',`-c listen_addresses=127.0.0.1 -c unix_socket_directories='' -p ${port} -c shared_buffers=32MB`,'start']);started=true;
 invoke('psql',args('fixture_admin','postgres'),'create role postgres login superuser;create database apple_ownership owner postgres;');
 const replay=[];
 const {replayReport}=await createDatabase({includeHeldStudio:true,implicitApiGrants:false,databaseFactory:async()=>({async exec(sql){replay.push(sql);},async close(){}})});
 q(replay.join('\n'));console.log(`PASS full legacy replay (${replayReport.files.length} migrations)`);
 q('create role supabase_read_only_user login nosuperuser nocreaterole nocreatedb noreplication bypassrls;');
 q('alter role postgres nosuperuser nocreatedb noreplication createrole bypassrls noinherit;','fixture_admin');
 q(nativeStoreInstallProfile().sql);console.log('PASS exact native installed-source closure');
 console.log(q("select jsonb_build_object('role',r.rolname,'publicCreate',has_schema_privilege(r.oid,'public','CREATE'),'memberships',(select jsonb_agg(jsonb_build_object('member',m.member::regrole,'grantor',m.grantor::regrole,'admin',m.admin_option,'inherit',m.inherit_option,'set',m.set_option)) from pg_auth_members m where m.roleid=r.oid)) from pg_roles r where r.rolname in('native_store_sandbox_v1_owner','sbx_v1_core_owner')"));
 q(fs.readFileSync(path.join(here,'../native-store-shared-routing-v1/exclusion.sql'),'utf8'));
 const retainedSecuritySQL="select jsonb_build_object('memberships',(select jsonb_agg(to_jsonb(x) order by x.roleid,x.member,x.grantor) from pg_auth_members x),'publicAcl',(select nspacl::text from pg_namespace where nspname='public'),'functions',(select jsonb_agg(jsonb_build_array(p.oid,pg_get_functiondef(p.oid),p.proacl::text,p.proowner) order by p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('public','private','sandbox_commerce_v1','native_store_sandbox_v1') and p.prokind='f' and p.proname not like 'native_apple_%'))";
 const retainedSecurity=q(retainedSecuritySQL);
 const candidate=fs.readFileSync(path.join(here,'ownership.sql'),'utf8').replace('-- Explicit draft stop:',()=>
  fs.readFileSync(path.join(here,'recorder.sql'),'utf8')+'\n-- Explicit draft stop:');
 const r=run('psql',args(),candidate);
 assert.notEqual(r.status,0);assert.match(r.stderr,/native_apple_ownership_candidate_incomplete/);
 assert.equal(q("select to_regclass('private.native_apple_sandbox_owners') is null"),'t');
 console.log('PASS candidate compiles through explicit incomplete guard and rolls back');
 // Only this disposable fixture omits the publication guard to exercise draft
 // behavior. The checked-in candidate remains non-installable.
 assert.equal(appleSandboxOwnershipSQL(),candidate.replace("do $$begin raise exception 'native_apple_ownership_candidate_incomplete';end $$;",''));
 q(appleSandboxOwnershipSQL());
 assert.equal(q(retainedSecuritySQL),retainedSecurity);
 console.log('PASS retained memberships, public ACL and preexisting function definitions/permissions unchanged');
 const literal=v=>"'"+String(v).replaceAll("'","''")+"'";
 const json=v=>literal(JSON.stringify(v))+'::jsonb';
 const id='11111111-1111-4111-8111-111111111111',buyer='22222222-2222-4222-8222-222222222222',product='com.chillywood.paidvideo.tier1';
 const scope={protocol:'revenuecat-native-authenticated-scope-v1',connectionId:id,connectionRevision:1,projectId:'synthetic-project',appId:'synthetic-app',store:'APP_STORE',environment:'SANDBOX',rawSha256:'a'.repeat(64)};
 const event={eventId:'synthetic-event-1',eventType:'NON_RENEWING_PURCHASE',userId:buyer,productId:product,originalTransactionId:'synthetic-original-1',occurredAt:'2026-11-01T00:00:00.000Z'};
 const service="set request.jwt.claims='{\"role\":\"service_role\"}';set role service_role;";
 assert.equal(q(service+`select public.native_apple_sandbox_handover_v1(${json(scope)},${json(event)}) is null;`,'fixture_admin'),'t');
 console.log('PASS default-empty handover delegates');
 q(`set role native_store_sandbox_v1_owner;insert into native_store_sandbox_v1.connections values('${id}',1,'synthetic-project','synthetic-app','APP_STORE','SANDBOX','synthetic-key-version','synthetic-storage-key');reset role;`,'fixture_admin');
 q(`insert into private.native_apple_sandbox_owners(provider,product_id,connection_id,connection_revision,project_id,app_id,store,environment)
  values('revenuecat_app_store','${product}','${id}',1,'synthetic-project','synthetic-app','APP_STORE','SANDBOX');`);
 console.log('PASS genuine qualification inventory and scope');
 const resource='44444444-4444-4444-8444-444444444444',catalog='55555555-5555-4555-8555-555555555555',offer='66666666-6666-4666-8666-666666666666',binding='77777777-7777-4777-8777-777777777777';
 const nativeCatalog={protocol:'native-store-sandbox-catalog-v1',bindingId:'nssv1_catalog_'+binding,revision:1,
  projectId:scope.projectId,appId:scope.appId,store:'APP_STORE',environment:'SANDBOX',wireProductId:product,
  resourceId:'scv1_resource_'+resource,resourceRevision:1,amountMinor:199,currency:'usd',productType:'one_time'};
 const projected=Object.fromEntries(['bindingId','revision','projectId','appId','store','environment','wireProductId'].map(k=>[k,nativeCatalog[k]]));
 q(`set role sbx_v1_core_owner;
  insert into sandbox_commerce_v1.resources(id,creator_id,kind,title,status) values('${resource}','${buyer}','paid_content','Synthetic source','published');
  insert into sandbox_commerce_v1.resource_versions(resource_id,revision,creator_id,kind,title,price_minor,currency) values('${resource}',1,'${buyer}','paid_content','Synthetic source',199,'usd');
  insert into sandbox_commerce_v1.catalog(id,kind,provider,scope_key,store,product_id,amount_minor,currency) values('${catalog}','paid_content','revenuecat','synthetic-existing','test_store','synthetic-product',199,'usd');
  insert into sandbox_commerce_v1.offers(id,resource_id,resource_revision,catalog_id) values('${offer}','${resource}',1,'${catalog}');
  insert into sandbox_commerce_v1.native_store_catalog_bindings values('${binding}',1,'${offer}',1,'APP_STORE',${json(nativeCatalog)});`,'fixture_admin');
 q(`select public.native_apple_admission_internal(${json(projected)},clock_timestamp());`);
 const wrongCatalog=run('psql',args(),`select public.native_apple_admission_internal(${json({...projected,revision:2})},clock_timestamp());`);
 assert.notEqual(wrongCatalog.status,0);assert.match(wrongCatalog.stderr,/native_apple_admission_unqualified/);
 console.log('PASS exact retained native binding revision/projection, wrong revision rejected');
 q(service+`select public.reserve_revenuecat_webhook_ingress_event('${event.eventId}','${scope.rawSha256}');`,'fixture_admin');
 const receipt=JSON.parse(q(service+`select public.native_apple_sandbox_handover_v1(${json(scope)},${json(event)});`,'fixture_admin'));
 assert.equal(receipt.status,'excluded');assert.equal(receipt.financialAuthority,false);
 assert.deepEqual(JSON.parse(q(service+`select public.native_apple_sandbox_handover_v1(${json(scope)},${json(event)});`,'fixture_admin')),receipt);
 assert.equal(q('select count(*) from public.access_grants;'),'0');
 console.log('PASS genuine first handover and exact replay without access grant');
 const call=(s,e)=>JSON.parse(q(service+`select public.native_apple_sandbox_handover_v1(${json(s)},${json(e)});`,'fixture_admin'));
 const rejectCall=(s,e,pattern)=>{const r=run('psql',args('fixture_admin'),service+`select public.native_apple_sandbox_handover_v1(${json(s)},${json(e)});`);assert.notEqual(r.status,0);assert.match(r.stderr,pattern);};
 rejectCall({...scope,appId:'wrong-app'},event,/native_apple_scope_unqualified/);
 rejectCall(scope,{...event,userId:'33333333-3333-4333-8333-333333333333'},/native_apple_(original_identity|replay)_conflict/);
 const terminal={...event,eventId:'synthetic-terminal-first',eventType:'CANCELLATION',originalTransactionId:'synthetic-terminal-original'};
 q(service+`select public.reserve_revenuecat_webhook_ingress_event('${terminal.eventId}','${scope.rawSha256}');`,'fixture_admin');
 assert.equal(call(scope,terminal).status,'excluded');
 const afterTerminal={...terminal,eventId:'synthetic-after-terminal',eventType:'NON_RENEWING_PURCHASE'};
 q(service+`select public.reserve_revenuecat_webhook_ingress_event('${afterTerminal.eventId}','${scope.rawSha256}');`,'fixture_admin');
 assert.equal(call(scope,afterTerminal).status,'excluded');
 assert.equal(q('select count(*) from public.access_grants;'),'0');
 assert.equal(q("select count(*) from public.revenuecat_provider_reconciliation_obligations where state='pending_reconciliation';"),'2');
 console.log('PASS terminal-first and later purchase retain no-grant evidence and obligations');
 q("insert into private.native_apple_sandbox_owner_retirements(owner_id,reason) select id,'synthetic retirement' from private.native_apple_sandbox_owners;");
 const retiredAdmission=run('psql',args(),`select public.native_apple_admission_internal(${json(projected)},clock_timestamp());`);
 assert.notEqual(retiredAdmission.status,0);assert.match(retiredAdmission.stderr,/native_apple_admission_unqualified/);
 q(`select public.native_apple_admission_internal(${json(projected)},clock_timestamp(),false);`);
 q(`set role sbx_v1_core_owner;insert into sandbox_commerce_v1.native_store_catalog_retirements values('${binding}',1,'synthetic catalog retirement');`,'fixture_admin');
 q(`select public.native_apple_admission_internal(${json(projected)},clock_timestamp(),false);`);
 assert.deepEqual(call(scope,event),receipt);
 assert.equal(call(scope,terminal).status,'excluded');
 const denied=run('psql',args('fixture_admin'),"set role authenticated;select public.native_apple_sandbox_handover_v1('{}','{}');");
 assert.notEqual(denied.status,0);assert.match(denied.stderr,/permission denied/);
 console.log('PASS retirement retains reconciliation and authenticated callers cannot invoke recorder');
 const child=spawn(path.join(bin,'psql'),args('fixture_admin'),{env,stdio:['pipe','pipe','pipe']});
 let stderr='';child.stderr.on('data',x=>stderr+=x);
 const ended=new Promise(resolve=>child.once('exit',resolve));
 const ready=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('lock handshake timeout')),30000);child.stdout.on('data',x=>{if(String(x).includes('LOCK_READY')){clearTimeout(timer);resolve();}});});
 child.stdin.write("begin;select pg_advisory_xact_lock(hashtextextended('native-apple-sandbox-single-owner-v1',0));select 'LOCK_READY';\n");
 try{await ready;rejectCall(scope,event,/native_apple_owner_busy/);}finally{child.stdin.end('rollback;\n');assert.equal(await ended,0,stderr);}
 assert.deepEqual(call(scope,event),receipt);
 console.log('PASS busy handover fails promptly without changing retained receipt, then replays');
 const oldSnapshot=run('psql',args('fixture_admin'),'begin isolation level repeatable read;'+service+`select public.native_apple_sandbox_handover_v1(${json(scope)},${json(event)});rollback;`);
 assert.notEqual(oldSnapshot.status,0);assert.match(oldSnapshot.stderr,/native_apple_owner_fresh_snapshot_required/);
 const parallel=spawn(path.join(bin,'psql'),args('fixture_admin'),{env,stdio:['pipe','pipe','pipe']});
 let parallelError='';parallel.stderr.on('data',x=>parallelError+=x);
 const parallelEnded=new Promise(resolve=>parallel.once('exit',resolve));
 const parallelReady=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('shared lock handshake timeout')),30000);parallel.stdout.on('data',x=>{if(String(x).includes('SHARED_READY')){clearTimeout(timer);resolve();}});});
 parallel.stdin.write("begin;select pg_advisory_xact_lock_shared(hashtextextended('native-apple-sandbox-single-owner-v1',0));select 'SHARED_READY';\n");
 try{
  await parallelReady;assert.deepEqual(call(scope,event),receipt);
  q("insert into public.provider_events(provider_event_id,provider,environment,event_type,status,idempotency_key,metadata) values('synthetic-unrelated-google','revenuecat_google_play','production','NON_RENEWING_PURCHASE','processed','synthetic-unrelated-google','{}'),('synthetic-unrelated-apple','revenuecat_app_store','sandbox','NON_RENEWING_PURCHASE','processed','synthetic-unrelated-apple','{\"provider_product_id\":\"synthetic-other-product\"}');");
 }finally{parallel.stdin.end('rollback;\n');assert.equal(await parallelEnded,0,parallelError);}
 console.log('PASS concurrent ordinary handover reads coexist; unrelated Google/Apple processing proceeds; old snapshot rejected');
 console.log(JSON.stringify({protocol:'native-apple-ownership-local-proof-v1',sourceSha256:createHash('sha256').update(appleSandboxOwnershipSQL()).digest('hex'),providerQualified:false,activated:false}));
}finally{
 if(started)invoke('pg_ctl',['-D',path.join(work,'data'),'-w','-t','30','stop','-m','fast']);
}
