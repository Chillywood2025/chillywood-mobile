import {
  isStrictProductQualityDetectionPayload,
  isStrictProductQualityNoFindingPayload,
  isStrictProductQualityResolutionPayload,
} from "./index.ts";

const hash = (character: string): string => character.repeat(64);
const detection = () => ({
  action: "triage_detection",
  affectedComponentsHash: hash("a"),
  buildRuntimeHash: hash("b"),
  confidence: 0.95,
  evaluatorProofHash: hash("c"),
  evaluatorProofId: "8fd9a7c4-1132-4ac8-9f31-b71c2d4e5a60",
  evidenceHashes: [hash("d")],
  findingClass: "route.loading.unresolved",
  physicalProofStatus: "installed_ui_observed",
  proposedNextInvestigationHash: hash("e"),
  providerBackendStateHash: hash("f"),
  reproductionState: "confirmed_defect",
  routeOrSurface: "home",
  sentinelRunId: "71a3dc80-6b42-4f19-a872-09d5e31c4b67",
  severity: "medium",
  suspectedLayer: "loading_state",
  userImpactHash: hash("9"),
});
const resolution = () => ({
  action: "triage_resolution",
  evaluatorProofHash: hash("a"),
  evaluatorProofId: "8fd9a7c4-1132-4ac8-9f31-b71c2d4e5a60",
  findingId: "9ce6b841-2d54-4f7a-a162-c83e9501bd74",
  resolutionReasonHash: hash("b"),
  sentinelRunId: "71a3dc80-6b42-4f19-a872-09d5e31c4b67",
});
const noFinding = () => ({
  action: "triage_no_finding",
  evaluatorProofHash: hash("c"),
  evaluatorProofId: "8fd9a7c4-1132-4ac8-9f31-b71c2d4e5a60",
  sentinelRunId: "71a3dc80-6b42-4f19-a872-09d5e31c4b67",
});
const assert = (condition: boolean, message: string): void => {
  if (!condition) throw new Error(message);
};

Deno.test("triage detection accepts exact evaluated finding input", () => {
  assert(
    isStrictProductQualityDetectionPayload(detection()),
    "valid detection payload rejected",
  );
  for (
    const payload of [
      { ...detection(), extra: true },
      { ...detection(), confidence: 1.1 },
      { ...detection(), reproductionState: "unproven_hypothesis" },
      { ...detection(), evidenceHashes: [] },
      { ...detection(), findingClass: "Finding Class" },
    ]
  ) {
    assert(
      !isStrictProductQualityDetectionPayload(payload),
      "unsafe detection payload accepted",
    );
  }
});

Deno.test("triage resolution accepts exact proof-bound input", () => {
  assert(
    isStrictProductQualityResolutionPayload(resolution()),
    "valid resolution payload rejected",
  );
  assert(
    !isStrictProductQualityResolutionPayload({
      ...resolution(),
      action: "delete_finding",
    }),
    "unsupported resolution authority accepted",
  );
});

Deno.test("triage no-finding accepts only the exact proof linkage", () => {
  assert(
    isStrictProductQualityNoFindingPayload(noFinding()),
    "valid no-finding consumption payload rejected",
  );
  for (
    const payload of [
      { ...noFinding(), extra: true },
      { ...noFinding(), evaluatorProofHash: hash("C") },
      { ...noFinding(), action: "triage_detection" },
      { ...noFinding(), sentinelRunId: "not-a-uuid" },
    ]
  ) {
    assert(
      !isStrictProductQualityNoFindingPayload(payload),
      "unbound no-finding consumption payload accepted",
    );
  }
});
