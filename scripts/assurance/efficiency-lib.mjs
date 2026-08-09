import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { ROOT, stableJson } from "./lib.mjs";

export const sha256 = (value) => crypto
  .createHash("sha256")
  .update(typeof value === "string" ? value : stableJson(value))
  .digest("hex");
export const sha40 = (value) => typeof value === "string" && /^[0-9a-f]{40}$/u.test(value);
export const sha64 = (value) => typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);
export const keyFields = [
  "sourceHead",
  "sourceTree",
  "commandContractId",
  "inputSetHash",
  "toolchainIdentity",
  "platform",
  "configurationHash"
];
export const forbiddenEvidence = new Set([
  "provider",
  "signed-artifact",
  "installed-device",
  "physical",
  "public-canary",
  "time-limited"
]);
export const reusableEvidence = new Set([
  "exact-unchanged-source",
  "exact-unchanged-model",
  "exact-unchanged-security"
]);
export const tiers = [
  "T0_REQUIREMENT",
  "T1_SOURCE",
  "T2_MODEL",
  "T3_INTEGRATION",
  "T4_NATIVE_PROVIDER",
  "T5_SIGNED_ARTIFACT",
  "T6_INSTALLED_PHYSICAL",
  "T7_PUBLIC_CANARY"
];

export function git(argv) {
  return execFileSync("git", argv, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  }).trim();
}

const safeIdentity = (value) => typeof value === "string"
  && value.length > 0
  && value.length <= 160
  && !/[\u0000-\u001f\u007f]/u.test(value);

export function exactKey(value) {
  if (!sha40(value?.sourceHead) || !sha40(value?.sourceTree)) return null;
  if (!sha64(value?.inputSetHash) || !sha64(value?.configurationHash)) return null;
  if (![value?.commandContractId, value?.toolchainIdentity, value?.platform].every(safeIdentity)) return null;
  return sha256(Object.fromEntries(keyFields.map((key) => [key, value[key]])));
}

export function packet(input) {
  const findings = [];
  if (input?.currentTruth?.contractId !== "current-truth-record-v1") findings.push("CURRENT_TRUTH_AUTHORITY_REQUIRED");
  for (const key of ["head", "tree", "originMainHead", "originMainTree", "baseHead", "baseTree"]) {
    if (!sha40(input?.identity?.[key])) findings.push(`IDENTITY_${key.toUpperCase()}_REQUIRED`);
  }
  for (const key of ["diffHash", "pathHash"]) {
    if (!sha64(input?.identity?.[key])) findings.push(`IDENTITY_${key.toUpperCase()}_REQUIRED`);
  }
  if (!Array.isArray(input?.identity?.changedFiles)) findings.push("IDENTITY_CHANGED_FILES_REQUIRED");
  if (!input?.featureId) findings.push("PACKET_FEATURE_REQUIRED");
  if (!Array.isArray(input?.directlyAffectedFiles) || input.directlyAffectedFiles.length === 0) findings.push("PACKET_FILES_REQUIRED");
  if (!Array.isArray(input?.directlyAffectedSymbols)) findings.push("PACKET_SYMBOLS_REQUIRED");
  if (!Array.isArray(input?.directDomains) || input.directDomains.length === 0) findings.push("PACKET_DIRECT_DOMAINS_REQUIRED");
  if (!Array.isArray(input?.transitiveDomains)) findings.push("PACKET_TRANSITIVE_DOMAINS_REQUIRED");
  if (!Array.isArray(input?.defects) || input.defects.length === 0) findings.push("PACKET_DEFECTS_REQUIRED");
  if (tiers.some((tier) => !Object.hasOwn(input?.proofTiers ?? {}, tier))) findings.push("PACKET_ALL_PROOF_TIERS_REQUIRED");
  if (!Array.isArray(input?.commands) || input.commands.length === 0) findings.push("PACKET_COMMANDS_REQUIRED");
  if (!Array.isArray(input?.requiredCommandIds) || input.requiredCommandIds.length === 0) findings.push("PACKET_REQUIRED_COMMAND_IDS_REQUIRED");
  const commandIds = new Set((input?.commands ?? []).map(({ id }) => id));
  if (commandIds.size !== (input?.commands ?? []).length) findings.push("COMMAND_ID_AMBIGUOUS");
  if ((input?.requiredCommandIds ?? []).some((id) => !commandIds.has(id))) findings.push("MANDATORY_COMMAND_DROPPED");
  if (!Array.isArray(input?.blockers)) findings.push("PACKET_BLOCKERS_REQUIRED");
  if (input?.stopConditions?.P0 !== "STOP" || input?.stopConditions?.P1 !== "STOP") findings.push("P0_P1_STOP_CONDITIONS_REQUIRED");
  if (!Array.isArray(input?.lanes) || input.lanes.length !== 4) findings.push("FOUR_REVIEW_LANES_REQUIRED");
  if (!input?.ownerBounds?.currentTruthAuthoritative) findings.push("OWNER_BOUNDARY_REQUIRED");
  if (!input?.implementation || !sha40(input.implementation.immutableSourceHead) || !sha40(input.implementation.immutableSourceTree)) {
    findings.push("IMMUTABLE_IMPLEMENTATION_IDENTITY_REQUIRED");
  }
  if (findings.length) return { ok: false, findings: [...new Set(findings)].sort() };

  return {
    ok: true,
    packet: {
      schemaVersion: 1,
      authority: {
        contractId: input.currentTruth.contractId,
        sha256: sha256(input.currentTruth),
        bytes: Buffer.byteLength(stableJson(input.currentTruth))
      },
      identity: input.identity,
      implementation: input.implementation,
      featureId: input.featureId,
      directlyAffectedFiles: [...input.directlyAffectedFiles].sort(),
      directlyAffectedSymbols: [...input.directlyAffectedSymbols].sort(),
      affectedDomains: {
        direct: [...input.directDomains].sort(),
        transitive: [...input.transitiveDomains].sort()
      },
      historicalDefects: [...input.defects].sort((left, right) => left.id.localeCompare(right.id)),
      proofTiers: Object.fromEntries(tiers.map((tier) => [tier, input.proofTiers[tier]])),
      requiredCommandIds: [...input.requiredCommandIds].sort(),
      commands: [...input.commands].sort((left, right) => left.id.localeCompare(right.id)),
      activeBlockers: [...input.blockers].sort((left, right) => stableJson(left).localeCompare(stableJson(right))),
      stopConditions: input.stopConditions,
      reviewLanes: [...input.lanes].sort(),
      ownerBounds: input.ownerBounds
    }
  };
}

export function reusable(entry, request) {
  const key = exactKey(request);
  if (!key || key !== entry?.key || entry?.immutable !== true) return false;
  if (forbiddenEvidence.has(entry?.evidenceClass) || !reusableEvidence.has(entry?.evidenceClass)) return false;
  return entry.key === exactKey(entry);
}

export function redactText(text) {
  return String(text)
    .replace(/(?:bearer\s+|(?:service_role|sk|pk|gh[opsu])_)[A-Za-z0-9._-]+/giu, "[REDACTED]")
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/gu, "[REDACTED]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu, "[REDACTED]")
    .slice(0, 512);
}

function ensurePrivateDirectory(directory) {
  try { fs.mkdirSync(directory, { mode: 0o700 }); } catch (error) { if (error.code !== "EEXIST") throw error; }
  const stat = fs.lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("ARTIFACT_DIRECTORY_UNSAFE");
  if (typeof process.getuid === "function" && stat.uid !== process.getuid()) throw new Error("ARTIFACT_DIRECTORY_OWNER_MISMATCH");
  fs.chmodSync(directory, 0o700);
  return fs.realpathSync(directory);
}

export function privateArtifactDirectory(kind, identity = null) {
  if (!/^[a-z][a-z0-9-]*$/u.test(kind)) throw new Error("ARTIFACT_KIND_INVALID");
  if (identity !== null && !sha64(identity)) throw new Error("ARTIFACT_IDENTITY_INVALID");
  const uid = typeof process.getuid === "function" ? process.getuid() : "user";
  const root = ensurePrivateDirectory(path.join(os.tmpdir(), `chillywood-assurance-e0-${uid}`));
  const category = ensurePrivateDirectory(path.join(root, kind));
  return identity === null ? category : ensurePrivateDirectory(path.join(category, identity));
}

export function writePrivateFile(directory, name, content) {
  if (!/^[a-z0-9][a-z0-9.-]*$/u.test(name)) throw new Error("ARTIFACT_NAME_INVALID");
  const parent = fs.realpathSync(directory);
  const output = path.join(parent, name);
  if (path.dirname(output) !== parent) throw new Error("ARTIFACT_PATH_ESCAPE");
  if (fs.existsSync(output) && fs.lstatSync(output).isSymbolicLink()) throw new Error("ARTIFACT_FILE_SYMLINK");
  const flags = fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_TRUNC | (fs.constants.O_NOFOLLOW ?? 0);
  const descriptor = fs.openSync(output, flags, 0o600);
  try { fs.writeFileSync(descriptor, content); } finally { fs.closeSync(descriptor); }
  fs.chmodSync(output, 0o600);
  return output;
}

export function strictOptions(argv, allowed) {
  const findings = [];
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) {
      findings.push("POSITIONAL_ARGUMENT_REJECTED");
      continue;
    }
    const separator = item.indexOf("=");
    const flag = separator === -1 ? item : item.slice(0, separator);
    const key = allowed[flag];
    if (!key) {
      findings.push(`UNKNOWN_FLAG:${flag}`);
      continue;
    }
    let value = separator === -1 ? argv[index + 1] : item.slice(separator + 1);
    if (separator === -1) {
      if (!value || value.startsWith("--")) {
        findings.push(`FLAG_VALUE_REQUIRED:${flag}`);
        continue;
      }
      index += 1;
    }
    if (Object.hasOwn(values, key)) findings.push(`DUPLICATE_FLAG:${flag}`);
    values[key] = value;
  }
  return { ok: findings.length === 0, values, findings: findings.sort() };
}
