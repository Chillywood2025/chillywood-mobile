import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { createDatabase } from "../helpers/database-runtime-authority-fixture.mjs";
import { account, connect, creator, clientFor, payoutsFor } from "./stripe-connect-observed-fixture.mjs";

const migration = "20261027034858_creator_connect_observed_configuration.sql";
test("observed Connect configuration persists through actual SQL, eligibility and client round trip without granting payout authority", { timeout: 240_000 }, async () => {
  const { db } = await createDatabase({ includeHeldStudio: true, implicitApiGrants: false, excludeMigrations: [migration, "20261101154121_creator_connect_live_observation.sql"] });
  const one = async (sql, args = []) => (await db.query(sql, args)).rows[0];
  const schemaAuthority = async () => (await db.query(`select relname,relacl::text,relrowsecurity,relforcerowsecurity
    from pg_class where oid in ('public.creator_payout_accounts'::regclass,'public.creator_payout_eligibility_records'::regclass) order by relname`)).rows;
  try {
    const before = await schemaAuthority();
    await db.exec("set session_replication_role=replica");
    await db.query("insert into auth.users(id,email,email_confirmed_at,is_sso_user,is_anonymous) values($1,'synthetic-connect@example.test',now(),false,false)", [creator]);
    await db.exec("set session_replication_role=origin");
    const old = await one(`insert into public.creator_payout_accounts(creator_user_id,provider,provider_environment,provider_account_id,
      provider_account_type,provider_dashboard_type,provider_fees_payer,provider_losses_collector,provider_requirements_collection)
      values($1,'stripe_connect','test','acct_synthetic_configuration','express','express','platform','platform','stripe') returning *`, [creator]);
    await db.exec(fs.readFileSync(`supabase/migrations/${migration}`, "utf8"));
    assert.deepEqual(await schemaAuthority(), before, "forward columns do not change grants or RLS");
    let row = await one("select * from public.creator_payout_accounts where id=$1", [old.id]);
    assert.equal(row.provider_configuration_observed_at, null); assert.equal(row.provider_configuration_status, "unknown");
    assert.equal(connect.storedStripeConfiguration(row).configurationStatus, "unknown");
    const client = clientFor(db), payouts = payoutsFor(client);
    const observe = async input => {
      const normalized = connect.normalizeStripeAccount(input);
      row = await connect.upsertCreatorPayoutAccountFromStripe(client, creator, normalized, row, null, "test_observation");
      return payouts.readCreatorPayoutDashboardSummary({ creatorUserId: creator });
    };
    let summary = await observe(account());
    assert.equal(row.provider_account_type, "none"); assert.equal(row.provider_configuration_status, "match");
    assert.equal(row.provider_fees_payer, "platform"); assert.equal(row.provider_fees_payer_raw, "application");
    assert.equal(connect.storedStripeConfiguration(row).configurationStatus, "match");
    assert.equal(summary.providerReady, true); assert.equal(summary.setupStatus, "provider_ready_payouts_not_active");
    assert.equal(summary.eligibleForPayouts, false);
    assert.equal(payouts.previewCreatorPayoutPreproductionWorkflow(summary, { amountCents: 10000, payoutType: "scheduled" }).canExecuteProductionPayout, false);
    const mismatch = account(); mismatch.controller.stripe_dashboard.type = "none"; mismatch.controller.requirement_collection = "application";
    summary = await observe(mismatch);
    assert.equal(row.provider_requirements_collection, "platform"); assert.equal(row.provider_dashboard_type, "none");
    assert.equal(row.provider_configuration_key, null); assert.equal(row.provider_expected_configuration_key, connect.STRIPE_CONNECT_EXPECTED_CONFIGURATION.key);
    assert.equal(summary.providerConfigurationStatus, "mismatch"); assert.equal(summary.providerReady, false);
    assert.equal(summary.canStartProviderSetup, false); assert.equal(summary.canRefreshProviderStatus, true);
    assert.match(summary.setupStatusBody, /needs platform review/);
    summary = await observe(account({ controller: undefined, type: undefined }));
    assert.equal(row.provider_account_type, "unknown"); assert.equal(row.provider_dashboard_type, "unknown");
    assert.equal(row.provider_fees_payer, "unknown"); assert.equal(row.provider_is_controller, null);
    assert.equal(summary.providerConfigurationStatus, "unknown"); assert.equal(summary.providerReady, false);
    const accountFees = account(); accountFees.controller.fees.payer = "account";
    await observe(accountFees); assert.equal(row.provider_fees_payer, "account");
    await observe(account());
    const concurrentSnapshot = row;
    const results = await Promise.allSettled([
      connect.upsertCreatorPayoutAccountFromStripe(client, creator, connect.normalizeStripeAccount(mismatch), concurrentSnapshot, null, "first"),
      connect.upsertCreatorPayoutAccountFromStripe(client, creator, connect.normalizeStripeAccount(account()), concurrentSnapshot, null, "stale"),
    ]);
    assert.equal(results.filter(result => result.status === "fulfilled").length, 1, "one observation owns the compare-and-set snapshot");
    row = (await client.from("creator_payout_accounts").select("*").eq("id", row.id).single()).data;
    assert.equal(row.provider_configuration_status, "mismatch");
    assert.equal((await payouts.readCreatorPayoutDashboardSummary({ creatorUserId: creator })).providerConfigurationStatus, "mismatch");
    await observe(account());
    await assert.rejects(db.query("update public.creator_payout_accounts set provider_expected_configuration_key=null where id=$1", [row.id]), /configuration_observation_check/);
    await assert.rejects(db.query("update public.creator_payout_accounts set provider_dashboard_type='none' where id=$1", [row.id]), /configuration_observation_check/);
    await assert.rejects(db.query("update public.creator_payout_accounts set provider_fees_payer='stripe' where id=$1", [row.id]), /configuration_observation_check/);
    const saved = row;
    await assert.rejects(connect.upsertCreatorPayoutAccountFromStripe(client, creator, connect.normalizeStripeAccount(account({ id: "acct_wrong_identity" })), row, null, "wrong"), /stored account binding/);
    await assert.rejects(connect.upsertCreatorPayoutAccountFromStripe(client, creator, connect.normalizeStripeAccount(account()), { ...row, provider_environment: "live" }, null, "wrong"), /stored account binding/);
    const priorEligibility = await one("select * from public.creator_payout_eligibility_records where creator_user_id=$1", [creator]);
    await assert.rejects(db.query("update public.creator_payout_accounts set provider_account_id='acct_replacement' where id=$1", [row.id]), /configuration_observation_check/);
    assert.deepEqual(await one("select * from public.creator_payout_eligibility_records where creator_user_id=$1", [creator]), priorEligibility);
    assert.equal((await one("select provider_account_id from public.creator_payout_accounts where id=$1", [row.id])).provider_account_id, account().id);
    await db.query("update public.creator_payout_accounts set provider_account_id='acct_replacement',provider_configuration_status='unknown',provider_configuration_observed_at=null,provider_configuration_account_id=null where id=$1", [row.id]);
    const replacement = await one("select * from public.creator_payout_accounts where id=$1", [row.id]);
    assert.equal(connect.storedStripeConfiguration(replacement).configurationStatus, "unknown");
    const replacementSummary = await payouts.readCreatorPayoutDashboardSummary({ creatorUserId: creator });
    assert.equal(replacementSummary.providerConfigurationStatus, "unknown"); assert.equal(replacementSummary.providerReady, false);
    await assert.rejects(connect.upsertCreatorPayoutAccountFromStripe(client, creator, connect.normalizeStripeAccount(account()), saved, null, "stale"), /binding no longer exists/);
    assert.equal((await one("select provider_account_id from public.creator_payout_accounts where id=$1", [row.id])).provider_account_id, "acct_replacement");
    await assert.rejects(connect.upsertCreatorPayoutAccountFromStripe(client, creator, connect.normalizeStripeAccount(account()), null, null, "duplicate"), /duplicate key/);
    await db.query("update public.creator_payout_accounts set provider_account_id=$2 where id=$1", [row.id, account().id]);
    row = (await client.from("creator_payout_accounts").select("*").eq("id", row.id).single()).data;
    await observe(account());
    await db.exec("begin");
    await observe(mismatch); await db.exec("rollback");
    row = await one("select * from public.creator_payout_accounts where id=$1", [saved.id]);
    assert.equal(row.provider_configuration_status, "match");
    assert.equal((await payouts.readCreatorPayoutDashboardSummary({ creatorUserId: creator })).providerConfigurationStatus, "match");
    await observe(mismatch);
    assert.equal((await payouts.readCreatorPayoutDashboardSummary({ creatorUserId: creator })).providerConfigurationStatus, "mismatch", "retry applies observation after rollback");
    await db.exec(`create function private.fail_connect_projection_fixture() returns trigger language plpgsql as $$begin raise exception 'projection_failure_fixture';end$$;
      create trigger fail_connect_projection_fixture before update on public.creator_payout_eligibility_records for each row execute function private.fail_connect_projection_fixture()`);
    const beforeFailure = await one("select provider_configuration_observed_at,provider_configuration_status from public.creator_payout_accounts where id=$1", [row.id]);
    await assert.rejects(observe(account()), /projection_failure_fixture/);
    assert.deepEqual(await one("select provider_configuration_observed_at,provider_configuration_status from public.creator_payout_accounts where id=$1", [row.id]), beforeFailure);
    assert.equal((await payouts.readCreatorPayoutDashboardSummary({ creatorUserId: creator })).providerConfigurationStatus, "mismatch");
    await db.exec("drop trigger fail_connect_projection_fixture on public.creator_payout_eligibility_records; drop function private.fail_connect_projection_fixture()");
    await observe(account());
    await db.query("update public.creator_payout_eligibility_records set fraud_hold_active=true,admin_review_status='on_hold',eligibility_status='on_hold',eligibility_reason='Synthetic platform hold',tax_ready=true where creator_user_id=$1", [creator]);
    await observe(account());
    const held = await one("select * from public.creator_payout_eligibility_records where creator_user_id=$1", [creator]);
    assert.equal(held.fraud_hold_active, true); assert.equal(held.admin_review_status, "on_hold"); assert.equal(held.tax_ready, true);
    assert.equal(held.eligibility_reason, "Synthetic platform hold"); assert.equal(held.provider_ready, false); assert.equal(held.eligible_for_payouts, false);
    await db.query("update public.creator_payout_accounts set provider='manual',provider_configuration_status='unknown',provider_configuration_observed_at=null where id=$1", [row.id]);
    const manual = await one("select * from public.creator_payout_eligibility_records where creator_user_id=$1", [creator]);
    await db.query("update public.creator_payout_accounts set details_submitted=false where id=$1", [row.id]);
    assert.deepEqual(await one("select * from public.creator_payout_eligibility_records where creator_user_id=$1", [creator]), manual, "unrelated manual updates do not project Stripe policy");
    for (const role of ["anon", "authenticated", "service_role"]) assert.equal((await one("select has_function_privilege($1,'private.project_creator_connect_observed_eligibility()','EXECUTE') allowed", [role])).allowed, false);
    for (const role of ["anon", "authenticated"]) {
      assert.equal((await one("select has_table_privilege($1,'public.creator_payout_accounts','UPDATE') allowed", [role])).allowed, false);
      assert.equal((await one("select has_table_privilege($1,'public.creator_payout_accounts','INSERT') allowed", [role])).allowed, false);
    }
  } finally { await db.close(); }
});
