import {readFile,writeFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
import {runMediaProcess} from '/workspace/scratch/b54f0bc31372/renderer-hosted-seek-fixture-20261102/scripts/lib/clip-render-core.mjs';
const dir='/tmp/renderer-early-fractional-controls',results=[];const hash=async f=>createHash('sha256').update(await readFile(f)).digest('hex');
for(let trial=0;trial<10;trial++){
 const file=`${dir}/preencode-${trial}.yuv`;const args=['-nostdin','-v','error','-filter_complex_threads','2','-threads','2','-i',`${dir}/source.mp4`,'-ss','0.123','-t','2','-filter_complex','[0:v:0]crop=180:180,scale=180:180,setsar=1,fps=30,format=yuv420p[out]','-map','[out]','-c:v','rawvideo','-threads','2','-f','rawvideo',file];
 await runMediaProcess('ffmpeg',args);results.push({stage:'preencode',trial,args,sha256:await hash(file),bytes:(await readFile(file)).length});
}
for(let trial=0;trial<10;trial++){
 const file=`${dir}/raw-reencode-${trial}.mp4`,decoded=`${dir}/raw-reencode-${trial}.yuv`;const args=['-nostdin','-v','error','-f','rawvideo','-pix_fmt','yuv420p','-s','180x180','-r','30','-i',`${dir}/preencode-0.yuv`,'-c:v','libx264','-preset','fast','-crf','22','-threads','2',file];
 await runMediaProcess('ffmpeg',args);await runMediaProcess('ffmpeg',['-nostdin','-v','error','-threads','1','-i',file,'-map','0:v:0','-pix_fmt','yuv420p','-f','rawvideo',decoded]);results.push({stage:'raw-reencode',trial,args,sha256:await hash(decoded),bytes:(await readFile(decoded)).length});
}
await writeFile(`${dir}/preencode.json`,JSON.stringify(results,null,2)+'\n');console.log(JSON.stringify(results.map(({stage,trial,sha256,bytes})=>({stage,trial,sha256,bytes}))));
