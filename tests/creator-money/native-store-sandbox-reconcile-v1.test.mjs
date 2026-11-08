import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createRequire} from 'node:module';import {webcrypto} from 'node:crypto';
globalThis.crypto??=webcrypto;const ts=createRequire(import.meta.url)('typescript'),cache=new Map();
function load(name){if(cache.has(name))return cache.get(name);const api={};cache.set(name,api);
 new Function('exports','require',ts.transpileModule(readFileSync(new URL('../../supabase/functions/_shared/'+name,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(api,s=>load(s.replace(/^\.\//u,'')));return api;}
const {reconcileNativeStoreSandboxClaimV1:reconcile}=load('native-store-sandbox-reconcile-v1.ts');
const id=n=>`d0000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const stored=()=>({buyerId:id(1),selectionSessionGeneration:id(5),claim:{id:'nssv1_claim_'+id(2),selectionId:'nssv1_selection_'+id(3),originalRequestId:id(4),originalSessionGeneration:id(5),createdAt:'2026-11-08T01:00:00Z',transactionIdentifier:'synthetic-tx',productIdentifier:'synthetic-product',evidence:'client_assertion',settlementAllowed:false},
 quote:{offerId:'scv1_offer_'+id(6),offerRevision:1,resourceId:'scv1_resource_'+id(7),resourceRevision:1,creatorId:id(8),kind:'paid_content',amountMinor:199,currency:'usd',
 asset:{id:'scv1_asset_'+id(9),incarnation:id(10),sha256:'a'.repeat(64),byteLength:100,resourceRevision:1,profile:'scpv-mp4-h264-aac-v1'},
 catalog:{bindingId:'nssv1_catalog_'+id(11),revision:1,projectId:'synthetic-project',appId:'synthetic-app',store:'APP_STORE',environment:'SANDBOX',wireProductId:'synthetic-product'},quoteDigest:'b'.repeat(64)}});
async function fixture(patch={}){
 const config={bridgeProtocol:'native-store-sandbox-v1',connectionId:id(12),connectionRevision:1,projectId:'synthetic-project',appId:'synthetic-app',store:'APP_STORE',environment:'SANDBOX',authentication:{method:'shared_secret',keyVersion:'synthetic-v1',secret:'synthetic-not-a-real-secret-'.repeat(2)},encryption:{keyId:'synthetic-key',key:new Uint8Array(32).fill(17)}};
 const event={id:'synthetic-event',type:'NON_RENEWING_PURCHASE',app_id:config.appId,store:config.store,environment:'SANDBOX',app_user_id:id(1),original_app_user_id:id(1),transaction_id:'synthetic-tx',original_transaction_id:'synthetic-tx',product_id:'synthetic-product',event_timestamp_ms:1794139200000,...patch};
 const envelope=(await load('native-store-sandbox-bridge-v1.ts').prepareNativeStoreSandboxIntakeV1(new Request('https://local.invalid',{method:'POST',headers:{authorization:config.authentication.secret},body:JSON.stringify({api_version:'1.0',event})}),config)).envelope;
 return {config,row:{id:id(13),project_id:config.projectId,connection_id:config.connectionId,connection_revision:1,raw_sha256:envelope.rawSha256,raw_byte_length:envelope.rawByteLength,envelope}};
}
function closed(r){for(const k of ['dispatchAllowed','settlementAllowed','grantsAccess','financialAuthority'])assert.equal(r[k],false);assert.equal(r.correlation,'unsupported');assert.ok(r.reasons.includes('sdk_transaction_mapping_unqualified'));}
test('exact genuine decrypted identifiers are only an unqualified assertion candidate',async()=>{
 const {config,row}=await fixture();const r=await reconcile(stored(),row,config,false);closed(r);assert.equal(r.oneTimeCandidate,true);assert.equal(r.identifiersMatch,true);
 assert.equal(r.semantics,'explicit_client_assertion_not_store_attestation');for(const value of [config.authentication.secret,row.envelope.encryption.ciphertext,'synthetic-tx',id(1)])assert.equal(JSON.stringify(r).includes(value),false);
});
test('scope, transaction, product, buyer and alias-only ownership cannot match',async()=>{
 for(const patch of [{app_id:'other'},{environment:'PRODUCTION'},{store:'PLAY_STORE'},{transaction_id:'synthetic-tx-2'},{product_id:'other'},
 {app_user_id:id(99),original_app_user_id:id(1),aliases:[id(1)]}]){const {config,row}=await fixture(patch);const r=await reconcile(stored(),row,config,false);closed(r);assert.equal(r.oneTimeCandidate,false);}
 const {config,row}=await fixture();const s=stored();s.quote.catalog.projectId='other';assert.equal((await reconcile(s,row,config,false)).oneTimeCandidate,false);
});
test('renewals, refunds and productless transfers are not purchase evidence; transfer still signals project reconciliation',async()=>{
 for(const patch of [{type:'RENEWAL'},{type:'CANCELLATION'},{type:'EXPIRATION'},{type:'TRANSFER',app_user_id:null,product_id:null,transaction_id:null,transferred_from:[id(1)],transferred_to:[id(99)]}]){
  const {config,row}=await fixture(patch),r=await reconcile(stored(),row,config,false);closed(r);assert.equal(r.oneTimeCandidate,false);
  if(patch.type==='TRANSFER'){assert.equal(r.identifiersMatch,false);assert.equal(r.lifecycleEvidenceObserved,'TRANSFER');assert.equal(r.reconciliationRequired,true);assert.equal(r.reconciliationScope,'project');}
  if(['CANCELLATION','EXPIRATION'].includes(patch.type))assert.equal(r.negativeLifecycleEvidence,true);
 }
});
test('missing original chain/time and malformed event never become one-time candidates',async()=>{
 for(const patch of [{original_transaction_id:null},{event_timestamp_ms:null},{app_user_id:'\ud800'}]){
  const {config,row}=await fixture(patch),r=await reconcile(stored(),row,config,false);closed(r);assert.equal(r.oneTimeCandidate,false);
 }
});
test('revoked original registry replays privately; corrupt ciphertext and latest key cannot be substituted',async()=>{
 const {config,row}=await fixture(),r=await reconcile(stored(),row,config,true);closed(r);assert.equal(r.originalRevisionRevoked,true);assert.ok(r.reasons.includes('original_revision_revoked'));
 await assert.rejects(reconcile(stored(),row,{...config,connectionRevision:2},false));
 const bad=structuredClone(row);bad.envelope.encryption.ciphertext='A'.repeat(bad.envelope.encryption.ciphertext.length);await assert.rejects(reconcile(stored(),bad,config,false));
});
test('claim snapshots before decryption and squatter assertions cannot affect rightful comparison',async()=>{
 const {config,row}=await fixture(),claim=stored(),pending=reconcile(claim,row,config,false);claim.buyerId=id(99);claim.claim.transactionIdentifier='changed';
 assert.equal((await pending).oneTimeCandidate,true);
 const squat=stored();squat.buyerId=id(99);assert.equal((await reconcile(squat,row,config,false)).oneTimeCandidate,false);
 const rightful=await reconcile(stored(),row,config,false);assert.equal(rightful.oneTimeCandidate,true);closed(rightful);
});
