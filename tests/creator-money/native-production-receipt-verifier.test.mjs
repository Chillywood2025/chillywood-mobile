import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

function handler({enabled='true',configured=true,result={data:{status:'HELD',accessGranted:false,financialAuthority:false,payable:false},error:null}}={}){
 let serve;const calls=[];
 const source=readFileSync('supabase/functions/native-production-receipt-verifier/index.ts','utf8').replace(/^import .*;\n/gm,'');
 const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 new Function('Deno','readOptionalEnv','jsonResponse','readCashoutBody','createAdminClient',code)(
  {serve:fn=>{serve=fn;}},name=>name==='SUPABASE_SERVICE_ROLE_KEY'?'synthetic-service':enabled,
  (status,data)=>new Response(JSON.stringify(data),{status}),async stream=>new Response(stream).text(),
  ()=>({configured,client:{rpc:async(name,args)=>{calls.push({name,args});return result;}}}));
 const run=async({method='POST',auth='Bearer synthetic-service',body={keyId:'12345678-1234-4234-8234-123456789abc',assertion:'{"synthetic":true}',signatureSha256:'a'.repeat(64)}}={})=>{
  const response=await serve(new Request('http://fixture.invalid',{method,headers:{Authorization:auth},...(method==='GET'?{}:{body:JSON.stringify(body)})}));
  return {status:response.status,body:await response.json()};
 };
 return {run,calls};
}
test('receipt verifier requires service authorization, exact signed envelope and OFF opt-in',async()=>{
 const h=handler();
 assert.equal((await h.run({method:'GET'})).status,405);
 assert.equal((await h.run({auth:'Bearer other'})).status,403);
 for(const body of [null,[],{}, {keyId:'not-a-uuid',assertion:'{}',signatureSha256:'a'.repeat(64)},
  {keyId:'12345678-1234-4234-8234-123456789abc',assertion:'{}',signatureSha256:'a'.repeat(64),payable:true},
  {keyId:'12345678-1234-4234-8234-123456789abc',assertion:'a'.repeat(8193),signatureSha256:'a'.repeat(64)}])
  assert.equal((await h.run({body})).status,400);
 assert.deepEqual(h.calls,[]);
 assert.equal((await h.run()).status,200);
 assert.equal(h.calls[0].name,'accept_native_production_paid_video_receipt');
 for(const enabled of [null,'false','TRUE','1','']){
  const off=handler({enabled});assert.deepEqual((await off.run()).body,{status:'disabled',financialAuthority:false});assert.deepEqual(off.calls,[]);
 }
});
test('receipt verifier rejects malformed financial/access authority without leaking private facts',async()=>{
 for(const data of [null,{}, {status:'HELD',accessGranted:true,financialAuthority:false,payable:false},
  {status:'ACCESS_VERIFIED',accessGranted:true,financialAuthority:true,payable:false},
  {status:'ACCESS_VERIFIED',accessGranted:true,financialAuthority:false,payable:true}]){
  assert.deepEqual(await handler({result:{data,error:null}}).run(),{status:409,body:{error:'native_receipt_unresolved',financialAuthority:false}});
 }
 assert.equal((await handler({configured:false}).run()).status,503);
 assert.deepEqual((await handler({result:{data:null,error:{message:'private transaction'}}}).run()).body,
  {error:'native_receipt_unresolved',financialAuthority:false});
});
