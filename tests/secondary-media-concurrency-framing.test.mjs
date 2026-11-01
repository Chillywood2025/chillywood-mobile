// Source/transport framing only; actual ordering proof is the Docker CI runner.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {EventEmitter} from 'node:events';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('../scripts/test-secondary-media-concurrency-postgres.mjs',import.meta.url),'utf8');
test('native secondary runner terminates SQL before release and retains distinct backend proof',()=>{
 const child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();
 child.stdout.setEncoding=child.stderr.setEncoding=()=>{};let input='';child.stdin={write:s=>input+=s};
 const sessions=[];
 const session=runInNewContext(`${source.slice(source.indexOf('function session('),source.indexOf('async function until('))};session`,{
  spawn:()=>child,args:()=>[],randomUUID:()=> 'fixture',auth:'',lit:s=>`'${s}'`,sessions,
 });
 session('select 1');assert.match(input,/begin isolation level read committed;select 1;\n$/);
 assert.equal(sessions.length,1);
 assert.match(source,/pg_blocking_pids\(w.pid\)/);assert.match(source,/assert.notEqual\(evidence.holderPid,evidence.waiterPid\)/);
 assert.match(source,/assert.doesNotMatch\(br.stderr,\/deadlock detected\|statement timeout\|lock timeout/);
 assert.match(source,/assert.equal\(count,16\)/);assert.match(source,/restore.assertSourceUnchanged\(\)/);
});
