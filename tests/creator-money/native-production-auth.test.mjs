import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const module={exports:{}};
new Function('exports','module',ts.transpileModule(readFileSync('supabase/functions/_shared/native-production-auth.ts','utf8'),
 {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText)(module.exports,module);
const {authenticateNativeProduction}=module.exports;
const buyer='11111111-1111-4111-8111-111111111111',a='22222222-2222-4222-8222-222222222222',b='33333333-3333-4333-8333-333333333333';
test('actual adapter authentication binds verified claims, Auth user and header',async()=>{
 const run=async({token='valid-A',header=a,claims={sub:buyer,session_id:a},claimsError=null,user=buyer,userError=null}={})=>{
  const calls=[];
  const result=await authenticateNativeProduction(new Request('https://fixture.invalid',{headers:{Authorization:`Bearer ${token}`,'X-Chillywood-Auth-Session':header}}),{auth:{
   getClaims:async received=>{calls.push(['claims',received]);return {data:{claims},error:claimsError};},
   getUser:async received=>{calls.push(['user',received]);return {data:{user:{id:user}},error:userError};}}});
  return {result,calls};
 };
 assert.deepEqual((await run()).result,{buyerId:buyer,sessionId:a});
 assert.equal((await run({header:b})).result,null);
 assert.equal((await run({header:b,userError:Error('session A retired')})).result,null);
 assert.equal((await run({claims:{sub:buyer}})).result,null);
 assert.equal((await run({token:'malformed',claimsError:Error('invalid signature')})).result,null);
 assert.equal((await run({user:b})).result,null);
 const rotated=await run({token:'rotated-A'});
 assert.deepEqual(rotated.result,{buyerId:buyer,sessionId:a});
 assert.deepEqual(rotated.calls,[['claims','rotated-A'],['user','rotated-A']]);
 for(const path of ['supabase/functions/native-production-store-witness/index.ts','supabase/functions/native-production-paid-video-playback/index.ts'])
  assert.match(readFileSync(path,'utf8'),/authenticateNativeProduction\(/);
});
