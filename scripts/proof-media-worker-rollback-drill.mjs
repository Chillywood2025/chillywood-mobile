#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const repoRoot = process.cwd();
const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";
const batchId = "proof-rollback-batch-city-lights-one-job";
const sourceId = "c28e3838-7d2e-4f48-a8ad-73e3100f8cf1";
const exactR2Prefix = "playback/public/proof-rollback/chillywood-city-lights/v1-b670602fa00934ca-drill/";

const failures = [];
const requireProof = (condition, message) => {
  if (!condition) failures.push(message);
};

const redactError = (value) => (
  String(value ?? "")
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "postgresql://redacted")
    .split("\n")
    .slice(0, 4)
    .join(" ")
    .trim()
);

const assertNoSecretLikeText = (label, value) => {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  const secretPatterns = [
    /\bAKIA[0-9A-Z]{16}\b/,
    /\bASIA[0-9A-Z]{16}\b/,
    /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\b/,
    /\bX-Amz-Signature=[A-Fa-f0-9]{32,}\b/i,
    /\b(password|access_key|api_key|authorization)\s*[:=]/i,
  ];
  for (const pattern of secretPatterns) {
    requireProof(!pattern.test(text), `${label} contains secret-like text matching ${pattern}`);
  }
};

const compileRecoveryHelper = () => {
  const outDir = mkdtempSync(path.join(os.tmpdir(), "chillywood-media-rollback-helper-"));
  try {
    execFileSync(
      npxCommand,
      [
        "tsc",
        "_lib/mediaRecoveryOperator.ts",
        "--target",
        "ES2020",
        "--module",
        "commonjs",
        "--moduleResolution",
        "node",
        "--outDir",
        outDir,
        "--strict",
        "--skipLibCheck",
      ],
      {
        cwd: repoRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    const requireFromHere = createRequire(import.meta.url);
    const loadCompiled = (fileName) => {
      for (const candidate of [
        path.join(outDir, fileName),
        path.join(outDir, "_lib", fileName),
      ]) {
        try {
          return requireFromHere(candidate);
        } catch {
          // Try the next compiler output layout.
        }
      }
      throw new Error(`Compiled helper ${fileName} was not found.`);
    };

    return {
      recovery: loadCompiled("mediaRecoveryOperator.js"),
      cleanup: () => rmSync(outDir, { recursive: true, force: true }),
    };
  } catch (error) {
    rmSync(outDir, { recursive: true, force: true });
    throw error;
  }
};

const buildRow = (overrides = {}) => ({
  id: overrides.id ?? "rollback-row-480p",
  batch_id: overrides.batch_id ?? batchId,
  source_id: overrides.source_id ?? sourceId,
  rendition_label: overrides.rendition_label ?? "480p",
  public_playback_path: overrides.public_playback_path ?? `${exactR2Prefix}master.m3u8`,
  manifest_path: overrides.manifest_path ?? `${exactR2Prefix}master.m3u8`,
  variant_playlist_path: overrides.variant_playlist_path ?? `${exactR2Prefix}480p/index.m3u8`,
  visibility: overrides.visibility ?? "public",
  scan_status: overrides.scan_status ?? "clean",
  moderation_status: overrides.moderation_status ?? "allowed",
  bucket_role: overrides.bucket_role ?? "public_playback",
  is_original: overrides.is_original ?? false,
  is_public_playback_safe: overrides.is_public_playback_safe ?? true,
  worker_status: overrides.worker_status ?? "pending_audit",
  resolver_ready: overrides.resolver_ready ?? false,
});

const createDrillDb = async () => {
  const embedded = await import("@electric-sql/pglite");
  const db = new embedded.PGlite();
  await db.exec(`
    create table media_renditions_drill (
      id text primary key,
      batch_id text not null,
      source_id text not null,
      public_playback_path text not null,
      visibility text not null,
      is_original boolean not null,
      worker_status text not null,
      resolver_ready boolean not null,
      rollback_status text not null default 'active'
    );
  `);
  return db;
};

const insertDrillRows = async (db, rows) => {
  for (const row of rows) {
    await db.exec(`
      insert into media_renditions_drill (
        id, batch_id, source_id, public_playback_path,
        visibility, is_original, worker_status, resolver_ready
      )
      values (
        '${row.id}',
        '${row.batch_id}',
        '${row.source_id}',
        '${row.public_playback_path}',
        '${row.visibility}',
        ${row.is_original ? "true" : "false"},
        '${row.worker_status}',
        ${row.resolver_ready ? "true" : "false"}
      );
    `);
  }
};

const queryRows = async (db) => (await db.query(`
  select id, batch_id, rollback_status, resolver_ready
  from media_renditions_drill
  order by id;
`)).rows;

const applyRollbackPlan = async (db, plan) => {
  if (!plan.allowed) throw new Error("refusing to apply denied rollback plan");
  for (const rowId of plan.affected_row_ids) {
    await db.exec(`
      update media_renditions_drill
      set rollback_status = 'quarantined',
          resolver_ready = false
      where id = '${rowId}';
    `);
  }
};

const { recovery, cleanup } = compileRecoveryHelper();

try {
  const rows = [
    buildRow({
      id: "rollback-row-360p",
      rendition_label: "360p",
      variant_playlist_path: `${exactR2Prefix}360p/index.m3u8`,
    }),
    buildRow({
      id: "rollback-row-480p",
      rendition_label: "480p",
      variant_playlist_path: `${exactR2Prefix}480p/index.m3u8`,
    }),
    buildRow({
      id: "unrelated-row",
      batch_id: "unrelated-batch",
      source_id: "unrelated-source",
      public_playback_path: "playback/public/proof-rollback/unrelated/v1/master.m3u8",
      manifest_path: "playback/public/proof-rollback/unrelated/v1/master.m3u8",
      variant_playlist_path: "playback/public/proof-rollback/unrelated/v1/480p/index.m3u8",
      worker_status: "audit_passed",
      resolver_ready: true,
    }),
  ];

  const auditPass = recovery.auditMediaRecoveryBatch({
    batchId,
    sourceId,
    expectedRowCount: 2,
    exactR2Prefix,
    rows,
  });
  const auditedRows = rows.map((row) => (
    row.batch_id === batchId ? recovery.applyMediaRecoveryAuditResult(row, auditPass) : row
  ));
  requireProof(auditPass.passed === true, "fake batch should pass audit before rollback drill");
  requireProof(
    auditedRows.filter((row) => row.batch_id === batchId).every((row) => row.worker_status === "audit_passed" && row.resolver_ready === true),
    "fake batch should model pending_audit rows becoming audited_passed before rollback",
  );

  const plan = recovery.buildMediaWorkerRollbackPlan({
    batchId,
    exactR2Prefix,
    rows: auditedRows,
    expectedRowCount: 2,
  });
  requireProof(plan.allowed === true, `scoped rollback plan should pass: ${plan.failures.join(",")}`);
  requireProof(plan.batch_id === batchId, "rollback plan should target exact batch id");
  requireProof(plan.exact_r2_prefix === exactR2Prefix, "rollback plan should target exact R2 prefix");
  requireProof(plan.affected_row_ids.length === 2, "rollback plan should affect only scoped batch rows");
  requireProof(plan.preserved_row_ids.includes("unrelated-row"), "rollback plan should preserve unrelated rows");
  requireProof(plan.delete_private_origin_media === false, "rollback plan must not delete private origin media");

  const db = await createDrillDb();
  await insertDrillRows(db, auditedRows);
  await applyRollbackPlan(db, plan);
  const rowStatus = await queryRows(db);
  const scopedStatuses = rowStatus.filter((row) => row.batch_id === batchId);
  const unrelated = rowStatus.find((row) => row.id === "unrelated-row");
  requireProof(scopedStatuses.every((row) => row.rollback_status === "quarantined" && row.resolver_ready === false), "rollback drill should quarantine only scoped rows and revoke resolver trust");
  requireProof(unrelated?.rollback_status === "active" && unrelated?.resolver_ready === true, "rollback drill should not affect unrelated rows");

  const missingBatch = recovery.buildMediaWorkerRollbackPlan({
    batchId: "missing-batch",
    exactR2Prefix,
    rows: auditedRows,
    expectedRowCount: 1,
  });
  requireProof(missingBatch.allowed === false && missingBatch.failures.includes("no_rows_for_batch"), "missing batch rollback should be denied");

  const broadPrefix = recovery.buildMediaWorkerRollbackPlan({
    batchId,
    exactR2Prefix: "playback/public/",
    rows: auditedRows,
    expectedRowCount: 2,
  });
  requireProof(broadPrefix.allowed === false && broadPrefix.failures.includes("rollback_prefix_too_broad"), "broad rollback prefix should be denied");

  const privatePremiumOriginalRows = [
    buildRow({
      id: "private-row",
      public_playback_path: "private/proof-rollback/master.m3u8",
      manifest_path: "private/proof-rollback/master.m3u8",
      visibility: "private",
    }),
    buildRow({
      id: "premium-row",
      public_playback_path: `${exactR2Prefix}premium/master.m3u8`,
      manifest_path: `${exactR2Prefix}premium/master.m3u8`,
      visibility: "premium",
    }),
    buildRow({
      id: "original-row",
      public_playback_path: `${exactR2Prefix}original/master.m3u8`,
      manifest_path: `${exactR2Prefix}original/master.m3u8`,
      rendition_label: "original",
      is_original: true,
    }),
  ];
  const unsafePlan = recovery.buildMediaWorkerRollbackPlan({
    batchId,
    exactR2Prefix,
    rows: privatePremiumOriginalRows,
    expectedRowCount: 3,
  });
  requireProof(unsafePlan.allowed === false, "private/Premium/original rollback target should be denied");
  requireProof(unsafePlan.failures.some((failure) => failure.startsWith("premium_or_private_rollback_denied")), "rollback should deny private/Premium rows");
  requireProof(unsafePlan.failures.some((failure) => failure.startsWith("original_or_master_rollback_denied")), "rollback should deny original/master rows");
  requireProof(unsafePlan.failures.some((failure) => failure.startsWith("row_path_contains_forbidden_segment") || failure.startsWith("row_path_outside_exact_prefix")), "rollback should deny unsafe path segments");

  const summary = recovery.sanitizeMediaRecoveryProof({
    proof: "media-worker-rollback-drill",
    batchId,
    exactR2Prefix,
    disposableDbUsed: true,
    scopedRollbackPlanAllowed: plan.allowed,
    affectedRowIds: plan.affected_row_ids,
    preservedRowIds: plan.preserved_row_ids,
    scopedRowsQuarantined: scopedStatuses.every((row) => row.rollback_status === "quarantined"),
    resolverTrustRevokedForScopedRows: scopedStatuses.every((row) => row.resolver_ready === false),
    unrelatedRowsUntouched: unrelated?.rollback_status === "active" && unrelated?.resolver_ready === true,
    missingBatchDenied: missingBatch.allowed === false,
    broadPrefixDenied: broadPrefix.allowed === false,
    privatePremiumOriginalDenied: unsafePlan.allowed === false,
    realR2ObjectsDeleted: false,
    productionDbTouched: false,
    productionPlaybackSwitched: false,
    noSecretsPrinted: true,
  });

  assertNoSecretLikeText("rollback proof summary", summary);

  if (failures.length > 0) {
    console.error(JSON.stringify({ ...summary, failures }, null, 2));
    process.exit(1);
  }

  console.log(JSON.stringify(summary, null, 2));
} catch (error) {
  console.error(JSON.stringify({
    proof: "media-worker-rollback-drill",
    failed: true,
    error: redactError(error?.message ?? error),
    productionDbTouched: false,
    productionPlaybackSwitched: false,
  }, null, 2));
  process.exit(1);
} finally {
  cleanup();
}
