import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createRequire} from 'node:module';import {webcrypto} from 'node:crypto';
globalThis.crypto??=webcrypto;const ts=createRequire(import.meta.url)('typescript'),cache=new Map();
function load(name){if(cache.has(name))return cache.get(name);const api={};cache.set(name,api);
 new Function('exports','require',ts.transpileModule(readFileSync(new URL('../../supabase/functions/_shared/'+name,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(api,s=>load(s.replace(/^\.\//u,'')));return api;}
const {projectNativeStoreSandboxMoneyV1:project}=load('native-store-sandbox-money-v1.ts');
const id=n=>`d0000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const stored=()=>({buyerId:id(1),selectionSessionGeneration:id(5),claim:{id:'nssv1_claim_'+id(2),selectionId:'nssv1_selection_'+id(3),originalRequestId:id(4),originalSessionGeneration:id(5),createdAt:'2026-11-08T01:00:00Z',transactionIdentifier:'synthetic-tx',productIdentifier:'synthetic-product',evidence:'client_assertion',settlementAllowed:false},
 quote:{offerId:'scv1_offer_'+id(6),offerRevision:1,resourceId:'scv1_resource_'+id(7),resourceRevision:1,creatorId:id(8),kind:'paid_content',amountMinor:199,currency:'usd',
 asset:{id:'scv1_asset_'+id(9),incarnation:id(10),sha256:'a'.repeat(64),byteLength:100,resourceRevision:1,profile:'scpv-mp4-h264-aac-v1'},
 catalog:{bindingId:'nssv1_catalog_'+id(11),revision:1,projectId:'synthetic-project',appId:'synthetic-app',store:'APP_STORE',environment:'SANDBOX',wireProductId:'synthetic-product'},quoteDigest:'b'.repeat(64)}});
async function fixture(patch={},transform=x=>x){
 const config={bridgeProtocol:'native-store-sandbox-v1',connectionId:id(12),connectionRevision:1,projectId:'synthetic-project',appId:'synthetic-app',store:'APP_STORE',environment:'SANDBOX',authentication:{method:'shared_secret',keyVersion:'synthetic-v1',secret:'synthetic-not-a-real-secret-'.repeat(2)},encryption:{keyId:'synthetic-key',key:new Uint8Array(32).fill(17)}};
 const event={id:'synthetic-event',type:'NON_RENEWING_PURCHASE',app_id:config.appId,store:config.store,environment:'SANDBOX',app_user_id:id(1),original_app_user_id:id(1),transaction_id:'synthetic-tx',original_transaction_id:'synthetic-tx',product_id:'synthetic-product',event_timestamp_ms:1794139200000,purchased_at_ms:1794139190000,price_in_purchased_currency:1.99,currency:"USD",quantity:1,expiration_at_ms:null,...patch};
 const envelope=(await load('native-store-sandbox-bridge-v1.ts').prepareNativeStoreSandboxIntakeV1(new Request('https://local.invalid',{method:'POST',headers:{authorization:config.authentication.secret},body:transform(JSON.stringify({api_version:'1.0',event}))}),config)).envelope;
 return {config,row:{id:id(13),project_id:config.projectId,connection_id:config.connectionId,connection_revision:1,raw_sha256:envelope.rawSha256,raw_byte_length:envelope.rawByteLength,envelope}};
}

function closed(r){for(const k of ['dispatchAllowed','settlementAllowed','grantsAccess','financialAuthority','payable'])assert.equal(r[k],false);assert.equal(r.correlation,'unsupported');}
test('authenticated raw exact economics match is nonpayable unqualified evidence only',async()=>{const {row,config}=await fixture();const r=await project(stored(),row,config,false);closed(r);assert.equal(r.monetaryCandidate,true);assert.equal(r.amountMinor,199);assert.equal(r.currency,'usd');assert.equal(JSON.stringify(r).includes('synthetic-tx'),false);});
test('no quote substitution, inferred quantity, USD conversion, expiry or price strings',async()=>{
 for(const patch of [{price_in_purchased_currency:null,price:1.99},{price_in_purchased_currency:'1.99'},{price_in_purchased_currency:2},{currency:'usd'},{currency:'EUR'},{quantity:undefined},{quantity:2},{expiration_at_ms:undefined},{expiration_at_ms:1794139200001},{cancel_reason:'CUSTOMER_SUPPORT'}]){const {row,config}=await fixture(patch);const r=await project(stored(),row,config,false);closed(r);assert.equal(r.monetaryCandidate,false,JSON.stringify(patch));}
});
test('original exact numeric tokens reject fractional cents and milliseconds lost by JSON.parse',async()=>{
 for(const [from,to] of [['1.99','1.9900000000000000000000000001'],['1794139190000','1794139190000.000000001'],['"quantity":1','"quantity":1.00000000000000000001'],['1.99','1e999']]){const {row,config}=await fixture({},x=>x.replace(from,to));const r=await project(stored(),row,config,false);closed(r);assert.equal(r.monetaryCandidate,false);}
 const {row,config}=await fixture({},x=>x.replace('1.99','199e-2'));assert.equal((await project(stored(),row,config,false)).monetaryCandidate,true);
});
test('duplicates never reach lexical parsing; zero, negative and reversed times fail closed',async()=>{
 for(const patch of [{purchased_at_ms:null},{purchased_at_ms:0},{event_timestamp_ms:8640000000000000},{purchased_at_ms:1794139200001},{event_timestamp_ms:0},{price_in_purchased_currency:0},{price_in_purchased_currency:-1.99}]){const {row,config}=await fixture(patch);assert.equal((await project(stored(),row,config,false)).monetaryCandidate,false);}
 const {row,config}=await fixture({},x=>x.replace('"quantity":1','"quantity":2,"quantity":1'));assert.equal((await project(stored(),row,config,false)).monetaryCandidate,false);
});
test('native scope, buyer, negative lifecycle and revoked connection cannot become monetary candidates',async()=>{
 for(const patch of [{type:'CANCELLATION'},{type:'TRANSFER'},{type:'EXPIRATION'},{app_user_id:id(99)},{environment:'PRODUCTION'},{store:'TEST_STORE'},{app_id:'other'}]){const {row,config}=await fixture(patch);assert.equal((await project(stored(),row,config,false)).monetaryCandidate,false);}
 const {row,config}=await fixture();assert.equal((await project(stored(),row,config,true)).monetaryCandidate,false);await assert.rejects(project(stored(),row,{...config,connectionRevision:2},false));
 row.envelope.encryption.ciphertext='AAAA';await assert.rejects(project(stored(),row,config,false));
});
test('claim and original key are detached before async replay; no unknown fields leak',async()=>{
 const {row,config}=await fixture({secret_unrelated:'do-not-output'});const c=stored(),pending=project(c,row,config,false);c.quote.amountMinor=299;c.buyerId=id(99);config.encryption.key.fill(0);const r=await pending;assert.equal(r.monetaryCandidate,true);assert.equal(r.amountMinor,199);assert.equal(JSON.stringify(r).includes('do-not-output'),false);
});
test('nested scalars cannot replace event economics and all duplicate keys remain invalid',async()=>{
 for(const patch of [{price_in_purchased_currency:{price_in_purchased_currency:1.99}},{price_in_purchased_currency:[1.99]},{quantity:{quantity:1}}]){
  const {row,config}=await fixture(patch);const r=await project(stored(),row,config,false);closed(r);assert.equal(r.monetaryCandidate,false);
 }
 for(const transform of [x=>x.replace('"quantity":1','"quantity":1,"\\u0071uantity":1'),x=>x.replace('"quantity":1','"quantity":1,"unknown":{"a":1,"a":2}')]){
  const {row,config}=await fixture({},transform);const r=await project(stored(),row,config,false);closed(r);assert.equal(r.monetaryCandidate,false);
 }
 const {row,config}=await fixture({unknown:{event:{quantity:99,price_in_purchased_currency:99}},noise:[1,{currency:'EUR'}]});
 const r=await project(stored(),row,config,false);closed(r);assert.equal(r.amountMinor,199);assert.equal(r.monetaryCandidate,true);
});
