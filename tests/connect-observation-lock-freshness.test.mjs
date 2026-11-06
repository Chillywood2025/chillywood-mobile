// Sequential exact fixture and final-clock controls. Only hosted native
// Connect schedules establish a real gate wait across separate backends.
import assert from 'node:assert/strict';
import test from 'node:test';
import {nativeSetupDatabase,nativeSource,nativeSpan,nativeVariables,executeNativeSetup} from './helpers/native-runner-setup-preflight.mjs';

test('Connect observation retains truthful timestamp and rejects expired read before persistence',{timeout:180000},async()=>{
 const db=nativeSetupDatabase(),file='scripts/test-connect-dual-mode-concurrency-postgres.mjs',source=nativeSource(file);
 try {
  await executeNativeSetup(file,source,[
   nativeVariables(source,['rpc','update','selected']),
   nativeSpan(source,' const creator=randomUUID()', ' const a=start('),
   `query(update(testId));rpc("select public.confirm_creator_connect_live_setup('"+creator+"','"+session+"','distinct-live-account-v1')");`,
   nativeSpan(source,' const reserved=rpc(', ' const c=start('),
  ],{query:db.query,tail:`
   const original=query("select to_jsonb(a) from public.creator_payout_accounts a where id="+lit(liveId));
   const observed=facts.readStartedAt;
   const persist=(evidence)=>"select public.record_creator_connect_live_observation("+lit(JSON.stringify(context))+"::jsonb,"+lit(JSON.stringify(evidence))+"::jsonb);";
   assert.equal(JSON.parse(query('begin;'+service+persist(facts)+'rollback;')).recorded,true);
   assert.equal(query("select to_jsonb(a) from public.creator_payout_accounts a where id="+lit(liveId)),original);
   const stale={...facts,readStartedAt:new Date(Date.now()-61_000).toISOString()};
   assert.throws(()=>query('begin;'+service+persist(stale)+'commit;'),/live_observation_binding_invalid/u);
   assert.equal(query("select to_jsonb(a) from public.creator_payout_accounts a where id="+lit(liveId)),original);
   assert.equal(facts.readStartedAt,observed,'fixture does not relabel provider evidence');
  `});
  const body=db.query("select pg_get_functiondef('public.record_creator_connect_live_observation(jsonb,jsonb)'::regprocedure)");
  const gate=body.indexOf('perform private.lock_ordinary_commerce_authority_gate();');
  const account=body.indexOf('select * into a from public.creator_payout_accounts');
  const retention=body.indexOf('perform private.platform_brand_retention_lock();');
  const checked=body.indexOf('checked:=clock_timestamp();');
  const write=body.indexOf('update public.creator_payout_accounts set');
  assert.ok(gate<account&&account<retention&&retention<checked&&checked<write);
  assert.equal((body.match(/observed timestamptz:=clock_timestamp\(\)/gu)||[]).length,1);
  assert.doesNotMatch(body,/observed\s*:=\s*clock_timestamp/u,'never refresh the stored observation to disguise a wait');
  assert.match(body,/readStartedAt[\s\S]*not between checked-interval '60 seconds' and checked/u);
 }finally{await db.close();}
});
