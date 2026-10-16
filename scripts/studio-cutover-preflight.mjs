#!/usr/bin/env node
// Operator evidence gate, not a deployment tool or an authentication boundary.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migration = 'supabase/migrations/20261015073423_platform_studio_publication_and_audience_authority.sql';
const version = '20261015073423';
const maxAge = 5 * 60_000;
const toolingOnlyPaths = new Set(['scripts/studio-cutover-preflight.mjs', 'scripts/studio-cutover-live.sql',
  'tests/studio-cutover-preflight.test.mjs', 'tests/platform-studio-legacy-cutover.test.mjs', 'docs/studio-cutover-runbook.md',
  'tests/fixtures/studio-legacy-cutover/provenance.json', 'tests/fixtures/studio-legacy-cutover/_lib/platformBranding.ts.txt',
  'tests/fixtures/studio-legacy-cutover/app/channel-settings.tsx.txt']);
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const canonical = value => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
const fingerprint = value => hash(canonical(value));
const requireThat = (value, code) => { if (!value) throw new Error(code); };
const text = value => typeof value === 'string' && value.trim().length > 0;
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const time = value => typeof value === 'string' ? Date.parse(value) : NaN;
function fresh(value, now) {
  const age = now - time(value);
  requireThat(Number.isFinite(age) && age >= 0 && age <= maxAge, 'EVIDENCE_NOT_FRESH');
}
function privatePath(file) {
  const actual = fs.realpathSync(file);
  requireThat(actual !== root && !actual.startsWith(`${root}${path.sep}`), 'PRIVATE_INPUT_INSIDE_CHECKOUT');
  requireThat(fs.statSync(actual).isFile(), 'PRIVATE_INPUT_NOT_FILE');
  return actual;
}
function writeNew(file, contents) {
  const parent = fs.realpathSync(path.dirname(path.resolve(file)));
  requireThat(parent !== root && !parent.startsWith(`${root}${path.sep}`), 'OUTPUT_INSIDE_CHECKOUT');
  const temporary = path.join(parent, `.studio-cutover-${crypto.randomUUID()}.tmp`);
  try {
    fs.writeFileSync(temporary, contents, { flag: 'wx', mode: 0o600 });
    // Same-filesystem hard link publishes a complete file atomically and fails
    // if the target already exists. A failed write never exposes partial SQL.
    fs.linkSync(temporary, path.join(parent, path.basename(file)));
  } finally {
    try { fs.unlinkSync(temporary); } catch { /* Never remove the published target. */ }
  }
}
function checkout() {
  // Ignore untracked tools/dependencies, but never bind changed tracked source to HEAD.
  requireThat(git('status', '--porcelain', '--untracked-files=no') === '', 'TRACKED_CHECKOUT_DIRTY');
  for (const file of [migration, 'scripts/studio-cutover-preflight.mjs', 'scripts/studio-cutover-live.sql']) {
    requireThat(git('ls-files', '--error-unmatch', file) === file, 'GATE_SOURCE_NOT_COMMITTED');
    requireThat(git('diff', 'HEAD', '--', file) === '', 'GATE_SOURCE_CHANGED');
  }
  return { commit: git('rev-parse', 'HEAD'), tree: git('rev-parse', 'HEAD^{tree}'), migrationSha256: hash(fs.readFileSync(path.join(root, migration))) };
}
function capture(project) {
  requireThat(/^[a-z0-9]{20}$/.test(project), 'PROJECT_INVALID');
  const host = process.env.PGHOST;
  requireThat(!process.env.PGHOSTADDR && !process.env.PGSERVICE && !process.env.PGSERVICEFILE, 'CONNECTION_OVERRIDE_FORBIDDEN');
  const direct = host === `db.${project}.supabase.co`;
  const pooler = /^aws-[a-z0-9-]+\.pooler\.supabase\.com$/.test(host ?? '') && process.env.PGUSER === `postgres.${project}`;
  requireThat(direct || pooler, 'PROJECT_CONNECTION_MISMATCH');
  requireThat((!process.env.PGPORT || process.env.PGPORT === '5432')
    && (pooler || process.env.PGUSER === 'postgres'), 'CONNECTION_MODE_UNSUPPORTED');
  requireThat(process.env.PGSSLMODE === 'verify-full', 'VERIFIED_TLS_REQUIRED');
  requireThat(process.env.PGDATABASE === 'postgres', 'DATABASE_MISMATCH');
  const sql = fs.readFileSync(path.join(root, 'scripts/studio-cutover-live.sql'), 'utf8');
  const raw = execFileSync('psql', ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1'], {
    cwd: root, input: sql, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
    timeout: 30_000, stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, PGOPTIONS: '-c default_transaction_read_only=on -c statement_timeout=25000' },
  });
  const live = JSON.parse(raw);
  requireThat(live.schema === 1 && Array.isArray(live.history) && live.history.length > 0, 'LIVE_HISTORY_MISSING');
  requireThat(live.history.every(row => text(row.version)) && !live.history.some(row => row.version === version
    || String(row.name ?? '').includes('platform_studio_publication_and_audience_authority')), 'MIGRATION_ALREADY_APPLIED');
  requireThat(live.heldObjectsAbsent === true, 'PARTIAL_OR_COMPLETE_CUTOVER_PRESENT');
  requireThat(live.catalog && Object.keys(live.catalog).length > 0, 'LIVE_CATALOG_MISSING');
  requireThat(/^[a-f0-9]{64}$/.test(live.stateSha256 ?? ''), 'LIVE_STATE_DIGEST_MISSING');
  for (const key of ['profileWriters', 'assetOwners', 'profileOwners', 'storageOwners', 'reviewers', 'audienceReviewers']) {
    requireThat(Array.isArray(live[key]) && live[key].every(text), 'LIVE_COHORT_MALFORMED');
    live[key] = [...new Set(live[key])].sort();
  }
  requireThat(live.unknownSubjects === 0, 'UNKNOWN_COHORT_SUBJECT');
  return { schema: 1, capturedAt: new Date().toISOString(), binding: { project, ...checkout(), liveSha256: fingerprint(live) }, live };
}
function exactSet(actual, expected, code) {
  requireThat(Array.isArray(actual) && actual.every(text) && new Set(actual).size === actual.length
    && canonical([...actual].sort()) === canonical([...new Set(expected)].sort()), code);
}
function prepare(evidenceFile, baselineFile, output, project) {
  const evidencePath = privatePath(evidenceFile);
  const evidence = read(evidencePath);
  const baseline = read(privatePath(baselineFile));
  const now = Date.now();
  const freshness = [];
  const checkFresh = value => { fresh(value, now); freshness.push(value); };
  checkFresh(baseline.capturedAt);
  requireThat(baseline.binding?.liveSha256 === fingerprint(baseline.live), 'BASELINE_INTEGRITY_MISMATCH');
  requireThat(evidence.schema === 1 && fingerprint(evidence.binding) === fingerprint(baseline.binding), 'EVIDENCE_BINDING_MISMATCH');
  checkFresh(evidence.reviewedAt);
  requireThat(text(evidence.reviewer), 'REVIEWER_MISSING');
  // Receipt files are private reviewed evidence, not self-authenticating signatures.
  function receipt(value, kind, claims) {
    requireThat(value && text(value.file) && /^[a-f0-9]{64}$/.test(value.sha256 ?? ''), 'RECEIPT_MISSING');
    const file = privatePath(path.resolve(path.dirname(evidencePath), value.file));
    const bytes = fs.readFileSync(file);
    requireThat(bytes.length > 0 && hash(bytes) === value.sha256, 'RECEIPT_INTEGRITY_MISMATCH');
    const record = JSON.parse(bytes);
    requireThat(record.schema === 1 && record.reviewer === evidence.reviewer && record.kind === kind
      && fingerprint(record.binding) === fingerprint(evidence.binding)
      && fingerprint(record.claims) === fingerprint(claims) && text(record.observation)
      && text(record.sourceReference), 'RECEIPT_CONTENT_MISMATCH');
    requireThat(Array.isArray(record.sourceEvidence) && record.sourceEvidence.length > 0, 'SOURCE_EVIDENCE_MISSING');
    for (const source of record.sourceEvidence) {
      requireThat(source && text(source.file) && /^[a-f0-9]{64}$/.test(source.sha256 ?? ''), 'SOURCE_EVIDENCE_MISSING');
      const sourcePath = privatePath(path.resolve(path.dirname(file), source.file));
      requireThat(sourcePath !== file && sourcePath !== evidencePath && sourcePath !== fs.realpathSync(baselineFile), 'SOURCE_EVIDENCE_CIRCULAR');
      const sourceBytes = fs.readFileSync(sourcePath);
      requireThat(sourceBytes.length > 0 && hash(sourceBytes) === source.sha256, 'SOURCE_EVIDENCE_INTEGRITY_MISMATCH');
    }
    checkFresh(record.reviewedAt);
    requireThat(Number.isFinite(time(record.observedAt)) && time(record.observedAt) <= time(record.reviewedAt), 'RECEIPT_OBSERVATION_INVALID');
    if (['installReceipt', 'client-roster', 'dormancy', 'privileged-inventory', 'pause'].includes(kind)) {
      checkFresh(record.observedAt);
      requireThat(time(record.observedAt) >= time(evidence.pause?.startedAt), 'RECEIPT_OUTSIDE_PAUSE');
    }
  }
  requireThat(evidence.baselineReview?.statement === 'Reviewed live project, migration ledger and catalog against this exact source; required predecessors are present and the held migration is absent', 'BASELINE_REVIEW_MISSING');
  receipt(evidence.baselineReview.receipt, 'baseline-review', { liveSha256: baseline.binding.liveSha256 });
  requireThat(evidence.cohortScope === 'Finite closed internal tester cohort; no public rollout, unknown clients or unenumerated account access', 'COHORT_NOT_CLOSED');
  requireThat(evidence.privilegedInventory?.statement === 'All privileged humans, services, jobs and credential holders with Studio/Audience mutation access are enumerated', 'PRIVILEGED_INVENTORY_MISSING');
  const holders = evidence.privilegedInventory.holders;
  requireThat(Array.isArray(holders) && holders.length > 0 && holders.every(text) && new Set(holders).size === holders.length, 'PRIVILEGED_HOLDERS_INVALID');
  receipt(evidence.privilegedInventory.receipt, 'privileged-inventory', { holders });
  const subjects = [...new Set([...baseline.live.profileWriters, ...baseline.live.assetOwners, ...baseline.live.profileOwners,
    ...baseline.live.storageOwners, ...baseline.live.reviewers, ...baseline.live.audienceReviewers, ...holders])];
  requireThat(Array.isArray(evidence.accounts), 'ACCOUNT_ROSTERS_MISSING');
  exactSet(evidence.accounts.map(account => account.subject), subjects, 'ACCOUNT_COVERAGE_MISMATCH');
  for (const account of evidence.accounts) {
    requireThat(account.statement === 'Every installed, cached, offline and automated Studio/Audience-capable client for this account is listed; no unknown clients remain', 'ROSTER_ATTESTATION_MISSING');
    requireThat(Array.isArray(account.clients), 'CLIENT_ROSTER_MISSING');
    if (account.clients.length === 0) {
      requireThat(account.disposition === 'No client provisioned; dormant account cannot resume or obtain a client during cutover', 'EMPTY_ROSTER_UNEXPLAINED');
      receipt(account.dormancyReceipt, 'dormancy', { subject: account.subject, disposition: account.disposition });
    }
    exactSet(account.clients.map(client => client.id), account.clients.map(client => client.id), 'CLIENT_IDS_INVALID');
    receipt(account.rosterReceipt, 'client-roster', { subject: account.subject, clients: account.clients.map(client => ({ id: client.id, state: client.state })) });
    for (const client of account.clients) {
      if (client.state === 'retired') {
        receipt(client.retirementReceipt, 'retirement', { subject: account.subject, client: client.id, retirement: client.retirement });
        requireThat(client.retirement === 'Cannot resume Studio/Audience actions, including cached/offline sessions', 'RETIREMENT_NOT_ESTABLISHED');
      } else {
        requireThat(client.state === 'upgraded' && /^[a-f0-9]{40}$/.test(client.sourceCommit ?? '')
          && text(client.build) && text(client.runtime) && text(client.platform), 'CLIENT_VERSION_UNVERIFIED');
        try { git('merge-base', '--is-ancestor', client.sourceCommit, baseline.binding.commit); }
        catch { throw new Error('CLIENT_SOURCE_NOT_ANCESTOR'); }
        const differences = git('diff', '--name-only', client.sourceCommit, baseline.binding.commit).split('\n').filter(Boolean);
        requireThat(differences.every(file => toolingOnlyPaths.has(file)), 'CLIENT_PRODUCT_SOURCE_DIFFERS');
        for (const key of ['sourceReceipt', 'buildReceipt', 'runtimeReceipt', 'installReceipt', 'behaviorReceipt']) receipt(client[key], key,
          { subject: account.subject, client: client.id, sourceCommit: client.sourceCommit, build: client.build, runtime: client.runtime, platform: client.platform, behavior: client.behavior });
        requireThat(client.behavior === 'Exact-source disposable post-migration Studio/Audience tests passed; installed client verified pre-cutover truthful failure', 'CLIENT_BEHAVIOR_UNVERIFIED');
      }
    }
  }
  const pause = evidence.pause;
  requireThat(pause?.scope === 'All Studio/Audience creation, review, writes and deletes, storage, privileged automation, eligibility and role changes, account reactivation, new installs and offline client resumption', 'PAUSE_SCOPE_INCOMPLETE');
  requireThat(time(pause.startedAt) <= time(baseline.capturedAt) && time(pause.startedAt) <= now
    && time(pause.expiresAt) > now && time(pause.expiresAt) - time(pause.startedAt) <= 15 * 60_000, 'PAUSE_NOT_BOUNDED_ACTIVE');
  exactSet(pause.subjects, subjects, 'PAUSE_COVERAGE_MISMATCH');
  receipt(pause.receipt, 'pause', { scope: pause.scope, subjects: pause.subjects, startedAt: pause.startedAt, expiresAt: pause.expiresAt });
  const current = capture(project);
  requireThat(fingerprint(current.binding) === fingerprint(baseline.binding), 'LIVE_OR_CHECKOUT_CHANGED');
  for (const timestamp of freshness) fresh(timestamp, Date.now());
  requireThat(time(pause.expiresAt) > Date.now() + 60_000, 'PAUSE_EXPIRING');
  // No output file is opened until every check, including the final live read, passes.
  const payload = fs.readFileSync(path.join(root, migration));
  requireThat(hash(payload) === baseline.binding.migrationSha256, 'PAYLOAD_SOURCE_CHANGED');
  writeNew(output, payload);
}
try {
  const [command, ...args] = process.argv.slice(2);
  if (command === '--help' && args.length === 0) {
    console.log('Read docs/studio-cutover-runbook.md. Commands: capture PROJECT OUT.json | prepare PROJECT EVIDENCE.json BASELINE.json OUT.sql. Private files must be outside the checkout. No database changes are performed.');
    process.exit(0);
  }
  if (command === 'capture' && args.length === 2) {
    writeNew(args[1], JSON.stringify(capture(args[0]), null, 2));
  } else if (command === 'prepare' && args.length === 4) {
    prepare(args[1], args[2], args[3], args[0]);
  } else throw new Error('INVALID_ARGUMENTS_USE_HELP');
  console.log('Studio cutover gate completed. No database changes performed.');
} catch (error) {
  // Never echo psql errors, private paths, identities, evidence or credentials.
  const safe = /^[A-Z_]+$/.test(error.message) ? error.message : 'INPUT_OR_CAPTURE_FAILED';
  console.error(`Studio cutover gate blocked: ${safe}. No new payload authorized.`);
  process.exitCode = 1;
}
