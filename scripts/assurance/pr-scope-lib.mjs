import {
  finiteTaskEffectiveReservationAuthorityValid,
  finiteTaskPrRiskAuthorityRecordValid,
  sha256,
  stableJson,
} from "./lib.mjs";

const uniqueSorted = (values) => [...new Set(values)].sort();

const exactFiniteTaskProjectionPolicy = (value) => value?.schemaVersion === 1
  && value?.contractId === "FINITE_TASK_FEATURE_TO_PR_RISK_PROJECTION_V1"
  && value?.classification === "ACTIVE_FINITE_TASK_PR_RISK_AUTHORITY_V1"
  && value?.projectionSource === "VERIFIED_IMMUTABLE_FINITE_TASK_AUTHORITY"
  && value?.policySource === "PROTECTED_PR_SCOPE_POLICY_FINITE_TASK_FEATURE_RISK_PROJECTION"
  && value?.affectedFeatureRegistrationRequired === true
  && value?.primaryFeatureIncludedRequired === true
  && value?.currentDiffCreatesAuthority === false
  && value?.callerInputCreatesAuthority === false
  && value?.wildcardOrUniversalAuthorityAllowed === false
  && value?.observedRiskSource === "EXACT_CHANGED_PATHS_UNDER_PROTECTED_PR_SCOPE_POLICY"
  && value?.unauthorizedObservedHighRiskFailsClosed === true
  && value?.pathReservationRequiredIndependently === true;

const partitionSummary = (partition) => {
  if (!partition?.reservation) return null;
  const actualPaths = Array.isArray(partition.actualPaths) ? [...partition.actualPaths].sort() : [];
  return {
    reservationHash: partition.reservation.reservationHash ?? null,
    maximumFiles: partition.reservation.maximumFiles ?? null,
    maximumLines: partition.reservation.maximumLines ?? null,
    eligiblePathCount: partition.reservation.eligiblePathCount ?? null,
    actualPathCount: actualPaths.length,
    actualPathHash: sha256(actualPaths),
    canonicalChangedLines: partition.canonicalChangedLines ?? null,
  };
};

const safePrefixPattern = (pattern) => {
  const escaped = String(pattern).split("*").map((part) => part.replace(/[\\^$.*+?()[\]{}|]/gu, "\\$&")).join(".*");
  return new RegExp(`^${escaped}`, "u");
};

export function classifyPrScopePaths(files, policy = {}) {
  const exactFiles = Array.isArray(files) ? files.filter((file) => typeof file === "string" && file.length > 0) : [];
  const instruction = (file) => /(^|\/)AGENTS\.md$/u.test(file) || ["CURRENT_STATE.md", "NEXT_TASK.md"].includes(file);
  return exactFiles.map((file) => ({
    file,
    domains: instruction(file)
      ? ["documentation-metadata"]
      : (policy.domains ?? []).filter(({ paths }) => (paths ?? []).some((pattern) => safePrefixPattern(pattern).test(file))).map(({ id }) => id)
  }));
}

export function deriveFiniteTaskPrRiskAuthority({
  effectiveReservationResolution,
  registry,
  policy,
  observedChangedPaths = null,
  observedCanonicalChangedLines = null,
} = {}) {
  const resolution = effectiveReservationResolution;
  const projectionPolicy = policy?.finiteTaskFeatureRiskProjection;
  const findings = [];
  if (!finiteTaskEffectiveReservationAuthorityValid(resolution)) findings.push("ASSURANCE_FINITE_TASK_PR_RISK_RESOLUTION_UNVERIFIED");
  if (!exactFiniteTaskProjectionPolicy(projectionPolicy) || !Array.isArray(projectionPolicy?.featureRiskMappings)) findings.push("ASSURANCE_FINITE_TASK_PR_RISK_POLICY_INVALID");

  const primaryFeatureId = resolution?.effectiveLease?.featureId ?? null;
  const rawAffected = resolution?.effectiveLease?.artifactReservation?.allowedDomains;
  const affectedFeatureIds = Array.isArray(rawAffected) ? uniqueSorted(rawAffected) : [];
  const baseAffected = resolution?.baseLease?.artifactReservation?.allowedDomains;
  const registeredFeatureIds = new Set((registry?.features ?? []).map(({ featureId }) => featureId));
  const policyHighRiskDomains = uniqueSorted((policy?.domains ?? []).filter(({ risk }) => risk === "high").map(({ id }) => id));
  const highRisk = new Set(policyHighRiskDomains);
  const mappings = Array.isArray(projectionPolicy?.featureRiskMappings) ? projectionPolicy.featureRiskMappings : [];
  const mappingIds = mappings.map(({ featureId }) => featureId);
  const mappingByFeature = new Map(mappings.map((mapping) => [mapping?.featureId, mapping]));
  const mappingPolicyValid = mappings.length > 0
    && new Set(mappingIds).size === mappingIds.length
    && mappings.every(({ featureId, authorizedPrRiskDomains }) => {
      const domains = uniqueSorted(authorizedPrRiskDomains ?? []);
      return typeof featureId === "string" && registeredFeatureIds.has(featureId)
        && domains.length > 0
        && domains.length < policyHighRiskDomains.length
        && domains.every((domain) => domain !== "*" && highRisk.has(domain));
    });
  if (!mappingPolicyValid) findings.push("ASSURANCE_FINITE_TASK_PR_RISK_POLICY_INVALID");

  const affectedWellFormed = Array.isArray(rawAffected)
    && rawAffected.length > 0
    && rawAffected.length === affectedFeatureIds.length
    && stableJson(rawAffected) === stableJson(affectedFeatureIds)
    && stableJson(baseAffected) === stableJson(rawAffected);
  if (!affectedWellFormed) findings.push("ASSURANCE_FINITE_TASK_AFFECTED_FEATURE_AUTHORITY_INVALID");
  const registeredCount = affectedFeatureIds.filter((featureId) => registeredFeatureIds.has(featureId)).length;
  if (registeredCount !== affectedFeatureIds.length) findings.push("ASSURANCE_FINITE_TASK_AFFECTED_FEATURE_UNREGISTERED");
  const primaryIncluded = typeof primaryFeatureId === "string"
    && resolution?.baseLease?.featureId === primaryFeatureId
    && affectedFeatureIds.includes(primaryFeatureId);
  if (!primaryIncluded) findings.push("ASSURANCE_FINITE_TASK_PRIMARY_FEATURE_INVALID");
  const mappedCount = affectedFeatureIds.filter((featureId) => mappingByFeature.has(featureId)).length;
  if (mappedCount !== affectedFeatureIds.length) findings.push("ASSURANCE_FINITE_TASK_PR_RISK_PROJECTION_INCOMPLETE");

  const candidateAuthorizedPrRiskDomains = uniqueSorted(affectedFeatureIds.flatMap((featureId) => mappingByFeature.get(featureId)?.authorizedPrRiskDomains ?? []));
  const universalUnion = policyHighRiskDomains.length > 0
    && candidateAuthorizedPrRiskDomains.length === policyHighRiskDomains.length
    && candidateAuthorizedPrRiskDomains.every((domain) => highRisk.has(domain));
  if (candidateAuthorizedPrRiskDomains.includes("*") || universalUnion) findings.push("ASSURANCE_FINITE_TASK_PR_RISK_UNIVERSAL_AUTHORITY_FORBIDDEN");
  const coverage = {
    required: affectedFeatureIds.length,
    registered: registeredCount,
    mapped: mappedCount,
    result: `${registeredCount}/${affectedFeatureIds.length}`,
    unique: affectedWellFormed,
    complete: affectedWellFormed && registeredCount === affectedFeatureIds.length && mappedCount === affectedFeatureIds.length,
    primaryIncluded,
  };
  const authorityValid = findings.length === 0;
  const authorizedPrRiskDomains = authorityValid
    ? candidateAuthorizedPrRiskDomains
    : [];
  const partitions = resolution?.scopePartitions;
  const partitionObservedPaths = Array.isArray(partitions?.aggregate?.actualPaths)
    ? [...partitions.aggregate.actualPaths].sort()
    : null;
  const suppliedObservedPaths = Array.isArray(observedChangedPaths)
    ? uniqueSorted(observedChangedPaths)
    : null;
  if (observedChangedPaths !== null && (!Array.isArray(observedChangedPaths)
    || suppliedObservedPaths.length !== observedChangedPaths.length
    || stableJson(suppliedObservedPaths) !== stableJson(observedChangedPaths))) {
    findings.push("ASSURANCE_FINITE_TASK_PR_RISK_PATH_OBSERVATION_INVALID");
  }
  if (partitionObservedPaths && suppliedObservedPaths
    && stableJson(partitionObservedPaths) !== stableJson(suppliedObservedPaths)) {
    findings.push("ASSURANCE_FINITE_TASK_PR_RISK_PATH_OBSERVATION_MISMATCH");
  }
  const observedPaths = partitionObservedPaths ?? suppliedObservedPaths ?? [];
  const canonicalChangedLines = Number.isSafeInteger(observedCanonicalChangedLines) && observedCanonicalChangedLines >= 0
    ? observedCanonicalChangedLines
    : null;
  if (observedCanonicalChangedLines !== null && canonicalChangedLines === null) {
    findings.push("ASSURANCE_FINITE_TASK_PR_RISK_PATH_OBSERVATION_INVALID");
  }
  if (!partitions?.aggregate && (suppliedObservedPaths === null || canonicalChangedLines === null)) {
    findings.push("ASSURANCE_FINITE_TASK_PR_RISK_PATH_OBSERVATION_REQUIRED");
  }
  if (partitions?.aggregate && canonicalChangedLines !== null
    && partitions.aggregate.canonicalChangedLines !== canonicalChangedLines) {
    findings.push("ASSURANCE_FINITE_TASK_PR_RISK_PATH_OBSERVATION_MISMATCH");
  }
  if (!partitions?.aggregate && suppliedObservedPaths) {
    const reservation = resolution?.effectiveReservation;
    if (!reservation
      || suppliedObservedPaths.some((file) => !reservation.allowedPaths?.includes(file))
      || suppliedObservedPaths.length > reservation.maximumFiles
      || canonicalChangedLines === null
      || canonicalChangedLines > reservation.maximumLines) {
      findings.push("ASSURANCE_FINITE_TASK_PR_RISK_PATH_RESERVATION_MISMATCH");
    }
  }
  const observedClassifications = classifyPrScopePaths(observedPaths, policy);
  const observedDomains = uniqueSorted(observedClassifications.flatMap(({ domains }) => domains));
  const observedPrRiskDomains = policyHighRiskDomains.filter((domain) => observedDomains.includes(domain));
  const unauthorizedObservedPrRiskDomains = observedPrRiskDomains.filter((domain) => !authorizedPrRiskDomains.includes(domain));
  if (unauthorizedObservedPrRiskDomains.length > 0) findings.push("ASSURANCE_FINITE_TASK_PR_RISK_SCOPE_UNAUTHORIZED");
  const implementationPartition = partitionSummary(partitions?.implementation ?? {
    reservation: resolution?.effectiveReservation,
    actualPaths: observedPaths,
    canonicalChangedLines,
  });
  const testAdaptationPartition = partitionSummary(partitions?.testAdaptation);
  const aggregateCompatibilityProjection = partitionSummary(partitions?.aggregate ?? {
    reservation: resolution?.aggregateReservation ?? resolution?.effectiveReservation,
    actualPaths: observedPaths,
    canonicalChangedLines,
  });
  const subject = {
    classification: projectionPolicy?.classification ?? "ACTIVE_FINITE_TASK_PR_RISK_AUTHORITY_V1",
    projectionSource: projectionPolicy?.projectionSource ?? "VERIFIED_IMMUTABLE_FINITE_TASK_AUTHORITY",
    policySource: projectionPolicy?.policySource ?? null,
    primaryFeatureId,
    affectedFeatureIds,
    affectedFeatureHash: sha256(affectedFeatureIds),
    supportingDomains: ["CI-test-infrastructure"],
    authorizedPrRiskDomains,
    observedPrRiskDomains,
    unauthorizedObservedPrRiskDomains,
    observedChangedPathCount: observedPaths.length,
    observedChangedPathHash: sha256(observedPaths),
    coverage,
    implementationPartition,
    testAdaptationPartition,
    aggregateCompatibilityProjection,
    pathReservationRequiredIndependently: true,
    observedRiskSource: projectionPolicy?.observedRiskSource ?? null,
    currentDiffCreatesAuthority: false,
    callerInputCreatesAuthority: false,
    wildcardOrUniversalAuthorityAllowed: false,
  };
  return {
    ok: findings.length === 0,
    findings: uniqueSorted(findings),
    ...subject,
    projectionHash: sha256(subject),
  };
}

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
  finiteTaskAdmissionAuthority = null,
  protectedMainRuntime = null,
  requestedFeature = null,
  requestedWaiver = null,
  observedChangedPaths = null,
  observedCanonicalChangedLines = null,
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
  if (boundAuthority(finiteTaskAdmissionAuthority, identity)) candidates.push({ ...finiteTaskAdmissionAuthority, source: finiteTaskAdmissionAuthority.classification === "FINITE_TASK_ADMISSION_TO_CLEARANCE_V1" ? "FINITE_TASK_ADMISSION_TO_CLEARANCE_V1" : "FINITE_TASK_ADMISSION_SUCCESSOR_V1" });
  for (const attempted of [finiteTaskAuthority, architectureAuthority, terminalTruthAuthority, finiteTaskAdmissionAuthority]) if (attempted && attempted.ok !== true) findings.push(...(attempted.findings ?? []));
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
      && architectureAuthority?.subject?.type === "OWNER_ASSURANCE_ARCHITECTURE_FINAL_SOURCE_V1"
      && architectureAuthority?.subject?.objective === "remove static per-PR context recursion and create typed terminal truth successors";
    if (!terminalAllowed && !exactBootstrapRecovery) findings.push("CURRENT_TRUTH_PENDING_TERMINAL_SUCCESSOR_REQUIRED");
  }
  const registryFeatures = new Set((registry?.features ?? []).map(({ featureId }) => featureId));
  if (selected && !registryFeatures.has(selected.featureId)) findings.push("ASSURANCE_TASK_FEATURE_UNREGISTERED");
  if (selected?.historicalWaiverPath && selected.type !== "PROTECTED_HISTORICAL_TASK") findings.push("ASSURANCE_TASK_WAIVER_CONTEXT_INVALID");
  if (selected?.historicalWaiverPath && selected.bindingId !== "codex-security-s0-pr-206-v1") findings.push("ASSURANCE_TASK_WAIVER_CONTEXT_INVALID");

  const activeFiniteTask = selected?.type === "ACTIVE_FINITE_TASK_LEASE";
  const finiteTaskPrRiskAuthority = activeFiniteTask
    ? deriveFiniteTaskPrRiskAuthority({
        effectiveReservationResolution: selected.effectiveReservationResolution,
        registry,
        policy,
        observedChangedPaths,
        observedCanonicalChangedLines,
      })
    : null;
  if (finiteTaskPrRiskAuthority) {
    findings.push(...finiteTaskPrRiskAuthority.findings);
    if (selected.featureId !== finiteTaskPrRiskAuthority.primaryFeatureId) findings.push("ASSURANCE_FINITE_TASK_PRIMARY_FEATURE_INVALID");
    if (stableJson(uniqueSorted(selected.supportingDomains ?? [])) !== stableJson(finiteTaskPrRiskAuthority.supportingDomains)) findings.push("ASSURANCE_FINITE_TASK_SUPPORTING_DOMAIN_INVALID");
  }
  const objectiveDomains = activeFiniteTask
    ? finiteTaskPrRiskAuthority?.authorizedPrRiskDomains ?? []
    : uniqueSorted(selected?.objectiveDomains ?? []);
  const supportingDomains = activeFiniteTask
    ? finiteTaskPrRiskAuthority?.supportingDomains ?? []
    : uniqueSorted(selected?.supportingDomains ?? []);
  const knownDomains = new Set((policy?.domains ?? []).map(({ id }) => id));
  if ([...objectiveDomains, ...supportingDomains].some((domain) => !knownDomains.has(domain))) findings.push("ASSURANCE_TASK_CONTEXT_DOMAIN_UNKNOWN");
  const waiverPath = selected?.historicalWaiverPath ?? null;

  return {
    ok: findings.length === 0,
    findings: uniqueSorted(findings),
    source: selected?.source ?? "UNBOUND_PR_CONTEXT",
    contextType: selected?.type ?? null,
    identity,
    featureId: activeFiniteTask ? finiteTaskPrRiskAuthority?.primaryFeatureId ?? null : selected?.featureId ?? null,
    primaryFeatureId: activeFiniteTask ? finiteTaskPrRiskAuthority?.primaryFeatureId ?? null : selected?.featureId ?? null,
    affectedFeatureIds: finiteTaskPrRiskAuthority?.affectedFeatureIds ?? [],
    objectiveDomains,
    supportingDomains,
    authorizedPrRiskDomains: finiteTaskPrRiskAuthority?.authorizedPrRiskDomains ?? [],
    finiteTaskPrRiskAuthority,
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
  waiver = null,
  finiteTaskPrRiskAuthority = null
}) {
  const highRisk = uniqueSorted(highRiskDomains);
  const objective = new Set(objectiveDomains);
  const registered = new Set(registeredFeatureIds);
  const policyFindings = validateFeatureDomainBundles({
    featureDomainBundles,
    registeredFeatureIds,
    policyHighRiskDomains
  });
  if (finiteTaskPrRiskAuthority !== null) {
    const { ok: authorityOk, findings: authorityFindings, projectionHash, ...projectionSubject } = finiteTaskPrRiskAuthority ?? {};
    const projectionHashValid = typeof projectionHash === "string" && projectionHash === sha256(projectionSubject);
    const authorized = uniqueSorted(finiteTaskPrRiskAuthority?.authorizedPrRiskDomains ?? []);
    const observed = uniqueSorted(finiteTaskPrRiskAuthority?.observedPrRiskDomains ?? []);
    const outsideAuthorization = highRisk.filter((domain) => !authorized.includes(domain));
    const findings = [...policyFindings];
    const authorityRecordValid = finiteTaskPrRiskAuthorityRecordValid(finiteTaskPrRiskAuthority);
    if (authorityOk !== true || !projectionHashValid || !authorityRecordValid) findings.push({
      id: "ASSURANCE_FINITE_TASK_PR_RISK_AUTHORITY_INVALID",
      status: "BLOCKED_INTERNAL",
      reasons: uniqueSorted([
        ...(authorityFindings ?? []),
        ...(!projectionHashValid ? ["ASSURANCE_FINITE_TASK_PR_RISK_PROJECTION_HASH_INVALID"] : []),
        ...(!authorityRecordValid ? ["ASSURANCE_FINITE_TASK_PR_RISK_AUTHORITY_RECORD_INVALID"] : [])
      ])
    });
    if (stableJson(observed) !== stableJson(highRisk)) findings.push({
      id: "ASSURANCE_FINITE_TASK_PR_RISK_OBSERVATION_MISMATCH",
      status: "BLOCKED_INTERNAL",
      expected: observed,
      observed: highRisk
    });
    if (outsideAuthorization.length > 0) findings.push({
      id: "ASSURANCE_FINITE_TASK_PR_RISK_SCOPE_UNAUTHORIZED",
      status: "BLOCKED_INTERNAL",
      domains: outsideAuthorization
    });
    if (waiver !== null) findings.push({
      id: "ASSURANCE_FINITE_TASK_SCOPE_WAIVER_FORBIDDEN",
      status: "BLOCKED_INTERNAL"
    });
    return {
      featureId: finiteTaskPrRiskAuthority?.primaryFeatureId ?? null,
      primaryFeatureId: finiteTaskPrRiskAuthority?.primaryFeatureId ?? null,
      affectedFeatureIds: finiteTaskPrRiskAuthority?.affectedFeatureIds ?? [],
      supportingDomains: finiteTaskPrRiskAuthority?.supportingDomains ?? [],
      authorizedPrRiskDomains: authorized,
      observedPrRiskDomains: highRisk,
      outsideAuthorizedPrRiskDomains: outsideAuthorization,
      affectedFeatureCoverage: finiteTaskPrRiskAuthority?.coverage ?? null,
      implementationPartition: finiteTaskPrRiskAuthority?.implementationPartition ?? null,
      testAdaptationPartition: finiteTaskPrRiskAuthority?.testAdaptationPartition ?? null,
      aggregateCompatibilityProjection: finiteTaskPrRiskAuthority?.aggregateCompatibilityProjection ?? null,
      finiteTaskPrRiskProjectionHash: finiteTaskPrRiskAuthority?.projectionHash ?? null,
      selectedBundle: null,
      highRiskDomains: highRisk,
      objectiveDomains: authorized,
      relatedHighRiskScopeAuthorized: findings.length === 0,
      decisionSource: "verified-finite-task-feature-risk-projection",
      scopeWaiverAuthorizesMixedRisk: false,
      waiverPresent: waiver !== null,
      findings
    };
  }
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
