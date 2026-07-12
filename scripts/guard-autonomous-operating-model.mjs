#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), "utf8");

const model = read("docs/CHILLYWOOD_AUTONOMOUS_APP_OPERATING_MODEL.md");
const currentState = read("CURRENT_STATE.md");
const nextTask = read("NEXT_TASK.md");
const mediaWorkerRunbook = read("docs/MEDIA_TRANSCODE_WORKER_RUNBOOK.md");
const recoveryRunbook = read("docs/MEDIA_RECOVERY_OPERATOR_RUNBOOK.md");
const mediaArchitecture = read("docs/MEDIA_DELIVERY_SCALE_ARCHITECTURE.md");
const autonomousRegistry = read("_lib/autonomousSystemsRegistry.ts");
const autonomousApproval = read("_lib/autonomousApprovalRequests.ts");
const autonomousRegistryDoc = read("docs/AUTONOMOUS_SYSTEMS_SCOPE_REGISTRY.md");
const moneyRunbook = read("docs/MONEY_FLOW_CONTROL_RUNBOOK.md");
const ownerCommandRunbook = read("docs/OWNER_COMMAND_OPERATOR_RUNBOOK.md");
const docsCorpus = [model, currentState, nextTask, mediaWorkerRunbook, recoveryRunbook, mediaArchitecture, autonomousRegistryDoc, moneyRunbook, ownerCommandRunbook].join("\n\n");

const failures = [];

const fail = (message) => failures.push(message);

const assertIncludes = (source, needle, label) => {
  if (!source.includes(needle)) fail(`${label} missing: ${needle}`);
};

const assertNotMatches = (source, pattern, label) => {
  const match = source.match(pattern);
  if (match) fail(`${label} must not match ${pattern}: ${match[0]}`);
};

const splitSentences = (source) => (
  source
    .split(/\n+/)
    .flatMap((line) => line.replace(/\s+/g, " ").split(/(?<=[.!?])\s+/))
    .map((sentence) => sentence.replace(/^[-*\d.]+\s*/, "").trim())
    .filter(Boolean)
);

const hasDenialLanguage = (sentence) => (
  /\b(no|not|never|cannot|must not|do not|denied|blocked|stop|required|requires|approval|required before|ask the owner|unless|without explicit owner approval)\b/i
    .test(sentence)
);

assertIncludes(model, "autonomous by default", "autonomy principle");
assertIncludes(model, "owner approval is required only for high-risk boundary changes", "approval boundary");
assertIncludes(model, "1. Detect", "operator pattern detect");
assertIncludes(model, "2. Plan", "operator pattern plan");
assertIncludes(model, "3. Preflight", "operator pattern preflight");
assertIncludes(model, "4. Dry-run", "operator pattern dry-run");
assertIncludes(model, "5. Execute", "operator pattern execute");
assertIncludes(model, "6. Audit", "operator pattern audit");
assertIncludes(model, "7. Rollback/quarantine", "operator pattern rollback");
assertIncludes(model, "8. Report", "operator pattern report");
assertIncludes(model, "### Level 0: Fully Autonomous", "level 0");
assertIncludes(model, "### Level 1: Autonomous With Reporting", "level 1");
assertIncludes(model, "### Level 2: Autonomous With Emergency Stop", "level 2");
assertIncludes(model, "### Level 3: Owner Approval Required", "level 3");
assertIncludes(model, "### Level 4: Owner Approval Plus External Confirmation", "level 4");
assertIncludes(model, "eligible media discovery", "level 0 media discovery");
assertIncludes(model, "safe batch sizing", "level 0 batch sizing");
assertIncludes(model, "scoped media-worker logical backups to private R2", "level 0 backups");
assertIncludes(model, "restore drills in disposable databases", "level 0 restore drills");
assertIncludes(model, "transcode public-safe media inside existing caps", "level 0 public-safe transcode");
assertIncludes(model, "post-write audit of scoped worker rows", "level 0 audit");
assertIncludes(model, "scoped rollback plans and scoped rollback execution", "level 0 rollback");
assertIncludes(model, "fallback playback decisions", "level 0 fallback");
assertIncludes(model, "proof-only and source-only telemetry shaping", "level 0 telemetry");
assertIncludes(model, "batch completion reports", "level 1 reports");
assertIncludes(model, "cost/cache summaries", "level 1 cost summaries");
assertIncludes(model, "failure summaries", "level 1 failure summaries");
assertIncludes(model, "batch automation with kill switch", "level 2 batch automation");
assertIncludes(model, "worker auto-pause on anomaly", "level 2 auto-pause");
assertIncludes(model, "cache/fallback automation", "level 2 cache fallback");
assertIncludes(model, "paid provider or billing changes", "level 3 billing");
assertIncludes(model, "RLS/auth changes", "level 3 auth RLS");
assertIncludes(model, "payout or cashout changes", "level 3 payout");
assertIncludes(model, "Premium entitlement changes", "level 3 Premium");
assertIncludes(model, "destructive migrations or destructive production DB operations", "level 3 destructive DB");
assertIncludes(model, "broad catalog backfill", "level 3 backfill");
assertIncludes(model, "public/private exposure changes", "level 3 exposure");
assertIncludes(model, "app store public release", "level 4 app store release");
assertIncludes(model, "legal/compliance policy changes", "level 4 legal");
assertIncludes(model, "payment production mutation", "level 4 payment");
assertIncludes(model, "public marketing claims", "level 4 marketing");
assertIncludes(model, "Public-safe audited videos can be processed automatically inside caps", "media worker policy autonomous public-safe");
assertIncludes(model, "Private, Premium, original/master, unscanned, moderation-blocked", "media worker blocked categories");
assertIncludes(model, "Batch size can grow automatically after clean runs", "media worker batch growth");
assertIncludes(model, "Rollback/quarantine must be automatic", "media worker rollback automatic");
assertIncludes(model, "Use the cheaper Cloudflare R2/HLS path automatically for eligible audited public-safe media", "cost policy R2 automatic");
assertIncludes(model, "Ask the owner before enabling new paid services", "cost policy paid services approval");
assertIncludes(model, "Emergency stop always wins.", "safety emergency stop");
assertIncludes(model, "Fallback must remain available", "safety fallback");
assertIncludes(model, "No secrets in logs", "safety no secrets");
assertIncludes(model, "No public exposure without policy", "safety public exposure policy");
assertIncludes(model, "Do not ask the owner for Level 0 or Level 1 operations.", "Codex Level 0/1 behavior");
assertIncludes(model, "Ask the owner before Level 3 operations.", "Codex Level 3 behavior");
assertIncludes(model, "Ask the owner and require external confirmation before Level 4 operations.", "Codex Level 4 behavior");
assertIncludes(model, "autonomous systems are protected by registry/contract guard", "autonomous systems contract");
assertIncludes(model, "Level 3/4 actions create owner/admin approval requests", "approval request path");
assertIncludes(model, "Rachi can recommend/request but cannot approve itself", "Rachi approval boundary");
assertIncludes(model, "Owner Command Operator turns owner judgment into executable, audited command plans", "owner command policy");
assertIncludes(model, "not a god panel", "owner command no god panel");
assertIncludes(model, "requires external confirmation for Level 4", "owner command Level 4 confirmation");
assertIncludes(model, "Money Flow Control Policy", "money flow control policy");
assertIncludes(model, "Read-only reconciliation can be autonomous", "money read-only autonomy");
assertIncludes(model, "Real money mutation requires Level 3/4", "money Level 3/4 boundary");
assertIncludes(model, "Real money movement requires Level 4", "money Level 4 boundary");
assertIncludes(model, "external provider confirmation/readback", "money external provider confirmation");
assertIncludes(model, "no manual Premium grant", "manual Premium grant forbidden");
assertIncludes(model, "no fake revenue", "fake revenue forbidden");
assertIncludes(model, "no fake creator earnings", "fake creator earnings forbidden");
assertIncludes(model, "no fake payable balance", "fake payable balance forbidden");
assertIncludes(autonomousRegistry, "media_automation", "media autonomous system registry");
assertIncludes(autonomousRegistry, "livekit_operator", "LiveKit autonomous system registry");
assertIncludes(autonomousRegistry, "money_flow_control", "Money Flow Control system registry");
assertIncludes(autonomousRegistry, "AUTONOMOUS_SYSTEM_EXPANSION_RULES", "autonomous expansion rules");
assertIncludes(autonomousRegistry, "ownerApprovalRequired: true", "Level 3/4 owner approval requirement");
assertIncludes(autonomousApproval, "canActorApproveAutonomousRequest", "approval request approver model");
assertIncludes(autonomousApproval, "operatorSelfApprovalAllowed: false", "operator self-approval denial");
assertIncludes(autonomousRegistryDoc, "future scope can be added only through registry entries", "autonomous registry doc expansion rule");
assertIncludes(autonomousRegistryDoc, "`owner_command_operator` is an orchestration layer", "owner command registry doc");
assertIncludes(ownerCommandRunbook, "Owner makes judgment", "owner command runbook owner judgment");
assertIncludes(ownerCommandRunbook, "routes through existing autonomous systems", "owner command runbook routing");
assertIncludes(ownerCommandRunbook, "Blocked commands return exact blockers", "owner command runbook blockers");

assertIncludes(currentState, "Chi'llywood autonomous app operating model is now documented", "current state autonomous model");
assertIncludes(nextTask, "Do not ask owner approval for Level 0/1 autonomous operations", "next task autonomous behavior");
assertIncludes(mediaWorkerRunbook, "Autonomous operating model:", "media worker autonomous policy");
assertIncludes(recoveryRunbook, "Autonomous operating model:", "recovery autonomous policy");
assertIncludes(mediaArchitecture, "Autonomous operating model status:", "media architecture autonomous policy");

for (const sentence of splitSentences(docsCorpus)) {
  if (/\bLevel 0\b/i.test(sentence)
    && /\b(owner approval required|requires owner approval|ask the owner|must ask owner)\b/i.test(sentence)
    && !/\bdo not ask\b/i.test(sentence)) {
    fail(`Level 0 safe operations must not require owner approval: ${sentence}`);
  }

  if (/\b(money|billing|provider|payment|paid service|plan upgrade|PITR add-on)\b/i.test(sentence)
    && /\b(without owner approval|without explicit owner approval|autonomously without approval|no owner approval)\b/i.test(sentence)
    && !hasDenialLanguage(sentence)) {
    fail(`money/billing/provider changes must require owner approval: ${sentence}`);
  }

  if (/\b(private|Premium|original|master|unscanned|moderation-blocked)\b/i.test(sentence)
    && /\b(public CDN|public exposure|public playback|public bucket)\b/i.test(sentence)
    && /\b(without owner approval|autonomously without approval|no owner approval)\b/i.test(sentence)
    && !hasDenialLanguage(sentence)) {
    fail(`private/Premium/original public exposure must require approval/policy: ${sentence}`);
  }

  if (/\b(destructive|drop table|delete production|production DB)\b/i.test(sentence)
    && /\b(without owner approval|autonomously without approval|no owner approval)\b/i.test(sentence)
    && !hasDenialLanguage(sentence)) {
    fail(`destructive production DB changes must require owner approval: ${sentence}`);
  }

  if (/\b(auth|RLS|billing|payout|cashout)\b/i.test(sentence)
    && /\b(without owner approval|autonomously without approval|no owner approval)\b/i.test(sentence)
    && !hasDenialLanguage(sentence)) {
    fail(`auth/RLS/billing/payout changes must require owner approval: ${sentence}`);
  }
}

assertNotMatches(model, /\b(?:emergency stop|fallback|audit|rollback|quarantine)\b[^.]*\b(?:optional|not required|can be removed|remove requirement)\b/i, "autonomous model safety requirements");
assertNotMatches(model, /\b(?:private|Premium|original|master|unscanned|moderation-blocked)\b[^.]*\b(?:may|can)\b[^.]*\bpublic CDN\b[^.]*\bwithout\b/i, "autonomous model public exposure");
assertNotMatches(model, /\b(?:money|billing|payout|cashout|payment production mutation|provider plan upgrades?)\b[^.]*\bLevel 0\b/i, "high-risk money in Level 0");
assertNotMatches(model, /\b(?:auth|RLS|destructive migrations?)\b[^.]*\bLevel 0\b/i, "high-risk auth/RLS/destructive DB in Level 0");

if (failures.length > 0) {
  console.error("Autonomous operating model guard failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Autonomous operating model guard passed.");
