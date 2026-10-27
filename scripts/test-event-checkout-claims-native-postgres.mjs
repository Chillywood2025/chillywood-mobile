#!/usr/bin/env node
// Real application SQL against an in-memory full replay or an explicitly named,
// caller-owned disposable native fixture. No provider calls or production data.
import assert from 'node:assert/strict';
import {execFileSync,spawn} from 'node:child_process';
import fs from 'node:fs';
process.on('uncaughtException',error=>{
  console.error(error.message);
  if(error.where)console.error(error.where);
  if(error.stderr)console.error(String(error.stderr));
  process.exit(1);
});

const embedded=process.argv.includes('--pglite');
const container=process.argv.find(a=>a.startsWith('--container='))?.slice(12);
const databaseName=process.argv.find(a=>a.startsWith('--database='))?.slice(11)??'event_reservation_checkout_claims';
assert.match(databaseName,/^event_reservation_[a-z0-9_]+$/);
if(!embedded) assert.match(container??'',/^chillywood-event-offer-audit-[a-z0-9-]+$/);
let database;
if(embedded){
  const {createDatabase}=await import('../tests/helpers/database-runtime-authority-fixture.mjs');
  ({db:database}=await createDatabase({includeHeldStudio:true,applyRepair:true}));
  await database.exec(fs.readFileSync(new URL('../tests/fixtures/event-reservation-authority.sql',import.meta.url),'utf8'));
}
const args=['exec','-i',container,'psql','-X','-h','/tmp','-U','postgres','-d',databaseName,'-v','ON_ERROR_STOP=1','-Atq'];
const sql=async input=>{
  if(!embedded)return execFileSync('docker',args,{input,encoding:'utf8',timeout:60_000,stdio:['pipe','pipe','pipe']}).trim();
  try{return (await database.exec(input)).flatMap(result=>result.rows.map(row=>Object.values(row)
    .map(value=>typeof value==='object'?JSON.stringify(value):String(value)).join('|'))).join('\n');}
  catch(error){await database.exec('rollback');throw error;}
};
const parallel=input=>new Promise((resolve,reject)=>{
  const child=spawn('docker',args,{stdio:['pipe','pipe','pipe']});let output='',error='';
  const timer=setTimeout(()=>{child.kill();reject(new Error('event claim native session timeout'));},60_000);
  child.stdout.on('data',value=>{output+=value;});child.stderr.on('data',value=>{error+=value;});
  child.on('error',reject);child.on('close',code=>{clearTimeout(timer);resolve({code,output:output.trim(),error});});
  child.stdin.end(input);
});
const actors=JSON.parse(await sql("select jsonb_object_agg(kind,jsonb_build_object('id',user_id,'session',session_id)) from event_reservation_fixture.actors"));
const events=JSON.parse(await sql('select jsonb_object_agg(name,id) from event_reservation_fixture.events'));
const offset=Number(process.argv.find(a=>a.startsWith('--fixture-offset='))?.slice(17)??0);
assert.ok(Number.isInteger(offset)&&offset>=0&&offset<=12&&offset%3===0);
const originalActors={...actors},originalEvents={...events};
for(let index=1;index<=3;index++){
  actors[`buyer${index}`]=originalActors[`buyer${index+offset}`];
  events[`show${index}`]=originalEvents[`show${index+offset}`];
}
// The shared reservation fixture intentionally leaves discovery private; this
// checkout suite starts with shows whose buyer-facing page is accessible.
await sql(`update public.creator_events set visibility='public' where id in('${events.show1}','${events.show2}','${events.show3}');`);
const literal=value=>`'${String(value).replaceAll("'","''")}'`;
const as=(actor,statement,platform='ios')=>`begin;set local role authenticated;
  set local request.jwt.claims=${literal(JSON.stringify({role:'authenticated',sub:actors[actor].id,session_id:actors[actor].session}))};
  set local request.headers=${literal(JSON.stringify({'x-chillywood-platform':platform}))};${statement}commit;`;
const read=async(actor,statement,platform)=>JSON.parse((await sql(as(actor,`select ${statement};`,platform))).split('\n').at(-1));
const uuid=n=>`ee000000-0000-4000-8000-${String(n+offset*1000).padStart(12,'0')}`;
let checks=0;
const check=(actual,expected,label)=>{assert.deepEqual(actual,expected,label);console.log(`ok ${++checks} - ${label}`);};
const rejected=async(actor,statement,reason,platform)=>{
  let failure='';try{await sql(as(actor,statement,platform));}catch(error){failure=String(error.stderr??error);}
  assert.match(failure,new RegExp(reason));console.log(`ok ${++checks} - rejects ${reason}`);
};
const configure=(name,price=99)=>read('creator',`public.configure_paid_creator_event_sale('${events[name]}',
  'Original virtual show; no replay',${price},10,'sandbox','America/New_York',now()-interval '1 hour',now()+interval '1 day')`);
const buy=(actor,offer,platform='ios')=>read(actor,`public.create_reserved_creator_event_purchase_intent('${offer.id}','${offer.termsRevisionId}')`,platform);
const claim=(actor,intent,n,platform)=>read(actor,`public.begin_creator_event_checkout('${intent.id}','${uuid(n)}')`,platform);
// Deterministic fixture clock advancement only: never used outside this isolated
// database. Real immutability guards are restored before every application call.
const expire=async intent=>sql(`begin;set local session_replication_role=replica;
  update public.money_purchase_intents set status='expired',expires_at=now()-interval '1 minute' where id='${intent.id}';
  update public.event_ticket_reservations set expires_at=now()-interval '1 minute' where purchase_intent_id='${intent.id}';commit;`);
const cloneUnstarted=async(intent,n)=>{
  await sql(`insert into public.money_purchase_intents select (jsonb_populate_record(null::public.money_purchase_intents,
    to_jsonb(i)||jsonb_build_object('id','${uuid(n)}'::uuid,'idempotency_key','event-claim-duplicate-${uuid(n)}'))).*
    from public.money_purchase_intents i where id='${intent.id}';`);
  return {id:uuid(n)};
};

try{
  const offer=await configure('show1');const intent=await buy('buyer1',offer);
  if(embedded){
    check((await claim('buyer1',intent,1)).startAuthorized,true,'first exact event claim authorizes one start');
    check((await claim('buyer1',intent,2)).startAuthorized,false,'a different UUID cannot repeat the same reservation');
  }else{
    const starts=await Promise.all([1,2].map(n=>parallel(as('buyer1',`select public.begin_creator_event_checkout('${intent.id}','${uuid(n)}');select pg_sleep(0.25);`))));
    check(starts.map(result=>result.code),[0,0],'native competing event claims both return');
    const results=starts.map(result=>JSON.parse(result.output.split('\n').find(line=>line.startsWith('{'))));
    check(results.filter(result=>result.startAuthorized).length,1,'native concurrent starts authorize exactly one Store call');
    check(new Set(results.map(result=>result.checkoutAttemptId)).size,1,'native claim loser sees original durable attempt');
  }
  check((await claim('buyer1',intent,1)).startAuthorized,false,'lost successful claim response cannot authorize retry');
  await rejected('buyer2',`select public.begin_creator_event_checkout('${intent.id}','${uuid(3)}');`,'event_reservation_not_found');
  await expire(intent);
  const access=await read('buyer1',`public.resolve_paid_creator_event_pass_access('${events.show1}')`);
  check(access.requiresPurchase,false,'expired started Store attempt suppresses another purchase CTA');
  check(access.reason,'event_reservation_pending','expired capacity remains visibly payment-pending');
  for(const [statement,platform]of[
    [`select public.create_reserved_creator_event_purchase_intent('${offer.id}','${offer.termsRevisionId}');`,'ios'],
    [`select public.create_paid_creator_event_pass_purchase_intent('${offer.id}');`,'ios'],
    [`select public.create_ios_creator_money_purchase_intent('event_pass','${events.show1}',99,'{}');`,'ios'],
    [`select public.create_money_purchase_intent('event_pass_sandbox_099','event','${events.show1}','{}');`,'android'],
  ])await rejected('buyer1',statement,'event_checkout_resolution_required',platform);
  const oldSession=actors.buyer1.session;actors.buyer1.session=uuid(4);
  await sql(`insert into auth.sessions(id,user_id)values('${actors.buyer1.session}','${actors.buyer1.id}');
    insert into public.wave1_legal_acceptances(user_id,subject_hash,document_key,document_version,market,role_key,capability,session_generation,authority_source)
    select user_id,subject_hash,document_key,document_version,market,role_key,capability,'${actors.buyer1.session}','service_reconciliation'
    from public.wave1_legal_acceptances where user_id='${actors.buyer1.id}' and session_generation='${oldSession}';`);
  await rejected('buyer1',`select public.create_reserved_creator_event_purchase_intent('${offer.id}','${offer.termsRevisionId}');`,'event_checkout_resolution_required');
  check(Number(await sql(`select count(*) from public.money_purchase_intents where user_id='${actors.buyer1.id}' and source_id='${events.show1}'`)),1,'expiry and new login create no replacement intent');

  const competingOffer=await configure('show2');const first=await buy('buyer2',competingOffer);const other=await cloneUnstarted(first,10);
  if(embedded){
    check((await claim('buyer2',first,11)).startAuthorized,true,'first of preexisting intents claims event');
    await rejected('buyer2',`select public.begin_creator_event_checkout('${other.id}','${uuid(12)}');`,'event_checkout_resolution_required');
  }else{
    const starts=await Promise.all([first,other].map((item,index)=>parallel(as('buyer2',`select public.begin_creator_event_checkout('${item.id}','${uuid(11+index)}');select pg_sleep(0.25);`))));
    check(starts.filter(result=>result.code===0).length,1,'native competing preexisting intents authorize only one start');
    check(starts.filter(result=>result.error.includes('event_checkout_resolution_required')).length,1,'native other intent retains unresolved-payment block');
  }

  const authorityOffer=await configure('show3');const authority=await buy('buyer3',authorityOffer);
  for(const status of ['archived','draft']){
    await sql(`update public.paid_creator_events set status='${status}' where id='${authorityOffer.id}';`);
    await rejected('buyer3',`select public.begin_creator_event_checkout('${authority.id}','${uuid(20)}');`,'event_checkout_source_unavailable');
    await sql(`update public.paid_creator_events set status='sandbox' where id='${authorityOffer.id}';`);
  }
  for(const key of ['digital_sales_enabled','creator_monetization_enabled','provider_webhooks_enabled','revenuecat_app_store_enabled']){
    await sql(`update public.platform_money_kill_switches set state='off' where key='${key}';`);
    await rejected('buyer3',`select public.begin_creator_event_checkout('${authority.id}','${uuid(20)}');`,'event_checkout_rail_unavailable');
    await sql(`update public.platform_money_kill_switches set state='sandbox_only' where key='${key}';`);
  }
  // Simulate a platform activation in this isolated fixture through the real
  // service-authorized guard; no activation guard or application check is removed.
  await sql("begin;set local request.jwt.claim.role='service_role';update public.platform_money_kill_switches set state='on' where key='live_money_enabled';commit;");
  await rejected('buyer3',`select public.begin_creator_event_checkout('${authority.id}','${uuid(20)}');`,'event_checkout_rail_unavailable');
  await sql("update public.platform_money_kill_switches set state='off' where key='live_money_enabled'");
  await sql(`update public.monetization_product_store_mappings set status='disabled' where provider_product_id='${authority.providerProductId}' and environment='sandbox';`);
  await rejected('buyer3',`select public.begin_creator_event_checkout('${authority.id}','${uuid(20)}');`,'event_checkout_price_unavailable');
  await sql(`update public.monetization_product_store_mappings set status='sandbox' where provider_product_id='${authority.providerProductId}' and environment='sandbox';`);
  const productStatus=await sql(`select p.status from public.monetization_products p join public.money_purchase_intents i on i.product_id=p.id where i.id='${authority.id}'`);
  await sql(`update public.monetization_products set status='disabled' where id=(select product_id from public.money_purchase_intents where id='${authority.id}');`);
  await rejected('buyer3',`select public.begin_creator_event_checkout('${authority.id}','${uuid(20)}');`,'event_checkout_price_unavailable');
  await sql(`update public.monetization_products set status=${literal(productStatus)} where id=(select product_id from public.money_purchase_intents where id='${authority.id}');`);
  for(const reverse of [false,true]){
    const host=actors.creator.id,buyer=actors.buyer3.id;
    await sql(`insert into public.channel_audience_blocks(channel_user_id,blocked_user_id,blocked_by_user_id)
      values('${reverse?buyer:host}','${reverse?host:buyer}','${reverse?buyer:host}');`);
    await rejected('buyer3',`select public.begin_creator_event_checkout('${authority.id}','${uuid(20)}');`,'event_checkout_blocked_by_audience_policy');
    await sql(`delete from public.channel_audience_blocks where channel_user_id='${reverse?buyer:host}' and blocked_user_id='${reverse?host:buyer}';`);
  }
  await sql(`update public.creator_events set visibility='circle' where id='${events.show3}';`);
  await rejected('buyer3',`select public.begin_creator_event_checkout('${authority.id}','${uuid(20)}');`,'event_checkout_source_unavailable');
  await sql(`update public.creator_events set visibility='public' where id='${events.show3}';
    update public.sandbox_monetization_testers set status='revoked' where user_id='${actors.buyer3.id}';`);
  await rejected('buyer3',`select public.begin_creator_event_checkout('${authority.id}','${uuid(20)}');`,'sandbox_monetization_tester_required');
  await sql(`update public.sandbox_monetization_testers set status='active' where user_id='${actors.buyer3.id}';`);
  check(Number(await sql(`select count(*) from public.event_ticket_reservations where purchase_intent_id='${authority.id}' and checkout_attempt_id is not null`)),0,'all late authority failures leave checkout unstarted');
  await configure('show3',299);
  check((await claim('buyer3',authority,20)).startAuthorized,true,'valid original reserved price survives a newer creator price');

  // Mutation control: removing only the unresolved-attempt predicate must
  // reproduce the original second-checkout bug, proving this guard matters.
  const definition=await sql("select pg_get_functiondef('private.event_checkout_resolution_required(uuid,uuid,uuid)'::regprocedure)");
  try{
    await sql("create or replace function private.event_checkout_resolution_required(p_buyer_id uuid,p_creator_event_id uuid,p_except_reservation_id uuid default null) returns boolean language sql volatile security definer set search_path='' as $$select false$$;");
    const replacement=await buy('buyer1',offer);
    check((await claim('buyer1',replacement,30)).startAuthorized,true,'negative control reproduces replacement checkout after expiry');
    check(Number(await sql(`select count(*) from public.event_ticket_reservations where buyer_id='${actors.buyer1.id}' and creator_event_id='${events.show1}' and checkout_attempt_id is not null`)),2,'negative control leaves two started reservations');
  }finally{await sql(definition);}
  check(Number(await sql('select count(*) from public.money_access_ledger_events')),0,'admission tests create no payment ledger or charge');
  check(await sql("select has_function_privilege('authenticated','private.event_checkout_resolution_required(uuid,uuid,uuid)','EXECUTE')"),embedded?'false':'f','unresolved-payment helper remains inaccessible to API roles');
  console.log(`Event checkout claims: ${checks} assertions passed; ${embedded?'embedded sequential SQL':'native concurrent PostgreSQL'}; no provider transport.`);
}finally{await database?.close();}
