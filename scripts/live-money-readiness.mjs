#!/usr/bin/env node
// Offline, count-only preparation inventory. Never a financial admission check.
import { openSync, fstatSync, readSync, closeSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import { pathToFileURL } from 'node:url';

export const qualificationKeys = Object.freeze([
  'tax', 'cashout', 'earnings', 'fee_semantics', 'merch_checkout',
  'native_ingress', 'external_payment',
]);
const switchKeys = ['live_money_enabled', 'payouts_enabled', 'cashout_enabled'];
const legalKeys = ['terms', 'privacy', 'community_guidelines', 'creator_terms', 'money_terms', 'payout_terms'];
const current = "q.verified_at <= at AND q.expires_at > at";
const qualifications = {
  tax: ['private.commerce_tax_qualifications', "q.environment IN ('production', 'live')", `${current} AND q.enabled AND q.revoked_at IS NULL AND q.provider_verified_at <= at AND q.provider_expires_at > at`],
  cashout: ['private.creator_cashout_provider_qualifications', "q.environment = 'live'", `${current} AND NOT EXISTS (SELECT 1 FROM private.creator_cashout_qualification_revocations r WHERE r.qualification_id = q.id)`],
  earnings: ['private.commerce_earnings_qualifications', "q.environment = 'live'", `${current} AND NOT EXISTS (SELECT 1 FROM private.commerce_fee_qualification_revocations r WHERE r.qualification_kind = 'funding' AND r.qualification_id = q.id)`],
  fee_semantics: ['private.commerce_fee_semantic_qualifications', "q.environment = 'live'", `${current} AND NOT EXISTS (SELECT 1 FROM private.commerce_fee_qualification_revocations r WHERE r.qualification_kind = 'semantics' AND r.qualification_id = q.id)`],
  merch_checkout: ['private.merch_live_checkout_qualifications', 'true', 'q.qualified_until > at AND q.revoked_at IS NULL'],
  native_ingress: ['private.native_production_ingress_qualifications', 'true', `${current} AND NOT EXISTS (SELECT 1 FROM private.native_production_ingress_revocations r WHERE r.qualification_id = q.id)`],
  external_payment: ['private.creator_external_payment_capabilities', "q.environment = 'live'", `${current} AND q.enabled AND q.revoked_at IS NULL`],
};

export function readinessSql() {
  // Only fixed source-owned identifiers and predicates are interpolated.
  const slices = qualificationKeys.map((key) => {
    const [table, mode, temporal] = qualifications[key];
    return `'${key}', (SELECT jsonb_build_object('total', count(*),
      'unexpired_nonrevoked', count(*) FILTER (WHERE ${temporal})) FROM ${table} q WHERE ${mode})`;
  }).join(',\n');
  return `WITH observation AS (SELECT statement_timestamp() AS at),
  canonical(document_key, capability) AS (VALUES
    ('terms', 'account'), ('privacy', 'account'), ('community_guidelines', 'account'),
    ('creator_terms', 'creator'), ('money_terms', 'creator_money'), ('payout_terms', 'payout'))
SELECT jsonb_build_object(
  'schema_version', 1, 'observed_at', at,
  'migration_count', (SELECT count(*) FROM supabase_migrations.schema_migrations),
  'latest_migration', (SELECT max(version) FROM supabase_migrations.schema_migrations),
  'switches', (SELECT coalesce(jsonb_object_agg(key, state), '{}'::jsonb)
    FROM public.platform_money_kill_switches WHERE key IN ('live_money_enabled', 'payouts_enabled', 'cashout_enabled')),
  'legal', (SELECT jsonb_object_agg(c.document_key, (SELECT count(*)
    FROM public.wave1_legal_document_versions d WHERE d.document_key = c.document_key
      AND d.capability = c.capability AND d.market = 'UNITED_STATES' AND d.active
      AND nullif(trim(d.version), '') IS NOT NULL AND d.effective_at <= at)) FROM canonical c),
  'policies', jsonb_build_object(
    'onboarding_current', (SELECT count(*) FROM private.creator_connect_onboarding_policy q
      WHERE q.environment = 'live' AND q.enabled AND ${current}),
    'observer_enabled', (SELECT count(*) FROM private.creator_connect_live_observation_policy q
      WHERE q.enabled AND q.platform_account_id IS NOT NULL)),
  'accounts', jsonb_build_object(
    'test', (SELECT count(*) FROM public.creator_payout_accounts WHERE provider = 'stripe_connect' AND provider_environment = 'test'),
    'live', (SELECT count(*) FROM public.creator_payout_accounts WHERE provider = 'stripe_connect' AND provider_environment = 'live'),
    'live_recent_sync_recorded', (SELECT count(*) FROM public.creator_payout_accounts
      WHERE provider = 'stripe_connect' AND provider_environment = 'live'
        AND last_provider_sync_at <= at AND last_provider_sync_at > at - interval '15 minutes')),
  'qualifications', jsonb_build_object(${slices})
) AS snapshot FROM observation;\n`;
}

function count(value) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('invalid_snapshot');
  return value;
}

export function summarizeReadiness(snapshot, now = Date.now()) {
  if (!snapshot || snapshot.schema_version !== 1 || !Number.isFinite(now)) throw new Error('invalid_snapshot');
  const observedAt = snapshot.observed_at;
  if (typeof observedAt !== 'string' || !/^\d{4}-\d\d-\d\dT/.test(observedAt)) throw new Error('invalid_snapshot');
  const timestamp = Date.parse(observedAt);
  if (!Number.isFinite(timestamp) || timestamp > now + 30000) throw new Error('invalid_snapshot');
  const latestMigration = snapshot.latest_migration;
  if (latestMigration !== null && (typeof latestMigration !== 'string' || !/^\d{12,14}$/.test(latestMigration))) throw new Error('invalid_snapshot');
  const switches = Object.fromEntries(switchKeys.map((key) => {
    const value = snapshot.switches?.[key];
    if (!['off', 'on', 'sandbox_only'].includes(value)) throw new Error('invalid_snapshot');
    return [key, value];
  }));
  const legal = Object.fromEntries(legalKeys.map((key) => [key, count(snapshot.legal?.[key])]));
  const policies = Object.fromEntries(['onboarding_current', 'observer_enabled'].map((key) => [key, count(snapshot.policies?.[key])]));
  const accounts = Object.fromEntries(['test', 'live', 'live_recent_sync_recorded'].map((key) => [key, count(snapshot.accounts?.[key])]));
  if (accounts.live_recent_sync_recorded > accounts.live) throw new Error('invalid_snapshot');
  const inventory = Object.fromEntries(qualificationKeys.map((key) => {
    const total = count(snapshot.qualifications?.[key]?.total);
    const unexpired = count(snapshot.qualifications?.[key]?.unexpired_nonrevoked);
    if (unexpired > total) throw new Error('invalid_snapshot');
    return [key, { total, unexpired_nonrevoked: unexpired }];
  }));
  return {
    reportVersion: 1,
    purpose: 'preparation_inventory_only',
    activationAuthorized: false,
    readinessAssessed: false,
    observation: {
      at: new Date(timestamp).toISOString(),
      freshness: now - timestamp > 10 * 60 * 1000 ? 'stale' : 'recent_snapshot_only',
      migrationCount: count(snapshot.migration_count), latestMigration,
    },
    controls: Object.values(switches).every((value) => value === 'off') ? 'all_three_off' : 'stop_controls_not_off',
    switches, legal, policies, accounts, qualifications: inventory,
    missingLegalConfiguration: legalKeys.filter((key) => legal[key] === 0),
    noUnexpiredInventory: qualificationKeys.filter((key) => inventory[key].unexpired_nonrevoked === 0),
    sourceBoundaries: [
      'Google external-program configuration/reporting is test-only in this source. A live external digital route needs separate implementation and qualification; it is not required for a native store-billing launch.',
    ],
    stillUnverified: [
      'Exact deployed source, Edge configuration, credentials, webhook delivery and worker scheduling.',
      'Current Stripe platform requirements, bank presence, connected-account capabilities and exact bindings.',
      'Legal approval and individual current-session acceptance; independent creator tax and sanctions evidence.',
      'Qualification contents, account/product/destination coverage, economic terms and operational validity.',
      'Store program/catalog approval, native cohort and installed-device purchase/restore/refund/payout proof.',
      'Explicit activation approval and action-time rollback readiness.',
    ],
  };
}

export function runCli(args) {
  if (args.length === 1 && args[0] === '--sql') return readinessSql();
  if (args.length === 2 && args[0] === '--input') {
    const fd = openSync(args[1], 'r');
    let parsed;
    try {
      const stat = fstatSync(fd);
      if (!stat.isFile() || stat.size > 65536) throw new Error('invalid_snapshot');
      const buffer = Buffer.alloc(65537);
      let size = 0;
      while (size < buffer.length) {
        const bytes = readSync(fd, buffer, size, buffer.length - size, null);
        if (bytes === 0) break;
        size += bytes;
      }
      if (size > 65536) throw new Error('invalid_snapshot');
      parsed = JSON.parse(buffer.subarray(0, size).toString('utf8'));
    } finally { closeSync(fd); }
    // Accept the query's single row, never search arbitrary/raw provider objects.
    const row = Array.isArray(parsed) && parsed.length === 1 ? parsed[0] : parsed;
    return `${JSON.stringify(summarizeReadiness(row?.snapshot), null, 2)}\n`;
  }
  throw new Error('usage');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { process.stdout.write(runCli(process.argv.slice(2))); }
  catch {
    // Never echo raw input, file paths, database errors, credentials or provider data.
    process.stderr.write('Readiness inventory unavailable. Use --sql or --input <single-row-json>; verify schema, access and sanitized input. No readiness is established.\n');
    process.exitCode = 1;
  }
}
