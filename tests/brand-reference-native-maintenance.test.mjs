import assert from 'node:assert/strict';
import test from 'node:test';
import {maintainBrandNativeFixture} from './helpers/brand-reference-native-maintenance.mjs';

const tables=()=>Array.from({length:354},(_,i)=>({name:'brand_reference_perf_'+String(i).padStart(3,'0')}));
const success=()=>({status:0,signal:null,stderr:'',stdout:'MAINTENANCE_SETTINGS:'+JSON.stringify({statement_timeout:'3min',statement_timeout_value:180000,statement_timeout_unit:'ms',autovacuum:'on',isolation:'read committed',work_mem:'4MB',maintenance_work_mem:'64MB'})+'\nMAINTENANCE_COMPLETE:354\n'});
test('maintenance targets the entire fresh inventory outside transactions and retains bounded setup settings',()=>{
 let invocation;const result=maintainBrandNativeFixture({tables:tables(),execute:(sql,options)=>{invocation={sql,options};return success();}});
 assert.equal(result.completed,true);assert.deepEqual(invocation.options,{budget:'180s',timeout:210000});
 const vacuum=invocation.sql.split('\n')[1];
 assert.equal(vacuum,'vacuum (analyze) '+tables().map(x=>'public."'+x.name+'"').join(',')+';');
 assert.doesNotMatch(invocation.sql,/\b(begin|full|skip_locked|alter|terminate|cancel)\b/i);
 assert.equal(result.settings.autovacuum,'on');
 assert.equal(result.settings.statement_timeout,'3min');
 assert.equal(result.settings.statement_timeout_value,180000);assert.equal(result.settings.statement_timeout_unit,'ms');
 assert.match(invocation.sql,/select setting::bigint from pg_settings where name='statement_timeout'/);
 assert.match(invocation.sql,/select unit from pg_settings where name='statement_timeout'/);
});
test('maintenance validates the exact numeric timeout and unit rather than its display text',()=>{
 for(const invalid of [
  success().stdout.replace('"statement_timeout_value":180000','"statement_timeout_value":180001'),
  success().stdout.replace('"statement_timeout_value":180000','"statement_timeout_value":0'),
  success().stdout.replace('"statement_timeout_value":180000','"statement_timeout_value":"180000"'),
  success().stdout.replace('"statement_timeout_unit":"ms"','"statement_timeout_unit":"s"'),
  success().stdout.replace(',"statement_timeout_value":180000',''),
  success().stdout.replace(',"statement_timeout_unit":"ms"',''),
 ]){let evidence;assert.throws(()=>maintainBrandNativeFixture({tables:tables(),execute:()=>({...success(),stdout:invalid}),onResult:r=>{evidence=r;}}));assert.equal(evidence.completed,false);assert.equal(evidence.settings.statement_timeout,'3min');}
});
test('maintenance rejects partial, duplicate, reordered and existing/source targets before execution',()=>{
 const invalid=[tables().slice(1),[...tables(),{name:'platform_brand_assets'}],tables().map((x,i)=>i===0?{name:'platform_brand_assets'}:x),tables().map((x,i)=>i===1?tables()[0]:x),tables().reverse()];
 for(const candidate of invalid){let calls=0;assert.throws(()=>maintainBrandNativeFixture({tables:candidate,execute:()=>{calls++;return success();}}));assert.equal(calls,0);}
});
test('maintenance errors, timeout, partial completion and disabled autovacuum retain failed evidence',()=>{
 const invalid=[{...success(),status:1,stderr:'ERROR: vacuum failed'}, {...success(),status:null,error:new Error('ETIMEDOUT')},
  {...success(),stdout:success().stdout.replace('MAINTENANCE_COMPLETE:354','')},
  {...success(),stdout:success().stdout.replace('"on"','"off"')}, {...success(),stderr:'WARNING: skipping relation'}];
 for(const candidate of invalid){let evidence;assert.throws(()=>maintainBrandNativeFixture({tables:tables(),execute:()=>candidate,onResult:r=>{evidence=r;}}));assert.equal(evidence.completed,false);}
});
