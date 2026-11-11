import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

// Execute the real entrypoint with its three infrastructure imports replaced by
// inert fixtures. No network, secrets, or provider operation is available here.
function handler({enabled='true',configured=true,rpcResult={data:{status:'complete',processed:1,providerWrite:false},error:null}}={}){
 let serve;const calls=[];
 const source=readFileSync('supabase/functions/native-production-accounting-worker/index.ts','utf8').replace(/^import .*;\n/gm,'');
 const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 new Function('Deno','readOptionalEnv','jsonResponse','readCashoutBody','createAdminClient',code)(
  {serve:fn=>{serve=fn;}},name=>name==='SUPABASE_SERVICE_ROLE_KEY'?'synthetic-service':name==='NATIVE_PRODUCTION_ACCOUNTING_ENABLED'?enabled:null,
  (status,data)=>new Response(JSON.stringify(data),{status}),async stream=>new Response(stream).text(),
  ()=>({configured,client:{rpc:async(name,args)=>{calls.push({name,args});return rpcResult;}}}));
 const run=async({method='POST',auth='Bearer synthetic-service',body='{}'}={})=>{
  const response=await serve(new Request('http://fixture.invalid',{method,headers:{Authorization:auth},...(method==='GET'?{}:{body})}));
  return {status:response.status,body:await response.json()};
 };
 return {run,calls};
}
test('accounting endpoint requires exact service auth, POST and empty bounded request',async()=>{
 const h=handler();
 assert.equal((await h.run({method:'GET'})).status,405);
 assert.equal((await h.run({auth:'Bearer other'})).status,403);
 for(const body of ['null','[]','{"receipt":"arbitrary"}','{"release":true}','not-json'])assert.ok((await h.run({body})).status>=400);
 assert.deepEqual(h.calls,[]);
 assert.deepEqual(await h.run(),{status:200,body:{status:'complete',processed:1,providerWrite:false}});
 assert.deepEqual(h.calls,[{name:'process_native_production_accounting_jobs',args:{p_limit:20}}]);
});
test('accounting endpoint is off unless explicitly enabled and fails closed on DB failure',async()=>{
 for(const enabled of [null,'false','TRUE','1','']){
  const h=handler({enabled});assert.deepEqual((await h.run()).body,{status:'disabled',providerWrite:false});assert.deepEqual(h.calls,[]);
 }
 assert.equal((await handler({configured:false}).run()).status,503);
 const h=handler({rpcResult:{data:null,error:{message:'synthetic'}}});
 assert.deepEqual(await h.run(),{status:409,body:{error:'native_accounting_unresolved',providerWrite:false}});
});
