import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildClipRenderPlan, normalizeClipRenderEdit, renderClip, runMediaProcess, probeClip } from '../scripts/lib/clip-render-core.mjs';

test('actual ffprobe refuses nested playlist and concat inputs despite a video filename',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'clip-demuxer-'));
 try{
  for(const contents of ['ffconcat version 1.0\nfile /etc/passwd\n','#EXTM3U\n#EXT-X-TARGETDURATION:1\n#EXTINF:1,\n/etc/passwd\n#EXT-X-ENDLIST\n']){
   const file=path.join(dir,'source.mp4');await writeFile(file,contents);
   await assert.rejects(probeClip(file),/media_process_failed/);
  }
 }finally{await rm(dir,{recursive:true,force:true});}
});

const edit = { clip_format: 'square_1_1', fit_mode: 'fill', trim_start_ms: 1000, trim_end_ms: 2000, brand_mark_enabled: false };
const probe = { streams: [{ codec_type: 'video', width: 320, height: 180 }], format: { duration: '4.0' } };
test('render plans reject invalid ranges, untrusted text, missing watermark and invalid probes', () => {
  const plan = buildClipRenderPlan(edit, probe);
  assert.deepEqual([plan.width,plan.height,plan.duration,plan.start], [180,180,1,1]);
  for (const patch of [{ trim_start_ms:-1 },{ trim_end_ms:1000 },{ trim_end_ms:9999999 },{ clip_format:'square_1_1;movie=http://bad' }])
    assert.throws(()=>normalizeClipRenderEdit({...edit,...patch}));
  assert.throws(()=>buildClipRenderPlan({...edit,trim_end_ms:5000},probe),/outside_source/);
  assert.throws(()=>buildClipRenderPlan({...edit,brand_mark_enabled:true},probe),/watermark_bytes/);
  assert.throws(()=>buildClipRenderPlan(edit,{...probe,format:{duration:'NaN'}}),/source_probe/);
});
test('portrait rotation and fit produce even bounded dimensions without upscaling',()=>{
  const p=buildClipRenderPlan({...edit,clip_format:'vertical_9_16',fit_mode:'fit'},
    {...probe,streams:[{codec_type:'video',width:320,height:180,side_data_list:[{rotation:90}]}]});
  assert.equal(p.width,180);assert.equal(p.height,320);assert.match(p.filter,/pad=180:320/);
});
test('actual ffmpeg trims, crops, decodes, preserves original and never overwrites', {timeout:60000}, async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'clip-render-proof-'));
  const input=path.join(dir,'input.mp4'),output=path.join(dir,'output.mp4');
  try {
    await runMediaProcess('ffmpeg',['-nostdin','-v','error','-f','lavfi','-i','testsrc2=size=320x180:rate=30','-t','4','-c:v','libx264','-threads','1',input]);
    const original=await readFile(input);
    const result=await renderClip({inputPath:input,outputPath:output,edit});
    assert.equal(result.width,180);assert.equal(result.height,180);assert.ok(Math.abs(result.durationMs-1000)<100);
    assert.deepEqual(await readFile(input),original);
    const rendered=await readFile(output);
    await assert.rejects(renderClip({inputPath:input,outputPath:output,edit}),/render_output_exists/);
    assert.deepEqual(await readFile(output),rendered);
    await assert.rejects(renderClip({inputPath:input,outputPath:input,edit}),/immutable_source/);
    const canceled=new AbortController();canceled.abort();
    await assert.rejects(renderClip({inputPath:input,outputPath:path.join(dir,'cancel.mp4'),edit,signal:canceled.signal}),/render_canceled/);
  } finally { await rm(dir,{recursive:true,force:true}); }
});
test('actual watermark is composited into exported pixels', {timeout:60000}, async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'clip-watermark-proof-'));
  try {
    const input=path.join(dir,'input.mp4'),mark=path.join(dir,'mark.png'),output=path.join(dir,'out.mp4');
    await runMediaProcess('ffmpeg',['-nostdin','-v','error','-f','lavfi','-i','color=c=black:size=320x180:rate=30','-t','3','-c:v','libx264','-threads','1',input]);
    await runMediaProcess('ffmpeg',['-nostdin','-v','error','-f','lavfi','-i','color=c=white:size=40x40','-frames:v','1','-threads','1',mark]);
    const downloadedMark=path.join(dir,'watermark');await writeFile(downloadedMark,await readFile(mark));
    const result=await renderClip({inputPath:input,outputPath:output,watermarkPath:downloadedMark,edit:{...edit,brand_mark_enabled:true,brand_asset_id:'approved-synthetic'}});
    assert.equal(result.width,180);
    // Decode a pixel well inside the bottom-right white watermark.
    const pixelPath=path.join(dir,'pixel.raw');
    await runMediaProcess('ffmpeg',['-nostdin','-v','error','-i',output,'-vf','crop=2:2:150:150,format=gray','-frames:v','1','-f','rawvideo',pixelPath]);
    assert.ok((await readFile(pixelPath))[0]>200,'watermark is burned into output bytes');
  } finally {await rm(dir,{recursive:true,force:true});}
});
