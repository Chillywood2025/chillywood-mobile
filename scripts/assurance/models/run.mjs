#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { args, emit, redact, stableJson } from "../lib.mjs";
import { runDeterministicInterleavings } from "../../../_lib/assurance/state-models/concurrency.mjs";
import { higherTierBlockers, modelDefinitions } from "../../../_lib/assurance/state-models/models.mjs";
import { runEscapedDefectChecks, runPropertyModels } from "../../../_lib/assurance/state-models/properties.mjs";

const options = args();
const suite = options.suite ?? "all";
const allowedSuites = new Set(["all", "property", "concurrency", "escaped-defects"]);
const propertySuites = new Set(["all", "property"]);
const safeIdentity = (value) => {
  const text = typeof value === "string" ? value : null;
  return text && text.length <= 128 && /^[A-Za-z0-9_.:-]+$/u.test(text) ? text : null;
};
const requestIdentity = {
  suite: safeIdentity(suite),
  domain: typeof options.domain === "string" && Object.hasOwn(modelDefinitions, options.domain) ? options.domain : null,
  seed: safeIdentity(options.seed),
  path: safeIdentity(options.path)
};
const invalidIdentityOption = ["domain", "seed", "path"].find((key) => options[key] !== undefined && (typeof options[key] !== "string" || options[key].length === 0));
const unknownDomainOption = typeof options.domain === "string" && options.domain.length > 0 && !Object.hasOwn(modelDefinitions, options.domain);
const invalidNumber = ["numRuns", "maxCommands", "seed"].find((key) => options[key] !== undefined && (!Number.isInteger(Number(options[key])) || Number(options[key]) <= 0));
const replayFinding = options.path && !options.domain
  ? ["ASSURANCE_MODEL_REPLAY_DOMAIN_REQUIRED", options.path]
  : options.path && !["all", "property"].includes(suite)
    ? ["ASSURANCE_MODEL_REPLAY_SUITE_UNSUPPORTED", suite]
  : options.path && (!/^\d+(?::\d+)*$/u.test(String(options.path)) || String(options.path).split(":").some((part) => !Number.isSafeInteger(Number(part))))
    ? ["ASSURANCE_MODEL_REPLAY_PATH_INVALID", options.path]
    : null;
const seedFinding = options.seed && !options.domain
  ? ["ASSURANCE_MODEL_SEED_DOMAIN_REQUIRED", options.seed]
  : options.seed && !propertySuites.has(suite)
    ? ["ASSURANCE_MODEL_SEED_SUITE_UNSUPPORTED", suite]
    : null;
const domainFinding = options.domain && !propertySuites.has(suite)
  ? ["ASSURANCE_MODEL_DOMAIN_SUITE_UNSUPPORTED", suite]
  : null;
if (!allowedSuites.has(suite) || (options.providerMode && options.providerMode !== "offline") || invalidIdentityOption || unknownDomainOption || invalidNumber || replayFinding || seedFinding || domainFinding) {
  const finding = !allowedSuites.has(suite)
    ? ["ASSURANCE_MODEL_SUITE_UNKNOWN", suite]
    : options.providerMode && options.providerMode !== "offline"
      ? ["ASSURANCE_MODEL_PROVIDER_MODE_FORBIDDEN", options.providerMode]
      : invalidIdentityOption
        ? ["ASSURANCE_MODEL_OPTION_VALUE_INVALID", invalidIdentityOption]
        : unknownDomainOption
          ? ["ASSURANCE_MODEL_DOMAIN_UNKNOWN", "domain"]
          : invalidNumber
            ? ["ASSURANCE_MODEL_NUMERIC_OPTION_INVALID", invalidNumber]
            : replayFinding ?? seedFinding ?? domainFinding;
  emit("assurance:state-model", false, {
    status: "BLOCKED_INTERNAL",
    requestIdentity,
    findings: [{ id: finding[0], detail: finding[1] }]
  });
} else {
  const domains = options.domain ? [options.domain] : undefined;
  const seeds = options.seed && options.domain ? { [options.domain]: Number(options.seed) } : undefined;
  const property = ["all", "property"].includes(suite)
    ? runPropertyModels({ domains, seeds, path: options.path, numRuns: options.numRuns, maxCommands: options.maxCommands })
    : null;
  const escapedDefects = ["all", "escaped-defects"].includes(suite) ? runEscapedDefectChecks() : null;
  const concurrency = ["all", "concurrency"].includes(suite) ? await runDeterministicInterleavings() : null;
  const checks = [property, escapedDefects, concurrency].filter(Boolean);
  const ok = checks.every((result) => result.ok);
  const payload = {
    status: ok ? "MODEL_CLEAR" : "BLOCKED_INTERNAL",
    proofTier: "T2_MODEL",
    property,
    escapedDefects,
    concurrency,
    requestIdentity,
    higherTierBlockers,
    deferredFindings: [{
      id: "ASSURANCE_MODEL_JOB_ROUTING_DEFERRED_PR_E",
      severity: "P2",
      status: "BLOCKED_INTERNAL",
      blocksCurrentLane: false,
      owner: "PR E",
      detail: "Impact-planner routing for model/property/concurrency jobs is intentionally deferred to PR E."
    }],
    forbiddenClaims: ["T3_INTEGRATION", "T4_NATIVE_PROVIDER", "T5_SIGNED_ARTIFACT", "T6_INSTALLED_PHYSICAL", "T7_PUBLIC_CANARY"]
  };
  if (!ok && options.replayOutput) {
    const output = path.resolve(options.replayOutput);
    try {
      fs.mkdirSync(path.dirname(output), { recursive: true, mode: 0o700 });
      fs.writeFileSync(output, `${stableJson(redact(payload), 2)}\n`, { mode: 0o600, flag: "wx" });
      payload.replayPersistence = { status: "SOURCE_CLEAR", output };
    } catch (error) {
      payload.replayPersistence = { status: "BLOCKED_INTERNAL", finding: error?.code === "EEXIST" ? "ASSURANCE_MODEL_REPLAY_OUTPUT_EXISTS" : "ASSURANCE_MODEL_REPLAY_OUTPUT_WRITE_FAILED" };
    }
  }
  emit("assurance:state-model", ok, payload, [
    `assurance state model: ${ok ? "PASS" : "FAIL"} — ${property?.propertyCases ?? 0} property cases, ${concurrency?.scheduleCount ?? 0} schedules, ${escapedDefects?.canonicalFixtureCount ?? 0} canonical + ${escapedDefects?.supplementalFixtureCount ?? 0} supplemental fixtures`
  ]);
}
