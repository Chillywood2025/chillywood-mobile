#!/usr/bin/env node

import {
  buildMediaCdnRolloutPlan,
  buildRolloutFixtureRows,
  loadEligibilityHelpers,
  sanitizeMediaCdnRolloutPlan,
} from "./media-cdn-rollout-planner.mjs";

const failures = [];
const requireProof = (condition, message) => {
  if (!condition) failures.push(message);
};

const assertNoSecretLikeText = (label, value) => {
  const text = JSON.stringify(value);
  const patterns = [
    /\bAKIA[0-9A-Z]{16}\b/,
    /\bASIA[0-9A-Z]{16}\b/,
    /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\b/,
    new RegExp(`\\bX-Amz-${"Signature"}=[A-Fa-f0-9]{32,}\\b`, "i"),
    /\bpostgres(?:ql)?:\/\/[^/\s:]+:[^@\s]+@/i,
    /\b(service_role|password|secret_access_key|api_key)\b/i,
  ];
  for (const pattern of patterns) {
    requireProof(!pattern.test(text), `${label} contains secret-like text matching ${pattern}`);
  }
};

const loaded = loadEligibilityHelpers();

try {
  const oneEligibleRows = buildRolloutFixtureRows(loaded.renditionMetadata, {
    eligibleCount: 1,
    includeBlocked: false,
  });
  const oneEligiblePlan = buildMediaCdnRolloutPlan(
    oneEligibleRows,
    { maxBatchSize: 1 },
    loaded.playbackCdnEligibility,
  );
  requireProof(oneEligiblePlan.eligibleRowCount === 1, "one eligible fixture row should be eligible");
  requireProof(oneEligiblePlan.selectedBatchSize === 1, "one eligible fixture row should be selected");

  const scaleRows = buildRolloutFixtureRows(loaded.renditionMetadata, {
    eligibleCount: 1000,
    includeBlocked: true,
  });
  const deniedSourceId = "eligible-source-0003";
  const scalePlan = buildMediaCdnRolloutPlan(
    scaleRows,
    {
      maxBatchSize: 25,
      deniedSourceIds: [deniedSourceId],
    },
    loaded.playbackCdnEligibility,
  );
  const sanitizedScalePlan = sanitizeMediaCdnRolloutPlan(scalePlan);
  requireProof(scalePlan.inputRowCount === 1006, "scale fixture should include 1,000 eligible rows plus blocked fixtures");
  requireProof(scalePlan.eligibleRowCount === 999, "denied source should be excluded from 1,000 eligible rows");
  requireProof(scalePlan.selectedBatchSize === 25, "max batch cap should limit selected rows to 25");
  requireProof(scalePlan.maxBatchCapEnforced === true, "max batch cap should be marked enforced");
  requireProof(!scalePlan.selectedSourceIds.includes(deniedSourceId), "denied source should not appear in selected batch");
  requireProof(scalePlan.blockedReasonCounts.source_denied === 1, "denied row should be counted as source_denied");
  requireProof(scalePlan.blockedReasonCounts.audit_not_passed === 1, "pending audit row should be excluded");
  requireProof(scalePlan.blockedReasonCounts.private_requires_token_cdn === 1, "private row should be excluded");
  requireProof(scalePlan.blockedReasonCounts.premium_requires_token_cdn === 1, "Premium row should be excluded");
  requireProof(scalePlan.blockedReasonCounts.original_or_master_blocked === 1, "original row should be excluded");
  requireProof(scalePlan.blockedReasonCounts.moderation_not_allowed === 1, "moderation-blocked row should be excluded");
  requireProof(scalePlan.blockedReasonCounts.non_playback_prefix === 1, "wrong-prefix row should be excluded");
  requireProof(scalePlan.rollbackPlanRequired === true, "rollback plan should be required");
  requireProof(scalePlan.rollbackPlan.length === 25, "rollback plan should match selected batch size");
  requireProof(scalePlan.mutationAttempted === false, "planner should not mutate DB");
  requireProof(scalePlan.productionPlaybackSwitched === false, "planner should not switch playback");
  requireProof(scalePlan.productionBackfillRun === false, "planner should not run backfill");
  requireProof(scalePlan.continuousWorkerEnabled === false, "planner should not enable continuous worker");

  const missingCapPlan = buildMediaCdnRolloutPlan(
    oneEligibleRows,
    { maxBatchSize: 0 },
    loaded.playbackCdnEligibility,
  );
  requireProof(missingCapPlan.failures.includes("max_batch_size_required"), "planner should require max batch size");

  const unsafeRollbackTargets = scalePlan.rollbackPlan.filter((entry) => (
    !entry.exact_output_prefix.startsWith("playback/public/")
    || entry.exact_output_prefix === "playback/public"
    || entry.exact_output_prefix === "playback/public/"
    || /(?:^|\/)(private|premium|original|originals|master|masters|uploads|unscanned)(?:\/|$)/i.test(entry.exact_output_prefix)
  ));
  requireProof(unsafeRollbackTargets.length === 0, "rollback plan should stay exact and public-safe");

  assertNoSecretLikeText("sanitized rollout plan", sanitizedScalePlan);

  const summary = {
    proof: "media-cdn-rollout-planner",
    oneEligibleRowSelected: oneEligiblePlan.selectedBatchSize === 1,
    thousandEligibleFixtureRows: scaleRows.filter((row) => String(row.id).startsWith("eligible-rendition-")).length,
    maxBatchCapEnforced: scalePlan.maxBatchCapEnforced,
    deniedRowsExcluded: !scalePlan.selectedSourceIds.includes(deniedSourceId),
    unsafeRowsExcluded: (
      scalePlan.blockedReasonCounts.private_requires_token_cdn === 1
      && scalePlan.blockedReasonCounts.premium_requires_token_cdn === 1
      && scalePlan.blockedReasonCounts.original_or_master_blocked === 1
      && scalePlan.blockedReasonCounts.moderation_not_allowed === 1
      && scalePlan.blockedReasonCounts.non_playback_prefix === 1
    ),
    pendingAuditExcluded: scalePlan.blockedReasonCounts.audit_not_passed === 1,
    rollbackPlanRequired: scalePlan.rollbackPlanRequired,
    mutationAttempted: false,
    productionPlaybackSwitched: false,
    productionBackfillRun: false,
    continuousWorkerEnabled: false,
    sanitizedScalePlan,
  };
  assertNoSecretLikeText("rollout planner summary", summary);

  if (failures.length) {
    console.error("Media CDN rollout planner proof failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }

  console.log(JSON.stringify(summary, null, 2));
} finally {
  loaded.cleanup();
}
