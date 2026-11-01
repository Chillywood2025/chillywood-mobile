import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const load=(file,modules={},Deno={})=>{const m={exports:{}};new Function('require','module','exports','Deno',ts.transpileModule(readFileSync(`supabase/functions/${file}`,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(n=>{if(n.startsWith('jsr:'))return {};if(modules[n])return modules[n];throw Error(n);},m,m.exports,Deno);return m.exports;};
const actual=load('_shared/stripe-tax-code-catalog.ts');
const code={object:'tax_code',id:'txcd_12345678',name:'Provider catalog label',description:'Provider description'};
test('catalog reads exact configured account and actual provider labels, GET-only pagination and no inferred qualification',async()=>{
 const calls=[];const get=async(url,init)=>{calls.push([url,init]);return Response.json(url.endsWith('/account')?{object:'account',id:'acct_fixture'}:{object:'list',url:'/v1/tax_codes',has_more:true,data:[code,{...code,id:'txcd_87654321',requirements:{performance_location:'required'}}]});};
 const r=await actual.readStripeTaxCodeCatalog('rk_live_fixture','acct_fixture','txcd_11111111',get);
 assert.equal(r.providerReady,false);assert.equal(r.codes[0].name,code.name);assert.equal(r.codes[0].supported,true);assert.equal(r.codes[1].supported,false);assert.equal(r.nextCursor,'txcd_87654321');
 assert.ok(calls.every(([,i])=>i.method==='GET'&&i.redirect==='error'));assert.match(calls[1][0],/starting_after=txcd_11111111/);
});
test('catalog rejects mode/account, duplicate and stalled cursor, malformed page without permissive fallback',async()=>{
 let reads=0;
 await assert.rejects(actual.readStripeTaxCodeCatalog('rk_test_fixture','acct_fixture',undefined,()=>{reads++;}),/config_invalid/);assert.equal(reads,0);
 for(const patch of [{account:'acct_other'},{data:[code,code]},{data:[],has_more:true},{data:[{...code,id:'bogus'}]},{url:'/v1/products'}]){
  const fetcher=async url=>Response.json(url.endsWith('/account')?{object:'account',id:patch.account??'acct_fixture'}:{object:'list',url:'/v1/tax_codes',has_more:false,data:[code],...patch});
  await assert.rejects(actual.readStripeTaxCodeCatalog('rk_live_fixture','acct_fixture',undefined,fetcher));
 }
});
test('actual catalog endpoint denies unauthorized owner before provider/admin and rechecks after provider reads',async()=>{
 const original=globalThis.fetch;let handler;const calls=[];let authCount=0;let revoke=false;
 const env={SUPABASE_URL:'https://database.fixture.invalid',SUPABASE_ANON_KEY:'anon',STRIPE_MERCH_LIVE_OBSERVATION_KEY:'rk_live_fixture',STRIPE_MERCH_LIVE_OBSERVATION_ACCOUNT_ID:'acct_fixture'};
 const shared={readOptionalEnv:k=>env[k],optionsResponse:()=>new Response(null,{status:204}),jsonResponse:(status,data)=>Response.json(data,{status}),createAdminClient:()=>{calls.push('admin');return {configured:true,client:{rpc:async()=>{calls.push('record');return {data:true,error:null};}}};}};
 load('stripe-tax-category-catalog/index.ts',{'../_shared/stripe-connect.ts':shared,'../_shared/stripe-tax-code-catalog.ts':actual},{serve:fn=>handler=fn});
 const request=()=>new Request('https://edge.fixture.invalid',{method:'POST',headers:{Authorization:'Bearer synthetic-owner'},body:'{}'});
 try{
  assert.equal((await handler(new Request('https://edge.fixture.invalid',{method:'OPTIONS'}))).status,204);assert.deepEqual(calls,[]);
  globalThis.fetch=async url=>{calls.push(url);return Response.json({}, {status:403});};
  assert.equal((await handler(request())).status,403);assert.equal(calls.length,1);assert.match(calls[0],/rest\/v1\/rpc/);
  calls.length=0;
  globalThis.fetch=async url=>{calls.push(url);if(url.includes('/rest/'))return Response.json({}, {status:++authCount>1&&revoke?403:200});return Response.json(url.endsWith('/account')?{object:'account',id:'acct_fixture'}:{object:'list',url:'/v1/tax_codes',has_more:false,data:[code]});};
  revoke=true;assert.equal((await handler(request())).status,403);assert.ok(!calls.includes('admin'));
  calls.length=0;authCount=0;revoke=false;assert.equal((await handler(request())).status,200);assert.equal(calls.at(-1),'record');
 }finally{globalThis.fetch=original;}
});
