import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { evaluateHighRiskScope, validateFeatureDomainBundles } from "../../scripts/assurance/pr-scope-lib.mjs";

const root = fileURLToPath(new URL("../..", import.meta.url));
const policy = JSON.parse(fs.readFileSync(`${root}/config/assurance/pr-scope-policy-v1.json`, "utf8"));
const registry = JSON.parse(fs.readFileSync(`${root}/config/assurance/feature-registry-v1.json`, "utf8"));
const registeredFeatureIds = registry.features.map(({ featureId }) => featureId);
const policyHighRiskDomains = policy.domains.filter(({ risk }) => risk === "high").map(({ id }) => id);

const evaluate = ({
  highRiskDomains,
  objectiveDomains = highRiskDomains,
  featureId,
  waiver = null
}) => evaluateHighRiskScope({
  highRiskDomains,
  objectiveDomains,
  featureId,
  featureDomainBundles: policy.featureDomainBundles,
  registeredFeatureIds,
  policyHighRiskDomains,
  waiver
});

const finding = (result, id) => result.findings.find((entry) => entry.id === id);

test("policy bundles reference registered features and known high-risk domains", () => {
  assert.deepEqual(validateFeatureDomainBundles({
    featureDomainBundles: policy.featureDomainBundles,
    registeredFeatureIds,
    policyHighRiskDomains
  }), []);
});

test("policy validation rejects a universal high-risk bundle", () => {
  const findings = validateFeatureDomainBundles({
    featureDomainBundles: [{
      featureId: "livekit-media-transport",
      allowedHighRiskDomains: policyHighRiskDomains
    }],
    registeredFeatureIds,
    policyHighRiskDomains
  });
  assert.equal(findings[0].id, "ASSURANCE_SCOPE_POLICY_INVALID");
  assert.equal(findings[0].universalBundle, true);
});

test("LiveKit source binding may bind Cognitive and database source under its registered feature", () => {
  const result = evaluate({
    highRiskDomains: ["Cognitive", "database-RLS"],
    featureId: "livekit-media-transport"
  });
  assert.equal(result.relatedHighRiskScopeAuthorized, true);
  assert.deepEqual(result.findings, []);
});

test("RevenueCat reconciliation may bind provider and database source under its registered feature", () => {
  const result = evaluate({
    highRiskDomains: ["RevenueCat-Premium", "database-RLS"],
    featureId: "revenuecat-premium"
  });
  assert.equal(result.relatedHighRiskScopeAuthorized, true);
  assert.deepEqual(result.findings, []);
});

test("PR52-like LiveKit, RevenueCat, and database scope remains mixed", () => {
  const result = evaluate({
    highRiskDomains: ["Cognitive", "RevenueCat-Premium", "database-RLS"],
    featureId: "livekit-media-transport"
  });
  assert.equal(result.relatedHighRiskScopeAuthorized, false);
  assert.equal(finding(result, "ASSURANCE_MIXED_HIGH_RISK_SCOPE").reason, "domain-outside-feature-bundle");
  assert.deepEqual(finding(result, "ASSURANCE_MIXED_HIGH_RISK_SCOPE").outsideBundle, ["RevenueCat-Premium"]);
});

test("an objective domain list cannot self-authorize multiple high-risk domains", () => {
  const result = evaluate({
    highRiskDomains: ["Cognitive", "database-RLS"]
  });
  assert.equal(result.relatedHighRiskScopeAuthorized, false);
  assert.equal(finding(result, "ASSURANCE_MIXED_HIGH_RISK_SCOPE").reason, "explicit-feature-required");
});

test("an unknown feature cannot authorize multiple high-risk domains", () => {
  const result = evaluate({
    highRiskDomains: ["Cognitive", "database-RLS"],
    featureId: "unregistered-feature"
  });
  assert.equal(result.relatedHighRiskScopeAuthorized, false);
  assert.equal(finding(result, "ASSURANCE_MIXED_HIGH_RISK_SCOPE").reason, "feature-not-registered");
});

test("a registered feature without a compact bundle cannot authorize multiple high-risk domains", () => {
  const result = evaluate({
    highRiskDomains: ["Cognitive", "database-RLS"],
    featureId: "supabase-migrations-rls"
  });
  assert.equal(result.relatedHighRiskScopeAuthorized, false);
  assert.equal(finding(result, "ASSURANCE_MIXED_HIGH_RISK_SCOPE").reason, "feature-bundle-not-declared");
});

test("registered bundle does not excuse an objective omission", () => {
  const result = evaluate({
    highRiskDomains: ["RevenueCat-Premium", "database-RLS"],
    objectiveDomains: ["RevenueCat-Premium"],
    featureId: "revenuecat-premium"
  });
  assert.equal(result.relatedHighRiskScopeAuthorized, true);
  assert.deepEqual(finding(result, "ASSURANCE_OBJECTIVE_OMITS_AFFECTED_DOMAIN").domains, ["database-RLS"]);
});

test("a scope waiver cannot suppress unrelated mixed high-risk scope", () => {
  const result = evaluate({
    highRiskDomains: ["Cognitive", "RevenueCat-Premium", "database-RLS"],
    featureId: "livekit-media-transport",
    waiver: {
      contractId: "attempted-mixed-scope-waiver",
      reviewer: "independent-reviewer",
      secondHighRiskDomain: false
    }
  });
  assert.equal(result.scopeWaiverAuthorizesMixedRisk, false);
  assert.ok(finding(result, "ASSURANCE_MIXED_HIGH_RISK_SCOPE"));
});
