import test from 'node:test';import assert from 'node:assert/strict';import { readFileSync } from 'node:fs';import { createRequire } from 'node:module';import { webcrypto } from 'node:crypto';
globalThis.crypto ??= webcrypto;
const ts=createRequire(import.meta.url)('typescript'),cache=new Map();
function load(name){if(cache.has(name))return cache.get(name);const api={};cache.set(name,api);
 new Function('exports','require',ts.transpileModule(readFileSync(new URL('../../supabase/functions/_shared/'+name,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(api,s=>load(s.replace(/^\.\//u,'')));return api;}
const {createNativeStoreIngressHandlerV1:create}=load('native-store-ingress-handler-v1.ts');
const config=()=>({bridgeProtocol:'native-store-sandbox-v1',connectionId:'a0000000-0000-4000-8000-000000000001',connectionRevision:1,projectId:'synthetic-project',appId:'synthetic-app',store:'APP_STORE',environment:'SANDBOX',authentication:{method:'shared_secret',keyVersion:'synthetic-v1',secret:'synthetic-not-real-secret-'.repeat(2)},encryption:{keyId:'synthetic-key',key:new Uint8Array(32).fill(5)}});
const request=(body,secret=config().authentication.secret)=>new Request('https://local.invalid',{method:'POST',headers:{authorization:secret},body});
const event={id:'synthetic-event',type:'NON_RENEWING_PURCHASE',app_id:'synthetic-app',store:'APP_STORE',environment:'SANDBOX',app_user_id:'a0000000-0000-4000-8000-000000000002',original_app_user_id:'a0000000-0000-4000-8000-000000000002',transaction_id:'synthetic-tx',original_transaction_id:'synthetic-tx',product_id:'synthetic-product',event_timestamp_ms:1794139200000,purchased_at_ms:1794139190000,expiration_at_ms:null};
function result(intake,status='recorded'){return{protocol:'native-store-sandbox-journal-result-v1',receiptId:'a0000000-0000-4000-8000-000000000003',connectionId:intake.connectionId,connectionRevision:intake.connectionRevision,projectId:intake.projectId,rawSha256:intake.envelope.rawSha256,status,durable:true,correlation:'unsupported',acknowledgementAllowed:false,dispatchAllowed:false,grantsAccess:false,financialAuthority:false};}
test('disabled and incorrect authentication never reach durable storage',async()=>{
 let writes=0;const persist=async()=>{writes++;throw Error('must not run');};
 assert.equal((await create({connection:()=>null,persist})(request('{}'))).status,503);
 assert.equal((await create({connection:config,persist})(request('{}','incorrect'))).status,401);assert.equal(writes,0);
});
test('authenticated original bytes are durably forwarded once; duplicate/conflict never acknowledges shared delivery',async()=>{
 for(const status of ['recorded','duplicate','conflict']){let writes=0;
 const handler=create({connection:config,persist:async intake=>{writes++;assert.equal(intake.durable,false);assert.equal(intake.envelope.observation.transactionId,event.transaction_id);assert.equal(intake.acknowledgementAllowed,false);return result(intake,status);}});
 const response=await handler(request(JSON.stringify({api_version:'1.0',event}))),body=await response.json();
 assert.equal(response.status,503);assert.equal(body.durable,true);assert.equal(body.acknowledgementAllowed,false);assert.equal(body.retryable,true);assert.equal(writes,1);
 assert.equal(JSON.stringify(body).includes(event.transaction_id),false);assert.equal(response.headers.get('cache-control'),'no-store');}
});
test('mixed production/transfer/malformed events remain original retained reconciliation evidence, never purchase authority',async()=>{
 for(const payload of [JSON.stringify({event:{...event,environment:'PRODUCTION'}}),JSON.stringify({event:{...event,type:'TRANSFER',transferred_from:['old'],transferred_to:['new']}}),'{malformed']){
 let writes=0;const response=await create({connection:config,persist:async intake=>{writes++;assert.equal(intake.disposition,'reconciliation_required');assert.equal(intake.grantsAccess,false);return result(intake);}})(request(payload));
 assert.equal(response.status,503);assert.equal(writes,1);}
});
test('lost commit response or forged acknowledgement stays non-success, without automatic persistence retry',async()=>{
 for(const mode of ['lost','forged']){let writes=0;const response=await create({connection:config,persist:async intake=>{writes++;if(mode==='lost')throw Error('private-secret-must-not-leak');return{...result(intake),acknowledgementAllowed:true};}})(request(JSON.stringify({event})));
 assert.equal(response.status,503);assert.equal(writes,1);assert.equal((await response.text()).includes('private-secret'),false);}
});
test('late persistence remains an uncertain outcome even when a blocked event loop resolves before its timer',async()=>{
 let writes=0;const response=await create({connection:config,persist:async intake=>{writes++;
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,10050);return result(intake);
 }})(request(JSON.stringify({event})));
 const body=await response.json();assert.equal(response.status,503);assert.equal(body.error,'native_store_ingress_uncertain');
 assert.equal(body.durable,undefined);assert.equal(body.acknowledgementAllowed,false);assert.equal(writes,1);
});
test('inline reconciliation starts only once after confirmed matching durable parent and never leaks or expands ACK',async()=>{
 for(const status of ['recorded','duplicate']){let writes=0,processing=0;
 const response=await create({connection:config,persist:async intake=>{writes++;return result(intake,status);},reconcile:async(raw,budget)=>{
  processing++;assert.equal(writes,1);assert.equal(raw,'a0000000-0000-4000-8000-000000000003');assert.ok(budget>0&&budget<=15000);
  return{privateClaim:'must-not-escape',acknowledgementAllowed:true,grantsAccess:true};
 }})(request(JSON.stringify({event})));
 const body=await response.json();assert.equal(response.status,503);assert.equal(body.durable,true);assert.equal(body.acknowledgementAllowed,false);
 assert.equal(body.grantsAccess,false);assert.equal(JSON.stringify(body).includes('must-not-escape'),false);assert.equal(processing,1);}
});
test('conflicting, uncertain or forged persistence never starts inline effects',async()=>{
 for(const mode of ['conflict','lost','forged']){let processing=0;
 const response=await create({connection:config,persist:async intake=>{if(mode==='lost')throw Error('response lost');return{...result(intake,mode==='conflict'?'conflict':'recorded'),...(mode==='forged'?{rawSha256:'f'.repeat(64)}:{})};},reconcile:async()=>{processing++;}})(request(JSON.stringify({event})));
 assert.equal(response.status,503);assert.equal(processing,0);}
});
test('lost inline write response preserves confirmed durable intake and does not retry effects',async()=>{
 let writes=0,processing=0;const response=await create({connection:config,persist:async intake=>{writes++;return result(intake);},reconcile:async()=>{processing++;throw Error('unknown_private_write');}})(request(JSON.stringify({event})));
 const body=await response.json();assert.equal(response.status,503);assert.equal(body.durable,true);assert.equal(body.acknowledgementAllowed,false);
 assert.equal(writes,1);assert.equal(processing,1);assert.equal(JSON.stringify(body).includes('unknown_private_write'),false);
});
test('late asynchronous preparation cannot start a new journal write after the intake phase returns',async()=>{
 const subtle=crypto.subtle,original=subtle.encrypt,bridge=load('native-store-sandbox-bridge-v1.ts'),originalPersist=bridge.persistNativeStoreSandboxIntakeV1;let delayed=false,writes=0,processing=0;
 let release,finished;const gate=new Promise(resolve=>{release=resolve;}),finishedPreparation=new Promise(resolve=>{finished=resolve;});
 bridge.persistNativeStoreSandboxIntakeV1=async(...args)=>{try{return await originalPersist(...args);}finally{finished();}};
 subtle.encrypt=async function(...args){if(!delayed){delayed=true;await gate;}return original.apply(this,args);};
 try{
  const response=await create({connection:config,persist:async intake=>{writes++;return result(intake);},reconcile:async()=>{processing++;}})(request(JSON.stringify({event})));
  assert.equal(response.status,503);assert.equal((await response.json()).error,'native_store_ingress_uncertain');
  assert.equal(writes,0);release();let timer;
  try{await Promise.race([finishedPreparation,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('late preparation did not finish')),2000);})]);}finally{clearTimeout(timer);}
  assert.equal(writes,0);assert.equal(processing,0);
 }finally{release();subtle.encrypt=original;bridge.persistNativeStoreSandboxIntakeV1=originalPersist;}
});
