import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { syntheticSource, compareSeekRenders } from '/workspace/scratch/b54f0bc31372/renderer-media-diagnostics-20261102/tests/helpers/clip-render-seek-fixtures.mjs';
const dir='/tmp/renderer-delayed-video-investigation';
const digest=b=>createHash('sha256').update(b).digest('hex');
const difference=(a,b)=>{let count=0,first=null,max=0;const frames=new Set();for(let i=0;i<Math.min(a.length,b.length);i++){if(a[i]!==b[i]){count++;first??=i;max=Math.max(max,Math.abs(a[i]-b[i]));frames.add(Math.floor(i/48600));}}return {count,first,max,frames:[...frames],aBytes:a.length,bBytes:b.length};};
const receipt={purpose:'Fixed five regenerated-source experiments; two baseline and two candidate outputs per source; no tolerance relaxation',groups:[]};
for(let group=0;group<5;group++){
  const input=await syntheticSource(dir,`control-${group}`,{videoDelay:0.317});const errors=[];
  for(let pair=0;pair<2;pair++)try{await compareSeekRenders(dir,`control-${group}-${pair}`,input,{clip_format:'square_1_1',fit_mode:'fill',trim_start_ms:11123,trim_end_ms:13123,brand_mark_enabled:false});}catch(error){errors.push(error.message);}
  const arrays=[];for(const [pair,kind]of [[0,'baseline'],[1,'baseline'],[0,'candidate'],[1,'candidate']])arrays.push(await readFile(`${dir}/control-${group}-${pair}-${kind}.yuv`));
  const result={group,sourceSha256:digest(await readFile(input)),errors,outputHashes:arrays.map(digest),baselineVsBaseline:difference(arrays[0],arrays[1]),candidateVsCandidate:difference(arrays[2],arrays[3]),baselineVsCandidate0:difference(arrays[0],arrays[2]),baselineVsCandidate1:difference(arrays[1],arrays[3])};
  receipt.groups.push(result);console.log(JSON.stringify(result));await writeFile(`${dir}/controls.json`,JSON.stringify(receipt,null,2)+'\n');
}
