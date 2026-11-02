import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { syntheticSource, compareSeekRenders } from '/workspace/scratch/b54f0bc31372/renderer-media-diagnostics-20261102/tests/helpers/clip-render-seek-fixtures.mjs';
const dir='/tmp/renderer-delayed-video-investigation';
const input=`${dir}/control-1.mp4`;
const digest=b=>createHash('sha256').update(b).digest('hex');
const receipt={sourceSha256:digest(await readFile(input)),purpose:'Fixed six post-fix comparisons of retained failing source; not retry-until-pass',pairs:[]};
for(let index=0;index<6;index++){
  const name=`postfix-${index}`;let error=null;
  try{await compareSeekRenders(dir,name,input,{clip_format:'square_1_1',fit_mode:'fill',trim_start_ms:11123,trim_end_ms:13123,brand_mark_enabled:false});}
  catch(e){error=e.message;}
  const a=await readFile(`${dir}/${name}-baseline.yuv`),b=await readFile(`${dir}/${name}-candidate.yuv`);
  let differences=0,maxError=0,firstDifference=null;
  for(let i=0;i<Math.min(a.length,b.length);i++){if(a[i]!==b[i]){differences++;firstDifference??=i;maxError=Math.max(maxError,Math.abs(a[i]-b[i]));}}
  const result={index,error,baselineSha256:digest(a),candidateSha256:digest(b),baselineBytes:a.length,candidateBytes:b.length,differences,maxError,firstDifference};
  receipt.pairs.push(result);console.log(JSON.stringify(result));
  await writeFile(`${dir}/postfix-receipt.json`,JSON.stringify(receipt,null,2)+'\n');
}
