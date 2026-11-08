#!/usr/bin/env node
// Owned empty database in the existing local CLI container; no remote URL,
// provider call, production data, or persistent server/configuration changes.
import assert from 'node:assert/strict';
import {execFileSync,spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
assert.equal(process.argv.length,2);
const container=process.env.SUPABASE_DB_CONTAINER??'supabase_db_chillywood-mobile';
assert.match(container,/^supabase_db_[A-Za-z0-9_.-]+$/u);
const database=`ticket_capacity_${randomUUID().replaceAll('-','')}`;
const args=db=>['exec','-i',container,'psql','-X','-U','postgres','-d',db,'-v','ON_ERROR_STOP=1','-Atq'];
const query=(sql,db=database)=>execFileSync('docker',args(db),{input:sql,encoding:'utf8',timeout:20000,stdio:['pipe','pipe','pipe']}).trim();
const parallel=(sql,hold)=>new Promise((resolve,reject)=>{
 const child=spawn('docker',args(database),{stdio:['pipe','pipe','pipe']});let error='';
 const timer=setTimeout(()=>{child.kill();reject(Error('owned capacity session timeout'));},15000);
 child.stderr.on('data',x=>{error+=x;});child.stdout.resume();
 child.on('error',reject);child.on('close',code=>{clearTimeout(timer);resolve({code,error});});
 if(hold){child.stdin.write(sql+'\n');hold(child.stdin);}else child.stdin.end(sql);
});
const offer='00000000-0000-4000-8000-000000000001';
const grant=n=>`insert into public.access_grants(id,user_id,grant_type,source_id,provider_event_id,status,starts_at,environment)
 values(gen_random_uuid(),'00000000-0000-4000-8000-00000000000${n}','watch_party_live_ticket','${offer}',
 '00000000-0000-4000-8000-00000000000${n+2}','sandbox_only',now()-interval '1 minute','sandbox')`;
let created=false,holder,pending,holderInput;
try{
 assert.match(query('select version()','postgres'),/^PostgreSQL 17\./u);
 query(`create database ${database}`,'postgres');created=true;
 query("set time zone 'UTC';"+readFileSync('tests/fixtures/paid-party-capacity-component.sql','utf8')+
 readFileSync('supabase/migrations/20261108095500_paid_party_ticket_capacity_accounting.sql','utf8')+`
 create trigger insert_guard before insert on public.paid_watch_party_tickets for each row execute function public.prevent_paid_watch_party_ticket_oversell();
 create trigger sync_grant after insert or update on public.access_grants for each row execute function public.sync_paid_watch_party_ticket_from_access_grant();
 insert into public.paid_watch_party_offers(id,party_id,seat_limit,status,price_cents,currency)values('${offer}','TEST',1,'active',99,'usd');
 insert into public.provider_events(id,provider_event_id,metadata)values
 ('00000000-0000-4000-8000-000000000004','first','{}'),('00000000-0000-4000-8000-000000000005','second','{}');`);
 holder=parallel(`set time zone 'UTC';set application_name='capacity_holder';begin;${grant(2)};`,input=>{holderInput=input;});
 let ready=false;for(let i=0;i<50;i++){
  ready=query("select exists(select 1 from pg_stat_activity where datname=current_database() and application_name='capacity_holder' and state='idle in transaction')")==='t';
  if(ready)break;await new Promise(r=>setTimeout(r,20));
 }
 assert.equal(ready,true,'first buyer holds uncommitted capacity');
 pending=parallel(`set time zone 'UTC';set application_name='capacity_challenger';begin;${grant(3)};commit;`);
 let blocked=false;for(let i=0;i<50;i++){
  blocked=query("select exists(select 1 from pg_stat_activity a join pg_stat_activity h on h.datname=a.datname and h.application_name='capacity_holder' where a.datname=current_database() and a.application_name='capacity_challenger' and h.pid=any(pg_blocking_pids(a.pid)))")==='t';
  if(blocked)break;await new Promise(r=>setTimeout(r,20));
 }
 assert.equal(blocked,true,'second buyer actually waits on first transaction');
 holderInput.end('commit;\n');
 assert.equal((await holder).code,0);const losing=await pending;
 assert.notEqual(losing.code,0);assert.match(losing.error,/room_admission_sold_out/);
 assert.equal(query("select concat((select count(*) from public.access_grants),',',(select count(*) from public.paid_watch_party_tickets),',',(select count(*) from public.creator_room_ticket_transactions),',',(select count(*) from public.room_ticket_events where event_type='ticket_verified'))"),'1,1,1,1');
 console.log('Native PostgreSQL17 competing-buyer lock/rollback checks passed; no provider transport.');
}finally{
 if(holderInput&&!holderInput.writableEnded)holderInput.end('rollback;\n');
 await Promise.allSettled([holder,pending].filter(Boolean));
 if(created)query(`drop database ${database}`,'postgres');
}
