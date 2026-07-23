import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");
const migration = read(
  "supabase/migrations/20260723203512_cognitive_two_party_activation_handoff.sql",
);
const dbTest = read("supabase/tests/cognitive_two_party_activation_handoff_test.sql");
const constitution = JSON.parse(
  read("config/intelligence/product-experience-constitution.json"),
);

const failures = [];
const assert = (condition, message) => {
  if (!condition) failures.push(message);
};
const contains = (needle, message) => assert(migration.includes(needle), message);

for (const switchKey of [
  "cognitive_livekit_experience_sentinel_enabled",
  "cognitive_visual_experience_sentinel_enabled",
  "cognitive_installed_journey_sentinel_enabled",
]) {
  contains(switchKey, `missing sentinel switch: ${switchKey}`);
}
for (const tableName of [
  "product_experience_baseline_versions",
  "product_experience_sentinel_runs",
  "product_quality_findings",
]) {
  contains(`create table public.${tableName}`, `missing sentinel table: ${tableName}`);
}
contains(
  "create function public.product_experience_record_sentinel_run",
  "missing service-only sentinel run RPC",
);
contains(
  "create function public.product_quality_record_finding",
  "missing service-only product finding RPC",
);
contains(
  "p_service_identity <> p_sentinel_key",
  "sentinel run RPC does not bind service identity to sentinel key",
);
contains(
  "public.governance_task_writes_allowed",
  "sentinel RPCs do not check emergency/task liveness",
);
contains(
  "p_result_status in ('passed','finding_created')",
  "sentinel RPC does not bind pass/finding status to installed proof",
);
contains(
  "tokenRequested','tokenReturned','websocketConnected'",
  "LiveKit sentinel RPC does not require staged LiveKit evidence",
);
contains(
  "'tokenIssuedElapsedMs','roomConnectElapsedMs'",
  "LiveKit sentinel RPC does not require bounded timing evidence",
);
contains(
  "(p_metric_manifest->>'tokenIssuedElapsedMs')::numeric between 0 and 3000",
  "LiveKit sentinel RPC does not enforce the token issuance deadline",
);
contains(
  "(p_metric_manifest->>'roomConnectElapsedMs')::numeric between 0 and 12000",
  "LiveKit sentinel RPC does not enforce the room connection deadline",
);
contains(
  "(p_metric_manifest->>'uiStateResolutionElapsedMs')::numeric between 0 and 15000",
  "LiveKit sentinel RPC does not enforce the installed UI resolution deadline",
);
contains(
  "(p_metric_manifest->>'firstRemoteMediaElapsedMs')::numeric between 0 and 20000",
  "LiveKit sentinel RPC does not enforce the remote media deadline",
);
contains(
  "(p_metric_manifest->>'tokenIssuedElapsedMs')::numeric not between 0 and 600000",
  "LiveKit sentinel findings do not cap persisted timing evidence",
);
contains(
  "jsonb_typeof(p_metric_manifest->'tokenReturned') <> 'boolean'",
  "LiveKit sentinel evidence does not enforce boolean metric types",
);
contains(
  "'baselineState','baselineComparisonHash'",
  "visual sentinel evidence does not require baseline state and comparison hash",
);
contains(
  "(p_metric_manifest->>'cardViewportWidthRatio')::numeric not between 0 and 2",
  "visual sentinel evidence does not bound card viewport ratio",
);
contains(
  "(p_metric_manifest->>'densityScore')::numeric not between 0 and 1",
  "visual sentinel evidence does not bound density score",
);
contains(
  "(p_metric_manifest->>'baselineState') not in",
  "visual sentinel evidence does not validate baseline state",
);
contains(
  "p_result_status = 'passed'",
  "visual sentinel pass does not require an approved baseline state",
);
contains(
  "p_physical_proof_status <> run_value.physical_proof_status",
  "product finding RPC does not bind proof status to the referenced sentinel run",
);
contains(
  "'expectedState','observedState','maxDurationMs','elapsedDurationMs'",
  "installed journey sentinel does not require bounded state and duration evidence",
);
contains(
  "(p_metric_manifest->>'resultState') not in",
  "installed journey sentinel does not validate result state values",
);
contains(
  "(p_metric_manifest->>'maxDurationMs')::integer not between 1 and 10000",
  "installed journey sentinel does not cap caller-supplied per-step duration",
);
contains(
  "not run_value.evidence_manifest_hash = any(p_evidence_hashes)",
  "product finding RPC does not require the referenced sentinel evidence hash",
);
assert(
  dbTest.includes("installed journey sentinel rejects missing expected/observed state and duration evidence"),
  "database suite does not reject incomplete installed-journey evidence",
);
assert(
  dbTest.includes("LiveKit sentinel pass rejects missing bounded timing evidence"),
  "database suite does not reject LiveKit passes without bounded timing proof",
);
assert(
  dbTest.includes("LiveKit sentinel pass rejects constitution deadline violations"),
  "database suite does not reject LiveKit passes that violate timing deadlines",
);
assert(
  dbTest.includes("LiveKit sentinel finding rejects unbounded timing evidence"),
  "database suite does not reject LiveKit findings with unbounded timing evidence",
);
assert(
  dbTest.includes("visual sentinel rejects unbounded metric, hash, and aspect-ratio evidence"),
  "database suite does not reject malformed visual metric evidence",
);
assert(
  dbTest.includes("visual sentinel accepts bounded baseline-review finding evidence"),
  "database suite does not accept bounded visual baseline-review evidence",
);
assert(
  dbTest.includes("installed journey sentinel pass rejects caller-overstated timing limits"),
  "database suite does not reject installed-journey passes with overstated duration limits",
);
assert(
  dbTest.includes("installed journey sentinel accepts bounded expected/observed state evidence"),
  "database suite does not accept complete installed-journey evidence",
);
assert(
  migration.includes("product_experience_sentinel_runs_retention_idx") &&
    migration.includes("product_quality_findings_retention_idx"),
  "sentinel and finding evidence lack retention indexes",
);
contains(
  "entered_collective_governance",
  "product findings do not enter collective governance",
);
contains(
  "new_binary_or_ota_required",
  "sentinel evidence does not preserve new-binary/OTA blocker status",
);
assert(
  constitution.status === "needs_product_baseline_review",
  "constitution must not silently approve the current visual baseline",
);
assert(
  constitution.ownerApprovalVersion === "not_approved_yet",
  "constitution must not fabricate Owner baseline approval",
);
for (const section of [
  "mobileFirstPrinciples",
  "streamingContentDensity",
  "routeCompletionExpectations",
  "loadingStateDeadlines",
  "cardMetrics",
  "breakpoints",
  "screenshotProvenance",
]) {
  assert(section in constitution, `missing constitution section: ${section}`);
}

const classifyLiveKit = (metrics) => {
  if (
    metrics.backendTokenState === "healthy" &&
    metrics.roomConnected === true &&
    metrics.uiState === "connecting" &&
    metrics.firstRemoteMediaMs === null
  ) {
    return {
      reproductionState: "likely_defect",
      suspectedLayer: "installed_ui_state",
    };
  }
  return { reproductionState: "unproven_hypothesis", suspectedLayer: "unknown" };
};

const classifyVisual = (metrics) => {
  const max = constitution.cardMetrics.maximumCardViewportWidthRatio.phone;
  if (metrics.cardViewportWidthRatio > max) {
    return {
      reproductionState: constitution.status === "needs_product_baseline_review"
        ? "design_baseline_missing"
        : "likely_defect",
      suspectedLayer: "layout_density",
    };
  }
  return { reproductionState: "false_positive", suspectedLayer: "unknown" };
};

const classifyJourney = (metrics) => {
  const maxMs = constitution.loadingStateDeadlines.defaultRouteResolutionMs;
  if (metrics.loadingStateMs > maxMs && metrics.resultState !== "success") {
    return {
      reproductionState: "likely_defect",
      suspectedLayer: "loading_state",
    };
  }
  return { reproductionState: "false_positive", suspectedLayer: "unknown" };
};

assert(
  classifyLiveKit({
    backendTokenState: "healthy",
    roomConnected: true,
    uiState: "connecting",
    firstRemoteMediaMs: null,
  }).suspectedLayer === "installed_ui_state",
  "LiveKit fixture does not distinguish backend health from installed UI state",
);
assert(
  classifyVisual({ cardViewportWidthRatio: 0.94 }).reproductionState ===
    "design_baseline_missing",
  "visual fixture does not require baseline review before redesign authority",
);
assert(
  classifyJourney({ loadingStateMs: 20000, resultState: "loading" }).suspectedLayer ===
    "loading_state",
  "journey fixture does not classify unresolved loading states",
);

if (failures.length > 0) {
  console.error("cognitive product sentinel contract failed");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("cognitive product sentinel contract passed");
