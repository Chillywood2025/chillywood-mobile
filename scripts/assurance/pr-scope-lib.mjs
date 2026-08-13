const uniqueSorted = (values) => [...new Set(values)].sort();

const sha40 = (value) => /^[0-9a-f]{40}$/u.test(value ?? "");
const exactPullUrl = (value, repository, pr) => value === `https://github.com/${repository}/pull/${pr}`;

export function validatePullRequestEventIdentity(event, readback = {}) {
  const pull = event?.pull_request;
  const repository = event?.repository?.full_name;
  const pr = event?.number;
  const findings = [];
  if (!pull || repository !== "Chillywood2025/chillywood-mobile" || !Number.isInteger(pr) || pr < 1) findings.push("ASSURANCE_PR_EVENT_IDENTITY_INVALID");
  if (pull?.number !== pr || pull?.base?.ref !== "main" || !sha40(pull?.base?.sha) || !sha40(pull?.head?.sha) || typeof pull?.head?.ref !== "string" || !exactPullUrl(pull?.html_url, repository, pr)) findings.push("ASSURANCE_PR_EVENT_IDENTITY_INVALID");
  if (readback?.number !== pr || readback?.repository !== repository || readback?.baseRef !== pull?.base?.ref || readback?.baseSha !== pull?.base?.sha || readback?.headRef !== pull?.head?.ref || readback?.headSha !== pull?.head?.sha || readback?.htmlUrl !== pull?.html_url || readback?.state !== "open") findings.push("ASSURANCE_PR_EVENT_READBACK_MISMATCH");
  return {
    ok: findings.length === 0,
    findings: uniqueSorted(findings),
    identity: findings.length ? null : {
      repository,
      pr,
      baseRef: pull.base.ref,
      baseSha: pull.base.sha,
      branch: pull.head.ref,
      headSha: pull.head.sha,
      htmlUrl: pull.html_url
    }
  };
}

const exactBinding = (binding, identity) => binding?.repository === identity.repository
  && binding?.pr === identity.pr
  && binding?.branch === identity.branch
  && binding?.baseRef === identity.baseRef;

const historicalBindingFacts = new Map([
  ["doctrine-pr-226-v1", { pr: 226, branch: "codex/whole-app-engineering-doctrine-v1", featureId: "assurance-efficiency-e0", waiver: null }],
  ["codex-security-s0-pr-206-v1", { pr: 206, branch: "codex/assurance-codex-security-scan-reliability-s0", featureId: "codex-security-scan-reliability-s0", waiver: "config/assurance/codex-security-reliability-s0-scope-waiver-v1.json" }],
  ["d2a-pr-212-v1", { pr: 212, branch: "codex/first-pass-assurance-android-generated-native-lifecycle-instrumentation", featureId: "chilly-chat-call-lifecycle", waiver: null }],
]);

export function validateStaticBindingRecursion(policy = {}) {
  const historical = policy.historicalExactTaskBindings ?? [];
  const findings = [];
  if (Object.hasOwn(policy, "taskContextBindings")) findings.push("ASSURANCE_STATIC_TASK_BINDING_RECURSION");
  if (historical.length !== historicalBindingFacts.size
    || historical.some((binding) => {
      const expected = historicalBindingFacts.get(binding?.bindingId);
      return !expected || binding?.repository !== "Chillywood2025/chillywood-mobile" || binding?.baseRef !== "main" || binding?.authoritySource !== "PROTECTED_HISTORICAL_TASK" || binding?.pr !== expected.pr || binding?.branch !== expected.branch || binding?.featureId !== expected.featureId || (binding?.historicalWaiverPath ?? null) !== expected.waiver;
    })) findings.push("ASSURANCE_STATIC_TASK_BINDING_RECURSION");
  return uniqueSorted(findings);
}

const boundAuthority = (authority, identity) => authority?.ok === true
  && authority.repository === identity.repository
  && authority.pr === identity.pr
  && authority.branch === identity.branch
  && authority.currentHead === identity.headSha;

export function deriveTaskScopeContext({
  event,
  readback,
  policy,
  registry,
  currentTruth,
  ownerAuthority = null,
  finiteTaskAuthority = null,
  architectureAuthority = null,
  terminalTruthAuthority = null,
  protectedMainRuntime = null,
  requestedFeature = null,
  requestedWaiver = null
} = {}) {
  const eventIdentity = validatePullRequestEventIdentity(event, readback);
  const findings = [...eventIdentity.findings];
  if (requestedFeature !== null) findings.push("ASSURANCE_CALLER_FEATURE_INJECTION_REJECTED");
  if (requestedWaiver !== null) findings.push("ASSURANCE_CALLER_WAIVER_INJECTION_REJECTED");
  if (!eventIdentity.ok) return { ok: false, findings: uniqueSorted(findings), source: "UNBOUND_PR_CONTEXT" };
  const identity = eventIdentity.identity;
  findings.push(...validateStaticBindingRecursion(policy));
  const historical = (policy?.historicalExactTaskBindings ?? []).filter((binding) => exactBinding(binding, identity));
  const candidates = [];
  if (historical.length === 1) {
    const binding = historical[0];
    candidates.push({
      ...binding,
      source: binding.bindingId === "codex-security-s0-pr-206-v1" ? "PROTECTED_TASK_REGISTRY" : "PROTECTED_HISTORICAL_TASK",
      type: "PROTECTED_HISTORICAL_TASK",
      budget: binding.bindingId === "doctrine-pr-226-v1" && ownerAuthority?.ok === true ? ownerAuthority.budget : null,
    });
  }
  if (boundAuthority(finiteTaskAuthority, identity)) candidates.push({ ...finiteTaskAuthority, source: "ACTIVE_FINITE_TASK_LEASE" });
  if (boundAuthority(architectureAuthority, identity)) candidates.push({ ...architectureAuthority, source: "OWNER_ASSURANCE_ARCHITECTURE_MAINTENANCE" });
  if (boundAuthority(terminalTruthAuthority, identity)) candidates.push({ ...terminalTruthAuthority, source: "TERMINAL_TRUTH_SUCCESSOR_V1" });
  for (const attempted of [finiteTaskAuthority, architectureAuthority, terminalTruthAuthority]) if (attempted && attempted.ok !== true) findings.push(...(attempted.findings ?? []));
  if (candidates.length === 0) findings.push("ASSURANCE_TASK_CONTEXT_UNBOUND");
  if (candidates.length > 1 || historical.length > 1) findings.push("ASSURANCE_TASK_CONTEXT_AMBIGUOUS");
  const selected = candidates.length === 1 ? candidates[0] : null;
  if (protectedMainRuntime?.pendingTerminalTruth === true && selected) {
    const terminalAllowed = selected.type === "TERMINAL_TRUTH_SUCCESSOR"
      && protectedMainRuntime.terminalSuccessorRequired === true
      && [1, 2].includes(protectedMainRuntime.pendingTransitionCount);
    const exactBootstrapRecovery = selected.type === "OWNER_ASSURANCE_ARCHITECTURE_MAINTENANCE"
      && protectedMainRuntime.pendingTransitionCount === 1
      && identity.pr === 227
      && identity.baseSha === "c1f9ec1f71cc8bc4448afd2327c4341cac309573"
      && architectureAuthority?.originalCommentId === 5276216820
      && architectureAuthority?.subject?.type === "OWNER_ASSURANCE_ARCHITECTURE_MAINTENANCE_SUCCESSOR_V1"
      && architectureAuthority?.subject?.reason === "shared rolling-main evaluator must support the already-required bounded terminal-truth interval";
    if (!terminalAllowed && !exactBootstrapRecovery) findings.push("CURRENT_TRUTH_PENDING_TERMINAL_SUCCESSOR_REQUIRED");
  }
  const registryFeatures = new Set((registry?.features ?? []).map(({ featureId }) => featureId));
  if (selected && !registryFeatures.has(selected.featureId)) findings.push("ASSURANCE_TASK_FEATURE_UNREGISTERED");
  if (selected?.historicalWaiverPath && selected.type !== "PROTECTED_HISTORICAL_TASK") findings.push("ASSURANCE_TASK_WAIVER_CONTEXT_INVALID");
  if (selected?.historicalWaiverPath && selected.bindingId !== "codex-security-s0-pr-206-v1") findings.push("ASSURANCE_TASK_WAIVER_CONTEXT_INVALID");

  const objectiveDomains = uniqueSorted(selected?.objectiveDomains ?? []);
  const supportingDomains = uniqueSorted(selected?.supportingDomains ?? []);
  const knownDomains = new Set((policy?.domains ?? []).map(({ id }) => id));
  if ([...objectiveDomains, ...supportingDomains].some((domain) => !knownDomains.has(domain))) findings.push("ASSURANCE_TASK_CONTEXT_DOMAIN_UNKNOWN");
  const waiverPath = selected?.historicalWaiverPath ?? null;

  return {
    ok: findings.length === 0,
    findings: uniqueSorted(findings),
    source: selected?.source ?? "UNBOUND_PR_CONTEXT",
    contextType: selected?.type ?? null,
    identity,
    featureId: selected?.featureId ?? null,
    objectiveDomains,
    supportingDomains,
    historicalWaiverPath: waiverPath,
    bindingId: selected?.bindingId ?? null,
    finiteLeaseId: selected?.finiteLeaseId ?? null,
    budget: selected?.budget ?? null,
    authoritySource: selected?.authoritySource ?? null,
  };
}

export function validateFeatureDomainBundles({
  featureDomainBundles,
  registeredFeatureIds,
  policyHighRiskDomains
}) {
  const registered = new Set(registeredFeatureIds);
  const knownDomains = new Set(policyHighRiskDomains);
  const seenFeatures = new Set();
  const findings = [];

  for (const bundle of featureDomainBundles) {
    const allowed = uniqueSorted(bundle.allowedHighRiskDomains ?? []);
    const invalidDomains = allowed.filter((domain) => !knownDomains.has(domain));
    const universalBundle = knownDomains.size > 0
      && allowed.length === knownDomains.size
      && allowed.every((domain) => knownDomains.has(domain));
    if (!bundle.featureId || seenFeatures.has(bundle.featureId) || !registered.has(bundle.featureId) || allowed.length === 0 || invalidDomains.length > 0 || universalBundle) {
      findings.push({
        id: "ASSURANCE_SCOPE_POLICY_INVALID",
        status: "BLOCKED_INTERNAL",
        featureId: bundle.featureId ?? null,
        invalidDomains,
        universalBundle
      });
    }
    if (bundle.featureId) seenFeatures.add(bundle.featureId);
  }

  return findings;
}

export function evaluateHighRiskScope({
  highRiskDomains,
  objectiveDomains,
  featureId,
  featureDomainBundles,
  registeredFeatureIds,
  policyHighRiskDomains,
  waiver = null
}) {
  const highRisk = uniqueSorted(highRiskDomains);
  const objective = new Set(objectiveDomains);
  const registered = new Set(registeredFeatureIds);
  const policyFindings = validateFeatureDomainBundles({
    featureDomainBundles,
    registeredFeatureIds,
    policyHighRiskDomains
  });
  const selectedBundle = typeof featureId === "string"
    ? featureDomainBundles.find((bundle) => bundle.featureId === featureId) ?? null
    : null;
  const allowed = new Set(selectedBundle?.allowedHighRiskDomains ?? []);
  const omitted = highRisk.filter((domain) => !objective.has(domain));
  const outsideBundle = highRisk.filter((domain) => !allowed.has(domain));
  const findings = [...policyFindings];

  if (highRisk.length > 1) {
    let reason = null;
    if (typeof featureId !== "string" || featureId.length === 0) reason = "explicit-feature-required";
    else if (!registered.has(featureId)) reason = "feature-not-registered";
    else if (!selectedBundle) reason = "feature-bundle-not-declared";
    else if (outsideBundle.length > 0) reason = "domain-outside-feature-bundle";

    if (reason) {
      findings.push({
        id: "ASSURANCE_MIXED_HIGH_RISK_SCOPE",
        status: "BLOCKED_INTERNAL",
        domains: highRisk,
        featureId: typeof featureId === "string" ? featureId : null,
        reason,
        outsideBundle
      });
    }
  }

  if (omitted.length > 0) {
    findings.push({
      id: "ASSURANCE_OBJECTIVE_OMITS_AFFECTED_DOMAIN",
      status: "BLOCKED_INTERNAL",
      domains: omitted
    });
  }

  return {
    featureId: typeof featureId === "string" ? featureId : null,
    selectedBundle: selectedBundle
      ? {
          featureId: selectedBundle.featureId,
          allowedHighRiskDomains: uniqueSorted(selectedBundle.allowedHighRiskDomains)
        }
      : null,
    highRiskDomains: highRisk,
    objectiveDomains: uniqueSorted(objectiveDomains),
    relatedHighRiskScopeAuthorized: findings.length === 0,
    decisionSource: highRisk.length > 1 ? "registered-feature-domain-bundle" : "single-or-no-high-risk-domain",
    scopeWaiverAuthorizesMixedRisk: false,
    waiverPresent: waiver !== null,
    findings
  };
}
