import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile, chmod, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { clipRenderColorPlan, requireClipHdrCapabilities, isClipSdrOutput } from '../scripts/lib/clip-render-color.mjs';
import { buildClipRenderPlan, renderClip, runMediaProcess, probeClip } from '../scripts/lib/clip-render-core.mjs';
import { safeClipExportFailureCode, classifyClipExportFailure } from '../scripts/lib/clip-export-health.mjs';

const hdr={codec_type:'video',width:288,height:162,color_transfer:'smpte2084',color_space:'bt2020nc',color_primaries:'bt2020',color_range:'tv'};
const edit={clip_format:'landscape_16_9',fit_mode:'fit',trim_start_ms:0,trim_end_ms:1000,brand_mark_enabled:false};
test('color policy never guesses HDR metadata or claims Dolby Vision qualification',()=>{
  for(const stream of [{},{...hdr,color_transfer:'bt709'},{...hdr,color_transfer:undefined}])assert.equal(clipRenderColorPlan(stream),null);
  for(const patch of [{color_primaries:undefined},{color_space:'unknown'},{color_range:undefined}])
    assert.throws(()=>clipRenderColorPlan({...hdr,...patch}),/hdr_color_metadata_unqualified/);
  assert.throws(()=>clipRenderColorPlan({side_data_list:[{side_data_type:'Mastering display metadata'}]}),/hdr_color_metadata_unqualified/);
  assert.throws(()=>clipRenderColorPlan({side_data_list:[{side_data_type:'HDR Dynamic Metadata SMPTE2094-40 (HDR10+)'}]}),/hdr_color_metadata_unqualified/);
  for(const stream of [{...hdr,codec_tag_string:'dvh1'},{...hdr,side_data_list:[{side_data_type:'DOVI configuration record',dv_profile:8}]}])
    assert.throws(()=>clipRenderColorPlan(stream),/hdr_dolby_vision_unqualified/);
  for(const codec_tag_string of ['dvhe','dvav','dva1','dav1'])assert.throws(()=>clipRenderColorPlan({...hdr,codec_tag_string}),/hdr_dolby_vision_unqualified/);
  for(const transfer of ['smpte2084','arib-std-b67']){
    const p=buildClipRenderPlan({...edit,brand_mark_enabled:true},{streams:[{...hdr,color_transfer:transfer}],format:{duration:'1'}},{watermarkPath:'/local/mark'});
    assert.ok(p.filter.indexOf('tonemap=')<p.filter.indexOf('[base]'));
    assert.ok(p.filter.indexOf('[base]')<p.filter.indexOf('overlay='));
  }
  for(const code of ['hdr_color_metadata_unqualified','hdr_dolby_vision_unqualified','hdr_conversion_unavailable']){
    assert.equal(safeClipExportFailureCode(new Error(code)),code);
    assert.equal(classifyClipExportFailure(code),code==='hdr_conversion_unavailable'?'worker_resource':'input_permanent');
  }
  assert.equal(isClipSdrOutput({...hdr,pix_fmt:'yuv420p'}),false);
  const sdr={pix_fmt:'yuv420p',color_primaries:'bt709',color_transfer:'bt709',color_space:'bt709',color_range:'tv'};
  assert.ok(isClipSdrOutput(sdr));
  for(const key of Object.keys(sdr))assert.equal(isClipSdrOutput({...sdr,[key]:'unknown'}),false);
});
test('HDR capabilities must exist; missing filters fail clearly and cancellation propagates',async()=>{
  const listing=' .SC zscale V->V\n .S. tonemap V->V\n T.. sidedata V->V\n ... setparams V->V\n';
  await requireClipHdrCapabilities('ffmpeg',{},async()=>listing);
  for(const name of ['zscale','tonemap','sidedata','setparams'])await assert.rejects(requireClipHdrCapabilities('ffmpeg',{},async()=>listing.replace(name,'missing')),/hdr_conversion_unavailable/);
  await assert.rejects(requireClipHdrCapabilities('ffmpeg',{},async()=>{throw new Error('render_canceled');}),/render_canceled/);
});

// Independent transfer/curve reference, not a second FFmpeg filter invocation.
// ST2084 constants, BT2100 HLG inverse OETF + 1000-nit display gamma1.2,
// and display-referred BT709/BT1886 inverse EOTF (gamma2.4). zimg uses
// display-referred conversion, not a camera OETF; see its colorspace/gamma.cpp.
// Flat neutral patches avoid gamut-mapping ambiguity.
const m1=2610/16384,m2=2523/32,c1=3424/4096,c2=2413/128,c3=2392/128;
const pq=nits=>((c1+c2*(nits/10000)**m1)/(1+c3*(nits/10000)**m1))**m2;
const unpq=signal=>10000*(Math.max(signal**(1/m2)-c1,0)/(c2-c3*signal**(1/m2)))**(1/m1);
const a=0.17883277,b=1-4*a,c=0.5-a*Math.log(4*a);
const hlgOetf=scene=>scene<=1/12?Math.sqrt(3*scene):a*Math.log(12*scene-b)+c;
const hlg=nits=>hlgOetf((nits/1000)**(1/1.2));
const unhlg=signal=>1000*(signal<=0.5?signal**2/3:(Math.exp((signal-c)/a)+b)/12)**1.2;
const bt709=linear=>Math.max(0,linear)**(1/2.4);
const mobius=(value,peak)=>{const knee=0.3;if(value<=knee)return value;const aa=-knee*knee*(peak-1)/(knee*knee-2*knee+peak),bb=(knee*knee-2*knee*peak+peak)/(peak-1);return (bb+knee)**2/(bb-aa)*(value+aa)/(value+bb);};
const rgb709to2020=[[0.627404,0.329283,0.043313],[0.069097,0.919540,0.011362],[0.016391,0.088013,0.895595]];
const colorPatches=[[0.2,0.01,0.01],[0.01,0.2,0.01],[0.01,0.01,0.2]];
const yuv=(rgb,kr,kb)=>{const y=kr*rgb[0]+(1-kr-kb)*rgb[1]+kb*rgb[2];return [y,(rgb[2]-y)/(2*(1-kb)),(rgb[0]-y)/(2*(1-kr))];};

test('real PQ/HLG neutral patches convert to referenced BT709 SDR; watermark stays SDR and original stays intact',{timeout:60000},async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'clip-hdr-'));
  try {
    const width=288,height=162,mark=path.join(dir,'mark.png');
    await runMediaProcess('ffmpeg',['-nostdin','-v','error','-f','lavfi','-i','color=c=0x808080:size=40x40','-frames:v','1','-threads','1',mark]);
    for(const [transfer,id,levels,encode,decode,peak] of [
      ['smpte2084',16,[0,1,10,30,100,400,1000,4000,10000],pq,unpq,100],
      ['arib-std-b67',18,[0,1,10,30,100,200,400,700,1000],hlg,unhlg,10],
    ]) for(const range of ['tv','pc']) {
      const raw=path.join(dir,`${id}-${range}.raw`),input=path.join(dir,`${id}-${range}.mp4`),output=path.join(dir,`${id}-${range}-out.mp4`),pixels=path.join(dir,`${id}-${range}-out.raw`);
      const black=range==='tv'?64:0,span=range==='tv'?876:1023;
      const codes=levels.map(n=>Math.round(black+span*encode(n))),frame=Buffer.alloc(width*height*3);
      for(let y=0;y<height;y++)for(let x=0;x<width;x++)frame.writeUInt16LE(y>=100?black:codes[Math.floor(x/32)],(y*width+x)*2);
      for(let offset=width*height*2;offset<frame.length;offset+=2)frame.writeUInt16LE(512,offset);
      // Independently construct in-gamut chromatic patches from known linear
      // BT709 values, not another invocation of the production color filters.
      for(const [index,rgb] of colorPatches.entries()){
        const linear2020=rgb709to2020.map(row=>row.reduce((sum,k,c)=>sum+k*rgb[c],0));
        // HLG's colored OOTF uses scene luminance, not a separate gamma on
        // each RGB component. For neutral patches these formulations coincide.
        const display2020=linear2020.map(v=>v/10),yd=yuv(display2020,0.2627,0.0593)[0];
        const signal2020=id===18?display2020.map(v=>hlgOetf(v*yd**(-0.2/1.2))):linear2020.map(v=>encode(100*v));
        const [yy,uu,vv]=yuv(signal2020,0.2627,0.0593);
        const chromaSpan=range==='tv'?896:1023;
        for(let y=100;y<height;y++)for(let x=index*32;x<(index+1)*32;x++)frame.writeUInt16LE(Math.round(black+span*yy),(y*width+x)*2);
        for(let y=50;y<height/2;y++)for(let x=index*16;x<(index+1)*16;x++){
          frame.writeUInt16LE(Math.round(512+chromaSpan*uu),(width*height+y*width/2+x)*2);
          frame.writeUInt16LE(Math.round(512+chromaSpan*vv),(width*height*1.25+y*width/2+x)*2);
        }
      }
      await writeFile(raw,Buffer.concat(Array(10).fill(frame)));
      await runMediaProcess('ffmpeg',['-nostdin','-v','error','-f','rawvideo','-pixel_format','yuv420p10le','-video_size',`${width}x${height}`,'-framerate','10','-i',raw,'-c:v','libx265','-threads','1','-x265-params',`pools=1:frame-threads=1:log-level=error:lossless=1:colorprim=9:transfer=${id}:colormatrix=9:range=${range==='tv'?'limited':'full'}`,input]);
      const original=await readFile(input),source=(await probeClip(input)).streams[0];
      assert.equal(source.color_transfer,transfer);assert.equal(source.pix_fmt,'yuv420p10le');assert.equal(source.color_range,range);
      if(id===16&&range==='tv'){
        const unavailable=path.join(dir,'missing-zscale'),neverOutput=path.join(dir,'never.mp4');
        await writeFile(unavailable,'#!/usr/bin/env node\nif(process.argv.includes("-filters")){process.stdout.write(" .S. tonemap V->V\\n T.. sidedata V->V\\n ... setparams V->V\\n");}else{process.exit(97);}\n');
        await chmod(unavailable,0o700);
        await assert.rejects(renderClip({inputPath:input,outputPath:neverOutput,edit,ffmpeg:unavailable}),/hdr_conversion_unavailable/);
        await assert.rejects(stat(neverOutput),{code:'ENOENT'});
      }
      await renderClip({inputPath:input,outputPath:output,watermarkPath:mark,edit:{...edit,brand_mark_enabled:true,brand_asset_id:'synthetic-mark'}});
      assert.deepEqual(await readFile(input),original);
      const out=(await probeClip(output)).streams[0];assert.ok(isClipSdrOutput(out));assert.equal(out.codec_name,'h264');
      await runMediaProcess('ffmpeg',['-nostdin','-v','error','-threads','1','-i',output,'-frames:v','1','-pix_fmt','yuv420p','-f','rawvideo',pixels]);
      const decoded=await readFile(pixels),observed=[];
      for(let index=0;index<codes.length;index++){
        const signal=(codes[index]-black)/span,linear=decode(signal)/100;
        const expected=Math.round(16+219*Math.min(1,Math.max(0,bt709(mobius(linear,peak)))));
        const actual=decoded[40*width+index*32+16];observed.push(actual);
        assert.ok(Math.abs(actual-expected)<=4,`${transfer} ${levels[index]}nit: ${actual} expected ${expected}`);
      }
      assert.ok(observed.every((value,index)=>index===0||value>=observed[index-1]),'neutral gradient remains monotonic');
      for(const [index,rgb] of colorPatches.entries()){
        const [yy,uu,vv]=yuv(rgb.map(bt709),0.2126,0.0722),x=index*32+16,y=130;
        const actual=[decoded[y*width+x],decoded[width*height+(y/2)*(width/2)+x/2],decoded[width*height*1.25+(y/2)*(width/2)+x/2]];
        const expected=[16+219*yy,128+224*uu,128+224*vv];
        assert.ok(actual.every((v,c)=>Math.abs(v-expected[c])<=5),`${transfer}/${range} chromatic patch ${index}: ${actual} expected ${expected}`);
      }
      assert.ok(Math.abs(decoded[130*width+250]-126)<=4,'SDR gray watermark is not HDR-tone-mapped');
      assert.ok(decoded[130*width+200]<=20,'watermark contrasts with black source pixels');
      const first=JSON.parse(await runMediaProcess('ffprobe',['-v','error','-select_streams','v:0','-read_intervals','%+#1','-show_frames','-of','json',output]));
      assert.ok(!first.frames.some(f=>(f.side_data_list??[]).some(s=>/mastering display|content light|dovi|dynamic hdr/i.test(s.side_data_type))));
    }
  }finally{await rm(dir,{recursive:true,force:true});}
});
