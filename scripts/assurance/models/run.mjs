#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { args, emit, stableJson } from "../lib.mjs";
import { runDeterministicInterleavings } from "../../../_lib/assurance/state-models/concurrency.mjs";
import { higherTierBlockers } from "../../../_lib/assurance/state-models/models.mjs";
import { runEscapedDefectChecks, runPropertyModels } from "../../../_lib/assurance/state-models/properties.mjs";

const options = args();
const suite = options.suite ?? "all";
const allowedSuites = new Set(["all", "property", "concurrency", "escaped-defects"]);
if (!allowedSuites.has(suite) || (options.providerMode && options.providerMode !== "offline")) {
  emit("assurance:state-model", false, {
    status: "BLOCKED_INTERNAL",
    findings: [{
      id: !allowedSuites.has(suite) ? "ASSURANCE_MODEL_SUITE_UNKNOWN" : "ASSURANCE_MODEL_PROVIDER_MODE_FORBIDDEN",
      detail: !allowedSuites.has(suite) ? suite : options.providerMode
    }]
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
    higherTierBlockers,
    forbiddenClaims: ["T3_INTEGRATION", "T4_NATIVE_PROVIDER", "T5_SIGNED_ARTIFACT", "T6_INSTALLED_PHYSICAL", "T7_PUBLIC_CANARY"]
  };
  if (!ok && options.replayOutput) {
    const output = path.resolve(options.replayOutput);
    fs.mkdirSync(path.dirname(output), { recursive: true, mode: 0o700 });
    fs.writeFileSync(output, `${stableJson(payload, 2)}\n`, { mode: 0o600 });
    payload.replayOutput = output;
  }
  emit("assurance:state-model", ok, payload, [
    `assurance state model: ${ok ? "PASS" : "FAIL"} — ${property?.propertyCases ?? 0} property cases, ${concurrency?.scheduleCount ?? 0} schedules, ${escapedDefects?.fixtureCount ?? 0} escaped-defect fixtures`
  ]);
}
