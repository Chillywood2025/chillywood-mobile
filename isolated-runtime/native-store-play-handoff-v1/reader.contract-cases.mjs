import assert from 'node:assert/strict';import fs from 'node:fs';
import {playPrivateStateTables,playPrivateStateModuleSQL,playPrivateStateReadSQL,validatePlayPrivateState} from './private-state-readback.mjs';
const fresh=()=>({protocol:'native-store-play-private-state-v1',reader:'supabase_read_only_user',transactionReadOnly:true,controlPresent:true,handoffEnabled:false,empty:Object.fromEntries(playPrivateStateTables.map(t=>[t,true]))});
export function runPlayPrivateStateContractCases(){let cases=0;const test=(_name,body)=>{body();cases++;};
test('boolean-only Play readback distinguishes current enabled and occupied state without granting authority',()=>{
 const off=validatePlayPrivateState(fresh());assert.equal(off.defaultOffAndEmptyObserved,true);assert.equal(off.stateObserved,true);
 for(const field of ['deploymentAllowed','activationAllowed','retryAllowed'])assert.equal(off[field],false);
 const active=fresh();active.handoffEnabled=true;assert.equal(validatePlayPrivateState(active).handoffEnabled,true);assert.equal(validatePlayPrivateState(active).defaultOffAndEmptyObserved,false);
 for(const table of playPrivateStateTables){const occupied=fresh();occupied.empty[table]=false;const result=validatePlayPrivateState(occupied);assert.equal(result.allDataTablesEmpty,false);assert.equal(result.defaultOffAndEmptyObserved,false);}
});
test('Play observation rejects malformed, missing, extra and nonboolean fields or wrong reader context',()=>{
 for(const mutate of [v=>v.reader='postgres',v=>v.transactionReadOnly=false,v=>v.controlPresent=false,v=>v.handoffEnabled=null,v=>v.extra=true,v=>v.empty.extra=true,v=>v.protocol='other']){
  const value=fresh();mutate(value);assert.throws(()=>validatePlayPrivateState(value),/PLAY_PRIVATE_STATE_INVALID/u);
 }
 for(const key of Object.keys(fresh())){const value=fresh();delete value[key];assert.throws(()=>validatePlayPrivateState(value));}
 for(const table of playPrivateStateTables)for(const value of [null,undefined,0,'true']){const state=fresh();state.empty[table]=value;assert.throws(()=>validatePlayPrivateState(state));}
});
test('committed reader SQL is exact, fixed, bounded and has no raw grants or mutation path',()=>{
 const sql=playPrivateStateModuleSQL();assert.equal(fs.readFileSync(new URL('./private-state.sql',import.meta.url),'utf8'),sql);
 assert.equal((sql.match(/not exists\(select 1 from sandbox_commerce_v1\.[a-z_]+ limit 1\)/gu)||[]).length,9);
 assert.doesNotMatch(sql,/create role|grant select|grant usage|execute format|jsonb_agg|\bcount\(/iu);
 assert.doesNotMatch(sql,/set local (?:statement_timeout|transaction_timeout|lock_timeout)|^begin;|commit;$/u);
 assert.match(sql,/session_user<>'supabase_read_only_user'/u);assert.match(sql,/current_user<>'sbx_v1_core_owner'/u);
 assert.match(sql,/grant execute on function public.native_store_play_private_state_v1\(\) to supabase_read_only_user/u);
 assert.match(playPrivateStateReadSQL,/repeatable read read only/u);assert.match(playPrivateStateReadSQL,/transaction_timeout='5s'/u);
 assert.ok(playPrivateStateReadSQL.indexOf("statement_timeout='5s'")<playPrivateStateReadSQL.indexOf('select public.'));
});
return cases;}
