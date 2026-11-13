import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import ts from 'typescript';
globalThis.crypto ??= webcrypto;
const helper=await import(`data:text/javascript;base64,${Buffer.from(readFileSync('ops/trusted-network-proof-proxy/src/checkout-proof.js','utf8')).toString('base64')}`);
const module={exports:{}};
new Function('module','exports','crypto',ts.transpileModule(readFileSync('supabase/functions/_shared/stripe-video-market-proof.ts','utf8'),
 {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(module,module.exports,webcrypto);
const {verifyStripeVideoMarketProof:verify}=module.exports;
const secret='synthetic-test-only-secret',audience='https://project.supabase.co',path=helper.CHECKOUT_PATH;
const bytes=new TextEncoder().encode(JSON.stringify({videoId:'11111111-1111-4111-8111-111111111111',requestId:'22222222-2222-4222-8222-222222222222'}));
async function fixture(country='US'){
 const request=new Request(`https://network-proof.example${path}`,{method:'POST',headers:{authorization:'Bearer synthetic','x-chillywood-platform':'web'},body:bytes});
 Object.defineProperty(request,'cf',{value:{country}});
 const signed=await helper.signCheckoutProof(request,bytes,secret,audience);
 const headers={authorization:'Bearer synthetic','x-chillywood-platform':'web','x-chillywood-network-proof':signed.proof,
  'x-chillywood-network-proof-signature':`sha256=${signed.signature}`,'x-chillywood-network-proof-timestamp':signed.timestamp,
  'x-chillywood-network-proof-version':'v2'};
 return {headers,request:new Request(`${audience}${path}`,{method:'POST',headers,body:bytes}),signed};
}
test('real signer and verifier agree on request-bound US observation, not financial authority',async()=>{
 const {request}=await fixture();const result=await verify(request,bytes,{secret,audience});
 assert.equal(result.country,'US');assert.equal(result.verification,'trusted_ip_country_observation');
 assert.equal(Date.parse(result.expiresAt)-Date.parse(result.observedAt),300000);
 assert.equal('financialAuthority' in result,false);assert.equal('residenceVerified' in result,false);
});
test('rejects unknown, Tor, missing and non-US countries',async()=>{
 for(const country of ['XX','T1',null,'CA','PR','us'])await assert.rejects(async()=>verify((await fixture(country)).request,bytes,{secret,audience}));
});
test('rejects endpoint suffix match, query, method, audience, body and account substitution',async()=>{
 const {request,headers}=await fixture();
 for(const url of [`${audience}/other/stripe-paid-video-checkout`,`${audience}${path}?x=1`])
  await assert.rejects(verify(new Request(url,{method:'POST',headers,body:bytes}),bytes,{secret,audience}));
 await assert.rejects(verify(new Request(request.url,{headers}),bytes,{secret,audience}));
 await assert.rejects(verify(request,new TextEncoder().encode('{}'),{secret,audience}));
 await assert.rejects(verify(request,bytes,{secret,audience:'https://other.supabase.co'}));
 await assert.rejects(verify(new Request(request.url,{method:'POST',headers:{...headers,authorization:'Bearer other-session'},body:bytes}),bytes,{secret,audience}));
 await assert.rejects(verify(new Request(request.url,{method:'POST',headers:{...headers,'x-chillywood-platform':'ios'},body:bytes}),bytes,{secret,audience}));
});
test('rejects forged, absent and old-version proof; expiry and future timestamp fail closed',async()=>{
 const {request,headers,signed}=await fixture();
 for(const changes of [{'x-chillywood-network-proof-version':'v1'},{'x-chillywood-network-proof-signature':`sha256=${'0'.repeat(64)}`},{'x-chillywood-network-proof':''}])
  await assert.rejects(verify(new Request(request.url,{method:'POST',headers:{...headers,...changes},body:bytes}),bytes,{secret,audience}));
 await assert.rejects(verify(request,bytes,{secret,audience,nowMs:Number(signed.timestamp)*1000+300001}));
 await assert.rejects(verify(request,bytes,{secret,audience,nowMs:Number(signed.timestamp)*1000-30001}));
});
test('stream reader enforces byte bound, not attacker-supplied content length',async()=>{
 assert.deepEqual(await helper.readCheckoutBody(new Request('https://test',{method:'POST',body:bytes})),bytes);
 await assert.rejects(helper.readCheckoutBody(new Request('https://test',{method:'POST',headers:{'content-length':'1'},body:new Uint8Array(32769)})),/too_large/);
});
