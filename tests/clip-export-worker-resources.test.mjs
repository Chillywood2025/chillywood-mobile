import test from 'node:test';
import assert from 'node:assert/strict';
import {constants} from 'node:fs';
import {Buffer} from 'node:buffer';
import {readClipExportWorkerResources} from '../scripts/lib/clip-export-worker-resources.mjs';

function fixture(){
 const f={opens:[],closed:[],memberships:['0::/system.slice/clip.service\n'],directory:'/sys/fs/cgroup/system.slice/clip.service',
  files:{'memory.current':'128\n','memory.peak':'512\n','memory.max':'1024\n',
   'memory.events':'low 0\nhigh 1\nmax 2\noom 3\noom_kill 4\noom_group_kill 5\n','cpu.stat':'usage_usec 123456\nuser_usec 100000\nsystem_usec 23456\n'}};
 let tick=100,descriptor=20;
 f.options={platform:'linux',clock:()=>1750000,monotonic:()=>{const now=tick;tick+=37;return now;},
  resolvePath:async name=>name==='/proc/self/fd/7'?f.directory:name,
  openFile:async(name,flags)=>{
   f.opens.push({name,flags});assert.equal(flags&constants.O_NOFOLLOW,constants.O_NOFOLLOW);
   assert.equal(flags&(constants.O_WRONLY|constants.O_RDWR),0);
   if(name===f.directory){assert.ok(flags&constants.O_DIRECTORY);return {fd:7,close:async()=>{f.closed.push(7);}};}
   let value;
   if(name==='/proc/self/cgroup')value=f.memberships.length>1?f.memberships.shift():f.memberships[0];
   else{assert.ok(name.startsWith('/proc/self/fd/7/'),'only the pinned current cgroup may be read');value=f.files[name.slice('/proc/self/fd/7/'.length)];}
   if(value instanceof Error||value===undefined)throw value??new Error('missing');
   const fd=descriptor++;return {fd,read:async(buffer,offset,length)=>({bytesRead:Buffer.from(value).copy(buffer,offset,0,length)}),
    close:async()=>{f.closed.push(fd);}};
  }};
 return f;
}
test('whole-worker cgroup observations preserve actual timestamp, lifetime peak, OOM and descendant CPU without asserting isolation',async()=>{
 const f=fixture(),value=await readClipExportWorkerResources(f.options);
 assert.equal(value.available,true);assert.equal(value.scope,'current-process-cgroup-v2-including-descendants');
 assert.equal(value.isolationVerified,false);assert.equal(value.peakScope,'cgroup-lifetime');
 assert.equal(value.observedAtMs,1750000);assert.equal(value.collectionElapsedMs,37);
 assert.equal(value.memoryCurrentBytes,128);assert.equal(value.memoryPeakBytes,512);assert.equal(value.memoryLimitBytes,1024);
 assert.equal(value.leafMemoryAvailableHeadroomBytes,896);assert.equal(value.memoryAvailableHeadroomBytes,null);
 assert.equal(value.memoryLimitScope,'leaf-cgroup-only');assert.equal(value.effectiveMemoryConstraintKnown,false);
 assert.equal(value.effectiveMemoryLimitBytes,null);assert.equal(value.effectiveMemoryAvailableHeadroomBytes,null);
 assert.deepEqual(value.oomEvents,{oom:3,oomKill:4,oomGroupKill:5});
 assert.equal(value.cpuUsageUsec,123456);assert.equal(f.closed.length,f.opens.length);
 assert.equal(Object.hasOwn(value,'rss'),false);
});
test('non-Linux, v1, ambiguous and unsafe memberships fail closed without reading another cgroup',async()=>{
 const f=fixture();assert.equal((await readClipExportWorkerResources({...f.options,platform:'darwin'})).available,false);assert.equal(f.opens.length,0);
 for(const membership of ['1:memory:/clip\n','0::/clip\n1:cpu:/clip\n','0::/../other\n','0::/unit/../../other\n','0::/unit//child\n','0::/unit\\unsafe\n','0::/unit/./child\n']){
  const g=fixture();g.memberships=[membership];const value=await readClipExportWorkerResources(g.options);
  assert.equal(value.available,false);assert.equal(value.memoryCurrentBytes,null);assert.equal(g.opens.length,1);
 }
});
test('symlinked or replaced directories and changing membership never produce an observation',async()=>{
 for(const anchor of [false,true]){
  const f=fixture(),resolve=f.options.resolvePath;f.options.resolvePath=async name=>(anchor?name==='/proc/self/fd/7':name===f.directory)?'/sys/fs/cgroup/another-unit':resolve(name);
  assert.equal((await readClipExportWorkerResources(f.options)).available,false);
  assert.equal(f.opens.some(entry=>entry.name.startsWith('/proc/self/fd/7/')),false);
 }
 const f=fixture();f.memberships=['0::/system.slice/clip.service\n','0::/system.slice/other.service\n'];
 const result=await readClipExportWorkerResources(f.options);assert.equal(result.available,false);assert.equal(result.memoryCurrentBytes,null);assert.ok(f.closed.includes(7));
});
test('unlimited/missing/malformed measurements remain null, never guessed headroom or zero OOM/CPU',async()=>{
 const f=fixture();f.files['memory.max']='max\n';delete f.files['memory.peak'];delete f.files['cpu.stat'];f.files['memory.events']='oom_kill invalid\n';
 const value=await readClipExportWorkerResources(f.options);assert.equal(value.available,true);
 for(const key of ['memoryLimitBytes','memoryPeakBytes','memoryAvailableHeadroomBytes','cpuUsageUsec'])assert.equal(value[key],null);
 assert.deepEqual(value.oomEvents,{oom:null,oomKill:null,oomGroupKill:null});
 for(const current of ['-1','Infinity','9007199254740992','1.5','1\n2',new Error('symlink ELOOP')]){
  const g=fixture();g.files['memory.current']=current;assert.equal((await readClipExportWorkerResources(g.options)).available,false);
 }
 const g=fixture();g.files['cpu.stat']='usage_usec 5\nusage_usec 6\n';
 assert.equal((await readClipExportWorkerResources(g.options)).cpuUsageUsec,null);
});
test('oversized proc observation is bounded and descriptor is closed',async()=>{
 const f=fixture();f.memberships=['x'.repeat(20000)];
 assert.equal((await readClipExportWorkerResources(f.options)).available,false);assert.equal(f.opens.length,1);assert.equal(f.closed.length,1);
});
test('a roomy leaf under a tighter busy parent cannot advertise effective headroom or host capacity, even at a namespaced root',async()=>{
 // Example hidden/ancestor constraint: parent limit 1.2 GiB, usage 1.1 GiB.
 // The current-unit reader cannot observe or certify that constraint and must
 // not describe leaf 3 GiB - 1 GiB as 2 GiB of effective available memory.
 for(const namespaceRoot of [false,true]){
  const f=fixture();
  if(namespaceRoot){f.directory='/sys/fs/cgroup';f.memberships=['0::/\n'];}
  f.files['memory.max']=String(3*1024**3);f.files['memory.current']=String(1024**3);
  const value=await readClipExportWorkerResources(f.options);
  assert.equal(value.available,true);assert.equal(value.memoryLimitBytes,3*1024**3);
  assert.equal(value.leafMemoryAvailableHeadroomBytes,2*1024**3);
  assert.equal(value.memoryLimitScope,'leaf-cgroup-only');assert.equal(value.effectiveMemoryConstraintKnown,false);
  assert.equal(value.memoryAvailableHeadroomBytes,null);assert.equal(value.effectiveMemoryAvailableHeadroomBytes,null);
  assert.equal(value.effectiveMemoryLimitBytes,null);assert.equal(Object.hasOwn(value,'hostMemoryAvailableBytes'),false);
 }
});
