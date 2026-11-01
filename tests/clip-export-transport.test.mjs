import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { createClipOriginSigner, downloadClipSource, hashClipFile, uploadClipOutput } from '../scripts/lib/clip-export-transport.mjs';

test('origin signer binds create-only headers and refuses identity/provider/method changes',async()=>{
 const signer=createClipOriginSigner({provider:'cloudflare_r2',bucket:'fixture-private',endpoint:'https://fixture.r2.cloudflarestorage.com',region:'auto',accessKeyId:'fixture',secretAccessKey:'synthetic-test-secret'},()=>new Date('2026-11-01T00:00:00Z'));
 const id={provider:'cloudflare_r2',bucket:'fixture-private',objectKey:'owner/output/job/export.mp4'};
 await assert.rejects(signer('DELETE',id),/identity/);
 await assert.rejects(signer('PUT',id),/create_only/);
 await assert.rejects(signer('GET',{...id,objectKey:'../other'}),/identity/);
 await assert.rejects(signer('GET',{...id,bucket:'other'}),/identity/);
 const url=new URL(await signer('PUT',id,{headers:{'If-None-Match':'*','Content-Length':'12','x-amz-meta-chillywood-write-id':'fixture'}}));
 assert.equal(url.searchParams.get('X-Amz-SignedHeaders'),'content-length;host;if-none-match;x-amz-meta-chillywood-write-id');
 assert.equal(url.pathname,'/owner/output/job/export.mp4');assert.match(url.searchParams.get('X-Amz-Signature'),/^[a-f0-9]{64}$/);
});
test('actual streamed HTTP upload/readback verifies all bytes, no overwrite and no retry after unknown outcome', {timeout:30000}, async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'clip-transport-'));
 const file=path.join(dir,'output.mp4'),bytes=Buffer.alloc(3*1024*1024,73);
 await writeFile(file,bytes);
 const identity={provider:'cloudflare_r2',bucket:'fixture-private',objectKey:'owner/output/job/export.mp4',writeToken:randomUUID(),...(await hashClipFile(file))};
 let stored=null,mode='normal',puts=0,gets=0;
 const server=createServer(async(req,res)=>{
  if(req.method==='PUT'){
   puts++;assert.equal(req.headers['if-none-match'],'*');
   if(stored){res.writeHead(412).end();return;}
   const chunks=[];for await(const chunk of req)chunks.push(chunk);stored=Buffer.concat(chunks);
   assert.equal(stored.length,bytes.length);
   if(mode==='disconnect'){req.socket.destroy();return;}
   res.writeHead(200,{etag:'"fixture-v1"'}).end();
  }else{
   gets++;assert.equal(req.headers['if-match'],'"fixture-v1"');
   res.writeHead(200,{etag:mode==='changed'? '"fixture-v2"':'"fixture-v1"',
    'content-length':stored.length,'x-amz-meta-chillywood-write-id':identity.writeToken});res.end(stored);
  }
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 // HTTP only inside this disposable transport fixture. Production signer is
 // separately checked above and rejects anything other than HTTPS origins.
 const signer=async()=>`http://127.0.0.1:${server.address().port}/object`;
 try {
  const receipt=await uploadClipOutput({file,identity,signer});
  assert.equal(receipt.fullReadback,true);assert.equal(receipt.sha256,createHash('sha256').update(bytes).digest('hex'));
  assert.equal(puts,1);assert.equal(gets,1);
  await assert.rejects(uploadClipOutput({file,identity,signer}),/conflict/);assert.equal(puts,2);assert.equal(gets,1);
  stored=null;mode='changed';await assert.rejects(uploadClipOutput({file,identity,signer}),/identity_changed/);
  stored=null;mode='disconnect';const before=puts;
  await assert.rejects(uploadClipOutput({file,identity,signer}),/write_unknown/);assert.equal(puts,before+1);
 } finally {await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true,force:true});}
});
test('source download streams an exact full object and rejects truncation/size disagreement',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'clip-download-'));
 const source={storage_provider:'cloudflare_r2',storage_bucket:'private',storage_object_key:'owner/source.mp4',file_size_bytes:4};
 const signer=async()=> 'https://fixture.invalid/source';
 try {
  const file=path.join(dir,'input');
  await downloadClipSource({source,file,signer,fetcher:async()=>new Response('test',{headers:{'content-length':'4'}})});
  assert.equal((await readFile(file)).toString(),'test');
  await assert.rejects(downloadClipSource({source,file:path.join(dir,'bad'),signer,fetcher:async()=>new Response('xx',{headers:{'content-length':'2'}})}),/size_mismatch/);
  await assert.rejects(downloadClipSource({source,file:path.join(dir,'partial'),signer,fetcher:async()=>new Response('test',{status:206,headers:{'content-range':'bytes 0-3/4'}})}),/download_invalid/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
