import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const readJson = (relativePath) =>
  JSON.parse(fs.readFileSync(path.join(repositoryRoot, relativePath), "utf8"));

const input = readJson(
  "config/intelligence/android-build84-home-main-tab-touch-target-canary-v1.json",
);
const baseline = readJson(
  "config/intelligence/chillywood-product-experience-baseline-v1.json",
);
const bindingSet = readJson(
  "config/intelligence/product-experience-objective-accessibility-surface-bindings-v1.json",
);

export const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [
        key,
        canonicalize(value[key]),
      ]),
    );
  }
  return value;
};

export const canonicalJson = (value) => JSON.stringify(canonicalize(value));

export const sha256Hex = (value) =>
  crypto.createHash("sha256").update(value).digest("hex");

const exactBinding = () => {
  const binding = bindingSet.canonicalBindingPayload.bindings.find(
    (candidate) => candidate.bindingId === input.bindingId,
  );
  if (!binding) throw new Error("reviewed_objective_binding_missing");
  if (
    binding.routeOrSurface !== input.routeOrSurface ||
    binding.objectiveAccessibilityOnly !== true ||
    binding.allowsVisualDensityComparison !== false
  ) {
    throw new Error("reviewed_objective_binding_mismatch");
  }
  return binding;
};

export const buildAndroidVisualCanary = () => {
  const binding = exactBinding();
  const exceptionHash =
    baseline.exceptionContractHashes[binding.exceptionContractId];
  if (!exceptionHash) throw new Error("reviewed_exception_contract_missing");
  if (
    input.schemaVersion !== 1 ||
    input.platform !== "android" ||
    input.environment !== "production" ||
    input.observationKind !== "touch_target" ||
    input.physicalProofStatus !== "installed_ui_observed" ||
    input.evidenceQuality !== "measured_installed" ||
    input.baselineState !== "needs_product_baseline_review" ||
    input.baselineComparisonHash !== null
  ) {
    throw new Error("reviewed_android_canary_input_mismatch");
  }

  const evidenceQualityHash = sha256Hex(canonicalJson({
    automationStatus: input.automationStatus,
    evidenceManifestHash: input.evidenceManifestHash,
    evidenceQuality: input.evidenceQuality,
    physicalProofStatus: input.physicalProofStatus,
  }));
  const sourceBuildHash = sha256Hex(input.sourceCommit);
  const runtimeIdentityHash = sha256Hex(canonicalJson({
    canaryInputId: input.canaryInputId,
    evidenceManifestHash: input.evidenceManifestHash,
    platform: input.platform,
    sourceBuildHash,
  }));

  const metrics = {
    ...input.measurement,
    platform: input.platform,
    surfaceFamily: binding.surfaceFamily,
    baselineId: bindingSet.baselineId,
    baselineVersion: 1,
    baselineState: input.baselineState,
    baselineComparisonHash: input.baselineComparisonHash,
    evidenceQuality: input.evidenceQuality,
    evidenceQualityHash,
    componentIdentityHash:
      bindingSet.canonicalBindingPayload.componentSetHash,
    routeFamilyMappingId: binding.bindingId,
    routeFamilyMappingHash: binding.bindingHash,
    automationStatus: input.automationStatus,
    providerState: input.providerState,
    contentState: input.contentState,
    exceptionVersioned: true,
    exceptionType: "non_media_surface",
    exceptionContractId: binding.exceptionContractId,
    exceptionContractHash: exceptionHash,
  };

  return canonicalize({
    sentinelKey: input.sentinelKey,
    evidenceManifestHash: input.evidenceManifestHash,
    metricManifest: {
      schemaVersion: "product-sentinel-v1",
      sanitizationVersion: "bounded-nonpersonal-v1",
      observationKind: input.observationKind,
      evidenceHashes: [input.evidenceManifestHash],
      metrics,
    },
    environment: input.environment,
    platform: input.platform,
    routeOrSurface: input.routeOrSurface,
    runtimeIdentityHash,
    sourceBuildHash,
    resultStatus: input.resultStatus,
    physicalProofStatus: input.physicalProofStatus,
  });
};

export const androidVisualCanaryProof = () => {
  const runs = [
    canonicalJson(buildAndroidVisualCanary()),
    canonicalJson(buildAndroidVisualCanary()),
    canonicalJson(buildAndroidVisualCanary()),
  ];
  return Object.freeze({
    canonicalRunsEqual: new Set(runs).size === 1,
    canonicalBytes: Buffer.byteLength(runs[0]),
    canonicalHash: sha256Hex(runs[0]),
    metricManifestHash: sha256Hex(
      canonicalJson(buildAndroidVisualCanary().metricManifest),
    ),
  });
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const proof = androidVisualCanaryProof();
  process.stdout.write(`${JSON.stringify(proof)}\n`);
}
