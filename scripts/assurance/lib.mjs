#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const rel = (...parts) => path.join(ROOT, ...parts);
export const readText = (file) => fs.readFileSync(path.isAbsolute(file) ? file : rel(file), "utf8");
export const readJson = (file) => JSON.parse(readText(file));
export const exists = (file) => fs.existsSync(path.isAbsolute(file) ? file : rel(file));
export const sha256 = (value) => crypto.createHash("sha256").update(typeof value === "string" ? value : stableJson(value)).digest("hex");
export const stableValue = (value) => Array.isArray(value)
  ? value.map(stableValue)
  : value && typeof value === "object"
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]))
    : value;
export const stableJson = (value, space = 0) => JSON.stringify(stableValue(value), null, space);
export const normalizeSql = (value) => value.replace(/\r\n/gu, "\n").replace(/[ \t]+\n/gu, "\n").replace(/\n{3,}/gu, "\n\n").trim();

export function args(argv = process.argv.slice(2)) {
  const result = {};
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (!item.startsWith("--")) continue;
    const [rawKey, inline] = item.slice(2).split(/=(.*)/su);
    const key = rawKey.replace(/-([a-z])/gu, (_, letter) => letter.toUpperCase());
    if (inline !== undefined) result[key] = inline;
    else if (argv[i + 1] && !argv[i + 1].startsWith("--")) result[key] = argv[++i];
    else result[key] = true;
  }
  return result;
}

export function git(gitArgs, options = {}) {
  return execFileSync("git", gitArgs, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...options }).trim();
}

const secretKey = /(secret|password|credential|authorization|private.?key|raw.?payload|device.?id|device.?serial|udid|signed.?url)/iu;
const secretString = /(bearer\s+[a-z0-9._-]+|(?:service_role|sk|pk|gh[opsu])_[a-z0-9_-]{12,}|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/giu;
export function redact(value, key = "") {
  if (secretKey.test(key)) return "[REDACTED]";
  if (Array.isArray(value)) return value.map((entry) => redact(entry));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([childKey, child]) => [childKey, redact(child, childKey)]));
  if (typeof value === "string") return value.replace(secretString, "[REDACTED]");
  return value;
}

export function providerMode(options) {
  const mode = options.providerMode ?? "offline";
  if (!["offline", "read-only"].includes(mode)) throw new Error(`ASSURANCE_PROVIDER_MODE_FORBIDDEN:${mode}`);
  if (mode === "read-only" && !options.providerSnapshot && !options.snapshot) {
    throw new Error("ASSURANCE_PROVIDER_SNAPSHOT_REQUIRED");
  }
  return mode;
}

export function emit(command, ok, payload = {}, human = []) {
  const output = redact({ schemaVersion: 1, command, ok, ...payload });
  const lines = human.length ? human : [`${command}: ${ok ? "PASS" : "FAIL"}`];
  process.stderr.write(`${lines.join("\n")}\n`);
  process.stdout.write(`${stableJson(output)}\n`);
  if (!ok) process.exitCode = 1;
  return output;
}

export function requiredKeys(value, keys, label) {
  return keys.flatMap((key) => Object.hasOwn(value, key) ? [] : [`${label} missing ${key}`]);
}

const gitShaPattern = /^[0-9a-f]{40}$/u;
const forbiddenGitBranchCharacters = /[\u0000-\u0020~^:?*[\]\\\u007f]/u;

export function isValidGitBranchName(value) {
  return typeof value === "string"
    && value.length > 0
    && value !== "@"
    && value !== "HEAD"
    && !value.startsWith("-")
    && !value.startsWith("/")
    && !value.endsWith("/")
    && !value.endsWith(".")
    && !value.includes("..")
    && !value.includes("//")
    && !value.includes("@{")
    && value.split("/").every((component) => !component.startsWith(".") && !component.endsWith(".lock"))
    && !forbiddenGitBranchCharacters.test(value);
}

export function implementationRemoteRef(branch) {
  return isValidGitBranchName(branch) ? `refs/remotes/origin/${branch}` : null;
}

function sortStable(values) {
  return [...values].sort((left, right) => {
    const leftJson = stableJson(left);
    const rightJson = stableJson(right);
    return leftJson < rightJson ? -1 : leftJson > rightJson ? 1 : 0;
  });
}

function normalizeImplementationInventory(value, subject, findings) {
  const entries = Array.isArray(value) ? value : [];
  const normalized = [];
  const seenNumbers = new Set();
  const seenBranches = new Set();

  if (!Array.isArray(value)) {
    findings.push({
      id: "ASSURANCE_CURRENT_TRUTH_PROVIDER_IMPLEMENTATION_LIST_MALFORMED",
      status: "BLOCKED_INTERNAL",
      subject
    });
  }

  for (const entry of entries) {
    const numberValid = Number.isInteger(entry?.number) && entry.number > 0;
    const branchValid = isValidGitBranchName(entry?.branch);
    const headValid = typeof entry?.head === "string" && gitShaPattern.test(entry.head);
    const stateValid = typeof entry?.state === "string"
      && entry.state.length > 0
      && entry.state === entry.state.trim();

    if (!numberValid || !branchValid || !headValid || !stateValid) {
      findings.push({
        id: "ASSURANCE_CURRENT_TRUTH_PROVIDER_IMPLEMENTATION_ENTRY_MALFORMED",
        status: "BLOCKED_INTERNAL",
        number: numberValid ? entry.number : null,
        subject
      });
    }
    if (numberValid && seenNumbers.has(entry.number)) {
      findings.push({
        id: "ASSURANCE_CURRENT_TRUTH_PROVIDER_IMPLEMENTATION_DUPLICATE",
        status: "BLOCKED_INTERNAL",
        field: "number",
        subject,
        value: entry.number
      });
    }
    if (branchValid && seenBranches.has(entry.branch)) {
      findings.push({
        id: "ASSURANCE_CURRENT_TRUTH_PROVIDER_IMPLEMENTATION_DUPLICATE",
        status: "BLOCKED_INTERNAL",
        field: "branch",
        subject,
        value: entry.branch
      });
    }
    if (numberValid) seenNumbers.add(entry.number);
    if (branchValid) seenBranches.add(entry.branch);
    if (numberValid && branchValid && headValid && stateValid) {
      normalized.push({
        branch: entry.branch,
        head: entry.head,
        number: entry.number,
        state: entry.state
      });
    }
  }

  return sortStable(normalized);
}

export function verifyProviderImplementationSnapshot(recordEntries, snapshotEntries) {
  const findings = [];
  const record = normalizeImplementationInventory(recordEntries, "record", findings);
  const snapshot = normalizeImplementationInventory(snapshotEntries, "snapshot", findings);
  const recordByNumber = new Map(record.map((entry) => [entry.number, entry]));
  const snapshotByNumber = new Map(snapshot.map((entry) => [entry.number, entry]));

  for (const expected of record) {
    const observed = snapshotByNumber.get(expected.number);
    if (!observed) {
      findings.push({
        id: "ASSURANCE_CURRENT_TRUTH_PROVIDER_IMPLEMENTATION_MISSING",
        status: "BLOCKED_INTERNAL",
        branch: expected.branch,
        number: expected.number
      });
      continue;
    }
    const mismatchedFields = ["branch", "head", "state"].filter((field) => expected[field] !== observed[field]);
    if (mismatchedFields.length) {
      findings.push({
        id: "ASSURANCE_CURRENT_TRUTH_PROVIDER_IMPLEMENTATION_MISMATCH",
        status: "BLOCKED_INTERNAL",
        fields: mismatchedFields,
        number: expected.number,
        observed,
        recorded: expected
      });
    }
  }

  for (const observed of snapshot) {
    if (!recordByNumber.has(observed.number)) {
      findings.push({
        id: "ASSURANCE_CURRENT_TRUTH_PROVIDER_IMPLEMENTATION_EXTRA",
        status: "BLOCKED_INTERNAL",
        branch: observed.branch,
        number: observed.number
      });
    }
  }

  const sortedFindings = sortStable(findings);
  return {
    ok: sortedFindings.length === 0,
    findings: sortedFindings,
    record,
    snapshot
  };
}

export function verifyCurrentTruthHeadBindings({
  openImplementationPrs,
  observedRefs,
  branch,
  head,
  remoteMain,
  explicitBranch = "",
  explicitHead = ""
}) {
  const findings = [];
  const bindings = [];
  const entries = Array.isArray(openImplementationPrs) ? openImplementationPrs : [];
  const observations = observedRefs && typeof observedRefs === "object" ? observedRefs : {};
  const seenNumbers = new Set();
  const seenBranches = new Set();

  if (!Array.isArray(openImplementationPrs)) {
    findings.push({ id: "ASSURANCE_CURRENT_TRUTH_IMPLEMENTATION_LIST_MALFORMED", status: "BLOCKED_INTERNAL" });
  }

  for (const entry of entries) {
    const numberValid = Number.isInteger(entry?.number) && entry.number > 0;
    const branchValid = isValidGitBranchName(entry?.branch);
    const headValid = typeof entry?.head === "string" && gitShaPattern.test(entry.head);

    if (!numberValid) {
      findings.push({ id: "ASSURANCE_CURRENT_TRUTH_IMPLEMENTATION_PR_MALFORMED", status: "BLOCKED_INTERNAL", number: entry?.number ?? null });
    } else if (seenNumbers.has(entry.number)) {
      findings.push({ id: "ASSURANCE_CURRENT_TRUTH_IMPLEMENTATION_DUPLICATE", status: "BLOCKED_INTERNAL", field: "number", value: entry.number });
    } else {
      seenNumbers.add(entry.number);
    }

    if (!branchValid) {
      findings.push({ id: "ASSURANCE_CURRENT_TRUTH_IMPLEMENTATION_BRANCH_MALFORMED", status: "BLOCKED_INTERNAL", branch: entry?.branch ?? null, number: numberValid ? entry.number : null });
    } else if (seenBranches.has(entry.branch)) {
      findings.push({ id: "ASSURANCE_CURRENT_TRUTH_IMPLEMENTATION_DUPLICATE", status: "BLOCKED_INTERNAL", field: "branch", value: entry.branch });
    } else {
      seenBranches.add(entry.branch);
    }

    if (!headValid) {
      findings.push({ id: "ASSURANCE_CURRENT_TRUTH_IMPLEMENTATION_HEAD_MALFORMED", status: "BLOCKED_INTERNAL", head: entry?.head ?? null, number: numberValid ? entry.number : null });
    }

    if (!branchValid) continue;
    const ref = implementationRemoteRef(entry.branch);
    const observed = Object.hasOwn(observations, ref) ? observations[ref] : null;
    const observedValid = typeof observed === "string" && gitShaPattern.test(observed);
    bindings.push({
      branch: entry.branch,
      number: numberValid ? entry.number : null,
      observedHead: observed,
      recordedHead: entry?.head ?? null,
      ref
    });

    if (observed === null || observed === undefined || observed === "") {
      findings.push({ id: "ASSURANCE_CURRENT_TRUTH_IMPLEMENTATION_REF_MISSING", status: "BLOCKED_INTERNAL", branch: entry.branch, number: numberValid ? entry.number : null, ref });
    } else if (!observedValid) {
      findings.push({ id: "ASSURANCE_CURRENT_TRUTH_IMPLEMENTATION_OBSERVED_HEAD_MALFORMED", status: "BLOCKED_INTERNAL", branch: entry.branch, number: numberValid ? entry.number : null, observed });
    } else if (headValid && observed !== entry.head) {
      findings.push({
        id: "ASSURANCE_CURRENT_TRUTH_IMPLEMENTATION_HEAD_STALE",
        status: "BLOCKED_INTERNAL",
        branch: entry.branch,
        number: numberValid ? entry.number : null,
        observed,
        recorded: entry.head
      });
    }
  }

  const namedBranch = typeof branch === "string" ? branch : "";
  const checkoutHeadValid = typeof head === "string" && gitShaPattern.test(head);
  const remoteMainValid = typeof remoteMain === "string" && gitShaPattern.test(remoteMain);
  const hasExplicitContext = explicitBranch !== "" || explicitHead !== "";

  if (!checkoutHeadValid) findings.push({ id: "ASSURANCE_CURRENT_TRUTH_CHECKOUT_HEAD_MALFORMED", status: "BLOCKED_INTERNAL", head: head ?? null });
  if (!remoteMainValid) findings.push({ id: "ASSURANCE_CURRENT_TRUTH_MAIN_HEAD_MALFORMED", status: "BLOCKED_INTERNAL", remoteMain: remoteMain ?? null });

  if (hasExplicitContext) {
    if (!isValidGitBranchName(explicitBranch) || !gitShaPattern.test(explicitHead)) {
      findings.push({ id: "ASSURANCE_CURRENT_TRUTH_EXPLICIT_CONTEXT_MALFORMED", status: "BLOCKED_INTERNAL" });
    }
    if (namedBranch && explicitBranch && namedBranch !== explicitBranch) {
      findings.push({
        id: "ASSURANCE_CURRENT_TRUTH_EXPLICIT_CONTEXT_MISMATCH",
        status: "BLOCKED_INTERNAL",
        branch: namedBranch,
        explicitBranch
      });
    }
    if (checkoutHeadValid && gitShaPattern.test(explicitHead) && head !== explicitHead) {
      findings.push({
        id: "ASSURANCE_CURRENT_TRUTH_CHECKOUT_HEAD_STALE",
        status: "BLOCKED_INTERNAL",
        actual: head,
        expected: explicitHead
      });
    }
  }

  const contextBranch = explicitBranch || namedBranch;
  const claimsMain = contextBranch === "main";
  const mainCheckoutCurrent = checkoutHeadValid
    && remoteMainValid
    && head === remoteMain
    && (explicitBranch !== "main" || explicitHead === remoteMain);
  const detachedMain = !namedBranch
    && (!hasExplicitContext || explicitBranch === "main")
    && mainCheckoutCurrent;
  if (claimsMain && !mainCheckoutCurrent) {
    findings.push({
      id: "ASSURANCE_CURRENT_TRUTH_MAIN_CHECKOUT_STALE",
      status: "BLOCKED_INTERNAL",
      actual: head,
      expected: remoteMain,
      explicitHead: explicitHead || null
    });
  }
  if (!namedBranch && !detachedMain && !hasExplicitContext) {
    findings.push({ id: "ASSURANCE_CURRENT_TRUTH_DETACHED_CONTEXT_UNRESOLVED", status: "BLOCKED_INTERNAL", head: checkoutHeadValid ? head : null });
  }

  const currentEntry = entries.find((entry) => entry?.branch === contextBranch);
  if (currentEntry && checkoutHeadValid && gitShaPattern.test(currentEntry.head) && head !== currentEntry.head) {
    findings.push({
      id: "ASSURANCE_CURRENT_TRUTH_CHECKOUT_HEAD_STALE",
      status: "BLOCKED_INTERNAL",
      actual: head,
      branch: contextBranch,
      expected: currentEntry.head,
      number: Number.isInteger(currentEntry.number) ? currentEntry.number : null
    });
  }

  const sortedFindings = sortStable(findings);
  const mainContext = claimsMain || detachedMain;
  return {
    ok: sortedFindings.length === 0,
    bindings: sortStable(bindings),
    context: claimsMain && !mainCheckoutCurrent
      ? "invalid-main-context"
      : detachedMain
      ? "detached-main"
      : mainContext
        ? "main"
        : currentEntry
          ? "listed-implementation-branch"
          : contextBranch
            ? "unlisted-control-branch"
            : "detached-unresolved",
    findings: sortedFindings,
    unlistedBranchPolicy: "deferred-to-pr-e"
  };
}

export function verifyCurrentTruthSynchronization({
  recordedMain,
  remoteMain,
  parents,
  changedPaths,
  requiredChangedPaths,
  allowedChangedPaths,
  bootstrapMerge
}) {
  if (recordedMain === remoteMain) return { ok: true, mode: "exact-main" };
  const required = new Set(requiredChangedPaths);
  const allowed = new Set(allowedChangedPaths);
  const changed = new Set(changedPaths);
  const parentShapeMatches = parents.length === 2 && parents[0] === recordedMain;
  const requiredPathsPresent = [...required].every((file) => changed.has(file));
  const changedPathsAllowed = [...changed].every((file) => allowed.has(file));
  const normalSynchronization = parentShapeMatches && requiredPathsPresent && changedPathsAllowed;
  const bootstrapSynchronization = Boolean(
    bootstrapMerge
    && remoteMain === bootstrapMerge.mergeSha
    && recordedMain === bootstrapMerge.firstParent
    && parentShapeMatches
    && JSON.stringify([...changed].sort()) === JSON.stringify([...bootstrapMerge.changedPaths].sort())
  );
  return {
    ok: normalSynchronization || bootstrapSynchronization,
    mode: bootstrapSynchronization ? "bootstrap-synchronization-merge" : "synchronization-merge",
    parentShapeMatches,
    requiredPathsPresent,
    changedPathsAllowed,
    bootstrapSynchronization
  };
}

export const tierIds = ["T0_REQUIREMENT", "T1_SOURCE", "T2_MODEL", "T3_INTEGRATION", "T4_NATIVE_PROVIDER", "T5_SIGNED_ARTIFACT", "T6_INSTALLED_PHYSICAL", "T7_PUBLIC_CANARY"];
export const featureRequired = ["featureId", "currentState", "ownerSystems", "productOwner", "routes", "components", "edgeFunctions", "tablesRpcs", "nativeModulesPlugins", "providers", "platformScope", "environments", "riskLevel", "requirements", "nonGoals", "states", "transitions", "invariants", "knownDefectTags", "threatFailureModes", "proofTierApplicability", "commands", "artifactRequirements", "installedRequirements", "physicalGoldenCases", "rollback", "emergencyStop", "evidenceRetention", "reviewRequirements", "unresolvedBlockers"];

export function renderCurrentState(record) {
  const enabled = record.enabledCognitiveSwitches.length ? record.enabledCognitiveSwitches.map((entry) => `\`${entry}\``).join(", ") : "none";
  const blocked = record.blockedProviders.length
    ? record.blockedProviders.map((entry) => `- ${entry.provider}: ${entry.status} — ${entry.scope}. Resume: ${entry.resumptionAction}`).join("\n")
    : "- None.";
  const implementations = record.openImplementationPrs.length
    ? record.openImplementationPrs.map((entry) => `- PR #${entry.number} at \`${entry.head}\`: ${entry.state}; ${entry.disposition}.`).join("\n")
    : "- None.";
  const reviews = record.openReviewOnlyPrs.length
    ? record.openReviewOnlyPrs.map((entry) => `- PR #${entry.number} at \`${entry.head}\`: ${entry.state}, reviews \`${entry.reviewedImplementationHead}\`; ${entry.disposition}.`).join("\n")
    : "- None.";
  const installedQa = record.operationalClosures.installedProductQa;
  const revenueCat = record.operationalClosures.revenueCat;
  return `# CURRENT STATE\n\nGenerated from \`config/assurance/current-truth-v1.json\`. Do not hand-edit.\n\n- Main SHA observed at this assurance checkpoint: \`${record.mainSha}\`.\n- Latest merged implementation: PR #${record.latestMergedImplementationPr.number}, \`${record.latestMergedImplementationPr.head}\`; merge \`${record.latestMergedImplementationPr.mergeSha}\`.\n- Assurance program: ${record.assuranceProgram.active}; completed: ${record.assuranceProgram.completed.join(", ") || "none"}.\n- Android internal: build ${record.android.buildNumber}, runtime \`${record.android.runtime}\`, channel \`${record.android.channel}\`, update \`${record.android.updateId}\`.\n- iOS internal: build ${record.ios.buildNumber}, runtime \`${record.ios.runtime}\`, channel \`${record.ios.channel}\`, update \`${record.ios.updateId}\`.\n- Remote migration head: \`${record.remoteMigrationHead}\`.\n- Enabled Cognitive switches: ${enabled}.\n- Cognitive schedules: ${record.scheduleState.enabled}/${record.scheduleState.total} enabled. Effective baseline count: ${record.effectiveBaselineCount}.\n- Cognitive LiveKit: ${record.safety.livekitSentinelRuns} formal runs, ${record.safety.livekitFindings} findings, ${record.safety.livekitSwitchesEnabled} enabled switches.\n- PUBLIC schema \`net\` USAGE: ${record.safety.publicSchemaNetUsage}. User-derived memory: ${record.safety.userDerivedMemory}. Level 2 repair: ${record.safety.level2Repair}.\n- Chi'llywood autonomous app operating model is now documented and guarded at \`${record.operatingPolicy.modelDocument}\`; Level 0/1 work does not require owner approval, while Level 3/4 boundaries do.\n- Installed Product QA closure retained: ${installedQa.schedulerStatus}; proof rows ${installedQa.proofRowIds.map((id) => `\`${id}\``).join(", ")}; current matrix state \`${installedQa.currentMatrixState}\`; the daily timer is enabled.\n- RevenueCat provider readback is closed: dashboard TEST returned HTTP \`${revenueCat.dashboardTest.httpStatus}\` / \`${revenueCat.dashboardTest.result}\` with \`premiumGranted=${revenueCat.premiumGranted}\`, \`liveMoneyAction=${revenueCat.liveMoneyAction}\`, and \`moneyMoved=${revenueCat.moneyMoved}\`.\n- Evidence timestamp: \`${record.timestamp}\`; freshness deadline: \`${record.freshnessDeadline}\`; live provider readback: ${record.liveProviderReadback}.\n\n## Open implementation PRs\n\n${implementations}\n\n## Open review-only PRs\n\n${reviews}\n\n## Current external blockers\n\n${blocked}\n\nHistorical proof belongs in Git history and scoped reports, not this hot path.\n`;
}

export function renderNextTask(record) {
  const actions = record.assuranceProgram.nextActions.map((entry, index) => `${index + 1}. ${entry}`).join("\n");
  return `# NEXT TASK\n\nGenerated from \`config/assurance/current-truth-v1.json\`. Do not hand-edit.\n\n${actions}\n\nDo not ask owner approval for Level 0/1 autonomous operations. Keep Level 3/4 owner approval and external-confirmation boundaries intact.\n\n${record.assuranceProgram.prohibitions.join("\n")}\n`;
}

export function classifyMigration(remote, source) {
  if (!source) return "REMOTE_ONLY";
  if (!remote) return "SOURCE_ONLY";
  if (remote.version !== source.version || remote.name !== source.name) return "VERSION_MISMATCH";
  if (remote.hash !== source.hash) return "BODY_MISMATCH";
  return "REMOTE_AND_SOURCE_MATCH";
}
