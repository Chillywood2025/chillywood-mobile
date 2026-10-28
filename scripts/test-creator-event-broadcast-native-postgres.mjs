#!/usr/bin/env node
// Caller-owned, network-isolated fixture only. Never use a remote connection.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync,spawn} from 'node:child_process';

const container=process.argv.find(arg=>arg.startsWith('--container='))?.slice(12);
const database=process.argv.find(arg=>arg.startsWith('--database='))?.slice(11);
assert.match(container??'',/^chillywood-event-offer-audit-[a-z0-9-]+$/);
assert.match(database??'',/^event_reservation_broadcast[a-z0-9_]*$/);
const args=['exec','-i',container,'psql','-X','-h','/tmp','-U','postgres','-d',database,'-v','ON_ERROR_STOP=1','-Atq'];
const sql=input=>execFileSync('docker',args,{input,encoding:'utf8',timeout:60_000,stdio:['pipe','pipe','pipe']}).trim();
const parallel=input=>new Promise((resolve,reject)=>{
  const child=spawn('docker',args,{stdio:['pipe','pipe','pipe']});let output='',error='';
  const timer=setTimeout(()=>{child.kill();reject(Error('native broadcast session timeout'));},60_000);
  child.stdout.on('data',chunk=>{output+=chunk;});child.stderr.on('data',chunk=>{error+=chunk;});
  child.on('error',reject);child.on('close',code=>{clearTimeout(timer);resolve({code,output:output.trim(),error});});child.stdin.end(input);
});
if(!process.argv.includes('--prepared')) {
  sql(fs.readFileSync('tests/fixtures/event-reservation-authority.sql','utf8'));
  sql(fs.readFileSync('tests/fixtures/event-broadcast-producer-authority.sql','utf8'));
}
assert.equal(Number(sql('select count(*) from event_reservation_fixture.broadcast_assertions')),33);
const context=JSON.parse(sql('select row_to_json(context) from event_reservation_fixture.broadcast_context context'));
const refresh=`select set_config('request.jwt.claims','{"role":"service_role"}',false);
select public.heartbeat_creator_event_broadcast_worker();
update public.watch_party_room_memberships set last_seen_at=clock_timestamp() where user_id='${context.host_id}';`;
sql(refresh);
const claim=`begin;set local request.jwt.claims='{"role":"service_role"}';
select public.claim_creator_event_broadcast_start('${context.event_id}','${context.host_id}','${context.session_id}');commit;`;
const results=await Promise.all([parallel(claim),parallel(claim)]);
assert.ok(results.every(result=>result.code===0),JSON.stringify(results));
const rows=results.map(result=>JSON.parse(result.output));
assert.equal(rows.filter(row=>row.claimed).length,1,'only one concurrent retry dispatch is authorized');
assert.equal(rows[0].attemptId,rows[1].attemptId,'loser observes the exact winning attempt');
assert.equal(Number(sql(`select count(*) from private.creator_event_broadcast_attempts where creator_event_id='${context.event_id}' and generation=3`)),1);
assert.equal(Number(sql(`select count(distinct stop_at) from private.creator_event_broadcast_attempts where creator_event_id='${context.event_id}'`)),1,'all retries retain original deadline');
// A negative control removing only the partial uniqueness guard demonstrates
// that the database invariant itself rejects duplicate unresolved attempts.
const duplicate=`insert into private.creator_event_broadcast_attempts(id,creator_event_id,creator_id,creator_session_id,party_id,
broadcast_session_id,approval_id,assignment_id,server_id,livekit_room_name,rights_status,private_origin,max_minutes,
approval_expires_at,output_prefix,state,started_at,stop_at,generation,event_terms)
select gen_random_uuid(),creator_event_id,creator_id,creator_session_id,party_id,gen_random_uuid(),approval_id,
assignment_id,server_id,livekit_room_name,rights_status,private_origin,max_minutes,approval_expires_at,
'fixture-negative-'||gen_random_uuid()::text,'starting',clock_timestamp(),stop_at,generation+1,event_terms
from private.creator_event_broadcast_attempts where id='${rows[0].attemptId}';`;
assert.throws(()=>sql(duplicate),/creator_event_broadcast_one_unresolved_attempt/);
const mutant=sql(`begin;drop index private.creator_event_broadcast_one_unresolved_attempt;${duplicate}
select count(*) from private.creator_event_broadcast_attempts where creator_event_id='${context.event_id}' and state='starting';rollback;`);
assert.equal(Number(mutant),2,'negative control admits two unresolved attempts without invariant');
sql(fs.readFileSync('tests/fixtures/event-broadcast-self-start.sql','utf8'));
assert.equal(Number(sql('select count(*) from event_reservation_fixture.self_start_assertions')),19);
console.log('Native broadcast recovery: 33 production SQL assertions, one concurrent retry winner, same original deadline, duplicate-invariant negative control passed. Self-start: 19 SQL assertions, two shows with one finite creator qualification and no per-show approvals. No provider transport.');
