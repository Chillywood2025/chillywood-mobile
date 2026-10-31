import test from 'node:test';
import assert from 'node:assert/strict';
import { createDatabase } from '../helpers/database-runtime-authority-fixture.mjs';
import { createFeeReportAuctionFixture } from '../helpers/fee-report-auction-fixture.mjs';

test('full-schema fee report persistence is private, immutable, idempotent and never money authority', { timeout: 240000 }, async () => {
  const { db } = await createDatabase({ applyRepair: true, repairInMigrationOrder: true, includeHeldStudio: true, implicitApiGrants: false });
  const one = async (sql, args = []) => Object.values((await db.query(sql, args)).rows[0])[0];
  const root = () => db.exec('reset role');
  const service = () => db.exec(`reset role; select set_config('request.jwt.claims','{"role":"service_role"}',false); select set_config('request.jwt.claim.role','service_role',false); set role service_role;`);
  try {
    const fixture = await createFeeReportAuctionFixture(db);
    const contract = fixture.contract;
    const source = await one('select id from private.auction_settlement_observations where contract_id=$1 order by created_at desc limit 1',[contract]);
    const evidence = { schemaVersion:1, accountId:'acct_platform', environment:'test',reportRunId:'frr_Fee',fileId:'file_Fee',reportType:'all_fees.incurred_at.itemized.2',
      intervalStart:100,intervalEnd:200,chargeId:'ch_FEEEVIDENCE',refundIds:[],rows:[{feeTransactionId:'fee_Fee',incurredBy:'ch_FEEEVIDENCE',incurredByType:'charge',amountMinor:10,taxMinor:1,currency:'usd',product:'Tax',suite:'Revenue',featureName:'Automatic tax',pricingTier:'',settledVia:'balance'}],
      unattributedRows:0,observedRowCount:1,totalFeeMinor:null,taxServiceFeeMinor:null,completeness:'unverified',financialAuthority:false,settlementReady:false,
      holdReasons:['fee_report_coverage_unverified','tax_service_fee_unverified'],providerBinding:'authenticated_report',contentSha256:'a'.repeat(64),reportSucceededAt:300 };
    const record = (patch={}) => one('select public.record_commerce_fee_report_observation($1,$2,$3::jsonb)',[contract,source,JSON.stringify({...evidence,...patch})]);
    for (const role of ['anon','authenticated','service_role']) {
      await db.exec(`set role ${role}`);
      await assert.rejects(db.query('select * from private.commerce_fee_report_observations'),/permission denied/);
      await assert.rejects(db.query('insert into private.commerce_fee_report_observations(id) values(gen_random_uuid())'),/permission denied/);
      if(role!=='service_role') {
        await assert.rejects(record(),/permission denied/);
        await assert.rejects(db.query('select public.get_commerce_fee_report_import_context($1)',[contract]),/permission denied/);
      }
      await root();
    }
    await service();
    const context = await one('select public.get_commerce_fee_report_import_context($1)',[contract]);
    assert.equal(context.accountId,'acct_platform'); assert.equal(context.chargeId,'ch_FEEEVIDENCE'); assert.deepEqual(context.refundIds,[]);
    const first = await record(); assert.equal(first.status,'observed_only'); assert.equal(first.financialAuthority,false);
    const duplicate = await record(); assert.equal(duplicate.status,'duplicate'); assert.equal(duplicate.observationId,first.observationId);
    for (const patch of [{accountId:'acct_other'},{environment:'live'},{chargeId:'ch_other'},{refundIds:['re_other']},{settlementReady:true},{financialAuthority:true},{completeness:'complete'},
      {taxServiceFeeMinor:0},{providerBinding:'local_csv'},{rawCsv:'private'},{rows:[{...evidence.rows[0],currency:'eur'}]},
      {rows:[evidence.rows[0],evidence.rows[0]],observedRowCount:2},{contentSha256:'b'.repeat(64)},{fileId:'file_other'},
      {observedRowCount:2},{rows:[{...evidence.rows[0],product:null}]},{rows:[{...evidence.rows[0],amountMinor:'10'}]}]) await assert.rejects(record(patch));
    await assert.rejects(record({rows:[evidence.rows[0],evidence.rows[0]],observedRowCount:2}),/fee_evidence_duplicate_component/);
    await assert.rejects(one('select public.record_commerce_fee_report_observation($1,gen_random_uuid(),$2::jsonb)',[contract,JSON.stringify(evidence)]),/query returned no rows/);
    await root();
    assert.equal(await one('select count(*)::int from private.commerce_fee_report_observations'),1);
    await assert.rejects(db.query('update private.commerce_fee_report_observations set file_id=\'file_changed\''),/immutable/);
    await assert.rejects(db.query('delete from private.commerce_fee_report_observations'),/immutable/);
    assert.equal(await one('select private.commerce_tax_fee_settlement_ready(\'event_auction\',$1)',[contract]),false);
    assert.equal(await one('select count(*)::int from private.auction_transfer_plans'),0);
    const flags=(await db.query(`select relrowsecurity,relforcerowsecurity from pg_class where oid='private.commerce_fee_report_observations'::regclass`)).rows[0];
    assert.equal(flags.relrowsecurity,true); assert.equal(flags.relforcerowsecurity,true);
  } finally { await db.close(); }
});
