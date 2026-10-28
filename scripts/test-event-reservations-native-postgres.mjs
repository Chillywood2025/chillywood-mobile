#!/usr/bin/env node
// Runs against ONLY a caller-owned disposable full-schema PostgreSQL fixture.
import assert from 'node:assert/strict';
import {execFileSync,spawn} from 'node:child_process';
import fs from 'node:fs';
process.on('uncaughtException',error=>{console.error(error.message);if(error.where)console.error(error.where);if(error.stderr)console.error(error.stderr);process.exitCode=1;process.exit(1);});
const container=process.argv.find(a=>a.startsWith('--container='))?.slice(12);
const databaseName=process.argv.find(a=>a.startsWith('--database='))?.slice(11)??'postgres';
assert.match(databaseName,/^(postgres|event_reservation_[a-z0-9_]+)$/);
const embedded=process.argv.includes('--pglite');
if(!embedded) assert.match(container??'',/^chillywood-event-offer-audit-[a-z0-9-]+$/);
let database;
if(embedded){
  const {createDatabase}=await import('../tests/helpers/database-runtime-authority-fixture.mjs');
  ({db:database}=await createDatabase({includeHeldStudio:true,applyRepair:true}));
  await database.exec(fs.readFileSync(new URL('../tests/fixtures/event-reservation-authority.sql',import.meta.url),'utf8'));
}
const args=['exec','-i',container,'psql','-X','-h','/tmp','-U','postgres','-d',databaseName,'-v','ON_ERROR_STOP=1','-Atq'];
const sql=async input=>{
  if(!embedded) return execFileSync('docker',args,{input,encoding:'utf8',timeout:60000,stdio:['pipe','pipe','pipe']}).trim();
  try { const result=await database.exec(input);return result.flatMap(r=>r.rows.map(row=>Object.values(row).map(v=>typeof v==='object'?JSON.stringify(v):String(v)).join('|'))).join('\n'); }
  catch(error){await database.exec('rollback');throw error;}
};
const parallel=input=>new Promise((resolve,reject)=>{
  const child=spawn('docker',args,{stdio:['pipe','pipe','pipe']});let output='',error='';
  const timer=setTimeout(()=>{child.kill();reject(new Error('native fixture session timeout'));},60000);
  child.stdout.on('data',c=>{output+=c;});child.stderr.on('data',c=>{error+=c;});child.on('error',reject);
  child.on('close',code=>{clearTimeout(timer);resolve({code,output:output.trim(),error});});child.stdin.end(input);
});
const actors=JSON.parse(await sql("select jsonb_object_agg(kind,jsonb_build_object('id',user_id,'session',session_id)) from event_reservation_fixture.actors"));
const events=JSON.parse(await sql('select jsonb_object_agg(name,id) from event_reservation_fixture.events'));
const offset=Number(process.argv.find(a=>a.startsWith('--offset='))?.slice(9)??0);
for(let index=1;index<=16-offset;index++) events[`show${index}`]=events[`show${index+offset}`];
const literal=value=>`'${String(value).replaceAll("'","''")}'`;
const as=(actor,statement,platform='ios')=>`begin; set local role authenticated; set local request.jwt.claims=${literal(JSON.stringify({role:'authenticated',sub:actors[actor].id,session_id:actors[actor].session}))}; set local request.headers=${literal(JSON.stringify({'x-chillywood-platform':platform}))}; ${statement} commit;`;
const read=async (actor,statement,platform)=>JSON.parse((await sql(as(actor,`select ${statement};`,platform))).split('\n').at(-1));
let checks=0;
const check=(actual,expected,message)=>{assert.deepEqual(actual,expected,message);checks++;console.log(`ok ${checks} - ${message}`);};
const rejected=async (actor,statement,reason)=>{
  let error;try {await sql(as(actor,statement));}catch(e){error=String(e.stderr??e);}
  assert.match(error??'',new RegExp(reason));checks++;console.log(`ok ${checks} - rejects ${reason}`);
};
const configure=(name,price=99,capacity=1,status='sandbox',open="now()-interval '1 hour'",close="now()+interval '1 day'")=>read('creator',
  `public.configure_paid_creator_event_sale('${events[name]}','Live online show; no replay',${price},${capacity??'null'},'${status}','America/New_York',${open},${close})`);
const buy=(buyer,offer,platform='ios')=>read(buyer,`public.create_reserved_creator_event_purchase_intent('${offer.id}','${offer.termsRevisionId}')`,platform);
const provider=async (buyer,intent,eventId,purchasedAt=intent.createdAt)=>JSON.parse((await sql(`begin; set local role service_role; set local request.jwt.claims='{"role":"service_role"}';
  select public.process_revenuecat_app_store_event_atomic('${eventId}-${offset}','NON_RENEWING_PURCHASE','${actors[buyer].id}',
    '${intent.providerProductId}','sandbox',now(),null,${intent.amountMinor},'usd',repeat('a',64),'tx-${eventId}-${offset}',null,'${purchasedAt}'); commit;`)).split('\n').at(-1));

if(!process.argv.includes('--validation-only')&&!process.argv.includes('--capacity-only')){
if(!process.argv.includes('--resume-negative')){
const offer=await configure('show1');
check(offer.terms.attendance,'virtual','configured explicit virtual immutable terms');
check(offer.timeZone,'America/New_York','IANA zone is retained');
const intent=await buy('buyer1',offer);
check(intent.reservation.state,'held','actual iOS issuance creates capacity hold');
check(intent.reservation.termsRevisionId,offer.termsRevisionId,'intent binds displayed revision');
check((await read('buyer1',`public.read_my_creator_event_reservation('${intent.id}')`)).id,intent.reservation.id,'owner pre-SDK reservation readback');
await rejected('buyer2',`select public.read_my_creator_event_reservation('${intent.id}');`,'event_reservation_not_found');
check(Number(await sql(as('buyer2','select count(*) from public.event_ticket_reservations;'))),0,'RLS hides another buyer reservation');
await rejected('buyer2',`select public.create_reserved_creator_event_purchase_intent('${offer.id}','${offer.termsRevisionId}');`,'event_sold_out');
const paused=await configure('show1',99,1,'paused');
check(paused.salesPaused,true,'pause preserves paid status');
check(paused.status,'sandbox','pause is not free conversion');
const receipt=await provider('buyer1',intent,'event-reservation-on-time');
check(receipt.status,'processed','real provider projector records receipt');
check((await read('buyer1',`public.read_my_creator_event_reservation('${intent.id}')`)).state,'fulfilled','actual provider transaction consumes held reservation');
check(Number(await sql(`select count(*) from public.paid_creator_event_passes where creator_event_id='${events.show1}' and status='active'`)),1,'provider projection grants one ticket');
await provider('buyer1',intent,'event-reservation-on-time');
check(Number(await sql(`select count(*) from public.paid_creator_event_passes where creator_event_id='${events.show1}' and status='active'`)),1,'duplicate receipt does not duplicate ticket');
await configure('show1',299,1);
check((await read('buyer1',`public.resolve_paid_creator_event_pass_access('${events.show1}')`)).allowed,true,'historical ticket survives creator price revision');
check(Number(await sql(`select amount_minor from public.money_purchase_intents where id='${intent.id}'`)),99,'original purchase economics immutable after revision');

const future=await configure('show2',99,1,'sandbox',"now()+interval '1 hour'");
await rejected('buyer2',`select public.create_reserved_creator_event_purchase_intent('${future.id}','${future.termsRevisionId}');`,'event_sales_not_open');
await rejected('creator',`update public.creator_events set time_zone='Mars/Olympus' where id='${events.show2}';`,'event_time_zone_invalid');
await rejected('creator',`update public.creator_event_offer_revisions set terms='{}' where id='${future.termsRevisionId}';`,'permission denied');
await rejected('creator',`select public.configure_paid_creator_event_sale('${events.show2}','Online',99,1,'draft','America/New_York',now()-interval '1 hour',now()+interval '1 day');`,'event_published_offer_cannot_become_draft');
await rejected('creator',`select public.configure_paid_creator_event_sale('${events.show2}','Online',99,1,'sandbox','America/New_York','-infinity'::timestamptz,now()+interval '1 day');`,'event_sale_window_invalid');
const creatorPreview=await sql(`select updated_at::text from public.creator_events where id='${events.show2}'`);
await sql(as('creator',`update public.creator_events set event_title=event_title||' revised',updated_at=clock_timestamp() where id='${events.show2}';`));
await rejected('creator',`select public.configure_paid_creator_event_sale('${events.show2}','Online',99,1,'sandbox','America/New_York',now()-interval '1 hour',now()+interval '1 day','${creatorPreview}');`,'event_changed_refresh_required');

const capacity=await configure('show3',99,1);
const issue=buyer=>as(buyer,`select public.create_reserved_creator_event_purchase_intent('${capacity.id}','${capacity.termsRevisionId}');`);
if(!embedded){
  const results=await Promise.all(['buyer3','buyer4'].map(buyer=>parallel(issue(buyer))));
  check(results.filter(r=>r.code===0).length,1,'two native sessions competing for last place admit exactly one');
  check(results.some(r=>r.error.includes('event_sold_out')),true,'losing native checkout reports sold out');
}else{
  await buy('buyer3',capacity);
  await rejected('buyer4',`select public.create_reserved_creator_event_purchase_intent('${capacity.id}','${capacity.termsRevisionId}');`,'event_sold_out');
}
check(Number(await sql(`select public.event_ticket_inventory_internal('${events.show3}')`)),1,'capacity counts a precharge hold');
await rejected('creator',`select public.configure_paid_creator_event_sale('${events.show3}','Online',99,0,'sandbox','America/New_York',now()-interval '1 hour',now()+interval '1 day');`,'event_capacity_below_committed');
}

// Deliberately remove ONLY inventory accounting in the owned fixture, leaving
// session/legal/source/provider authority real. This negative control must
// demonstrate two held claims for one place, then restore production SQL.
const inventorySQL=fs.readFileSync(new URL('../supabase/migrations/20261026164032_scheduled_virtual_event_reservations.sql',import.meta.url),'utf8');
const inventoryStart=inventorySQL.indexOf('create function public.event_ticket_inventory_internal');
const inventoryDefinition=inventorySQL.slice(inventoryStart,inventorySQL.indexOf('$$;',inventoryStart)+3).replace('create function','create or replace function');
const negative=await configure('show4',99,1);
try{
  await sql("create or replace function public.event_ticket_inventory_internal(p_creator_event_id uuid) returns integer language sql volatile security definer set search_path='' as 'select 0';");
  const calls=['buyer7','buyer8'].map(buyer=>as(buyer,`select public.create_reserved_creator_event_purchase_intent('${negative.id}','${negative.termsRevisionId}');`));
  if(embedded){for(const call of calls)await sql(call);}else check((await Promise.all(calls.map(parallel))).filter(r=>r.code===0).length,2,'negative control admits both sessions when reservation accounting is removed');
  check(Number(await sql(`select count(*) from public.event_ticket_reservations where creator_event_id='${events.show4}' and state='held'`)),2,'negative control reproduces precharge oversubscription');
}finally{await sql(inventoryDefinition);}

const short=await configure('show5',99,1,'sandbox',"now()-interval '1 hour'","now()+interval '12 seconds'");
const late=await buy('buyer5',short);
await new Promise(resolve=>setTimeout(resolve,13000));
check((await read('buyer5',`public.read_my_creator_event_reservation('${late.id}')`)).state,'expired','elapsed hold is visibly expired before provider receipt');
check((await provider('buyer5',late,'event-reservation-late-free')).status,'processed','late receipt recovers original place while capacity remains');
check((await read('buyer5',`public.read_my_creator_event_reservation('${late.id}')`)).state,'fulfilled','late recovery consumes original reservation');

const shortFull=await configure('show6',99,1,'sandbox',"now()-interval '1 hour'","now()+interval '12 seconds'");
const lateFull=await buy('buyer6',shortFull);
await new Promise(resolve=>setTimeout(resolve,13000));
const reopened=await configure('show6',99,1);
await buy('buyer9',reopened);
const rejectedReceipt=await provider('buyer6',lateFull,'event-reservation-late-full');
check(rejectedReceipt.status,'ignored','late receipt cannot displace another valid hold');
check((await read('buyer6',`public.read_my_creator_event_reservation('${lateFull.id}')`)).state,'reconciliation_required','paid but unfulfilled receipt remains visible for resolution');
check(Number(await sql(`select count(*) from public.paid_creator_event_passes where creator_event_id='${events.show6}' and status='active'`)),0,'late full receipt grants no ticket');

const generic=await configure('show7',99,2);
const genericIntent=await read('buyer10',`public.create_money_purchase_intent('event_pass_sandbox_099','event','${events.show7}','{"amount_minor":99}'::jsonb)`,'android');
check((await read('buyer10',`public.read_my_creator_event_reservation('${genericIntent.id}')`)).state,'held','generic Android old-client path cannot bypass reservation');
const legacyIntent=await read('buyer11',`public.create_paid_creator_event_pass_purchase_intent('${generic.id}')`,'ios');
check((await read('buyer11',`public.read_my_creator_event_reservation('${legacyIntent.id}')`)).state,'held','specialized old-client path cannot bypass reservation');
await rejected('creator',`select public.configure_paid_creator_event_sale('${events.show7}','Online',99,1,'sandbox','America/New_York',now()-interval '1 hour',now()+interval '1 day');`,'event_capacity_below_committed');

const changed=await configure('show8',99,2);
const fixed=await buy('buyer12',changed);
await configure('show8',299,2);
check((await provider('buyer12',fixed,'event-reservation-quoted-price')).status,'processed','payment uses original immutable price after creator edit');
check(Number(await sql(`select amount_cents from public.creator_event_transactions where creator_event_id='${events.show8}'`)),99,'creator transaction retains purchase-bound amount');

const stale=await configure('show9',99,1);
const staleIntent=await buy('buyer20',stale);
await sql(`delete from auth.sessions where id='${actors.buyer20.session}';`);
await rejected('buyer20',`select public.read_my_creator_event_reservation('${staleIntent.id}');`,'buyer_session_authority_required');
check(Number(await sql(as('buyer20','select count(*) from public.event_ticket_reservations;'))),0,'stale session cannot read reservation rows through RLS');

const rescheduled=await configure('show10',99,1);
const originalTime=await buy('buyer13',rescheduled);
await rejected('creator',`update public.creator_events set starts_at=starts_at+interval '1 hour',ends_at=ends_at+interval '1 hour' where id='${events.show10}';`,'purchased_event_lifecycle_management_required');
await sql(as('creator',`select public.manage_creator_event_lifecycle(id,'reschedule',updated_at,starts_at+interval '1 hour',ends_at+interval '1 hour',time_zone,'The show has moved by one hour.',true) from public.creator_events where id='${events.show10}';`));
check((await provider('buyer13',originalTime,'event-reservation-changed-show')).status,'ignored','changed show time cannot silently replace purchased terms');
check((await read('buyer13',`public.read_my_creator_event_reservation('${originalTime.id}')`)).state,'reconciliation_required','changed paid attempt is preserved for resolution');
const newer=await configure('show11',99,1);
const newerIntent=await buy('buyer14',newer);
check((await provider('buyer14',newerIntent,'event-reservation-old-receipt',new Date(Date.parse(newerIntent.createdAt)-86400000).toISOString())).status,'ignored','old purchase timestamp cannot claim a newer reservation');
check(Number(await sql(`select count(*) from public.paid_creator_event_passes where creator_event_id='${events.show11}'`)),0,'unbound old receipt creates no ticket');
const duplicate=await configure('show12',99,5);
const duplicateCall=as('buyer15',`select public.create_reserved_creator_event_purchase_intent('${duplicate.id}','${duplicate.termsRevisionId}');`);
if(!embedded){
  check((await Promise.all([parallel(duplicateCall),parallel(duplicateCall)])).filter(result=>result.code===0).length,1,
    'same buyer concurrent checkout cannot create a second hold');
}else{
  await buy('buyer15',duplicate);
  await rejected('buyer15',`select public.create_reserved_creator_event_purchase_intent('${duplicate.id}','${duplicate.termsRevisionId}');`,'purchase_intent');
}
check(Number(await sql(`select count(*) from public.event_ticket_reservations where creator_event_id='${events.show12}' and buyer_id='${actors.buyer15.id}'`)),1,
  'same source and buyer retain exactly one reservation');
}

if(!process.argv.includes('--capacity-only')){
const beforeSDK=await configure('show13',99,1);
const preSDKIntent=await buy('buyer16',beforeSDK);
await sql(as('creator',`select public.manage_creator_event_lifecycle(id,'reschedule',updated_at,starts_at+interval '1 hour',ends_at+interval '1 hour',time_zone,'The show has moved by one hour.',true) from public.creator_events where id='${events.show13}';`));
await rejected('buyer16',`select public.read_my_creator_event_reservation('${preSDKIntent.id}');`,'event_reservation_terms_changed');
const cancelSDK=await configure('show14',99,1);
const cancelIntent=await buy('buyer17',cancelSDK);
await rejected('creator',`update public.creator_events set status='canceled' where id='${events.show14}';`,'purchased_event_lifecycle_management_required');
await sql(as('creator',`select public.manage_creator_event_lifecycle(id,'cancel',updated_at,null,null,null,'The creator canceled this show.') from public.creator_events where id='${events.show14}';`));
await rejected('buyer17',`select public.read_my_creator_event_reservation('${cancelIntent.id}');`,'event_reservation_source_unavailable');
const invalidReplayWrite=`update public.creator_events set replay_policy='until_expiration',replay_expires_at=ends_at-interval '1 hour' where id='${events.show15}';`;
await rejected('creator',invalidReplayWrite,'event_replay_explicit_window_required');
// Seed the legacy invalid tuple only in this caller-owned disposable fixture;
// the active guard above proves normal current writes cannot create it.
await sql(as('creator',invalidReplayWrite)
  .replace('begin;','begin; alter table public.creator_events disable trigger guard_creator_event_explicit_replay_terms;')
  .replace('commit;','reset role; alter table public.creator_events enable trigger guard_creator_event_explicit_replay_terms; commit;'));
const configureSignature='public.configure_paid_creator_event_sale(uuid,text,integer,integer,text,text,timestamptz,timestamptz,timestamptz)';
const originalConfigure=await sql(`select pg_get_functiondef('${configureSignature}'::regprocedure)`);
const missingReplayValidation=originalConfigure.replace(/  if e\.replay_policy='until_expiration'[\s\S]*?then raise exception 'event_replay_expiry_must_follow_show'; end if;/,'');
assert.notEqual(missingReplayValidation,originalConfigure);
const invalidReplaySale=`select public.configure_paid_creator_event_sale('${events.show15}','Online',99,1,'sandbox','America/New_York',now()-interval '1 hour',now()+interval '1 day');`;
// Mutants and disabled triggers are transaction-scoped and rolled back, even
// when PostgreSQL aborts the assertion. No altered source survives a check.
let revisionGuardError;
try { await sql(as('creator',invalidReplaySale).replace('begin;',`begin; ${missingReplayValidation};`).replace('commit;','rollback;')); }
catch(error){revisionGuardError=String(error.stderr??error);}
assert.match(revisionGuardError??'',/event_replay_explicit_window_required/);checks++;console.log(`ok ${checks} - new immutable revision guard still rejects legacy invalid terms without old RPC ordering check`);
const unsafeReplay=JSON.parse((await sql(as('creator',invalidReplaySale)
  .replace('begin;',`begin; ${missingReplayValidation}; alter table public.creator_event_offer_revisions disable trigger guard_creator_event_offer_explicit_replay_terms;`)
  .replace('commit;','rollback;'))).split('\n').at(-1));
check(unsafeReplay.terms.replayPolicy,'until_expiration','negative control sells invalid replay only when both RPC and immutable revision guards are absent');
check(await sql(`select pg_get_functiondef('${configureSignature}'::regprocedure)`),originalConfigure,'negative control restores exact production function');
await rejected('creator',`select public.configure_paid_creator_event_sale('${events.show15}','Online',99,1,'sandbox','America/New_York',now()-interval '1 hour',now()+interval '1 day');`,'event_replay_expiry_must_follow_show');
}
const legacyCapacity=await configure('show16',99,2);
await buy('buyer18',legacyCapacity);await buy('buyer19',legacyCapacity);
try{
  await sql('alter table public.paid_creator_events disable trigger guard_event_ticket_capacity_floor');
  const unsafe=await read('creator',`public.set_paid_creator_event_offer('${events.show16}','Online',99,1,'sandbox')`);
  check(unsafe.capacityLimit,1,'negative control legacy setter accepts capacity below two valid holds without table guard');
  await read('creator',`public.set_paid_creator_event_offer('${events.show16}','Online',99,2,'sandbox')`);
}finally{await sql('alter table public.paid_creator_events enable trigger guard_event_ticket_capacity_floor');}
await rejected('creator',`select public.set_paid_creator_event_offer('${events.show16}','Online',99,1,'sandbox');`,'event_capacity_below_committed');
const staleCreatorSQL=disabled=>`begin; ${disabled?'alter table public.paid_creator_events disable trigger guard_event_offer_current_actor;':''}
  update auth.sessions set not_after=now()-interval '1 second' where id='${actors.creator.session}';
  set local role authenticated; set local request.jwt.claims=${literal(JSON.stringify({role:'authenticated',sub:actors.creator.id,session_id:actors.creator.session}))};
  select public.set_paid_creator_event_offer('${events.show16}','Online',99,2,'paused'); reset role; rollback;`;
check(JSON.parse((await sql(staleCreatorSQL(true))).split('\n').at(-1)).status,'paused','negative control legacy inactive setter accepts retired creator session without actor guard');
let staleCreatorError;try{await sql(staleCreatorSQL(false));}catch(error){staleCreatorError=String(error.stderr??error);}
assert.match(staleCreatorError??'',/creator_session_authority_required/);checks++;console.log(`ok ${checks} - legacy inactive setter rejects retired creator session`);

console.log(`${embedded?'Embedded':'Native'} scheduled-event reservations: ${checks} assertions passed.`);

if(database) await database.close();
