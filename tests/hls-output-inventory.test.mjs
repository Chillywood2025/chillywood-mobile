import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,symlinkSync,readFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {buildHlsOutputInventory} from '../scripts/lib/hls-output-inventory.mjs';

function fixture(t,contents) {
  const outputRoot=mkdtempSync(path.join(os.tmpdir(),'hls-inventory-'));
  t.after(()=>rmSync(outputRoot,{recursive:true,force:true}));
  for(const [key,value] of Object.entries(contents)) {
    mkdirSync(path.dirname(path.join(outputRoot,key)),{recursive:true});
    writeFileSync(path.join(outputRoot,key),value);
  }
  return {outputRoot,outputPrefix:'playback/public/auto/source/generation/',files:Object.keys(contents),roots:['master.m3u8']};
}
const standard={
  'master.m3u8':'#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-STREAM-INF:BANDWIDTH=500000\n360p/index.m3u8\n',
  '360p/index.m3u8':'#EXTM3U\n#EXT-X-TARGETDURATION:4\n#EXT-X-PLAYLIST-TYPE:VOD\n#EXTINF:4.000000,\nsegment-000.ts\n#EXT-X-ENDLIST\n',
  '360p/segment-000.ts':Buffer.from([0x47,0,1,2]),
};
test('inventories exact generated HLS bytes and dependencies without granting retention authority',t=>{
  const input=fixture(t,standard),result=buildHlsOutputInventory(input);
  assert.equal(result.objectCount,3);assert.equal(result.retentionQualified,false);assert.equal(result.providerBytesVerified,false);
  assert.deepEqual(result.objects.find(x=>x.relativePath==='master.m3u8').dependencies,['360p/index.m3u8']);
  const segment=result.objects.find(x=>x.kind==='media');
  assert.equal(segment.sha256,createHash('sha256').update(standard['360p/segment-000.ts']).digest('hex'));
  assert.equal(segment.objectKey,input.outputPrefix+'360p/segment-000.ts');
  assert.equal(buildHlsOutputInventory({...input,files:[...input.files].reverse()}).inventorySha256,result.inventorySha256);
});
test('supports ffmpeg initialization-map references and explicit unencrypted keys',t=>{
  const input=fixture(t,{'master.m3u8':'#EXTM3U\n#EXT-X-MAP:URI="init.mp4"\n#EXT-X-KEY:METHOD=NONE\n#EXTINF:4,\nsegment.m4s\n#EXT-X-ENDLIST\n',
    'init.mp4':'init','segment.m4s':'segment'});
  assert.deepEqual(buildHlsOutputInventory(input).objects.find(x=>x.kind==='playlist').dependencies,['init.mp4','segment.m4s']);
});
test('supports independent premium masters and shared local dependencies',t=>{
  const input=fixture(t,{...standard,'360p/master.m3u8':'#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=500000\nindex.m3u8\n'});
  input.roots=['master.m3u8','360p/master.m3u8'];
  assert.equal(buildHlsOutputInventory(input).objectCount,4);
});
test('rejects external, encoded, traversal and unsupported encryption references',t=>{
  for(const reference of ['https://outside.test/a.ts','file:///etc/passwd','../segment.ts','/segment.ts','%2e%2e/a.ts','a.ts?key=secret','a.ts#part','a\\b.ts']) {
    const input=fixture(t,{'master.m3u8':`#EXTM3U\n${reference}\n`});
    assert.throws(()=>buildHlsOutputInventory(input),/hls_inventory_reference_invalid/);
  }
  for(const line of ['#EXT-X-KEY:METHOD=AES-128,URI="key.bin"','#EXT-X-SESSION-KEY:METHOD=AES-128,URI="key.bin"',
    '#EXT-X-MAP:URI=init.mp4','#EXT-X-MAP:URI="init.mp4",URI="other.mp4"']) {
    const input=fixture(t,{'master.m3u8':`#EXTM3U\n${line}\n`});
    assert.throws(()=>buildHlsOutputInventory(input),/hls_inventory_(encryption_unsupported|uri_tag_unsupported|uri_invalid)/);
  }
});
test('rejects missing, cyclic and unreachable objects rather than calling prefix contents complete',t=>{
  for(const [contents,error] of [
    [{'master.m3u8':'#EXTM3U\nmissing.ts\n'},'dependency_missing'],
    [{'master.m3u8':'#EXTM3U\nchild.m3u8\n','child.m3u8':'#EXTM3U\nmaster.m3u8\n'},'cycle'],
    [{...standard,'unused.ts':'orphan'},'unreachable_object'],
  ])assert.throws(()=>buildHlsOutputInventory(fixture(t,contents)),new RegExp(`hls_inventory_${error}`));
});
test('rejects symlink aliasing, invalid roots, duplicate paths and size/count overflows',t=>{
  const input=fixture(t,standard);
  symlinkSync('segment-000.ts',path.join(input.outputRoot,'360p','alias.ts'));
  assert.throws(()=>buildHlsOutputInventory({...input,files:[...input.files,'360p/alias.ts']}),/file_binding_invalid/);
  for(const files of [[...input.files,input.files[0]],Array(32769).fill('a.ts'),['../x']])
    assert.throws(()=>buildHlsOutputInventory({...input,files}),/files_invalid/);
  assert.throws(()=>buildHlsOutputInventory({...input,roots:['missing.m3u8']}),/root_missing/);
  assert.throws(()=>buildHlsOutputInventory({...input,outputPrefix:'../elsewhere/'}),/prefix_invalid/);
  writeFileSync(path.join(input.outputRoot,'master.m3u8'),'x'.repeat(4*1024*1024+1));
  assert.throws(()=>buildHlsOutputInventory(input),/file_size_invalid/);
});
test('both real producers validate exact upload lists before starting provider uploads',()=>{
  for(const [filename,upload] of [['media-automation-cli.mjs','const uploaded = uploadHlsTree('],['media-premium-hd-cli.mjs','const uploaded = [];']]) {
    const source=readFileSync(new URL(`../scripts/${filename}`,import.meta.url),'utf8');
    const validation=source.indexOf('const outputInventory = buildHlsOutputInventory(');
    assert.ok(validation>0);assert.ok(source.indexOf(upload,validation)>validation);
    assert.match(source.slice(validation),/uploadedObjectCount: uploaded.length,\s+outputInventory,/);
  }
});
