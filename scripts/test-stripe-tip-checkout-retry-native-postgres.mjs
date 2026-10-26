#!/usr/bin/env node
// Only the calling task's disposable event-authority PostgreSQL fixture.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync,spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
const container=process.argv.find(v=>v.startsWith('--container='))?.slice(12);
assert.match(container??'',/^chillywood-event-offer-audit-[a-z0-9-]+$/);
const args=['exec','-i',container,'psql','-X','-h','/tmp','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-Atq'];
const sql=input=>execFileSync('docker',args,{input,encoding:'utf8',timeout:60_000}).trim();
assert.equal(sql("select to_regclass('event_reservation_fixture.actors')"),'event_reservation_fixture.actors');
if(!sql("select to_regprocedure('public.reserve_creator_tip_checkout_attempt(uuid,uuid,uuid,jsonb)')"))
  sql(fs.readFileSync(new URL('../supabase/migrations/20261026175927_creator_tip_checkout_retry_quotes.sql',import.meta.url),'utf8'));
const actors=[{user:randomUUID(),session:randomUUID()},{user:randomUUID(),session:randomUUID()}];
sql(`
  create schema if not exists stripe_checkout_retry_fixture;
  create table if not exists stripe_checkout_retry_fixture.actors(user_id uuid primary key,session_id uuid not null);
  insert into stripe_checkout_retry_fixture.actors values
    ('${actors[0].user}','${actors[0].session}'),('${actors[1].user}','${actors[1].session}');
  insert into auth.users(id,is_sso_user,is_anonymous,email_confirmed_at) select user_id,false,false,now() from stripe_checkout_retry_fixture.actors where user_id in('${actors[0].user}','${actors[1].user}');
  insert into auth.sessions(id,user_id) select session_id,user_id from stripe_checkout_retry_fixture.actors where user_id in('${actors[0].user}','${actors[1].user}');
  insert into public.wave1_legal_acceptances(user_id,subject_hash,document_key,document_version,market,role_key,capability,session_generation,authority_source)
    select a.user_id,public.wave1_sha256(a.user_id::text),d.document_key,d.version,d.market,'member',d.capability,a.session_id::text,'service_reconciliation'
    from stripe_checkout_retry_fixture.actors a cross join public.wave1_legal_document_versions d where d.active and d.market='UNITED_STATES' and d.capability='account'
      and a.user_id in('${actors[0].user}','${actors[1].user}');
`);
const creator=sql("select user_id from event_reservation_fixture.actors where kind='creator'");
const request=(actor,n)=>{
  const buyer=actors[actor-1].user,session=actors[actor-1].session;
  const requestId=`ed000000-0000-4000-8000-${String(n).padStart(12,'0')}`,tipId=randomUUID();
  const quote={tipId,creatorId:creator,amountCents:300,currency:'usd',privateNote:null,providerAccountId:'acct_fixture',body:{client_reference_id:tipId,
    'metadata[chillywood_tip_id]':tipId,'metadata[fan_user_id]':buyer,'metadata[creator_user_id]':creator,
    'line_items[0][price_data][currency]':'usd','line_items[0][price_data][unit_amount]':300,
    'payment_intent_data[transfer_data][destination]':'acct_fixture',mode:'payment',expires_at:Math.floor(Date.now()/1000)+3600}};
  return `select public.reserve_creator_tip_checkout_attempt('${buyer}','${session}','${requestId}','${JSON.stringify(quote)}'::jsonb);`;
};
const spawnSql=(input,onData,hold=false)=>{
  let output='',error='';const child=spawn('docker',args,{stdio:['pipe','pipe','pipe']});
  child.stdout.on('data',chunk=>{output+=chunk;onData?.(output);});child.stderr.on('data',chunk=>{error+=chunk;});
  const done=new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',code=>resolve({code,output,error}));});
  if(hold)child.stdin.write(input);else child.stdin.end(input);return {done,child};
};
const prefix="select set_config('request.jwt.claims','{\"role\":\"service_role\"}',false);";
async function race(first,second){
  let ready;const entered=new Promise(resolve=>{ready=resolve;});
  const a=spawnSql(`${prefix}begin;${first}\n`,out=>{if(out.includes('"tipId"'))ready();},true);
  await Promise.race([entered,a.done.then(r=>{throw new Error(r.error||'first transaction ended before lock barrier');})]);
  const name=`stripe-tip-race-${randomUUID()}`;
  const b=spawnSql(`set application_name='${name}';${prefix}${second}`);
  let blocked=false;
  try {
    const deadline=Date.now()+20_000;
    while(Date.now()<deadline){
      blocked=sql(`select count(*) from pg_stat_activity where application_name='${name}' and wait_event_type='Lock'`)==='1';
      if(blocked)break;await new Promise(resolve=>setTimeout(resolve,25));
    }
  } finally {a.child.stdin.end('commit;\n');}
  const results=await Promise.all([a.done,b.done]);assert.equal(blocked,true,'second native transaction demonstrably waits on first');return results;
}
const same=await race(request(1,1),request(1,1));
assert.equal(same[0].code,0,same[0].error);assert.equal(same[1].code,0,same[1].error);
const row=result=>JSON.parse(result.output.split('\n').find(line=>line.includes('"tipId"')));
assert.equal(row(same[0]).tipId,row(same[1]).tipId);
assert.deepEqual(row(same[0]).body,row(same[1]).body);
const different=await race(request(2,2),request(2,3));
assert.equal(different[0].code,0,different[0].error);assert.notEqual(different[1].code,0);
assert.match(different[1].error,/tip_checkout_previous_unresolved/);
assert.equal(sql(`select count(*) from public.creator_tip_transactions where sender_id in('${actors[0].user}','${actors[1].user}')`),'2');
console.log('Stripe checkout native PostgreSQL: 2 lock-observed races / 10 assertions passed; same request one tip, distinct concurrent request blocked');
