import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

test('real worker downloads streamed bytes, passes same temporary bytes to scanner, persists computed digest',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'byte-receipt-worker-test-'));
 const data=Buffer.from('Synthetic byte receipt fixture\u0000\u00ff\n');
 const calls=[];
 const job={id:'10000000-0000-4000-8000-000000000001',target_table:'platform_brand_assets',target_column:'logo',
   size_bytes:data.length,storage_provider:'supabase',storage_bucket:'platform-brand-assets',storage_object_key:'fixture/logo.png',attempt_count:1};
 const server=createServer(async(req,res)=>{
  let raw='';for await(const chunk of req)raw+=chunk;
  const name=req.url.split('/').at(-1);const payload=raw?JSON.parse(raw):null;calls.push({name,payload});
  if(req.method==='GET') {res.writeHead(200,{'content-type':'application/octet-stream','content-length':data.length});res.write(data.subarray(0,5));res.end(data.subarray(5));return;}
  res.setHeader('content-type','application/json');
  const results={recover_media_scan_jobs:{},claim_media_scan_jobs:[job],begin_media_scan_byte_observation:'observation-id',
   complete_media_scan_job:{status:'clean',targetPropagationComplete:true},record_media_scan_byte_receipt:'receipt-id'};
  res.end(JSON.stringify(results[name]??null));
 });
 try {
  // Scanner executable is explicitly synthetic, not a claim of ClamAV efficacy.
  // It asserts the actual on-disk bytes passed by the unmodified worker entrypoint.
  const scanner=join(directory,'synthetic-scanner.mjs');
  await writeFile(scanner,`#!/usr/bin/env node\nimport {readFileSync} from 'node:fs';\nif(process.argv.includes('--version'))console.log('ClamAV fixture/123');else if(readFileSync(process.argv.at(-1)).toString('hex')!==${JSON.stringify(data.toString('hex'))})process.exit(2);\n`,{mode:0o700});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const child=spawn(process.execPath,[fileURLToPath(new URL('../ops/malware-scanner-worker/worker.mjs',import.meta.url))],{
   env:{...process.env,SUPABASE_URL:`http://127.0.0.1:${server.address().port}`,SUPABASE_SERVICE_ROLE_KEY:'synthetic-local-only',
    WORKER_ID:'stream-test-worker',SCAN_ONCE:'true',FRESHCLAM_ON_START:'false',CLAMSCAN_BIN:scanner},stdio:['ignore','pipe','pipe']});
  let output='';child.stdout.on('data',x=>output+=x);child.stderr.on('data',x=>output+=x);
  const timer=setTimeout(()=>child.kill('SIGKILL'),15000);
  const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',resolve);});clearTimeout(timer);
  assert.equal(code,0,output);
  assert.equal(calls.find(x=>x.name==='complete_media_scan_job').payload.p_status,'clean');
  const receipt=calls.find(x=>x.name==='record_media_scan_byte_receipt');
  assert.deepEqual(receipt.payload,{p_observation_id:'observation-id',p_job_id:job.id,p_worker_id:'stream-test-worker',
   p_sha256:createHash('sha256').update(data).digest('hex'),p_size_bytes:data.length});
  assert.ok(calls.findIndex(x=>x.name==='complete_media_scan_job')<calls.indexOf(receipt));
  assert.match(output,/"byteReceiptId":"receipt-id"/);
 } finally {await new Promise(resolve=>server.close(resolve));await rm(directory,{recursive:true,force:true});}
});
