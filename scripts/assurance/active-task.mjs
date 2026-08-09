#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { ROOT, emit, readJson, redact, stableJson } from "./lib.mjs";
import { git, packet, privateArtifactDirectory, sha256, strictOptions, writePrivateFile } from "./efficiency-lib.mjs";

const laneIds = [
  "architecture-state",
  "security-authority",
  "proof-equivalence-native-provider",
  "privacy-rollback-determinism"
];

function inferFeature(truth) {
  const active = truth?.assuranceProgram?.active ?? "";
  if (/E0_COMPLETE_D2A_READY_NOT_RESUMED/iu.test(active)) return ["chilly-chat-call-lifecycle"];
  if (/E0_READY|E0_ACTIVE/iu.test(active)) return ["assurance-efficiency-e0"];
  if (/\bD2A\b/iu.test(active) && !/D2A_FROZEN/iu.test(active)) return ["chilly-chat-call-lifecycle"];
  return [];
}

function affectedSymbols(files) {
  const symbols = [];
  for (const file of files) {
    if (!/\.[cm]?[jt]sx?$/u.test(file)) continue;
    let source;
    try {
      const resolved = path.resolve(ROOT, file);
      if (!resolved.startsWith(`${ROOT}${path.sep}`)) continue;
      const stat = fs.lstatSync(resolved);
      if (!stat.isFile() || stat.isSymbolicLink()) continue;
      source = fs.readFileSync(resolved, "utf8");
    } catch { continue; }
    for (const match of source.matchAll(/\bexport\s+(?:async\s+)?(?:function|class|const|let|var)\s+([A-Za-z_$][\w$]*)/gu)) {
      symbols.push(`${file}#${match[1]}`);
    }
  }
  return [...new Set(symbols)].sort();
}

function inheritedBlockers(truth) {
  const blockers = (truth?.blockedProviders ?? []).map(({ provider, scope, status }) => ({ provider, scope, status }));
  const d2b = truth?.d2bCurrentTruthBinding;
  if (d2b?.proof?.runtimeBackupRestore?.startsWith("BLOCKED_")) {
    blockers.push({ id: d2b.proof.runtimeBackupRestore, owner: d2b.proof.runtimeRestoreProofOwner });
  }
  for (const [tier, status] of Object.entries(d2b?.proofTiers ?? {})) {
    if (/PARTIAL|MISSING|BLOCKED/iu.test(status)) blockers.push({ tier, status });
  }
  return blockers;
}

function resolveImplementation(truth, identity, facts, featureId) {
  if (facts.implementation) return { ok: true, value: facts.implementation };
  const open = truth?.openImplementationPrs ?? [];
  if (!Array.isArray(open)) return { ok: false, finding: "IMPLEMENTATION_INVENTORY_MALFORMED" };
  if (open.length > 1) return { ok: false, finding: "MULTIPLE_ACTIVE_IMPLEMENTATIONS" };
  if (open.length === 1 && open[0].branch !== identity.branch) return { ok: false, finding: "ACTIVE_IMPLEMENTATION_BRANCH_MISMATCH" };
  const e0 = truth?.e0CurrentTruthBinding;
  const d2a = truth?.d2bCurrentTruthBinding?.preservedDependencies?.d2a;
  const immutableSourceHead = featureId === "assurance-efficiency-e0" ? (e0?.immutableSourceHead ?? identity.head) : (d2a?.head ?? identity.head);
  const immutableSourceTree = featureId === "assurance-efficiency-e0" ? (e0?.immutableSourceTree ?? identity.tree) : (d2a?.tree ?? identity.tree);
  return {
    ok: true,
    value: open.length === 1
      ? { pr: open[0].number, branch: open[0].branch, state: open[0].state, immutableSourceHead, immutableSourceTree }
      : { pr: null, branch: identity.branch, state: "LOCAL_PRE_PR", immutableSourceHead, immutableSourceTree }
  };
}

export function activeTask(facts = {}) {
  const truth = facts.currentTruth ?? readJson("config/assurance/current-truth-v1.json");
  const checked = facts.truthCheck ?? (() => {
    const run = spawnSync(process.execPath, ["scripts/assurance/current-truth.mjs"], {
      cwd: ROOT, encoding: "utf8", shell: false
    });
    try { return { ok: run.status === 0 && JSON.parse(run.stdout).ok === true }; } catch { return { ok: false }; }
  })();
  if (!checked.ok) return { ok: false, findings: ["CURRENT_TRUTH_STALE_OR_UNPARSEABLE"] };

  const inferred = facts.inferredFeatures ?? inferFeature(truth);
  if (inferred.length !== 1) return { ok: false, findings: ["ACTIVE_TASK_AMBIGUOUS"] };
  if (facts.featureId && facts.featureId !== inferred[0]) return { ok: false, findings: ["FEATURE_OVERRIDE_CONFLICT"] };
  const registry = facts.registry ?? readJson("config/assurance/feature-registry-v1.json");
  const matches = registry.features?.filter(({ featureId }) => featureId === inferred[0]) ?? [];
  if (matches.length !== 1) return { ok: false, findings: ["ACTIVE_FEATURE_UNRESOLVED"] };
  const feature = facts.feature ?? matches[0];

  let identity = facts.identity;
  try {
    if (!identity) {
      if (git(["status", "--porcelain"])) return { ok: false, findings: ["WORKING_TREE_NOT_IMMUTABLE"] };
      const base = facts.base ?? "origin/main";
      const baseHead = git(["rev-parse", "--verify", `${base}^{commit}`]);
      const changedFiles = git(["diff", "--no-ext-diff", "--name-only", `${baseHead}..HEAD`]).split("\n").filter(Boolean).sort();
      identity = {
        branch: git(["branch", "--show-current"]) || "DETACHED",
        head: git(["rev-parse", "HEAD"]),
        tree: git(["rev-parse", "HEAD^{tree}"]),
        originMainHead: git(["rev-parse", "origin/main^{commit}"]),
        originMainTree: git(["rev-parse", "origin/main^{tree}"]),
        baseHead,
        baseTree: git(["rev-parse", `${baseHead}^{tree}`]),
        diffHash: sha256(git(["diff", "--no-ext-diff", "--binary", `${baseHead}..HEAD`])),
        pathHash: sha256(changedFiles),
        changedFiles
      };
    }
  } catch { return { ok: false, findings: ["SOURCE_IDENTITY_UNRESOLVED"] }; }

  const implementation = resolveImplementation(truth, identity, facts, feature.featureId);
  if (!implementation.ok) return { ok: false, findings: [implementation.finding] };
  const allowlist = facts.allowlist ?? readJson("config/assurance/command-allowlist-v1.json");
  const required = feature.commands ?? [];
  const rules = allowlist.commands ?? [];
  const requiredRules = required.map((contractCommand) => {
    const matches = rules.filter((rule) => rule.contractCommand === contractCommand);
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) return null;
    return allowlist.deferredContractCommands?.includes(contractCommand)
      ? { id: `deferred:${contractCommand.toLowerCase().replace(/[^a-z0-9]+/gu, "-")}`, file: null, args: [], resultContract: { type: "deferred-task-contract", executable: false }, contractCommand }
      : null;
  });
  if (requiredRules.some((rule) => !rule)) return { ok: false, findings: ["MANDATORY_COMMAND_DROPPED"] };
  const commands = requiredRules.map((rule) => ({ id: rule.id, contractCommand: rule.contractCommand, argv: rule.file ? [rule.file, ...rule.args] : null, resultContract: rule.resultContract }));
  const catalog = facts.defectCatalog ?? readJson("config/assurance/escaped-defect-catalog-v1.json").defects;
  const defects = catalog
    .filter(({ id }) => feature.knownDefectTags?.includes(id))
    .map(({ id, affectedDomains, requiredProofTier, blocks }) => ({ id, affectedDomains, requiredProofTier, blocks }));
  if (defects.length !== feature.knownDefectTags.length) return { ok: false, findings: ["HISTORICAL_DEFECT_UNRESOLVED"] };
  const changedFiles = identity.changedFiles ?? [];
  const directFiles = changedFiles.length ? changedFiles : (facts.directlyAffectedFiles ?? []);
  const directDomains = [...new Set([...(feature.components ?? []), ...(feature.platformScope ?? []), ...(feature.providers ?? [])])];
  const transitiveDomains = [...new Set(defects.flatMap(({ affectedDomains }) => affectedDomains ?? []))];
  const contract = facts.contract ?? readJson("config/assurance/efficiency-e0-v1.json");
  const built = packet({
    currentTruth: truth,
    identity,
    implementation: implementation.value,
    featureId: feature.featureId,
    directlyAffectedFiles: directFiles,
    directlyAffectedSymbols: facts.directlyAffectedSymbols ?? affectedSymbols(directFiles),
    directDomains,
    transitiveDomains,
    defects,
    proofTiers: feature.proofTierApplicability,
    requiredCommandIds: requiredRules.map(({ id }) => id),
    commands,
    blockers: facts.blockers ?? inheritedBlockers(truth),
    stopConditions: facts.stopConditions ?? { P0: "STOP", P1: "STOP" },
    lanes: contract.reviewLanes ?? laneIds,
    ownerBounds: {
      currentTruthAuthoritative: true,
      owners: feature.ownerSystems,
      level3And4Authority: "OWNER_ONLY",
      prohibitedScope: contract.prohibitedScope
    }
  });
  if (!built.ok) return built;
  const safe = redact(built.packet);
  if (stableJson(safe) !== stableJson(built.packet)) return { ok: false, findings: ["PACKET_SECRET_OR_PRIVATE_VALUE"] };
  return { ok: true, packet: safe };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const parsed = strictOptions(process.argv.slice(2), { "--feature": "featureId", "--base": "base" });
  const result = parsed.ok ? activeTask(parsed.values) : { ok: false, findings: parsed.findings };
  if (result.ok) {
    const text = stableJson(result.packet);
    const packetSha256 = sha256(text);
    const root = privateArtifactDirectory("packets");
    const artifactLocation = writePrivateFile(root, `${packetSha256}.json`, `${text}\n`);
    emit("assurance:active-task", true, {
      packetSha256,
      packetBytes: Buffer.byteLength(text),
      canonicalCurrentTruthBytes: result.packet.authority.bytes,
      excludedContextBytes: Math.max(0, result.packet.authority.bytes - Buffer.byteLength(text)),
      artifactLocation,
      packet: result.packet
    });
  } else emit("assurance:active-task", false, { findings: result.findings });
}
