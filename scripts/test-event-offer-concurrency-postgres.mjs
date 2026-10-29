#!/usr/bin/env node
// Caller must create a dedicated disposable, network-isolated PostgreSQL
// container; never points at a shared/deployed database. Uses production SQL.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';

const container = process.argv.find(arg => arg.startsWith('--container='))?.slice(12);
assert.match(container ?? '', /^chillywood-event-offer-audit-[a-z0-9-]+$/, 'dedicated fixture container required');
const args = ['exec','-i',container,'psql','-X','-h','/tmp','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-Atq'];
const sql = input => execFileSync('docker', args, { input,encoding:'utf8',timeout:60_000 }).trim();
const parallel = input => new Promise((resolve,reject) => {
  const child = spawn('docker',args,{stdio:['pipe','pipe','pipe']});
  let output='',error='';
  const timer=setTimeout(()=>{child.kill();reject(new Error('fixture session timed out'));},60_000);
  child.stdout.on('data',chunk=>{output+=chunk;});
  child.stderr.on('data',chunk=>{error+=chunk;});
  child.on('error',reject);
  child.on('close',code=>{clearTimeout(timer);if(code===0)resolve(output.trim());else reject(new Error(error));});
  child.stdin.end(input);
});
const creator='11111111-1111-4111-8111-111111111111';
const event='33333333-3333-4333-8333-333333333333';
const save=`select set_config('fixture.actor','${creator}',false); select public.set_paid_creator_event_offer('${event}',null,99,1,'draft');`;
const fixture=execFileSync(process.execPath,['scripts/test-event-offer-lifecycle-postgres.mjs','--export-fixture'],{encoding:'utf8',timeout:30_000});
const reset='truncate public.paid_event_events,public.creator_event_transactions,public.paid_creator_event_passes,public.paid_creator_events cascade;';
let checks=0;
const check=(actual,expected,label)=>{assert.equal(actual,expected,label);checks++;};
sql(fixture);
await Promise.all([parallel(`begin; ${save} select pg_sleep(0.25); commit;`),parallel(`begin; ${save} commit;`)]);
check(Number(sql('select count(*) from public.paid_creator_events')),2,'negative control: concurrent original draft saves duplicate offers');
sql(reset);
sql(fs.readFileSync('supabase/migrations/20261026104519_creator_event_offer_lifecycle.sql','utf8'));
await Promise.all([parallel(`begin; ${save} select pg_sleep(0.25); commit;`),parallel(`begin; ${save} commit;`)]);
check(Number(sql('select count(*) from public.paid_creator_events')),1,'source row lock serializes concurrent first draft saves');
const offer=sql('select id from public.paid_creator_events');
sql(`update public.paid_creator_events set status='sandbox' where id='${offer}';`);
const insert=buyer=>`insert into public.paid_creator_event_passes(event_id,creator_event_id,buyer_id,creator_id) values ('${offer}','${event}','${buyer}','${creator}');`;
const buyers=['22222222-2222-4222-8222-222222222222','66666666-6666-4666-8666-666666666666'];
await Promise.all(buyers.map(buyer=>parallel(insert(buyer))));
check(Number(sql('select count(*) from public.paid_creator_event_passes')),2,'negative control: omitted capacity trigger oversells');
sql('truncate public.paid_creator_event_passes cascade;');
const source=fs.readFileSync('supabase/migrations/20260612201011_paid_events_v1_sandbox.sql','utf8');
const start=source.indexOf('create or replace function public."prevent_paid_creator_event_pass_oversell"()');
sql(source.slice(start,source.indexOf('$$;',start)+3));
sql('create trigger prevent_paid_creator_event_pass_oversell_insert before insert on public.paid_creator_event_passes for each row execute function public.prevent_paid_creator_event_pass_oversell();');
await Promise.all(buyers.map(buyer=>parallel(`begin; ${insert(buyer)} select pg_sleep(0.25); commit;`)));
check(Number(sql('select count(*) from public.paid_creator_event_passes')),1,'production capacity row lock prevents concurrent pass oversell');
check(Number(sql("select count(*) from public.paid_event_events where event_type='pass_blocked_sold_out'")),1,'losing admission records sold-out event');
console.log(`Event native PostgreSQL concurrency: ${checks} checks passed, including 2 negative controls. Production setter and pass trigger only; no Store charge or full provider fulfillment simulated.`);
