import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source=fs.readFileSync('scripts/test-database-runtime-authority-concurrency.mjs','utf8');
const queueSource=source.slice(source.indexOf('let checks=0;'),source.indexOf('const sourceFingerprintSql='));
assert.ok(queueSource.includes('async function queueCase('));

// Execute the actual orchestration with explicitly synthetic backend responses.
// This checks schedule ordering/denial assertions, not PostgreSQL contention.
function fixture({code=queueSource,self=true,mutex='1',beforeDeadline='t',denial='platform_staff_permission_denied'}={}){
  const events=[];let waiterStarted=false,personCount=0;
  const snapshot={roles:[],audits:[],adminAudits:[],receipts:[]};
  const query=sql=>{
    events.push({kind:'query',sql});
    if(sql.startsWith('update public.platform_role_memberships set expires_at=')){
      if(self&&waiterStarted)throw new Error('synthetic discovery actor mutex blocks third-backend expiry UPDATE');
      return sql.includes('returning')?'t':'';
    }
    if(sql.includes('pg_blocking_pids(w.pid)'))return '1';
    if(sql.includes('count(distinct pid)'))return '2';
    if(sql.includes('from pg_locks l'))return mutex;
    if(sql.startsWith('select clock_timestamp()<'))return beforeDeadline;
    if(sql.startsWith('select w.xact_start<t.'))return 't';
    if(sql.startsWith('select clock_timestamp()>='))return 't';
    throw new Error(`unexpected synthetic query: ${sql}`);
  };
  const openSession=(name,sql)=>{
    const waiter=name.startsWith('runtime-waiter-');
    if(waiter)waiterStarted=true;
    events.push({kind:waiter?'waiter':'holder',sql});
    return {output:()=> 'HOLDER_READY\n',
      child:{stdin:{end:value=>events.push({kind:waiter?'waiter-end':'holder-end',value})}},
      done:Promise.resolve({code:waiter?1:0,stdout:'',stderr:waiter?`ERROR: ${denial}\n`:''})};
  };
  const context={assert,query,openSession,process:{pid:123},randomUUID:()=> '00000000-0000-4000-8000-000000000123',
    literal:value=> `'${value}'`,seedPerson:()=> ({user:`person-${++personCount}`,session:'session',email:'fixture@example.test'}),
    seedRole:()=>{},seedScope:()=>{},effects:()=>structuredClone(snapshot),claimSql:()=>'',callSql:()=> 'select actual_grant_fixture();',
    waitUntil:async(predicate,label)=>{events.push({kind:'wait',label});assert.equal(predicate(),true,label);},
    terminate:async()=>{},console:{log:value=>events.push({kind:'pass',value})}};
  vm.runInNewContext(`${code}\nglobalThis.runCase=queueCase;globalThis.count=()=>checks;`,context);
  return {events,run:boundary=>context.runCase({label:`self expiry ${boundary}`,boundary,change:'role-expiry',self}),count:context.count};
}

for(const boundary of ['audit','receipt'])test(`${boundary}: self-fallback deadline is committed before the waiter and expires at the real boundary`,async()=>{
  const probe=fixture();await probe.run(boundary);
  const update=probe.events.findIndex(e=>e.kind==='query'&&e.sql.startsWith('update public.platform_role_memberships set expires_at='));
  const waiter=probe.events.findIndex(e=>e.kind==='waiter');
  const observed=probe.events.findIndex(e=>e.kind==='wait'&&e.label.endsWith(': observed cutoff'));
  const release=probe.events.findIndex(e=>e.kind==='holder-end');
  assert.ok(update>=0&&update<waiter&&waiter<observed&&observed<release);
  assert.equal(probe.events.filter(e=>e.kind==='query'&&e.sql.startsWith('update public.platform_role_memberships set expires_at=')).length,1);
  assert.ok(probe.events.some(e=>e.kind==='query'&&e.sql.includes('l.classid=190731::oid')&&e.sql.includes('l.objsubid=2')));
  assert.ok(probe.events.some(e=>e.kind==='query'&&e.sql.includes('w.xact_start<t.expires_at')));
  assert.equal(probe.count(),1);
});

test('non-self role expiry retains the independently committed post-wait authority mutation',async()=>{
  const probe=fixture({self:false});await probe.run('receipt');
  const waiter=probe.events.findIndex(e=>e.kind==='waiter');
  const update=probe.events.findIndex(e=>e.kind==='query'&&e.sql.startsWith('update public.platform_role_memberships set expires_at='));
  assert.ok(update>waiter);
  assert.match(probe.events[update].sql,/interval '500 milliseconds'/u);
  assert.equal(probe.count(),1);
});

test('old post-wait self-expiry schedule is rejected rather than bypassing the discovery mutex',async()=>{
  const needle="const preseedSelfExpiry=self&&change==='role-expiry';";
  assert.ok(queueSource.includes(needle));
  const probe=fixture({code:queueSource.replace(needle,'const preseedSelfExpiry=false;')});
  await assert.rejects(probe.run('audit'),/discovery actor mutex blocks third-backend expiry UPDATE/u);
  assert.equal(probe.count(),0);
});

for(const [label,options,error] of [
  ['missing discovery lock',{mutex:'0'},/self-grant keeps the real discovery actor mutex/u],
  ['late queue arrival',{beforeDeadline:'f'},/before Owner expiry/u],
  ['infrastructure failure instead of authority denial',{denial:'canceling statement due to statement timeout'},/exact intended authority denial/u],
])test(`self-expiry schedule fails closed for ${label}`,async()=>{
  const probe=fixture(options);await assert.rejects(probe.run('receipt'),error);assert.equal(probe.count(),0);
});

test('native runner retains all declared queue cases and both self-fallback boundaries',()=>{
  assert.ok(source.includes("for(const boundary of ['audit','receipt'])await queueCase({label:`repaired ${boundary} owner-to-operator self fallback`,boundary,change:'role-expiry',self:true})"));
  assert.ok(source.includes("assert.equal(checks,25,'all declared old-control, denial and positive queue cases executed')"));
  assert.ok(source.includes("assert.deepEqual(effects(person,target),before,'queued denial rolls back target role, audit and receipt')"));
  assert.doesNotMatch(queueSource,/disable trigger|session_replication_role|set_config\('.*collecting/iu);
});
