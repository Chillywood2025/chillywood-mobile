const uniqueSorted = (values) => [...new Set(values)].sort();

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
    relatedHighRiskScopeAuthorized: policyFindings.length === 0 && (
      highRisk.length <= 1 || (
        registered.has(featureId)
        && selectedBundle !== null
        && outsideBundle.length === 0
      )
    ),
    decisionSource: highRisk.length > 1 ? "registered-feature-domain-bundle" : "single-or-no-high-risk-domain",
    scopeWaiverAuthorizesMixedRisk: false,
    waiverPresent: waiver !== null,
    findings
  };
}
