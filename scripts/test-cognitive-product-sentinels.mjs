import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");
const migration = read(
  "supabase/migrations/20260723203512_cognitive_two_party_activation_handoff.sql",
);
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
