#!/usr/bin/env node
import { args, emit, featureRequired, readJson, requiredKeys, tierIds } from "./lib.mjs";

const options = args();
const registry = readJson("config/assurance/feature-registry-v1.json");
const defects = readJson("config/assurance/escaped-defect-catalog-v1.json").defects;
const feature = registry.features.find(({ featureId }) => featureId === options.feature);
if (!feature) {
  emit("assurance:plan", false, { featureId: options.feature ?? null, findings: [{ id: "ASSURANCE_FEATURE_NOT_REGISTERED", status: "BLOCKED_INTERNAL" }] }, ["assurance plan: FAIL — use --feature=<registered feature id>"]);
} else {
  const missing = requiredKeys(feature, featureRequired, feature.featureId);
  const unknownDefects = feature.knownDefectTags.filter((id) => !defects.some((entry) => entry.id === id));
  const missingTiers = tierIds.filter((tier) => !Object.hasOwn(feature.proofTierApplicability, tier));
  const explicitlyBlocked = /BLOCKED|FUTURE/iu.test(feature.currentState)
    || feature.unresolvedBlockers.some((entry) => /must merge first|explicitly out of scope|not authorized|forbidden/iu.test(entry));
  const requirementsClear = feature.requirements.length > 0 && feature.nonGoals.length > 0 && missing.length === 0;
  const architectureClear = feature.ownerSystems.length > 0 && feature.states.length > 0 && feature.transitions.length > 0 && feature.invariants.length > 0 && unknownDefects.length === 0 && missingTiers.length === 0;
  const ok = requirementsClear && architectureClear && !explicitlyBlocked;
  const findings = [
    ...missing.map((detail) => ({ id: "ASSURANCE_MANIFEST_FIELD_MISSING", status: "BLOCKED_INTERNAL", detail })),
    ...unknownDefects.map((id) => ({ id: "ASSURANCE_UNKNOWN_DEFECT_TAG", status: "BLOCKED_INTERNAL", detail: id })),
    ...missingTiers.map((id) => ({ id: "ASSURANCE_TIER_APPLICABILITY_MISSING", status: "BLOCKED_INTERNAL", detail: id })),
    ...(explicitlyBlocked ? [{ id: "ASSURANCE_FEATURE_PREREQUISITE_BLOCKED", status: "BLOCKED_INTERNAL", detail: feature.unresolvedBlockers }] : [])
  ];
  emit("assurance:plan", ok, {
    featureId: feature.featureId,
    objective: feature.requirements,
    nonGoals: feature.nonGoals,
    risk: feature.riskLevel,
    ownerSystems: feature.ownerSystems,
    statuses: { requirements: requirementsClear ? "REQUIREMENTS_CLEAR" : "BLOCKED_INTERNAL", architecture: architectureClear ? "ARCHITECTURE_CLEAR" : "BLOCKED_INTERNAL" },
    affected: { routes: feature.routes, components: feature.components, edgeFunctions: feature.edgeFunctions, tablesRpcs: feature.tablesRpcs, nativeModulesPlugins: feature.nativeModulesPlugins, providers: feature.providers, platformScope: feature.platformScope },
    states: feature.states,
    transitions: feature.transitions,
    invariants: feature.invariants,
    knownDefectClasses: feature.knownDefectTags,
    proofTierApplicability: feature.proofTierApplicability,
    rollback: feature.rollback,
    emergencyStop: feature.emergencyStop,
    findings,
    finalPermittedNextAction: ok ? "Begin only the bounded objective after exact scope confirmation." : "Resolve the named pre-implementation blockers; do not change code."
  }, [`assurance plan ${feature.featureId}: ${ok ? "PASS" : "FAIL"} — requirements ${requirementsClear ? "clear" : "blocked"}, architecture ${architectureClear ? "clear" : "blocked"}`]);
}
