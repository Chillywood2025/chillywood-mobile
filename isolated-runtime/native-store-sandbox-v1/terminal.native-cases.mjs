import assert from 'node:assert/strict';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';

// Called only by the composed managed PostgreSQL harness. No substitute
// allocator, grant, terminal or consumed-attempt rows are inserted by these cases.
export async function runTerminalCases(x){
 const {q,args,bin,env,children,json,call,actor,newSession,freshNativeFixture}=x;
 const service="set role service_role;set request.jwt.claims='{\"role\":\"service_role\"}';";
 const owner="set role sbx_v1_core_owner;set request.jwt.claims='{\"role\":\"service_role\"}';";
 let cases=0;
 assert.equal(q("select to_regclass('sandbox_commerce_v1.native_store_reservation_terminals') is not null;"),'t');
 const expression=(command,s,id=randomUUID(),who=actor)=>`public.native_store_sandbox_terminal_v1('${who.userId}','${who.sessionGeneration}','${command}','${id}',${json({selectionId:s.id})})`;
 const terminal=(command,s,id,who)=>JSON.parse(q(service+'select '+expression(command,s,id,who)+';'));
 const fixture=(product='terminal-'+randomUUID())=>{const f=freshNativeFixture(product);return {...f,selection:call('prepare',f.preparePayload).data.selection};};
 const reserve=s=>call('reserve',{selectionId:s.id}).data.reservation;
 const consume=(r,id=randomUUID())=>`sandbox_commerce_v1.native_store_consume_attempt('${actor.userId}','${actor.sessionGeneration}','${r.id.slice(18)}','${id}',false)`;
 const first=fixture(),request=randomUUID();
 assert.equal(terminal('terminal-recover',first.selection).status,'unknown');
 const cancelled=terminal('cancel-preparation',first.selection,request);
 assert.equal(cancelled.data.terminal.kind,'cancelled_before_consume');assert.equal(cancelled.data.terminal.reservationId,null);
 assert.equal(cancelled.dispatchAllowed,false);assert.equal(cancelled.correlation,'unsupported');
 assert.deepEqual(terminal('cancel-preparation',first.selection,request).data,cancelled.data);
 assert.deepEqual(terminal('terminal-recover',first.selection,randomUUID(),{...actor,sessionGeneration:newSession}).data,cancelled.data);
 assert.throws(()=>terminal('cancel-preparation',first.selection),/native_store_terminal_conflict/u);
 assert.equal(call('reserve',{selectionId:first.selection.id}).data.reservation,null);cases++;
 const slot=fixture(),r=reserve(slot.selection),alternative=fixture(slot.nativeCatalog.wireProductId);
 assert.throws(()=>reserve(alternative.selection),/native_store_shared_sku_reserved/u);
 terminal('cancel-preparation',slot.selection);
 assert.ok(reserve(alternative.selection).id);cases++;
 assert.throws(()=>q(owner+'select '+consume(r)+';'),/native_store_attempt_terminal/u);cases++;
 const consumed=fixture(),cr=reserve(consumed.selection);q(owner+'select '+consume(cr)+';');
 assert.equal(terminal('cancel-preparation',consumed.selection).data.reason,'consumption_unresolved');
 assert.equal(terminal('terminal-recover',consumed.selection).data.terminal,null);
 const replacement=fixture(consumed.nativeCatalog.wireProductId);
 assert.throws(()=>reserve(replacement.selection),/native_store_shared_sku_reserved/u);cases++;
 const rollback=fixture(),rollbackRequest=randomUUID();
 q('begin;'+service+'select '+expression('cancel-preparation',rollback.selection,rollbackRequest)+';rollback;');
 assert.equal(terminal('terminal-recover',rollback.selection).data.terminal,null);assert.ok(reserve(rollback.selection));cases++;
 for(const role of ['anon','authenticated','service_role']){
  assert.throws(()=>q(`set role ${role};select * from sandbox_commerce_v1.native_store_reservation_terminals;`),/permission denied/u);
  assert.throws(()=>q(`set role ${role};select sandbox_commerce_v1.native_store_record_allocated_terminal('${randomUUID()}','${randomUUID()}');`),/permission denied/u);
 }
 for(const role of ['anon','authenticated'])assert.throws(()=>q(`set role ${role};select ${expression('terminal-recover',slot.selection)};`),/permission denied/u);
 for(const sql of ['delete from sandbox_commerce_v1.native_store_reservation_terminals','update sandbox_commerce_v1.native_store_reservation_terminals set kind=kind','truncate sandbox_commerce_v1.native_store_reservation_terminals'])assert.throws(()=>q(sql+';'),/native_store_quote_immutable/u);cases++;
 // Two real server sessions: uncommitted cancellation holds the original buyer
 // lock, so consumption cannot race its no-attempt observation.
 const race=fixture(),rr=reserve(race.selection),db=q('select current_database();');let out='',err='';
 const child=spawn(path.join(bin,'psql'),args(db),{env,stdio:['pipe','pipe','pipe']});children.push(child);
 child.stdout.on('data',v=>out+=v);child.stderr.on('data',v=>err+=v);const done=new Promise(resolve=>child.once('exit',resolve));
 child.stdin.write('begin;'+service+'select '+expression('cancel-preparation',race.selection)+";select 'terminal_ready';\n");
 const deadline=Date.now()+3000;while(!out.includes('terminal_ready')&&Date.now()<deadline)await delay(10);
 assert.ok(out.includes('terminal_ready'),err);
 assert.throws(()=>q(owner+'select '+consume(rr)+';'),/native_store_attempt_busy/u);
 child.stdin.end('commit;\n');assert.equal(await done,0,err);
 assert.throws(()=>q(owner+'select '+consume(rr)+';'),/native_store_attempt_terminal/u);cases++;
 // Abrupt session loss rolls back terminal insertion; immutable committed
 // attempts in the preceding case remain held and are never reset.
 const crash=fixture();let crashOut='',crashErr='';
 const worker=spawn(path.join(bin,'psql'),args(db),{env,stdio:['pipe','pipe','pipe']});children.push(worker);
 worker.stdout.on('data',v=>crashOut+=v);worker.stderr.on('data',v=>crashErr+=v);const exited=new Promise(resolve=>worker.once('exit',resolve));
 worker.stdin.write('begin;'+service+'select '+expression('cancel-preparation',crash.selection)+";select 'terminal_crash_ready';\n");
 const until=Date.now()+3000;while(!crashOut.includes('terminal_crash_ready')&&Date.now()<until)await delay(10);
 assert.ok(crashOut.includes('terminal_crash_ready'),crashErr);worker.kill('SIGKILL');await exited;
 assert.equal(terminal('terminal-recover',crash.selection).data.terminal,null);assert.ok(reserve(crash.selection));cases++;
 return {protocol:'native-store-terminal-managed-proof-v1',cases,passed:cases,managedInstall:true,settlementTerminalProof:false};
}
