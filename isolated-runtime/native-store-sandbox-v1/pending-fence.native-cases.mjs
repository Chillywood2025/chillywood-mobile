import assert from 'node:assert/strict';import path from 'node:path';import {randomUUID} from 'node:crypto';import {spawn} from 'node:child_process';import {setTimeout as delay} from 'node:timers/promises';
// Require the actual managed source closure; never fixture-install a missing module.
export async function runPendingFenceCases(x){
 const {q,args,bin,env,children,json,literal,buyer,session,seller,offer,resource,load,db}=x;let cases=0;
 assert.equal(q("select to_regclass('sandbox_commerce_v1.native_store_pending_raw') is not null;"),'t');
 assert.equal(q("select rolsuper from pg_roles where rolname='postgres';"),'f');cases++;
 const owner="set role sbx_v1_core_owner;set request.jwt.claims='{\"role\":\"service_role\"}';";
 const armed='begin;set local transaction_timeout=\'5s\';'+owner;
 const reject=(sql,re)=>assert.throws(()=>q(sql),re);
 const config={bridgeProtocol:'native-store-sandbox-v1',connectionId:randomUUID(),connectionRevision:1,projectId:'synthetic-fenced-project',appId:'synthetic-app',store:'APP_STORE',environment:'SANDBOX',authentication:{method:'shared_secret',keyVersion:'synthetic-v1',secret:'synthetic-not-a-real-secret-'.repeat(2)},encryption:{keyId:'synthetic-key',key:new Uint8Array(32).fill(17)}};
 q(`insert into native_store_sandbox_v1.connections values('${config.connectionId}',1,${literal(config.projectId)},'synthetic-app','APP_STORE','SANDBOX','synthetic-v1','synthetic-key');update native_store_sandbox_v1.control set enabled=true;`);
 const prepare=load('native-store-sandbox-bridge-v1.ts').prepareNativeStoreSandboxIntakeV1;
 const intake=async(patch={},raw,c=config)=>prepare(new Request('https://local.invalid',{method:'POST',headers:{authorization:c.authentication.secret},body:raw??JSON.stringify({api_version:'1.0',event:{id:randomUUID(),type:'NON_RENEWING_PURCHASE',app_id:c.appId,store:'APP_STORE',environment:'SANDBOX',app_user_id:buyer,original_app_user_id:buyer,transaction_id:randomUUID(),original_transaction_id:'synthetic-original',product_id:'synthetic-product',event_timestamp_ms:1794139200000,...patch}})}),c);
 const journal=i=>`set role service_role;select public.native_store_sandbox_journal_v1(${json(i)});`;
 const count=()=>q('select (select count(*) from native_store_sandbox_v1.receipts),(select count(*) from sandbox_commerce_v1.native_store_pending_raw),(select count(*) from sandbox_commerce_v1.resource_delivery_holds);');
 const receipt=(store,productResource=resource,project=config.projectId)=>{const id=randomUUID(),intent=randomUUID();q(`insert into sandbox_commerce_v1.intents(id,buyer_id,buyer_session_id,offer_id,offer_revision,resource_id,resource_revision,creator_id,kind,provider,scope_key,store,product_id,amount_minor,currency,state)
 values('${intent}','${buyer}','${session}','${offer}',1,'${productResource}',1,'${seller}','paid_content','revenuecat',${literal(store==='APP_STORE'?JSON.stringify(['native-store-sandbox-v1','revenuecat',project,config.appId,'APP_STORE','SANDBOX']):'synthetic-test-store')},${literal(store)},'synthetic-product',199,'usd','verified');
 insert into sandbox_commerce_v1.receipts values('${id}','${intent}','revenuecat',${literal(store==='APP_STORE'?JSON.stringify(['native-store-sandbox-v1','revenuecat',project,config.appId,'APP_STORE','SANDBOX']):'synthetic-test-store')},${literal(store)},'synthetic-product','${id}','${id}','verified',clock_timestamp()-interval '1 hour',null,clock_timestamp());
 insert into sandbox_commerce_v1.resource_grants(buyer_id,product_id,product_revision,receipt_id,starts_at) values('${buyer}','${productResource}',1,'${id}',clock_timestamp()-interval '1 hour');`);return id;};
 const native=receipt('APP_STORE'),secondResource=randomUUID();
 q(`insert into sandbox_commerce_v1.resources(id,creator_id,kind,title,status) values('${secondResource}','${seller}','paid_content','Unrelated Test Store','published');insert into sandbox_commerce_v1.resource_versions(resource_id,revision,creator_id,kind,title,price_minor,currency) values('${secondResource}',1,'${seller}','paid_content','Unrelated Test Store',199,'usd');`);
 const unrelated=receipt('test_store',secondResource),link=(id,project=config.projectId)=>`insert into sandbox_commerce_v1.native_store_core_links(core_receipt_id,project_id,buyer_id) values('${id}',${literal(project)},'${buyer}');`;
 reject(armed+link(native,'wrong-project')+'commit;',/native_store_exact_core_link_required/u);cases++;
 q(armed+link(native)+'commit;');
 reject(armed+link(unrelated)+'commit;',/native_store_exact_core_link_required/u);cases++;
 const delivery=`select sandbox_commerce_v1.authorize_resource_delivery('${buyer}','${session}','${resource}',1,'${resource}',1,'play_video');`;
 // A manually seeded native receipt/link is no longer an allocation: the
 // generic reader must deny it even before any pending evidence exists.
 reject(armed+delivery+'commit;',/sandbox_current_exact_resource_grant_required/u);cases++;
 const positive=await intake();const first=JSON.parse(q(journal(positive)));assert.equal(first.status,'recorded');assert.equal(count(),'1|1|1');
 assert.equal(q(`select receipt_id from sandbox_commerce_v1.resource_delivery_holds;`),native);
 reject(armed+delivery+'commit;',/sandbox_current_exact_resource_grant_required/u);cases++;
 assert.equal(q(armed+`select (sandbox_commerce_v1.current_resource_grant('${buyer}','${secondResource}',1)).receipt_id;commit;`),unrelated);cases++;
 assert.equal(JSON.parse(q(journal(positive))).status,'duplicate');assert.equal(count(),'1|1|1');cases++;
 for(const event of [{type:'CANCELLATION'},{type:'TRANSFER',transferred_from:[buyer],transferred_to:[randomUUID()]}])q(journal(await intake(event)));
 q(journal(await intake({},'{broken-json')));assert.equal(count(),'4|4|4');cases++;
 const next=receipt('APP_STORE');reject(armed+link(next)+'commit;',/native_store_project_evidence_pending/u);cases++;
 for(const role of ['anon','authenticated','service_role'])for(const table of ['native_store_core_links','native_store_pending_raw'])reject(`set role ${role};select * from sandbox_commerce_v1.${table};`,/permission denied/u);cases++;
 for(const table of ['native_store_core_links','native_store_pending_raw'])for(const op of [`update sandbox_commerce_v1.${table} set project_id='changed'`,`delete from sandbox_commerce_v1.${table}`,`truncate sandbox_commerce_v1.${table}${table==='native_store_pending_raw'?',sandbox_commerce_v1.native_store_negative_tombstones,sandbox_commerce_v1.native_store_allocations,sandbox_commerce_v1.native_store_raw_effects,sandbox_commerce_v1.native_store_reservation_terminals':''}`])reject(op+';',/native_store_quote_immutable/u);cases++;
 const rollback=await intake();q('begin;'+journal(rollback)+'rollback;');assert.equal(count(),'4|4|4');cases++;
 reject('begin isolation level repeatable read;'+journal(rollback)+'commit;',/native_store_fence_context_required/u);assert.equal(count(),'4|4|4');cases++;
 // Controlled rendezvous, no fixed holder sleep. A delivery SHARE lock makes
 // journal insertion roll back; a pending journal lock fences future linking.
 async function holder(sql,compete,finish='rollback'){let out='',err='';const c=spawn(path.join(bin,'psql'),args(db),{env,stdio:['pipe','pipe','pipe']});children.push(c);c.stdout.on('data',v=>out+=v);c.stderr.on('data',v=>err+=v);const done=new Promise(resolve=>c.once('exit',resolve));c.stdin.write(sql+"select 'fence_ready';\n");const until=Date.now()+3000;while(!out.includes('fence_ready')&&Date.now()<until)await delay(10);assert.ok(out.includes('fence_ready'),err);try{await compete();}finally{c.stdin.end(finish+';\n');assert.equal(await done,0,err);}}
 await holder(armed+'lock table sandbox_commerce_v1.resource_delivery_holds in share mode;',()=>reject(journal(rollback),/could not obtain lock/u));assert.equal(count(),'4|4|4');cases++;
 await holder('begin;'+journal(rollback),()=>reject(armed+link(next)+'commit;',/native_store_fence_busy/u));assert.equal(count(),'4|4|4');cases++;
 await holder(armed+`select sandbox_commerce_v1.native_store_lock_project(${literal(config.projectId)});`,()=>reject(journal(rollback),/native_store_fence_busy/u));assert.equal(count(),'4|4|4');cases++;
 for(const role of ['anon','authenticated','service_role']){assert.equal(q(`select has_function_privilege('${role}','sandbox_commerce_v1.native_store_lock_project(text)','EXECUTE'),has_function_privilege('${role}','sandbox_commerce_v1.native_store_fence_raw()','EXECUTE');`),'f|f');}
 reject('set role native_store_sandbox_v1_owner;select * from sandbox_commerce_v1.native_store_core_links;',/permission denied/u);cases++;
 const beforeTimeout=count();reject('begin;'+journal(rollback)+'select pg_sleep(6);commit;',/transaction timeout/u);assert.equal(count(),beforeTimeout);cases++;
 const c2={...config,connectionId:randomUUID(),projectId:'synthetic-second-project'};
 q(`insert into native_store_sandbox_v1.connections values('${c2.connectionId}',1,${literal(c2.projectId)},'synthetic-app','APP_STORE','SANDBOX','synthetic-v1','synthetic-key');`);
 const nextProject=receipt('APP_STORE',resource,c2.projectId),secondIntake=await intake({},undefined,c2);
 await holder(armed+link(nextProject,c2.projectId),()=>reject(journal(secondIntake),/native_store_fence_busy/u),'commit');
 q(journal(secondIntake));assert.equal(q(`select count(*) from sandbox_commerce_v1.resource_delivery_holds where receipt_id='${nextProject}';`),'1');cases++;
 // Actual journal persistence retains malformed original bytes for replay.
 const malformed=await intake({},'{another-malformed');const saved=JSON.parse(q(journal(malformed)));
 const historical=JSON.parse(q(`set role service_role;select public.native_store_sandbox_journal_read_v1('${saved.receiptId}');`));
 const replay=await load('native-store-sandbox-replay-v1.ts').replayNativeStoreSandboxReceiptV1(historical.receipt,config,historical.revoked);
 assert.equal(replay.observation.parseStatus,'invalid');assert.equal(replay.grantsAccess,false);assert.equal(q(`select count(*) from sandbox_commerce_v1.native_store_pending_raw where raw_receipt_id='${saved.receiptId}';`),'1');cases++;
 console.log(JSON.stringify({protocol:'native-pending-fence-proof-v1',cases,passed:cases,managedInstall:true,fixedClosureContainsFence:true,providerQualified:false,settlementAllowed:false}));
}
