#!/usr/bin/env node
// Only a newly seeded caller-owned, network-isolated native PostgreSQL fixture.
// Uses the complete migration replay and real account/session/source predicates.
import assert from 'node:assert/strict';
import {execFileSync,spawn} from 'node:child_process';
const container=process.argv.find(a=>a.startsWith('--container='))?.slice(12);
assert.match(container??'',/^chillywood-event-offer-audit-[a-z0-9-]+$/);
const args=['exec','-i',container,'psql','-X','-h','/tmp','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-Atq'];
const sql=input=>execFileSync('docker',args,{input,encoding:'utf8',timeout:60000,stdio:['pipe','pipe','pipe']}).trim();
const parallel=input=>new Promise((resolve,reject)=>{
  const child=spawn('docker',args,{stdio:['pipe','pipe','pipe']});let output='',error='';
  const timer=setTimeout(()=>{child.kill();reject(new Error('native claim session timeout'));},60000);
  child.stdout.on('data',c=>{output+=c;});child.stderr.on('data',c=>{error+=c;});child.on('error',reject);
  child.on('close',code=>{clearTimeout(timer);resolve({code,output:output.trim(),error});});child.stdin.end(input);
});
const actors=JSON.parse(sql("select jsonb_object_agg(kind,jsonb_build_object('id',user_id,'session',session_id)) from event_reservation_fixture.actors"));
const literal=value=>`'${String(value).replaceAll("'","''")}'`;
const as=(actor,statement)=>`begin; set local role authenticated; set local request.jwt.claims=${literal(JSON.stringify({role:'authenticated',sub:actors[actor].id,session_id:actors[actor].session}))}; set local request.headers='{"x-chillywood-platform":"ios"}'; ${statement} commit;`;
const read=(actor,statement)=>JSON.parse(sql(as(actor,`select ${statement};`)).split('\n').at(-1));
let checks=0;
const check=(actual,expected,message)=>{assert.deepEqual(actual,expected,message);checks++;console.log(`ok ${checks} - ${message}`);};
const reject=(actor,statement,reason)=>{assert.throws(()=>sql(as(actor,statement)),error=>String(error.stderr??error).includes(reason));checks++;console.log(`ok ${checks} - rejects ${reason}`);};
sql(`update public.platform_money_kill_switches set state='sandbox_only' where key='watch_party_tickets_enabled';
  insert into public.watch_party_rooms(party_id,title_id,host_user_id,room_type,join_policy,content_access_rule,is_active,discovery_visibility)
  values('NATIVECLAIM','native-claim-title','${actors.creator.id}','title','open','party_pass',true,'private');`);
const offer=read('creator',"public.set_paid_watch_party_offer('NATIVECLAIM','Native claim room',99,null,'sandbox')");
const intent=read('buyer1',`public.create_ios_app_store_purchase_intent('com.chillywood.seatpass.tier1','watch_party_live','${offer.id}','{}')`);
const calls=await Promise.all(['ec000000-0000-4000-8000-000000000001','ec000000-0000-4000-8000-000000000002'].map(id=>parallel(as('buyer1',
  `select public.begin_creator_money_checkout('${intent.id}','${id}'); select pg_sleep(0.25);`))));
check(calls.map(r=>r.code),[0,0],'both concurrent authenticated RPCs complete');
const results=calls.map(r=>JSON.parse(r.output.split('\n').find(line=>line.startsWith('{'))));
check(results.filter(r=>r.startAuthorized).length,1,'exactly one concurrent native SDK start is authorized');
check(new Set(results.map(r=>r.checkoutAttemptId)).size,1,'losing request reads the same durable attempt');
check(Number(sql(`select count(*) from public.money_purchase_intents where id='${intent.id}' and checkout_attempt_id is not null`)),1,'one durable checkout marker');
check(read('buyer1',`public.begin_creator_money_checkout('${intent.id}','ec000000-0000-4000-8000-000000000003')`).startAuthorized,false,'new UUID cannot authorize a second call');
reject('buyer2',`select public.begin_creator_money_checkout('${intent.id}','ec000000-0000-4000-8000-000000000004');`,'creator_money_checkout_intent_unavailable');
const older=read('buyer2',`public.create_ios_app_store_purchase_intent('com.chillywood.seatpass.tier1','watch_party_live','${offer.id}','{}')`);
const otherIntent='ec000000-0000-4000-8000-000000000006';
sql(`insert into public.money_purchase_intents select (jsonb_populate_record(null::public.money_purchase_intents,
  to_jsonb(i)||jsonb_build_object('id','${otherIntent}'::uuid,'idempotency_key','native-preexisting-duplicate'))).*
  from public.money_purchase_intents i where id='${older.id}';`);
const duplicates=await Promise.all([older.id,otherIntent].map((id,index)=>parallel(as('buyer2',
  `select public.begin_creator_money_checkout('${id}','ec000000-0000-4000-8000-00000000000${index+7}'); select pg_sleep(0.25);`))));
check(duplicates.filter(r=>r.code===0).length,1,'two preexisting intents cannot concurrently start for one buyer and source');
check(duplicates.filter(r=>r.error.includes('creator_money_checkout_resolution_required')).length,1,'competing historical intent requires resolution');
sql(`update public.money_purchase_intents set status='expired' where id='${intent.id}';`);
reject('buyer1',`select public.create_ios_app_store_purchase_intent('com.chillywood.seatpass.tier1','watch_party_live','${offer.id}','{}');`,'creator_money_checkout_resolution_required');
check(Number(sql(`select count(*) from public.money_purchase_intents where user_id='${actors.buyer1.id}' and source_id='${offer.id}'`)),1,'unresolved expiry does not create another intent');
sql(`update auth.sessions set not_after=now()-interval '1 second' where id='${actors.buyer1.session}';`);
reject('buyer1',`select public.begin_creator_money_checkout('${intent.id}','ec000000-0000-4000-8000-000000000005');`,'buyer_session_authority_required');
check(Number(sql(`select count(*) from public.money_access_ledger_events where source_id='${offer.id}'`)),0,'checkout admission alone produces no payment ledger');
console.log(`Native creator checkout claims: ${checks} assertions passed; no provider transport.`);
