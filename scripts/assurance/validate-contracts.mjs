#!/usr/bin/env node
import { args, emit, featureRequired, proofTierApplicabilityPolicies, proofTierCompletionFactAuthorities, proofTierCompletionFeatureApplicability, readJson, requiredKeys, tierIds, validateProofTierStatuses } from "./lib.mjs";
import { validateStructuredBinding } from "./active-task.mjs";
import { readBootstrapMergeIdentity, validateGithubMainRulesetReadback } from "./github-main-ruleset-readback.mjs";
import { jsonSchemaConstEqual, resolveLocalJsonPointer } from "./json-schema-ref.mjs";

const options = args();
const schemas = readJson("config/assurance/schemas-v1.json");
const contracts = [
  ["config/assurance/gate-catalog-v1.json", "gateCatalog"],
  ["config/assurance/proof-strength-v1.json", "proofStrength"],
  ["config/assurance/proof-substitution-denylist-v1.json", "proofSubstitutionDenylist"],
  ["config/assurance/pr-scope-policy-v1.json", "prScopePolicy"],
  ["config/assurance/review-contract-v1.json", "reviewContract"],
  ["config/assurance/codex-review-exact-head-v1.json", "codexReviewExactHeadContract"],
  ["config/assurance/a1-owner-bootstrap-authorization-v1.json", "a1OwnerBootstrapAuthorizationReceipt"],
  ["config/assurance/a1-owner-final-carrier-binding-v1.json", "a1OwnerFinalCarrierBindingReceipt"],
  ["config/assurance/a1-owner-final-carrier-github-readback-v1.json", "a1OwnerFinalCarrierGithubReadback"],
  ["config/assurance/a1-bootstrap-phase1-github-readback-v1.json", "a1BootstrapPhase1GithubReadback"],
  ["config/assurance/github-main-ruleset-codex-review-v1.json", "githubMainRulesetReadbackContract"],
  ["config/assurance/external-evidence-receipt-v1.json", "externalEvidenceReceiptContract"],
  ["config/assurance/test-impact-map-v1.json", "testImpactMap"],
  ["config/assurance/current-truth-contract-v1.json", "currentTruthContract"],
  ["config/assurance/current-truth-v1.json", "currentTruthRecord"],
  ["config/assurance/physical-golden-matrix-v1.json", "physicalGoldenMatrix"],
  ["config/assurance/escaped-defect-catalog-v1.json", "escapedDefectCatalog"],
  ["config/assurance/feature-registry-v1.json", "featureRegistry"],
  ["config/assurance/pr-a-scope-waiver-v1.json", "scopeWaiver"],
  ["config/assurance/efficiency-e0-v1.json", "scopeWaiver"],
  ["config/assurance/codex-security-reliability-s0-scope-waiver-v1.json", "scopeWaiver"],
  ["config/assurance/command-allowlist-v1.json", "commandAllowlist"],
  ["config/assurance/evidence-index-v1.json", "evidenceIndex"],
  ["config/assurance/review-history-v1.json", "reviewHistory"],
  ["docs/assurance/e0-benchmark-v1.json", "efficiencyBenchmark"],
  ["config/assurance/dogfood-pr-a-v1.json", "dogfood"]
  , ["config/assurance/codex-security-reliability-s0-v1.json", "codexSecurityReliabilityContract"]
  , ["config/assurance/codex-security-scan-incidents-v1.json", "codexSecurityIncidentLedger"]
];

function validate(value, schema, at, errors, resolving = new Set()) {
  if (!schema || typeof schema !== "object") {
    errors.push(`${at} schema unavailable`);
    return;
  }
  if (schema.$ref) {
    if (resolving.has(schema.$ref)) {
      errors.push(`${at} cyclic schema ref ${schema.$ref}`);
      return;
    }
    const resolved = resolveLocalJsonPointer(schemas, schema.$ref);
    if (!resolved) {
      errors.push(`${at} unresolved schema ref ${schema.$ref}`);
      return;
    }
    const nextResolving = new Set(resolving);
    nextResolving.add(schema.$ref);
    return validate(value, resolved, at, errors, nextResolving);
  }
  for (const member of schema.allOf ?? []) validate(value, member, at, errors, resolving);
  if (schema.const !== undefined && !jsonSchemaConstEqual(value, schema.const)) errors.push(`${at} must equal ${JSON.stringify(schema.const)}`);
  if (schema.enum && !schema.enum.includes(value)) errors.push(`${at} must be one of ${schema.enum.join(",")}`);
  if (schema.type === "object" && (!value || typeof value !== "object" || Array.isArray(value))) errors.push(`${at} must be object`);
  if (schema.type === "array" && !Array.isArray(value)) errors.push(`${at} must be array`);
  if (schema.type === "string" && typeof value !== "string") errors.push(`${at} must be string`);
  if (schema.type === "boolean" && typeof value !== "boolean") errors.push(`${at} must be boolean`);
  if (schema.type === "number" && typeof value !== "number") errors.push(`${at} must be number`);
  if (schema.pattern && typeof value === "string" && !(new RegExp(schema.pattern, "u")).test(value)) errors.push(`${at} pattern mismatch`);
  if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${at} exceeds ${schema.maximum}`);
  if (schema.required && value && typeof value === "object") errors.push(...requiredKeys(value, schema.required, at));
  if (schema.properties && value && typeof value === "object") {
    for (const [key, child] of Object.entries(schema.properties)) if (Object.hasOwn(value, key)) validate(value[key], child, `${at}.${key}`, errors, resolving);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${at} needs at least ${schema.minItems} items`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(`${at} allows at most ${schema.maxItems} items`);
    if (schema.uniqueItems && new Set(value.map(JSON.stringify)).size !== value.length) errors.push(`${at} items must be unique`);
    if (schema.contains) {
      const found = value.some((entry, index) => {
        const candidateErrors = [];
        validate(entry, schema.contains, `${at}[${index}]`, candidateErrors, resolving);
        return candidateErrors.length === 0;
      });
      if (!found) errors.push(`${at} does not contain required value`);
    }
    if (schema.items) value.forEach((entry, index) => validate(entry, schema.items, `${at}[${index}]`, errors, resolving));
  }
}

const errors = [];
for (const [file, definition] of contracts) {
  const value = readJson(file);
  validate(value, schemas.$defs[definition], file, errors);
  const expectedRef = `config/assurance/schemas-v1.json#/$defs/${definition}`;
  if (value.schemaRef !== expectedRef) errors.push(`${file} schemaRef must be ${expectedRef}`);
}

const gates = readJson("config/assurance/gate-catalog-v1.json");
const currentTruth = readJson("config/assurance/current-truth-v1.json");
const currentTruthContract = readJson("config/assurance/current-truth-contract-v1.json");
const proof = readJson("config/assurance/proof-strength-v1.json");
const defects = readJson("config/assurance/escaped-defect-catalog-v1.json").defects;
const registryContract = readJson("config/assurance/feature-registry-v1.json");
const registry = registryContract.features;
const githubRulesetReadback = readJson("config/assurance/github-main-ruleset-codex-review-v1.json");
const ownerAuthorizationReceipt = readJson("config/assurance/a1-owner-bootstrap-authorization-v1.json");
const ownerFinalCarrierBindingReceipt = readJson("config/assurance/a1-owner-final-carrier-binding-v1.json");
const ownerFinalCarrierGithubReadback = readJson("config/assurance/a1-owner-final-carrier-github-readback-v1.json");
const bootstrapPhase1GithubReadback = readJson("config/assurance/a1-bootstrap-phase1-github-readback-v1.json");
const bootstrapMergeIdentity = readBootstrapMergeIdentity(githubRulesetReadback.authorizedBootstrapException.mergeSha);
errors.push(...validateGithubMainRulesetReadback({ contract: githubRulesetReadback, authorizationReceipt: ownerAuthorizationReceipt, finalCarrierBindingReceipt: ownerFinalCarrierBindingReceipt, finalCarrierGithubReadback: ownerFinalCarrierGithubReadback, bootstrapPhase1GithubReadback, mergeIdentity: bootstrapMergeIdentity, freshnessMode: "STRUCTURAL" }));
errors.push(...validateStructuredBinding(currentTruth.activeTaskBinding, gates, registryContract, currentTruth.openImplementationPrs, currentTruth.latestMergedImplementationPr));
errors.push(...validateProofTierStatuses(currentTruth.activeTaskBinding, gates, registryContract).map(({ id, tier, value }) => [id, tier, value].filter((entry) => entry !== undefined).join(":")));
const applicabilityValues = Object.values(proofTierApplicabilityPolicies).flat();
if (new Set(applicabilityValues).size !== applicabilityValues.length) errors.push("proof tier applicability policy values must be unique");
const registeredFactIds = new Set(currentTruthContract.freshness.factRegistry.map(({ factId }) => factId));
for (const authority of proofTierCompletionFactAuthorities) {
  if (!registeredFactIds.has(authority.factId)) errors.push(`completion fact authority unknown fact ${authority.factId}`);
  const registeredFact = currentTruthContract.freshness.factRegistry.find(({ factId }) => factId === authority.factId);
  if (registeredFact && (registeredFact.freshnessClass !== authority.freshnessClass
    || registeredFact.authorityAllowed !== authority.authorityAllowed
    || registeredFact.platform !== authority.platform
    || registeredFact.provider !== authority.provider)) {
    errors.push(`completion fact authority metadata mismatch ${authority.factId}`);
  }
  if (!registry.some(({ featureId }) => featureId === authority.featureId)) errors.push(`completion fact authority unknown feature ${authority.featureId}`);
  if (authority.proofTiers.some((tier) => !tierIds.includes(tier))) errors.push(`completion fact authority unknown tier for ${authority.factId}`);
}
for (const [featureId, applicability] of Object.entries(proofTierCompletionFeatureApplicability)) {
  const matches = registry.filter((feature) => feature.featureId === featureId);
  if (matches.length !== 1 || JSON.stringify(matches[0].proofTierApplicability) !== JSON.stringify(applicability)) {
    errors.push(`completion feature applicability mismatch ${featureId}`);
  }
}
if (JSON.stringify(gates.gates.map(({ id }) => id)) !== JSON.stringify(tierIds)) errors.push("gate tier order mismatch");
if (JSON.stringify(proof.tiers.map(({ id }) => id)) !== JSON.stringify(tierIds)) errors.push("proof tier order mismatch");
const defectFields = ["id", "tags", "affectedDomains", "preImplementationQuestions", "requiredProofTier", "detectionRule", "testTemplate", "runtimeSignature", "rollback", "prevention", "blocks"];
defects.forEach((defect, index) => errors.push(...requiredKeys(defect, defectFields, `defects[${index}]`)));
registry.forEach((feature, index) => {
  errors.push(...requiredKeys(feature, featureRequired, `features[${index}]`));
  errors.push(...tierIds.flatMap((tier) => Object.hasOwn(feature.proofTierApplicability ?? {}, tier) ? [] : [`features[${index}] missing ${tier}`]));
  errors.push(...tierIds.flatMap((tier) => applicabilityValues.includes(feature.proofTierApplicability?.[tier]) ? [] : [`features[${index}] unknown applicability for ${tier}`]));
});
for (const [label, values] of [["defect", defects.map(({ id }) => id)], ["feature", registry.map(({ featureId }) => featureId)]]) {
  if (new Set(values).size !== values.length) errors.push(`${label} IDs must be unique`);
}

emit("assurance:validate-contracts", errors.length === 0, { contractsValidated: contracts.length, featureCount: registry.length, escapedDefectCount: defects.length, errors }, [
  `assurance contracts: ${errors.length ? "FAIL" : "PASS"} (${contracts.length} contracts, ${registry.length} features, ${defects.length} escaped defects)`
]);
