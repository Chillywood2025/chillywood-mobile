import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {runMediaProcess} from '/workspace/scratch/b54f0bc31372/renderer-hosted-seek-fixture-20261102/scripts/lib/clip-render-core.mjs';
const dir='/tmp/renderer-early-fractional-controls';const original=(await readFile(`${dir}/commands.jsonl`,'utf8')).trim().split('\n').map(JSON.parse).find(x=>x.includes('-filter_complex'));
const results=[];
for(const mode of ['decoder1','filter1','encoder1','all1'])for(let trial=0;trial<6;trial++){
 const args=[...original],file=`${dir}/${mode}-${trial}.mp4`,raw=`${dir}/${mode}-${trial}.yuv`;args[args.length-1]=file;
 if(['decoder1','all1'].includes(mode))args[args.indexOf('-threads')+1]='1';
 if(['filter1','all1'].includes(mode))args[args.indexOf('-filter_complex_threads')+1]='1';
 if(['encoder1','all1'].includes(mode))args[args.lastIndexOf('-threads')+1]='1';
 await runMediaProcess('ffmpeg',args);await runMediaProcess('ffmpeg',['-nostdin','-v','error','-threads','1','-i',file,'-map','0:v:0','-pix_fmt','yuv420p','-f','rawvideo',raw]);
 const result={mode,trial,args,sha256:createHash('sha256').update(await readFile(raw)).digest('hex')};results.push(result);console.log(JSON.stringify(result));await writeFile(`${dir}/stages.json`,JSON.stringify(results,null,2)+'\n');
}
