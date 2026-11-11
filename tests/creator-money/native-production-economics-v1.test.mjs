import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

const api={};
new Function('exports',ts.transpileModule(readFileSync('supabase/functions/_shared/native-production-economics-v1.ts','utf8'),
  {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText)(api);
const {createNativeProductionJournalV1:create,appendNativeProductionObservationV1:append,projectNativeProductionEconomicsV1:project}=api;
const id=n=>`ca000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const clone=structuredClone;
function fixture(provider='revenuecat_app_store') {
  const scope={environment:'production',provider,projectId:'synthetic-project',appId:'synthetic-app',storeAccountId:'synthetic-account',productId:'synthetic-video',currency:'usd'};
  const source={creatorId:id(1),sourceId:id(2),incarnation:id(3),assetSha256:'a'.repeat(64),revision:1};
  const identity={scope,transactionId:'synthetic-transaction',originalTransactionId:'synthetic-original',buyerId:id(4)};
  const admission={protocol:'native-production-admission-v1',id:id(5),buyerId:identity.buyerId,scope,source,quoteSha256:'b'.repeat(64),termsSha256:'c'.repeat(64),grossMinor:'199',quantity:1,
    quoteCreatedAt:100,admittedAt:110,quoteExpiresAt:200,platformShareBps:2000};
  const qualification={id:id(6),scope,reportSchema:'synthetic-transaction-report-v1',evidenceSha256:'d'.repeat(64),verifiedAt:100,expiresAt:1000,revoked:false,basis:'independent_transaction_fee_tax_proceeds_review'};
  const base={identity,evidenceSha256:'e'.repeat(64),observedAt:300};
  const purchase={...base,id:'purchase',kind:'purchase',admissionId:admission.id,quoteSha256:admission.quoteSha256,grossMinor:'199',quantity:1,purchasedAt:150};
  const components=['store_fee','fee_tax','sales_tax','developer_proceeds'].map((category,index)=>({...base,id:`observation-${category}`,kind:'component',componentId:category,category,
    amountMinor:['30','3','10','156'][index],reportSchema:qualification.reportSchema,qualificationId:qualification.id,attribution:'transaction'}));
  const coverage={...base,id:'coverage',kind:'coverage',revision:1,componentIds:components.map(o=>o.componentId),reportSchema:qualification.reportSchema,qualificationId:qualification.id,through:250};
  const observations=[purchase,...components,coverage];
  const build=(items=observations)=>items.reduce(append,create(identity));
  const evaluate=(j=build(),a=admission,s=source,qs=[qualification],now=400)=>project(j,a,s,qs,now);
  return {scope,source,identity,admission,qualification,base,purchase,components,coverage,observations,build,evaluate};
}
function closed(result) {
  assert.equal(result.status,'HELD');
  for(const k of ['dispatchAllowed','grantsAccess','settlementAllowed','financialAuthority','payable'])assert.equal(result[k],false);
  assert.ok(result.reasons.includes('production_ledger_adapter_unqualified'));
}
function held(result,reason) {closed(result);assert.equal(result.economicCoverageComplete,false);assert.equal(result.creatorCandidateMinor,null);assert.ok(result.reasons.includes(reason),JSON.stringify(result));}

for(const provider of ['revenuecat_app_store','revenuecat_google_play'])test(`${provider}: exact complete synthetic coverage is still nonpayable and cannot dispatch`,()=>{
  const f=fixture(provider),r=f.evaluate();closed(r);assert.equal(r.economicCoverageComplete,true);
  assert.equal(r.creatorCandidateMinor,'125');assert.equal(r.platformCandidateMinor,'31');
  assert.deepEqual(r.reasons,['production_ledger_adapter_unqualified']);
});
test('sandbox rows, unknown fields, implicit quantities, floats, currency conversion and oversized amounts reject',()=>{
  const f=fixture();
  for(const patch of [{environment:'sandbox'},{environment:'SANDBOX'},{provider:'revenuecat_test_store'},{currency:'eur'},{storeAccountId:''},{projectId:null}])
    assert.throws(()=>create({...f.identity,scope:{...f.scope,...patch}}),/contract_invalid/);
  for(const patch of [{amountMinor:30},{amountMinor:'01'},{amountMinor:'-1'},{amountMinor:'3.0001'},{amountMinor:'9223372036854775808'},{financialAuthority:true}])
    assert.throws(()=>append(create(f.identity),{...f.components[0],...patch}),/contract_invalid/);
  for(const patch of [{protocol:'sandbox_commerce_v1'},{quantity:2},{grossMinor:null},{admittedAt:200},{platformShareBps:10001}])
    assert.throws(()=>f.evaluate(f.build(),{...f.admission,...patch}),/contract_invalid/);
});
test('append checks every provider/project/app/account/product/currency/transaction/chain/buyer identity',()=>{
  const f=fixture(),j=f.build();
  for(const field of ['projectId','appId','storeAccountId','productId','provider']) {
    const changed={...f.scope,[field]:field==='provider'?'revenuecat_google_play':'other'};
    assert.throws(()=>append(j,{...f.purchase,id:'changed',identity:{...f.identity,scope:changed}}),/identity_conflict/);
  }
  for(const field of ['transactionId','originalTransactionId','buyerId'])
    assert.throws(()=>append(j,{...f.purchase,id:'changed',identity:{...f.identity,[field]:field==='buyerId'?id(99):'other'}}),/identity_conflict/);
});
test('immutable append is detached, exact retry deduplicates, changed event evidence conflicts',()=>{
  const f=fixture(),p=clone(f.purchase),j=append(create(f.identity),p);p.grossMinor='1';p.identity.scope.appId='other';
  assert.equal(j.observations[0].grossMinor,'199');assert.equal(j.observations[0].identity.scope.appId,'synthetic-app');
  assert.equal(append(j,clone(f.purchase)).observations.length,1);
  assert.throws(()=>append(j,{...f.purchase,evidenceSha256:'f'.repeat(64)}),/observation_conflict/);
  assert.throws(()=>{j.observations[0].identity.scope.appId='edit';},TypeError);
  assert.throws(()=>{j.observations.push(f.coverage);},TypeError);
});
test('reordered observations and overlapping identical components are deterministic and count once',()=>{
  const f=fixture(),expected=f.evaluate();
  for(let offset=0;offset<f.observations.length;offset++){
    const rotated=[...f.observations.slice(offset),...f.observations.slice(0,offset)].reverse();
    assert.deepEqual(f.evaluate(f.build(rotated)),expected);
  }
  assert.deepEqual(f.evaluate(append(f.build(),{...f.components[0],id:'overlapping-report',evidenceSha256:'f'.repeat(64)})),expected);
  held(f.evaluate(append(f.build(),{...f.components[0],id:'changed-fee',amountMinor:'31'})),'component_conflict');
  held(f.evaluate(append(f.build(),{...f.purchase,id:'changed-purchase',grossMinor:'198'})),'purchase_conflict');
  const unqualified={...f.components[0],id:'earlier-unqualified-component',observedAt:50};
  const first=f.evaluate(f.build([unqualified,...f.observations]));
  const last=f.evaluate(f.build([...f.observations,unqualified]));
  held(first,'component_unqualified');assert.deepEqual(last,first,'overlap cannot retroactively qualify by arrival order');
  for(const conflict of [{...f.components[0],id:'conflict',amountMinor:'31'},
    {...f.purchase,id:'conflict',grossMinor:'198'}, {...f.coverage,id:'conflict',componentIds:[]}]){
    assert.deepEqual(f.evaluate(f.build([conflict,...f.observations])),f.evaluate(f.build([...f.observations,conflict])),
      'conflicting observation diagnostics are deterministic too');
  }
});
test('all negative lifecycle identities hold before purchase and cannot be cleared by newer complete data',()=>{
  const f=fixture();
  for(const kind of ['refund','revocation','chargeback']) {
    const negative={...f.base,id:kind,kind,negativeId:`synthetic-${kind}`,effectiveAt:160,amountMinor:null};
    held(f.evaluate(f.build([negative,...f.observations])),'negative_lifecycle_hold');
    held(f.evaluate(f.build([...f.observations,negative])),'negative_lifecycle_hold');
    held(f.evaluate(f.build([negative])),'purchase_missing');
    const newer={...f.coverage,id:'later-coverage',revision:2,observedAt:350,through:340};
    held(f.evaluate(f.build([negative,...f.observations,newer])),'negative_lifecycle_hold');
  }
});
test('creator, source, revision, asset bytes and incarnation changes hold exact prior admission',()=>{
  const f=fixture();
  for(const patch of [{creatorId:id(99)},{sourceId:id(99)},{incarnation:id(99)},{assetSha256:'f'.repeat(64)},{revision:2}])
    held(f.evaluate(f.build(),f.admission,{...f.source,...patch}),'source_incarnation_changed');
  held(f.evaluate(f.build(),{...f.admission,buyerId:id(99)}),'admission_identity_mismatch');
  held(f.evaluate(f.build(),{...f.admission,scope:{...f.scope,storeAccountId:'other'}}),'admission_identity_mismatch');
  held(f.evaluate(f.build(),{...f.admission,quoteSha256:'f'.repeat(64)}),'purchase_quote_mismatch');
  held(f.evaluate(f.build(),{...f.admission,source:{...f.source,creatorId:f.identity.buyerId}}),'admission_identity_mismatch');
});
test('missing fee, fee tax, sales tax or proceeds never defaults to zero; explicit zero is distinct',()=>{
  const f=fixture();
  for(const c of f.components){
    held(f.evaluate(f.build(f.observations.filter(o=>o.id!==c.id))),`${c.category}_unknown`);
    held(f.evaluate(f.build(f.observations.map(o=>o.id===c.id?{...o,amountMinor:null}:o))),`${c.category}_unknown`);
  }
  held(f.evaluate(f.build([f.purchase,{...f.coverage,componentIds:[]}])),'coverage_incomplete');
  const zero=f.observations.map(o=>o.kind==='component'?{...o,amountMinor:o.category==='developer_proceeds'?'199':'0'}:o);
  assert.equal(f.evaluate(f.build(zero)).economicCoverageComplete,true);
});
test('unqualified aggregate or partial coverage and later components keep the sale held',()=>{
  const f=fixture();
  for(const attribution of ['aggregate','unknown'])held(f.evaluate(f.build(f.observations.map(o=>o.kind==='component'?{...o,attribution}:o))),'component_unqualified');
  held(f.evaluate(f.build(f.observations.filter(o=>o.kind!=='coverage'))),'coverage_missing');
  held(f.evaluate(append(f.build(),{...f.components[0],id:'late',componentId:'late-fee'})),'coverage_incomplete');
  held(f.evaluate(append(f.build(),{...f.coverage,id:'conflicting-coverage',componentIds:[]})),'coverage_conflict');
  held(f.evaluate(append(f.build(),{...f.coverage,id:'newer-incomplete',revision:2,componentIds:[]})),'coverage_incomplete');
  assert.equal(f.evaluate(append(f.build(),{...f.coverage,id:'older-arrived-late',revision:1,observedAt:350})).economicCoverageComplete,true);
});
test('qualification must match exact scope, stay current, precede observations, and cannot fall back after expiry/revocation',()=>{
  const f=fixture();
  held(f.evaluate(f.build(),f.admission,f.source,[]),'qualification_unavailable');
  for(const patch of [{revoked:true},{expiresAt:400},{verifiedAt:401,expiresAt:500},{scope:{...f.scope,storeAccountId:'other'}},{reportSchema:'other'}])
    held(f.evaluate(f.build(),f.admission,f.source,[{...f.qualification,...patch}]),'qualification_unavailable');
  held(f.evaluate(f.build(),f.admission,f.source,[{...f.qualification,verifiedAt:301}]),'coverage_unqualified_when_observed');
  for(const patch of [{revoked:true},{expiresAt:399}])
    held(f.evaluate(f.build(),f.admission,f.source,[f.qualification,{...f.qualification,id:id(7),verifiedAt:200,...patch}]),'qualification_unavailable');
});
test('explicit equivalent renewal preserves historical admission and validates each report issuer',()=>{
  const f=fixture();const original={...f.qualification,expiresAt:350};
  const renewed={...f.qualification,id:id(7),renewalOf:original.id,verifiedAt:320,expiresAt:900};
  assert.equal(f.evaluate(f.build(),f.admission,f.source,[original,renewed],400).economicCoverageComplete,true);
  const reports=f.components.map(c=>({...c,id:`renewed-${c.id}`,observedAt:500,qualificationId:renewed.id}));
  reports.push({...f.coverage,id:'renewed-coverage',revision:2,observedAt:500,through:490,qualificationId:renewed.id});
  const journal=f.build([...f.observations,...reports]);
  assert.equal(f.evaluate(journal,f.admission,f.source,[original,renewed],600).economicCoverageComplete,true);
  for(const patch of [{renewalOf:id(99)},{revoked:true},{expiresAt:590},{reportSchema:'changed'},
    {scope:{...renewed.scope,appId:'changed-app'}}])
    held(f.evaluate(journal,f.admission,f.source,[original,{...renewed,...patch}],600),'qualification_unavailable');
  held(f.evaluate(journal,f.admission,f.source,[original,renewed,{...renewed,id:id(8)}],600),'qualification_unavailable');
  held(f.evaluate(journal,f.admission,f.source,[{...original,revoked:true},renewed],600),'qualification_unavailable');
  held(f.evaluate(f.build(),f.admission,f.source,[{...f.qualification,renewalOf:id(99)}]),'qualification_unavailable');
  const laterAdmission={...f.admission,admittedAt:330,quoteCreatedAt:320,quoteExpiresAt:800};
  const laterPurchase={...f.purchase,observedAt:400,purchasedAt:340};
  const laterRows=f.components.map(c=>({...c,observedAt:400}));
  const laterCoverage={...f.coverage,observedAt:400,through:390};
  assert.equal(f.evaluate(f.build([laterPurchase,...laterRows,laterCoverage]),laterAdmission,f.source,
    [f.qualification,renewed],600).economicCoverageComplete,true,'admission under renewal may retain valid root-issued reports');
});
test('unknown quantity/gross, mismatched totals, unsafe future evidence and overflowing sums hold',()=>{
  const f=fixture();
  for(const patch of [{grossMinor:null},{quantity:null},{quantity:2},{purchasedAt:100},{purchasedAt:200}])
    held(f.evaluate(f.build(f.observations.map(o=>o.kind==='purchase'?{...o,...patch}:o))),'purchase_quote_mismatch');
  held(f.evaluate(f.build(f.observations.map(o=>o.kind==='component'&&o.category==='developer_proceeds'?{...o,amountMinor:'157'}:o))),'gross_tax_fee_proceeds_mismatch');
  held(f.evaluate(f.build(),f.admission,f.source,[f.qualification],299),'future_evidence');
  const extra={...f.components[0],id:'overflow',componentId:'overflow-fee',amountMinor:'9223372036854775807'};
  held(f.evaluate(append(f.build(),extra)),'amount_overflow');
});
test('caller-forged journal state is fully revalidated and output carries no provider identifiers',()=>{
  const f=fixture(),bad=clone(f.build());bad.observations[0].identity.scope.environment='sandbox';
  assert.throws(()=>f.evaluate(bad),/contract_invalid/);
  const duplicate=clone(f.build());duplicate.observations.push(duplicate.observations[0]);assert.throws(()=>f.evaluate(duplicate),/contract_invalid/);
  for(const text of ['synthetic-transaction','synthetic-account',id(1)])assert.equal(JSON.stringify(f.evaluate()).includes(text),false);
});
