// Real local TLS transport + real caller-supplied PostgreSQL RPCs. This proves
// signing, authority ordering and retry behavior, NOT Cloudflare R2 capability.
// Used only by the disposable-local-database concurrency runner.
import assert from 'node:assert/strict';
import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {createServer,request as httpsRequest} from 'node:https';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';

const encode=value=>encodeURIComponent(value).replace(/[!'()*]/g,c=>`%${c.charCodeAt(0).toString(16).toUpperCase()}`);
const hmac=(key,value)=>createHmac('sha256',key).update(value).digest();
const publicKey='synthetic-retention-transport-access';
const secretKey='synthetic-retention-transport-secret';
const hostname='chillywood-media-origin.retention.test';

function loadProductionModules(directory){
 // Node20 CI does not strip TypeScript. Transpile the unchanged production
 // modules and their small dependency closure, never a reimplemented worker.
 const files=['deleted-content-media-expiry','deleted-content-origin','content-inspection-private-origin',
  'content-inspection-media','media-upload-integrity'];
 for(const name of files){
  const source=readFileSync(new URL(`../../supabase/functions/_shared/${name}.ts`,import.meta.url),'utf8');
  const output=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
  writeFileSync(join(directory,`${name}.mjs`),output.replaceAll(/(from\s+["'][^"']+)\.ts(["'])/g,'$1.mjs$2'));
 }
 return Promise.all([
  import(pathToFileURL(join(directory,'deleted-content-media-expiry.mjs')).href),
  import(pathToFileURL(join(directory,'deleted-content-origin.mjs')).href),
 ]);
}

export async function verifyDeletedContentWorkerTransport({rpc,stageId,resetDispatch}){
 const temporary=mkdtempSync(join(tmpdir(),'deleted-content-transport-'));
 const keyPath=join(temporary,'localhost.key'),certPath=join(temporary,'localhost.crt');
 let server;
 let checks=0;
 const check=(value,message)=>{assert.ok(value,message);checks++;};
 try{
  execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-days','1',
   '-subj',`/CN=${hostname}`,'-addext',`subjectAltName=DNS:${hostname}`,
   '-keyout',keyPath,'-out',certPath],{stdio:'ignore'});
  const [{runDeletedStageCleanupBatch},{createRetiredMediaOriginCleanup}]=await loadProductionModules(temporary);
  const call=async(name,args)=>{
   const result=await rpc(name,args);
   assert.equal(result.error,null,`${name} must execute against actual local PostgreSQL`);
   return result.data;
  };
  const claimed=await call('reconcile_deleted_content_stage',{p_stage_id:stageId});
  assert.equal(claimed.status,'claimed');
  const binding=await call('read_deleted_content_stage_cleanup_claim',{p_claim_id:claimed.claimId});
  assert.equal(binding.status,'authorized');
  check(binding.provider==='cloudflare_r2'&&binding.bucket==='chillywood-media-origin','actual claim must bind the supported exact key class');
  const exactPath=`/${binding.objectKey.split('/').map(encode).join('/')}`;
  let present=true,mode='failure',serverFailure;
  const requests=[];
  server=createServer({key:readFileSync(keyPath),cert:readFileSync(certPath)},(request,response)=>{
   try{
    assert.ok(['HEAD','DELETE'].includes(request.method),'cleanup cannot request GET or PUT');
    const parsed=new URL(request.url,`https://${request.headers.host}`);
    assert.equal(parsed.pathname,exactPath,'server accepts only the exact database claim key');
    assert.equal(parsed.searchParams.get('X-Amz-Algorithm'),'AWS4-HMAC-SHA256');
    assert.equal(parsed.searchParams.get('X-Amz-SignedHeaders'),'host');
    assert.equal(parsed.searchParams.get('X-Amz-Expires'),'30');
    assert.equal(parsed.searchParams.get('X-Amz-Content-Sha256'),'UNSIGNED-PAYLOAD');
    const timestamp=parsed.searchParams.get('X-Amz-Date'),date=timestamp.slice(0,8);
    const scope=`${date}/auto/s3/aws4_request`;
    assert.equal(parsed.searchParams.get('X-Amz-Credential'),`${publicKey}/${scope}`);
    const supplied=parsed.searchParams.get('X-Amz-Signature');
    parsed.searchParams.delete('X-Amz-Signature');
    const query=[...parsed.searchParams].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${encode(k)}=${encode(v)}`).join('&');
    const canonical=[request.method,exactPath,query,`host:${request.headers.host}\n`,'host','UNSIGNED-PAYLOAD'].join('\n');
    const digest=createHash('sha256').update(canonical).digest('hex');
    const signingKey=hmac(hmac(hmac(hmac(`AWS4${secretKey}`,date),'auto'),'s3'),'aws4_request');
    const expected=hmac(signingKey,['AWS4-HMAC-SHA256',timestamp,scope,digest].join('\n'));
    assert.ok(/^[0-9a-f]{64}$/.test(supplied)&&timingSafeEqual(expected,Buffer.from(supplied,'hex')),'server verifies signature independently');
    requests.push({method:request.method,path:parsed.pathname});
    if(request.method==='DELETE'){
     if(mode==='failure'){response.writeHead(503).end();return;}
     if(mode==='redirect'){response.writeHead(307,{Location:`https://${request.headers.host}/forbidden-redirect`}).end();return;}
     present=false;
     if(mode==='disconnect'){request.socket.destroy();return;}
     if(mode==='late')present=true;
     response.writeHead(204).end();return;
    }
    response.writeHead(present?200:404).end();
   }catch(error){
    serverFailure=error;
    response.writeHead(500).end();
   }
  });
  await new Promise((resolve,reject)=>{
   server.once('error',reject);
   server.listen(0,'127.0.0.1',resolve);
  });
  const port=server.address().port,ca=readFileSync(certPath);
  // Real TLS request with a test-only DNS resolver and generated trust anchor.
  // No production endpoint/allowlist is changed and no response is fabricated.
  const transport=(url,init)=>new Promise((resolve,reject)=>{
   const target=new URL(url);
   assert.equal(target.hostname,hostname);
   assert.equal(target.port,String(port));
   assert.equal(init.redirect,'error');
   const request=httpsRequest(target,{
    method:init.method,ca,signal:init.signal,
    lookup:(_name,options,callback)=>options.all?callback(null,[{address:'127.0.0.1',family:4}]):callback(null,'127.0.0.1',4),
   },response=>{
    if(response.statusCode>=300&&response.statusCode<400){
     response.resume();reject(Error('test_transport_redirect_forbidden'));return;
    }
    const chunks=[];
    response.on('data',chunk=>chunks.push(chunk));
    response.on('end',()=>resolve(new Response(
     init.method==='HEAD'||response.statusCode===204?null:Buffer.concat(chunks),
     {status:response.statusCode},
    )));
    response.on('error',reject);
   });
   request.on('error',reject);request.end();
  });
  const environment={
   MEDIA_ORIGIN_PROVIDER:'cloudflare_r2',MEDIA_ORIGIN_PRIVATE_ONLY:'true',MEDIA_ORIGIN_PUBLIC_PLAYBACK_DISABLED:'true',
   MEDIA_ORIGIN_R2_ENDPOINT:`https://retention.test:${port}`,MEDIA_ORIGIN_BUCKET:'chillywood-media-origin',
   MEDIA_ORIGIN_R2_ACCESS_KEY_ID:publicKey,MEDIA_ORIGIN_R2_SECRET_ACCESS_KEY:secretKey,
  };
  const origin=createRetiredMediaOriginCleanup(name=>environment[name],transport);
  for(const [scenario,expectedStatus,expectedPresent,expectedMethods] of [
   ['failure','failed',true,['DELETE']],
   ['disconnect','failed',false,['DELETE']],
   ['late','delete_acknowledged',true,['DELETE','HEAD']],
   ['redirect','failed',true,['DELETE']],
   ['success','observed_absent',false,['DELETE','HEAD']],
  ]){
   mode=scenario;requests.length=0;
   await resetDispatch();
   const result=await runDeletedStageCleanupBatch(rpc,origin);
   if(serverFailure)throw serverFailure;
   assert.deepEqual(result,{enabled:true,results:[{status:expectedStatus}]});
   assert.deepEqual(requests.map(request=>request.method),expectedMethods);
   check(present===expectedPresent,`${scenario} reports actual synthetic object state without claiming permanent absence`);
   const sameClaim=await call('reconcile_deleted_content_stage',{p_stage_id:stageId});
   check(sameClaim.claimId===claimed.claimId,`${scenario} restart retains the exact irreversible claim`);
  }
  // Stop after real provider success but before a receipt transaction: the
  // next worker must safely repeat DELETE with that original durable claim.
  mode='success';present=true;requests.length=0;
  await origin(binding,'DELETE');
  check(!present,'actual DELETE succeeded before simulated process stop');
  await resetDispatch();
  const restarted=await runDeletedStageCleanupBatch(rpc,origin);
  if(serverFailure)throw serverFailure;
  check(restarted.results[0]?.status==='observed_absent','restart completes a lost receipt without new retention');
  check(requests.map(request=>request.method).join(',')==='DELETE,DELETE,HEAD','restart repeats only DELETE/HEAD on exact original key');
  return {checks,scope:'local_tls_and_real_postgres_not_live_r2'};
 }finally{
  if(server){
   server.closeAllConnections();
   await new Promise(resolve=>server.close(resolve));
  }
  rmSync(temporary,{recursive:true,force:true});
 }
}
