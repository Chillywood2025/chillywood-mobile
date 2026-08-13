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

const matchingFiniteLease = (truth, identity) => (truth?.finiteTaskLeases?.tasks ?? []).filter((lease) => lease?.implementationPr === identity.pr && lease?.implementationBranch === identity.branch);

export function deriveTaskScopeContext({
  event,
  readback,
  policy,
  registry,
  currentTruth,
  ownerAuthority = null,
  requestedFeature = null,
  requestedWaiver = null
} = {}) {
  const eventIdentity = validatePullRequestEventIdentity(event, readback);
  const findings = [...eventIdentity.findings];
  if (requestedFeature !== null) findings.push("ASSURANCE_CALLER_FEATURE_INJECTION_REJECTED");
  if (requestedWaiver !== null) findings.push("ASSURANCE_CALLER_WAIVER_INJECTION_REJECTED");
  if (!eventIdentity.ok) return { ok: false, findings: uniqueSorted(findings), source: "UNBOUND_PR_CONTEXT" };
  const identity = eventIdentity.identity;
  const bindings = (policy?.taskContextBindings ?? []).filter((binding) => exactBinding(binding, identity));
  if (bindings.length !== 1) findings.push("ASSURANCE_TASK_CONTEXT_UNBOUND");
  const binding = bindings[0] ?? null;
  const registryFeatures = new Set((registry?.features ?? []).map(({ featureId }) => featureId));
  if (binding && !registryFeatures.has(binding.featureId)) findings.push("ASSURANCE_TASK_FEATURE_UNREGISTERED");

  let source = "UNBOUND_PR_CONTEXT";
  let finiteLease = null;
  const finiteLeases = matchingFiniteLease(currentTruth, identity);
  if (finiteLeases.length > 1) findings.push("ASSURANCE_TASK_CONTEXT_AMBIGUOUS_LEASE");
  else if (finiteLeases.length === 1) {
    finiteLease = finiteLeases[0];
    source = "ACTIVE_FINITE_TASK_LEASE";
    if (finiteLease.featureId !== binding?.featureId || binding?.authoritySource !== "ACTIVE_FINITE_TASK_LEASE") findings.push("ASSURANCE_TASK_FEATURE_MISMATCH");
  } else if (binding?.authoritySource === "OWNER_DOCTRINE_BOOTSTRAP") {
    source = "IMMUTABLE_DOCTRINE_OWNER_AUTHORIZATION";
    if (ownerAuthority?.ok !== true || ownerAuthority?.repository !== identity.repository || ownerAuthority?.pr !== identity.pr || ownerAuthority?.branch !== identity.branch || ownerAuthority?.currentHead !== identity.headSha) findings.push("ASSURANCE_DOCTRINE_OWNER_AUTHORITY_INVALID");
  } else if (binding?.authoritySource === "PROTECTED_TASK_REGISTRY") {
    source = "PROTECTED_TASK_REGISTRY";
  } else if (binding) {
    findings.push("ASSURANCE_TASK_AUTHORITY_SOURCE_INVALID");
  }

  const objectiveDomains = uniqueSorted(binding?.objectiveDomains ?? []);
  const supportingDomains = uniqueSorted(binding?.supportingDomains ?? []);
  const knownDomains = new Set((policy?.domains ?? []).map(({ id }) => id));
  if ([...objectiveDomains, ...supportingDomains].some((domain) => !knownDomains.has(domain))) findings.push("ASSURANCE_TASK_CONTEXT_DOMAIN_UNKNOWN");
  const waiverPath = binding?.historicalWaiverPath ?? null;
  if (waiverPath && binding?.authoritySource !== "PROTECTED_TASK_REGISTRY") findings.push("ASSURANCE_TASK_WAIVER_CONTEXT_INVALID");

  return {
    ok: findings.length === 0,
    findings: uniqueSorted(findings),
    source,
    identity,
    featureId: binding?.featureId ?? null,
    objectiveDomains,
    supportingDomains,
    historicalWaiverPath: waiverPath,
    bindingId: binding?.bindingId ?? null,
    finiteLeaseId: finiteLease?.leaseId ?? null,
    budget: ownerAuthority?.ok === true && binding?.authoritySource === "OWNER_DOCTRINE_BOOTSTRAP" ? ownerAuthority.budget : null
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
