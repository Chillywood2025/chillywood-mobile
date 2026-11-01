import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import ts from 'typescript';

const runtime = { exports: {}, AbortSignal, TextDecoder, crypto: webcrypto };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('supabase/functions/_shared/stripe-fee-report-evidence.ts', 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText, runtime);
const { normalizeStripeFeeReport: normalize, observeStripeFeeReport: observe } = runtime.exports;
const context = { accountId: 'acct_fixture', environment: 'test', reportRunId: 'frr_fixture', fileId: 'file_fixture',
  reportType: 'all_fees.incurred_at.itemized.2', intervalStart: 100, intervalEnd: 200, currency: 'usd',
  chargeId: 'ch_fixture', refundIds: ['re_fixture'] };
const header = 'fee_transaction_id,incurred_by,incurred_by_type,amount,tax,currency,product,suite,feature_name,settled_via';
const row = 'fee_one,ch_fixture,charge,0.10,0.01,usd,Tax,Revenue,Automatic tax,balance';
const csv = `${header}\n${row}\n`;
test('transfer fee reports bind funding only, do not claim zero or accept mixed payout context',()=>{
 const {chargeId,refundIds,...base}=context;const transfer={...base,transferId:'tr_fixture'};
 const output=normalize(`${header}\nfee_transfer,tr_fixture,transfer,0.12,0.03,usd,Connect,Payments,Transfer,balance\n${row}`,transfer);
 assert.equal(output.transferId,'tr_fixture');assert.equal(output.rows.length,1);assert.equal(output.rows[0].amountMinor,12);
 assert.equal(output.rows[0].taxMinor,3);assert.equal(output.rows[0].incurredByType,'transfer');assert.equal(output.totalFeeMinor,null);
 assert.equal(output.financialAuthority,false);assert.equal(output.unattributedRows,1);
 assert.equal('payoutId' in output,false);assert.equal('chargeId' in output,false);
 assert.throws(()=>normalize(header,{...transfer,payoutId:'po_fixture'}),/context_invalid/);
 assert.throws(()=>normalize(header,{...transfer,chargeId,refundIds}),/context_invalid/);
 assert.throws(()=>normalize(header,{...base,transferId:'po_fixture'}),/identity_invalid/);
 assert.equal(normalize(header,transfer).totalFeeMinor,null);
});
test('payout reports bind only the exact payout and cannot mix sale objects',()=>{
 const {chargeId,refundIds,...base}=context;
 const payout={...base,payoutId:'po_fixture'};
 const output=normalize(`${header}\nfee_payout,po_fixture,payout,0.50,0.00,usd,Connect,Money management,Payout,balance\n${row}`,payout);
 assert.equal(output.payoutId,'po_fixture');assert.equal(output.rows.length,1);assert.equal(output.unattributedRows,1);
 assert.equal(output.rows[0].incurredByType,'payout');assert.equal(output.rows[0].amountMinor,50);
 assert.equal(output.financialAuthority,false);assert.equal(output.totalFeeMinor,null);
 assert.equal('chargeId' in output,false);assert.equal('refundIds' in output,false);
 assert.throws(()=>normalize(header,{...context,payoutId:'po_fixture'}),/context_invalid/);
 assert.throws(()=>normalize(header,{...base,payoutId:'ch_fixture'}),/identity_invalid/);
 assert.throws(()=>normalize(`${header}\nfee_payout,po_fixture,charge,0.50,0.00,usd,Connect,Money management,Payout,balance`,payout),/object_type_mismatch/);
});
function fixture() {
  const calls = [];
  const run = { id: context.reportRunId, object: 'reporting.report_run', livemode: false, report_type: context.reportType,
    status: 'succeeded', error: null, succeeded_at: 300, parameters: { interval_start: 100, interval_end: 200 },
    result: { id: context.fileId, object: 'file', type: 'csv', size: Buffer.byteLength(csv),
      url: 'https://files.stripe.com/v1/files/file_fixture/contents' } };
  return { run, calls, transport: async (url, options) => {
    calls.push(url); assert.equal(options.method, 'GET'); assert.equal(options.redirect, 'error');
    assert.equal(options.headers.Authorization, 'Bearer rk_test_fixture');
    if (url.endsWith('/account')) return Response.json({ id: context.accountId, object: 'account' });
    if (url.includes('/reporting/report_runs/')) return Response.json(run);
    assert.equal(url, 'https://files.stripe.com/v1/files/file_fixture/contents'); return new Response(csv);
  } };
}
test('actual report adapter binds account, report scope and file; exact evidence never grants settlement', async () => {
  const f = fixture(), result = await observe(context, 'rk_test_fixture', f.transport);
  assert.equal(f.calls.length, 3); assert.equal(result.providerBinding, 'authenticated_report');
  assert.match(result.contentSha256, /^[a-f0-9]{64}$/);
  assert.equal(result.rows[0].amountMinor, 10); assert.equal(result.rows[0].taxMinor, 1);
  assert.equal(result.totalFeeMinor, null); assert.equal(result.taxServiceFeeMinor, null);
  assert.equal(result.financialAuthority, false); assert.equal(result.settlementReady, false);
  assert.equal(result.completeness, 'unverified'); assert.equal(result.holdReasons.length, 2);
});
test('missing fee rows remain unknown, not zero', () => {
  const result = normalize(header, context);
  assert.equal(result.rows.length, 0); assert.equal(result.totalFeeMinor, null); assert.equal(result.settlementReady, false);
});
test('distinct pricing tiers preserve component identity', () => {
  const result = normalize(`${header},pricing_tier\n${row},first\n${row},second`,context);
  assert.equal(result.rows.length,2);
  assert.notEqual(result.rows[0].pricingTier,result.rows[1].pricingTier);
});
test('explicit live reporting binds live credential and report mode, without financial authority', async () => {
  const f=fixture(); f.run.livemode=true;
  const transport=async(url,options)=>{
    assert.equal(options.headers.Authorization,'Bearer rk_live_fixture');
    return f.transport(url,{...options,headers:{...options.headers,Authorization:'Bearer rk_test_fixture'}});
  };
  const result=await observe({...context,environment:'live'},'rk_live_fixture',transport);
  assert.equal(result.environment,'live'); assert.equal(result.financialAuthority,false);
  await assert.rejects(observe({...context,environment:'live'},'rk_test_fixture',transport));
  f.run.livemode=false;
  await assert.rejects(observe({...context,environment:'live'},'rk_live_fixture',transport));
});
test('negative refund adjustments retained, never netted into authority', () => {
  const result = normalize(`${csv}fee_two,re_fixture,refund,-0.10,-0.01,usd,Tax,Revenue,Adjustment,credit`, context);
  assert.ok(result.rows.some(r => r.amountMinor === -10)); assert.equal(result.totalFeeMinor, null);
});
test('quoted CSV and reordered rows preserve deterministic evidence', () => {
  const other = 'fee_two,ch_other,charge,0.20,0,usd,Tax,Revenue,"quoted, feature",balance';
  const a = normalize(`${csv}${other}`, context), b = normalize(`${header}\n${other}\n${row}`, context);
  assert.equal(JSON.stringify(a.rows), JSON.stringify(b.rows)); assert.equal(a.unattributedRows, 1);
});
for (const amount of ['0.001', 'NaN', '1e2', ' 0.10', '+0.10', '90071992547410.00']) {
  test(`rejects ambiguous or unsafe decimal ${amount}`, () => assert.throws(() => normalize(csv.replace('0.10', amount), context)));
}
for (const [name, body] of [
  ['duplicate row', `${csv}${row}`], ['conflicting row', `${csv}${row.replace('0.10', '0.20')}`],
  ['missing column', csv.replace('fee_transaction_id,', '')],
  ['duplicate header', csv.replace('amount,tax', 'amount,amount')], ['malformed quote', `${header}\n"bad`],
  ['object binding', csv.replace(',charge,', ',refund,')], ['currency', csv.replace(',usd,', ',eur,')],
  ['truncated row', `${header}\nfee_only`], ['unknown settlement', csv.replace(',balance', ',unknown')],
  ['foreign account', `${header},account_id\n${row},acct_other`],
]) test(`rejects ${name}`, () => assert.throws(() => normalize(body, context)));
for (const [name, mutate] of [
  ['pending', r => { r.status = 'pending'; }], ['live', r => { r.livemode = true; }],
  ['wrong report', r => { r.report_type = 'balance.summary.1'; }],
  ['filtered', r => { r.parameters.fee_category = 'tax'; }],
  ['wrong interval', r => { r.parameters.interval_end = 201; }],
  ['wrong file', r => { r.result.id = 'file_other'; }],
  ['credential exfiltration', r => { r.result.url = 'https://evil.invalid/report.csv'; }],
  ['oversize', r => { r.result.size = 2_000_001; }], ['truncated', r => { r.result.size++; }],
]) test(`provider adapter rejects ${name}`, async () => {
  const f = fixture(); mutate(f.run); await assert.rejects(observe(context, 'rk_test_fixture', f.transport));
});
test('live credentials rejected before transport', async () => {
  const f = fixture(); await assert.rejects(observe(context, 'sk_live_fixture', f.transport)); assert.equal(f.calls.length, 0);
});
test('wrong authenticated account fails before reading a report', async () => {
  let calls = 0;
  await assert.rejects(observe(context, 'rk_test_fixture', async () => {
    calls++; return Response.json({ id: 'acct_other', object: 'account' });
  }));
  assert.equal(calls, 1);
});
test('provider failure is not a zero fee observation', async () => {
  await assert.rejects(observe(context, 'rk_test_fixture', async () => new Response('private provider error', { status: 429 })),
    /stripe_fee_evidence_provider_read_failed/);
});
test('provider network exception cannot yield a partial fee result', async () => {
  const f = fixture();
  await assert.rejects(observe(context, 'rk_test_fixture', async (url, options) => {
    if (url.includes('files.stripe.com')) throw new Error('synthetic network interruption');
    return f.transport(url, options);
  }));
});
test('report normalizer cannot modify the tax readiness hard gate', () => {
  const sql = fs.readFileSync('supabase/migrations/20261031033820_commerce_tax_readiness.sql', 'utf8');
  assert.match(sql, /commerce_tax_fee_settlement_ready[\s\S]*?select false/);
});
