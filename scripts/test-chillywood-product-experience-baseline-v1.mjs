import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");
const baseline = JSON.parse(
  read("config/intelligence/chillywood-product-experience-baseline-v1.json"),
);
const options = JSON.parse(
  read("config/intelligence/product-experience-baseline-options-v1.json"),
);
const constitution = JSON.parse(
  read("config/intelligence/product-experience-constitution.json"),
);
const contractBindingMigration = read(
  "supabase/migrations/20260724093000_cognitive_product_baseline_contract_binding.sql",
);

const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalize(entry)]),
  );
};
const sha256 = (value) =>
  crypto.createHash("sha256").update(value).digest("hex");
const canonicalHash = (value) =>
  sha256(JSON.stringify(canonicalize(value)));

const optionCodes = options.options.map((option) => option.option);
assert.deepEqual(optionCodes, ["A", "B", "C"], "A/B/C history changed");
assert.equal(
  sha256(read("config/intelligence/product-experience-baseline-options-v1.json")),
  baseline.sourceOptionsManifestHash,
  "source alternatives manifest hash changed",
);
const optionC = options.options.find((option) => option.option === "C");
assert.ok(optionC, "Option C is missing");
assert.equal(baseline.baselineId, "chillywood-product-experience-baseline-v1");
assert.equal(baseline.selectedOptionCode, "C");
assert.equal(baseline.selectedOption, "creator_balanced");
assert.equal(
  baseline.status,
  "owner_selected_pending_authenticated_approval",
);
assert.equal(baseline.ownerDecision.databaseSignatureRecorded, false);
assert.equal(baseline.ownerDecision.ownerApprovalVersion, null);
assert.equal(baseline.ownerDecision.ownerImmutableUserIdReference, null);
assert.equal(
  baseline.ownerDecision.ownerIdentityBinding,
  "must be supplied by the authenticated governance approval version",
);
assert.deepEqual(
  baseline.canonicalBaselinePayload,
  {
    schemaVersion: options.schemaVersion,
    optionsVersion: options.optionsVersion,
    scope: options.scope,
    commonRequirements: options.commonRequirements,
    selectedOption: optionC,
    contractHashes: baseline.canonicalBaselinePayload.contractHashes,
  },
  "selection payload is not exact Option C",
);
assert.equal(
  canonicalHash(baseline.canonicalBaselinePayload),
  "34007790b5b8a94eac209292971a54d4ddbdca543dca01a8b184227d1d660cba",
  "Option C canonical hash changed",
);
for (const [field, value] of Object.entries({
  measurementSemantics: baseline.measurementSemantics,
  referenceViewports: baseline.referenceViewports,
  canonicalMetrics: baseline.canonicalMetrics,
  surfaceFamilies: baseline.surfaceFamilies,
  routeComponentMappings: baseline.routeComponentMappings,
  explicitExceptions: baseline.explicitExceptions,
  exceptionContracts: baseline.exceptionContracts,
  allowedVariance: baseline.allowedVariance,
  creatorAndLiveIdentity: baseline.creatorAndLiveIdentity,
  effectiveScope: baseline.effectiveScope,
})) {
  assert.equal(
    baseline.canonicalBaselinePayload.contractHashes[field],
    canonicalHash(value),
    `canonical payload does not bind ${field}`,
  );
}
for (const mapping of baseline.routeComponentMappings) {
  assert.equal(
    baseline.routeComponentMappingHashes[mapping.mappingId],
    canonicalHash(mapping),
    `mapping hash mismatch: ${mapping.mappingId}`,
  );
  assert.ok(
    contractBindingMigration.includes(
      `when '${mapping.mappingId}' then '${JSON.stringify({
        family: mapping.family,
        hash: baseline.routeComponentMappingHashes[mapping.mappingId],
        exceptionContractId: mapping.exceptionContractId,
      })}'::jsonb`,
    ),
    `database mapping allowlist mismatch: ${mapping.mappingId}`,
  );
}
for (const exception of baseline.exceptionContracts) {
  assert.equal(
    baseline.exceptionContractHashes[exception.exceptionContractId],
    canonicalHash(exception),
    `exception hash mismatch: ${exception.exceptionContractId}`,
  );
  assert.ok(
    contractBindingMigration.includes(exception.exceptionContractId) &&
      contractBindingMigration.includes(
        baseline.exceptionContractHashes[exception.exceptionContractId],
      ),
    `database exception allowlist mismatch: ${exception.exceptionContractId}`,
  );
}
assert.equal(
  baseline.baselineHash,
  canonicalHash(baseline.canonicalBaselinePayload),
  "baseline hash does not bind the canonical Option C payload",
);

const phone = baseline.canonicalMetrics.phonePortraitStandardStreamingMedia;
assert.deepEqual(
  phone,
  {
    mediaFrameWidth: 252,
    mediaFrameHeight: 142,
    mediaAspectRatio: "16:9",
    horizontalMargin: 16,
    horizontalGap: 12,
    verticalRowGap: 20,
    expectedCardsVisibleAboveFold: { minimum: 3, maximum: 4 },
    horizontalCardsVisiblePerRow: 1.42,
    maximumTitleLines: 2,
    maximumMetadataLines: 2,
  },
  "phone Option C metrics changed",
);
const tablet = baseline.canonicalMetrics.tabletPortraitStandardStreamingMedia;
assert.deepEqual(
  tablet,
  {
    mediaFrameWidth: 307,
    mediaFrameHeight: 173,
    mediaAspectRatio: "16:9",
    columns: 3,
    horizontalMargin: 32,
    columnGap: 20,
    rowGap: 24,
    expectedCardsVisibleAboveFold: { minimum: 6, maximum: 9 },
    maximumTitleLines: 2,
    maximumMetadataLines: 2,
  },
  "tablet Option C metrics changed",
);
assert.deepEqual(baseline.referenceViewports, {
  phonePortrait: { width: 390, height: 844, unit: "logical" },
  tabletPortrait: { width: 1024, height: 1366, unit: "logical" },
});
assert.equal(
  baseline.measurementSemantics.mediaFrameDimensionsExcludeMetadata,
  true,
);
assert.equal(
  baseline.measurementSemantics.totalCardContainerMeasuredSeparately,
  true,
);
assert.deepEqual(baseline.measurementSemantics.platformUnits, {
  androidInteractiveTarget: "dp",
  iosInteractiveTarget: "pt",
  webInteractiveTarget: "CSS px",
  webWcag22AaMinimum: "CSS px with WCAG-defined exceptions",
});
assert.equal(
  baseline.canonicalBaselinePayload.commonRequirements
    .androidMinimumInteractiveTargetDp,
  48,
);
assert.equal(
  baseline.canonicalBaselinePayload.commonRequirements
    .iosMinimumInteractiveTargetPt,
  44,
);
assert.equal(
  baseline.canonicalBaselinePayload.commonRequirements
    .webPreferredInteractiveTargetCssPx,
  44,
);
assert.equal(
  baseline.canonicalBaselinePayload.commonRequirements
    .webWcag22AaMinimumTargetCssPx,
  24,
);

const requiredFamilies = [
  "standard_streaming_card",
  "live_streaming_card",
  "creator_streaming_card",
  "featured_hero_card",
  "vertical_post_card",
  "compact_media_list_item",
  "non_media_interactive_surface",
];
assert.deepEqual(Object.keys(baseline.surfaceFamilies), requiredFamilies);
assert.deepEqual(
  constitution.surfaceTaxonomy.requiredFamilies,
  requiredFamilies,
);
assert.equal(
  constitution.surfaceTaxonomy.routeLocalSilentOverrideAllowed,
  false,
);
for (const mapping of baseline.routeComponentMappings) {
  assert.ok(requiredFamilies.includes(mapping.family));
  const sourcePath = mapping.source.split("#", 1)[0];
  assert.ok(
    fs.existsSync(path.join(root, sourcePath)),
    `mapped source does not exist: ${sourcePath}`,
  );
  assert.ok(mapping.route && mapping.appliesTo);
}
for (const route of [
  "Home",
  "Explore",
  "Search",
  "Library",
  "Title",
  "Player",
  "PublicChannel",
  "PublicProfile",
  "Live",
  "WatchParty",
]) {
  assert.ok(
    baseline.routeComponentMappings.some((mapping) => mapping.route === route),
    `applicable route lacks a family mapping: ${route}`,
  );
}
assert.equal(
  baseline.routeComponentMappings.find((mapping) =>
    mapping.source === "app/(tabs)/index.tsx#home-hero"
  )?.family,
  "featured_hero_card",
);
assert.equal(
  baseline.surfaceFamilies.featured_hero_card
    .requiresExplicitMeasuredException,
  true,
);
assert.equal(
  baseline.creatorAndLiveIdentity.creatorAvatarAndNameFirstClass,
  true,
);
assert.equal(
  baseline.creatorAndLiveIdentity
    .liveBadgeViewerStateAndCreatorIdentityVisible,
  true,
);
assert.equal(
  baseline.creatorAndLiveIdentity.liveIndicatorsMayReduceInteractiveTarget,
  false,
);
assert.equal(baseline.amendmentProcedure.rewriteThisRecord, false);
assert.equal(baseline.amendmentProcedure.requiresNewVersion, true);
assert.equal(constitution.amendmentPolicy.silentRewriteAllowed, false);
assert.equal(constitution.status, baseline.status);
assert.equal(constitution.ownerApprovalVersion, null);
assert.equal(constitution.approvedBaselineHash, null);
assert.equal(constitution.selectedBaselineHash, baseline.baselineHash);
assert.equal(constitution.selectedOption, "creator_balanced");

const platformTarget = {
  android: { minimum: 48, unit: "dp" },
  ios: { minimum: 44, unit: "pt" },
  web: { minimum: 44, unit: "css_px" },
};
const optionCTargetFamilies = new Set([
  "standard_streaming_card",
  "live_streaming_card",
  "creator_streaming_card",
]);
const classifyEvidence = (evidence, approvalState) => {
  if (evidence.automationStatus !== "observed") {
    return "automation_failure";
  }
  if (evidence.providerState === "blocked") return "provider_block";
  if (evidence.contentState === "absent") return "content_data_absence";
  if (
    approvalState !== "owner_approved" ||
    evidence.baselineHash !== baseline.baselineHash
  ) {
    return "baseline_ambiguity";
  }
  if (!requiredFamilies.includes(evidence.surfaceFamily)) {
    return "baseline_ambiguity";
  }
  if (!optionCTargetFamilies.has(evidence.surfaceFamily)) {
    return evidence.exceptionVersioned
      ? "route_specific_exception"
      : "baseline_ambiguity";
  }
  const target = platformTarget[evidence.platform];
  if (!target || evidence.touchTargetUnit !== target.unit) {
    return "baseline_ambiguity";
  }
  if (
    evidence.interactiveTargetWidth < target.minimum ||
    evidence.interactiveTargetHeight < target.minimum
  ) {
    return "accessibility_violation";
  }
  const reference = evidence.deviceClass === "tablet"
    ? tablet
    : phone;
  const dimensionTolerance =
    baseline.allowedVariance.referenceMediaDimensionLogicalUnits;
  const layoutViolation =
    Math.abs(evidence.mediaFrameWidth - reference.mediaFrameWidth) >
      dimensionTolerance ||
    Math.abs(evidence.mediaFrameHeight - reference.mediaFrameHeight) >
      dimensionTolerance ||
    evidence.aspectRatio !== "16:9" ||
    evidence.titleLineCount > 2 ||
    evidence.metadataLineCount > 2 ||
    !evidence.creatorIdentityVisible ||
    (
      evidence.surfaceFamily === "live_streaming_card" &&
      !evidence.liveStateVisible
    );
  return layoutViolation
    ? "confirmed_baseline_violation"
    : "false_positive";
};

const healthyAndroidEvidence = {
  automationStatus: "observed",
  providerState: "healthy",
  contentState: "present",
  baselineHash: baseline.baselineHash,
  surfaceFamily: "standard_streaming_card",
  platform: "android",
  touchTargetUnit: "dp",
  interactiveTargetWidth: 48,
  interactiveTargetHeight: 48,
  deviceClass: "phone",
  mediaFrameWidth: 252,
  mediaFrameHeight: 142,
  aspectRatio: "16:9",
  titleLineCount: 2,
  metadataLineCount: 2,
  creatorIdentityVisible: true,
  liveStateVisible: false,
};
assert.equal(
  classifyEvidence(healthyAndroidEvidence, "owner_approved"),
  "false_positive",
);
assert.equal(
  classifyEvidence(
    { ...healthyAndroidEvidence, mediaFrameWidth: 300 },
    "owner_approved",
  ),
  "confirmed_baseline_violation",
);
assert.equal(
  classifyEvidence(
    {
      ...healthyAndroidEvidence,
      interactiveTargetHeight: 23.24,
    },
    "owner_approved",
  ),
  "accessibility_violation",
);
assert.equal(
  classifyEvidence(
    {
      ...healthyAndroidEvidence,
      surfaceFamily: "featured_hero_card",
      exceptionVersioned: true,
    },
    "owner_approved",
  ),
  "route_specific_exception",
);
assert.equal(
  classifyEvidence(
    { ...healthyAndroidEvidence, automationStatus: "failed" },
    "owner_approved",
  ),
  "automation_failure",
);
assert.equal(
  classifyEvidence(healthyAndroidEvidence, "pending"),
  "baseline_ambiguity",
);

console.log("Chi'llywood product-experience baseline v1 contract passed");
