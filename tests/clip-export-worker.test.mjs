import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import { createServer } from 'node:http';
import { randomUUID, createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runMediaProcess } from '../scripts/lib/clip-render-core.mjs';
import { runClipExportOnce } from '../scripts/lib/clip-export-worker.mjs';

test('production worker downloads, actually renders, streams verified output, seals and finishes in order', {timeout:30000},async()=>{
 const temp=await mkdtemp(path.join(tmpdir(),'clip-worker-proof-'));
 const input=path.join(temp,'input.mp4');
 await runMediaProcess('ffmpeg',['-nostdin','-v','error','-f','lavfi','-i','testsrc2=size=320x180:rate=30','-t','3','-c:v','libx264','-threads','1',input]);
 const bytes=await readFile(input);let written=null,marker=null,completed=null,writeCount=0;
 const server=createServer(async(req,res)=>{
  if(req.url==='/source'){res.writeHead(200,{'content-length':bytes.length}).end(bytes);return;}
  if(req.method==='PUT'){
   writeCount++;assert.equal(req.headers['if-none-match'],'*');assert.equal(written,null);
   const chunks=[];for await(const c of req)chunks.push(c);written=Buffer.concat(chunks);
   marker=req.headers['x-amz-meta-chillywood-write-id'];res.writeHead(200,{etag:'"render-generation"'}).end();return;
  }
  assert.equal(req.method,'GET');assert.equal(req.headers['if-match'],'"render-generation"');
  res.writeHead(200,{etag:'"render-generation"','content-length':written.length,'x-amz-meta-chillywood-write-id':marker}).end(written);
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const job={id:randomUUID(),lease:randomUUID(),owner_id:randomUUID(),output_video_id:randomUUID(),source_video_id:randomUUID(),
  source_snapshot:{storage_provider:'cloudflare_r2',storage_bucket:'private',storage_object_key:'owner/source.mp4',file_size_bytes:bytes.length,sourceBinding:{id:'fixture-binding'}},
  edit_snapshot:{clip_format:'square_1_1',fit_mode:'fill',trim_start_ms:500,trim_end_ms:1500,brand_mark_enabled:false},watermark_snapshot:null};
 const calls=[];let inventory;
 const rpc=async(name,args)=>{
  calls.push(name);
  if(name==='claim_creator_clip_export')return job;
  if(name==='heartbeat_creator_clip_export')return true;
  if(name==='begin_secondary_media_producer')return {producerId:job.lease,claimToken:'claim'};
  if(name==='reserve_secondary_media_objects'){inventory=args.p_inventory;return {reserved:true,objectCount:1};}
  if(name==='begin_secondary_media_object_write')return {objectId:randomUUID(),writeToken:randomUUID(),provider:'cloudflare_r2',bucket:'private',...inventory.objects[0]};
  if(name==='record_secondary_media_object_receipt'){assert.equal(args.p_receipt.fullReadback,true);return {recorded:true,publishable:true};}
  if(name==='seal_secondary_media_producer')return {sealed:true,producerId:job.lease};
  if(name==='finish_creator_clip_export'){completed=args.p_result;return {status:'ready',outputVideoId:job.output_video_id};}
  throw new Error(`unexpected RPC ${name}`);
 };
 try{
  const result=await runClipExportOnce({rpc,outputBucket:'private',signer:async(_method,id)=>`http://127.0.0.1:${server.address().port}/${id.objectKey.endsWith('/source.mp4')?'source':'output'}`});
  assert.equal(result.completed,true);assert.equal(result.privateDraftCreated,true);assert.equal(writeCount,1);
  assert.equal(completed.width,180);assert.equal(completed.height,180);assert.ok(Math.abs(completed.durationMs-1000)<100);
  assert.equal(completed.sha256,createHash('sha256').update(written).digest('hex'));
  const meaningful=calls.filter(name=>name!=='heartbeat_creator_clip_export');
  assert.deepEqual(meaningful,['claim_creator_clip_export','begin_secondary_media_producer','reserve_secondary_media_objects','begin_secondary_media_object_write','record_secondary_media_object_receipt','seal_secondary_media_producer','finish_creator_clip_export']);
 }finally{await new Promise(resolve=>server.close(resolve));await rm(temp,{recursive:true,force:true});}
});
test('retired lease never downloads or publishes; disabled/empty queue performs no work',async()=>{
 const calls=[];const job={id:'fixture',lease:'lease'};
 const denied=await runClipExportOnce({rpc:async(name)=>{calls.push(name);if(name==='claim_creator_clip_export')return job;if(name==='heartbeat_creator_clip_export')return false;return false;},download:async()=>{throw Error('must not download');}});
 assert.equal(denied.completed,false);assert.deepEqual(calls,['claim_creator_clip_export','heartbeat_creator_clip_export','fail_creator_clip_export']);
 assert.deepEqual(await runClipExportOnce({rpc:async()=>null}),{claimed:false});
});
