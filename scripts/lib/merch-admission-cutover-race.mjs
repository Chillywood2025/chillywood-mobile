// Only called inside the registered runner's generated disposable local clone.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {assessMerchAdmissionDrain} from './merch-admission-drain.mjs';

export async function runMerchAdmissionCutoverRace({query,rpc,session,until,auth,actors,lit}) {
 const pause=readFileSync('scripts/operations/merch-checkout-admission-pause.sql','utf8');
 const drain=readFileSync('scripts/operations/merch-checkout-admission-drain.sql','utf8');
 const signature='public.reserve_merch_checkout_for_actor_with_tracking(uuid,uuid,uuid,integer,uuid,uuid,text,integer,text)';
 const newSignature='public.reserve_merch_checkout_dispatch(uuid,uuid,uuid,integer,uuid,uuid,text,integer,text)';
 // Reconstruct the old admission grant ONLY in this disposable synthetic clone.
 query(`grant execute on function ${signature} to service_role;`);
 query(`revoke execute on function ${newSignature} from service_role;`);
 query(`begin;${pause}rollback;`);
 assert.equal(query(`select has_function_privilege('service_role',${lit(signature)},'EXECUTE')`),'t','failed/rolled-back pause must not partly revoke');
 const baseline=JSON.parse(query(drain));assessMerchAdmissionDrain(baseline);
 // track_activities is superuser-only. Supabase's postgres is intentionally
 // not a superuser; use the existing disposable-clone admin transport for
 // this session only, never grant it new privilege or change server config.
 const untracked=session("set track_activities=off;select 'UNTRACKED_READY';",{admin:true});
 await until(()=>{
  if(untracked.child.exitCode!==null)throw Error(`untracked fixture exited: ${JSON.stringify(untracked.diagnostics())}`);
  return untracked.output().includes('UNTRACKED_READY');
 },'untracked fixture not ready');
 await until(()=>JSON.parse(query(drain)).unknownActivityRows>0,'disabled activity did not become visible');
 assert.throws(()=>assessMerchAdmissionDrain(JSON.parse(query(drain)),{baseline}),'disabled activity must fail closed');
 untracked.child.stdin.end();assert.equal((await untracked.done).code,0);
 const product=randomUUID(),attempt=randomUUID();
 query(`insert into public.merch_products(id,creator_id,display_name,title,provider,status,fulfillment_model,price_minor,currency,
  environment,is_physical_good,creates_digital_access,publication_status,stock_quantity,shipping_tracking_mode)
  values(${lit(product)},${lit(actors.creator.id)},'Cutover','Cutover','stripe_physical_goods','sandbox','manual',1000,'usd','sandbox',true,false,'published',10,'tracked');`);
 const parameters=`(${lit(actors.buyer1.id)},${lit(actors.buyer1.session)},${lit(product)},1,${lit(attempt)},null,'tracked',1000,'usd')`;
 const old=`public.reserve_merch_checkout_for_actor_with_tracking${parameters}`;
 const holder=session("begin;select private.platform_brand_retention_lock();select 'CUTOVER_HOLDER_READY';");
 await until(()=>holder.output().includes('CUTOVER_HOLDER_READY'),'cutover latch holder not ready');
 const waiter=session(`begin;${auth('buyer1','service_role')}select ${old};select 'CUTOVER_WAITER_READY';`);
 const row=()=>JSON.parse(query(`select jsonb_build_object('pid',w.pid,'transactionStart',w.xact_start,'state',w.state,
  'waitType',w.wait_event_type,'blockers',pg_blocking_pids(w.pid),'holderPid',h.pid)
  from pg_stat_activity w cross join pg_stat_activity h
  where w.datname=current_database() and h.datname=current_database()
   and w.application_name=${lit(waiter.name)} and h.application_name=${lit(holder.name)}`)||'null');
 await until(()=>{const r=row();return r?.waitType==='Lock'&&r.blockers.includes(r.holderPid);},'preauthorized reservation did not block on actual global latch');
 const blocked=row();console.log(JSON.stringify({schedule:'preauthorized reservation survives admission revoke and must drain',...blocked}));
 holder.child.stdin.end(`${pause}commit;\n`);
 const held=await holder.done;assert.equal(held.code,0,held.stderr);
 // Cutoff is sampled AFTER commit acknowledgement, never transaction start.
 const cutoff=query('select clock_timestamp()');
 assert.equal(query(`select has_function_privilege('service_role',${lit(signature)},'EXECUTE')`),'f');
 await until(()=>waiter.output().includes('CUTOVER_WAITER_READY'),'preauthorized waiter did not finish allocation');
 await until(()=>JSON.parse(query(drain)).transactions.some(r=>r.pid===blocked.pid&&r.state==='idle in transaction'),'waiter did not become idle in transaction');
 const snapshot=JSON.parse(query(drain));
 assert.equal(assessMerchAdmissionDrain(snapshot,{baseline,cutoff}).drained,false);
 const waiting=snapshot.transactions.find(r=>r.pid===blocked.pid);
 assert.ok(waiting,'idle pre-cutoff transaction must remain visible to drain');
 assert.equal(waiting.state,'idle in transaction');
 assert.ok(Date.parse(waiting.transactionStart)<=Date.parse(cutoff));
 const denied=session(`begin;${auth('buyer1','service_role')}select ${old};commit;`);denied.child.stdin.end();
 const rejection=await denied.done;assert.notEqual(rejection.code,0);assert.match(rejection.stderr,/permission denied for function reserve_merch_checkout_for_actor_with_tracking/);
 waiter.child.stdin.end('commit;\n');const finished=await waiter.done;assert.equal(finished.code,0,finished.stderr);
 const after=JSON.parse(query(drain));
 assert.equal(assessMerchAdmissionDrain(after,{baseline,cutoff}).drained,true);
 assert.ok(!after.transactions.some(r=>r.pid===blocked.pid));assert.equal(after.preparedTransactions,0);
 assert.equal(query(`select reserved_quantity from public.merch_products where id=${lit(product)}`),'1');
 // Owner-mediated new wrapper still calls retained implementation; exact old
 // attempt remains historical, never receives retroactive prepared provenance.
 // Model the forward migration's new grant only AFTER the database drain.
 query(`grant execute on function ${newSignature} to service_role;`);
 const retried=rpc(`public.reserve_merch_checkout_dispatch${parameters}`,'service_role','buyer1');
 assert.ok(retried.id);
 assert.equal(query(`select count(*) from private.merch_checkout_dispatch where order_id=${lit(retried.id)}`),'0');
 assert.equal(query(`select reserved_quantity from public.merch_products where id=${lit(product)}`),'1');
 console.log('PASS native admission cutover: actual preauthorized lock waiter, post-commit denial, idle transaction drain visibility, rollback and retained owner-wrapper compatibility. No worker lifetime simulated.');
}
