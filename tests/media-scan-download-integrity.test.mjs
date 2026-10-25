import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {mkdtemp,writeFile,readFile,rm,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {gzipSync} from 'node:zlib';
const data=Buffer.from('verified media bytes');
const cases=[['correct',{},true],['correct chunked',{chunked:true},true],
 ['empty declared',{body:Buffer.alloc(0)},false],['empty chunked',{body:Buffer.alloc(0),chunked:true},false],
 ['wrong expected',{expected:data.length+1},false],['short chunked',{body:data.subarray(0,-1),chunked:true},false],
 ['long chunked',{body:Buffer.concat([data,Buffer.from('extra')]),chunked:true},false],
 ['truncated declared',{truncate:true},false],['partial response',{status:206},false],['content range',{range:true},false],
 ['compressed response',{compressed:true},false],['zero expected',{expected:0},false],['missing expected',{expected:null},false],['invalid expected',{expected:'bad'},false]];
for(const provider of ['supabase','cloudflare_r2','s3']) for(const [label,options,allowed] of cases) {
 test(`${provider}: ${label} requires exact bytes before scan`,async()=>{
  const directory=await mkdtemp(join(tmpdir(),'scan-integrity-'));const marker=join(directory,'engine-called');const calls=[];let encoding;
  const job={id:'10000000-0000-4000-8000-000000000002',target_table:'videos',target_column:'source',storage_provider:provider,
   storage_bucket:'fixture',storage_object_key:'fixture.bin',attempt_count:1,size_bytes:Object.hasOwn(options,'expected')?options.expected:data.length};
  const server=createServer(async(req,res)=>{
   let raw='';for await(const chunk of req)raw+=chunk;const name=req.url.split('/').at(-1);const payload=raw?JSON.parse(raw):null;
   if(req.method==='GET'||payload?.action==='download_scan_job') {
    encoding=req.headers['accept-encoding'];let body=options.body??data;const headers={'content-type':'application/octet-stream'};
    if(options.compressed){body=gzipSync(body);headers['content-encoding']='gzip';}
    if(options.range||options.status===206)headers['content-range']=`bytes 0-${body.length-1}/${body.length}`;
    if(options.chunked)headers['transfer-encoding']='chunked';else headers['content-length']=options.truncate?data.length:body.length;
    res.writeHead(options.status??200,headers);
    if(options.truncate){res.write(data.subarray(0,3));setTimeout(()=>res.destroy(),20);return;}
    res.write(body.subarray(0,3));res.end(body.subarray(3));return;
   }
   calls.push({name,payload});res.setHeader('content-type','application/json');res.end(JSON.stringify(name==='claim_media_scan_jobs'?[job]:{}));
  });let child;
  try {
   const scanner=join(directory,'synthetic-scanner.mjs');
   await writeFile(scanner,`#!/usr/bin/env node\nimport {readFileSync,writeFileSync} from 'node:fs';\nif(process.argv.includes('--version'))console.log('ClamAV fixture/123');else {writeFileSync(${JSON.stringify(marker)},'called');if(readFileSync(process.argv.at(-1)).toString('hex')!==${JSON.stringify(data.toString('hex'))})process.exit(2);}\n`,{mode:0o700});
   await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
   child=spawn(process.execPath,[fileURLToPath(new URL('../ops/malware-scanner-worker/worker.mjs',import.meta.url))],{
    env:{PATH:process.env.PATH,SUPABASE_URL:`http://127.0.0.1:${server.address().port}`,SUPABASE_SERVICE_ROLE_KEY:'synthetic',MEDIA_SCAN_JOB_TOKEN:'synthetic',SCAN_ONCE:'true',FRESHCLAM_ON_START:'false',CLAMSCAN_BIN:scanner,TMPDIR:directory},stdio:['ignore','pipe','pipe']});
   let output='';child.stdout.on('data',x=>output+=x);child.stderr.on('data',x=>output+=x);const timer=setTimeout(()=>child.kill('SIGKILL'),10000);
   let code;try{code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',resolve);});}finally{clearTimeout(timer);}
   assert.equal(code,0,output);const completed=calls.filter(x=>x.name==='complete_media_scan_job');
   assert.equal(completed.length,1,output);assert.equal(completed[0].payload.p_status,allowed?'clean':'scan_failed',output);
   assert.equal(await readFile(marker,'utf8').then(()=>true,()=>false),allowed,'scanner engine invocation');assert.equal(encoding,'identity');
   assert.deepEqual((await readdir(directory)).filter(x=>x.startsWith('chillywood-scan-')),[],'temporary download cleanup');
   assert.equal(calls.some(x=>x.name==='record_media_scan_byte_receipt'),false);
   if(!allowed)assert.doesNotMatch(output,/"event":"media_scan_completed"/);
  }finally{child?.kill();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await rm(directory,{recursive:true,force:true});}
 });
}
