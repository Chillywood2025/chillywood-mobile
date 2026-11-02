import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {syntheticSource} from '/workspace/scratch/b54f0bc31372/renderer-hosted-seek-fixture-20261102/tests/helpers/clip-render-seek-fixtures.mjs';
import {renderClip,runMediaProcess} from '/workspace/scratch/b54f0bc31372/renderer-hosted-seek-fixture-20261102/scripts/lib/clip-render-core.mjs';
import {renderClip as baseline} from '/workspace/scratch/b54f0bc31372/renderer-hosted-seek-fixture-20261102/tests/fixtures/clip-render-output-seek-baseline.mjs';
const dir='/tmp/renderer-early-fractional-controls', input=await syntheticSource(dir,'source');
const digest=x=>createHash('sha256').update(x).digest('hex');
const receipt={purpose:'Fixed ten baseline/candidate pairs, no retry-until-pass; all raw media retained',sourceSha256:digest(await readFile(input)),outputs:[]};
let reference;
for(let pair=0;pair<10;pair++)for(const [kind,render] of [['baseline',baseline],['candidate',renderClip]]){
 const outputPath=`${dir}/${pair}-${kind}.mp4`,raw=`${dir}/${pair}-${kind}.yuv`;
 await render({inputPath:input,outputPath,edit:{clip_format:'square_1_1',fit_mode:'fill',trim_start_ms:123,trim_end_ms:2123,brand_mark_enabled:false},ffmpeg:`${dir}/ffmpeg-wrapper.mjs`});
 await runMediaProcess('ffmpeg',['-nostdin','-v','error','-threads','2','-filter_threads','2','-i',outputPath,'-map','0:v:0','-pix_fmt','yuv420p','-f','rawvideo',raw]);
 const bytes=await readFile(raw);reference??=bytes;let count=0,first=null,max=0;const frames=new Set();for(let i=0;i<bytes.length;i++)if(bytes[i]!==reference[i]){count++;first??=i;max=Math.max(max,Math.abs(bytes[i]-reference[i]));frames.add(Math.floor(i/48600));}
 const result={pair,kind,sha256:digest(bytes),count,first,max,frames:[...frames]};receipt.outputs.push(result);console.log(JSON.stringify(result));await writeFile(`${dir}/receipt.json`,JSON.stringify(receipt,null,2)+'\n');
}
