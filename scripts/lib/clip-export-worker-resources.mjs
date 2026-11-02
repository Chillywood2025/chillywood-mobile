import { constants } from 'node:fs';
import { open, realpath } from 'node:fs/promises';
import { Buffer } from 'node:buffer';

const ROOT='/sys/fs/cgroup';
const MEMBERSHIP='/proc/self/cgroup';
const SCOPE='current-process-cgroup-v2-including-descendants';
const FILES=['memory.current','memory.peak','memory.max','memory.events','cpu.stat'];
const count=value=>{
 if(typeof value!=='string'||!/^\d+$/u.test(value.trim()))return null;
 const parsed=Number(value.trim());return Number.isSafeInteger(parsed)&&parsed>=0?parsed:null;
};
const counters=value=>{
 const entries=new Map();
 for(const line of value?.trim().split('\n')??[]){
  const parts=line.trim().split(/\s+/u);
  if(parts.length!==2||entries.has(parts[0]))return new Map();
  entries.set(parts[0],count(parts[1]));
 }
 return entries;
};
function cgroupPath(value){
 const lines=value.trim().split('\n');
 if(lines.length!==1||!lines[0].startsWith('0::/'))return null;
 const member=lines[0].slice(3);
 if(member==='/')return ROOT;
 const parts=member.slice(1).split('/');
 if(parts.some(part=>!part||part==='.'||part==='..'||!/^[a-zA-Z0-9_.@:-]+$/u.test(part)))return null;
 return ROOT+member;
}

/** Read only the current process's Linux cgroup v2, including ffmpeg children.
 * A cgroup is NOT automatically an isolated renderer: operator qualification
 * must prove that no LiveKit/scanner/other workloads share it. The peak belongs
 * to the cgroup lifetime, not this job or Node's RSS. No membership is changed.
 * Injected I/O/clock is for deterministic tests, never a configurable host path.
 */
export async function readClipExportWorkerResources({platform=process.platform,openFile=open,resolvePath=realpath,
 clock=Date.now,monotonic=()=>performance.now()}={}){
 const observedAtMs=clock(),started=monotonic();
 const result={available:false,reason:'cgroup_v2_unavailable',observedAtMs,collectionElapsedMs:0,
  scope:null,isolationVerified:false,peakScope:'cgroup-lifetime',memoryCurrentBytes:null,memoryPeakBytes:null,
  memoryLimitBytes:null,memoryAvailableHeadroomBytes:null,oomEvents:{oom:null,oomKill:null,oomGroupKill:null},cpuUsageUsec:null};
 const finish=()=>({...result,collectionElapsedMs:Math.max(0,monotonic()-started)});
 if(platform!=='linux')return finish();
 const read=async file=>{
  const handle=await openFile(file,constants.O_RDONLY|constants.O_NOFOLLOW);
  try{
   const bytes=Buffer.alloc(16385);
   const {bytesRead}=await handle.read(bytes,0,bytes.length,0);
   if(bytesRead>=bytes.length)throw new Error('cgroup_observation_too_large');
   return bytes.subarray(0,bytesRead).toString('utf8');
  }finally{await handle.close();}
 };
 let directory;
 try{
  const membership=await read(MEMBERSHIP),path=cgroupPath(membership);
  if(!path||await resolvePath(path)!==path)return finish();
  // Pin the verified directory. Reading through its FD prevents an ancestor
  // replacement from redirecting subsequent file reads outside the current unit.
  directory=await openFile(path,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);
  const anchor='/proc/self/fd/'+directory.fd;
  if(await resolvePath(anchor)!==path)return finish();
  const values=await Promise.all(FILES.map(async name=>{try{return await read(anchor+'/'+name);}catch{return null;}}));
  if(await read(MEMBERSHIP)!==membership||await resolvePath(anchor)!==path)return finish();
  const [current,peak,limit,events,cpu]=values;
  const currentBytes=count(current),memoryEvents=counters(events),cpuEvents=counters(cpu);
  if(currentBytes===null)return finish();
  result.available=true;result.reason=null;result.scope=SCOPE;result.memoryCurrentBytes=currentBytes;
  result.memoryPeakBytes=count(peak);result.memoryLimitBytes=count(limit);
  result.memoryAvailableHeadroomBytes=result.memoryLimitBytes===null?null:Math.max(0,result.memoryLimitBytes-currentBytes);
  result.oomEvents={oom:memoryEvents.get('oom')??null,oomKill:memoryEvents.get('oom_kill')??null,
   oomGroupKill:memoryEvents.get('oom_group_kill')??null};
  result.cpuUsageUsec=cpuEvents.get('usage_usec')??null;
  return finish();
 }catch{return finish();}
 finally{if(directory)await directory.close().catch(()=>{});}
}
