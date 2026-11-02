// SQL transaction adapter contracts. These doubles do not prove native DB races.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createPostgresClipScaleLedger,emptyClipScaleLedger} from '../scripts/lib/clip-export-scale-ledger.mjs';

function fixture(){
 const f={saved:emptyClipScaleLedger(),queries:[],released:0};
 f.ledger=createPostgresClipScaleLedger({connect:async()=>({async query(sql,args=[]){
  f.queries.push([sql,args]);if(f.fail===sql)throw Error('synthetic transaction failure');
  if(sql==='begin')f.pending=structuredClone(f.saved);
  if(sql.startsWith('select revision,state'))return {rows:[{revision:0,state:f.pending}]};
  if(sql.startsWith('update private.creator_clip_scale_ledger'))f.pending=JSON.parse(args[1]);
  if(sql==='commit')f.saved=f.pending;
  return {rows:[]};
 },async release(){f.released++;}})});
 return f;
}

test('empty durable state starts without capacity, health or admission authority',()=>{
 const state=emptyClipScaleLedger();assert.equal(state.admissionReady,false);assert.equal(state.healthState,'unknown');
 assert.equal(state.sequence,0);assert.deepEqual(state.resources,[]);
 assert.throws(()=>createPostgresClipScaleLedger(),/connection_required/u);
});

test('first-row insertion is advisory-locked and state/health writes commit atomically before return',async()=>{
 const f=fixture();assert.equal(f.ledger.atomicDurable,true);
 const result=await f.ledger.transact('synthetic',state=>{
  state.sequence++;state.healthState='healthy';state.healthObservedAtMs=1000;state.admissionReady=true;return 'reserved';
 });
 assert.equal(result,'reserved');assert.equal(f.saved.sequence,1);assert.equal(f.released,1);
 const sql=f.queries.map(([statement])=>statement);
 assert.ok(sql.findIndex(s=>s.includes('pg_advisory_xact_lock'))<sql.findIndex(s=>s.startsWith('insert')));
 assert.ok(sql.some(s=>s.includes('for update')));assert.equal(sql.at(-1),'commit');
 const health=f.queries.find(([s])=>s.startsWith('update private.creator_clip_export_worker'));
 assert.deepEqual(health[1],['synthetic','healthy','1970-01-01T00:00:01.000Z',true]);
 assert.match(health[0],/where scale_pool_id=\$1/u);
});

test('callback failures and asynchronous callbacks roll back and release without publishing state',async()=>{
 for(const change of [state=>{state.sequence++;throw Error('callback failed');},async state=>{state.sequence++;}]){
  const f=fixture();await assert.rejects(f.ledger.transact('synthetic',change));
  assert.equal(f.saved.sequence,0);assert.equal(f.queries.at(-1)[0],'rollback');assert.equal(f.released,1);
 }
});

test('failed commit rolls back, releases and surfaces uncertainty rather than pretending dispatch is safe',async()=>{
 const f=fixture();f.fail='commit';await assert.rejects(f.ledger.transact('synthetic',state=>{state.sequence=1;}));
 assert.equal(f.saved.sequence,0);assert.equal(f.queries.at(-1)[0],'rollback');assert.equal(f.released,1);
});

test('ledger rejects invalid pool keys; unknown health or invalid timestamps are never freshened',async()=>{
 const f=fixture();await assert.rejects(f.ledger.transact('../other',()=>{}));assert.equal(f.queries.length,0);
 await f.ledger.transact('synthetic',state=>{state.healthState='invented';state.healthObservedAtMs=Infinity;});
 const health=f.queries.find(([s])=>s.startsWith('update private.creator_clip_export_worker'));
 assert.deepEqual(health[1],['synthetic','unknown',null,false]);
});
