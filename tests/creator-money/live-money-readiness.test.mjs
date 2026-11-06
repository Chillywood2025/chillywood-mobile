import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { PGlite } from '@electric-sql/pglite';
import { qualificationKeys, readinessSql, summarizeReadiness, runCli } from '../../scripts/live-money-readiness.mjs';
import { createDatabase } from '../helpers/database-runtime-authority-fixture.mjs';

const schema = `
create schema private; create schema supabase_migrations;
create table supabase_migrations.schema_migrations(version text);
create table public.platform_money_kill_switches(key text primary key,state text);
create table public.wave1_legal_document_versions(document_key text,capability text,market text,active boolean,version text,effective_at timestamptz);
create table private.creator_connect_onboarding_policy(environment text,enabled boolean,verified_at timestamptz,expires_at timestamptz);
create table private.creator_connect_live_observation_policy(enabled boolean,platform_account_id text);
create table public.creator_payout_accounts(provider text,provider_environment text,last_provider_sync_at timestamptz);
create table private.commerce_tax_qualifications(environment text,verified_at timestamptz,expires_at timestamptz,enabled boolean,revoked_at timestamptz,provider_verified_at timestamptz,provider_expires_at timestamptz);
create table private.creator_cashout_provider_qualifications(id text,environment text,verified_at timestamptz,expires_at timestamptz);
create table private.creator_cashout_qualification_revocations(qualification_id text);
create table private.commerce_earnings_qualifications(id text,environment text,verified_at timestamptz,expires_at timestamptz);
create table private.commerce_fee_semantic_qualifications(id text,environment text,verified_at timestamptz,expires_at timestamptz);
create table private.commerce_fee_qualification_revocations(qualification_kind text,qualification_id text);
create table private.merch_live_checkout_qualifications(qualified_until timestamptz,revoked_at timestamptz);
create table private.native_production_ingress_qualifications(id text,verified_at timestamptz,expires_at timestamptz);
create table private.native_production_ingress_revocations(qualification_id text);
create table private.creator_external_payment_capabilities(environment text,enabled boolean,revoked_at timestamptz,verified_at timestamptz,expires_at timestamptz);
insert into public.platform_money_kill_switches values ('live_money_enabled','off'),('payouts_enabled','off'),('cashout_enabled','off');
`;

test('count-only SQL inventory executes without changing rows and never establishes readiness', async (t) => {
  const db = new PGlite();
  const snapshot = async () => (await db.query(readinessSql())).rows[0].snapshot;
  try {
    await db.exec(schema);
    await t.test('empty operational inventory and missing legal configuration remain explicit', async () => {
      const data = await snapshot();
      const report = summarizeReadiness(data);
      assert.equal(report.activationAuthorized, false);
      assert.equal(report.readinessAssessed, false);
      assert.equal(report.controls, 'all_three_off');
      assert.deepEqual(report.noUnexpiredInventory, qualificationKeys);
      assert.ok(report.missingLegalConfiguration.includes('payout_terms'));
      assert.deepEqual((await db.query('select * from public.platform_money_kill_switches order by key')).rows,
        [{key:'cashout_enabled',state:'off'},{key:'live_money_enabled',state:'off'},{key:'payouts_enabled',state:'off'}]);
    });
    await t.test('test accounts and test qualifications never populate live counts', async () => {
      await db.exec(`insert into public.creator_payout_accounts values ('stripe_connect','test',now());
        insert into private.commerce_tax_qualifications values ('sandbox',now(),now()+interval '1 hour',true,null,now(),now()+interval '1 hour');
        insert into private.creator_external_payment_capabilities values ('test',true,null,now(),now()+interval '1 hour');`);
      const data = await snapshot();
      assert.equal(data.accounts.test, 1);
      assert.equal(data.accounts.live, 0);
      for (const key of ['tax','external_payment']) assert.equal(data.qualifications[key].total, 0);
    });
    await t.test('future, expired, disabled and revoked rows do not count as current inventory', async () => {
      await db.exec(`insert into private.creator_cashout_provider_qualifications values
        ('expired','live',now()-interval '2 hours',now()-interval '1 hour'),
        ('future','live',now()+interval '1 hour',now()+interval '2 hours'),
        ('revoked','live',now()-interval '1 hour',now()+interval '1 hour');
        insert into private.creator_cashout_qualification_revocations values ('revoked');
        insert into private.commerce_tax_qualifications values
        ('production',now(),now()+interval '1 hour',false,null,now(),now()+interval '1 hour'),
        ('production',now(),now()+interval '1 hour',true,null,now()-interval '2 hours',now()-interval '1 hour');
        insert into private.commerce_fee_semantic_qualifications values ('revoked','live',now(),now()+interval '1 hour');
        insert into private.commerce_earnings_qualifications values ('revoked','live',now(),now()+interval '1 hour');
        insert into private.commerce_fee_qualification_revocations values ('semantics','revoked'),('funding','revoked');
        insert into private.native_production_ingress_qualifications values ('revoked',now(),now()+interval '1 hour');
        insert into private.native_production_ingress_revocations values ('revoked');
        insert into private.merch_live_checkout_qualifications values (now()+interval '1 hour',now());`);
      const data = await snapshot();
      assert.equal(data.qualifications.cashout.total, 3);
      for (const key of ['cashout','tax','fee_semantics','earnings','native_ingress','merch_checkout']) {
        assert.equal(data.qualifications[key].unexpired_nonrevoked, 0);
      }
    });
    await t.test('legal inventory requires exact market, capability, effective version; no acceptance is inferred', async () => {
      await db.exec(`insert into public.wave1_legal_document_versions values
        ('payout_terms','creator_money','UNITED_STATES',true,'v1',now()),
        ('payout_terms','payout','OTHER',true,'v1',now()),
        ('payout_terms','payout','UNITED_STATES',true,'v1',now()+interval '1 hour'),
        ('payout_terms','payout','UNITED_STATES',true,' ',now());`);
      assert.equal((await snapshot()).legal.payout_terms, 0);
      await db.exec(`insert into public.wave1_legal_document_versions values ('payout_terms','payout','UNITED_STATES',true,'v1',now());`);
      const report = summarizeReadiness(await snapshot());
      assert.equal(report.legal.payout_terms, 1);
      assert.equal(report.readinessAssessed, false);
      assert.ok(report.stillUnverified.some((value) => value.includes('individual current-session acceptance')));
    });
    await t.test('positive inventory is not route qualification or permission to activate', async () => {
      await db.exec(`insert into private.creator_cashout_provider_qualifications values ('current','live',now(),now()+interval '1 hour');
        insert into private.creator_connect_onboarding_policy values ('live',true,now(),now()+interval '1 hour');
        insert into private.creator_connect_live_observation_policy values (true,'acct_private');
        insert into public.creator_payout_accounts values ('stripe_connect','live',now());`);
      const report = summarizeReadiness(await snapshot());
      assert.equal(report.qualifications.cashout.unexpired_nonrevoked, 1);
      assert.equal(report.policies.onboarding_current, 1);
      assert.equal(report.accounts.live_recent_sync_recorded, 1);
      assert.equal(report.activationAuthorized, false);
      assert.equal(report.readinessAssessed, false);
      assert.ok(!JSON.stringify(report).includes('acct_private'));
      assert.ok(report.sourceBoundaries[0].includes('test-only'));
      assert.ok(!readinessSql().includes('google_play_external_program_config'));
    });
    await t.test('both canonical live tax modes are inventoried without admitting sandbox', async () => {
      await db.exec(`insert into private.commerce_tax_qualifications values
        ('production',now(),now()+interval '1 hour',true,null,now(),now()+interval '1 hour'),
        ('live',now(),now()+interval '1 hour',true,null,now(),now()+interval '1 hour');`);
      const data = await snapshot();
      assert.equal(data.qualifications.tax.total, 4);
      assert.equal(data.qualifications.tax.unexpired_nonrevoked, 2);
    });
    await t.test('non-OFF controls are a stop condition, not a success', async () => {
      await db.exec("update public.platform_money_kill_switches set state='on' where key='live_money_enabled'");
      assert.equal(summarizeReadiness(await snapshot()).controls, 'stop_controls_not_off');
    });
    await t.test('stale, future, missing, impossible and sensitive extra input is handled safely', async () => {
      const data = await snapshot();
      const now = Date.parse(data.observed_at);
      assert.equal(summarizeReadiness(data, now + 600001).observation.freshness, 'stale');
      assert.throws(() => summarizeReadiness(data, now - 30001), /invalid_snapshot/);
      assert.throws(() => summarizeReadiness({...data,switches:{}}), /invalid_snapshot/);
      assert.throws(() => summarizeReadiness({...data,accounts:{...data.accounts,live:-1}}), /invalid_snapshot/);
      assert.throws(() => summarizeReadiness({...data,qualifications:{}}), /invalid_snapshot/);
      assert.throws(() => summarizeReadiness({...data,latest_migration:'private secret'}), /invalid_snapshot/);
      const report = summarizeReadiness({...data,raw_provider_payload:'secret value',accounts:{...data.accounts,bank:'ba_secret'}});
      assert.ok(!JSON.stringify(report).includes('secret'));
    });
    await t.test('missing schema is an explicit query failure, never zero evidence or success', async () => {
      await db.exec('drop table private.creator_connect_onboarding_policy');
      await assert.rejects(snapshot(), /does not exist/);
    });
  } finally { await db.close(); }
});

test('CLI only prints fixed SQL or reads bounded local count-only JSON', () => {
  assert.equal(runCli(['--sql']), readinessSql());
  assert.throws(() => runCli(['--linked']), /usage/);
  assert.throws(() => runCli(['--sql','--activate']), /usage/);
  const folder = mkdtempSync(join(tmpdir(), 'money-readiness-'));
  try {
    assert.throws(() => runCli(['--input',folder]), /invalid_snapshot/);
    const file = join(folder,'private-input.json');
    writeFileSync(file, 'secret input');
    const result = spawnSync(process.execPath, ['scripts/live-money-readiness.mjs','--input',file], {encoding:'utf8'});
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.ok(!result.stderr.includes('secret input'));
    assert.ok(!result.stderr.includes(file));
    writeFileSync(file, 'x'.repeat(65537));
    assert.throws(() => runCli(['--input',file]), /invalid_snapshot/);
  } finally { rmSync(folder,{recursive:true,force:true}); }
});

test('fixed inventory SELECT also executes against the full canonical schema in a read-only transaction', {timeout:240000}, async () => {
  const { db } = await createDatabase({applyRepair:true,repairInMigrationOrder:true,includeHeldStudio:true});
  try {
    // The application replay fixture deliberately omits the CLI-managed ledger.
    // Supply only that external metadata shape; all application schemas and
    // qualification constraints above come from their real migrations.
    await db.exec('create schema supabase_migrations; create table supabase_migrations.schema_migrations(version text primary key)');
    await db.exec('begin read only');
    const rows = (await db.query(readinessSql())).rows;
    assert.equal(rows.length,1);
    const report = summarizeReadiness(rows[0].snapshot);
    assert.equal(report.activationAuthorized,false);
    assert.equal(report.readinessAssessed,false);
    assert.deepEqual(report.noUnexpiredInventory,qualificationKeys);
  } finally {
    await db.exec('rollback');
    await db.close();
  }
});
