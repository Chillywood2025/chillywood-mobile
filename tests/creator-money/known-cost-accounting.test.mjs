import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const runtime={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('supabase/functions/_shared/commerce-known-cost-accounting.ts','utf8'),
 {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,runtime);
const {calculateKnownCommerceCosts:calculate,KNOWN_COST_POLICY,ITEMIZED_FEE_SEMANTICS}=runtime.exports;
const row={feeTransactionId:'fee_processing',incurredBy:'ch_sale',incurredByType:'charge',amountMinor:30,taxMinor:0,currency:'usd',product:'Payments',suite:'Payments',featureName:'Processing',pricingTier:'',settledVia:'balance',balanceTransactionId:'txn_sale'};
const report={accountId:'acct_platform',environment:'test',chargeId:'ch_sale',refundIds:[],rows:[row],providerBinding:'authenticated_report',reportType:'all_fees.incurred_at.itemized.2',contentSha256:'a'.repeat(64),reportRunId:'frr_first',reportSucceededAt:300,intervalStart:100,intervalEnd:200};
const input={policyVersion:KNOWN_COST_POLICY,feeSemantics:ITEMIZED_FEE_SEMANTICS,accountId:'acct_platform',environment:'test',chargeId:'ch_sale',currency:'usd',grossMinor:1000,taxMinor:100,refundedMinor:0,taxReversalMinor:0,platformBps:1000,balances:[{id:'txn_sale',objectId:'ch_sale',feeMinor:30}],reports:[report]};
test('inline fees and same report fees are deducted once',()=>{
 const x=calculate(input);assert.equal(x.totalFeeMinor,30);assert.equal(x.knownNetMinor,870);assert.equal(x.creatorMinor,783);assert.equal(x.platformMinor,87);
 assert.equal(x.financialAuthority,false);assert.equal(x.finalFees,false);assert.equal(x.futureAdjustmentsPossible,true);
});
test('standalone tax-service cost and tax are disjoint from inline fees',()=>{
 const x=calculate({...input,reports:[{...report,rows:[row,{...row,feeTransactionId:'fee_tax',product:'Tax',featureName:'Automatic tax',amountMinor:5,taxMinor:1,balanceTransactionId:'txn_tax'}]}]});
 assert.equal(x.totalFeeMinor,36);assert.equal(x.knownNetMinor,864);assert.equal(x.creatorMinor,778);
});
test('overlapping reports and exact run replay do not multiply deductions',()=>{
 const x=calculate({...input,reports:[report,report,{...report,reportRunId:'frr_overlap',contentSha256:'b'.repeat(64)}]});
 assert.equal(x.totalFeeMinor,30);assert.equal(x.componentCount,1);assert.equal(x.reportCount,2);
});
test('partial refund balances, fee credits and exact tax reversal calculate without guessing',()=>{
 const refund={id:'txn_refund',objectId:'re_refund',feeMinor:-5};
 const x=calculate({...input,refundedMinor:500,taxReversalMinor:50,balances:[...input.balances,refund],reports:[{...report,refundIds:['re_refund'],rows:[row,{...row,feeTransactionId:'fee_refund',incurredBy:'re_refund',incurredByType:'refund',amountMinor:-5,balanceTransactionId:'txn_refund'}]}]});
 assert.equal(x.totalFeeMinor,25);assert.equal(x.knownNetMinor,425);assert.equal(x.creatorMinor,383);
});
test('full refund creates visible recovery and no negative payout amount',()=>{
 const x=calculate({...input,refundedMinor:1000,taxReversalMinor:100,balances:[...input.balances,{id:'txn_refund',objectId:'re_refund',feeMinor:0}],reports:[{...report,refundIds:['re_refund']}]});
 assert.equal(x.knownNetMinor,-30);assert.equal(x.creatorMinor,0);assert.equal(x.recoveryMinor,30);
});
for(const [name,patch,reason] of [
 ['unknown policy',{policyVersion:'invented'},'policy_unqualified'],['unknown semantics',{feeSemantics:'amount_includes_tax'},'policy_unqualified'],
 ['foreign currency',{currency:'eur'},'identity_invalid'],['missing reports',{reports:[]},'report_snapshot_required'],
 ['unsafe integer',{grossMinor:Number.MAX_SAFE_INTEGER+1},'amount_invalid'],['unknown tax',{taxMinor:null},'amount_invalid'],
 ['duplicate balance',{balances:[...input.balances,...input.balances]},'balance_identity_invalid'],
 ['foreign account',{reports:[{...report,accountId:'acct_other'}]},'report_binding_invalid'],
 ['live/test mismatch',{reports:[{...report,environment:'live'}]},'report_binding_invalid'],
 ['missing refund',{reports:[{...report,refundIds:['re_other']}]},'report_binding_invalid'],
 ['same report changed bytes',{reports:[report,{...report,contentSha256:'b'.repeat(64)}]},'report_replay_conflict'],
 ['same component changed amount',{reports:[report,{...report,reportRunId:'frr_other',rows:[{...row,amountMinor:31}]}]},'component_conflict'],
 ['duplicate row',{reports:[{...report,rows:[row,row]}]},'duplicate_component'],
 ['inline overlap mismatch',{reports:[{...report,rows:[{...row,amountMinor:29}]}]},'inline_report_overlap_unreconciled'],
 ['missing balance identity',{reports:[{...report,rows:[{...row,balanceTransactionId:null}]}]},'balance_attribution_required'],
 ['invoiced unallocated cost',{reports:[{...report,rows:[{...row,settledVia:'invoice'}]}]},'settlement_method_unqualified'],
 ['credit-paid cost',{reports:[{...report,rows:[{...row,settledVia:'credit'}]}]},'settlement_method_unqualified'],
 ['over-credit',{reports:[{...report,rows:[row,{...row,feeTransactionId:'fee_overcredit',balanceTransactionId:'txn_other',amountMinor:-100}]}]},'net_fee_credit_review_required'],
])test(`holds ${name}`,()=>assert.throws(()=>calculate({...input,...patch}),new RegExp(reason)));
test('arbitrary report row order cannot alter integer-cent allocation',()=>{
 const rows=[row,{...row,feeTransactionId:'fee_tax',balanceTransactionId:'txn_tax',amountMinor:7,taxMinor:1}];
 assert.deepEqual(calculate({...input,reports:[{...report,rows}]}),calculate({...input,reports:[{...report,rows:[...rows].reverse()}]}));
});
